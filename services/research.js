/**
 * Research orchestrator — runs the full pipeline for a single company.
 */

const claude = require('./claude');
const ats = require('./ats');

/**
 * Research one company: web signals + ATS detection.
 * Returns a flat result object suitable for the output table.
 */
async function researchCompany(companyName, source, icp) {
  // Run research and ATS detection in parallel (ICP passed to both)
  const [signals, atsResult] = await Promise.all([
    claude.researchCompany(companyName, icp),
    ats.detectATS(companyName, icp),
  ]);

  return {
    name: companyName,
    source,
    ats_detected: atsResult.ats || 'None detected',
    roles_found: JSON.stringify(atsResult.roles),
    hiring_signals: signals.hiring_signals || '',
    keywords: signals.keywords || '',
    signal_strength: signals.signal_strength || 'Low',
    raw_research: { signals, ats: atsResult },
  };
}

module.exports = { researchCompany };
