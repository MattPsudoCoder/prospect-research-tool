/* Tracker v1.1 — daily action board with Bullhorn sync + outreach templates */

const trackerList = document.getElementById('trackerList');
let bhConnected = false;
let claudeAvailable = false;

// Check what features are available
fetch('/api/features').then(r => r.json()).then(f => { claudeAvailable = f.claude_api; }).catch(() => {});

const STEPS = [
  { id: 0, label: 'Not started', channel: '', tip: '', actionKey: '' },
  { id: 1, label: '1. Connection request', channel: 'LinkedIn', tip: 'Warm the door — no pitch', actionKey: 'step1_linkedin_connect' },
  { id: 2, label: '2a. Intro (accepted)', channel: 'LinkedIn', tip: 'Personalised opener + question', actionKey: 'step2a_intro_accepted' },
  { id: 3, label: '2b. Intro (not accepted)', channel: 'LinkedIn', tip: 'Lead with relevance + CTA', actionKey: 'step2b_intro_not_accepted' },
  { id: 4, label: '3. Spec-in email', channel: 'Email', tip: 'Put a specific profile in front of them', actionKey: 'step3_email' },
  { id: 5, label: '4. Cold call', channel: 'Phone/SMS', tip: 'Break through the inbox', actionKey: 'step4_call_script' },
  { id: 6, label: '5. Value-add email', channel: 'Email', tip: 'Give before you ask again', actionKey: 'step5_email' },
  { id: 7, label: '6. LinkedIn follow-up', channel: 'LinkedIn', tip: 'Soft close + market insight', actionKey: 'step6_linkedin' },
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

// Set up the bookmarklet — grabs BH token and sends to our app
function setupBookmarklet() {
  const appUrl = window.location.origin;
  const code = `javascript:void((function(){var t=JSON.parse(localStorage.getItem('BhRestToken')),u=JSON.parse(localStorage.getItem('rawRestUrl'));if(!t||!u){alert('Not logged into Bullhorn');}else{fetch('${appUrl}/api/bullhorn/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bhRestToken:t,restUrl:u})}).then(r=>r.json()).then(d=>{if(d.connected)alert('Connected to Prospect Research!');else alert('Failed: '+(d.error||'unknown'));}).catch(e=>alert('Failed: '+e.message));}})())`;
  const el = document.getElementById('bhBookmarklet');
  if (el) el.href = code;
}

function renderBhBar(data) {
  const bar = document.getElementById('bhStatus');
  const help = document.getElementById('bhHelp');
  if (data.connected) {
    if (help) help.style.display = 'none';
    bar.innerHTML = `
      <span class="bh-dot connected"></span>
      <span class="bh-label">Bullhorn connected (${esc(data.method)})</span>
      <button class="btn-bh btn-sm" id="bhSyncDay" style="background:#27ae60">Sync Day to BH</button>
      <button class="btn btn-secondary btn-sm" id="bhDisconnect">Disconnect</button>
    `;
    document.getElementById('bhDisconnect').addEventListener('click', async () => {
      await fetch('/api/bullhorn/disconnect', { method: 'POST' });
      checkBhStatus();
      loadTracker();
    });
    document.getElementById('bhSyncDay').addEventListener('click', syncDayToBullhorn);
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
    if (help) { help.style.display = 'block'; setupBookmarklet(); }
    document.getElementById('bhConnect').addEventListener('click', async () => {
      const token = document.getElementById('bhToken').value.trim();
      const url = document.getElementById('bhRestUrl').value.trim();
      if (!token || !url) { alert('Paste both BhRestToken and restUrl'); return; }
      try {
        const res = await fetch('/api/bullhorn/token', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bhRestToken: token, restUrl: url }),
        });
        const data = await res.json();
        if (data.connected) { checkBhStatus(); loadTracker(); }
        else alert('Connection failed: ' + (data.error || 'unknown'));
      } catch (err) { alert('Connection failed: ' + err.message); }
    });
  }
}

