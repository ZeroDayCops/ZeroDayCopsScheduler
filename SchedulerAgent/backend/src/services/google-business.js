const axios = require('axios');
const { google } = require('googleapis');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * Returns canonical Google Business Profile OAuth configuration.
 */
function getGbpOAuthConfig() {
  const clientId = (process.env.GOOGLE_BUSINESS_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_BUSINESS_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.GOOGLE_BUSINESS_REDIRECT_URI || 'https://scheduler.zerodaycops.in/api/oauth/google-business/callback').trim();

  const isConfigured = !!(clientId && clientSecret && !clientId.includes('your-') && !clientSecret.includes('your-'));

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured,
  };
}

function getOAuthClient() {
  const config = getGbpOAuthConfig();

  if (!config.isConfigured) {
    throw new Error('Google Business Profile OAuth credentials (GOOGLE_BUSINESS_CLIENT_ID & GOOGLE_BUSINESS_CLIENT_SECRET) are missing or incomplete in environment configuration.');
  }

  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

/**
 * Generates Google OAuth authorization URL for GBP with state token.
 */
function getAuthUrl(state) {
  const oauth2Client = getOAuthClient();
  const config = getGbpOAuthConfig();

  console.log(`[GBP OAUTH] Generating Auth URL with Client ID (${config.clientId.substring(0, 12)}...) and Redirect URI (${config.redirectUri})`);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/**
 * Exchanges authorization code for tokens, discovers account info, and stores GoogleConnection record
 */
async function handleOAuthCallback(code) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Fetch authenticated Google account user info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const googleAccountId = userInfo.data.id;
  const googleEmail = userInfo.data.email;

  const accessTokenEncrypted = encrypt(tokens.access_token);
  const refreshTokenEncrypted = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000);

  // Upsert account-level GoogleConnection
  const existingConn = await prisma.googleConnection.findUnique({
    where: { googleAccountId },
  });

  const finalRefreshTokenEncrypted = refreshTokenEncrypted || existingConn?.refreshTokenEncrypted;
  if (!finalRefreshTokenEncrypted) {
    throw new Error('No refresh token received from Google. Re-prompt consent required.');
  }

  const googleConnection = await prisma.googleConnection.upsert({
    where: { googleAccountId },
    update: {
      googleEmail,
      accessTokenEncrypted,
      refreshTokenEncrypted: finalRefreshTokenEncrypted,
      expiresAt,
      status: 'CONNECTED',
    },
    create: {
      googleAccountId,
      googleEmail,
      accessTokenEncrypted,
      refreshTokenEncrypted: finalRefreshTokenEncrypted,
      expiresAt,
      status: 'CONNECTED',
    },
  });

  // Automatically discover all accessible GBP locations for this connection
  const locations = await discoverLocationsForConnection(googleConnection.id);

  return {
    connection: googleConnection,
    locations,
  };
}

/**
 * Returns valid access token for a GoogleConnection, refreshing if expired
 */
async function getValidAccessToken(connectionId) {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection || connection.status !== 'CONNECTED') {
    throw new Error(`Google connection ${connectionId} is invalid or disconnected.`);
  }

  const decryptedAccess = decrypt(connection.accessTokenEncrypted);
  const decryptedRefresh = decrypt(connection.refreshTokenEncrypted);

  // Check if token is still valid (with 5-minute safety buffer)
  if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return decryptedAccess;
  }

  console.log(`[GOOGLE BUSINESS] Refreshing access token for Google account ${connection.googleAccountId}...`);
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decryptedRefresh });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    const newAccessTokenEncrypted = encrypt(credentials.access_token);
    const newExpiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3600 * 1000);

    await prisma.googleConnection.update({
      where: { id: connectionId },
      data: {
        accessTokenEncrypted: newAccessTokenEncrypted,
        expiresAt: newExpiresAt,
        status: 'CONNECTED',
      },
    });

    return credentials.access_token;
  } catch (refreshErr) {
    console.error(`[GOOGLE BUSINESS] Token refresh failed for account ${connection.googleAccountId}:`, refreshErr.message);
    await prisma.googleConnection.update({
      where: { id: connectionId },
      data: { status: 'EXPIRED' },
    });
    throw new Error(`Google authentication expired for ${connection.googleEmail || connection.googleAccountId}. Please re-authenticate.`);
  }
}

/**
 * Discovers ALL accessible Google Business Profile accounts and locations (with pagination)
 */
