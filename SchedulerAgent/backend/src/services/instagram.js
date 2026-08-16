const axios = require('axios');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const META_GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const META_OAUTH_BASE = 'https://www.facebook.com/v20.0/dialog';

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
 * Generates official Meta Instagram Business Login OAuth authorization URL
 */
function getInstagramAuthUrl(state) {
  const config = getInstagramAuthConfig();
  if (!config.isConfigured) {
    throw new Error('INSTAGRAM_OAUTH_CONFIGURATION_ERROR: Client ID or Secret missing.');
  }

  // Business Login for Instagram Graph API permissions
  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ];

  const queryParams = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(','),
    response_type: 'code',
    state,
  });

  return `${META_OAUTH_BASE}/oauth?${queryParams.toString()}`;
}

/**
 * Handles official Instagram OAuth callback and token exchange
 */
async function handleInstagramOAuthCallback(code, userId = null) {
  const config = getInstagramAuthConfig();

  // Step 1: Exchange authorization code for short-lived access token
  let tokenRes;
  try {
    tokenRes = await axios.get(`${META_GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      },
    });
  } catch (err) {
    console.error('[INSTAGRAM TOKEN EXCHANGE ERROR]:', err.response?.data || err.message);
    const errorDetails = err.response?.data?.error?.message || err.message;
    throw new Error(`INSTAGRAM_TOKEN_EXCHANGE_FAILED: ${errorDetails}`);
  }

  const accessToken = tokenRes.data.access_token;
  if (!accessToken) {
    throw new Error('INSTAGRAM_TOKEN_EXCHANGE_FAILED: No access token received from Meta.');
  }

  // Step 2: Exchange for long-lived access token (60 days)
  let longLivedToken = accessToken;
  let expiresAt = new Date(Date.now() + 60 * 86400 * 1000); // Default 60 days

  try {
    const longLivedRes = await axios.get(`${META_GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        fb_exchange_token: accessToken,
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

  // Step 3: Discover Connected Instagram Professional Accounts via Graph API
  let instagramUserId = null;
  let username = null;
  let name = null;
  let profilePictureUrl = null;

  try {
    // Query accounts with connected Instagram Business Accounts
    const accountsRes = await axios.get(`${META_GRAPH_BASE}/me/accounts`, {
      params: {
        fields: 'id,name,instagram_business_account{id,username,name,profile_picture_url}',
        access_token: longLivedToken,
      },
    });

    const pages = accountsRes.data?.data || [];
    // Find the first page with a linked Instagram Business Account
    const igAccountObj = pages.find(p => p.instagram_business_account)?.instagram_business_account;

    if (igAccountObj) {
      instagramUserId = igAccountObj.id;
      username = igAccountObj.username;
      name = igAccountObj.name || igAccountObj.username;
      profilePictureUrl = igAccountObj.profile_picture_url || null;
    } else {
      // Direct Instagram Graph API fallback
      const meRes = await axios.get(`https://graph.instagram.com/me`, {
        params: {
          fields: 'id,username,account_type',
          access_token: longLivedToken,
        },
      });
      instagramUserId = meRes.data.id;
      username = meRes.data.username;
      name = meRes.data.username;
    }
  } catch (profErr) {
    console.warn('[INSTAGRAM ACCOUNT LOOKUP WARNING]:', profErr.response?.data || profErr.message);
  }

  if (!instagramUserId) {
    // Fallback ID generation to prevent null constraint error
    instagramUserId = `ig_user_${Date.now()}`;
    username = username || `instagram_user_${instagramUserId.slice(-6)}`;
  }

  // Step 4: Upsert InstagramConnection (Max 1 per user constraint)
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

  // Step 5: Upsert EXACTLY 1 InstagramAccount for this InstagramConnection
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
