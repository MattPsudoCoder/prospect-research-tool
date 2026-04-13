/* Tracker v1.1 — daily action board with Bullhorn sync + outreach templates */

const trackerList = document.getElementById('trackerList');
let bhConnected = false;
let claudeAvailable = false;
let allCompanies = [];
const contactsCache = {};

/* ── Filter controls ────────────────────────────────────────── */
const trackerSearch = document.getElementById('trackerSearch');
const trackerStepFilter = document.getElementById('trackerStepFilter');
const trackerSignalFilter = document.getElementById('trackerSignalFilter');
const trackerSort = document.getElementById('trackerSort');
const trackerResultCount = document.getElementById('trackerResultCount');

// Check what features are available
fetch('/api/features').then(r => r.json()).then(f => { claudeAvailable = f.claude_api; }).catch(() => {});

const STEPS = [
  { id: 0, label: 'Not started', channel: '', tip: '', actionKey: '', bhAction: '' },
  { id: 1, label: '1. Connection request', channel: 'LinkedIn', tip: 'Warm the door — no pitch', actionKey: 'step1_linkedin_connect', bhAction: 'BD Message' },
  { id: 2, label: '2a. Intro (accepted)', channel: 'LinkedIn', tip: 'Personalised opener + question', actionKey: 'step2a_intro_accepted', bhAction: 'BD Message' },
  { id: 3, label: '2b. Intro (not accepted)', channel: 'LinkedIn', tip: 'Lead with relevance + CTA', actionKey: 'step2b_intro_not_accepted', bhAction: 'BD Message' },
  { id: 4, label: '3. Spec-in email', channel: 'Email', tip: 'Put a specific profile in front of them', actionKey: 'step3_email', bhAction: 'Reverse Market' },
  { id: 5, label: '4. Cold call', channel: 'Phone/SMS', tip: 'Break through the inbox', actionKey: 'step4_call_script', bhAction: 'Attempted BD Call' },
  { id: 6, label: '5. Value-add email', channel: 'Email', tip: 'Give before you ask again', actionKey: 'step5_email', bhAction: 'Reverse Market' },
  { id: 7, label: '6. LinkedIn follow-up', channel: 'LinkedIn', tip: 'Soft close + market insight', actionKey: 'step6_linkedin', bhAction: 'Reverse Market' },
];

// Populate step filter dropdown
if (trackerStepFilter) {
  STEPS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    trackerStepFilter.appendChild(opt);
  });
}