async function syncDayToBullhorn() {
  const btn = document.getElementById('bhSyncDay');
  btn.disabled = true; btn.textContent = 'Syncing...';
  try {
    const res = await fetch('/api/bullhorn/sync-day', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    alert(`Synced ${data.synced} activities to Bullhorn. ${data.errors ? data.errors + ' errors.' : ''}`);
  } catch (err) { alert('Sync failed: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Sync Day to BH'; }
}

/* ── Tracker list ────────────────────────────────────────────── */

async function loadTracker() {
  try {
    const res = await fetch('/api/tracker');
    const companies = await res.json();

    if (companies.length === 0) {
      trackerList.innerHTML = '<div class="empty-state"><p>No tracked companies yet. Go to Prospects and click Track.</p></div>';
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
          <span><strong>ATS:</strong> ${c.ats_detected && c.ats_detected !== 'None' ? esc(c.ats_detected) : '—'}</span>
          <span><strong>Roles:</strong> ${formatRolesInline(c.roles_found)}</span>
          ${c.hiring_signals ? `<span><strong>Signals:</strong> ${esc(truncate(c.hiring_signals, 120))}</span>` : ''}
        </div>
        ${c.keywords ? `<div class="result-card-tags">${c.keywords.split(',').map(k => `<span class="tag">${esc(k.trim())}</span>`).join('')}</div>` : ''}
        <div class="contacts-section" id="contacts-${c.id}">
          <div class="contacts-header">
            <h4>Contacts</h4>
            <button class="btn btn-primary btn-sm btn-add-contact" data-company-id="${c.id}">+ Add Contact</button>
          </div>
          <div class="contacts-list" id="contacts-list-${c.id}"><p class="loading-text">Loading...</p></div>
        </div>
      `;
      trackerList.appendChild(card);
      loadContacts(c.id);
    }

    trackerList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this company and all contacts?')) return;
        await fetch(`/api/tracker/${btn.dataset.id}`, { method: 'DELETE' });
        loadTracker();
      });
    });
    trackerList.querySelectorAll('.btn-add-contact').forEach(btn => {
      btn.addEventListener('click', () => showAddContactForm(parseInt(btn.dataset.companyId)));
    });
    trackerList.querySelectorAll('.btn-push-all').forEach(btn => {
      btn.addEventListener('click', () => pushAllContacts(parseInt(btn.dataset.companyId)));
    });
  } catch (err) {
    trackerList.innerHTML = '<div class="empty-state"><p>Failed to load tracker.</p></div>';
  }
}

async function loadContacts(companyId) {
  const listEl = document.getElementById(`contacts-list-${companyId}`);
  try {
    const res = await fetch(`/api/tracker/${companyId}/contacts`);
    const contacts = await res.json();

    if (contacts.length === 0) {
      listEl.innerHTML = '<p class="empty-contacts">No contacts yet.</p>';
      return;
    }

    listEl.innerHTML = '';
    contacts.forEach(ct => {
      const step = STEPS[ct.outreach_step] || STEPS[0];
      const hasTemplates = ct.outreach_templates && Object.keys(ct.outreach_templates).length > 0;
      const row = document.createElement('div');
      row.className = 'contact-row';
      row.id = `contact-${ct.id}`;
      row.innerHTML = `
        <div class="contact-info">
          <div class="contact-name-row">
            <strong>${esc(ct.name)}</strong>
            ${ct.title ? `<span class="contact-title">${esc(ct.title)}</span>` : ''}
          </div>
          <div class="contact-details">
            ${ct.linkedin_url ? `<a href="${esc(ct.linkedin_url)}" target="_blank" class="contact-detail-link channel-linkedin">in</a>` : ''}
            ${ct.email ? `<a href="mailto:${esc(ct.email)}" class="contact-detail-link">${esc(ct.email)}</a>` : ''}
            ${ct.phone ? `<span class="contact-detail-text">${esc(ct.phone)}</span>` : ''}
          </div>
        </div>
        <div class="contact-step">
          <select class="step-select" data-contact-id="${ct.id}" data-company-id="${companyId}">
            ${STEPS.map(s => `<option value="${s.id}" ${s.id === ct.outreach_step ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          ${step.id > 0 ? `<span class="step-tip"><span class="step-channel">${esc(step.channel)}</span> ${esc(step.tip)}</span>` : ''}
        </div>
        <div class="contact-actions">
          ${hasTemplates ? `<button class="btn-bh btn-bh-note btn-sm btn-show-all-templates" data-contact-id="${ct.id}">View Scripts</button>` : ''}
          ${!hasTemplates && claudeAvailable ? `<button class="btn-bh btn-sm btn-gen-templates" data-contact-id="${ct.id}" data-company-id="${companyId}" style="background:#9b59b6">Generate Scripts</button>` : ''}
          ${bhConnected ? bhButton(ct) : ''}
          <button class="btn btn-secondary btn-sm btn-edit-contact" data-contact-id="${ct.id}" data-company-id="${companyId}">Edit</button>
          <button class="btn btn-danger btn-sm btn-del-contact" data-contact-id="${ct.id}" data-company-id="${companyId}">X</button>
        </div>
      `;
      listEl.appendChild(row);
    });

    // Step change → advance with activity log
    listEl.querySelectorAll('.step-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const contactId = parseInt(sel.dataset.contactId);
        const newStep = parseInt(sel.value);
        const stepInfo = STEPS[newStep];
        await fetch(`/api/tracker/contacts/${contactId}/advance-step`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: newStep, action_taken: stepInfo.label, details: `${stepInfo.channel}: ${stepInfo.tip}` }),
        });
        loadContacts(parseInt(sel.dataset.companyId));
      });
    });

    // Delete
    listEl.querySelectorAll('.btn-del-contact').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this contact?')) return;
        await fetch(`/api/tracker/contacts/${btn.dataset.contactId}`, { method: 'DELETE' });
        loadContacts(parseInt(btn.dataset.companyId));
      });
    });

    // Edit
    listEl.querySelectorAll('.btn-edit-contact').forEach(btn => {
      btn.addEventListener('click', () => {
        const ct = contacts.find(c => c.id === parseInt(btn.dataset.contactId));
        if (ct) showEditContactForm(ct, parseInt(btn.dataset.companyId));
      });
    });

    // Push to BH
    listEl.querySelectorAll('.btn-push-bh').forEach(btn => {
      btn.addEventListener('click', () => pushContact(parseInt(btn.dataset.contactId), parseInt(btn.dataset.companyId)));
    });

    // Add Note to BH
    listEl.querySelectorAll('.btn-bh-add-note').forEach(btn => {
      btn.addEventListener('click', () => showNoteForm(parseInt(btn.dataset.contactId), parseInt(btn.dataset.bhId), parseInt(btn.dataset.companyId)));
    });

    // Generate outreach templates
    listEl.querySelectorAll('.btn-gen-templates').forEach(btn => {
      btn.addEventListener('click', () => generateTemplates(parseInt(btn.dataset.contactId), parseInt(btn.dataset.companyId)));
    });

    // View all scripts
    listEl.querySelectorAll('.btn-show-all-templates').forEach(btn => {
      btn.addEventListener('click', () => showAllTemplates(parseInt(btn.dataset.contactId), contacts));
    });
  } catch (err) {
    listEl.innerHTML = '<p class="empty-contacts">Failed to load contacts.</p>';
  }
}

