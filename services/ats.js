/**
 * ATS detection service — checks Greenhouse and Lever public APIs,
 * then falls back to Claude web search for other platforms.
 * Filters roles to only show ICP-relevant positions.
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
 * Keywords extracted from ICP role_types to match against job titles.
 * These are the core terms that indicate a tech/engineering role.
 * Falls back to a sensible default set if ICP isn't configured.
 */
const DEFAULT_ROLE_KEYWORDS = [
  'software', 'engineer', 'developer', 'frontend', 'front-end', 'front end',
  'backend', 'back-end', 'back end', 'full stack', 'fullstack', 'full-stack',
  'react', 'node', 'typescript', 'javascript', 'next.js', 'nextjs',
  'mobile', 'ios', 'android', 'flutter', 'react native',
  'devops', 'sre', 'platform', 'infrastructure', 'cloud',
  'qa', 'quality', 'sdet', 'test engineer', 'automation engineer',
  'ui engineer', 'ui developer', 'ux engineer',
  'data engineer', 'ml engineer', 'machine learning',
  'engineering manager', 'vp engineering', 'cto', 'tech lead',
  'architect', 'principal engineer', 'staff engineer',
];

/**
 * Build a list of filter phrases from ICP role_types string.
 * Uses full phrases (e.g. "engineering manager") — never splits into
 * individual words like "manager" which would match too broadly.
 */
function buildRoleKeywords(icp) {
  if (!icp?.role_types) return DEFAULT_ROLE_KEYWORDS;

  const phrases = new Set(DEFAULT_ROLE_KEYWORDS);
  const roles = icp.role_types.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);

  for (const role of roles) {
    phrases.add(role);
  }

  return [...phrases];
}

/**
 * Short keywords that must match as whole words to avoid false positives
 * (e.g. "cto" matching "Director", "sre" matching "Treasurer").
 */
const WHOLE_WORD_KEYWORDS = new Set(['cto', 'sre', 'qa', 'ios', 'go', 'ui', 'ux', 'ml', 'ai', 'sdet']);

/**
 * Check if a job title is relevant to ICP role types.
 * Matches against full phrases. Short acronyms (cto, sre, qa, etc.)
 * are matched as whole words to avoid substring false positives.
 */
function isRelevantRole(title, keywords) {
  const lower = title.toLowerCase();
  return keywords.some((kw) => {
    if (WHOLE_WORD_KEYWORDS.has(kw)) {
      const re = new RegExp(`\\b${kw}\\b`);
      return re.test(lower);
    }
    return lower.includes(kw);
  });
}

/**
 * Check if a job location matches the ICP geography (default: United States).
 */
function isRelevantLocation(job, geography) {
  if (!geography) return true;
  const geo = geography.toLowerCase();
  // Greenhouse: job.location.name — e.g. "United States (Remote)"
  const locName = (job.location?.name || '').toLowerCase();
  // Lever: job.categories?.location — e.g. "Remote, US"
  const locCat = (job.categories?.location || '').toLowerCase();
  const combined = `${locName} ${locCat}`;
  if (geo.includes('united states') || geo.includes('us')) {
    return combined.includes('united states') || combined.includes('usa') || combined.includes(', us') || combined.includes('remote') && !combined.includes('india') && !combined.includes('germany') && !combined.includes('sweden') && !combined.includes('canada') && !combined.includes('uk') && !combined.includes('europe');
  }
  return combined.includes(geo);
}

/**
 * Check Greenhouse public job board.
 * Returns { ats: 'Greenhouse', roles: [...], count: N } or null.
 */
async function checkGreenhouse(companyName, roleKeywords, geography) {
  const slug = slugify(companyName);
  const url = `https://api.greenhouse.io/v1/boards/${slug}/jobs`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const jobs = data.jobs || [];
    if (jobs.length === 0) return null;

    // Filter to ICP-relevant roles AND locations
    const relevant = jobs.filter((j) => isRelevantRole(j.title, roleKeywords) && isRelevantLocation(j, geography));

    return {
      ats: 'Greenhouse',
      roles: relevant.slice(0, 8).map((j) => ({ title: j.title, url: j.absolute_url || '', location: j.location?.name || '' })),
      count: jobs.length,
      relevant_count: relevant.length,
    };
  } catch {
    return null;
  }
}

/**
 * Check Lever public postings.
 */
async function checkLever(companyName, roleKeywords, geography) {
  const slug = slugify(companyName);
  const url = `https://api.lever.co/v0/postings/${slug}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const jobs = await res.json();
    if (!Array.isArray(jobs) || jobs.length === 0) return null;

    // Filter to ICP-relevant roles AND locations
    const relevant = jobs.filter((j) => isRelevantRole(j.text, roleKeywords) && isRelevantLocation(j, geography));

    return {
      ats: 'Lever',
      roles: relevant.slice(0, 8).map((j) => ({ title: j.text, url: j.hostedUrl || '' })),
      count: jobs.length,
      relevant_count: relevant.length,
    };
  } catch {
    return null;
  }
}

/**
 * Full ATS detection pipeline for one company.
 * Tries Greenhouse → Lever → Claude fallback (Ashby, Workable, etc.)
 * Filters roles to only show positions matching ICP role types.
 */
async function detectATS(companyName, icp) {
  const roleKeywords = buildRoleKeywords(icp);
  const geography = icp?.geography || 'United States';

  // Try Greenhouse first
  const gh = await checkGreenhouse(companyName, roleKeywords, geography);
  if (gh) return gh;

  // Try Lever
  const lv = await checkLever(companyName, roleKeywords, geography);
  if (lv) return lv;

  // Fallback: Claude web search for other ATS platforms
  const fallback = await claude.searchATSFallback(companyName, icp);
  if (fallback.ats_found) {
    // sample_roles may be array of {title, url} objects or legacy comma string
    let roles = [];
    if (Array.isArray(fallback.sample_roles)) {
      roles = fallback.sample_roles.map((r) =>
        typeof r === 'string' ? { title: r.trim(), url: '' } : { title: r.title || '', url: r.url || '' }
      );
    } else if (typeof fallback.sample_roles === 'string' && fallback.sample_roles) {
      roles = fallback.sample_roles.split(',').map((r) => ({ title: r.trim(), url: '' }));
    }
    // Filter fallback roles through the same ICP relevance check
    const relevant = roles.filter((r) => isRelevantRole(r.title, roleKeywords));
    return {
      ats: fallback.ats_found,
      roles: relevant,
      count: fallback.job_count_estimate || 0,
      relevant_count: relevant.length,
    };
  }

  return { ats: 'None detected', roles: [], count: 0, relevant_count: 0 };
}

module.exports = { detectATS, checkGreenhouse, checkLever, buildRoleKeywords };