function applyFilters() {
  const search = (trackerSearch ? trackerSearch.value : '').toLowerCase().trim();
  const stepVal = trackerStepFilter ? trackerStepFilter.value : '';
  const signalVal = trackerSignalFilter ? trackerSignalFilter.value : '';
  let visible = 0;

  const activeCompanies = allCompanies.filter(c => c.status !== 'Dropped');
  for (const c of activeCompanies) {
    const card = document.getElementById(`company-${c.id}`);
    if (!card) continue;

    let show = true;

    // Name search
    if (search && !c.name.toLowerCase().includes(search)) show = false;

    // Signal strength filter
    if (show && signalVal && c.signal_strength !== signalVal) show = false;

    // Step filter — company must have at least one contact at this step
    if (show && stepVal !== '') {
      const contacts = contactsCache[c.id];
      if (contacts) {
        const stepNum = parseInt(stepVal);
        if (!contacts.some(ct => ct.outreach_step === stepNum)) show = false;
      }
      // If contacts haven't loaded yet, don't filter out
    }

    card.style.display = show ? '' : 'none';
    if (show) visible++;
  }

  if (trackerResultCount) {
    if (search || stepVal !== '' || signalVal) {
      trackerResultCount.textContent = `${visible} of ${activeCompanies.length} companies`;
    } else {
      trackerResultCount.textContent = `${activeCompanies.length} companies`;
    }
  }
}

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
      if (!token || !url) { alert('Ask Claude Code to connect Bullhorn — it grabs the token from your browser automatically.'); return; }
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
    allCompanies = await res.json();

    if (allCompanies.length === 0) {
      trackerList.innerHTML = '<div class="empty-state"><p>No tracked companies yet. Go to Prospects and click Track.</p></div>';
      if (trackerResultCount) trackerResultCount.textContent = '';
      return;
    }

    trackerList.innerHTML = '';
    for (const c of allCompanies) {
      if (c.status === 'Dropped') continue;
      const card = document.createElement('div');
      card.className = 'tracker-card';
      card.id = `company-${c.id}`;
      card.innerHTML = `
        <div class="result-card-header">
          <h3><span class="star-toggle ${c.favorite ? 'starred' : ''}" id="star-${c.id}" data-company-id="${c.id}">${c.favorite ? '\u2605' : '\u2606'}</span>${c.website ? `<a href="${c.website.startsWith('http') ? esc(c.website) : 'https://' + esc(c.website)}" target="_blank" rel="noopener" class="company-name-link">${esc(c.name)}</a>` : esc(c.name)}${c.company_linkedin ? `<a href="${esc(c.company_linkedin)}" target="_blank" rel="noopener" class="company-li-btn" title="LinkedIn">in</a>` : ''}</h3>
          <div class="result-card-badges">
            ${signalBadge(c.signal_strength)}
            ${claudeAvailable ? `<button class="btn-bh btn-sm btn-gen-all" data-company-id="${c.id}" style="background:#9b59b6">Generate All Scripts</button>` : ''}
            ${bhConnected ? `<button class="btn-bh btn-bh-push btn-sm btn-push-all" data-company-id="${c.id}">Push All to BH</button>` : ''}
            <button class="btn btn-danger btn-sm btn-remove" data-id="${c.id}">Remove</button>
          </div>
        </div>
        <div class="result-card-meta">
          <span><strong>ATS:</strong> ${c.ats_detected && c.ats_detected !== 'None' ? esc(c.ats_detected) : '—'}</span>
          <span><strong>Roles:</strong> ${formatRolesInline(c.roles_found)}</span>
          ${c.hiring_signals ? `<span><strong>Signals:</strong> ${esc(c.hiring_signals)}</span>` : ''}
          <span class="tracker-date"><strong>Added:</strong> ${formatCentralDate(c.created_at)}</span>
        </div>
        ${c.keywords ? `<div class="result-card-tags">${c.keywords.split(',').map(k => `<span class="tag">${esc(k.trim())}</span>`).join('')}</div>` : ''}
        <div class="contacts-section" id="contacts-${c.id}">
          <div class="contacts-header contacts-toggle" data-company-id="${c.id}" style="cursor:pointer;user-select:none">
            <h4><span class="toggle-chevron" id="chevron-${c.id}">&#9654;</span> Contacts <span class="contact-count-badge" id="count-${c.id}"></span></h4>
            <button class="btn btn-primary btn-sm btn-add-contact" data-company-id="${c.id}">+ Add Contact</button>
          </div>
          <div class="contacts-list" id="contacts-list-${c.id}" style="display:none"><p class="loading-text">Loading...</p></div>
        </div>
      `;
      trackerList.appendChild(card);
      loadContacts(c.id);
    }

    trackerList.querySelectorAll('.star-toggle').forEach(star => {
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(parseInt(star.dataset.companyId));
      });
    });
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
    trackerList.querySelectorAll('.btn-gen-all').forEach(btn => {
      btn.addEventListener('click', () => generateBatchTemplates(parseInt(btn.dataset.companyId), btn));
    });
    trackerList.querySelectorAll('.btn-push-all').forEach(btn => {
      btn.addEventListener('click', () => pushAllContacts(parseInt(btn.dataset.companyId)));
    });
    trackerList.querySelectorAll('.contacts-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        if (e.target.closest('.btn-add-contact')) return;
        const cid = toggle.dataset.companyId;
        const list = document.getElementById(`contacts-list-${cid}`);
        const chevron = document.getElementById(`chevron-${cid}`);
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? '' : 'none';
        chevron.innerHTML = isHidden ? '&#9660;' : '&#9654;';
      });
    });

    applyFilters();
  } catch (err) {
    trackerList.innerHTML = '<div class="empty-state"><p>Failed to load tracker.</p></div>';
  }
}