/* ── Outreach templates ──────────────────────────────────────── */

async function generateTemplates(contactId, companyId) {
  const btn = document.querySelector(`.btn-gen-templates[data-contact-id="${contactId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  try {
    await fetch(`/api/tracker/contacts/${contactId}/generate-outreach`, { method: 'POST' });
    loadContacts(companyId);
  } catch (err) {
    alert('Failed to generate templates: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Scripts'; }
  }
}

// Template key display order — maps template keys to friendly labels
const TEMPLATE_STEPS = [
  { key: 'step1_linkedin_connect', label: '1. LinkedIn connection request', channel: 'LinkedIn' },
  { key: 'step2a_intro_accepted', label: '2a. Intro (accepted)', channel: 'LinkedIn' },
  { key: 'step2b_intro_not_accepted', label: '2b. Intro (not accepted)', channel: 'LinkedIn' },
  { key: 'step3_email', label: '3. Spec-in email', channel: 'Email' },
  { key: 'step4_call_script', label: '4. Cold call script', channel: 'Phone' },
  { key: 'step4_voicemail', label: '4. Voicemail', channel: 'Phone' },
  { key: 'step4_followup_text', label: '4. Follow-up text', channel: 'SMS' },
  { key: 'step5_email', label: '5. Value-add email', channel: 'Email' },
  { key: 'step6_linkedin', label: '6. LinkedIn follow-up', channel: 'LinkedIn' },
];

function showAllTemplates(contactId, contacts) {
  const ct = contacts.find(c => c.id === contactId);
  if (!ct || !ct.outreach_templates) return;
  const templates = ct.outreach_templates;

  const row = document.getElementById(`contact-${contactId}`);
  if (!row) return;

  // Toggle
  const existing = row.querySelector('.template-display');
  if (existing) { existing.remove(); return; }

  const viewBtn = row.querySelector('.btn-show-all-templates');
  if (viewBtn) viewBtn.style.display = 'none';

  const div = document.createElement('div');
  div.className = 'template-display';
  div.style.cssText = 'background:#f8f9fa;padding:16px;margin-top:8px;border-radius:6px;border:1px solid #e2e4ea;font-size:13px;position:relative;';

  let html = `<button class="btn btn-secondary btn-sm template-close" style="position:absolute;top:8px;right:8px;">Close</button>`;
  html += `<strong style="font-size:15px;">${esc(ct.name)} — Outreach Scripts</strong>`;

  for (const ts of TEMPLATE_STEPS) {
    const content = templates[ts.key];
    if (!content) continue;

    html += `<div style="margin-top:14px;padding:12px;background:#fff;border:1px solid #e2e4ea;border-radius:6px;">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">`;
    html += `<strong>${esc(ts.label)}</strong>`;
    html += `<span style="font-size:11px;color:#6b7085;font-weight:600;">${esc(ts.channel)}</span>`;
    html += `</div>`;
    html += `<hr style="margin:0 0 8px;border-color:#e2e4ea;">`;
    html += `<div class="template-content" style="white-space:pre-wrap;line-height:1.6;">${formatTemplateContent(content, ts.channel)}</div>`;
    html += `<button class="btn btn-primary btn-sm copy-btn" style="margin-top:8px;" data-content="${escAttr(content)}">Copy</button>`;
    html += `</div>`;
  }

  div.innerHTML = html;
  row.appendChild(div);

  div.querySelector('.template-close').addEventListener('click', () => {
    div.remove();
    if (viewBtn) viewBtn.style.display = '';
  });

  div.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.content);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });
}

