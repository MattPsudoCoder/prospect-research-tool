/**
 * Research orchestrator — runs the full pipeline for a single company.
 */

const claude = require('./claude');
const ats = require('./ats');
const bullhorn = require('./bullhorn');

/**
 * Research one company: web signals + ATS detection + Bullhorn check.
 * Returns a flat result object suitable for the output table.
 */
async function researchCompany(companyName, source, icp) {
  // Run research and ATS detection in parallel
  const [signals, atsResult] = await Promise.all([
    claude.researchCompany(companyName, icp),
    ats.detectATS(companyName),
  ]);

  // Check Bullhorn (only if configured)
  let bullhornResult = { found: false };
  if (bullhorn.isConfigured()) {
    bullhornResult = await bullhorn.checkCompany(companyName);
  }

  // Build Bullhorn status string with actionable detail
  let bullhornStatus = '';
  let lastActivity = '';

  if (bullhornResult.found) {
    const parts = [bullhornResult.status];

    // Flag vacancies and placements
    if (bullhornResult.vacancies) {
      const v = bullhornResult.vacancies;
      if (v.total > 0) {
        parts.push(`${v.total} vacancies (${v.open} open, latest: ${v.mostRecentDate})`);
      } else {
        parts.push('No vacancies');
      }
    }
    if (bullhornResult.placements) {
      const p = bullhornResult.placements;
      if (p.total > 0) {
        parts.push(`${p.total} placements (latest: ${p.mostRecentDate})`);
      } else {
        parts.push('No placements');
      }
    }
    if (bullhornResult.leads) {
      const l = bullhornResult.leads;
      if (l.total > 0) {
        parts.push(`${l.total} leads (${l.open} open)`);
      }
    }

    // Surface negative signals prominently
    if (bullhornResult.negativeSignals && bullhornResult.negativeSignals.length > 0) {
      parts.push(`⚠ NEGATIVE: ${bullhornResult.negativeSignals.join(', ')}`);
    }

    bullhornStatus = parts.join(' | ');
    lastActivity = bullhornResult.lastActivity || '';
  }

  return {
    name: companyName,
    source,
    ats_detected: atsResult.ats || 'None detected',
    roles_found: atsResult.roles.join(', '),
    hiring_signals: signals.hiring_signals || '',
    keywords: signals.keywords || '',
    signal_strength: signals.signal_strength || 'Low',
    in_bullhorn: bullhornResult.found || false,
    bullhorn_status: bullhornStatus,
    last_activity: lastActivity,
    raw_research: {
      signals,
      ats: atsResult,
      bullhorn: bullhornResult,
    },
  };
}

module.exports = { researchCompany };
