/**
 * Outreach message generation — Claude-powered, deeply personalized per contact.
 * Generates personalized messages for each step in the 6-step cadence.
 *
 * Tone: Matthew Davie, 10+ years technical recruitment at Signify Technology.
 * Consultative, strategic, never salesy. Short sentences. Natural rhythm.
 */

const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Derive seniority context from job title to adjust tone.
 */
function getSeniorityContext(title) {
  const t = (title || '').toLowerCase();
  if (/\b(cto|chief technology|co-founder|founder)\b/.test(t)) return { level: 'C-Suite', tone: 'peer-to-peer, strategic. They think about org design, culture, and long-term talent pipeline — not individual reqs.' };
  if (/\b(svp|senior vice president|vp|vice president|head of)\b/.test(t)) return { level: 'VP', tone: 'executive but approachable. They own engineering outcomes and care about velocity, retention, and team capability.' };
  if (/\b(senior director|sr director)\b/.test(t)) return { level: 'Senior Director', tone: 'respectful of their breadth. They manage multiple teams and need partners who understand scale.' };
  if (/\b(director)\b/.test(t)) return { level: 'Director', tone: 'direct and practical. They feel hiring pain daily and want someone who can actually deliver.' };
  if (/\b(manager|lead|principal)\b/.test(t)) return { level: 'Manager', tone: 'tactical and specific. They know exactly what skills they need and hate vague pitches.' };
  return { level: 'Unknown', tone: 'professional and direct.' };
}

/**
 * Generate outreach templates for all 6 steps for a single contact.
 * Each script is individually crafted using contact-specific + company-specific data.
 *
 * @param {object} contact — { name, title, email, phone, linkedin_url }
 * @param {object} company — { name, hiring_signals, roles_found, keywords, tech_stack, role_types, website }
 * @returns {object} — template keys for all steps
 */
