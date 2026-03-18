const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db/db');
const { deduplicate } = require('../services/dedup');
const { researchCompany } = require('../services/research');
const claude = require('../services/claude');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Active runs tracked in memory for SSE progress updates
const activeRuns = new Map();

/**
 * POST /api/pipeline/run
 * Body (multipart/form-data):
 *   manualNames — newline-separated company names
 *   csvFile — general CSV (one column of names)
 *   zoominfoFile — ZoomInfo CSV export
 *   useICP — "true" to include Claude ICP search
 *   runName — optional label
 */
router.post(
  '/run',
  upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'zoominfoFile', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { manualNames, useICP, runName } = req.body;
      const allCompanies = []; // { name, source }

      // Source 1: Manual paste
      if (manualNames && manualNames.trim()) {
        const names = manualNames
          .split(/[\n,]+/)
          .map((n) => n.trim())
          .filter(Boolean);
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
          // ZoomInfo exports typically have a "Company Name" column
          const name = row['Company Name'] || row['company name'] || row['Company'] || Object.values(row)[0];
          if (name?.trim()) {
            allCompanies.push({ name: name.trim(), source: 'ZoomInfo' });
          }
        }
      }

      // Source 4: ICP-based Claude search
      if (useICP === 'true') {
        const icpResult = await db.query('SELECT * FROM icp_settings ORDER BY id DESC LIMIT 1');
        if (icpResult.rows.length > 0) {
          const icpCompanies = await claude.searchCompaniesByICP(icpResult.rows[0]);
          icpCompanies.forEach((name) => allCompanies.push({ name, source: 'ICP Search' }));
        }
      }

      if (allCompanies.length === 0) {
        return res.status(400).json({ error: 'No companies provided. Add names manually, upload a CSV, or enable ICP search.' });
      }

      // Deduplicate
      const unique = deduplicate(allCompanies);

      // Load ICP settings for research context (role_types, hiring_signals)
      const icpRow = await db.query('SELECT * FROM icp_settings ORDER BY id DESC LIMIT 1');
      const icp = icpRow.rows.length > 0 ? icpRow.rows[0] : null;

      // Create pipeline run in DB
      const runResult = await db.query(
        `INSERT INTO pipeline_runs (name, status, total_companies) VALUES ($1, 'running', $2) RETURNING *`,
        [runName || `Run ${new Date().toLocaleString()}`, unique.length]
      );
      const run = runResult.rows[0];

      // Start processing in background
      activeRuns.set(run.id, { total: unique.length, processed: 0, status: 'running' });
      processCompanies(run.id, unique, icp).catch((err) => {
        console.error('Pipeline error:', err);
        activeRuns.set(run.id, { ...activeRuns.get(run.id), status: 'error', error: err.message });
      });

      res.json({ runId: run.id, totalCompanies: unique.length, status: 'running' });
    } catch (err) {
      console.error('Pipeline start error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * Process companies sequentially (to manage API rate limits).
 */
async function processCompanies(runId, companies, icp) {
  for (let i = 0; i < companies.length; i++) {
    const { name, source } = companies[i];

    // Delay between API calls to avoid Claude API rate limits (skip first)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    try {
      const result = await researchCompany(name, source, icp);

      await db.query(
        `INSERT INTO companies (run_id, name, source, ats_detected, roles_found, hiring_signals, keywords, signal_strength, in_bullhorn, bullhorn_status, last_activity, raw_research)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          runId, result.name, result.source, result.ats_detected,
          result.roles_found, result.hiring_signals, result.keywords,
          result.signal_strength, result.in_bullhorn, result.bullhorn_status,
          result.last_activity, JSON.stringify(result.raw_research),
        ]
      );
    } catch (err) {
      // Insert a row even if research fails, so we don't lose the company
      console.error(`Research failed for "${name}":`, err.message);
      await db.query(
        `INSERT INTO companies (run_id, name, source, hiring_signals, signal_strength)
         VALUES ($1,$2,$3,$4,$5)`,
        [runId, name, source, `Error: ${err.message}`, 'Low']
      );
    }

    // Update progress
    await db.query(
      'UPDATE pipeline_runs SET processed_companies = $1 WHERE id = $2',
      [i + 1, runId]
    );
    if (activeRuns.has(runId)) {
      activeRuns.get(runId).processed = i + 1;
    }
  }

  // Mark complete
  await db.query(
    "UPDATE pipeline_runs SET status = 'completed', completed_at = NOW() WHERE id = $1",
    [runId]
  );
  if (activeRuns.has(runId)) {
    activeRuns.get(runId).status = 'completed';
  }
}

/**
 * GET /api/pipeline/:runId/progress — SSE stream for live progress.
 */
router.get('/:runId/progress', (req, res) => {
  const runId = parseInt(req.params.runId);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

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
      // Check DB in case server restarted
      try {
        const result = await db.query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
        if (result.rows.length > 0) {
          const run = result.rows[0];
          res.write(
            `data: ${JSON.stringify({
              total: run.total_companies,
              processed: run.processed_companies,
              status: run.status,
            })}\n\n`
          );
          if (run.status === 'completed' || run.status === 'error') {
            clearInterval(interval);
            res.end();
          }
        }
      } catch {
        clearInterval(interval);
        res.end();
      }
    }
  }, 1500);

  req.on('close', () => clearInterval(interval));
});

/**
 * GET /api/pipeline/:runId/export — Download results as CSV.
 */
router.get('/:runId/export', async (req, res) => {
  const { stringify } = require('csv-stringify/sync');
  try {
    const result = await db.query(
      'SELECT name, source, ats_detected, roles_found, hiring_signals, keywords, signal_strength, in_bullhorn, bullhorn_status, last_activity FROM companies WHERE run_id = $1 ORDER BY signal_strength DESC',
      [req.params.runId]
    );

    const csv = stringify(result.rows, {
      header: true,
      columns: [
        { key: 'name', header: 'Company Name' },
        { key: 'source', header: 'Source' },
        { key: 'ats_detected', header: 'ATS Detected' },
        { key: 'roles_found', header: 'Roles Found' },
        { key: 'hiring_signals', header: 'Hiring Signals' },
        { key: 'keywords', header: 'Keywords' },
        { key: 'signal_strength', header: 'Signal Strength' },
        { key: 'in_bullhorn', header: 'In Bullhorn' },
        { key: 'bullhorn_status', header: 'Bullhorn Status' },
        { key: 'last_activity', header: 'Last Activity' },
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
