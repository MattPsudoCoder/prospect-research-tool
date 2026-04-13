/* Flips — Hiring Manager Flip cadence */

const flipsList = document.getElementById('flipsList');
let bhConnected = false;

const CALENDLY_URL = 'https://calendly.com/matthew-davie/call-with-matthew-at-signify';

const FLIP_STEPS = [
  { id: 0, label: 'Not started', bhAction: '' },
  { id: 1, label: '1. BD Message', bhAction: 'BD Message', details: 'HMF Sent' },
  { id: 2, label: '2. HM Flip / Attempted', bhAction: '' }, // placeholder — actual action set by outcome
];

/* ── Scripts — static templates by seniority ──────────────────── */

const DIRECTOR_SCRIPT = `Hi {firstName},

I'm reaching out because a UK-founded payments and money-movement platform—a long-standing client relationship through our London HQ—has asked us to support a confidential search for a VP Engineering (North America) as they scale their US operation and build out local engineering teams.

This is a confidential search, so I need to keep the company name and certain specifics discreet over message.

They're open to speaking with accomplished Directors of Technology / Engineering who have already scaled multi-team organisations and are ready for a VP remit. The profile they're looking for typically includes:

Scaling multi-team orgs in a high-availability, transaction-heavy environment
Cloud-native architecture (microservices/APIs/event-driven) + strong reliability/incident discipline
Building leaders and teams while raising engineering execution standards
Experience with mission-critical financial systems and integrations

Compensation (estimate): total compensation typically $800k–$1.6m, commonly structured as base $350k–$550k + bonus + long-term incentives.

I'm planning to present an initial shortlist of prospective candidates over the coming weeks so if this is something you would be interested in discussing further I've included a link to my Calendly.

${CALENDLY_URL}`;

const VP_CTO_SCRIPT = `Hi {firstName},

I'm reaching out because a UK-founded, well-known payments and money-movement platform - one we've partnered with closely via our London HQ - has asked us to support a confidential search for a CTO/SVP (North America) as they scale their US operation and build out engineering teams locally.

This is a confidential search, so I need to keep the company name and certain specifics discreet over message.

I'm planning to present an initial shortlist of prospective candidates over the coming weeks and so would be keen to discuss this further with you and whether you would be interested in being presented? If you'd be open it, please book time via my Calendly

${CALENDLY_URL}

In terms of technical expertise, the ideal candidate should have experience in:

Leading and scaling engineering organisations in a high-availability, transaction-heavy environment (multi-site org build, senior leadership hiring, org design).
Owning technical direction across cloud-native architecture (microservices, APIs, event-driven systems), with strong observability and reliability/SRE.
Delivering and operating mission-critical financial platforms, including areas such as payments processing, settlement flows, ledgering/reconciliation, platform integrations, and customer-facing experiences.
Driving engineering modernisation: developer productivity, CI/CD, platform standards, quality practices, incident response, and engineering metrics.
Building a strong partnership model across engineering, product, security, operations, and commercial leadership to align technical strategy with business outcomes.
Developing high-performing teams and leaders while maintaining a high hiring bar during growth.

Compensation (estimate): total compensation typically $1.5m–$2.7m, commonly structured as base $500k–$800k + bonus + long-term incentives.`;

/* ── Seniority detection ──────────────────────────────────────── */

function isVpCtoLevel(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return /\b(vp|vice president|cto|chief technology|svp|senior vice president)\b/.test(t);
}

function isDirectorLevel(title) {
  if (!title) return false;
  return /\bdirector\b/i.test(title);
}

function getFlipScript(contact) {
  const firstName = contact.name.split(/\s+/)[0];
  if (isVpCtoLevel(contact.title)) {
    return VP_CTO_SCRIPT.replace(/\{firstName\}/g, firstName);
  }
  // Default to Director script for all others that made it to Flips
  return DIRECTOR_SCRIPT.replace(/\{firstName\}/g, firstName);
}

function getSeniorityLabel(title) {
  if (isVpCtoLevel(title)) return 'VP/CTO';
  if (isDirectorLevel(title)) return 'Director';
  return 'Director'; // fallback
}

/* ── Bullhorn status ──────────────────────────────────────────── */

async function checkBhStatus() {
  try {
    const res = await fetch('/api/bullhorn/status');
    const data = await res.json();
    bhConnected = data.connected;
    renderBhBar(data);
  } catch {
    bhConnected = false;
    renderBhBar({ connected: false });
  }
}

