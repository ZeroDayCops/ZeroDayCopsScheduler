const axios = require('axios');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';
const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'public_profile',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
  'business_management',
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
 * Exchanges authorization code for tokens, discovers pages & linked Instagram accounts, and stores FacebookConnection
 */
async function handleOAuthCallback(code, userId = null) {
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

  // Find existing connection by userId or facebookUserId
  let existingConn = null;
  if (userId) {
    existingConn = await prisma.facebookConnection.findUnique({ where: { userId } });
  }
  if (!existingConn) {
    existingConn = await prisma.facebookConnection.findUnique({ where: { facebookUserId } });
  }

  let connection;
  if (existingConn) {
    connection = await prisma.facebookConnection.update({
      where: { id: existingConn.id },
      data: {
        userId: userId || existingConn.userId,
        facebookUserId,
        facebookName,
        accessTokenEncrypted: encrypt(userAccessToken),
        expiresAt,
        status: 'CONNECTED',
      },
    });
  } else {
    connection = await prisma.facebookConnection.create({
      data: {
        userId: userId || null,
        facebookUserId,
        facebookName,
        accessTokenEncrypted: encrypt(userAccessToken),
        expiresAt,
        status: 'CONNECTED',
      },
    });
  }

  // Step 4: Discover all Facebook Pages and linked Instagram accounts managed by user
  const pages = await discoverPagesForConnection(connection.id, userAccessToken);

  return { connection, pages };
}

/**
 * Generates Instagram-specific OAuth authorization URL using Meta Graph API with Instagram scopes
 */
function getInstagramAuthUrl(state) {
  const config = getFacebookAuthConfig();
  if (!config.isConfigured) {
    throw new Error('Meta App credentials (FACEBOOK_APP_ID & FACEBOOK_APP_SECRET) are missing.');
  }

  const igScopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'public_profile',
    'business_management',
  ];

  const queryParams = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state: `ig_${state}`, // Prefix state to identify Instagram OAuth intent
    scope: igScopes.join(','),
    response_type: 'code',
  });

  return `https://www.facebook.com/v20.0/dialog/oauth?${queryParams.toString()}`;
}

/**
 * Handles OAuth callback specifically for Instagram connection flow, storing an InstagramConnection
 */
async function handleInstagramOAuthCallback(code, userId = null) {
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
  const expiresInSeconds = longLivedRes.data.expires_in || 5184000;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  // Step 3: Fetch Meta profile
  const userRes = await axios.get(`${GRAPH_API_BASE}/me`, {
    params: {
      fields: 'id,name',
      access_token: userAccessToken,
    },
  });

  const instagramUserId = userRes.data.id;
  const instagramName = userRes.data.name;

  // Find existing connection by userId or instagramUserId
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
        instagramName,
        accessTokenEncrypted: encrypt(userAccessToken),
        expiresAt,
        status: 'CONNECTED',
      },
    });
  } else {
    connection = await prisma.instagramConnection.create({
      data: {
        userId: userId || null,
        instagramUserId,
        instagramName,
        accessTokenEncrypted: encrypt(userAccessToken),
        expiresAt,
        status: 'CONNECTED',
      },
    });
  }

  // Step 4: Discover Instagram Professional accounts accessible via this Meta connection
  const accounts = await discoverInstagramAccountsForConnection(connection.id, userAccessToken);

  return { connection, accounts };
}

/**
 * Discovers and saves Instagram Professional accounts for an InstagramConnection
 */
