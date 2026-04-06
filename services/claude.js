const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function withRetry(fn, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
      console.warn(`Claude API error (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Extract a JSON object or array from a string, handling nested structures.
 * Finds the first { or [ and counts brackets to find the matching close.
 */
function extractJSON(text, type = 'object') {
  const open = type === 'array' ? '[' : '{';
  const close = type === 'array' ? ']' : '}';
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) depth--;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Use Claude with web search to find companies matching ICP criteria.
 * Returns an array of company name strings.
 */
async function searchCompaniesByICP(icp) {
  const anthropic = getClient();

  const prompt = `You are a technical recruiter's research assistant. Find 10-20 real companies that match these Ideal Client Profile criteria:

- Industry: ${icp.industry_sector}
- Company size: ${icp.company_size_min} – ${icp.company_size_max} employees
- Geography: ${icp.geography}
- Role types they'd hire: ${icp.role_types}
${icp.hiring_signals ? `- Prioritize companies showing these hiring signals: ${icp.hiring_signals}` : ''}

Focus on companies that show signs of active hiring or growth (recent funding, expansion, new offices, leadership hires).

Return ONLY a JSON array of company names, no commentary. Example: ["Acme Corp","Beta Inc"]`;

  const response = await withRetry(() =>
    anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
      messages: [{ role: 'user', content: prompt }],
    })
  );

  // Extract the final text block from the response
  const textBlock = response.content.filter((b) => b.type === 'text').pop();
  if (!textBlock) return [];

  try {
    const result = extractJSON(textBlock.text, 'array');
    return result || [];
  } catch {
    return [];
  }
}

/**
 * Use Claude with web search to research hiring signals for a company.
 */
async function researchCompany(companyName, icp) {
  const anthropic = getClient();

  const roleContext = icp?.role_types
    ? `\n\nIMPORTANT CONTEXT: This research is for a technical recruiter who places: ${icp.role_types}. Weight your signal strength assessment based on whether this company is likely hiring these specific roles. A company hiring lots of engineers is "High" signal; a company only hiring sales/marketing is "Low" even if they're growing.`
    : '';

  const signalContext = icp?.hiring_signals
    ? `\n6. Specifically look for these signals: ${icp.hiring_signals}`
    : '';

  const prompt = `Research the company "${companyName}" for hiring and growth signals. Investigate:
1. Recent funding rounds or revenue milestones (amount, date, investors)
2. Executive or leadership hires (especially engineering/tech leaders)
3. Office expansions or new locations
4. Job posting velocity (how many open engineering roles?)
5. Any layoffs or freezes (negative signals)
6. Tech stack — what languages, frameworks, and infrastructure do they use? Check their careers page job descriptions, engineering blog, or StackShare/GitHub for clues${signalContext}

Also search for their careers page URL if you can find it.${roleContext}

Return a JSON object with this exact structure:
{
  "hiring_signals": "Funding: $60M Series C (Sep 2024, led by Scale Ventures). Growth: expanding engineering team. Leadership: hired new VP Eng in Q1.",
  "tech_stack": "Python, Go, React, TypeScript, AWS, Kubernetes, PostgreSQL",
  "keywords": "series-c, high-growth, expanding-eng-team",
  "signal_strength": "High" or "Medium" or "Low",
  "careers_page": "URL or empty string",
  "details": "2-3 sentence summary"
}

For hiring_signals, use short labeled sections (Funding:, Growth:, Leadership:, Risk:) rather than one long paragraph. For tech_stack, list the specific languages, frameworks, databases, and cloud platforms — this is critical for matching candidates. If you can't determine the tech stack, return an empty string.

Return ONLY the JSON, no other text.`;

  const response = await withRetry(() =>
    anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const textBlock = response.content.filter((b) => b.type === 'text').pop();
  if (!textBlock) {
    return { hiring_signals: '', keywords: '', signal_strength: 'Low', careers_page: '', details: '' };
  }

  try {
    const result = extractJSON(textBlock.text, 'object');
    return result || { hiring_signals: '', keywords: '', signal_strength: 'Low', careers_page: '', details: '' };
  } catch {
    return { hiring_signals: textBlock.text.slice(0, 300), keywords: '', signal_strength: 'Low', careers_page: '', details: '' };
  }
}

/**
 * Use Claude with web search to check Ashby, careers pages, and fallback ATS platforms.
 * Filters results to only include ICP-relevant engineering/tech roles.
 */
async function searchATSFallback(companyName, icp) {
  const anthropic = getClient();

  const roleFilter = icp?.role_types
    ? `\n\nIMPORTANT: Only include roles relevant to a technical recruiter who places: ${icp.role_types}. Do NOT include sales, marketing, finance, HR, operations, customer success, account executive, or other non-technical roles. If none of the open roles match, return empty sample_roles.`
    : '\n\nIMPORTANT: Only include software engineering and technical roles. Do NOT include sales, marketing, finance, HR, operations, or other non-technical roles.';

  const prompt = `Search for job postings from "${companyName}" on these platforms:
1. Ashby (jobs.ashbyhq.com/${companyName.toLowerCase().replace(/\s+/g, '')})
2. Workable (apply.workable.com)
3. SmartRecruiters (jobs.smartrecruiters.com)
4. Teamtailor
5. Google for Jobs — search: "${companyName} careers jobs"
6. Their own careers page${roleFilter}

Return a JSON object:
{
  "ats_found": "name of ATS platform found, or empty string",
  "sample_roles": [{"title": "Role Title", "url": "https://link-to-posting"}, ...],
  "job_count_estimate": 0
}

Include up to 5 RELEVANT roles with direct links to the job posting. Return ONLY the JSON.`;

  const response = await withRetry(() =>
    anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const textBlock = response.content.filter((b) => b.type === 'text').pop();
  if (!textBlock) return { ats_found: '', sample_roles: '', job_count_estimate: 0 };

  try {
    const result = extractJSON(textBlock.text, 'object');
    return result || { ats_found: '', sample_roles: '', job_count_estimate: 0 };
  } catch {
    return { ats_found: '', sample_roles: '', job_count_estimate: 0 };
  }
}

module.exports = { searchCompaniesByICP, researchCompany, searchATSFallback };
