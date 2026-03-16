require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await db.query(schema);
    console.log('Database schema initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
  } finally {
    await db.pool.end();
  }
}

init();