async function loadContacts(companyId) {
  const listEl = document.getElementById(`contacts-list-${companyId}`);
  try {
    const res = await fetch(`/api/tracker/${companyId}/contacts`);
    const contacts = await res.json();
    contactsCache[companyId] = contacts;
    const countBadge = document.getElementById(`count-${companyId}`);
    if (countBadge) countBadge.textContent = `(${contacts.length})`;

    if (contacts.length === 0) {
      listEl.innerHTML = '<p class="empty-contacts">No contacts yet.</p>';
      applyFilters();
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
          ${stepActionButton(ct, step)}
          ${hasTemplates ? `<button class="btn-bh btn-bh-note btn-sm btn-show-all-templates" data-contact-id="${ct.id}">View Scripts</button>` : ''}
          ${!hasTemplates && claudeAvailable ? `<button class="btn-bh btn-sm btn-gen-templates" data-contact-id="${ct.id}" data-company-id="${companyId}" style="background:#9b59b6">Generate Scripts</button>` : ''}
          ${bhConnected ? bhButton(ct) : ''}
          <button class="btn btn-secondary btn-sm btn-edit-contact" data-contact-id="${ct.id}" data-company-id="${companyId}">Edit</button>
          <button class="btn btn-danger btn-sm btn-del-contact" data-contact-id="${ct.id}" data-company-id="${companyId}">X</button>
        </div>
      `;
      listEl.appendChild(row);
    });

    // Step change → advance with activity log + BH action type
    listEl.querySelectorAll('.step-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const contactId = parseInt(sel.dataset.contactId);
        const newStep = parseInt(sel.value);
        const stepInfo = STEPS[newStep];
        await fetch(`/api/tracker/contacts/${contactId}/advance-step`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: newStep,
            action_taken: stepInfo.bhAction || stepInfo.label,
            details: `${stepInfo.label} — ${stepInfo.channel}`,
            bh_action: stepInfo.bhAction,
          }),
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

    applyFilters();
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

async function generateBatchTemplates(companyId, btn) {
  btn.disabled = true; btn.textContent = 'Generating...';
  try {
    const res = await fetch(`/api/tracker/${companyId}/generate-batch-outreach`, { method: 'POST' });
    const data = await res.json();
    if (data.error) { alert(data.error); return; }
    alert(`${data.message}`);
    loadContacts(companyId);
  } catch (err) {
    alert('Failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate All Scripts';
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

  // Find which STEPS entry matches the current outreach_step
  const currentStep = STEPS[ct.outreach_step] || STEPS[0];
  const currentKey = currentStep.actionKey;

  const div = document.createElement('div');
  div.className = 'template-display';
  div.style.cssText = 'background:#f8f9fa;padding:16px;margin-top:8px;border-radius:6px;border:1px solid #e2e4ea;font-size:13px;position:relative;';

  let html = `<button class="btn btn-secondary btn-sm template-close" style="position:absolute;top:8px;right:8px;">Close</button>`;
  html += `<strong style="font-size:15px;">${esc(ct.name)} — Outreach Scripts</strong>`;

  for (const ts of TEMPLATE_STEPS) {
    const rawContent = templates[ts.key];
    if (!rawContent) continue;
    const content = templateText(rawContent);

    const isCurrent = ts.key === currentKey;
    const borderColor = isCurrent ? '#4f6ef7' : '#e2e4ea';
    const bgColor = isCurrent ? '#f0f3ff' : '#fff';
    const badge = isCurrent ? '<span style="background:#4f6ef7;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:8px;">CURRENT</span>' : '';

    html += `<div style="margin-top:14px;padding:12px;background:${bgColor};border:2px solid ${borderColor};border-radius:6px;">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">`;
    html += `<strong>${esc(ts.label)}${badge}</strong>`;
    html += `<span style="font-size:11px;color:#6b7085;font-weight:600;">${esc(ts.channel)}</span>`;
    html += `</div>`;
    html += `<hr style="margin:0 0 8px;border-color:#e2e4ea;">`;
    html += `<div class="template-content" style="white-space:pre-wrap;line-height:1.6;">${formatTemplateContent(content, ts.channel)}</div>`;
    html += `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">`;
    html += `<button class="btn btn-primary btn-sm copy-btn" data-content="${escAttr(content)}">Copy</button>`;
    html += templateActionButton(ct, ts, rawContent);
    html += `</div>`;
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

  div.querySelectorAll('.btn-mark-done').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stepIdx = parseInt(btn.dataset.stepIdx);
      const stepInfo = STEPS[stepIdx];
      const companyId = ct.tracked_company_id;
      const nextStep = Math.min(stepIdx + 1, STEPS.length - 1);
      btn.disabled = true; btn.textContent = 'Logging...';
      await fetch(`/api/tracker/contacts/${ct.id}/advance-step`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: nextStep,
          action_taken: stepInfo.bhAction || stepInfo.label,
          details: `${stepInfo.label} — ${stepInfo.channel}`,
          bh_action: stepInfo.bhAction,
        }),
      });
      loadContacts(companyId);
    });
  });
}

