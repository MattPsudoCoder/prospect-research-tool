const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db/db');
const { deduplicate } = require('../services/dedup');
const { researchCompany } = require('../services/research');
// Claude is optional — pipeline works without API key (Tier 1 ATS + Bullhorn still run)
let claude = null;
try {
  if (process.env.ANTHROPIC_API_KEY) claude = require('../services/claude');
} catch { /* Claude features disabled */ }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function flattenRoles(rolesStr) {
  if (!rolesStr) return '';
  try {
    const roles = JSON.parse(rolesStr);
    if (Array.isArray(roles)) {
      return roles.map((r) => {
        if (typeof r === 'object' && r.title) return r.url ? `${r.title} (${r.url})` : r.title;
        return String(r);
      }).join(', ');
    }
  } catch {}
  return rolesStr;
}

const activeRuns = new Map();

/**
 * Cross-run deduplication — skip companies researched in the last 14 days.
 * Returns names to skip.
 */
async function getRecentlyResearched(days = 14) {
  try {
    const result = await db.query(
      `SELECT DISTINCT LOWER(name) as name FROM companies
       WHERE created_at > NOW() - INTERVAL '${days} days'
       AND signal_strength != 'Gated'`
    );
    return new Set(result.rows.map(r => r.name));
  } catch { return new Set(); }
}

