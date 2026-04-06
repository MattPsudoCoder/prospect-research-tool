/* Prospects page — all valid companies, deduped, filterable */

const prospectsList = document.getElementById('prospectsList');
const filterSignal = document.getElementById('filterSignal');
const filterSource = document.getElementById('filterSource');
const filterSearch = document.getElementById('filterSearch');
const resultCount = document.getElementById('resultCount');
const cleanupBtn = document.getElementById('cleanupBtn');
const exportBtn = document.getElementById('exportBtn');

let allProspects = [];

async function loadProspects() {
  try {
    const res = await fetch('/api/history/prospects');
    allProspects = await res.json();

    if (allProspects.length === 0) {
      prospectsList.innerHTML = '<div class="empty-state"><p>No valid prospects yet. Run the pipeline from the Dashboard to generate results.</p></div>';
      resultCount.textContent = '';
      return;
    }

    // Populate source filter with unique sources
    const sources = [...new Set(allProspects.map((c) => c.source).filter(Boolean))].sort();
    filterSource.innerHTML = '<option value="">All</option>';
    sources.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      filterSource.appendChild(opt);
    });

    renderProspects();
  } catch (err) {
    prospectsList.innerHTML = '<div class="empty-state"><p>Failed to load prospects.</p></div>';
    console.error(err);
  }
}

function renderProspects() {
  const signal = filterSignal.value;
  const source = filterSource.value;
  const search = filterSearch.value.toLowerCase().trim();

  const filtered = allProspects.filter((c) => {
    if (signal && c.signal_strength !== signal) return false;
    if (source && c.source !== source) return false;
    if (search) {
      const haystack = [c.name, c.roles_found, c.hiring_signals, c.keywords, c.ats_detected]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  resultCount.textContent = `${filtered.length} prospect${filtered.length !== 1 ? 's' : ''}${
    filtered.length !== allProspects.length ? ` (of ${allProspects.length} total)` : ''
  }`;

  if (filtered.length === 0) {
    prospectsList.innerHTML = '<div class="empty-state"><p>No prospects match your filters.</p></div>';
    return;
  }

  prospectsList.innerHTML = '';
  filtered.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="result-card-header">
        <h3>${esc(c.name)}</h3>
        <div class="result-card-badges">
          ${signalBadge(c.signal_strength)}
          <span class="badge badge-source">${esc(c.source)}</span>
          <button class="btn btn-primary btn-sm btn-track" data-id="${c.id}" title="Move to Tracker">Track</button>
          <button class="btn btn-danger btn-sm btn-delete" data-id="${c.id}" title="Remove prospect">Remove</button>
        </div>
      </div>
      <div class="result-card-meta">
        <span><strong>ATS:</strong> ${esc(c.ats_detected)}</span>
        ${c.created_at ? `<span><strong>Researched:</strong> ${formatDate(c.created_at)}</span>` : ''}
      </div>
      <div class="result-card-body">
        <div class="result-field">
          <label>Roles Found</label>
          <p>${formatRoles(c.roles_found)}</p>
        </div>
        <div class="result-field">
          <label>Hiring Signals</label>
          <p>${esc(c.hiring_signals) || '<em>None detected</em>'}</p>
        </div>
        <div class="result-field">
          <label>Tech Stack</label>
          <p>${esc(c.tech_stack) || '<em>Unknown</em>'}</p>
        </div>
      </div>
    `;
    prospectsList.appendChild(card);
  });

  // Attach button handlers
  prospectsList.querySelectorAll('.btn-track').forEach((btn) => {
    btn.addEventListener('click', () => trackProspect(parseInt(btn.dataset.id)));
  });
  prospectsList.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteProspect(parseInt(btn.dataset.id)));
  });
}

async function trackProspect(companyId) {
  const company = allProspects.find((c) => c.id === companyId);
  if (!company) return;
  const btn = prospectsList.querySelector(`.btn-track[data-id="${companyId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch('/api/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: company.id,
        name: company.name,
        ats_detected: company.ats_detected,
        roles_found: company.roles_found,
        hiring_signals: company.hiring_signals,
        keywords: company.keywords,
        signal_strength: company.signal_strength,
      }),
    });
    if (!res.ok && res.status !== 409) throw new Error('Failed');
    // Dismiss from prospects after tracking
    await fetch(`/api/history/company/${companyId}`, { method: 'DELETE' });
    allProspects = allProspects.filter((c) => c.id !== companyId);
    renderProspects();
  } catch (err) {
    alert('Failed to track: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Track'; }
  }
}

async function deleteProspect(companyId) {
  try {
    await fetch(`/api/history/company/${companyId}`, { method: 'DELETE' });
    allProspects = allProspects.filter((c) => c.id !== companyId);
    renderProspects();
  } catch (err) {
    alert('Failed to dismiss: ' + err.message);
  }
}

// Filter event listeners
filterSignal.addEventListener('change', renderProspects);
filterSource.addEventListener('change', renderProspects);
let searchTimeout;
filterSearch.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderProspects, 250);
});

// Cleanup errors button
cleanupBtn.addEventListener('click', async () => {
  if (!confirm('Delete all error rows from the database? This cannot be undone.')) return;
  cleanupBtn.disabled = true;
  cleanupBtn.textContent = 'Cleaning...';
  try {
    const res = await fetch('/api/history/cleanup/errors', { method: 'DELETE' });
    const data = await res.json();
    alert(`Cleanup complete. Removed ${data.deleted} error rows.`);
    loadProspects(); // reload
  } catch (err) {
    alert('Cleanup failed: ' + err.message);
  } finally {
    cleanupBtn.disabled = false;
    cleanupBtn.textContent = 'Cleanup Errors';
  }
});

// Export CSV — downloads all prospects (not just filtered)
exportBtn.addEventListener('click', () => {
  if (allProspects.length === 0) {
    alert('No prospects to export.');
    return;
  }

  const headers = ['Company Name', 'Source', 'ATS Detected', 'Roles Found', 'Hiring Signals', 'Tech Stack', 'Keywords', 'Signal Strength'];
  const rows = allProspects.map((c) => [
    csvEsc(c.name),
    csvEsc(c.source),
    csvEsc(c.ats_detected),
    csvEsc(flattenRolesCSV(c.roles_found)),
    csvEsc(c.hiring_signals),
    csvEsc(c.tech_stack),
    csvEsc(c.keywords),
    csvEsc(c.signal_strength),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prospects-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

function flattenRolesCSV(rolesStr) {
  if (!rolesStr) return '';
  try {
    const roles = JSON.parse(rolesStr);
    if (Array.isArray(roles)) {
      return roles.map((r) => {
        if (typeof r === 'object' && r.title) {
          return r.url ? `${r.title} (${r.url})` : r.title;
        }
        return String(r);
      }).join(', ');
    }
  } catch {}
  return rolesStr;
}

function csvEsc(val) {
  if (!val) return '""';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function signalBadge(strength) {
  const s = (strength || 'Low').toLowerCase();
  return `<span class="badge badge-${s}">${strength || 'Low'}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatRoles(rolesStr) {
  if (!rolesStr) return '<em>None detected</em>';
  // Try parsing as JSON array of {title, url} objects
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
  } catch {
    // Not JSON — legacy comma-separated string
  }
  return esc(rolesStr) || '<em>None detected</em>';
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadProspects();
