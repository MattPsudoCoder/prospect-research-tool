/**
 * ATS detection service — checks Greenhouse and Lever public APIs,
 * then falls back to Claude web search for other platforms.
 */

const claude = require('./claude');

/**
 * Normalise a company name into a likely board slug.
 * "Acme Corp" → "acmecorp", "My-Company Inc." → "mycompanyinc"
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Check Greenhouse public job board.
 * Returns { ats: 'Greenhouse', roles: [...], count: N } or null.
 */
async function checkGreenhouse(companyName) {
  const slug = slugify(companyName);
  const url = `https://api.greenhouse.io/v1/boards/${slug}/jobs`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const jobs = data.jobs || [];
    if (jobs.length === 0) return null;
    return {
      ats: 'Greenhouse',
      roles: jobs.slice(0, 5).map((j) => j.title),
      count: jobs.length,
    };
  } catch {
    return null;
  }
}

/**
 * Check Lever public postings.
 */
async function checkLever(companyName) {
  const slug = slugify(companyName);
  const url = `https://api.lever.co/v0/postings/${slug}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const jobs = await res.json();
    if (!Array.isArray(jobs) || jobs.length === 0) return null;
    return {
      ats: 'Lever',
      roles: jobs.slice(0, 5).map((j) => j.text),
      count: jobs.length,
    };
  } catch {
    return null;
  }
}

/**
 * Full ATS detection pipeline for one company.
 * Tries Greenhouse → Lever → Claude fallback (Ashby, Workable, etc.)
 */
async function detectATS(companyName) {
  // Try Greenhouse first
  const gh = await checkGreenhouse(companyName);
  if (gh) return gh;

  // Try Lever
  const lv = await checkLever(companyName);
  if (lv) return lv;

  // Fallback: Claude web search for other ATS platforms
  const fallback = await claude.searchATSFallback(companyName);
  if (fallback.ats_found) {
    return {
      ats: fallback.ats_found,
      roles: fallback.sample_roles ? fallback.sample_roles.split(',').map((r) => r.trim()) : [],
      count: fallback.job_count_estimate || 0,
    };
  }

  return { ats: 'None detected', roles: [], count: 0 };
}

module.exports = { detectATS, checkGreenhouse, checkLever };
