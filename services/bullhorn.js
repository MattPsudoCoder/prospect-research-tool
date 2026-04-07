/**
 * Bullhorn CRM integration — dual auth (manual browser token + OAuth).
 *
 * Manual token mode: user pastes BhRestToken + restUrl from their
 * authenticated Bullhorn browser session. Works immediately.
 *
 * OAuth mode: activated when BULLHORN_CLIENT_ID + CLIENT_SECRET are
 * set in .env. Not yet available (waiting on CLIENT_SECRET).
 */

/* ── credential cache ─────────────────────────────────────────── */

let manualCache = { bhRestToken: null, restUrl: null, receivedAt: 0 };
let oauthCache  = { bhRestToken: null, restUrl: null, expiresAt: 0 };

const MANUAL_TTL = 8 * 60 * 1000;   // 8 min (BH tokens last ~10 min)
const OAUTH_TTL  = 4 * 60 * 1000;   // 4 min

/* ── auth helpers ─────────────────────────────────────────────── */

function setManualToken(bhRestToken, restUrl) {
  manualCache = { bhRestToken, restUrl, receivedAt: Date.now() };
}

function clearManualToken() {
  manualCache = { bhRestToken: null, restUrl: null, receivedAt: 0 };
}

function getManualToken() {
  if (!manualCache.bhRestToken) return null;
  if (Date.now() - manualCache.receivedAt > MANUAL_TTL) {
    clearManualToken();
    return null;
  }
  return { bhRestToken: manualCache.bhRestToken, restUrl: manualCache.restUrl };
}

async function authenticateOAuth() {
  if (oauthCache.bhRestToken && Date.now() < oauthCache.expiresAt) {
    return { bhRestToken: oauthCache.bhRestToken, restUrl: oauthCache.restUrl };
  }

  const { BULLHORN_CLIENT_ID, BULLHORN_CLIENT_SECRET, BULLHORN_USERNAME, BULLHORN_PASSWORD } = process.env;
  if (!BULLHORN_CLIENT_ID || !BULLHORN_CLIENT_SECRET) return null;

  // Step 1 — auth code
  const authUrl = new URL('https://auth.bullhornstaffing.com/oauth/authorize');
  authUrl.searchParams.set('client_id', BULLHORN_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('action', 'Login');
  authUrl.searchParams.set('username', BULLHORN_USERNAME);
  authUrl.searchParams.set('password', BULLHORN_PASSWORD);

  const authRes = await fetch(authUrl.toString(), { redirect: 'manual' });
  const location = authRes.headers.get('location') || '';
  const codeMatch = location.match(/code=([^&]+)/);
  if (!codeMatch) throw new Error('Failed to get Bullhorn auth code');

  // Step 2 — access token
  const tokenRes = await fetch('https://auth.bullhornstaffing.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: codeMatch[1],
      client_id: BULLHORN_CLIENT_ID,
      client_secret: BULLHORN_CLIENT_SECRET,
    }).toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get Bullhorn access token');

  // Step 3 — REST login
  const loginRes = await fetch(
    `https://rest.bullhornstaffing.com/rest-services/login?version=*&access_token=${tokenData.access_token}`,
    { method: 'POST' }
  );
  const loginData = await loginRes.json();
  if (!loginData.BhRestToken) throw new Error('Failed to get Bullhorn REST token');

  oauthCache = { bhRestToken: loginData.BhRestToken, restUrl: loginData.restUrl, expiresAt: Date.now() + OAUTH_TTL };
  return { bhRestToken: oauthCache.bhRestToken, restUrl: oauthCache.restUrl };
}

/** Get credentials from either source (OAuth first, then manual). */
async function getCredentials() {
  // Try OAuth if configured
  const { BULLHORN_CLIENT_ID, BULLHORN_CLIENT_SECRET } = process.env;
  if (BULLHORN_CLIENT_ID && BULLHORN_CLIENT_SECRET) {
    const oauth = await authenticateOAuth();
    if (oauth) return oauth;
  }
  // Fall back to manual token
  const manual = getManualToken();
  if (manual) return manual;
  throw new Error('Bullhorn not connected — provide a token or configure OAuth');
}

