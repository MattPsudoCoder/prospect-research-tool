const express = require('express');
const router = express.Router();
const db = require('../db/db');

// GET all pipeline runs
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET results for a specific run
router.get('/:runId/results', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM companies WHERE run_id = $1 ORDER BY signal_strength DESC, name ASC',
      [req.params.runId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all valid prospects across all runs (deduped, best result per company)
router.get('/prospects', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT ON (LOWER(name)) *
      FROM companies
      WHERE hiring_signals NOT LIKE 'Error:%'
        AND hiring_signals NOT LIKE '%rate_limit_error%'
        AND hiring_signals NOT LIKE '%"type":"error"%'
        AND (hiring_signals != '' OR ats_detected != '' OR roles_found != '')
      ORDER BY LOWER(name),
        CASE signal_strength WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
        created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE error rows from all runs
router.delete('/cleanup/errors', async (req, res) => {
  try {
    const result = await db.query(`
      DELETE FROM companies
      WHERE hiring_signals LIKE 'Error:%'
        OR hiring_signals LIKE '%rate_limit_error%'
        OR hiring_signals LIKE '%"type":"error"%'
    `);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a single company by ID (from prospects list)
router.delete('/company/:companyId', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM companies WHERE id = $1', [req.params.companyId]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a run and its results
router.delete('/:runId', async (req, res) => {
  try {
    await db.query('DELETE FROM pipeline_runs WHERE id = $1', [req.params.runId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