async function discoverInstagramAccountsForConnection(connectionId, overrideUserToken = null) {
  const connection = await prisma.instagramConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) throw new Error('InstagramConnection not found.');

  const userAccessToken = overrideUserToken || decrypt(connection.accessTokenEncrypted);

  const pagesRes = await axios.get(`${GRAPH_API_BASE}/me/accounts`, {
    params: {
      fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
      access_token: userAccessToken,
    },
  });

  const rawPages = pagesRes.data?.data || [];
  const savedAccounts = [];

  for (const p of rawPages) {
    const pageName = p.name;
    const pageAccessToken = p.access_token;
    const igAccount = p.instagram_business_account || null;

    if (igAccount && igAccount.id) {
      let igUsername = igAccount.username;
      let igName = igAccount.name;
      let igPic = igAccount.profile_picture_url;

      if (!igUsername) {
        try {
          const igDetailsRes = await axios.get(`${GRAPH_API_BASE}/${igAccount.id}`, {
            params: {
              fields: 'id,username,name,profile_picture_url',
              access_token: pageAccessToken,
            },
          });
          igUsername = igDetailsRes.data?.username || igUsername;
          igName = igDetailsRes.data?.name || igName;
          igPic = igDetailsRes.data?.profile_picture_url || igPic;
        } catch (igErr) {
          console.warn(`[IG DISCOVERY WARNING] Extended IG fetch error for ${igAccount.id}:`, igErr.message);
        }
      }

      const savedAccount = await prisma.instagramAccount.upsert({
        where: { instagramAccountId: igAccount.id },
        update: {
          username: igUsername || `ig_${igAccount.id}`,
          name: igName || pageName,
          profilePictureUrl: igPic || null,
          instagramConnectionId: connection.id,
          status: 'CONNECTED',
        },
        create: {
          instagramAccountId: igAccount.id,
          username: igUsername || `ig_${igAccount.id}`,
          name: igName || pageName,
          profilePictureUrl: igPic || null,
          instagramConnectionId: connection.id,
          status: 'CONNECTED',
        },
      });

      savedAccounts.push(savedAccount);
    }
  }

  return savedAccounts;
}

/**
 * Discovers Facebook Pages and associated Instagram Professional Accounts
 */
