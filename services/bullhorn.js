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

/**
 * Search Bullhorn for a company by name.
 * Returns { found, id, name, status, dateAdded, owner, lastActivity } or { found: false }
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

    // Get latest notes
    let lastActivity = '';
    try {
      const notesUrl = `${restUrl}entity/ClientCorporation/${corp.id}/allCorpNotes?fields=action,dateAdded&count=1&orderBy=-dateAdded&BhRestToken=${accessToken}`;
      const notesRes = await fetch(notesUrl);
      const notesData = await notesRes.json();
      if (notesData.data && notesData.data.length > 0) {
        const note = notesData.data[0];
        const date = new Date(note.dateAdded);
        lastActivity = date.toISOString().split('T')[0];
      }
    } catch {
      // Notes fetch failed — non-critical
    }

    return {
      found: true,
      id: corp.id,
      name: corp.name,
      status: corp.status || 'Unknown',
      dateAdded: corp.dateAdded ? new Date(corp.dateAdded).toISOString().split('T')[0] : '',
      owner: corp.owner ? `${corp.owner.firstName} ${corp.owner.lastName}` : '',
      lastActivity,
    };
  } catch (err) {
    console.error(`Bullhorn check failed for "${companyName}":`, err.message);
    return { found: false, error: err.message };
  }
}

/**
 * Check if Bullhorn is configured (credentials present).
 */
function isConfigured() {
  return !!(process.env.BULLHORN_CLIENT_ID && process.env.BULLHORN_CLIENT_SECRET);
}

module.exports = { checkCompany, isConfigured, authenticate };
