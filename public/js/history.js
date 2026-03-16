/* History page — list past runs, view details */

const historyList = document.getElementById('historyList');
const loadingText = document.getElementById('loadingText');
const detailOverlay = document.getElementById('detailOverlay');
const detailTitle = document.getElementById('detailTitle');
const detailBody = document.getElementById('detailBody');
const closeOverlay = document.getElementById('closeOverlay');

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const runs = await res.json();

    if (runs.length === 0) {
      historyList.innerHTML = '<div class="empty-state"><p>No pipeline runs yet. Go to the Dashboard to start one.</p></div>';
      return;
    }

    historyList.innerHTML = '';
    runs.forEach((run) => {
      const div = document.createElement('div');
      div.className = 'run-card';
      div.innerHTML = `
        <div class="run-info">
          <h3>${esc(run.name || 'Unnamed Run')}</h3>
          <p>
            ${formatDate(run.created_at)} &middot;
            ${run.total_companies} companies &middot;
            <span class="status-badge status-${run.status}">${run.status}</span>
          </p>
        </div>
        <div class="run-actions">
          <button class="btn btn-secondary btn-sm" onclick="viewRun(${run.id}, '${esc(run.name)}')">View</button>
          <a href="/api/pipeline/${run.id}/export" class="btn btn-secondary btn-sm">Export</a>
          <button class="btn btn-danger btn-sm" onclick="deleteRun(${run.id})">Delete</button>
        </div>
      `;
      historyList.appendChild(div);
    });
  } catch (err) {
    historyList.innerHTML = '<div class="empty-state"><p>Failed to load history.</p></div>';
    console.error(err);
  }
}

async function viewRun(runId, name) {
  detailTitle.textContent = name || 'Run Details';
  detailBody.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';
  detailOverlay.classList.remove('hidden');

  try {
    const res = await fetch(`/api/history/${runId}/results`);
    const companies = await res.json();

    detailBody.innerHTML = '';
    if (companies.length === 0) {
      detailBody.innerHTML = '<tr><td colspan="10" class="empty-state">No results.</td></tr>';
      return;
    }

    companies.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td title="${esc(c.name)}">${esc(c.name)}</td>
        <td>${esc(c.source)}</td>
        <td>${esc(c.ats_detected)}</td>
        <td title="${esc(c.roles_found)}">${esc(c.roles_found)}</td>
        <td title="${esc(c.hiring_signals)}">${esc(c.hiring_signals)}</td>
        <td>${esc(c.keywords)}</td>
        <td>${signalBadge(c.signal_strength)}</td>
        <td>${bullhornBadge(c.in_bullhorn)}</td>
        <td>${esc(c.bullhorn_status)}</td>
        <td>${esc(c.last_activity)}</td>
      `;
      detailBody.appendChild(tr);
    });
  } catch (err) {
    detailBody.innerHTML = '<tr><td colspan="10">Error loading results.</td></tr>';
  }
}

async function deleteRun(runId) {
  if (!confirm('Delete this run and all its results?')) return;
  try {
    await fetch(`/api/history/${runId}`, { method: 'DELETE' });
    loadHistory();
  } catch (err) {
    alert('Failed to delete run.');
  }
}

closeOverlay.addEventListener('click', () => {
  detailOverlay.classList.add('hidden');
});

detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) detailOverlay.classList.add('hidden');
});

function signalBadge(strength) {
  const s = (strength || 'Low').toLowerCase();
  return `<span class="badge badge-${s}">${strength || 'Low'}</span>`;
}

function bullhornBadge(inBullhorn) {
  return inBullhorn
    ? '<span class="badge badge-yes">Yes</span>'
    : '<span class="badge badge-no">No</span>';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadHistory();