async function discoverPagesForConnection(connectionId, overrideUserToken = null) {
  const connection = await prisma.facebookConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) throw new Error('FacebookConnection not found.');

  const userAccessToken = overrideUserToken || decrypt(connection.accessTokenEncrypted);

  const pagesRes = await axios.get(`${GRAPH_API_BASE}/me/accounts`, {
    params: {
      fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
      access_token: userAccessToken,
    },
  });

  const rawPages = pagesRes.data?.data || [];
  const savedPages = [];

  for (const p of rawPages) {
    const pageId = p.id;
    const pageName = p.name;
    const pageAccessToken = p.access_token;
    const igAccount = p.instagram_business_account || null;

    const savedPage = await prisma.facebookPage.upsert({
      where: { facebookPageId: pageId },
      update: {
        pageName,
        pageAccessTokenEncrypted: encrypt(pageAccessToken),
        instagramBusinessAccountId: igAccount?.id || null,
        status: 'CONNECTED',
      },
      create: {
        facebookConnectionId: connection.id,
        facebookPageId: pageId,
        pageName,
        pageAccessTokenEncrypted: encrypt(pageAccessToken),
        instagramBusinessAccountId: igAccount?.id || null,
        status: 'CONNECTED',
      },
    });

    // Discover & Upsert linked Instagram Professional Account if present
    if (igAccount && igAccount.id) {
      // If full info missing in inline response, query IG object directly
      let igUsername = igAccount.username;
      let igName = igAccount.name;
      let igPic = igAccount.profile_picture_url;

      if (!igUsername) {
        try {
          const igDetailsRes = await axios.get(`${GRAPH_API_BASE}/${igAccount.id}`, {
            params: {
              fields: 'id,username,name,profile_picture_url',
              access_token: pageAccessToken,
            },
          });
          igUsername = igDetailsRes.data?.username || igUsername;
          igName = igDetailsRes.data?.name || igName;
          igPic = igDetailsRes.data?.profile_picture_url || igPic;
        } catch (igErr) {
          console.warn(`[IG DISCOVERY WARNING] Could not fetch extended IG details for ${igAccount.id}:`, igErr.message);
        }
      }

      await prisma.instagramAccount.upsert({
        where: { instagramAccountId: igAccount.id },
        update: {
          username: igUsername || `ig_${igAccount.id}`,
          name: igName || pageName,
          profilePictureUrl: igPic || null,
          facebookPageId: savedPage.id,
          status: 'CONNECTED',
        },
        create: {
          instagramAccountId: igAccount.id,
          username: igUsername || `ig_${igAccount.id}`,
          name: igName || pageName,
          profilePictureUrl: igPic || null,
          facebookPageId: savedPage.id,
          status: 'CONNECTED',
        },
      });

      console.log(`[DISCOVERY] Saved Instagram Account @${igUsername || igAccount.id} connected via Facebook Page "${pageName}".`);
    }

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

/**
 * Helper to validate public media accessibility before invoking Meta APIs
 */
async function validatePublicMediaUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') {
    throw new Error('MEDIA_NOT_PUBLICLY_ACCESSIBLE: Media URL is empty or null.');
  }

  const lower = mediaUrl.toLowerCase();
  if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('192.168.') || lower.includes('10.0.')) {
    throw new Error(`MEDIA_NOT_PUBLICLY_ACCESSIBLE: Local or private IP URL cannot be downloaded by Meta (${mediaUrl}).`);
  }

  try {
    const headRes = await axios.head(mediaUrl, { timeout: 10000 });
    if (headRes.status < 200 || headRes.status >= 300) {
      throw new Error(`MEDIA_NOT_PUBLICLY_ACCESSIBLE: HTTP ${headRes.status} returned when verifying public accessibility.`);
    }
  } catch (err) {
    if (err.message.includes('MEDIA_NOT_PUBLICLY_ACCESSIBLE')) throw err;
    // Try GET with range header as fallback if HEAD is unsupported by R2/CDN
    try {
      const getRes = await axios.get(mediaUrl, { headers: { Range: 'bytes=0-100' }, timeout: 10000 });
      if (getRes.status < 200 || getRes.status >= 300) {
        throw new Error(`MEDIA_NOT_PUBLICLY_ACCESSIBLE: HTTP ${getRes.status} returned.`);
      }
    } catch (getErr) {
      throw new Error(`MEDIA_NOT_PUBLICLY_ACCESSIBLE: Could not verify public reachability for ${mediaUrl}: ${getErr.message}`);
    }
  }
}

/**
 * Publishes an image or video/Reel post to an Instagram Professional Account via official Meta Graph API Container flow
 */