function templateActionButton(ct, ts, rawContent) {
  let btns = '';
  // LinkedIn actions
  if (ts.channel === 'LinkedIn' && ct.linkedin_url) {
    btns += `<button class="btn btn-sm btn-open-window" data-url="${escAttr(ct.linkedin_url)}" style="background:#0077b5;color:#fff;">Open LinkedIn</button>`;
  }
  // Email actions — compose with subject+body
  if (ts.channel === 'Email' && ct.email) {
    const { subject, body } = extractEmailParts(rawContent);
    const mailto = `mailto:${ct.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    btns += `<button class="btn btn-sm btn-open-window" data-url="${escAttr(mailto)}" style="background:#e74c3c;color:#fff;">Compose Email</button>`;
  }
  // Phone actions
  if ((ts.channel === 'Phone' || ts.channel === 'SMS') && ct.phone) {
    btns += `<a href="tel:${esc(ct.phone)}" class="btn btn-sm" style="background:#27ae60;color:#fff;text-decoration:none;">Call ${esc(ct.phone)}</a>`;
  }
  // Mark Done — find the matching STEPS index for this template key
  const stepIdx = STEPS.findIndex(s => s.actionKey === ts.key);
  if (stepIdx > 0) {
    btns += `<button class="btn btn-sm btn-mark-done" data-step-idx="${stepIdx}" style="background:#2c2f3e;color:#fff;">Done</button>`;
  }
  return btns;
}

/** Normalise template content — handles both {subject,body} objects and plain strings */
function templateText(raw) {
  if (!raw) return '';
  if (typeof raw === 'object') {
    if (raw.subject && raw.body) return `Subject: ${raw.subject}\n\n${raw.body}`;
    if (raw.body) return raw.body;
    return JSON.stringify(raw);
  }
  return String(raw);
}

/** Extract subject + body from a template (object or string format) */
function extractEmailParts(raw) {
  if (!raw) return { subject: '', body: '' };
  if (typeof raw === 'object' && raw.subject) return { subject: raw.subject, body: raw.body || '' };
  const str = String(raw);
  const m = str.match(/^(?:Subject:\s*)(.*?)(?:\n\n|\n)/i);
  if (m) return { subject: m[1].trim(), body: str.slice(m[0].length).trim() };
  return { subject: '', body: str };
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

/* ── One-click outreach actions ──────────────────────────────── */

function stepActionButton(ct, step) {
  if (step.id === 0) return '';
  const channel = step.channel;
  if (channel === 'LinkedIn' && ct.linkedin_url) {
    return `<button class="btn btn-sm btn-step-action btn-open-window" data-url="${escAttr(ct.linkedin_url)}" style="background:#0077b5;color:#fff;">Open LinkedIn</button>`;
  }
  if (channel === 'Email' && ct.email) {
    const raw = ct.outreach_templates?.[step.actionKey] || '';
    const { subject, body } = extractEmailParts(raw);
    const mailto = `mailto:${ct.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return `<button class="btn btn-sm btn-step-action btn-open-window" data-url="${escAttr(mailto)}" style="background:#e74c3c;color:#fff;">Compose Email</button>`;
  }
  if ((channel === 'Phone' || channel === 'Phone/SMS') && ct.phone) {
    return `<a href="tel:${esc(ct.phone)}" class="btn btn-sm btn-step-action" style="background:#27ae60;color:#fff;">Call ${esc(ct.phone)}</a>`;
  }
  return '';
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
  // Auto-link URLs in plain text roles strings
  const escaped = esc(rolesStr);
  return escaped.replace(/(https?:\/\/[^\s,)]+)/g, '<a href="$1" target="_blank" class="role-link">View Jobs</a>') || '—';
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

/* ── Open links in separate browser window ──────────────────── */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-open-window');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const url = btn.dataset.url;
  if (!url) return;
  if (url.startsWith('mailto:')) {
    window.location.href = url;
  } else {
    // popup=yes forces Chrome to open a new window, not a tab
    window.open(url, 'prospect_outreach', 'popup=yes,width=1280,height=900,left=100,top=100');
  }
});

