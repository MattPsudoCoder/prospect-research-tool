/* Dashboard — daily action summary */

const STEP_LABELS = [
  'Not started',
  '1. Connection request',
  '2a. Intro (accepted)',
  '2b. Intro (not accepted)',
  '3. Spec-in email',
  '4. Cold call',
  '5. Value-add email',
  '6. LinkedIn follow-up'
];

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/tracker/stats');
    const data = await res.json();

    // Stat cards
    document.getElementById('statCompanies').textContent = data.totalCompanies;
    document.getElementById('statContacts').textContent = data.totalContacts;
    document.getElementById('statThisWeek').textContent = data.addedThisWeek;
    const attentionCount = data.staleContacts.length + data.noEmailContacts.length + data.companiesNoContacts.length;
    document.getElementById('statNeedAction').textContent = attentionCount;

    // Pipeline funnel
    renderFunnel(data.contactsByStep, data.totalContacts);

    // Signal breakdown
    renderSignalBars(data.signalCounts, data.totalCompanies);

    // Needs attention
    renderAttention(data);

    // Recent activity
    renderActivity(data.recentActivities);

  } catch (err) {
    console.error('Dashboard load failed:', err);
  }
}

function renderFunnel(contactsByStep, total) {
  const funnel = document.getElementById('funnel');
  if (!funnel) return;
  let html = '';
  for (let i = 0; i < STEP_LABELS.length; i++) {
    const count = contactsByStep[i] || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const barWidth = total > 0 ? Math.max(4, (count / total) * 100) : 4;
    html += `
      <div class="funnel-row">
        <div class="funnel-label">${STEP_LABELS[i]}</div>
        <div class="funnel-bar-wrap">
          <div class="funnel-bar" style="width:${barWidth}%"></div>
        </div>
        <div class="funnel-count">${count}</div>
      </div>
    `;
  }
  funnel.innerHTML = html;
}

function renderSignalBars(signalCounts, total) {
  const el = document.getElementById('signalBars');
  if (!el) return;
  const colors = { High: '#27ae60', Medium: '#f39c12', Low: '#e74c3c' };
  let html = '';
  for (const [level, count] of Object.entries(signalCounts)) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    html += `
      <div class="signal-bar-row">
        <span class="signal-bar-label">${level}</span>
        <div class="signal-bar-track">
          <div class="signal-bar-fill" style="width:${pct}%;background:${colors[level] || '#666'}"></div>
        </div>
        <span class="signal-bar-count">${count}</span>
      </div>
    `;
  }
  el.innerHTML = html;
}

function renderAttention(data) {
  const card = document.getElementById('attentionCard');
  const list = document.getElementById('attentionList');
  if (!card || !list) return;

  const items = [];

  for (const c of data.staleContacts) {
    items.push(`<div class="attention-item attention-stale"><strong>${esc(c.name)}</strong> at ${esc(c.company)} — stuck at step ${c.step} since ${formatDate(c.stepUpdated)}</div>`);
  }
  for (const c of data.companiesNoContacts) {
    items.push(`<div class="attention-item attention-missing"><strong>${esc(c.name)}</strong> — no contacts added yet</div>`);
  }
  for (const c of data.noEmailContacts.slice(0, 10)) {
    items.push(`<div class="attention-item attention-email"><strong>${esc(c.name)}</strong> at ${esc(c.company)} — missing email</div>`);
  }
  if (data.noEmailContacts.length > 10) {
    items.push(`<div class="attention-item">... and ${data.noEmailContacts.length - 10} more contacts missing email</div>`);
  }

  if (items.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  list.innerHTML = items.join('');
}

function renderActivity(activities) {
  const el = document.getElementById('recentActivity');
  if (!el) return;

  if (!activities || activities.length === 0) {
    el.innerHTML = '<p class="empty-contacts">No recent activity.</p>';
    return;
  }

  let html = '';
  for (const a of activities) {
    html += `<div class="activity-row">
      <span class="activity-action">${esc(a.action_taken || a.bh_action || 'Activity')}</span>
      <span class="activity-detail">${esc(a.contact_name || '')} ${a.company_name ? 'at ' + esc(a.company_name) : ''}</span>
      <span class="activity-date">${formatDate(a.created_at)}</span>
    </div>`;
  }
  el.innerHTML = html;
}

loadDashboard();
