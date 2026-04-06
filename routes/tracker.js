const express = require('express');
const router = express.Router();
const db = require('../db/db');

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

module.exports = router;
