/**
 * Deduplication service.
 * Merges company lists from multiple sources and removes duplicates.
 */

/**
 * Normalise a company name for comparison.
 * Strips common suffixes, lowercases, trims whitespace.
 */
function normalise(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|holdings|plc|gmbh|sa|ag)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicate an array of { name, source } objects.
 * Keeps the first occurrence and notes all sources.
 */
function deduplicate(companies) {
  const seen = new Map(); // normalised → { name (original), sources[] }

  for (const { name, source } of companies) {
    if (!name || !name.trim()) continue;
    const key = normalise(name);
    if (seen.has(key)) {
      const entry = seen.get(key);
      if (!entry.sources.includes(source)) {
        entry.sources.push(source);
      }
    } else {
      seen.set(key, { name: name.trim(), sources: [source] });
    }
  }

  return Array.from(seen.values()).map(({ name, sources }) => ({
    name,
    source: sources.join(', '),
  }));
}

module.exports = { deduplicate, normalise };