/** Return current config status. */
function isConfigured() {
  const hasOAuth = !!(process.env.BULLHORN_CLIENT_ID && process.env.BULLHORN_CLIENT_SECRET);
  const manual = getManualToken();
  return { oauth: hasOAuth, manualToken: !!manual, connected: hasOAuth || !!manual };
}

/* ── fetch helper ─────────────────────────────────────────────── */

async function bhFetch(path, options = {}) {
  const { bhRestToken, restUrl } = await getCredentials();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${restUrl}${path}${sep}BhRestToken=${bhRestToken}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...options });
  if (res.status === 401) {
    clearManualToken();
    oauthCache = { bhRestToken: null, restUrl: null, expiresAt: 0 };
    throw new Error('Bullhorn token expired — reconnect');
  }
  return res.json();
}

/* ── note / signal constants ──────────────────────────────────── */

const IGNORED_NOTE_ACTIONS = ['mailshot', 'mass email', 'bulk email', 'mass mail', 'email blast'];

const NEGATIVE_SIGNAL_PHRASES = [
  'not interested', 'do not contact', 'do not call', 'dnc',
  'no longer hiring', 'hiring freeze', 'not looking to work with',
  'declined', 'rejected', 'no recruitment agencies', 'no agencies',
  'psc only', 'internal only', 'preferred supplier', 'not on psl',
  'bad experience', 'complaint', 'do not approach', 'blacklist',
  'cease contact', 'unsubscribe', 'opt out', 'removed from list',
];

/* ── read operations ──────────────────────────────────────────── */

async function searchCompany(companyName) {
  const query = encodeURIComponent(`name:${companyName}*`);
  return bhFetch(`search/ClientCorporation?query=${query}&fields=id,name,status&count=5`);
}

async function searchContact(firstName, lastName) {
  const query = encodeURIComponent(`lastName:${lastName} AND firstName:${firstName}`);
  return bhFetch(`search/ClientContact?query=${query}&fields=id,firstName,lastName,name,owner,occupation,email,phone,dateLastModified,dateLastComment&count=10`);
}

async function checkCompany(companyName) {
  try {
    const searchData = await searchCompany(companyName);
    if (!searchData.data || searchData.data.length === 0) return { found: false };

    const corp = searchData.data[0];
    const corpId = corp.id;
    const { bhRestToken, restUrl } = await getCredentials();

    const [notesData, vacancyData, placementData, leadsData] = await Promise.all([
      fetchNotes(restUrl, bhRestToken, corpId),
      fetchVacancies(restUrl, bhRestToken, corpId),
      fetchPlacements(restUrl, bhRestToken, corpId),
      fetchLeads(restUrl, bhRestToken, corpId),
    ]);

    const { recentNotes, lastMeaningfulActivity, negativeSignals } = analyseNotes(notesData);

    const statusParts = [corp.status || 'Unknown'];
    if (vacancyData.total > 0) statusParts.push(`${vacancyData.total} vacancies (${vacancyData.open} open)`);
    if (placementData.total > 0) statusParts.push(`${placementData.total} placements`);
    if (negativeSignals.length > 0) statusParts.push(`WARNING: ${negativeSignals.join('; ')}`);

    return {
      found: true, id: corpId, name: corp.name,
      status: statusParts.join(' | '),
      owner: '',
      lastActivity: lastMeaningfulActivity,
      vacancies: vacancyData, placements: placementData, leads: leadsData,
      recentNotes, negativeSignals,
    };
  } catch (err) {
    console.error(`Bullhorn check failed for "${companyName}":`, err.message);
    return { found: false, error: err.message };
  }
}

