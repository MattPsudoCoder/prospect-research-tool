const { classifySignals } = require('../services/research');

describe('classifySignals', () => {
  function makeSignals(overrides = {}) {
    return { hiring_signals: '', keywords: '', details: '', ...overrides };
  }

  function makeAts(overrides = {}) {
    return { roles: [], relevant_count: 0, ...overrides };
  }

  test('team_expansion when 5+ relevant roles', () => {
    const result = classifySignals(makeSignals(), makeAts({ relevant_count: 5 }));
    expect(result).toContain('team_expansion');
  });

  test('team_growth when 2-4 relevant roles', () => {
    const result = classifySignals(makeSignals(), makeAts({ relevant_count: 3 }));
    expect(result).toContain('team_growth');
  });

  test('leadership_hire when VP/Director roles found', () => {
    const ats = makeAts({ roles: [{ title: 'VP of Engineering' }] });
    const result = classifySignals(makeSignals(), ats);
    expect(result).toContain('leadership_hire');
  });

  test('leadership_hire for Head of role', () => {
    const ats = makeAts({ roles: [{ title: 'Head of Product' }] });
    const result = classifySignals(makeSignals(), ats);
    expect(result).toContain('leadership_hire');
  });

  test('recent_funding when funding signals present', () => {
    const signals = makeSignals({ keywords: 'funding' });
    const result = classifySignals(signals, makeAts());
    expect(result).toContain('recent_funding');
  });

  test('recent_funding for Series mentions', () => {
    const signals = makeSignals({ hiring_signals: 'Company raised Series B' });
    const result = classifySignals(signals, makeAts());
    expect(result).toContain('recent_funding');
  });

  test('expansion when expansion signals present', () => {
    const signals = makeSignals({ details: 'opening new office in Austin' });
    const result = classifySignals(signals, makeAts());
    expect(result).toContain('expansion');
  });

  test('negative_signal when layoffs detected', () => {
    const signals = makeSignals({ hiring_signals: 'company announced layoff' });
    const result = classifySignals(signals, makeAts());
    expect(result).toContain('negative_signal');
  });

  test('negative_signal for hiring freeze', () => {
    const signals = makeSignals({ keywords: 'freeze' });
    const result = classifySignals(signals, makeAts());
    expect(result).toContain('negative_signal');
  });

  test('new_function for founding engineer', () => {
    const signals = makeSignals({ details: 'looking for founding engineer' });
    const result = classifySignals(signals, makeAts());
    expect(result).toContain('new_function');
  });

  test('general_hiring when no specific signals', () => {
    const result = classifySignals(makeSignals(), makeAts());
    expect(result).toContain('general_hiring');
    expect(result).toHaveLength(1);
  });

  test('multiple signal types can coexist', () => {
    const signals = makeSignals({ keywords: 'funding', hiring_signals: 'leadership' });
    const ats = makeAts({ relevant_count: 6, roles: [{ title: 'VP Engineering' }] });
    const result = classifySignals(signals, ats);
    expect(result).toContain('team_expansion');
    expect(result).toContain('leadership_hire');
    expect(result).toContain('recent_funding');
    expect(result).not.toContain('general_hiring');
  });

  test('handles null/undefined signals gracefully', () => {
    const result = classifySignals(null, null);
    expect(result).toContain('general_hiring');
  });
});
