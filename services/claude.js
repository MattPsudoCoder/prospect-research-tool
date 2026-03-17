const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract the final text block from the response
  const textBlock = response.content.filter((b) => b.type === 'text').pop();
  if (!textBlock) return [];

  try {
    const match = textBlock.text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
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

  const prompt = `Research the company "${companyName}" for hiring and growth signals. Look for:
1. Recent funding rounds or revenue milestones
2. Executive or leadership hires
3. Office expansions or new locations
4. Job posting velocity (are they posting lots of roles?)
5. Any layoffs or freezes (negative signals)${signalContext}

Also search for their careers page URL if you can find it.${roleContext}

Return a JSON object with this exact structure:
{
  "hiring_signals": "brief summary of signals found",
  "keywords": "comma-separated keywords like: funding, expansion, exec-hire, high-growth",
  "signal_strength": "High" or "Medium" or "Low",
  "careers_page": "URL or empty string",
  "details": "2-3 sentence summary"
}

Return ONLY the JSON, no other text.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.filter((b) => b.type === 'text').pop();
  if (!textBlock) {
    return { hiring_signals: '', keywords: '', signal_strength: 'Low', careers_page: '', details: '' };
  }

  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { hiring_signals: '', keywords: '', signal_strength: 'Low', careers_page: '', details: '' };
  } catch {
    return { hiring_signals: textBlock.text.slice(0, 300), keywords: '', signal_strength: 'Low', careers_page: '', details: '' };
  }
}

/**
 * Use Claude with web search to check Ashby, careers pages, and fallback ATS platforms.
 */
async function searchATSFallback(companyName) {
  const anthropic = getClient();

  const prompt = `Search for job postings from "${companyName}" on these platforms:
1. Ashby (jobs.ashbyhq.com/${companyName.toLowerCase().replace(/\s+/g, '')})
2. Workable (apply.workable.com)
3. SmartRecruiters (jobs.smartrecruiters.com)
4. Teamtailor
5. Google for Jobs — search: "${companyName} careers jobs"
6. Their own careers page

Return a JSON object:
{
  "ats_found": "name of ATS platform found, or empty string",
  "sample_roles": "up to 5 role titles comma-separated, or empty string",
  "job_count_estimate": 0
}

Return ONLY the JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.filter((b) => b.type === 'text').pop();
  if (!textBlock) return { ats_found: '', sample_roles: '', job_count_estimate: 0 };

  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { ats_found: '', sample_roles: '', job_count_estimate: 0 };
  } catch {
    return { ats_found: '', sample_roles: '', job_count_estimate: 0 };
  }
}

module.exports = { searchCompaniesByICP, researchCompany, searchATSFallback };
