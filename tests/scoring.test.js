const { scoreProspect, isWithin60Days, CUTOFF, DIMENSIONS } = require('../services/scoring');

describe('isWithin60Days', () => {
  test('returns true for a date 30 days ago', () => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithin60Days(d)).toBe(true);
  });

  test('returns false for a date 90 days ago', () => {
    const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithin60Days(d)).toBe(false);
  });

  test('returns false for null/undefined/garbage', () => {
    expect(isWithin60Days(null)).toBe(false);
    expect(isWithin60Days(undefined)).toBe(false);
    expect(isWithin60Days('not-a-date')).toBe(false);
    expect(isWithin60Days('')).toBe(false);
  });

  test('returns true for today', () => {
    expect(isWithin60Days(new Date().toISOString())).toBe(true);
  });

  test('boundary: exactly 60 days ago is NOT within 60 days', () => {
    const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithin60Days(d)).toBe(false);
  });

  test('boundary: 59 days ago IS within 60 days', () => {
    const d = new Date(Date.now() - 59 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithin60Days(d)).toBe(true);
  });
});

describe('scoreProspect', () => {
  const baseIcp = { role_types: 'software engineer, frontend developer, react developer' };

  // Helper to build minimal data
  function makeData(overrides = {}) {
    return {
      ats: { roles: [], count: 0, relevant_count: 0 },
      signals: { hiring_signals: '', keywords: '', signal_strength: 'Low', details: '' },
      bullhorn: { found: false },
      ...overrides,
    };
  }

  test('returns all 5 dimensions', () => {
    const result = scoreProspect(makeData(), baseIcp);
    for (const dim of DIMENSIONS) {
      expect(result.scores).toHaveProperty(dim);
      expect(result.scores[dim]).toBeGreaterThanOrEqual(1);
      expect(result.scores[dim]).toBeLessThanOrEqual(5);
    }
  });

  test('returns recommendation string', () => {
    const result = scoreProspect(makeData(), baseIcp);
    expect(typeof result.recommendation).toBe('string');
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  // ── Hiring Activity dimension ──

  test('hiring_activity = 5 when 5+ relevant roles', () => {
    const data = makeData({ ats: { roles: Array(6).fill({ title: 'Dev' }), count: 10, relevant_count: 6 } });
    expect(scoreProspect(data, baseIcp).scores.hiring_activity).toBe(5);
  });

  test('hiring_activity = 4 when 3-4 relevant roles', () => {
    const data = makeData({ ats: { roles: Array(3).fill({ title: 'Dev' }), count: 5, relevant_count: 3 } });
    expect(scoreProspect(data, baseIcp).scores.hiring_activity).toBe(4);
  });

  test('hiring_activity = 3 when 1-2 relevant roles', () => {
    const data = makeData({ ats: { roles: [{ title: 'Dev' }], count: 5, relevant_count: 1 } });
    expect(scoreProspect(data, baseIcp).scores.hiring_activity).toBe(3);
  });

  test('hiring_activity = 2 when jobs exist but none relevant', () => {
    const data = makeData({ ats: { roles: [], count: 10, relevant_count: 0 } });
    expect(scoreProspect(data, baseIcp).scores.hiring_activity).toBe(2);
  });

  test('hiring_activity = 1 when no jobs at all', () => {
    const data = makeData({ ats: { roles: [], count: 0, relevant_count: 0 } });
    expect(scoreProspect(data, baseIcp).scores.hiring_activity).toBe(1);
  });

  // ── Company Fit dimension ──

  test('company_fit boosted by funding + growth signals', () => {
    const data = makeData({
      signals: { hiring_signals: '', keywords: 'funding, growth', signal_strength: 'High', details: '' },
    });
    expect(scoreProspect(data, baseIcp).scores.company_fit).toBe(4); // 3 + 0.5 + 0.5
  });

  test('company_fit tanked by negative signals', () => {
    const data = makeData({
      signals: { hiring_signals: 'layoff announced', keywords: '', signal_strength: 'Low', details: '' },
    });
    expect(scoreProspect(data, baseIcp).scores.company_fit).toBe(1); // 3 - 2, clamped to 1
  });

  test('company_fit capped at 5', () => {
    const data = makeData({
      signals: { hiring_signals: 'leadership', keywords: 'funding, growth, exec-hire', signal_strength: 'High', details: '' },
    });
    expect(scoreProspect(data, baseIcp).scores.company_fit).toBeLessThanOrEqual(5);
  });

  // ── Bullhorn Clear dimension ──

  test('bullhorn_clear = 5 when not in Bullhorn', () => {
    const data = makeData({ bullhorn: { found: false } });
    expect(scoreProspect(data, baseIcp).scores.bullhorn_clear).toBe(5);
  });

  test('bullhorn_clear = 1 when negative signals exist', () => {
    const data = makeData({ bullhorn: { found: true, negativeSignals: ['do not contact'] } });
    expect(scoreProspect(data, baseIcp).scores.bullhorn_clear).toBe(1);
  });

  test('bullhorn_clear = 1 when active in last 60 days', () => {
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const data = makeData({ bullhorn: { found: true, lastActivity: recentDate, negativeSignals: [] } });
    expect(scoreProspect(data, baseIcp).scores.bullhorn_clear).toBe(1);
  });

  test('bullhorn_clear = 4 when stale (>60 days)', () => {
    const staleDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const data = makeData({ bullhorn: { found: true, lastActivity: staleDate, negativeSignals: [] } });
    expect(scoreProspect(data, baseIcp).scores.bullhorn_clear).toBe(4);
  });

  // ── Signal Freshness dimension ──

  test('signal_freshness = 5 for High + recent', () => {
    const data = makeData({ signals: { signal_strength: 'High', details: 'recent hiring in 2026' } });
    expect(scoreProspect(data, baseIcp).scores.signal_freshness).toBe(5);
  });

  test('signal_freshness = 4 for High without recent', () => {
    const data = makeData({ signals: { signal_strength: 'High', details: 'general activity' } });
    expect(scoreProspect(data, baseIcp).scores.signal_freshness).toBe(4);
  });

  test('signal_freshness = 2 for Low signals', () => {
    const data = makeData({ signals: { signal_strength: 'Low', details: '' } });
    expect(scoreProspect(data, baseIcp).scores.signal_freshness).toBe(2);
  });

  // ── Staffability dimension ──

  test('staffability = 5 when 60%+ roles match ICP', () => {
    const data = makeData({
      ats: {
        roles: [
          { title: 'Software Engineer' },
          { title: 'Frontend Developer' },
          { title: 'React Developer' },
          { title: 'Office Manager' },
        ],
        count: 4,
        relevant_count: 3,
      },
    });
    expect(scoreProspect(data, baseIcp).scores.staffability).toBe(5);
  });

  test('staffability = 3 with no ICP configured', () => {
    const data = makeData();
    expect(scoreProspect(data, null).scores.staffability).toBe(3);
  });

  // ── Overall + Recommendation ──

  test('STRONG recommendation for high-scoring prospect', () => {
    const data = makeData({
      ats: { roles: Array(6).fill({ title: 'Software Engineer' }), count: 10, relevant_count: 6 },
      signals: { hiring_signals: '', keywords: 'funding, growth', signal_strength: 'High', details: 'recent 2026' },
      bullhorn: { found: false },
    });
    const result = scoreProspect(data, baseIcp);
    expect(result.overall).toBeGreaterThanOrEqual(4.0);
    expect(result.recommendation).toMatch(/STRONG/);
    expect(result.signal_strength).toBe('High');
  });

  test('WEAK recommendation for low-scoring prospect', () => {
    const data = makeData({
      ats: { roles: [], count: 0, relevant_count: 0 },
      signals: { hiring_signals: 'layoff', keywords: '', signal_strength: 'Low', details: '' },
      bullhorn: { found: false },
    });
    const result = scoreProspect(data, baseIcp);
    expect(result.overall).toBeLessThan(CUTOFF);
    expect(result.recommendation).toMatch(/WEAK/);
  });

  test('DISCARD when bullhorn_clear = 1', () => {
    const data = makeData({ bullhorn: { found: true, negativeSignals: ['do not contact'] } });
    const result = scoreProspect(data, baseIcp);
    expect(result.recommendation).toMatch(/DISCARD/);
  });

  test('overall score is between 1 and 5', () => {
    const data = makeData();
    const result = scoreProspect(data, baseIcp);
    expect(result.overall).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBeLessThanOrEqual(5);
  });
});
