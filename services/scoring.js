/**
 * Structured prospect scoring — 5 dimensions with hard cutoffs.
 * Replaces the vague "High/Medium/Low" Claude assessment.
 */

const DIMENSIONS = [
  'hiring_activity',   // Active roles matching our tech stacks?
  'company_fit',       // Size, industry, can afford agency fees?
  'staffability',      // Can we actually fill these roles?
  'signal_freshness',  // How recent are the hiring signals?
  'bullhorn_clear',    // Not being worked by colleagues?
];

const CUTOFF = 2.5;  // Below this = auto-discard

/**
 * Score a prospect across 5 dimensions.
 * Each dimension is 1-5. Returns overall + per-dimension scores + recommendation.
 *
 * @param {object} data — combined research data for one company
 * @param {object} icp — ICP settings
 * @returns {{ overall, scores, recommendation, reasoning }}
 */
function scoreProspect(data, icp) {
  const scores = {};
  const reasons = {};

  // 1. Hiring Activity (weight: 1.5x)
  const roleCount = data.ats?.roles?.length || 0;
  const totalJobs = data.ats?.count || 0;
  const relevantJobs = data.ats?.relevant_count || roleCount;
  if (relevantJobs >= 5) { scores.hiring_activity = 5; reasons.hiring_activity = `${relevantJobs} relevant roles found`; }
  else if (relevantJobs >= 3) { scores.hiring_activity = 4; reasons.hiring_activity = `${relevantJobs} relevant roles`; }
  else if (relevantJobs >= 1) { scores.hiring_activity = 3; reasons.hiring_activity = `${relevantJobs} relevant role(s)`; }
  else if (totalJobs > 0) { scores.hiring_activity = 2; reasons.hiring_activity = `${totalJobs} jobs but none match our tech stacks`; }
  else { scores.hiring_activity = 1; reasons.hiring_activity = 'No active job postings found'; }

  // 2. Company Fit
  const signals = (data.signals?.hiring_signals || '').toLowerCase();
  const keywords = (data.signals?.keywords || '').toLowerCase();
  const hasFunding = keywords.includes('funding') || signals.includes('funding') || signals.includes('series');
  const hasGrowth = keywords.includes('growth') || keywords.includes('expansion') || signals.includes('growing');
  const hasExecHires = keywords.includes('exec-hire') || signals.includes('leadership');
  const hasNegative = signals.includes('layoff') || signals.includes('freeze') || signals.includes('restructur');

  let fitScore = 3; // default middle
  if (hasFunding) fitScore += 0.5;
  if (hasGrowth) fitScore += 0.5;
  if (hasExecHires) fitScore += 0.5;
  if (hasNegative) fitScore -= 2;
  scores.company_fit = Math.max(1, Math.min(5, Math.round(fitScore)));
  reasons.company_fit = hasNegative ? 'Negative signals detected (layoffs/freeze)' :
    [hasFunding && 'funded', hasGrowth && 'growing', hasExecHires && 'exec hires'].filter(Boolean).join(', ') || 'Neutral signals';

  // 3. Staffability — can we fill these roles?
  if (!icp?.role_types) {
    scores.staffability = 3;
    reasons.staffability = 'No ICP role types configured';
  } else {
    const icpRoles = icp.role_types.toLowerCase().split(',').map(r => r.trim());
    const foundRoles = (data.ats?.roles || []).map(r => (r.title || '').toLowerCase());
    const matches = foundRoles.filter(r => icpRoles.some(ir => r.includes(ir) || ir.split(' ').some(w => w.length > 3 && r.includes(w))));
    const matchRatio = foundRoles.length > 0 ? matches.length / foundRoles.length : 0;
    if (matchRatio >= 0.6) { scores.staffability = 5; reasons.staffability = `${matches.length}/${foundRoles.length} roles match our placement capability`; }
    else if (matchRatio >= 0.3) { scores.staffability = 4; reasons.staffability = `${matches.length}/${foundRoles.length} roles match`; }
    else if (matches.length >= 1) { scores.staffability = 3; reasons.staffability = `Only ${matches.length} role(s) we can fill`; }
    else if (foundRoles.length > 0) { scores.staffability = 2; reasons.staffability = 'Roles found but none match our tech stacks'; }
    else { scores.staffability = 2; reasons.staffability = 'No roles data to evaluate'; }
  }

  // 4. Signal Freshness
  const signalStrength = data.signals?.signal_strength || 'Low';
  const details = (data.signals?.details || '').toLowerCase();
  const hasRecent = details.includes('2026') || details.includes('2025') || details.includes('recent') || details.includes('this year');
  if (signalStrength === 'High' && hasRecent) { scores.signal_freshness = 5; reasons.signal_freshness = 'Strong recent signals'; }
  else if (signalStrength === 'High') { scores.signal_freshness = 4; reasons.signal_freshness = 'Strong signals'; }
  else if (signalStrength === 'Medium') { scores.signal_freshness = 3; reasons.signal_freshness = 'Moderate signals'; }
  else { scores.signal_freshness = 2; reasons.signal_freshness = 'Weak or no signals'; }

  // 5. Bullhorn Clear
  const bh = data.bullhorn || {};
  if (!bh.found) {
    scores.bullhorn_clear = 5;
    reasons.bullhorn_clear = 'Not in Bullhorn — fresh prospect';
  } else if (bh.negativeSignals?.length > 0) {
    scores.bullhorn_clear = 1;
    reasons.bullhorn_clear = `Negative signals: ${bh.negativeSignals.join(', ')}`;
  } else if (bh.lastActivity && isWithin60Days(bh.lastActivity)) {
    scores.bullhorn_clear = 1;
    reasons.bullhorn_clear = `Active in Bullhorn (last activity: ${bh.lastActivity}) — colleague working it`;
  } else if (bh.found) {
    scores.bullhorn_clear = 4;
    reasons.bullhorn_clear = `In Bullhorn but stale (last activity: ${bh.lastActivity || 'unknown'}) — fair game`;
  } else {
    scores.bullhorn_clear = 5;
    reasons.bullhorn_clear = 'Clear';
  }

  // Weighted overall (hiring_activity gets 1.5x weight)
  const weights = { hiring_activity: 1.5, company_fit: 1, staffability: 1.2, signal_freshness: 0.8, bullhorn_clear: 1.5 };
  let totalWeight = 0;
  let weightedSum = 0;
  for (const dim of DIMENSIONS) {
    const w = weights[dim] || 1;
    weightedSum += (scores[dim] || 3) * w;
    totalWeight += w;
  }
  const overall = Math.round((weightedSum / totalWeight) * 10) / 10;

  // Recommendation
  let recommendation;
  if (scores.bullhorn_clear <= 1) recommendation = 'DISCARD — colleague conflict or negative signals';
  else if (overall >= 4.0) recommendation = 'STRONG — pursue immediately';
  else if (overall >= 3.0) recommendation = 'GOOD — worth pursuing';
  else if (overall >= CUTOFF) recommendation = 'MARGINAL — review manually';
  else recommendation = 'WEAK — skip';

  // Map to legacy signal_strength for backward compat
  const signal_strength = overall >= 4.0 ? 'High' : overall >= 3.0 ? 'Medium' : 'Low';

  return { overall, scores, reasons, recommendation, signal_strength };
}

function isWithin60Days(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
  return d.getTime() > sixtyDaysAgo;
}

module.exports = { scoreProspect, isWithin60Days, CUTOFF, DIMENSIONS };
