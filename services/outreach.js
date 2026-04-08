/**
 * Outreach message generation — Claude-powered, tone-aware templates.
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

const TONE_RULES = `
You are writing outreach messages as Matthew Davie, a senior technical recruiter with 10+ years at Signify Technology.
RULES:
- Consultative and strategic — never salesy, never generic
- Short sentences. Natural rhythm. No filler.
- NEVER use "I hope this finds you well", "I wanted to reach out", "I came across your profile"
- NEVER congratulate on promotions
- One specific, relevant detail beats three generic ones
- Be direct about why you're reaching out — you help companies hire great engineers
- Reference their specific tech stack, roles, or recent news when possible
`;

/**
 * Generate outreach templates for all 6 steps for a single contact.
 *
 * @param {object} contact — { name, title, email, phone, linkedin_url }
 * @param {object} company — { name, hiring_signals, roles_found, signal_types, keywords }
 * @returns {object} — { step1, step2a, step2b, step3, step4_script, step4_voicemail, step4_text, step5, step6 }
 */
async function generateTemplates(contact, company) {
  const anthropic = getClient();

  const rolesContext = company.roles_found
    ? (() => { try { const r = JSON.parse(company.roles_found); return Array.isArray(r) ? r.map(x => x.title || x).join(', ') : company.roles_found; } catch { return company.roles_found; } })()
    : 'engineering roles';

  const prompt = `${TONE_RULES}

Generate outreach messages for this contact:

CONTACT: ${contact.name}, ${contact.title}
COMPANY: ${company.name}
ROLES THEY'RE HIRING: ${rolesContext}
HIRING SIGNALS: ${company.hiring_signals || 'general hiring activity'}
SIGNAL TYPES: ${company.signal_types || 'general'}
KEYWORDS: ${company.keywords || ''}

Generate ALL of these as a JSON object:
{
  "step1_linkedin_connect": "LinkedIn connection request, MUST be under 300 characters. No pitch — just a warm, relevant reason to connect.",
  "step2a_intro_accepted": "LinkedIn message after connection accepted. Personalised opener + one smart question about their hiring. 2-3 sentences max.",
  "step2b_intro_not_accepted": "LinkedIn InMail if connection not accepted. Lead with relevance + clear CTA. 3-4 sentences max.",
  "step3_email": "Spec-in email with a brief hypothetical candidate profile tailored to their tech stack. Subject line + body. Show you understand what they need.",
  "step4_call_script": "Cold call script. 30 seconds max. State name, company, reason for calling, one hook, ask for 2 minutes.",
  "step4_voicemail": "Voicemail script. 15 seconds max. Name, reason, callback hook.",
  "step4_followup_text": "Follow-up SMS after call attempt. 1-2 sentences. Reference the call attempt.",
  "step5_email": "Value-add email. Share a genuine market insight about their tech stack or hiring landscape. No ask — just give value. Subject line + body.",
  "step6_linkedin": "LinkedIn follow-up. Reference the candidate from step 3. Soft close + offer a market insight. 2-3 sentences."
}

Return ONLY the JSON object.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
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
 * Clone templates from one contact to another, swapping name + title references.
 * Saves an API call — same company context, just different person.
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

    // Replace full name, first name, and title
    text = text.replace(new RegExp(escapeRegex(sourceName), 'g'), targetName);
    text = text.replace(new RegExp(escapeRegex(srcFirst), 'g'), tgtFirst);
    if (sourceTitle && targetTitle) {
      text = text.replace(new RegExp(escapeRegex(sourceTitle), 'g'), targetTitle);
    }

    // Parse back if it was an object
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
