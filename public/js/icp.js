/* ICP Settings page */

const form = document.getElementById('icpForm');
const saveStatus = document.getElementById('saveStatus');

// Load current settings on page load
async function loadSettings() {
  try {
    const res = await fetch('/api/icp');
    const data = await res.json();

    document.getElementById('industrySector').value = data.industry_sector || '';
    document.getElementById('companySizeMin').value = data.company_size_min || '';
    document.getElementById('companySizeMax').value = data.company_size_max || '';
    document.getElementById('geography').value = data.geography || '';
    document.getElementById('roleTypes').value = data.role_types || '';
  } catch (err) {
    console.error('Failed to load ICP settings:', err);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveStatus.textContent = 'Saving...';

  const body = {
    industry_sector: document.getElementById('industrySector').value,
    company_size_min: parseInt(document.getElementById('companySizeMin').value) || 0,
    company_size_max: parseInt(document.getElementById('companySizeMax').value) || 0,
    geography: document.getElementById('geography').value,
    role_types: document.getElementById('roleTypes').value,
  };

  try {
    const res = await fetch('/api/icp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error('Save failed');

    saveStatus.textContent = 'Saved!';
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  } catch (err) {
    saveStatus.textContent = 'Error saving settings.';
    saveStatus.style.color = '#e74c3c';
  }
});

loadSettings();
