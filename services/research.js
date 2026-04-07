/**
 * Research orchestrator — runs the full pipeline for a single company.
 */

const claude = require('./claude');
const ats = require('./ats');
const bullhorn = require('./bullhorn');

/**
 * Research one company: web signals + ATS detection.
 * Returns a flat result object suitable for the output table.
 */
async function researchCompany(companyName, source, icp) {
  // Run research, ATS detection, and Bullhorn check in parallel
  const bhConfigured = bullhorn.isConfigured().connected;
  const [signals, atsResult, bhResult] = await Promise.all([
    claude.researchCompany(companyName, icp),
    ats.detectATS(companyName, icp),
    bhConfigured
      ? bullhorn.checkCompany(companyName).catch((err) => { console.warn(`Bullhorn skipped for "${companyName}":`, err.message); return { found: false }; })
      : Promise.resolve({ found: false }),
  ]);

  return {
    name: companyName,
    source,
    ats_detected: atsResult.ats || 'None detected',
    roles_found: JSON.stringify(atsResult.roles),
    hiring_signals: signals.hiring_signals || '',
    keywords: signals.keywords || '',
    signal_strength: signals.signal_strength || 'Low',
    in_bullhorn: bhResult.found || false,
    bullhorn_status: bhResult.status || '',
    last_activity: bhResult.lastActivity || '',
    raw_research: { signals, ats: atsResult, bullhorn: bhResult },
  };
}

module.exports = { researchCompany };