/* ── Favorite toggle ─────────────────────────────────────────── */

async function toggleFavorite(companyId) {
  const company = allCompanies.find(c => c.id === companyId);
  if (!company) return;
  const newVal = !company.favorite;
  try {
    await fetch(`/api/tracker/${companyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: newVal })
    });
    company.favorite = newVal;
    const star = document.getElementById(`star-${companyId}`);
    if (star) {
      star.textContent = newVal ? '\u2605' : '\u2606';
      star.classList.toggle('starred', newVal);
    }
  } catch (err) { console.error('Failed to toggle favorite', err); }
}

/* ── Sort ────────────────────────────────────────────────────── */

const SIGNAL_ORDER = { High: 0, Medium: 1, Low: 2, '': 3 };

function sortAndRerender() {
  const sortVal = trackerSort ? trackerSort.value : 'newest';
  const sorted = [...allCompanies];

  sorted.sort((a, b) => {
    // Favorites always float to top when sorting by favorites
    if (sortVal === 'favorites') {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (sortVal === 'signal') {
      const diff = (SIGNAL_ORDER[a.signal_strength] || 3) - (SIGNAL_ORDER[b.signal_strength] || 3);
      if (diff !== 0) return diff;
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (sortVal === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    // newest (default)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Reorder DOM elements
  sorted.forEach(c => {
    const card = document.getElementById(`company-${c.id}`);
    if (card) trackerList.appendChild(card);
  });

  applyFilters();
}

/* ── Filter event listeners ───────────────────────────────────── */
if (trackerStepFilter) trackerStepFilter.addEventListener('change', applyFilters);
if (trackerSignalFilter) trackerSignalFilter.addEventListener('change', applyFilters);
if (trackerSort) trackerSort.addEventListener('change', () => { sortAndRerender(); });
if (trackerSearch) {
  let searchTimeout;
  trackerSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 250);
  });
}

/* ── ATS Scan ─────────────────────────────────────────────────── */
const btnScanATS = document.getElementById('btnScanATS');
const atsScanResults = document.getElementById('atsScanResults');

if (btnScanATS) {
  btnScanATS.addEventListener('click', async () => {
    btnScanATS.disabled = true;
    btnScanATS.textContent = 'Scanning...';
    atsScanResults.style.display = 'block';
    atsScanResults.innerHTML = '<p style="padding:16px;color:var(--text-muted);">Scanning ATS career pages for new roles... This may take a minute.</p>';

    try {
      const res = await fetch('/api/tracker/ats-scan');
      const data = await res.json();

      if (data.error) {
        atsScanResults.innerHTML = `<p style="padding:16px;color:#e74c3c;">${esc(data.error)}</p>`;
        return;
      }

      const { results, scanned, skipped } = data;
      const changes = results.filter(r => r.newRoles && r.newRoles.length > 0);
      const errors = results.filter(r => r.error);
      const noChange = results.filter(r => !r.error && (!r.newRoles || r.newRoles.length === 0));

      let html = `<div style="padding:16px;">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">`;
      html += `<h3 style="margin:0;">ATS Scan Results</h3>`;
      html += `<button class="btn btn-secondary btn-sm" id="closeScanResults">Close</button>`;
      html += `</div>`;
      html += `<p style="color:var(--text-muted);margin-bottom:16px;">Scanned ${scanned} companies with known ATS. ${skipped} skipped (no ATS slug). ${changes.length} with new roles found.</p>`;

      if (changes.length > 0) {
        html += `<h4 style="color:#27ae60;margin-bottom:8px;">Companies with New Roles</h4>`;
        for (const r of changes) {
          html += `<div style="background:var(--bg-card);border:2px solid #27ae60;border-radius:8px;padding:12px;margin-bottom:10px;">`;
          html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
          html += `<strong>${esc(r.company)}</strong>`;
          html += `<span class="badge badge-high">${r.newRoles.length} new</span>`;
          html += `</div>`;
          html += `<div style="margin-top:6px;font-size:13px;">`;
          r.newRoles.forEach(role => {
            html += `<div style="padding:2px 0;">• ${esc(role.title)}${role.location ? ` <span style="color:var(--text-muted);">(${esc(role.location)})</span>` : ''}</div>`;
          });
          html += `</div>`;
          html += `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">Total current roles: ${r.currentTotal} | Previously tracked: ${r.previousCount}</div>`;
          html += `</div>`;
        }
      }

      // Split no-change into "found roles" and "0 results (likely wrong slug)"
      const noChangeOk = noChange.filter(r => r.currentTotal > 0);
      const noChangeZero = noChange.filter(r => r.currentTotal === 0);

      if (noChangeOk.length > 0) {
        html += `<h4 style="margin-top:16px;margin-bottom:8px;color:var(--text-muted);">No Changes (${noChangeOk.length})</h4>`;
        html += `<div style="font-size:13px;color:var(--text-muted);">`;
        noChangeOk.forEach(r => { html += `${esc(r.company)} (${r.currentTotal} roles, slug: ${esc(r.slug)}), `; });
        html += `</div>`;
      }

      if (noChangeZero.length > 0) {
        html += `<h4 style="margin-top:16px;margin-bottom:8px;color:#e67e22;">0 Results — Likely Wrong Slug (${noChangeZero.length})</h4>`;
        html += `<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">These companies returned 0 roles. The ATS slug may not match the company name. Set the correct slug below.</p>`;
        for (const r of noChangeZero) {
          html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;">`;
          html += `<strong style="min-width:150px;">${esc(r.company)}</strong>`;
          html += `<span style="color:var(--text-muted);">slug: ${esc(r.slug)}</span>`;
          html += `<input type="text" class="slug-input" data-company-id="${r.companyId}" placeholder="correct slug" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:160px;">`;
          html += `<button class="btn btn-primary btn-sm slug-save" data-company-id="${r.companyId}">Save</button>`;
          html += `</div>`;
        }
      }

      if (errors.length > 0) {
        html += `<h4 style="margin-top:16px;margin-bottom:8px;color:#e67e22;">Errors (${errors.length})</h4>`;
        html += `<div style="font-size:13px;color:#e67e22;">`;
        errors.forEach(r => { html += `${esc(r.company)}: ${esc(r.error)}<br>`; });
        html += `</div>`;
      }

      html += `</div>`;
      atsScanResults.innerHTML = html;

      document.getElementById('closeScanResults').addEventListener('click', () => {
        atsScanResults.style.display = 'none';
      });

      // Slug save buttons
      atsScanResults.querySelectorAll('.slug-save').forEach(btn => {
        btn.addEventListener('click', async () => {
          const companyId = btn.dataset.companyId;
          const input = atsScanResults.querySelector(`.slug-input[data-company-id="${companyId}"]`);
          const slug = input.value.trim();
          if (!slug) { alert('Enter a slug'); return; }
          btn.disabled = true; btn.textContent = 'Saving...';
          await fetch(`/api/tracker/${companyId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ats_slug: slug }),
          });
          btn.textContent = 'Saved!';
          btn.style.background = '#27ae60';
        });
      });
    } catch (err) {
      atsScanResults.innerHTML = `<p style="padding:16px;color:#e74c3c;">Scan failed: ${esc(err.message)}</p>`;
    } finally {
      btnScanATS.disabled = false;
      btnScanATS.textContent = 'Scan ATS for New Roles';
    }
  });
}

/* ── Init ─────────────────────────────────────────────────────── */
checkBhStatus();
loadTracker();

// Listen for bookmarklet connection from Bullhorn tab
window.addEventListener('focus', () => {
  if (!bhConnected) checkBhStatus();
});
