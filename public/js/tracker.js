/* Tracker page — companies + contacts with outreach step pipeline + Bullhorn sync */

const trackerList = document.getElementById('trackerList');
let bhConnected = false;

const STEPS = [
  { id: 0, label: 'Not started', channel: '', tip: '' },
  { id: 1, label: '1. Connection request', channel: 'LinkedIn', tip: 'Warm the door — no pitch' },
  { id: 2, label: '2a. Intro (accepted)', channel: 'LinkedIn', tip: 'Personalised opener + question' },
  { id: 3, label: '2b. Intro (not accepted)', channel: 'LinkedIn', tip: 'Lead with relevance + CTA' },
  { id: 4, label: '3. Spec-in email', channel: 'Email', tip: 'Put a specific profile in front of them' },
  { id: 5, label: '4. Cold call + follow-up', channel: 'Phone/SMS', tip: 'Break through the inbox' },
  { id: 6, label: '5. Value-add email', channel: 'Email', tip: 'Give before you ask again' },
  { id: 7, label: '6. LinkedIn follow-up', channel: 'LinkedIn', tip: 'Soft close + market insight' },
];

/* ── Bullhorn connection bar ─────────────────────────────────── */

async function checkBhStatus() {
  try {
    const res = await fetch('/api/bullhorn/status');
    const data = await res.json();
    bhConnected = data.connected;
    renderBhBar(data);
  } catch {
    bhConnected = false;
    renderBhBar({ connected: false, method: 'none' });
  }
}

function renderBhBar(data) {
  const bar = document.getElementById('bhStatus');
  if (data.connected) {
    bar.innerHTML = `
      <span class="bh-dot connected"></span>
      <span class="bh-label">Bullhorn connected (${esc(data.method)})</span>
      <button class="btn btn-secondary btn-sm" id="bhDisconnect">Disconnect</button>
    `;
    document.getElementById('bhDisconnect').addEventListener('click', async () => {
      await fetch('/api/bullhorn/disconnect', { method: 'POST' });
      checkBhStatus();
      loadTracker();
    });
  } else {
    bar.innerHTML = `
      <span class="bh-dot disconnected"></span>
      <span class="bh-label">Bullhorn</span>
      <div class="bh-connect-form">
        <input type="text" id="bhToken" placeholder="BhRestToken">
        <input type="text" id="bhRestUrl" placeholder="restUrl (https://rest...)">
        <button class="btn-bh" id="bhConnect">Connect</button>
      </div>
    `;
    document.getElementById('bhConnect').addEventListener('click', async () => {
      const token = document.getElementById('bhToken').value.trim();
      const url = document.getElementById('bhRestUrl').value.trim();
      if (!token || !url) { alert('Paste both BhRestToken and restUrl from Bullhorn localStorage'); return; }
      try {
        const res = await fetch('/api/bullhorn/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bhRestToken: token, restUrl: url }),
        });
        const data = await res.json();
        if (data.connected) {
          checkBhStatus();
          loadTracker();
        } else {
          alert('Connection failed: ' + (data.error || 'unknown'));
        }
      } catch (err) {
        alert('Connection failed: ' + err.message);
      }
    });
  }
}

/* ── Tracker list ────────────────────────────────────────────── */

