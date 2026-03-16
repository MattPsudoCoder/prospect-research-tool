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
async function researchCompany(companyName, source) {
  // Run research and ATS detection in parallel
  const [signals, atsResult] = await Promise.all([
    claude.researchCompany(companyName),
    ats.detectATS(companyName),
  ]);

  // Check Bullhorn (only if configured)
  let bullhornResult = { found: false };
  if (bullhorn.isConfigured()) {
    bullhornResult = await bullhorn.checkCompany(companyName);
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
    bullhorn_status: bullhornResult.status || '',
    last_activity: bullhornResult.lastActivity || '',
    raw_research: {
      signals,
      ats: atsResult,
      bullhorn: bullhornResult,
    },
  };
}

module.exports = { researchCompany };