async function createInstagramPost(igAccountDbId, caption, mediaUrl, mediaType = 'IMAGE') {
  const igAccount = await prisma.instagramAccount.findUnique({
    where: { id: igAccountDbId },
    include: { facebookPage: true },
  });

  if (!igAccount) {
    throw new Error(`Instagram Account record ${igAccountDbId} not found in database.`);
  }

  if (!igAccount.facebookPage) {
    throw new Error(`Parent Facebook Page for Instagram Account @${igAccount.username} not found.`);
  }

  const pageAccessToken = decrypt(igAccount.facebookPage.pageAccessTokenEncrypted);
  const igAccountId = igAccount.instagramAccountId;

  // 1. Validate public reachability of media
  await validatePublicMediaUrl(mediaUrl);

  console.log(`[INSTAGRAM PUBLISH] Step 1: Creating container for @${igAccount.username} (${mediaType})...`);

  // 2. Create Media Container
  const containerParams = {
    caption: caption || '',
    access_token: pageAccessToken,
  };

  if (mediaType === 'VIDEO') {
    containerParams.media_type = 'REELS';
    containerParams.video_url = mediaUrl;
  } else {
    containerParams.image_url = mediaUrl;
  }

  let containerRes;
  try {
    containerRes = await axios.post(`${GRAPH_API_BASE}/${igAccountId}/media`, null, {
      params: containerParams,
    });
  } catch (containerErr) {
    console.error(`[INSTAGRAM CONTAINER ERROR]:`, containerErr.response?.data || containerErr.message);
    const metaError = containerErr.response?.data?.error;
    const isPermanent = containerErr.response?.status >= 400 && containerErr.response?.status < 500 && containerErr.response?.status !== 429;
    return {
      success: false,
      isPermanent,
      error: metaError ? `Meta API Error (${metaError.code}): ${metaError.message}` : containerErr.message,
      metaErrorCode: metaError?.code,
      metaErrorType: metaError?.type,
    };
  }

  const containerId = containerRes.data?.id;
  if (!containerId) {
    throw new Error('Meta Graph API failed to return a container ID for Instagram post.');
  }

  console.log(`[INSTAGRAM PUBLISH] Step 2: Container ${containerId} created. Checking processing status...`);

  // 3. Poll container processing status (especially required for Video/Reels, good practice for images)
  const maxWaitMs = 180_000; // 3 minutes max
  let elapsedMs = 0;
  let attempt = 0;
  let isReady = false;

  while (elapsedMs < maxWaitMs) {
    attempt++;
    const delayMs = Math.min(attempt * 3000, 10_000);
    await new Promise(r => setTimeout(r, delayMs));
    elapsedMs += delayMs;

    try {
      const statusRes = await axios.get(`${GRAPH_API_BASE}/${containerId}`, {
        params: {
          fields: 'status_code,status',
          access_token: pageAccessToken,
        },
      });

      const statusCode = statusRes.data?.status_code;
      console.log(`[INSTAGRAM POLL ${attempt}] ${(elapsedMs / 1000).toFixed(0)}s: status_code = ${statusCode}`);

      if (statusCode === 'FINISHED') {
        isReady = true;
        break;
      }
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Instagram media container processing failed with status ${statusCode}.`);
      }
      // 'IN_PROGRESS' or 'PUBLISHED' — continue polling
    } catch (pollErr) {
      if (pollErr.message.includes('processing failed')) throw pollErr;
      console.warn(`[INSTAGRAM POLL WARNING]: ${pollErr.message}`);
    }
  }

  if (!isReady && mediaType === 'VIDEO') {
    throw new Error(`Instagram video processing timed out after ${Math.round(elapsedMs / 1000)} seconds.`);
  }

  // 4. Publish Container
  console.log(`[INSTAGRAM PUBLISH] Step 3: Publishing container ${containerId}...`);
  let publishRes;
  try {
    publishRes = await axios.post(`${GRAPH_API_BASE}/${igAccountId}/media_publish`, null, {
      params: {
        creation_id: containerId,
        access_token: pageAccessToken,
      },
    });
  } catch (pubErr) {
    console.error(`[INSTAGRAM MEDIA_PUBLISH ERROR]:`, pubErr.response?.data || pubErr.message);
    const metaError = pubErr.response?.data?.error;
    const isPermanent = pubErr.response?.status >= 400 && pubErr.response?.status < 500 && pubErr.response?.status !== 429;
    return {
      success: false,
      isPermanent,
      error: metaError ? `Meta API Publish Error (${metaError.code}): ${metaError.message}` : pubErr.message,
      metaErrorCode: metaError?.code,
      metaErrorType: metaError?.type,
    };
  }

  const externalPostId = publishRes.data?.id || `ig-${Date.now()}`;
  console.log(`[INSTAGRAM PUBLISH] ✅ Published successfully to @${igAccount.username}. Media ID: ${externalPostId}`);

  return {
    success: true,
    externalPostId,
    data: publishRes.data,
  };
}

module.exports = {
  getFacebookAuthConfig,
  getAuthUrl,
  getInstagramAuthUrl,
  handleOAuthCallback,
  handleInstagramOAuthCallback,
  discoverPagesForConnection,
  discoverInstagramAccountsForConnection,
  createPagePost,
  createInstagramPost,
  validatePublicMediaUrl,
};

