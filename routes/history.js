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
