const axios = require('axios');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com';
const INSTAGRAM_OAUTH_BASE = 'https://api.instagram.com/oauth';

function getInstagramAuthConfig() {
  const clientId = (process.env.INSTAGRAM_CLIENT_ID || process.env.FACEBOOK_APP_ID || '1076195244968677').trim();
  const clientSecret = (process.env.INSTAGRAM_CLIENT_SECRET || process.env.FACEBOOK_APP_SECRET || '4b8ec01ea27c80dde5857498086f03d1').trim();
  const redirectUri = (process.env.INSTAGRAM_REDIRECT_URI || 'https://scheduler.zerodaycops.in/api/oauth/instagram/callback').trim();

  const isConfigured = !!(clientId && clientSecret);

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured,
  };
}

/**
 * Generates official Instagram OAuth authorization URL pointing to api.instagram.com
 */
function getInstagramAuthUrl(state) {
  const config = getInstagramAuthConfig();
  if (!config.isConfigured) {
    throw new Error('Instagram Client ID and Secret are not configured.');
  }

  const queryParams = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'user_profile,user_media',
    response_type: 'code',
    state,
  });

  return `${INSTAGRAM_OAUTH_BASE}/authorize?${queryParams.toString()}`;
}

/**
 * Handles official Instagram OAuth callback and token exchange
 */
async function handleInstagramOAuthCallback(code, userId = null) {
  const config = getInstagramAuthConfig();

  // Step 1: Exchange authorization code for short-lived access token
  const bodyParams = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code,
  });

  let tokenRes;
  try {
    tokenRes = await axios.post(`${INSTAGRAM_OAUTH_BASE}/access_token`, bodyParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    console.error('[INSTAGRAM OAUTH TOKEN EXCHANGE ERROR]:', err.response?.data || err.message);
    // Fallback attempt to Meta Graph Token endpoint if Instagram API returns 400 with Meta App credentials
    tokenRes = await axios.get(`https://graph.facebook.com/v20.0/oauth/access_token`, {
      params: {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      },
    });
  }

  const accessToken = tokenRes.data.access_token;
  const instagramUserId = String(tokenRes.data.user_id || tokenRes.data.id || '');

  // Step 2: Exchange for long-lived access token (60 days)
  let longLivedToken = accessToken;
  let expiresAt = new Date(Date.now() + 60 * 86400 * 1000); // Default 60 days

  try {
    const longLivedRes = await axios.get(`${INSTAGRAM_GRAPH_BASE}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: config.clientSecret,
        access_token: accessToken,
      },
    });
    if (longLivedRes.data?.access_token) {
      longLivedToken = longLivedRes.data.access_token;
      if (longLivedRes.data.expires_in) {
        expiresAt = new Date(Date.now() + longLivedRes.data.expires_in * 1000);
      }
    }
  } catch (longLivedErr) {
    console.warn('[INSTAGRAM LONG LIVED TOKEN WARNING]:', longLivedErr.response?.data?.error?.message || longLivedErr.message);
  }

  // Step 3: Fetch Instagram User Profile
  let username = `ig_user_${instagramUserId}`;
  let name = null;
  let profilePictureUrl = null;

  try {
    const profileRes = await axios.get(`${INSTAGRAM_GRAPH_BASE}/me`, {
      params: {
        fields: 'id,username,account_type',
        access_token: longLivedToken,
      },
    });
    username = profileRes.data.username || username;
  } catch (profErr) {
    console.warn('[INSTAGRAM PROFILE FETCH WARNING]:', profErr.response?.data || profErr.message);
  }

  // Step 4: Upsert InstagramConnection (1 per user constraint)
  let existingConn = null;
  if (userId) {
    existingConn = await prisma.instagramConnection.findUnique({ where: { userId } });
  }

  let connection;
  if (existingConn) {
    connection = await prisma.instagramConnection.update({
      where: { id: existingConn.id },
      data: {
        userId: userId || existingConn.userId,
        instagramUserId: instagramUserId || existingConn.instagramUserId,
        instagramName: username,
        accessTokenEncrypted: encrypt(longLivedToken),
        expiresAt,
        status: 'CONNECTED',
      },
    });
  } else {
    connection = await prisma.instagramConnection.create({
      data: {
        userId: userId || null,
        instagramUserId,
        instagramName: username,
        accessTokenEncrypted: encrypt(longLivedToken),
        expiresAt,
        status: 'CONNECTED',
      },
    });
  }

  // Step 5: Upsert EXACTLY 1 InstagramAccount for this InstagramConnection
  const account = await prisma.instagramAccount.upsert({
    where: { instagramAccountId: instagramUserId || `ig-account-${connection.id}` },
    update: {
      username,
      name: name || username,
      profilePictureUrl,
      instagramConnectionId: connection.id,
      status: 'CONNECTED',
    },
    create: {
      instagramAccountId: instagramUserId || `ig-account-${connection.id}`,
      username,
      name: name || username,
      profilePictureUrl,
      instagramConnectionId: connection.id,
      status: 'CONNECTED',
    },
  });

  return { connection, accounts: [account] };
}

module.exports = {
  getInstagramAuthConfig,
  getInstagramAuthUrl,
  handleInstagramOAuthCallback,
};