async function loadTracker() {
  try {
    const res = await fetch('/api/tracker');
    const companies = await res.json();

    if (companies.length === 0) {
      trackerList.innerHTML = '<div class="empty-state"><p>No tracked companies yet. Go to Prospects and click Track on companies you want to pursue.</p></div>';
      return;
    }

    trackerList.innerHTML = '';
    for (const c of companies) {
      const card = document.createElement('div');
      card.className = 'tracker-card';
      card.id = `company-${c.id}`;
      card.innerHTML = `
        <div class="result-card-header">
          <h3>${esc(c.name)}</h3>
          <div class="result-card-badges">
            ${signalBadge(c.signal_strength)}
            ${bhConnected ? `<button class="btn-bh btn-bh-push btn-sm btn-push-all" data-company-id="${c.id}">Push All to BH</button>` : ''}
            <button class="btn btn-danger btn-sm btn-remove" data-id="${c.id}">Remove</button>
          </div>
        </div>
        <div class="result-card-meta">
          <span><strong>ATS:</strong> ${esc(c.ats_detected)}</span>
          <span><strong>Roles:</strong> ${formatRolesInline(c.roles_found)}</span>
        </div>
        <div class="contacts-section" id="contacts-${c.id}">
          <div class="contacts-header">
            <h4>Contacts</h4>
            <button class="btn btn-primary btn-sm btn-add-contact" data-company-id="${c.id}">+ Add Contact</button>
          </div>
          <div class="contacts-list" id="contacts-list-${c.id}">
            <p class="loading-text">Loading...</p>
          </div>
        </div>
      `;
      trackerList.appendChild(card);
      loadContacts(c.id);
    }

    // Remove company handlers
    trackerList.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this company and all its contacts from tracker?')) return;
        try {
          await fetch(`/api/tracker/${btn.dataset.id}`, { method: 'DELETE' });
          loadTracker();
        } catch { alert('Failed to remove.'); }
      });
    });

    // Add contact handlers
    trackerList.querySelectorAll('.btn-add-contact').forEach((btn) => {
      btn.addEventListener('click', () => showAddContactForm(parseInt(btn.dataset.companyId)));
    });

    // Push All handlers
    trackerList.querySelectorAll('.btn-push-all').forEach((btn) => {
      btn.addEventListener('click', () => pushAllContacts(parseInt(btn.dataset.companyId)));
    });
  } catch (err) {
    trackerList.innerHTML = '<div class="empty-state"><p>Failed to load tracker.</p></div>';
    console.error(err);
  }
}

async function loadContacts(companyId) {
  const listEl = document.getElementById(`contacts-list-${companyId}`);
  try {
    const res = await fetch(`/api/tracker/${companyId}/contacts`);
    const contacts = await res.json();

    if (contacts.length === 0) {
      listEl.innerHTML = '<p class="empty-contacts">No contacts yet. Add someone to start outreach.</p>';
      return;
    }

    listEl.innerHTML = '';
    contacts.forEach((ct) => {
      const step = STEPS[ct.outreach_step] || STEPS[0];
      const row = document.createElement('div');
      row.className = 'contact-row';
      row.id = `contact-${ct.id}`;
      row.innerHTML = `
        <div class="contact-info">
          <div class="contact-name-row">
            <strong>${esc(ct.name)}</strong>
            ${ct.title ? `<span class="contact-title">${esc(ct.title)}</span>` : ''}
          </div>
          <div class="contact-channels">
            ${ct.linkedin_url ? `<a href="${esc(ct.linkedin_url)}" target="_blank" rel="noopener" class="channel-link channel-linkedin" title="LinkedIn">in</a>` : ''}
            ${ct.email ? `<a href="mailto:${esc(ct.email)}" class="channel-link channel-email" title="${esc(ct.email)}">@</a>` : ''}
            ${ct.phone ? `<span class="channel-link channel-phone" title="${esc(ct.phone)}">Ph</span>` : ''}
          </div>
        </div>
        <div class="contact-step">
          <select class="step-select" data-contact-id="${ct.id}">
            ${STEPS.map((s) => `<option value="${s.id}" ${s.id === ct.outreach_step ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          ${step.id > 0 ? `<span class="step-tip"><span class="step-channel">${esc(step.channel)}</span> ${esc(step.tip)}</span>` : ''}
        </div>
        <div class="contact-actions">
          ${bhConnected ? bhButton(ct) : ''}
          <button class="btn btn-secondary btn-sm btn-edit-contact" data-contact-id="${ct.id}" data-company-id="${companyId}">Edit</button>
          <button class="btn btn-danger btn-sm btn-del-contact" data-contact-id="${ct.id}" data-company-id="${companyId}">X</button>
        </div>
      `;
      listEl.appendChild(row);
    });

    // Step change handlers
    listEl.querySelectorAll('.step-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await fetch(`/api/tracker/contacts/${sel.dataset.contactId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outreach_step: parseInt(sel.value) }),
        });
        loadContacts(companyId);
      });
    });

    // Delete contact handlers
    listEl.querySelectorAll('.btn-del-contact').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this contact?')) return;
        await fetch(`/api/tracker/contacts/${btn.dataset.contactId}`, { method: 'DELETE' });
        loadContacts(parseInt(btn.dataset.companyId));
      });
    });

    // Edit contact handlers
    listEl.querySelectorAll('.btn-edit-contact').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ct = contacts.find((c) => c.id === parseInt(btn.dataset.contactId));
        if (ct) showEditContactForm(ct, parseInt(btn.dataset.companyId));
      });
    });

    // Push to BH handlers
    listEl.querySelectorAll('.btn-push-bh').forEach((btn) => {
      btn.addEventListener('click', () => pushContact(parseInt(btn.dataset.contactId), parseInt(btn.dataset.companyId)));
    });

    // Add Note to BH handlers
    listEl.querySelectorAll('.btn-bh-add-note').forEach((btn) => {
      btn.addEventListener('click', () => showNoteForm(parseInt(btn.dataset.contactId), parseInt(btn.dataset.bhId), parseInt(btn.dataset.companyId)));
    });
  } catch (err) {
    listEl.innerHTML = '<p class="empty-contacts">Failed to load contacts.</p>';
  }
}