function renderBhBar(data) {
  const bar = document.getElementById('bhStatus');
  if (data.connected) {
    bar.innerHTML = `
      <span class="bh-dot connected"></span>
      <span class="bh-label">Bullhorn connected (${esc(data.method || '')})</span>
      <button class="btn-bh btn-sm" id="bhSyncDay" style="background:#27ae60">Sync Day to BH</button>
    `;
    document.getElementById('bhSyncDay').addEventListener('click', syncDayToBullhorn);
  } else {
    bar.innerHTML = `
      <span class="bh-dot disconnected"></span>
      <span class="bh-label">Bullhorn not connected</span>
    `;
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

/* ── Load and render flips ────────────────────────────────────── */

async function loadFlips() {
  try {
    const res = await fetch('/api/tracker/flips');
    const contacts = await res.json();

    if (contacts.length === 0) {
      flipsList.innerHTML = '<div class="empty-state"><p>No flipped contacts yet. Go to Tracker and click "Flip" on a Director/VP/CTO contact.</p></div>';
      return;
    }

    // Group by company
    const byCompany = {};
    for (const ct of contacts) {
      const key = ct.tracked_company_id;
      if (!byCompany[key]) byCompany[key] = { name: ct.company_name, website: ct.website, company_linkedin: ct.company_linkedin, signal_strength: ct.signal_strength, contacts: [] };
      byCompany[key].contacts.push(ct);
    }

    flipsList.innerHTML = '';
    for (const [companyId, group] of Object.entries(byCompany)) {
      const card = document.createElement('div');
      card.className = 'tracker-card';
      card.innerHTML = `
        <div class="result-card-header">
          <h3>${group.website ? `<a href="${group.website.startsWith('http') ? esc(group.website) : 'https://' + esc(group.website)}" target="_blank" rel="noopener" class="company-name-link">${esc(group.name)}</a>` : esc(group.name)}${group.company_linkedin ? `<a href="${esc(group.company_linkedin)}" target="_blank" rel="noopener" class="company-li-btn" title="LinkedIn">in</a>` : ''}</h3>
          <div class="result-card-badges">
            ${signalBadge(group.signal_strength)}
          </div>
        </div>
        <div class="contacts-list" id="flip-contacts-${companyId}" style="display:block;"></div>
      `;
      flipsList.appendChild(card);

      const listEl = card.querySelector(`#flip-contacts-${companyId}`);
      for (const ct of group.contacts) {
        const row = document.createElement('div');
        row.className = 'contact-row';
        row.id = `flip-${ct.id}`;

        const stepLabel = ct.flip_step === 0 ? 'Not started' : ct.flip_step === 1 ? 'BD Message sent' : (ct.flip_outcome || 'Complete');
        const seniorityLabel = getSeniorityLabel(ct.title);

        row.innerHTML = `
          <div class="contact-info">
            <div class="contact-name-row">
              <strong>${esc(ct.name)}</strong>
              ${ct.title ? `<span class="contact-title">${esc(ct.title)}</span>` : ''}
              <span class="badge badge-flip-seniority">${seniorityLabel}</span>
            </div>
            <div class="contact-details">
              ${ct.linkedin_url ? `<a href="${esc(ct.linkedin_url)}" target="_blank" class="contact-detail-link channel-linkedin">in</a>` : ''}
              ${ct.email ? `<a href="mailto:${esc(ct.email)}" class="contact-detail-link">${esc(ct.email)}</a>` : ''}
              ${ct.phone ? `<a href="tel:${esc(ct.phone.replace(/[^+\d]/g, ''))}" class="contact-detail-link contact-phone">${esc(ct.phone)}</a>` : ''}
            </div>
          </div>
          <div class="contact-step">
            <span class="flip-step-label step-badge-${ct.flip_step}">${esc(stepLabel)}</span>
          </div>
          <div class="contact-actions">
            ${renderFlipActions(ct)}
            <button class="btn btn-sm btn-view-flip-script" data-contact-id="${ct.id}" style="background:#9b59b6;color:#fff;">View Script</button>
            <button class="btn btn-secondary btn-sm btn-unflip" data-contact-id="${ct.id}">Remove from Flips</button>
          </div>
        `;
        listEl.appendChild(row);
      }
    }

    // Wire up event listeners
    wireFlipListeners(contacts);
  } catch (err) {
    flipsList.innerHTML = '<div class="empty-state"><p>Failed to load flips.</p></div>';
  }
}

function renderFlipActions(ct) {
  if (ct.flip_step === 0) {
    return `<button class="btn btn-primary btn-sm btn-flip-bd" data-contact-id="${ct.id}">Mark BD Message Sent</button>`;
  }
  if (ct.flip_step === 1) {
    return `
      <button class="btn btn-sm btn-flip-outcome" data-contact-id="${ct.id}" data-outcome="HM Flip" style="background:#27ae60;color:#fff;">HM Flip</button>
      <button class="btn btn-sm btn-flip-outcome" data-contact-id="${ct.id}" data-outcome="Attempted HM Flip" style="background:#e67e22;color:#fff;">Attempted HM Flip</button>
    `;
  }
  // Step 2 — done
  const color = ct.flip_outcome === 'HM Flip' ? '#27ae60' : '#e67e22';
  return `<span class="badge" style="background:${color};color:#fff;padding:4px 10px;border-radius:10px;font-size:12px;">${esc(ct.flip_outcome)}</span>`;
}

function wireFlipListeners(contacts) {
  // BD Message sent
  flipsList.querySelectorAll('.btn-flip-bd').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Logging...';
      await fetch(`/api/tracker/contacts/${btn.dataset.contactId}/advance-flip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flip_step: 1, bh_action: 'BD Message', details: 'HMF Sent' }),
      });
      loadFlips();
    });
  });

  // HM Flip / Attempted HM Flip
  flipsList.querySelectorAll('.btn-flip-outcome').forEach(btn => {
    btn.addEventListener('click', async () => {
      const outcome = btn.dataset.outcome;
      btn.disabled = true; btn.textContent = 'Logging...';
      await fetch(`/api/tracker/contacts/${btn.dataset.contactId}/advance-flip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flip_step: 2, flip_outcome: outcome, bh_action: outcome, details: outcome }),
      });
      loadFlips();
    });
  });

  // View script
  flipsList.querySelectorAll('.btn-view-flip-script').forEach(btn => {
    btn.addEventListener('click', () => {
      const ct = contacts.find(c => c.id === parseInt(btn.dataset.contactId));
      if (ct) showFlipScript(ct, btn);
    });
  });

  // Remove from flips
  flipsList.querySelectorAll('.btn-unflip').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this contact from Flips? They will remain on the Tracker.')) return;
      btn.disabled = true; btn.textContent = 'Removing...';
      await fetch(`/api/tracker/contacts/${btn.dataset.contactId}/unflip`, { method: 'POST' });
      loadFlips();
    });
  });
}

