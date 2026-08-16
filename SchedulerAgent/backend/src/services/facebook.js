const axios = require('axios');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';
const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'public_profile',
];

function getFacebookAuthConfig() {
  const appId = (process.env.FACEBOOK_APP_ID || '1076195244968677').trim();
  const appSecret = (process.env.FACEBOOK_APP_SECRET || '4b8ec01ea27c80dde5857498086f03d1').trim();
  const redirectUri = (process.env.FACEBOOK_REDIRECT_URI || 'https://scheduler.zerodaycops.in/api/oauth/facebook/callback').trim();

  const isConfigured = !!(appId && appSecret && !appId.includes('your-') && !appSecret.includes('your-'));

  return {
    appId,
    appSecret,
    redirectUri,
    isConfigured,
  };
}

/**
 * Generates Facebook OAuth authorization URL
 */
function getAuthUrl(state) {
  const config = getFacebookAuthConfig();
  if (!config.isConfigured) {
    throw new Error('Facebook App credentials (FACEBOOK_APP_ID & FACEBOOK_APP_SECRET) are missing.');
  }

  const queryParams = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    scope: SCOPES.join(','),
    response_type: 'code',
  });

  return `https://www.facebook.com/v20.0/dialog/oauth?${queryParams.toString()}`;
}

/**
 * Exchanges authorization code for tokens, discovers pages, and stores FacebookConnection
 */
async function handleOAuthCallback(code) {
  const config = getFacebookAuthConfig();

  // Step 1: Exchange code for short-lived user token
  const tokenRes = await axios.get(`${GRAPH_API_BASE}/oauth/access_token`, {
    params: {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code,
    },
  });

  const shortLivedToken = tokenRes.data.access_token;

  // Step 2: Exchange for long-lived user token (60 days)
  const longLivedRes = await axios.get(`${GRAPH_API_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });

  const userAccessToken = longLivedRes.data.access_token;
  const expiresInSeconds = longLivedRes.data.expires_in || 5184000; // 60 days default
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  // Step 3: Fetch User profile
  const userRes = await axios.get(`${GRAPH_API_BASE}/me`, {
    params: {
      fields: 'id,name',
      access_token: userAccessToken,
    },
  });

  const facebookUserId = userRes.data.id;
  const facebookName = userRes.data.name;

  // Upsert FacebookConnection
  const connection = await prisma.facebookConnection.upsert({
    where: { facebookUserId },
    update: {
      facebookName,
      accessTokenEncrypted: encrypt(userAccessToken),
      expiresAt,
      status: 'CONNECTED',
    },
    create: {
      facebookUserId,
      facebookName,
      accessTokenEncrypted: encrypt(userAccessToken),
      expiresAt,
      status: 'CONNECTED',
    },
  });

  // Step 4: Discover all Facebook Pages managed by user
  const pages = await discoverPagesForConnection(connection.id, userAccessToken);

  return { connection, pages };
}

/**
 * Discovers Facebook Pages managed by the user connection
 */
async function discoverPagesForConnection(connectionId, overrideUserToken = null) {
  const connection = await prisma.facebookConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) throw new Error('FacebookConnection not found.');

  const userAccessToken = overrideUserToken || decrypt(connection.accessTokenEncrypted);

  const pagesRes = await axios.get(`${GRAPH_API_BASE}/me/accounts`, {
    params: {
      fields: 'id,name,access_token,instagram_business_account',
      access_token: userAccessToken,
    },
  });

  const rawPages = pagesRes.data?.data || [];
  const savedPages = [];

  for (const p of rawPages) {
    const pageId = p.id;
    const pageName = p.name;
    const pageAccessToken = p.access_token;
    const igAccountId = p.instagram_business_account?.id || null;

    const savedPage = await prisma.facebookPage.upsert({
      where: { facebookPageId: pageId },
      update: {
        pageName,
        pageAccessTokenEncrypted: encrypt(pageAccessToken),
        instagramBusinessAccountId: igAccountId,
        status: 'CONNECTED',
      },
      create: {
        facebookConnectionId: connection.id,
        facebookPageId: pageId,
        pageName,
        pageAccessTokenEncrypted: encrypt(pageAccessToken),
        instagramBusinessAccountId: igAccountId,
        status: 'CONNECTED',
      },
    });

    savedPages.push(savedPage);
  }

  return savedPages;
}

/**
 * Publishes a post to a Facebook Page (feed message or photo post)
 */
async function createPagePost(pageDbId, message, mediaUrl = null, destinationUrl = null) {
  const page = await prisma.facebookPage.findUnique({
    where: { id: pageDbId },
  });

  if (!page) {
    throw new Error(`Facebook Page ${pageDbId} not found.`);
  }

  const pageAccessToken = decrypt(page.pageAccessTokenEncrypted);

  let response;
  if (mediaUrl) {
    // Post Photo to Page
    response = await axios.post(`${GRAPH_API_BASE}/${page.facebookPageId}/photos`, null, {
      params: {
        url: mediaUrl,
        caption: message || '',
        access_token: pageAccessToken,
      },
    });
  } else {
    // Post Text/Link Feed Post
    const payload = {
      message: message || '',
      access_token: pageAccessToken,
    };
    if (destinationUrl) {
      payload.link = destinationUrl;
    }

    response = await axios.post(`${GRAPH_API_BASE}/${page.facebookPageId}/feed`, null, {
      params: payload,
    });
  }

  const externalPostId = response.data?.id || response.data?.post_id || `fb-${Date.now()}`;
  console.log(`[FACEBOOK PUBLISH] ✅ Published successfully to ${page.pageName}. Post ID: ${externalPostId}`);

  return {
    success: true,
    externalPostId,
    data: response.data,
  };
}

module.exports = {
  getFacebookAuthConfig,
  getAuthUrl,
  handleOAuthCallback,
  discoverPagesForConnection,
  createPagePost,
};
