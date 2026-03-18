/**
 * Bullhorn CRM integration via REST API with OAuth.
 */

let tokenCache = { accessToken: null, restUrl: null, expiresAt: 0 };

/**
 * Authenticate with Bullhorn and obtain a REST token.
 * Flow: OAuth authorize → token → REST login
 */
async function authenticate() {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache;
  }

  const { BULLHORN_CLIENT_ID, BULLHORN_CLIENT_SECRET, BULLHORN_USERNAME, BULLHORN_PASSWORD } = process.env;

  if (!BULLHORN_CLIENT_ID || !BULLHORN_CLIENT_SECRET) {
    throw new Error('Bullhorn credentials not configured');
  }

  // Step 1: Get authorization code
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
  const code = codeMatch[1];

  // Step 2: Exchange code for access token
  const tokenUrl = 'https://auth.bullhornstaffing.com/oauth/token';
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: BULLHORN_CLIENT_ID,
    client_secret: BULLHORN_CLIENT_SECRET,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get Bullhorn access token');

  // Step 3: REST login
  const loginUrl = `https://rest.bullhornstaffing.com/rest-services/login?version=*&access_token=${tokenData.access_token}`;
  const loginRes = await fetch(loginUrl, { method: 'POST' });
  const loginData = await loginRes.json();

  if (!loginData.BhRestToken) throw new Error('Failed to get Bullhorn REST token');

  tokenCache = {
    accessToken: loginData.BhRestToken,
    restUrl: loginData.restUrl,
    expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes (tokens last ~5 min)
  };

  return tokenCache;
}

// Note types to ignore (mass outreach, not meaningful BD activity)
const IGNORED_NOTE_ACTIONS = ['mailshot', 'mass email', 'bulk email', 'mass mail', 'email blast'];

// Phrases that indicate negative client signals
const NEGATIVE_SIGNAL_PHRASES = [
  'not interested', 'do not contact', 'do not call', 'dnc',
  'no longer hiring', 'hiring freeze', 'not looking to work with',
  'declined', 'rejected', 'no recruitment agencies', 'no agencies',
  'psc only', 'internal only', 'preferred supplier', 'not on psl',
  'bad experience', 'complaint', 'do not approach', 'blacklist',
  'cease contact', 'unsubscribe', 'opt out', 'removed from list',
];

/**
 * Search Bullhorn for a company by name.
 * Returns deep activity data: vacancies, placements, recent notes, negative signals.
 */
async function checkCompany(companyName) {
  try {
    const { accessToken, restUrl } = await authenticate();

    // Search ClientCorporation
    const searchUrl = `${restUrl}search/ClientCorporation?query=name:"${encodeURIComponent(companyName)}"&fields=id,name,status,dateAdded,owner&count=1&BhRestToken=${accessToken}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.data || searchData.data.length === 0) {
      return { found: false };
    }

    const corp = searchData.data[0];
    const corpId = corp.id;

    // Run all lookups in parallel
    const [notesData, vacancyData, placementData, leadsData] = await Promise.all([
      fetchNotes(restUrl, accessToken, corpId),
      fetchVacancies(restUrl, accessToken, corpId),
      fetchPlacements(restUrl, accessToken, corpId),
      fetchLeads(restUrl, accessToken, corpId),
    ]);

    // Analyse notes for meaningful activity and negative signals
    const { recentNotes, lastMeaningfulActivity, negativeSignals } = analyseNotes(notesData);

    // Build status summary
    const statusParts = [corp.status || 'Unknown'];
    if (vacancyData.total > 0) statusParts.push(`${vacancyData.total} vacancies (${vacancyData.open} open)`);
    if (placementData.total > 0) statusParts.push(`${placementData.total} placements`);
    if (negativeSignals.length > 0) statusParts.push(`WARNING: ${negativeSignals.join('; ')}`);

    return {
      found: true,
      id: corpId,
      name: corp.name,
      status: statusParts.join(' | '),
      dateAdded: corp.dateAdded ? new Date(corp.dateAdded).toISOString().split('T')[0] : '',
      owner: corp.owner ? `${corp.owner.firstName} ${corp.owner.lastName}` : '',
      lastActivity: lastMeaningfulActivity,
      vacancies: vacancyData,
      placements: placementData,
      leads: leadsData,
      recentNotes,
      negativeSignals,
    };
  } catch (err) {
    console.error(`Bullhorn check failed for "${companyName}":`, err.message);
    return { found: false, error: err.message };
  }
}

/**
 * Fetch recent notes for a company, excluding mailshots/mass emails.
 */
async function fetchNotes(restUrl, token, corpId) {
  try {
    const url = `${restUrl}entity/ClientCorporation/${corpId}/allCorpNotes?fields=action,dateAdded,comments,personReference&count=50&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.data || []);
  } catch {
    return [];
  }
}

