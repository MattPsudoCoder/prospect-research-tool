/* Tracker page — companies moved from prospects for active pursuit */

const trackerList = document.getElementById('trackerList');

async function loadTracker() {
  try {
    const res = await fetch('/api/tracker');
    const companies = await res.json();

    if (companies.length === 0) {
      trackerList.innerHTML = '<div class="empty-state"><p>No tracked companies yet. Go to Prospects and click Track on companies you want to pursue.</p></div>';
      return;
    }

    trackerList.innerHTML = '';
    companies.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <div class="result-card-header">
          <h3>${esc(c.name)}</h3>
          <div class="result-card-badges">
            ${signalBadge(c.signal_strength)}
            <span class="badge badge-status">${esc(c.status)}</span>
            <button class="btn btn-danger btn-sm btn-remove" data-id="${c.id}" title="Remove from tracker">Remove</button>
          </div>
        </div>
        <div class="result-card-meta">
          <span><strong>ATS:</strong> ${esc(c.ats_detected)}</span>
          <span><strong>Added:</strong> ${formatDate(c.created_at)}</span>
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
            <label>Keywords</label>
            <p>${esc(c.keywords) || '<em>None</em>'}</p>
          </div>
        </div>
      `;
      trackerList.appendChild(card);
    });

    trackerList.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove from tracker?')) return;
        const id = parseInt(btn.dataset.id);
        try {
          await fetch(`/api/tracker/${id}`, { method: 'DELETE' });
          loadTracker();
        } catch (err) {
          alert('Failed to remove.');
        }
      });
    });
  } catch (err) {
    trackerList.innerHTML = '<div class="empty-state"><p>Failed to load tracker.</p></div>';
    console.error(err);
  }
}

function signalBadge(strength) {
  const s = (strength || 'Low').toLowerCase();
  return `<span class="badge badge-${s}">${strength || 'Low'}</span>`;
}

function formatRoles(rolesStr) {
  if (!rolesStr) return '<em>None detected</em>';
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
  return esc(rolesStr) || '<em>None detected</em>';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadTracker();
