const express = require('express');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Feature flags — tells the frontend what's available
router.get('/features', (req, res) => {
  res.json({
    claude_api: !!process.env.ANTHROPIC_API_KEY,
    bullhorn_oauth: !!(process.env.BULLHORN_CLIENT_ID && process.env.BULLHORN_CLIENT_SECRET),
  });
});

module.exports = router;
