const express = require('express');
const router = express.Router();
const db = require('../db/db');
const bh = require('../services/bullhorn');

// GET /api/bullhorn/status — connection status
router.get('/status', (req, res) => {
  const status = bh.isConfigured();
  const manual = bh.getManualToken();
  res.json({
    connected: status.connected,
    method: status.oauth ? 'oauth' : status.manualToken ? 'manual' : 'none',
    tokenAge: manual ? Math.round((Date.now() - manual.receivedAt) / 1000) : null,
  });
});

// POST /api/bullhorn/token — accept browser token
router.post('/token', async (req, res) => {
  try {
    const { bhRestToken, restUrl } = req.body;
    if (!bhRestToken || !restUrl) {
      return res.status(400).json({ error: 'bhRestToken and restUrl are required' });
    }

    // Validate with a test call
    bh.setManualToken(bhRestToken, restUrl);
    try {
      await bh.searchCompany('__test__');
    } catch (err) {
      bh.clearManualToken();
      return res.status(401).json({ error: 'Token validation failed: ' + err.message });
    }

    res.json({ connected: true, method: 'manual' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bullhorn/disconnect
router.post('/disconnect', (req, res) => {
  bh.clearManualToken();
  res.json({ connected: false });
});

// GET /api/bullhorn/search/contact — search by name
router.get('/search/contact', async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName required' });
    const data = await bh.searchContact(firstName, lastName);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bullhorn/check/company — deep company check
router.get('/check/company', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name required' });
    const data = await bh.checkCompany(name);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bullhorn/contact — create a contact
router.post('/contact', async (req, res) => {
  try {
    const data = await bh.createContact(req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bullhorn/note — add a note
router.post('/note', async (req, res) => {
  try {
    const { contactId, action, comments } = req.body;
    if (!contactId) return res.status(400).json({ error: 'contactId required' });
    const data = await bh.addNote(contactId, action, comments);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bullhorn/push/contact — push a tracked contact to Bullhorn
router.post('/push/contact', async (req, res) => {
  try {
    const { trackedContactId } = req.body;
    if (!trackedContactId) return res.status(400).json({ error: 'trackedContactId required' });

    // Load the tracked contact and its company
    const ctResult = await db.query(
      `SELECT tc.*, tco.name as company_name
       FROM tracked_contacts tc
       JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
       WHERE tc.id = $1`,
      [trackedContactId]
    );
    if (ctResult.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    const ct = ctResult.rows[0];

    // Check if already pushed
    if (ct.bullhorn_id) return res.json({ alreadySynced: true, bullhorn_id: ct.bullhorn_id });

    // Find the company in Bullhorn
    const companySearch = await bh.searchCompany(ct.company_name);
    if (!companySearch.data || companySearch.data.length === 0) {
      return res.status(404).json({ error: `Company "${ct.company_name}" not found in Bullhorn` });
    }
    const companyId = companySearch.data[0].id;

    // Split name into first/last
    const nameParts = ct.name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || nameParts[0];

    // Check if contact already exists in Bullhorn
    const existing = await bh.searchContact(firstName, lastName);
    if (existing.total > 0) {
      const bhId = existing.data[0].id;
      await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [bhId, trackedContactId]);
      return res.json({ alreadyExists: true, bullhorn_id: bhId });
    }

    // Create in Bullhorn
    const created = await bh.createContact({ firstName, lastName, companyId, title: ct.title, email: ct.email, phone: ct.phone });
    const newBhId = created.changedEntityId;

    // Update local record
    await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [newBhId, trackedContactId]);

    res.json({ created: true, bullhorn_id: newBhId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bullhorn/push/batch — push multiple tracked contacts
router.post('/push/batch', async (req, res) => {
  try {
    const { contactIds } = req.body;
    if (!contactIds || !Array.isArray(contactIds)) return res.status(400).json({ error: 'contactIds array required' });

    const results = [];
    for (const id of contactIds) {
      try {
        // Reuse the single push logic via internal fetch
        const ctResult = await db.query(
          `SELECT tc.*, tco.name as company_name
           FROM tracked_contacts tc
           JOIN tracked_companies tco ON tc.tracked_company_id = tco.id
           WHERE tc.id = $1`,
          [id]
        );
        if (ctResult.rows.length === 0) { results.push({ id, error: 'not found' }); continue; }
        const ct = ctResult.rows[0];

        if (ct.bullhorn_id) { results.push({ id, alreadySynced: true, bullhorn_id: ct.bullhorn_id }); continue; }

        const companySearch = await bh.searchCompany(ct.company_name);
        if (!companySearch.data || companySearch.data.length === 0) { results.push({ id, error: 'company not in BH' }); continue; }

        const nameParts = ct.name.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || nameParts[0];

        const existing = await bh.searchContact(firstName, lastName);
        if (existing.total > 0) {
          const bhId = existing.data[0].id;
          await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [bhId, id]);
          results.push({ id, alreadyExists: true, bullhorn_id: bhId });
          continue;
        }

        const created = await bh.createContact({ firstName, lastName, companyId: companySearch.data[0].id, title: ct.title, email: ct.email, phone: ct.phone });
        await db.query('UPDATE tracked_contacts SET bullhorn_id = $1, bullhorn_synced_at = NOW() WHERE id = $2', [created.changedEntityId, id]);
        results.push({ id, created: true, bullhorn_id: created.changedEntityId });

        // Small delay between creates
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.push({ id, error: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bullhorn/sync-day — end-of-day sync: push all unsynced activity to Bullhorn
router.post('/sync-day', async (req, res) => {
  try {
    // Get all unsynced activities that have a Bullhorn contact ID
    const unsyncedResult = await db.query(
      `SELECT al.*, tc.bullhorn_id, tc.name as contact_name
       FROM activity_log al
       JOIN tracked_contacts tc ON al.tracked_contact_id = tc.id
       WHERE al.synced_to_bullhorn = FALSE AND tc.bullhorn_id IS NOT NULL
       ORDER BY al.created_at ASC`
    );

    const activities = unsyncedResult.rows;
    if (activities.length === 0) return res.json({ synced: 0, message: 'Nothing to sync' });

    const results = [];
    for (const act of activities) {
      try {
        // Add note to Bullhorn
        const noteText = `[${act.action}] ${act.details || ''}`.trim();
        await bh.addNote(act.bullhorn_id, act.action, noteText);

        // Mark as synced
        await db.query('UPDATE activity_log SET synced_to_bullhorn = TRUE WHERE id = $1', [act.id]);
        results.push({ id: act.id, contact: act.contact_name, status: 'synced' });

        await new Promise(r => setTimeout(r, 200)); // small delay
      } catch (err) {
        results.push({ id: act.id, contact: act.contact_name, status: 'error', error: err.message });
      }
    }

    const synced = results.filter(r => r.status === 'synced').length;
    const errors = results.filter(r => r.status === 'error').length;
    res.json({ synced, errors, total: activities.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