router.post(
  '/run',
  upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'zoominfoFile', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { manualNames, useICP, runName } = req.body;
      const allCompanies = [];

      // Source 1: Manual paste
      if (manualNames && manualNames.trim()) {
        const names = manualNames.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean);
        names.forEach((name) => allCompanies.push({ name, source: 'Manual' }));
      }

      // Source 2: CSV upload
      if (req.files?.csvFile?.[0]) {
        const csvText = req.files.csvFile[0].buffer.toString('utf8');
        const records = parse(csvText, { columns: false, skip_empty_lines: true, relax_column_count: true });
        for (const row of records) {
          const name = row[0]?.trim();
          if (name && name.toLowerCase() !== 'company' && name.toLowerCase() !== 'company name') {
            allCompanies.push({ name, source: 'CSV Upload' });
          }
        }
      }

      // Source 3: ZoomInfo CSV
      if (req.files?.zoominfoFile?.[0]) {
        const csvText = req.files.zoominfoFile[0].buffer.toString('utf8');
        const records = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });
        for (const row of records) {
          const name = row['Company Name'] || row['company name'] || row['Company'] || Object.values(row)[0];
          if (name?.trim()) allCompanies.push({ name: name.trim(), source: 'ZoomInfo' });
        }
      }

      // Source 4: ICP-based Claude search (only if API key configured)
      if (useICP === 'true') {
        if (!claude) {
          return res.status(400).json({ error: 'ICP Search requires an Anthropic API key in .env. Add companies manually or via CSV instead.' });
        }
        const icpResult = await db.query('SELECT * FROM icp_settings ORDER BY id DESC LIMIT 1');
        if (icpResult.rows.length > 0) {
          const icpCompanies = await claude.searchCompaniesByICP(icpResult.rows[0]);
          icpCompanies.forEach((name) => allCompanies.push({ name, source: 'ICP Search' }));
        }
      }

      if (allCompanies.length === 0) {
        return res.status(400).json({ error: 'No companies provided.' });
      }

      // Deduplicate within this batch
      let unique = deduplicate(allCompanies);

      // Cross-run dedup — skip recently researched companies
      const recent = await getRecentlyResearched(14);
      const beforeDedup = unique.length;
      unique = unique.filter(c => !recent.has(c.name.toLowerCase()));
      const crossRunSkipped = beforeDedup - unique.length;

      if (unique.length === 0) {
        return res.status(400).json({ error: `All ${beforeDedup} companies were researched in the last 14 days. No new companies to process.` });
      }

      const icpRow = await db.query('SELECT * FROM icp_settings ORDER BY id DESC LIMIT 1');
      const icp = icpRow.rows.length > 0 ? icpRow.rows[0] : null;

      const runResult = await db.query(
        `INSERT INTO pipeline_runs (name, status, total_companies) VALUES ($1, 'running', $2) RETURNING *`,
        [runName || `Run ${new Date().toLocaleString()}`, unique.length]
      );
      const run = runResult.rows[0];

      activeRuns.set(run.id, { total: unique.length, processed: 0, gated: 0, skippedErrors: 0, crossRunSkipped, status: 'running' });
      processCompanies(run.id, unique, icp).catch((err) => {
        console.error('Pipeline error:', err);
        activeRuns.set(run.id, { ...activeRuns.get(run.id), status: 'error', error: err.message });
      });

      res.json({ runId: run.id, totalCompanies: unique.length, crossRunSkipped, status: 'running' });
    } catch (err) {
      console.error('Pipeline start error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

function isValidResult(result) {
  if (!result) return false;
  const signals = result.hiring_signals || '';
  if (signals.startsWith('Error:')) return false;
  if (signals.includes('rate_limit_error')) return false;
  if (signals.includes('"type":"error"')) return false;
  // A result is valid if it has ANY useful data (roles, signals, or Bullhorn info)
  if (!signals && !result.ats_detected && !result.roles_found && !result.in_bullhorn) return false;
  return true;
}

async function processCompanies(runId, companies, icp) {
  let skipped = 0;
  let gated = 0;

  for (let i = 0; i < companies.length; i++) {
    const { name, source } = companies[i];

    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s between (faster than v1.0's 10s since Tier 1 is API-first)

    let result = null;

    try {
      result = await researchCompany(name, source, icp);
    } catch (err) {
      console.error(`Research failed for "${name}":`, err.message);
    }

    // Retry once on failure
    if (!result || !isValidResult(result)) {
      console.log(`Retrying "${name}" after 15s cooldown...`);
      await new Promise((resolve) => setTimeout(resolve, 15000));
      try {
        result = await researchCompany(name, source, icp);
      } catch (err) {
        console.error(`Retry failed for "${name}":`, err.message);
        result = null;
      }
    }

    // Save all valid results (including gated ones — they're marked, not discarded from DB)
    if (result && isValidResult(result)) {
      if (result.gated_out) gated++;

      await db.query(
        `INSERT INTO companies (run_id, name, source, ats_detected, roles_found, hiring_signals, keywords, signal_strength,
         score_overall, score_details, recommendation, signal_types, in_bullhorn, bullhorn_status, last_activity,
         gated_out, gate_reason, raw_research)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          runId, result.name, result.source, result.ats_detected,
          result.roles_found, result.hiring_signals, result.keywords,
          result.signal_strength, result.score_overall,
          result.score_details, result.recommendation,
          result.signal_types, result.in_bullhorn || false,
          result.bullhorn_status || '', result.last_activity || '',
          result.gated_out || false, result.gate_reason || '',
          JSON.stringify(result.raw_research),
        ]
      );
    } else {
      skipped++;
      console.warn(`Skipped "${name}" — no valid data after retry. Errors: ${result?.errors || 'unknown'}`);
    }

    await db.query('UPDATE pipeline_runs SET processed_companies = $1 WHERE id = $2', [i + 1, runId]);
    if (activeRuns.has(runId)) {
      const progress = activeRuns.get(runId);
      progress.processed = i + 1;
      progress.gated = gated;
      progress.skippedErrors = skipped;
    }
  }

  await db.query("UPDATE pipeline_runs SET status = 'completed', completed_at = NOW() WHERE id = $1", [runId]);
  if (activeRuns.has(runId)) activeRuns.get(runId).status = 'completed';

  console.log(`Pipeline run ${runId} completed: ${companies.length - skipped - gated} qualified, ${gated} gated out, ${skipped} errors.`);
}

// SSE progress
router.get('/:runId/progress', (req, res) => {
  const runId = parseInt(req.params.runId);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

  const interval = setInterval(async () => {
    const progress = activeRuns.get(runId);
    if (progress) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (progress.status === 'completed' || progress.status === 'error') {
        clearInterval(interval);
        activeRuns.delete(runId);
        res.end();
      }
    } else {
      try {
        const result = await db.query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
        if (result.rows.length > 0) {
          const run = result.rows[0];
          res.write(`data: ${JSON.stringify({ total: run.total_companies, processed: run.processed_companies, status: run.status })}\n\n`);
          if (run.status === 'completed' || run.status === 'error') { clearInterval(interval); res.end(); }
        }
      } catch { clearInterval(interval); res.end(); }
    }
  }, 1500);

  req.on('close', () => clearInterval(interval));
});

// CSV export
router.get('/:runId/export', async (req, res) => {
  const { stringify } = require('csv-stringify/sync');
  try {
    const result = await db.query(
      `SELECT name, source, ats_detected, roles_found, hiring_signals, keywords, signal_strength,
              score_overall, recommendation, signal_types, in_bullhorn, bullhorn_status, last_activity, gated_out, gate_reason
       FROM companies WHERE run_id = $1 ORDER BY score_overall DESC NULLS LAST`,
      [req.params.runId]
    );
    const rows = result.rows.map((r) => ({ ...r, roles_found: flattenRoles(r.roles_found) }));
    const csv = stringify(rows, {
      header: true,
      columns: [
        { key: 'name', header: 'Company' },
        { key: 'source', header: 'Source' },
        { key: 'score_overall', header: 'Score' },
        { key: 'recommendation', header: 'Recommendation' },
        { key: 'signal_types', header: 'Signal Types' },
        { key: 'ats_detected', header: 'ATS' },
        { key: 'roles_found', header: 'Roles' },
        { key: 'hiring_signals', header: 'Signals' },
        { key: 'signal_strength', header: 'Strength' },
        { key: 'in_bullhorn', header: 'In BH' },
        { key: 'bullhorn_status', header: 'BH Status' },
        { key: 'gated_out', header: 'Gated Out' },
        { key: 'gate_reason', header: 'Gate Reason' },
      ],
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=prospect-research-run-${req.params.runId}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