/* ── Script viewer ────────────────────────────────────────────── */

function showFlipScript(ct, triggerBtn) {
  const row = document.getElementById(`flip-${ct.id}`);
  if (!row) return;

  // Toggle
  const existing = row.querySelector('.flip-script-display');
  if (existing) { existing.remove(); triggerBtn.style.display = ''; return; }

  triggerBtn.style.display = 'none';

  const script = getFlipScript(ct);
  const seniorityLabel = getSeniorityLabel(ct.title);

  const div = document.createElement('div');
  div.className = 'flip-script-display template-display';
  div.style.cssText = 'background:var(--bg-card);padding:16px;margin-top:8px;border-radius:6px;border:1px solid var(--border);font-size:13px;position:relative;color:var(--text);';

  div.innerHTML = `
    <button class="btn btn-secondary btn-sm template-close" style="position:absolute;top:8px;right:8px;">Close</button>
    <strong style="font-size:15px;">${esc(ct.name)} — ${seniorityLabel} Flip Script</strong>
    <div style="margin-top:14px;padding:12px;background:var(--bg);border:2px solid #9b59b6;border-radius:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>LinkedIn Message — ${seniorityLabel} Template</strong>
        <span style="font-size:11px;color:var(--text-muted);font-weight:600;">LinkedIn</span>
      </div>
      <hr style="margin:0 0 8px;border-color:var(--border);">
      <div class="template-content" style="white-space:pre-wrap;line-height:1.6;">${esc(script)}</div>
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button class="btn btn-primary btn-sm flip-copy-btn">Copy</button>
        ${ct.linkedin_url ? `<button class="btn btn-sm btn-open-window" data-url="${escAttr(ct.linkedin_url)}" style="background:#0077b5;color:#fff;">Open LinkedIn</button>` : ''}
      </div>
    </div>
  `;

  row.appendChild(div);

  div.querySelector('.template-close').addEventListener('click', () => {
    div.remove();
    triggerBtn.style.display = '';
  });

  div.querySelector('.flip-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(script);
    const btn = div.querySelector('.flip-copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}

/* ── Open links in separate browser window ──────────────────── */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-open-window');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const url = btn.dataset.url;
  if (!url) return;
  window.open(url, 'prospect_outreach', 'popup=yes,width=1280,height=900,left=100,top=100');
});

/* ── Helpers ──────────────────────────────────────────────────── */

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

function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Init ─────────────────────────────────────────────────────── */
checkBhStatus();
loadFlips();
