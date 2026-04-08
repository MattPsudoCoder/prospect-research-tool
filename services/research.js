/**
 * Research orchestrator v1.1 — multi-tier discovery with Bullhorn gate + scoring.
 *
 * Pipeline per company:
 *   Tier 1: Greenhouse + Lever APIs (free, structured, fast)
 *   Tier 2: Claude web search for hiring signals (enrichment, not discovery)
 *   Tier 3: Claude ATS fallback (only if Tier 1 found nothing)
 *   Gate:   Bullhorn 60-day check (auto-discard active accounts)
 *   Score:  5-dimension structured scoring with hard cutoff
 */

const ats = require('./ats');
const bullhorn = require('./bullhorn');
const { scoreProspect, CUTOFF } = require('./scoring');

// Claude services are optional — only loaded if ANTHROPIC_API_KEY is set
let claude = null;
try {
  if (process.env.ANTHROPIC_API_KEY) claude = require('./claude');
} catch { /* no API key, Claude features disabled */ }

/**
 * Classify hiring signals into categories.
 * Returns array of signal types for context-aware outreach later.
 */
function classifySignals(signals, atsResult) {
  const types = [];
  const text = [
    signals?.hiring_signals || '',
    signals?.keywords || '',
    signals?.details || '',
  ].join(' ').toLowerCase();

  const roleCount = atsResult?.relevant_count || atsResult?.roles?.length || 0;

  // Team expansion — multiple engineering roles
  if (roleCount >= 5) types.push('team_expansion');
  else if (roleCount >= 2) types.push('team_growth');

  // Leadership change — hiring VPs, directors, heads
  const roles = (atsResult?.roles || []).map(r => (r.title || '').toLowerCase());
  if (roles.some(r => /\b(vp|vice president|head of|director|cto)\b/.test(r))) {
    types.push('leadership_hire');
  }

  // Funding / financial signals
  if (text.includes('funding') || text.includes('series') || text.includes('raised') || text.includes('investment')) {
    types.push('recent_funding');
  }

  // Expansion
  if (text.includes('expansion') || text.includes('new office') || text.includes('new market') || text.includes('international')) {
    types.push('expansion');
  }

  // Executive hires
  if (text.includes('exec-hire') || text.includes('leadership hire') || text.includes('new cto') || text.includes('new ceo')) {
    types.push('exec_movement');
  }

  // Negative signals
  if (text.includes('layoff') || text.includes('freeze') || text.includes('restructur') || text.includes('downsiz')) {
    types.push('negative_signal');
  }

  // New function — first-time hire for a type
  if (roles.some(r => /\bfirst\b/.test(r)) || text.includes('first hire') || text.includes('founding engineer')) {
    types.push('new_function');
  }

  if (types.length === 0) types.push('general_hiring');
  return types;
}

/**
 * Research one company through the full multi-tier pipeline.
 * Returns a flat result object with scores, signals, and recommendation.
 */
async function researchCompany(companyName, source, icp) {
  const errors = [];

  // ── Tier 1: Greenhouse + Lever (fast, structured) ──────────
  let atsResult = { ats: 'None detected', roles: [], count: 0, relevant_count: 0 };
  try {
    const gh = await ats.checkGreenhouse(companyName, ats.buildRoleKeywords ? ats.buildRoleKeywords(icp) : undefined);
    if (gh) {
      atsResult = gh;
    } else {
      const lv = await ats.checkLever(companyName, ats.buildRoleKeywords ? ats.buildRoleKeywords(icp) : undefined);
      if (lv) atsResult = lv;
    }
  } catch (err) {
    errors.push(`ATS Tier 1: ${err.message}`);
  }

  // ── Tier 2: Claude hiring signals (if API key available) + Bullhorn ─
  let signals = { hiring_signals: '', keywords: '', signal_strength: 'Low', details: '' };
  let bhResult = { found: false };

  const bhConfigured = bullhorn.isConfigured().connected;

  try {
    const tasks = [
      bhConfigured
        ? bullhorn.checkCompany(companyName)
        : Promise.resolve({ found: false }),
    ];
    // Only add Claude research if API key is configured
    if (claude) tasks.unshift(claude.researchCompany(companyName, icp));
    else tasks.unshift(Promise.resolve(signals)); // skip Claude

    const results = await Promise.allSettled(tasks);

    if (results[0].status === 'fulfilled') signals = results[0].value;
    else errors.push(`Claude: ${results[0].reason?.message || 'failed'}`);

    if (results[1].status === 'fulfilled') bhResult = results[1].value;
    else errors.push(`Bullhorn: ${results[1].reason?.message || 'failed'}`);
  } catch (err) {
    errors.push(`Tier 2 parallel: ${err.message}`);
  }

  // ── Tier 3: Claude ATS fallback (only if Tier 1 found nothing AND Claude is available) ─
  if (claude && atsResult.ats === 'None detected' && atsResult.roles.length === 0) {
    try {
      const fallback = await claude.searchATSFallback(companyName, icp);
      if (fallback.ats_found) {
        let roles = [];
        if (Array.isArray(fallback.sample_roles)) {
          roles = fallback.sample_roles.map(r => typeof r === 'string' ? { title: r.trim(), url: '' } : { title: r.title || '', url: r.url || '' });
        }
        atsResult = { ats: fallback.ats_found, roles, count: fallback.job_count_estimate || 0, relevant_count: roles.length };
      }
    } catch (err) {
      errors.push(`ATS Tier 3: ${err.message}`);
    }
  }

  // ── Bullhorn 60-day gate ───────────────────────────────────
  let gatedOut = false;
  let gateReason = '';
  if (bhResult.found && bhResult.lastActivity) {
    const lastDate = new Date(bhResult.lastActivity);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    if (lastDate > sixtyDaysAgo) {
      gatedOut = true;
      gateReason = `Active in Bullhorn (last activity: ${bhResult.lastActivity}) — colleague may be working it`;
    }
  }
  if (bhResult.negativeSignals?.length > 0) {
    gatedOut = true;
    gateReason = `Bullhorn negative signals: ${bhResult.negativeSignals.join(', ')}`;
  }

  // ── Signal classification ──────────────────────────────────
  const signalTypes = classifySignals(signals, atsResult);

  // ── Structured scoring ─────────────────────────────────────
  const scoreData = { signals, ats: atsResult, bullhorn: bhResult };
  const score = scoreProspect(scoreData, icp);

  // Override score if gated out by Bullhorn
  if (gatedOut) {
    score.overall = 1;
    score.recommendation = `DISCARD — ${gateReason}`;
    score.signal_strength = 'Gated';
  }

  return {
    name: companyName,
    source,
    ats_detected: atsResult.ats || 'None detected',
    roles_found: JSON.stringify(atsResult.roles),
    hiring_signals: signals.hiring_signals || '',
    tech_stack: signals.tech_stack || '',
    keywords: signals.keywords || '',
    signal_strength: score.signal_strength,
    score_overall: score.overall,
    score_details: JSON.stringify({ scores: score.scores, reasons: score.reasons }),
    recommendation: score.recommendation,
    signal_types: signalTypes.join(', '),
    in_bullhorn: bhResult.found || false,
    bullhorn_status: bhResult.status || '',
    last_activity: bhResult.lastActivity || '',
    gated_out: gatedOut,
    gate_reason: gateReason,
    errors: errors.length > 0 ? errors.join('; ') : '',
    raw_research: { signals, ats: atsResult, bullhorn: bhResult, signalTypes, score, errors },
  };
}

module.exports = { researchCompany, classifySignals };
