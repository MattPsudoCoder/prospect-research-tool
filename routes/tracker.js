const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Outreach service is optional — requires Anthropic API key
let outreach = null;
try {
  if (process.env.ANTHROPIC_API_KEY) outreach = require('../services/outreach');
} catch { /* Claude features disabled */ }

/* ── Validation helpers ───────────────────────────────────────── */

const VALID_SIGNAL_STRENGTHS = ['High', 'Medium', 'Low'];

const NON_US_PREFIXES = ['+91', '+972', '+44', '+49', '+55', '+57', '+61', '+86', '+375', '+33', '+81', '+82', '+65', '+971'];

function isNonUSPhone(phone) {
  if (!phone) return false;
  const trimmed = phone.trim();
  return NON_US_PREFIXES.some(p => trimmed.startsWith(p));
}

function isValidEmail(email) {
  if (!email) return true; // optional field
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidLinkedIn(url) {
  if (!url) return true; // optional field
  return url.includes('linkedin.com');
}

// ATS Scan — check all tracked companies with known ATS for new roles
const ats = require('../services/ats');

router.get('/ats-scan', async (req, res) => {
  try {
    const { rows: companies } = await db.query(
      "SELECT * FROM tracked_companies WHERE ats_detected IS NOT NULL AND ats_detected != '' AND ats_detected != 'None' AND signal_strength != 'Low' ORDER BY name"
    );

    const results = [];
    let scanned = 0;
    let skipped = 0;

    for (const company of companies) {
      const atsType = (company.ats_detected || '').toLowerCase();

      // Only scan Greenhouse and Lever (we have APIs for these)
      const isGreenhouse = atsType.includes('greenhouse');
      const isLever = atsType.includes('lever');

      if (!isGreenhouse && !isLever) {
        skipped++;
        continue;
      }

      scanned++;

      try {
        // Use ats_slug override if set, otherwise slugify the company name
        const slug = (company.ats_slug && company.ats_slug.trim()) || ats.slugify(company.name);
        let currentRoles = [];
        let totalCount = 0;

        if (isGreenhouse) {
          // Try primary slug first, then try with redirect URL pattern
          let ghRes = await fetch(`https://api.greenhouse.io/v1/boards/${slug}/jobs`, { signal: AbortSignal.timeout(8000) });
          if (!ghRes.ok) {
            // Some companies use job-boards.greenhouse.io — try fetching from there isn't possible via API
            // but the v1 API should work for most. 404 means wrong slug.
            ghRes = { ok: false };
          }
          if (ghRes.ok) {
            const data = await ghRes.json();
            currentRoles = (data.jobs || []).map(j => ({
              title: j.title,
              location: j.location?.name || '',
              url: j.absolute_url || '',
            }));
            totalCount = currentRoles.length;
          }
        } else if (isLever) {
          const lvRes = await fetch(`https://api.lever.co/v0/postings/${slug}`, { signal: AbortSignal.timeout(8000) });
          if (lvRes.ok) {
            const data = await lvRes.json();
            if (Array.isArray(data)) {
              currentRoles = data.map(j => ({
                title: j.text,
                location: j.categories?.location || '',
                url: j.hostedUrl || '',
              }));
              totalCount = currentRoles.length;
            }
          }
        }

        // Filter to engineering roles only
        const roleKeywords = ats.buildRoleKeywords(null);
        const engRoles = currentRoles.filter(r => ats.isRelevantRole(r.title, roleKeywords));

        // Compare against previous snapshot if available, otherwise parse roles_found text
        const prevSnapshot = company.ats_role_snapshot || [];
        const prevTitles = new Set(
          Array.isArray(prevSnapshot) && prevSnapshot.length > 0
            ? prevSnapshot.map(r => r.title.toLowerCase().trim())
            : (company.roles_found || '').match(/(?:Sr|Senior|Staff|Principal|Lead|Junior|Mid|Dir|Director|Manager|VP|Engineer|SWE|EM)\s+[^,.\n]*/gi)?.map(t => t.toLowerCase().trim()) || []
        );
        const previousCount = prevSnapshot.length > 0 ? prevSnapshot.length : (() => {
          const m = (company.roles_found || '').match(/(\d+)\s*(?:eng|engineering|total)\s*roles?/i);
          return m ? parseInt(m[1]) : 0;
        })();

        // Find genuinely new roles not in previous snapshot
        const newRoles = engRoles.filter(r => {
          const lower = r.title.toLowerCase().trim();
          if (previousCount === 0 && (company.roles_found || '').length < 10) return true;
          return !prevTitles.has(lower) && ![...prevTitles].some(pt => lower.includes(pt) || pt.includes(lower));
        });

        // Save snapshot and timestamp
        await db.query(
          'UPDATE tracked_companies SET ats_last_scanned = NOW(), ats_role_snapshot = $1 WHERE id = $2',
          [JSON.stringify(engRoles.map(r => ({ title: r.title, location: r.location }))), company.id]
        );

        results.push({
          companyId: company.id,
          company: company.name,
          slug,
          atsType: isGreenhouse ? 'Greenhouse' : 'Lever',
          currentTotal: totalCount,
          currentEng: engRoles.length,
          previousCount,
          newRoles: newRoles.length > 0 ? newRoles.slice(0, 15).map(r => ({ title: r.title, location: r.location })) : [],
        });

        // Small delay between API calls to be polite
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.push({
          companyId: company.id,
          company: company.name,
          error: err.message || 'Failed to fetch',
        });
      }
    }

    res.json({ results, scanned, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all tracked companies
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM tracked_companies ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — add a company to tracker from prospects
router.post('/', async (req, res) => {
  try {
    const { company_id, name, ats_detected, roles_found, hiring_signals, keywords, signal_strength, website, company_linkedin, tech_stack, role_types, status } = req.body;

    // ── Guardrails ──
    if (!name || !name.trim()) return res.status(400).json({ error: 'Company name is required' });
    if (signal_strength && !VALID_SIGNAL_STRENGTHS.includes(signal_strength)) {
      return res.status(400).json({ error: `signal_strength must be one of: ${VALID_SIGNAL_STRENGTHS.join(', ')}. Got: "${signal_strength}"` });
    }
    if (!hiring_signals || !hiring_signals.trim()) {
      return res.status(400).json({ error: 'hiring_signals is required — must have at least one confirmed signal before pushing to tracker' });
    }

    const warnings = [];
    if (!ats_detected || ats_detected === '—' || ats_detected === '-') warnings.push('No ATS detected — verify hiring via job boards');
    if (!roles_found || roles_found === '—' || roles_found === '-') warnings.push('No roles found — verify open positions');

    // Prevent duplicates
    const existing = await db.query(
      'SELECT id FROM tracked_companies WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already tracked', id: existing.rows[0].id });
    }

    const result = await db.query(
      `INSERT INTO tracked_companies (company_id, name, ats_detected, roles_found, hiring_signals, keywords, signal_strength, website, company_linkedin, tech_stack, role_types, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [company_id, name.trim(), ats_detected || '', roles_found || '', hiring_signals || '', keywords || '', signal_strength || '', website || '', company_linkedin || '', tech_stack || '', role_types || '', status || 'New']
    );
    const response = result.rows[0];
    if (warnings.length > 0) response.warnings = warnings;
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — update a tracked company
router.patch('/:id', async (req, res) => {
  try {
    // ── Guardrails ──
    if (req.body.signal_strength && !VALID_SIGNAL_STRENGTHS.includes(req.body.signal_strength)) {
      return res.status(400).json({ error: `signal_strength must be one of: ${VALID_SIGNAL_STRENGTHS.join(', ')}` });
    }

    const fields = ['ats_detected', 'ats_slug', 'roles_found', 'hiring_signals', 'keywords', 'signal_strength', 'status', 'notes', 'favorite', 'website', 'company_linkedin', 'tech_stack', 'role_types'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        values.push(req.body[f]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    const result = await db.query(
      `UPDATE tracked_companies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a tracked company
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM tracked_companies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Contacts ---

// GET contacts for a tracked company
router.get('/:companyId/contacts', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM tracked_contacts WHERE tracked_company_id = $1 ORDER BY created_at ASC',
      [req.params.companyId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — add a contact to a tracked company (auto-pushes to BH if connected)
router.post('/:companyId/contacts', async (req, res) => {
  try {
    const { name, title, linkedin_url, email, phone } = req.body;

    // ── Guardrails ──
    if (!name || !name.trim()) return res.status(400).json({ error: 'Contact name is required' });
    if (isNonUSPhone(phone)) {
      return res.status(400).json({ error: `Non-US phone number rejected: "${phone}". Only US-based contacts should be added.` });
    }
    if (!email && !linkedin_url) {
      return res.status(400).json({ error: 'At least one of email or linkedin_url is required — must have a way to reach the contact' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: `Invalid email format: "${email}"` });
    }
    if (linkedin_url && !isValidLinkedIn(linkedin_url)) {
      return res.status(400).json({ error: `Invalid LinkedIn URL: "${linkedin_url}" — must contain linkedin.com` });
    }

    const result = await db.query(
      `INSERT INTO tracked_contacts (tracked_company_id, name, title, linkedin_url, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.companyId, name, title || '', linkedin_url || '', email || '', phone || '']
    );
    const contact = result.rows[0];

    // Auto-push to Bullhorn if connected — only if contact has email or phone
    try {
      const bh = require('../services/bullhorn');
      if (bh.isConfigured().connected && (email || phone)) {
        const companyResult = await db.query('SELECT name FROM tracked_companies WHERE id = $1', [req.params.companyId]);
        const companyName = companyResult.rows[0]?.name;
        if (companyName) {
          const nameParts = name.trim().split(/\s+/);
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(' ') || nameParts[0];

          // Check if already in BH
          const existing = await bh.searchContact(firstName, lastName);
          if (existing.total > 0) {
            const bhId = existing.data[0].id;
            await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [bhId, contact.id]);
            contact.bullhorn_id = bhId;
          } else {
            // Find company in BH, then create contact
            const companySearch = await bh.searchCompany(companyName);
            if (companySearch.data && companySearch.data.length > 0) {
              const created = await bh.createContact({ firstName, lastName, companyId: companySearch.data[0].id, title: title || '', email: email || '', phone: phone || '' });
              if (created.changedEntityId) {
                await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [created.changedEntityId, contact.id]);
                contact.bullhorn_id = created.changedEntityId;
              }
            }
          }
        }
      }
    } catch (bhErr) {
      // BH push failed silently — contact still saved locally
      console.log('Auto-push to BH failed:', bhErr.message);
    }

    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — update a contact (step, notes, fields)
router.patch('/contacts/:contactId', async (req, res) => {
  try {
    const fields = [];
    const values = [];
    let i = 1;
    for (const key of ['name', 'title', 'linkedin_url', 'email', 'phone', 'outreach_step', 'notes', 'bullhorn_id', 'is_flipped', 'flip_step', 'flip_outcome']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${i}`);
        values.push(req.body[key]);
        i++;
      }
    }
    if (fields.length === 0) return res.json({ success: true });
    fields.push(`updated_at = NOW()`);
    values.push(req.params.contactId);
    const result = await db.query(
      `UPDATE tracked_contacts SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a contact
router.delete('/contacts/:contactId', async (req, res) => {
  try {
    await db.query('DELETE FROM tracked_contacts WHERE id = $1', [req.params.contactId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Outreach Templates ---

// POST — generate outreach templates for a contact
router.post('/contacts/:contactId/generate-outreach', async (req, res) => {
  if (!outreach) return res.status(400).json({ error: 'Outreach generation requires an Anthropic API key. Ask Claude Code to generate scripts for you instead — it\'s free.' });
  try {
    const ct = await db.query(
      `SELECT tc.*, tco.name as company_name, tco.hiring_signals, tco.roles_found, tco.keywords, tco.signal_strength, tco.tech_stack, tco.role_types, tco.website
       FROM tracked_contacts tc
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE tc.id = $1`, [req.params.contactId]
    );
    if (ct.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    const contact = ct.rows[0];

    const company = {
      name: contact.company_name,
      hiring_signals: contact.hiring_signals,
      roles_found: contact.roles_found,
      keywords: contact.keywords,
      tech_stack: contact.tech_stack || '',
      role_types: contact.role_types || '',
      website: contact.website || '',
    };

    const templates = await outreach.generateTemplates(contact, company);

    // Save templates to contact record
    await db.query('UPDATE tracked_contacts SET outreach_templates = $1 WHERE id = $2', [JSON.stringify(templates), req.params.contactId]);

    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — batch generate outreach: generate individually for each contact
router.post('/:companyId/generate-batch-outreach', async (req, res) => {
  if (!outreach) return res.status(400).json({ error: 'Outreach generation requires an Anthropic API key.' });
  try {
    const contacts = await db.query(
      'SELECT * FROM tracked_contacts WHERE tracked_company_id = $1 ORDER BY created_at ASC',
      [req.params.companyId]
    );
    if (contacts.rows.length === 0) return res.status(404).json({ error: 'No contacts found' });

    const companyResult = await db.query('SELECT * FROM tracked_companies WHERE id = $1', [req.params.companyId]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: 'Company not found' });
    const co = companyResult.rows[0];

    const companyData = {
      name: co.name, hiring_signals: co.hiring_signals, roles_found: co.roles_found,
      keywords: co.keywords, tech_stack: co.tech_stack || '', role_types: co.role_types || '',
      website: co.website || '',
    };

    // Force regenerate if requested, otherwise only generate for contacts without templates
    const forceRegen = req.body.force === true;
    const needsGen = forceRegen
      ? contacts.rows
      : contacts.rows.filter(c => !c.outreach_templates || Object.keys(c.outreach_templates).length === 0);

    if (needsGen.length === 0) {
      return res.json({ generated: 0, message: 'All contacts already have templates. Use force:true to regenerate.' });
    }

    // Generate individually for each contact (better personalization, costs ~$0.01/contact)
    let generated = 0;
    for (const ct of needsGen) {
      try {
        const templates = await outreach.generateTemplates(ct, companyData);
        if (templates && Object.keys(templates).length > 0) {
          await db.query('UPDATE tracked_contacts SET outreach_templates = $1 WHERE id = $2',
            [JSON.stringify(templates), ct.id]);
          generated++;
        }
      } catch (err) {
        console.log(`Script generation failed for ${ct.name}:`, err.message);
      }
    }

    res.json({
      generated,
      total: needsGen.length,
      message: `Generated personalized scripts for ${generated} contacts individually`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET — get outreach templates for a contact
router.get('/contacts/:contactId/outreach', async (req, res) => {
  try {
    const result = await db.query('SELECT outreach_templates FROM tracked_contacts WHERE id = $1', [req.params.contactId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0].outreach_templates || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — backfill: push all contacts without bullhorn_id to BH
// POST — regenerate all outreach scripts across all active contacts
router.post('/regenerate-all-scripts', async (req, res) => {
  if (!outreach) return res.status(400).json({ error: 'Outreach generation requires an Anthropic API key.' });
  try {
    const companies = await db.query(
      `SELECT * FROM tracked_companies WHERE status NOT IN ('Dropped', 'Review Later') ORDER BY name`
    );
    let generated = 0, errors = 0, total = 0;
    for (const co of companies.rows) {
      const contacts = await db.query(
        'SELECT * FROM tracked_contacts WHERE tracked_company_id = $1 ORDER BY created_at ASC',
        [co.id]
      );
      if (contacts.rows.length === 0) continue;
      const companyData = {
        name: co.name, hiring_signals: co.hiring_signals, roles_found: co.roles_found,
        keywords: co.keywords, tech_stack: co.tech_stack || '', role_types: co.role_types || '',
        website: co.website || '',
      };
      for (const ct of contacts.rows) {
        total++;
        try {
          const templates = await outreach.generateTemplates(ct, companyData);
          if (templates && Object.keys(templates).length > 0) {
            await db.query('UPDATE tracked_contacts SET outreach_templates = $1 WHERE id = $2',
              [JSON.stringify(templates), ct.id]);
            generated++;
          }
        } catch (err) {
          errors++;
          console.log(`Regen failed for ${ct.name} at ${co.name}:`, err.message);
        }
      }
    }
    res.json({ total, generated, errors, message: `Regenerated ${generated}/${total} scripts` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backfill-bullhorn', async (req, res) => {
  try {
    const bh = require('../services/bullhorn');
    if (!bh.isConfigured().connected) return res.status(400).json({ error: 'Bullhorn not connected' });

    const contacts = await db.query(
      `SELECT tc.*, tco.name as company_name
       FROM tracked_contacts tc
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE tc.bullhorn_id IS NULL
       ORDER BY tco.name, tc.name`
    );

    let pushed = 0, linked = 0, skipped = 0, errors = 0, noContact = 0;
    for (const ct of contacts.rows) {
      // Skip contacts without email AND without phone — don't push empty contacts to BH
      if (!ct.email && !ct.phone) { noContact++; continue; }
      try {
        const nameParts = ct.name.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || nameParts[0];

        const existing = await bh.searchContact(firstName, lastName);
        if (existing.total > 0) {
          await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [existing.data[0].id, ct.id]);
          linked++;
        } else {
          const companySearch = await bh.searchCompany(ct.company_name);
          if (companySearch.data && companySearch.data.length > 0) {
            const created = await bh.createContact({ firstName, lastName, companyId: companySearch.data[0].id, title: ct.title || '', email: ct.email || '', phone: ct.phone || '' });
            if (created.changedEntityId) {
              await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [created.changedEntityId, ct.id]);
              pushed++;
            } else { skipped++; }
          } else { skipped++; }
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        errors++;
        console.log(`Backfill error for ${ct.name}:`, err.message);
      }
    }

    res.json({ total: contacts.rows.length, pushed, linked, skipped, noContact, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — bulk-fix: update occupation (job title) on all BH contacts that were pushed with wrong field
router.post('/fix-bullhorn-titles', async (req, res) => {
  try {
    const bh = require('../services/bullhorn');
    if (!bh.isConfigured().connected) return res.status(400).json({ error: 'Bullhorn not connected' });

    const contacts = await db.query(
      `SELECT tc.*, tco.name as company_name
       FROM tracked_contacts tc
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE tc.bullhorn_id IS NOT NULL AND tc.title IS NOT NULL AND tc.title != ''
       ORDER BY tco.name, tc.name`
    );

    let updated = 0, errors = 0;
    for (const ct of contacts.rows) {
      try {
        await bh.bhFetch(`entity/ClientContact/${ct.bullhorn_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ occupation: ct.title }),
        });
        updated++;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        errors++;
        console.log(`Title fix error for ${ct.name} (BH ${ct.bullhorn_id}):`, err.message);
      }
    }

    res.json({ total: contacts.rows.length, updated, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Activity Log ---

// POST — log an activity (call, email, message, etc.)
router.post('/activity', async (req, res) => {
  try {
    const { tracked_contact_id, bullhorn_contact_id, action, details } = req.body;
    const result = await db.query(
      `INSERT INTO activity_log (tracked_contact_id, bullhorn_contact_id, action, details)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tracked_contact_id, bullhorn_contact_id || null, action, details || '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET — today's activity log
router.get('/activity/today', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT al.*, tc.name as contact_name, tco.name as company_name
       FROM activity_log al
       JOIN tracked_contacts tc ON al.tracked_contact_id = tc.id
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE al.created_at >= CURRENT_DATE
       ORDER BY al.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET — unsynced activity (not yet pushed to Bullhorn)
router.get('/activity/unsynced', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT al.*, tc.name as contact_name, tc.bullhorn_id, tco.name as company_name
       FROM activity_log al
       JOIN tracked_contacts tc ON al.tracked_contact_id = tc.id
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE al.synced_to_bullhorn = FALSE
       ORDER BY al.created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — remove activity log entries (cleanup noise/test data)
router.delete('/activity/batch', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.json({ deleted: 0 });
    const result = await db.query('DELETE FROM activity_log WHERE id = ANY($1) RETURNING id', [ids]);
    res.json({ deleted: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — mark activities as synced
router.post('/activity/mark-synced', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.json({ updated: 0 });
    const result = await db.query(
      `UPDATE activity_log SET synced_to_bullhorn = TRUE WHERE id = ANY($1) RETURNING id`,
      [ids]
    );
    res.json({ updated: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — advance outreach step with activity logging
router.post('/contacts/:contactId/advance-step', async (req, res) => {
  try {
    const { step, action_taken, bh_action } = req.body;
    const contactId = parseInt(req.params.contactId);

    // Update step
    const result = await db.query(
      'UPDATE tracked_contacts SET outreach_step = $1, step_updated_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
      [step, contactId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    const contact = result.rows[0];

    // Log the activity — action is the BH note action type (BD Message, Reverse Market, etc.)
    await db.query(
      `INSERT INTO activity_log (tracked_contact_id, bullhorn_contact_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [contactId, contact.bullhorn_id || null, bh_action || action_taken || `Advanced to step ${step}`, req.body.details || '']
    );

    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FLIPS ---

// GET all flipped contacts with company data
router.get('/flips', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tc.*, tco.name as company_name, tco.hiring_signals, tco.signal_strength,
              tco.website, tco.company_linkedin, tco.tech_stack
       FROM tracked_contacts tc
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE tc.is_flipped = TRUE
       ORDER BY tco.name, tc.name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — flip a contact (move to Flips)
router.post('/contacts/:contactId/flip', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE tracked_contacts SET is_flipped = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.contactId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — unflip a contact (move back from Flips)
router.post('/contacts/:contactId/unflip', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE tracked_contacts SET is_flipped = FALSE, flip_step = 0, flip_outcome = \'\', updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.contactId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — advance flip step with activity logging
router.post('/contacts/:contactId/advance-flip', async (req, res) => {
  try {
    const { flip_step, flip_outcome, bh_action, details } = req.body;
    const contactId = parseInt(req.params.contactId);

    const updates = ['flip_step = $1', 'updated_at = NOW()'];
    const values = [flip_step];
    let idx = 2;

    if (flip_outcome !== undefined) {
      updates.push(`flip_outcome = $${idx++}`);
      values.push(flip_outcome);
    }

    values.push(contactId);
    const result = await db.query(
      `UPDATE tracked_contacts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    const contact = result.rows[0];

    // Log the activity
    await db.query(
      `INSERT INTO activity_log (tracked_contact_id, bullhorn_contact_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [contactId, contact.bullhorn_id || null, bh_action || 'BD Message', details || '']
    );

    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET — dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const companies = await db.query(`SELECT id, name, signal_strength, status, created_at, notes, website, company_linkedin FROM tracked_companies WHERE status NOT IN ('Dropped', 'Review Later') ORDER BY created_at DESC`);
    const contacts = await db.query(`
      SELECT tc.*, comp.name as company_name FROM tracked_contacts tc
      JOIN tracked_companies comp ON tc.tracked_company_id = comp.id
      WHERE comp.status NOT IN ('Dropped', 'Review Later')
    `);
    const activities = await db.query(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50`);

    const now = new Date();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

    const totalCompanies = companies.rows.length;
    const totalContacts = contacts.rows.length;
    const contactsByStep = {};
    const staleContacts = [];
    const noEmailContacts = [];
    const companiesNoContacts = [];

    for (const c of contacts.rows) {
      const step = c.outreach_step || 0;
      contactsByStep[step] = (contactsByStep[step] || 0) + 1;
      if (c.step_updated_at && new Date(c.step_updated_at) < threeDaysAgo && step > 0 && step < 7) {
        staleContacts.push({ id: c.id, name: c.name, title: c.title, company: c.company_name, step, stepUpdated: c.step_updated_at });
      }
      if (!c.email || c.email.trim() === '') {
        noEmailContacts.push({ id: c.id, name: c.name, company: c.company_name });
      }
    }

    const companyContactCounts = {};
    for (const c of contacts.rows) companyContactCounts[c.tracked_company_id] = true;
    for (const c of companies.rows) {
      if (!companyContactCounts[c.id]) companiesNoContacts.push({ id: c.id, name: c.name });
    }

    const signalCounts = { High: 0, Medium: 0, Low: 0 };
    for (const c of companies.rows) signalCounts[c.signal_strength] = (signalCounts[c.signal_strength] || 0) + 1;

    const addedThisWeek = companies.rows.filter(c => new Date(c.created_at) > new Date(now - 7 * 24 * 60 * 60 * 1000)).length;

    // Today's actions — contacts at step 1+ with step_updated_at 2+ days ago, sorted by company signal
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const signalOrder = { High: 0, Medium: 1, Low: 2 };
    const companySignals = {};
    for (const c of companies.rows) companySignals[c.id] = c.signal_strength || 'Low';

    const todayActions = contacts.rows
      .filter(c => c.outreach_step > 0 && c.outreach_step < 7 && c.step_updated_at && new Date(c.step_updated_at) < twoDaysAgo)
      .map(c => {
        const days = Math.floor((now - new Date(c.step_updated_at)) / (24 * 60 * 60 * 1000));
        return { id: c.id, name: c.name, company: c.company_name, companyId: c.tracked_company_id, step: c.outreach_step, days, signal: companySignals[c.tracked_company_id] || 'Low' };
      })
      .sort((a, b) => (signalOrder[a.signal] || 2) - (signalOrder[b.signal] || 2) || b.days - a.days)
      .slice(0, 15);

    // ATS new roles count
    const atsResults = await db.query(`SELECT ats_role_snapshot, ats_last_scanned FROM tracked_companies WHERE ats_role_snapshot IS NOT NULL AND ats_last_scanned > NOW() - INTERVAL '24 hours'`);
    const newRolesCount = atsResults.rows.reduce((sum, r) => sum + (Array.isArray(r.ats_role_snapshot) ? r.ats_role_snapshot.length : 0), 0);

    res.json({
      totalCompanies, totalContacts, addedThisWeek, signalCounts, contactsByStep,
      staleContacts, noEmailContacts, companiesNoContacts,
      recentActivities: activities.rows.slice(0, 10),
      todayActions, newRolesCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