async function fetchNotes(restUrl, token, corpId) {
  try {
    const url = `${restUrl}entity/ClientCorporation/${corpId}/allCorpNotes?fields=action,dateAdded,comments,personReference&count=50&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.data || [];
  } catch { return []; }
}

async function fetchVacancies(restUrl, token, corpId) {
  try {
    const url = `${restUrl}query/JobOrder?where=clientCorporation.id=${corpId}&fields=id,title,status,dateAdded&count=100&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const vacancies = data.data || [];
    const open = vacancies.filter(v => v.status === 'Open' || v.status === 'Accepting Candidates').length;
    const most = vacancies[0];
    return { total: vacancies.length, open, mostRecentDate: most ? new Date(most.dateAdded).toISOString().split('T')[0] : '', mostRecentTitle: most ? most.title : '' };
  } catch { return { total: 0, open: 0, mostRecentDate: '', mostRecentTitle: '' }; }
}

async function fetchPlacements(restUrl, token, corpId) {
  try {
    const url = `${restUrl}query/Placement?where=jobOrder.clientCorporation.id=${corpId}&fields=id,status,dateAdded&count=100&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const placements = data.data || [];
    const active = placements.filter(p => p.status === 'Active' || p.status === 'Approved').length;
    const most = placements[0];
    return { total: placements.length, active, mostRecentDate: most ? new Date(most.dateAdded).toISOString().split('T')[0] : '' };
  } catch { return { total: 0, active: 0, mostRecentDate: '' }; }
}

async function fetchLeads(restUrl, token, corpId) {
  try {
    const url = `${restUrl}query/Lead?where=clientCorporation.id=${corpId}&fields=id,status,dateAdded&count=100&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const leads = data.data || [];
    const open = leads.filter(l => l.status === 'Open').length;
    return { total: leads.length, open, mostRecentDate: leads[0] ? new Date(leads[0].dateAdded).toISOString().split('T')[0] : '' };
  } catch { return { total: 0, open: 0, mostRecentDate: '' }; }
}

function analyseNotes(notes) {
  const negativeSignals = [];
  const meaningfulNotes = [];

  for (const note of notes) {
    const action = (note.action || '').toLowerCase();
    const comments = (note.comments || '').toLowerCase();
    if (IGNORED_NOTE_ACTIONS.some(ignored => action.includes(ignored))) continue;

    for (const phrase of NEGATIVE_SIGNAL_PHRASES) {
      if (comments.includes(phrase) && !negativeSignals.includes(phrase)) negativeSignals.push(phrase);
    }

    meaningfulNotes.push({
      action: note.action || '',
      date: note.dateAdded ? new Date(note.dateAdded).toISOString().split('T')[0] : '',
      snippet: (note.comments || '').slice(0, 150),
      person: note.personReference ? `${note.personReference.firstName || ''} ${note.personReference.lastName || ''}`.trim() : '',
    });
  }

  return { recentNotes: meaningfulNotes.slice(0, 10), lastMeaningfulActivity: meaningfulNotes[0]?.date || '', negativeSignals };
}

/* ── write operations ─────────────────────────────────────────── */

async function createContact({ firstName, lastName, companyId, title, email, phone }) {
  const body = {
    firstName, lastName, name: `${firstName} ${lastName}`,
    title: title || '', email: email || '', phone: phone || '',
    clientCorporation: { id: companyId },
    status: 'New Lead', type: 'Unknown', source: 'Other',
  };
  return bhFetch('entity/ClientContact', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function addNote(contactId, action, comments) {
  const body = {
    personReference: { id: contactId },
    action: action || 'General Update',
    comments: comments || '',
    dateAdded: Date.now(),
  };
  return bhFetch('entity/Note', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ── exports ──────────────────────────────────────────────────── */

module.exports = {
  setManualToken, clearManualToken, getManualToken, isConfigured, getCredentials,
  searchCompany, searchContact, checkCompany, createContact, addNote,
};