/* ── Bullhorn buttons per contact ────────────────────────────── */

function bhButton(ct) {
  if (ct.bullhorn_id) {
    return `<button class="btn-bh btn-bh-synced btn-sm" disabled>In BH</button>
            <button class="btn-bh btn-bh-note btn-sm btn-bh-add-note" data-contact-id="${ct.id}" data-bh-id="${ct.bullhorn_id}" data-company-id="${ct.tracked_company_id}">Note</button>`;
  }
  return `<button class="btn-bh btn-bh-push btn-sm btn-push-bh" data-contact-id="${ct.id}" data-company-id="${ct.tracked_company_id}">Push to BH</button>`;
}

async function pushContact(contactId, companyId) {
  try {
    const res = await fetch('/api/bullhorn/push/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackedContactId: contactId }),
    });
    const data = await res.json();
    if (data.error) { alert('Push failed: ' + data.error); return; }
    loadContacts(companyId);
  } catch (err) {
    alert('Push failed: ' + err.message);
  }
}

async function pushAllContacts(companyId) {
  try {
    const res = await fetch(`/api/tracker/${companyId}/contacts`);
    const contacts = await res.json();
    const unsynced = contacts.filter(c => !c.bullhorn_id);
    if (unsynced.length === 0) { alert('All contacts already in Bullhorn.'); return; }

    const batchRes = await fetch('/api/bullhorn/push/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: unsynced.map(c => c.id) }),
    });
    const data = await batchRes.json();
    const created = data.results?.filter(r => r.created).length || 0;
    const existing = data.results?.filter(r => r.alreadyExists).length || 0;
    const errors = data.results?.filter(r => r.error).length || 0;
    alert(`Pushed ${created} new, ${existing} already existed, ${errors} errors`);
    loadContacts(companyId);
  } catch (err) {
    alert('Batch push failed: ' + err.message);
  }
}

function showNoteForm(contactId, bhId, companyId) {
  const row = document.getElementById(`contact-${contactId}`);
  if (!row || row.querySelector('.bh-note-form')) return;

  const form = document.createElement('div');
  form.className = 'bh-note-form';
  form.innerHTML = `
    <input type="text" class="note-text" placeholder="Note text...">
    <button class="btn-bh btn-bh-note btn-sm note-save">Add</button>
    <button class="btn btn-secondary btn-sm note-cancel">X</button>
  `;
  row.appendChild(form);

  form.querySelector('.note-cancel').addEventListener('click', () => form.remove());
  form.querySelector('.note-save').addEventListener('click', async () => {
    const text = form.querySelector('.note-text').value.trim();
    if (!text) return;
    try {
      await fetch('/api/bullhorn/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: bhId, action: 'BD Call', comments: text }),
      });
      form.remove();
      alert('Note added to Bullhorn');
    } catch (err) {
      alert('Failed to add note: ' + err.message);
    }
  });

  form.querySelector('.note-text').focus();
}

