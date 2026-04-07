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

// POST — add a contact to a tracked company
router.post('/:companyId/contacts', async (req, res) => {
  try {
    const { name, title, linkedin_url, email, phone } = req.body;
    const result = await db.query(
      `INSERT INTO tracked_contacts (tracked_company_id, name, title, linkedin_url, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.companyId, name, title || '', linkedin_url || '', email || '', phone || '']
    );
    res.json(result.rows[0]);
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
    const { step, action_taken } = req.body;
    const contactId = parseInt(req.params.contactId);

    // Update step
    const result = await db.query(
      'UPDATE tracked_contacts SET outreach_step = $1, step_updated_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
      [step, contactId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    const contact = result.rows[0];

    // Log the activity
    await db.query(
      `INSERT INTO activity_log (tracked_contact_id, bullhorn_contact_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [contactId, contact.bullhorn_id || null, action_taken || `Advanced to step ${step}`, req.body.details || '']
    );

    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