/**
 * Fetch vacancy (job order) counts and recent activity.
 */
async function fetchVacancies(restUrl, token, corpId) {
  try {
    const url = `${restUrl}query/JobOrder?where=clientCorporation.id=${corpId}&fields=id,title,status,dateAdded&count=100&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const vacancies = data.data || [];
    const open = vacancies.filter(v => v.status === 'Open' || v.status === 'Accepting Candidates').length;
    const mostRecent = vacancies[0];
    return {
      total: vacancies.length,
      open,
      mostRecentDate: mostRecent ? new Date(mostRecent.dateAdded).toISOString().split('T')[0] : '',
      mostRecentTitle: mostRecent ? mostRecent.title : '',
    };
  } catch {
    return { total: 0, open: 0, mostRecentDate: '', mostRecentTitle: '' };
  }
}

/**
 * Fetch placement counts and recent activity.
 */
async function fetchPlacements(restUrl, token, corpId) {
  try {
    const url = `${restUrl}query/Placement?where=jobOrder.clientCorporation.id=${corpId}&fields=id,status,dateAdded,jobOrder&count=100&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const placements = data.data || [];
    const active = placements.filter(p => p.status === 'Active' || p.status === 'Approved').length;
    const mostRecent = placements[0];
    return {
      total: placements.length,
      active,
      mostRecentDate: mostRecent ? new Date(mostRecent.dateAdded).toISOString().split('T')[0] : '',
    };
  } catch {
    return { total: 0, active: 0, mostRecentDate: '' };
  }
}

/**
 * Fetch lead counts for a company.
 */
async function fetchLeads(restUrl, token, corpId) {
  try {
    const url = `${restUrl}query/Lead?where=clientCorporation.id=${corpId}&fields=id,status,dateAdded&count=100&orderBy=-dateAdded&BhRestToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const leads = data.data || [];
    const open = leads.filter(l => l.status === 'Open').length;
    return {
      total: leads.length,
      open,
      mostRecentDate: leads[0] ? new Date(leads[0].dateAdded).toISOString().split('T')[0] : '',
    };
  } catch {
    return { total: 0, open: 0, mostRecentDate: '' };
  }
}

/**
 * Analyse notes for meaningful activity and negative signals.
 * Filters out mailshots/mass emails. Scans for negative client sentiment.
 */
function analyseNotes(notes) {
  const negativeSignals = [];
  const meaningfulNotes = [];

  for (const note of notes) {
    const action = (note.action || '').toLowerCase();
    const comments = (note.comments || '').toLowerCase();

    // Skip mailshots and mass emails
    if (IGNORED_NOTE_ACTIONS.some(ignored => action.includes(ignored))) continue;

    // Check for negative signals in comments
    for (const phrase of NEGATIVE_SIGNAL_PHRASES) {
      if (comments.includes(phrase) && !negativeSignals.includes(phrase)) {
        negativeSignals.push(phrase);
      }
    }

    meaningfulNotes.push({
      action: note.action || '',
      date: note.dateAdded ? new Date(note.dateAdded).toISOString().split('T')[0] : '',
      snippet: (note.comments || '').slice(0, 150),
      person: note.personReference
        ? `${note.personReference.firstName || ''} ${note.personReference.lastName || ''}`.trim()
        : '',
    });
  }

  // Most recent meaningful note date
  const lastMeaningfulActivity = meaningfulNotes.length > 0 ? meaningfulNotes[0].date : '';

  return {
    recentNotes: meaningfulNotes.slice(0, 10), // Top 10 meaningful notes
    lastMeaningfulActivity,
    negativeSignals,
  };
}

/**
 * Check if Bullhorn is configured (credentials present).
 */
function isConfigured() {
  return !!(process.env.BULLHORN_CLIENT_ID && process.env.BULLHORN_CLIENT_SECRET);
}

module.exports = { checkCompany, isConfigured, authenticate };
