const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Outreach service is optional — requires Anthropic API key
let outreach = null;
try {
  if (process.env.ANTHROPIC_API_KEY) outreach = require('../services/outreach');
} catch { /* Claude features disabled */ }

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
    const { company_id, name, ats_detected, roles_found, hiring_signals, keywords, signal_strength } = req.body;

    // Prevent duplicates
    const existing = await db.query(
      'SELECT id FROM tracked_companies WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already tracked', id: existing.rows[0].id });
    }

    const result = await db.query(
      `INSERT INTO tracked_companies (company_id, name, ats_detected, roles_found, hiring_signals, keywords, signal_strength)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [company_id, name, ats_detected || '', roles_found || '', hiring_signals || '', keywords || '', signal_strength || '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — update a tracked company
router.patch('/:id', async (req, res) => {
  try {
    const fields = ['ats_detected', 'roles_found', 'hiring_signals', 'keywords', 'signal_strength', 'status', 'notes'];
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
    const result = await db.query(
      `INSERT INTO tracked_contacts (tracked_company_id, name, title, linkedin_url, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.companyId, name, title || '', linkedin_url || '', email || '', phone || '']
    );
    const contact = result.rows[0];

    // Auto-push to Bullhorn if connected
    try {
      const bh = require('../services/bullhorn');
      if (bh.isConfigured().connected) {
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
    for (const key of ['name', 'title', 'linkedin_url', 'email', 'phone', 'outreach_step', 'notes']) {
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
      `SELECT tc.*, tco.name as company_name, tco.hiring_signals, tco.roles_found, tco.keywords, tco.signal_strength
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
      signal_types: '', // future: pull from companies table
    };

    const templates = await outreach.generateTemplates(contact, company);

    // Save templates to contact record
    await db.query('UPDATE tracked_contacts SET outreach_templates = $1 WHERE id = $2', [JSON.stringify(templates), req.params.contactId]);

    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — batch generate outreach: generate for first contact, clone to rest (1 API call)
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
    const company = companyResult.rows[0];

    // Find first contact without templates to use as the source
    const needsGen = contacts.rows.filter(c => !c.outreach_templates || Object.keys(c.outreach_templates).length === 0);
    const hasTemplates = contacts.rows.filter(c => c.outreach_templates && Object.keys(c.outreach_templates).length > 0);

    let sourceContact, sourceTemplates;

    if (hasTemplates.length > 0) {
      // Reuse existing templates from a contact that already has them
      sourceContact = hasTemplates[0];
      sourceTemplates = sourceContact.outreach_templates;
    } else if (needsGen.length > 0) {
      // Generate for the first contact (1 API call)
      sourceContact = needsGen[0];
      const companyData = {
        name: company.name,
        hiring_signals: company.hiring_signals,
        roles_found: company.roles_found,
        keywords: company.keywords,
        signal_types: '',
      };
      sourceTemplates = await outreach.generateTemplates(sourceContact, companyData);
      await db.query('UPDATE tracked_contacts SET outreach_templates = $1 WHERE id = $2',
        [JSON.stringify(sourceTemplates), sourceContact.id]);
    } else {
      return res.json({ generated: 0, message: 'All contacts already have templates' });
    }

    // Clone to all other contacts that don't have templates
    let cloned = 0;
    for (const ct of contacts.rows) {
      if (ct.id === sourceContact.id) continue;
      if (ct.outreach_templates && Object.keys(ct.outreach_templates).length > 0) continue;

      const clonedTemplates = outreach.cloneTemplates(
        sourceTemplates, sourceContact.name, sourceContact.title, ct.name, ct.title
      );
      await db.query('UPDATE tracked_contacts SET outreach_templates = $1 WHERE id = $2',
        [JSON.stringify(clonedTemplates), ct.id]);
      cloned++;
    }

    res.json({
      generated: 1,
      cloned,
      total: 1 + cloned,
      source: sourceContact.name,
      message: `Generated for ${sourceContact.name}, cloned to ${cloned} others`
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

    let pushed = 0, linked = 0, skipped = 0, errors = 0;
    for (const ct of contacts.rows) {
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

    res.json({ total: contacts.rows.length, pushed, linked, skipped, errors });
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

module.exports = router;
