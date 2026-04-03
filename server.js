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
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', require('./routes/api'));
app.use('/api/icp', require('./routes/icp'));
app.use('/api/pipeline', require('./routes/pipeline'));
app.use('/api/history', require('./routes/history'));

// SPA fallback — serve index.html for page routes
const pages = ['/', '/icp', '/history', '/prospects'];
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

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Prospect Research Tool running on http://localhost:${PORT}`);
  });
});
