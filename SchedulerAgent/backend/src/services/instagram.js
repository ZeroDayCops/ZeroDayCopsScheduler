const axios = require('axios');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

/**
 * Instagram API with Instagram Login
 * 
 * Auth URL:      https://www.instagram.com/oauth/authorize
 * Token Exchange: POST https://api.instagram.com/oauth/access_token
 * Long-lived:     GET  https://graph.instagram.com/access_token
 * Profile:        GET  https://graph.instagram.com/me
 * 
 * This does NOT use facebook.com at any point.
 */

function getInstagramAuthConfig() {
  const clientId = (process.env.INSTAGRAM_CLIENT_ID || process.env.FACEBOOK_APP_ID || '').trim();
  const clientSecret = (process.env.INSTAGRAM_CLIENT_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim();
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
 * Generates Instagram OAuth authorization URL using Instagram Login
 * 
 * CRITICAL: This MUST use instagram.com/oauth/authorize, NOT facebook.com
 * Scopes MUST be instagram_business_basic and instagram_business_content_publish
 */
function getInstagramAuthUrl(state) {
  const config = getInstagramAuthConfig();
  if (!config.isConfigured) {
    throw new Error('INSTAGRAM_OAUTH_CONFIGURATION_ERROR: Client ID or Secret missing.');
  }

  // Instagram Business Login permissions (updated Jan 2025)
  // NO facebook page permissions here — this is Instagram-only
  const scopes = [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
  ];

  const queryParams = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(','),
    response_type: 'code',
    state,
  });

  // THIS IS THE FIX: instagram.com, not facebook.com
  const url = `https://www.instagram.com/oauth/authorize?${queryParams.toString()}`;
  console.log('[INSTAGRAM AUTH] Generated authorization URL:', url);
  return url;
}

/**
 * Handles Instagram OAuth callback and token exchange
 * 
 * Step 1: POST api.instagram.com/oauth/access_token → short-lived token
 * Step 2: GET  graph.instagram.com/access_token → long-lived token (60 days)
 * Step 3: GET  graph.instagram.com/me → profile info
 */
async function handleInstagramOAuthCallback(code, userId = null) {
  const config = getInstagramAuthConfig();

  // ──────────────────────────────────────────────────
  // Step 1: Exchange authorization code for SHORT-LIVED token
  // Endpoint: POST https://api.instagram.com/oauth/access_token
  // ──────────────────────────────────────────────────
  let tokenRes;
  try {
    const formData = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      code,
    });

    tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', formData.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch (err) {
    console.error('[INSTAGRAM TOKEN EXCHANGE ERROR]:', err.response?.data || err.message);
    const errorDetails = err.response?.data?.error_message || err.response?.data?.error?.message || err.message;
    throw new Error(`INSTAGRAM_TOKEN_EXCHANGE_FAILED: ${errorDetails}`);
  }

  const shortLivedToken = tokenRes.data.access_token;
  const igUserId = tokenRes.data.user_id; // Instagram returns user_id with the token

  if (!shortLivedToken) {
    throw new Error('INSTAGRAM_TOKEN_EXCHANGE_FAILED: No access token received from Instagram.');
  }

  console.log('[INSTAGRAM] Short-lived token obtained, user_id:', igUserId);

  // ──────────────────────────────────────────────────
  // Step 2: Exchange for LONG-LIVED token (60 days)
  // Endpoint: GET https://graph.instagram.com/access_token
  // ──────────────────────────────────────────────────
  let longLivedToken = shortLivedToken;
  let expiresAt = new Date(Date.now() + 3600 * 1000); // Default 1 hour (short-lived)

  try {
    const longLivedRes = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: config.clientSecret,
        access_token: shortLivedToken,
      },
    });
    if (longLivedRes.data?.access_token) {
      longLivedToken = longLivedRes.data.access_token;
      if (longLivedRes.data.expires_in) {
        expiresAt = new Date(Date.now() + longLivedRes.data.expires_in * 1000);
      } else {
        expiresAt = new Date(Date.now() + 60 * 86400 * 1000); // 60 days default
      }
      console.log('[INSTAGRAM] Long-lived token obtained, expires:', expiresAt.toISOString());
    }
  } catch (longLivedErr) {
    console.warn('[INSTAGRAM LONG LIVED TOKEN WARNING]:', longLivedErr.response?.data || longLivedErr.message);
    // Continue with short-lived token — still functional
  }

  // ──────────────────────────────────────────────────
  // Step 3: Fetch Instagram profile via graph.instagram.com
  // Endpoint: GET https://graph.instagram.com/me
  // ──────────────────────────────────────────────────
  let instagramUserId = igUserId ? String(igUserId) : null;
  let username = null;
  let name = null;
  let profilePictureUrl = null;

  try {
    const meRes = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'id,username,name,account_type,profile_picture_url',
        access_token: longLivedToken,
      },
    });
    instagramUserId = meRes.data.id || instagramUserId;
    username = meRes.data.username;
    name = meRes.data.name || meRes.data.username;
    profilePictureUrl = meRes.data.profile_picture_url || null;
    console.log('[INSTAGRAM] Profile fetched:', { id: instagramUserId, username, accountType: meRes.data.account_type });
  } catch (profErr) {
    console.warn('[INSTAGRAM PROFILE LOOKUP WARNING]:', profErr.response?.data || profErr.message);
  }

  if (!instagramUserId) {
    instagramUserId = `ig_user_${Date.now()}`;
    username = username || `instagram_user_${instagramUserId.slice(-6)}`;
  }

  // ──────────────────────────────────────────────────
  // Step 4: Upsert InstagramConnection (Max 1 per user)
  // ──────────────────────────────────────────────────
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
        instagramUserId,
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

  // ──────────────────────────────────────────────────
  // Step 5: Upsert 1 InstagramAccount for this connection
  // ──────────────────────────────────────────────────
  const account = await prisma.instagramAccount.upsert({
    where: { instagramAccountId: instagramUserId },
    update: {
      username,
      name: name || username,
      profilePictureUrl,
      instagramConnectionId: connection.id,
      status: 'CONNECTED',
    },
    create: {
      instagramAccountId: instagramUserId,
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