async function generateTemplates(contact, company) {
  const anthropic = getClient();

  // Parse roles into readable list
  const rolesContext = (() => {
    if (!company.roles_found) return 'engineering roles (specifics unknown)';
    try {
      const r = JSON.parse(company.roles_found);
      if (Array.isArray(r) && r.length > 0) return r.map(x => x.title || x).join(', ');
      if (Array.isArray(r) && r.length === 0) return company.role_types || 'engineering roles';
    } catch {}
    return company.roles_found || 'engineering roles';
  })();

  const seniority = getSeniorityContext(contact.title);
  const techStack = company.tech_stack || 'not specified';
  const roleTypes = company.role_types || '';
  const firstName = (contact.name || '').split(/\s+/)[0];

  const prompt = `You are writing outreach messages as Matthew Davie, a senior technical recruiter at Signify Technology with 10+ years placing software engineers across the US.

ABSOLUTE RULES:
- NEVER use "I hope this finds you well", "I wanted to reach out", "I came across your profile"
- NEVER congratulate on promotions or new roles
- NEVER say "exciting times at [company]" or similar platitudes
- Short sentences. Natural rhythm. No corporate filler.
- Be specific or be silent — one real detail beats three generic ones
- Every message must feel like it was written specifically for THIS person at THIS company

CONTACT PROFILE:
- Name: ${contact.name} (first name: ${firstName})
- Title: ${contact.title}
- Seniority: ${seniority.level}
- Tone guidance: ${seniority.tone}
- LinkedIn: ${contact.linkedin_url || 'not available'}
- Company: ${company.name}

COMPANY CONTEXT:
- Tech Stack: ${techStack}
- Open Roles: ${rolesContext}
- Role Types Hiring: ${roleTypes}
- Hiring Signals: ${company.hiring_signals || 'general hiring activity'}
- Keywords: ${company.keywords || ''}
- Website: ${company.website || ''}

GENERATE THESE 6 STEPS (return as JSON object):

{
  "step1_linkedin_connect": "LinkedIn connection request. MUST be under 300 characters. Goal: get accepted. Reference something SPECIFIC — their tech stack (${techStack}), a role they're filling, or their team's work. Do NOT pitch. Just give a genuine reason to connect that shows you know who they are.",

  "step2a_intro_accepted": "LinkedIn message after connection accepted. 2-3 sentences max. Goal: start a real conversation. Ask ONE smart question about their hiring that proves you understand their world. For a ${seniority.level} at a ${(company.hiring_signals || '').match(/\\d+\\s*employees/)?.[0] || ''} company using ${techStack} — what would be a genuinely useful question? Not 'are you hiring?' but something that shows engineering recruitment expertise.",

  "step2b_intro_not_accepted": "LinkedIn InMail if connection not accepted. 3-4 sentences. Goal: earn a reply without a connection. Lead with a SPECIFIC insight about their hiring situation — a role that's been open, their growth trajectory, or a talent market reality about ${techStack} engineers. End with a low-friction CTA.",

  "step3_email": "Spec-in email. Goal: put a realistic hypothetical candidate in front of them. Subject line + body (separate with two newlines). Build a candidate profile that PRECISELY matches their tech stack (${techStack}) and the types of roles they hire (${roleTypes || rolesContext}). Include: years of experience, specific technologies, type of company background, what makes them compelling. This must feel like a real person, not a generic template. Adjust the candidate seniority to match what a ${seniority.level} would actually be hiring for.",

  "step4_call_script": "Cold call script. 30 seconds max when spoken aloud. Goal: get 2 minutes of their time. State your name, Signify Technology, and ONE specific hook about why you're calling — tied to their actual hiring needs. ${seniority.level === 'C-Suite' ? 'For a CTO, lead with a strategic talent insight, not a specific role.' : seniority.level === 'Manager' ? 'For a Manager, lead with a specific candidate type you can deliver.' : 'Lead with the most relevant hook for their level.'}",

  "step4_voicemail": "Voicemail. 15 seconds max. Name, Signify, one compelling reason to call back. Reference the spec-in candidate from step 3 as the hook.",

  "step4_followup_text": "SMS after call attempt. 1-2 sentences. Reference that you just tried calling. Include one specific detail from the voicemail hook so they connect the dots.",

  "step5_email": "Value-add email. Goal: give genuine value with zero ask. Subject line + body. Share a REAL market insight about hiring ${techStack} engineers — salary trends, availability, where this talent is moving, what competitors are offering. This must feel like something a ${seniority.level} would actually forward to their team or find useful. Do NOT pitch Signify. Do NOT ask for a call. Just be helpful.",

  "step6_linkedin": "LinkedIn follow-up. 2-3 sentences. Goal: soft close. Reference the hypothetical candidate from step 3 by describing them briefly. Add a fresh market insight about ${techStack} talent. End with a simple 'worth a 10-minute call?' type close."
}

Return ONLY the JSON object, no markdown formatting.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.filter(b => b.type === 'text').pop();
  if (!textBlock) return {};

  try {
    const start = textBlock.text.indexOf('{');
    const end = textBlock.text.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    return JSON.parse(textBlock.text.slice(start, end + 1));
  } catch {
    return {};
  }
}

/**
 * Clone templates is DEPRECATED — kept for backward compatibility only.
 * New batch generation calls generateTemplates() per contact individually.
 */
function cloneTemplates(sourceTemplates, sourceName, sourceTitle, targetName, targetTitle) {
  const cloned = {};
  const srcFirst = sourceName.split(/\s+/)[0];
  const tgtFirst = targetName.split(/\s+/)[0];

  for (const [key, value] of Object.entries(sourceTemplates)) {
    if (!value) continue;
    let text = typeof value === 'object' && value.body
      ? JSON.stringify(value)
      : String(value);

    text = text.replace(new RegExp(escapeRegex(sourceName), 'g'), targetName);
    text = text.replace(new RegExp(escapeRegex(srcFirst), 'g'), tgtFirst);
    if (sourceTitle && targetTitle) {
      text = text.replace(new RegExp(escapeRegex(sourceTitle), 'g'), targetTitle);
    }

    if (typeof value === 'object') {
      try { cloned[key] = JSON.parse(text); } catch { cloned[key] = text; }
    } else {
      cloned[key] = text;
    }
  }
  return cloned;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { generateTemplates, cloneTemplates };
