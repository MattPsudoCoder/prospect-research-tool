/* Dashboard — pipeline form, progress tracking, results table */

const form = document.getElementById('pipelineForm');
const runBtn = document.getElementById('runBtn');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const resultsBody = document.getElementById('resultsBody');
const exportBtn = document.getElementById('exportBtn');

let currentRunId = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('manualNames', document.getElementById('manualNames').value);
  formData.append('runName', document.getElementById('runName').value);
  formData.append('useICP', document.getElementById('useICP').checked ? 'true' : 'false');

  const csvFile = document.getElementById('csvFile').files[0];
  if (csvFile) formData.append('csvFile', csvFile);

  const zoominfoFile = document.getElementById('zoominfoFile').files[0];
  if (zoominfoFile) formData.append('zoominfoFile', zoominfoFile);

  // Disable form
  runBtn.disabled = true;
  runBtn.textContent = 'Starting...';
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  progressBar.style.width = '0%';
  progressText.textContent = 'Starting pipeline...';

  try {
    const res = await fetch('/api/pipeline/run', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to start pipeline');
    }

    currentRunId = data.runId;
    progressText.textContent = `Processing 0 / ${data.totalCompanies} companies...`;

    // Start listening for progress
    trackProgress(data.runId, data.totalCompanies);
  } catch (err) {
    alert('Error: ' + err.message);
    runBtn.disabled = false;
    runBtn.textContent = 'Run Pipeline';
    progressSection.classList.add('hidden');
  }
});

function trackProgress(runId, total) {
  const evtSource = new EventSource(`/api/pipeline/${runId}/progress`);

  evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const pct = total > 0 ? Math.round((data.processed / total) * 100) : 0;
    progressBar.style.width = pct + '%';
    progressText.textContent = `Processing ${data.processed} / ${total} companies...`;

    if (data.status === 'completed') {
      evtSource.close();
      progressText.textContent = `Completed — ${total} companies researched.`;
      runBtn.disabled = false;
      runBtn.textContent = 'Run Pipeline';
      loadResults(runId);
    } else if (data.status === 'error') {
      evtSource.close();
      progressText.textContent = 'Pipeline encountered an error. Partial results may be available.';
      runBtn.disabled = false;
      runBtn.textContent = 'Run Pipeline';
      loadResults(runId);
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    runBtn.disabled = false;
    runBtn.textContent = 'Run Pipeline';
    // Try loading whatever results exist
    loadResults(runId);
  };
}

async function loadResults(runId) {
  try {
    const res = await fetch(`/api/history/${runId}/results`);
    const companies = await res.json();

    resultsBody.innerHTML = '';
    if (companies.length === 0) {
      resultsBody.innerHTML = '<tr><td colspan="10" class="empty-state">No results found.</td></tr>';
    } else {
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
        resultsBody.appendChild(tr);
      });
    }

    resultsSection.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to load results:', err);
  }
}

exportBtn.addEventListener('click', () => {
  if (currentRunId) {
    window.location.href = `/api/pipeline/${currentRunId}/export`;
  }
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

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
