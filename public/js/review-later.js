/* Review Later — shelved companies */

const reviewList = document.getElementById('reviewList');

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function signalBadge(strength) {
  const s = (strength || 'Low').toLowerCase();
  return `<span class="badge badge-${s}">${strength || 'Low'}</span>`;
}

function formatRolesInline(rolesStr) {
  if (!rolesStr) return '—';
  try {
    const roles = JSON.parse(rolesStr);
    if (Array.isArray(roles) && roles.length === 0) return '—';
    if (Array.isArray(roles) && roles.length > 0) {
      return roles.map(r => {
        if (typeof r === 'object' && r.title) return r.url ? `<a href="${esc(r.url)}" target="_blank" class="role-link">${esc(r.title)}</a>` : esc(r.title);
        return esc(String(r));
      }).join(', ');
    }
  } catch {}
  const escaped = esc(rolesStr);
  return escaped.replace(/(https?:\/\/[^\s,)]+)/g, '<a href="$1" target="_blank" class="role-link">View Jobs</a>') || '—';
}

function formatTechStack(techStr) {
  if (!techStr) return '';
  return techStr.split(',').map(t => `<span class="tech-chip">${esc(t.trim())}</span>`).join('');
}

function formatRoleTypes(roleTypesStr) {
  if (!roleTypesStr) return '';
  return roleTypesStr.split(',').map(r => `<span class="role-type-chip">${esc(r.trim())}</span>`).join('');
}

function hasNoRoleLinks(rolesStr) {
  if (!rolesStr) return true;
  try {
    const roles = JSON.parse(rolesStr);
    if (Array.isArray(roles) && roles.length === 0) return true;
    if (Array.isArray(roles) && roles.some(r => r.url)) return false;
  } catch {}
  if (/https?:\/\//.test(rolesStr)) return false;
  return true;
}

async function loadReviewLater() {
  try {
    const res = await fetch('/api/tracker');
    const all = await res.json();
    const companies = all.filter(c => c.status === 'Review Later');

    if (companies.length === 0) {
      reviewList.innerHTML = '<div class="empty-state"><p>No shelved companies. Use "Review Later" on the Tracker page to move companies here.</p></div>';
      return;
    }

    reviewList.innerHTML = '';
    for (const c of companies) {
      const card = document.createElement('div');
      card.className = 'tracker-card';
      card.id = `review-${c.id}`;
      card.innerHTML = `
        <div class="result-card-header">
          <h3>${c.website ? `<a href="${c.website.startsWith('http') ? esc(c.website) : 'https://' + esc(c.website)}" target="_blank" rel="noopener" class="company-name-link">${esc(c.name)}</a>` : esc(c.name)}${c.company_linkedin ? `<a href="${esc(c.company_linkedin)}" target="_blank" rel="noopener" class="company-li-btn" title="LinkedIn">in</a>` : ''}</h3>
          <div class="result-card-badges">
            ${signalBadge(c.signal_strength)}
            <button class="btn btn-primary btn-sm btn-restore" data-id="${c.id}">Restore to Tracker</button>
            <button class="btn btn-danger btn-sm btn-remove" data-id="${c.id}">Remove Permanently</button>
          </div>
        </div>
        <div class="result-card-meta">
          <span><strong>ATS:</strong> ${c.ats_detected && c.ats_detected !== 'None' ? esc(c.ats_detected) : '—'}</span>
          <span><strong>Roles:</strong> ${formatRolesInline(c.roles_found)}</span>
          ${hasNoRoleLinks(c.roles_found) && c.role_types ? `<span class="role-types-row"><strong>Role Types:</strong> ${formatRoleTypes(c.role_types)}</span>` : ''}
          ${c.tech_stack ? `<span class="tech-stack-row"><strong>Tech Stack:</strong> ${formatTechStack(c.tech_stack)}</span>` : ''}
          <span class="tracker-date"><strong>Added:</strong> ${typeof formatCentralDate === 'function' ? formatCentralDate(c.created_at) : new Date(c.created_at).toLocaleDateString()}</span>
        </div>
        ${c.hiring_signals ? `<div class="signal-chips">${formatSignalChips(c.hiring_signals)}</div>` : ''}
        ${c.keywords ? `<div class="result-card-tags">${c.keywords.split(',').map(k => `<span class="tag">${esc(k.trim())}</span>`).join('')}</div>` : ''}
        ${c.notes ? `<div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:4px;font-size:13px;color:var(--text-muted);"><strong>Notes:</strong> ${esc(c.notes)}</div>` : ''}
      `;
      reviewList.appendChild(card);
    }

    // Restore button
    reviewList.querySelectorAll('.btn-restore').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Restoring...';
        await fetch(`/api/tracker/${btn.dataset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'New' })
        });
        loadReviewLater();
      });
    });

    // Remove permanently
    reviewList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Permanently remove this company and all its contacts? This cannot be undone.')) return;
        await fetch(`/api/tracker/${btn.dataset.id}`, { method: 'DELETE' });
        loadReviewLater();
      });
    });

  } catch (err) {
    reviewList.innerHTML = '<div class="empty-state"><p>Failed to load.</p></div>';
  }
}

function formatSignalChips(signalsStr) {
  if (!signalsStr) return '';
  const parts = signalsStr.split(/\.\s*/).filter(s => s.trim());
  return parts.map(part => {
    const p = part.trim();
    let cls = 'signal-chip';
    if (/\$\d/.test(p) && /fund|rais|series|revenue/i.test(p)) cls += ' signal-funding';
    else if (/employ|headcount/i.test(p) || /^\d+\s*employ/i.test(p)) cls += ' signal-size';
    else if (/growth|yoy|bookings/i.test(p)) cls += ' signal-growth';
    else if (/hire|confirmed|engineer/i.test(p)) cls += ' signal-hire';
    else if (/[A-Z]{2}\b/.test(p) && p.length < 60) cls += ' signal-location';
    return `<span class="${cls}">${esc(p)}</span>`;
  }).join('');
}

loadReviewLater();