function formatTemplateContent(content, channel) {
  if (!content) return '';
  // For emails, try to separate subject line from body
  if (channel === 'Email') {
    const subjectMatch = content.match(/^(?:Subject:\s*)(.*?)(?:\n\n|\n)/i);
    if (subjectMatch) {
      const subject = subjectMatch[1].trim();
      const body = content.slice(subjectMatch[0].length).trim();
      return `<div style="font-weight:600;color:#2c2f3e;margin-bottom:8px;">Subject: ${esc(subject)}</div><div>${esc(body)}</div>`;
    }
  }
  return esc(content);
}

function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Bullhorn buttons ────────────────────────────────────────── */

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackedContactId: contactId }),
    });
    const data = await res.json();
    if (data.error) { alert('Push failed: ' + data.error); return; }
    loadContacts(companyId);
  } catch (err) { alert('Push failed: ' + err.message); }
}

async function pushAllContacts(companyId) {
  try {
    const res = await fetch(`/api/tracker/${companyId}/contacts`);
    const contacts = await res.json();
    const unsynced = contacts.filter(c => !c.bullhorn_id);
    if (unsynced.length === 0) { alert('All contacts already in Bullhorn.'); return; }
    const batchRes = await fetch('/api/bullhorn/push/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactIds: unsynced.map(c => c.id) }),
    });
    const data = await batchRes.json();
    alert(`Pushed ${data.results?.filter(r => r.created).length || 0} new, ${data.results?.filter(r => r.alreadyExists).length || 0} existing.`);
    loadContacts(companyId);
  } catch (err) { alert('Batch push failed: ' + err.message); }
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
    await fetch('/api/bullhorn/note', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: bhId, action: 'BD Call', comments: text }),
    });
    // Also log locally
    await fetch('/api/tracker/activity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracked_contact_id: contactId, bullhorn_contact_id: bhId, action: 'Note', details: text }),
    });
    form.remove();
    alert('Note added');
  });
  form.querySelector('.note-text').focus();
}

/* ── Add / Edit forms ────────────────────────────────────────── */

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
    await fetch(`/api/tracker/${companyId}/contacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, title: form.querySelector('.cf-title').value.trim(),
        linkedin_url: form.querySelector('.cf-linkedin').value.trim(),
        email: form.querySelector('.cf-email').value.trim(),
        phone: form.querySelector('.cf-phone').value.trim(),
      }),
    });
    loadContacts(companyId);
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
    await fetch(`/api/tracker/contacts/${ct.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, title: row.querySelector('.cf-title').value.trim(),
        linkedin_url: row.querySelector('.cf-linkedin').value.trim(),
        email: row.querySelector('.cf-email').value.trim(),
        phone: row.querySelector('.cf-phone').value.trim(),
      }),
    });
    loadContacts(companyId);
  });
}

/* ── Helpers ──────────────────────────────────────────────────── */

function formatRolesInline(rolesStr) {
  if (!rolesStr) return '—';
  try {
    const roles = JSON.parse(rolesStr);
    if (Array.isArray(roles) && roles.length > 0) {
      return roles.map(r => {
        if (typeof r === 'object' && r.title) return r.url ? `<a href="${esc(r.url)}" target="_blank" class="role-link">${esc(r.title)}</a>` : esc(r.title);
        return esc(String(r));
      }).join(', ');
    }
  } catch {}
  return esc(rolesStr) || '—';
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

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max).replace(/,?\s*$/, '') + '…';
}

/* ── Init ─────────────────────────────────────────────────────── */
checkBhStatus();
loadTracker();

// Listen for bookmarklet connection from Bullhorn tab
window.addEventListener('focus', () => {
  if (!bhConnected) checkBhStatus();
});
