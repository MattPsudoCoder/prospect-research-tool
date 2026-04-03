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

module.exports = router;
