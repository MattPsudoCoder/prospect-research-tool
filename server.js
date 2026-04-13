require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false }));

// API routes
app.use('/api', require('./routes/api'));
app.use('/api/icp', require('./routes/icp'));
app.use('/api/pipeline', require('./routes/pipeline'));
app.use('/api/history', require('./routes/history'));
app.use('/api/tracker', require('./routes/tracker'));
app.use('/api/bullhorn', require('./routes/bullhorn'));

// SPA fallback — serve index.html for page routes
const pages = ['/', '/icp', '/history', '/prospects', '/tracker', '/review-later'];
pages.forEach((route) => {
  app.get(route, (req, res) => {
    const page = route === '/' ? 'index' : route.slice(1);
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Initialize database schema on startup
async function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  try {
    await db.query(schema);
    console.log('Database schema ready.');
  } catch (err) {
    console.error('Database init warning:', err.message);
  }
}

// Daily ATS scan — runs on startup + every 24 hours
async function runDailyAtsScan() {
  try {
    const http = require('http');
    http.get(`http://localhost:${PORT}/api/tracker/ats-scan`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log(`[ATS Auto-Scan] Scanned ${result.scanned} companies, ${result.newRoles} new roles found`);
        } catch { console.log('[ATS Auto-Scan] Complete'); }
      });
    }).on('error', () => { /* server not ready yet, skip */ });
  } catch { /* ignore */ }
}

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Prospect Research Tool running on http://localhost:${PORT}`);
    // Run first ATS scan 30 seconds after startup, then every 24 hours
    setTimeout(runDailyAtsScan, 30000);
    setInterval(runDailyAtsScan, 24 * 60 * 60 * 1000);
  });
});
