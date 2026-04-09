const { isRelevantRole, isRelevantLocation, slugify, buildRoleKeywords } = require('../services/ats');

describe('slugify', () => {
  test('lowercases and strips non-alphanumeric', () => {
    expect(slugify('Acme Corp')).toBe('acmecorp');
    expect(slugify('My-Company Inc.')).toBe('mycompanyinc');
    expect(slugify('HELLO WORLD')).toBe('helloworld');
  });

  test('handles already clean slugs', () => {
    expect(slugify('acme')).toBe('acme');
  });
});

describe('isRelevantRole', () => {
  const defaultKeywords = buildRoleKeywords(null); // uses DEFAULT_ROLE_KEYWORDS

  // Positive matches — should find these
  test('matches phrase keywords (substring)', () => {
    expect(isRelevantRole('Senior Software Engineer', defaultKeywords)).toBe(true);
    expect(isRelevantRole('Frontend Developer', defaultKeywords)).toBe(true);
    expect(isRelevantRole('Full Stack Developer', defaultKeywords)).toBe(true);
    expect(isRelevantRole('Engineering Manager', defaultKeywords)).toBe(true);
    expect(isRelevantRole('Staff Engineer', defaultKeywords)).toBe(true);
  });

  test('matches short acronyms as whole words', () => {
    expect(isRelevantRole('CTO', defaultKeywords)).toBe(true);
    expect(isRelevantRole('SRE', defaultKeywords)).toBe(true);
    expect(isRelevantRole('QA Engineer', defaultKeywords)).toBe(true);
    expect(isRelevantRole('Senior SRE', defaultKeywords)).toBe(true);
  });

  // Negative matches — should NOT match these
  test('rejects non-tech roles', () => {
    expect(isRelevantRole('Account Manager', defaultKeywords)).toBe(false);
    expect(isRelevantRole('HR Coordinator', defaultKeywords)).toBe(false);
    expect(isRelevantRole('Sales Executive', defaultKeywords)).toBe(false);
  });

  test('whole-word matching prevents false positives on short keywords', () => {
    // "go" should NOT match "Cargo Specialist" or "Category Manager"
    expect(isRelevantRole('Cargo Specialist', defaultKeywords)).toBe(false);
    // "qa" should NOT match "Squad Leader"
    // (squad doesn't contain "qa" as a word boundary)
    expect(isRelevantRole('Squad Leader', defaultKeywords)).toBe(false);
    // "ui" should NOT match "Recruitment Coordinator"
    expect(isRelevantRole('Recruitment Coordinator', defaultKeywords)).toBe(false);
  });

  test('is case insensitive', () => {
    expect(isRelevantRole('SOFTWARE ENGINEER', defaultKeywords)).toBe(true);
    expect(isRelevantRole('cto', defaultKeywords)).toBe(true);
  });
});

describe('isRelevantLocation', () => {
  test('matches US locations', () => {
    const job = { location: { name: 'United States (Remote)' } };
    expect(isRelevantLocation(job, 'United States')).toBe(true);
  });

  test('matches remote without country-specific exclusions', () => {
    const job = { location: { name: 'Remote' } };
    expect(isRelevantLocation(job, 'United States')).toBe(true);
  });

  test('rejects remote India when filtering for US', () => {
    const job = { location: { name: 'Remote, India' } };
    expect(isRelevantLocation(job, 'United States')).toBe(false);
  });

  test('returns true when no geography filter', () => {
    const job = { location: { name: 'Berlin, Germany' } };
    expect(isRelevantLocation(job, null)).toBe(true);
  });

  test('handles Lever-style categories', () => {
    const job = { categories: { location: 'Remote, US' } };
    expect(isRelevantLocation(job, 'United States')).toBe(true);
  });
});

describe('buildRoleKeywords', () => {
  test('returns defaults when no ICP', () => {
    const kw = buildRoleKeywords(null);
    expect(kw).toContain('software');
    expect(kw).toContain('engineer');
    expect(kw).toContain('cto');
  });

  test('adds ICP role_types to defaults', () => {
    const kw = buildRoleKeywords({ role_types: 'data scientist, product manager' });
    expect(kw).toContain('data scientist');
    expect(kw).toContain('product manager');
    // Still has defaults
    expect(kw).toContain('software');
  });

  test('deduplicates keywords', () => {
    const kw = buildRoleKeywords({ role_types: 'software, engineer' });
    const softwareCount = kw.filter(k => k === 'software').length;
    expect(softwareCount).toBe(1);
  });

  test('handles empty role_types', () => {
    const kw = buildRoleKeywords({ role_types: '' });
    expect(kw.length).toBeGreaterThan(0); // still has defaults
  });
});
