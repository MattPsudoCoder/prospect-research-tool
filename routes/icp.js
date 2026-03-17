const express = require('express');
const router = express.Router();
const db = require('../db/db');

// GET current ICP settings
router.get('/', async (req, res) => {
    try {
          const result = await db.query('SELECT * FROM icp_settings ORDER BY id DESC LIMIT 1');
          if (result.rows.length === 0) {
                  return res.json({
                            industry_sector: '',
                            company_size_min: 0,
                            company_size_max: 0,
                            geography: '',
                            role_types: '',
                            hiring_signals: '',
                  });
          }
          res.json(result.rows[0]);
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

// PUT update ICP settings
router.put('/', async (req, res) => {
    const { industry_sector, company_size_min, company_size_max, geography, role_types, hiring_signals } = req.body;
    try {
          const existing = await db.query('SELECT id FROM icp_settings ORDER BY id DESC LIMIT 1');
          if (existing.rows.length > 0) {
                  const result = await db.query(
                            `UPDATE icp_settings
                                     SET industry_sector = $1,
                                                  company_size_min = $2,
                                                               company_size_max = $3,
                                                                            geography = $4,
                                                                                         role_types = $5,
                                                                                                      hiring_signals = $6,
                                                                                                                   updated_at = NOW()
                                                                                                                            WHERE id = $7
                                                                                                                                     RETURNING *`,
                            [industry_sector, company_size_min, company_size_max, geography, role_types, hiring_signals, existing.rows[0].id]
                          );
                  res.json(result.rows[0]);
          } else {
                  const result = await db.query(
                            `INSERT INTO icp_settings (industry_sector, company_size_min, company_size_max, geography, role_types, hiring_signals)
                                     VALUES ($1, $2, $3, $4, $5, $6)
                                              RETURNING *`,
                            [industry_sector, company_size_min, company_size_max, geography, role_types, hiring_signals]
                          );
                  res.json(result.rows[0]);
          }
    } catch (err) {
          res.status(500).json({ error: err.message });
    }
});

module.exports = router;