async function discoverLocationsForConnection(connectionId) {
  const connection = await prisma.googleConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) throw new Error('GoogleConnection not found.');

  const accessToken = await getValidAccessToken(connectionId);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  let discoveredAccounts = [];
  let apiErrors = [];

  // Step 1: List all accessible Google Business Profile accounts
  try {
    let nextToken = null;
    do {
      const url = `https://mybusinessaccountmanagement.googleapis.com/v1/accounts${nextToken ? `?pageToken=${nextToken}` : ''}`;
      const res = await axios.get(url, { headers: authHeaders });
      if (Array.isArray(res.data?.accounts)) {
        discoveredAccounts.push(...res.data.accounts);
      }
      nextToken = res.data?.nextPageToken || null;
    } while (nextToken);
  } catch (accErr) {
    const errData = accErr.response?.data?.error;
    const msg = errData?.message || accErr.message;
    console.warn('[GOOGLE BUSINESS] Account discovery warning:', msg);
    if (accErr.response?.status === 403 || accErr.response?.status === 429) {
      apiErrors.push(`Account Management API: ${msg}`);
    }
    // Fallback if user account itself is a direct location container
    discoveredAccounts.push({ name: `accounts/${connection.googleAccountId}` });
  }

  const discoveredLocations = [];

  // Step 2: Iterate over each account to discover all accessible locations (with pagination)
  for (const account of discoveredAccounts) {
    const accountName = account.name; // e.g. "accounts/10987654321"
    try {
      let pageToken = null;
      do {
        const queryParams = new URLSearchParams({
          readMask: 'name,title,storefrontAddress,storeCode',
          pageSize: '100',
        });
        if (pageToken) queryParams.set('pageToken', pageToken);

        const locUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${queryParams.toString()}`;
        const res = await axios.get(locUrl, { headers: authHeaders });

        const rawLocations = res.data?.locations || [];
        for (const loc of rawLocations) {
          const locationName = loc.title || 'Google Business Location';
          const addr = loc.storefrontAddress;
          const addressLines = Array.isArray(addr?.addressLines) ? addr.addressLines.join(', ') : '';
          const city = addr?.locality || '';
          const state = addr?.administrativeArea || '';
          const fullAddress = [addressLines, city, state].filter(Boolean).join(', ');

          // Upsert discovered location into DB
          const savedLoc = await prisma.googleBusinessLocation.upsert({
            where: { googleLocationId: loc.name }, // e.g. "locations/123456789"
            update: {
              locationName,
              address: fullAddress || null,
              city: city || null,
              state: state || null,
              metadata: loc,
              status: 'CONNECTED',
            },
            create: {
              googleConnectionId: connection.id,
              googleAccountId: connection.googleAccountId,
              googleLocationId: loc.name,
              locationName,
              address: fullAddress || null,
              city: city || null,
              state: state || null,
              metadata: loc,
              status: 'CONNECTED',
            },
          });
          discoveredLocations.push(savedLoc);
        }

        pageToken = res.data?.nextPageToken || null;
      } while (pageToken);
    } catch (locErr) {
      const errData = locErr.response?.data?.error;
      const msg = errData?.message || locErr.message;
      console.warn(`[GOOGLE BUSINESS] Location discovery warning for account ${accountName}:`, msg);
      if (locErr.response?.status === 403 || locErr.response?.status === 429) {
        apiErrors.push(`Business Information API (${accountName}): ${msg}`);
      }
    }
  }

  if (discoveredLocations.length === 0 && apiErrors.length > 0) {
    console.warn('[GOOGLE BUSINESS] API quota or permission warning during discovery:', apiErrors.join(' | '));
    // Fetch existing saved locations from DB (e.g. manually created or previously synced)
    const existingLocations = await prisma.googleBusinessLocation.findMany({
      where: { googleConnectionId: connection.id },
    });
    return existingLocations;
  }

  console.log(`[GOOGLE BUSINESS] Discovered ${discoveredLocations.length} locations for Google account ${connection.googleEmail}`);
  return discoveredLocations;
}

/**
 * Publishes a Local Post (STANDARD / What's New update) to Google Business Profile API
 */
async function createLocalPost(locationId, postContent, mediaUrl, ctaUrl, ctaAction = 'LEARN_MORE') {
  const location = await prisma.googleBusinessLocation.findUnique({
    where: { id: locationId },
    include: { googleConnection: true },
  });

  if (!location) {
    throw new Error(`Google Business Location ${locationId} not found.`);
  }

  const accessToken = await getValidAccessToken(location.googleConnectionId);

  // Map supported CTA action types
  const VALID_CTAS = new Set(['BOOK', 'LEARN_MORE', 'ORDER', 'SHOP', 'SIGN_UP']);
  const finalCtaAction = VALID_CTAS.has(ctaAction?.toUpperCase()) ? ctaAction.toUpperCase() : 'LEARN_MORE';

  // Format Local Post payload according to Google My Business API v4 schema
  const payload = {
    languageCode: 'en-US',
    summary: postContent.body || postContent.title || 'New Update from Brand',
    postState: 'LIVE',
    topicType: 'STANDARD',
  };

  // Add public media URL if available
  if (mediaUrl) {
    payload.media = [
      {
        mediaFormat: mediaUrl.match(/\.(mp4|mov|webm)$/i) ? 'VIDEO' : 'PHOTO',
        sourceUrl: mediaUrl,
      },
    ];
  }

  // Add Call To Action button if URL is present
  if (ctaUrl && ctaUrl.trim()) {
    payload.callToAction = {
      actionType: finalCtaAction,
      url: ctaUrl.trim(),
    };
  }

  const gbpLocationName = location.googleLocationId; // e.g. "accounts/123/locations/456" or "locations/456"
  const postEndpoint = `https://mybusiness.googleapis.com/v4/${gbpLocationName}/localPosts`;

  console.log(`[GOOGLE BUSINESS PUBLISH] Posting Local Post to ${location.locationName} (${gbpLocationName})...`);

  const response = await axios.post(postEndpoint, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const externalPostId = response.data?.name || response.data?.searchUrl || `gbp-${Date.now()}`;
  console.log(`[GOOGLE BUSINESS PUBLISH] ✅ Published successfully to ${location.locationName}. Post Resource ID: ${externalPostId}`);

  return {
    success: true,
    externalPostId,
    data: response.data,
  };
}

module.exports = {
  getGbpOAuthConfig,
  getAuthUrl,
  handleOAuthCallback,
  getValidAccessToken,
  discoverLocationsForConnection,
  createLocalPost,
};