/* ── Add / Edit contact forms ────────────────────────────────── */

function showAddContactForm(companyId) {
  const listEl = document.getElementById(`contacts-list-${companyId}`);
  if (listEl.querySelector('.contact-form')) return;

  const form = document.createElement('div');
  form.className = 'contact-form';
  form.innerHTML = `
    <div class="contact-form-row">
      <input type="text" class="cf-name" placeholder="Name *" required>
      <input type="text" class="cf-title" placeholder="Job title">
    </div>
    <div class="contact-form-row">
      <input type="text" class="cf-linkedin" placeholder="LinkedIn URL">
      <input type="email" class="cf-email" placeholder="Email">
      <input type="text" class="cf-phone" placeholder="Phone">
    </div>
    <div class="contact-form-actions">
      <button class="btn btn-primary btn-sm cf-save">Add Contact</button>
      <button class="btn btn-secondary btn-sm cf-cancel">Cancel</button>
    </div>
  `;
  listEl.prepend(form);

  form.querySelector('.cf-cancel').addEventListener('click', () => form.remove());
  form.querySelector('.cf-save').addEventListener('click', async () => {
    const name = form.querySelector('.cf-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    try {
      await fetch(`/api/tracker/${companyId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          title: form.querySelector('.cf-title').value.trim(),
          linkedin_url: form.querySelector('.cf-linkedin').value.trim(),
          email: form.querySelector('.cf-email').value.trim(),
          phone: form.querySelector('.cf-phone').value.trim(),
        }),
      });
      loadContacts(companyId);
    } catch (err) {
      alert('Failed to add contact.');
    }
  });

  form.querySelector('.cf-name').focus();
}

function showEditContactForm(ct, companyId) {
  const row = document.getElementById(`contact-${ct.id}`);
  if (!row) return;

  row.innerHTML = `
    <div class="contact-form inline">
      <div class="contact-form-row">
        <input type="text" class="cf-name" value="${esc(ct.name)}" placeholder="Name *">
        <input type="text" class="cf-title" value="${esc(ct.title)}" placeholder="Job title">
      </div>
      <div class="contact-form-row">
        <input type="text" class="cf-linkedin" value="${esc(ct.linkedin_url)}" placeholder="LinkedIn URL">
        <input type="email" class="cf-email" value="${esc(ct.email)}" placeholder="Email">
        <input type="text" class="cf-phone" value="${esc(ct.phone)}" placeholder="Phone">
      </div>
      <div class="contact-form-actions">
        <button class="btn btn-primary btn-sm cf-save">Save</button>
        <button class="btn btn-secondary btn-sm cf-cancel">Cancel</button>
      </div>
    </div>
  `;

  row.querySelector('.cf-cancel').addEventListener('click', () => loadContacts(companyId));
  row.querySelector('.cf-save').addEventListener('click', async () => {
    const name = row.querySelector('.cf-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    try {
      await fetch(`/api/tracker/contacts/${ct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          title: row.querySelector('.cf-title').value.trim(),
          linkedin_url: row.querySelector('.cf-linkedin').value.trim(),
          email: row.querySelector('.cf-email').value.trim(),
          phone: row.querySelector('.cf-phone').value.trim(),
        }),
      });
      loadContacts(companyId);
    } catch (err) {
      alert('Failed to update contact.');
    }
  });
}

/* ── Helpers ──────────────────────────────────────────────────── */

function formatRolesInline(rolesStr) {
  if (!rolesStr) return '<em>None</em>';
  try {
    const roles = JSON.parse(rolesStr);
    if (Array.isArray(roles) && roles.length > 0) {
      return roles.map((r) => {
        if (typeof r === 'object' && r.title) {
          return r.url
            ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="role-link">${esc(r.title)}</a>`
            : esc(r.title);
        }
        return esc(String(r));
      }).join(', ');
    }
  } catch {}
  return esc(rolesStr) || '<em>None</em>';
}

function signalBadge(strength) {
  const s = (strength || 'Low').toLowerCase();
  return `<span class="badge badge-${s}">${strength || 'Low'}</span>`;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ── Init ─────────────────────────────────────────────────────── */

checkBhStatus();
loadTracker();
