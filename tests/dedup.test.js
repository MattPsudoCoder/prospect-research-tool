const { deduplicate, normalise } = require('../services/dedup');

describe('normalise', () => {
  test('lowercases', () => {
    expect(normalise('ACME')).toBe('acme');
  });

  test('strips common suffixes', () => {
    expect(normalise('Acme Inc')).toBe('acme');
    expect(normalise('Acme LLC')).toBe('acme');
    expect(normalise('Acme Corp')).toBe('acme');
    expect(normalise('Acme Corporation')).toBe('acme');
    expect(normalise('Acme Ltd')).toBe('acme');
    expect(normalise('Acme GmbH')).toBe('acme');
    expect(normalise('Acme PLC')).toBe('acme');
  });

  test('strips punctuation (dots, commas)', () => {
    expect(normalise('Acme, Inc.')).toBe('acme');
  });

  test('collapses whitespace', () => {
    expect(normalise('  Acme   Corp  ')).toBe('acme');
  });

  test('handles multiple suffixes', () => {
    expect(normalise('Acme Holdings Group')).toBe('acme');
  });

  test('preserves meaningful words', () => {
    expect(normalise('Google Cloud')).toBe('google cloud');
  });

  test('handles empty/whitespace input', () => {
    expect(normalise('   ')).toBe('');
    expect(normalise('')).toBe('');
  });
});

describe('deduplicate', () => {
  test('removes exact duplicates', () => {
    const input = [
      { name: 'Acme', source: 'manual' },
      { name: 'Acme', source: 'csv' },
    ];
    const result = deduplicate(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Acme');
    expect(result[0].source).toBe('manual, csv');
  });

  test('removes case-insensitive duplicates', () => {
    const input = [
      { name: 'ACME', source: 'manual' },
      { name: 'acme', source: 'csv' },
    ];
    const result = deduplicate(input);
    expect(result).toHaveLength(1);
  });

  test('removes suffix-variant duplicates (Inc vs Corp)', () => {
    const input = [
      { name: 'Acme Inc', source: 'manual' },
      { name: 'Acme Corp', source: 'csv' },
    ];
    const result = deduplicate(input);
    expect(result).toHaveLength(1);
  });

  test('keeps first occurrence name as canonical', () => {
    const input = [
      { name: 'Acme, Inc.', source: 'manual' },
      { name: 'acme', source: 'csv' },
    ];
    const result = deduplicate(input);
    expect(result[0].name).toBe('Acme, Inc.');
  });

  test('skips empty/whitespace names', () => {
    const input = [
      { name: '', source: 'manual' },
      { name: '  ', source: 'csv' },
      { name: 'Acme', source: 'manual' },
    ];
    const result = deduplicate(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Acme');
  });

  test('does not duplicate the same source', () => {
    const input = [
      { name: 'Acme', source: 'manual' },
      { name: 'Acme Inc', source: 'manual' },
    ];
    const result = deduplicate(input);
    expect(result[0].source).toBe('manual');
  });

  test('preserves distinct companies', () => {
    const input = [
      { name: 'Google', source: 'manual' },
      { name: 'Microsoft', source: 'manual' },
      { name: 'Apple', source: 'csv' },
    ];
    const result = deduplicate(input);
    expect(result).toHaveLength(3);
  });
});
