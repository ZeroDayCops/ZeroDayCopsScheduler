const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { encrypt } = require('../utils/crypto');

const router = express.Router();

function getRedirectUriBase(req) {
  if (process.env.REDIRECT_URI_BASE && !process.env.REDIRECT_URI_BASE.includes('localhost')) {
    return process.env.REDIRECT_URI_BASE.replace(/\/$/, '');
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'scheduler.zerodaycops.in';
  return `${protocol}://${host}/api/oauth`;
}

const { createOAuthState, verifyOAuthState } = require('../utils/oauth-state');

const fbService = require('../services/facebook');
const gbpService = require('../services/google-business');

// Helper to determine if credentials are configured
function isConfigured(platform) {
  if (platform.toUpperCase() === 'GOOGLE_BUSINESS') {
    return gbpService.getGbpOAuthConfig().isConfigured;
  }
  if (platform.toUpperCase() === 'FACEBOOK' || platform.toUpperCase() === 'INSTAGRAM') {
    return fbService.getFacebookAuthConfig().isConfigured;
  }
  const envPrefix = platform.toUpperCase();
  const id = process.env[`${envPrefix}_CLIENT_ID`];
  const secret = process.env[`${envPrefix}_CLIENT_SECRET`];
  
  return !!(id && secret && !id.includes('your-') && !secret.includes('your-'));
}

/**
 * GET /api/oauth/config-status
 * Returns whether LinkedIn, Pinterest, YouTube, Google Business, and Facebook credentials are configured.
 */
router.get('/config-status', requireAuth, (req, res) => {
  res.json({
    config: {
      LINKEDIN: isConfigured('LINKEDIN'),
      PINTEREST: isConfigured('PINTEREST'),
      YOUTUBE: isConfigured('YOUTUBE'),
      GOOGLE_BUSINESS: isConfigured('GOOGLE_BUSINESS'),
      FACEBOOK: isConfigured('FACEBOOK'),
      INSTAGRAM: isConfigured('INSTAGRAM'),
    }
  });
});

/**
 * GET /api/oauth/google-business/health
 * Safe diagnostic endpoint returning Google Business Profile configuration status without secrets.
 */
router.get('/google-business/health', requireAuth, (req, res) => {
  const config = gbpService.getGbpOAuthConfig();
  res.json({
    configured: config.isConfigured,
    clientIdConfigured: !!config.clientId,
    clientIdFingerprint: config.clientId ? `${config.clientId.substring(0, 12)}...` : null,
    clientSecretConfigured: !!config.clientSecret,
    redirectUriConfigured: !!config.redirectUri,
    redirectUri: config.redirectUri,
    environment: process.env.NODE_ENV || 'production',
  });
});

/**
 * GET /api/oauth/google-business/connect
 * Starts Google Business Profile OAuth flow with HMAC-signed state.
 */
router.get('/google-business/connect', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }
    const stateToken = createOAuthState(workspaceId, req.userId);
    const url = gbpService.getAuthUrl(stateToken);
    res.redirect(url);
  } catch (err) {
    console.error('[GBP OAUTH CONNECT ERROR]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/oauth/google-business/callback
 * Handles Google Business Profile OAuth redirect callback with HMAC state verification.
 */
router.get('/google-business/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      console.error(`[GBP OAUTH CALLBACK ERROR] Provider returned error: ${error} — ${error_description}`);
      return res.redirect(`/settings?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}#connections`);
    }
    if (!code) {
      return res.redirect('/settings?error=No+code+provided#connections');
    }

    const { workspaceId } = verifyOAuthState(state);
    const { connection, locations } = await gbpService.handleOAuthCallback(code);

    // Auto-link discovered locations to the workspace
    if (workspaceId && locations.length > 0) {
      for (const loc of locations) {
        await prisma.workspaceGoogleLocation.upsert({
          where: {
            workspaceId_googleBusinessLocationId: {
              workspaceId,
              googleBusinessLocationId: loc.id,
            },
          },
          update: {},
          create: {
            workspaceId,
            googleBusinessLocationId: loc.id,
          },
        });
      }
    }

    res.redirect(`/settings?gbpConnected=true&locationsCount=${locations.length}&workspaceId=${workspaceId || ''}#connections`);
  } catch (err) {
    console.error('[GBP OAUTH CALLBACK ERROR]:', err.message);
    res.redirect(`/settings?error=${encodeURIComponent(err.message)}#connections`);
  }
});

/**
 * GET /api/oauth/facebook/connect
 * Starts Facebook OAuth flow with HMAC-signed state
 */
router.get('/facebook/connect', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }
    const stateToken = createOAuthState(workspaceId, req.userId);
    const url = fbService.getAuthUrl(stateToken);
    res.redirect(url);
  } catch (err) {
    console.error('[FACEBOOK OAUTH CONNECT ERROR]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/oauth/instagram/connect
 * Starts Instagram OAuth flow via Meta with HMAC-signed state
 */
router.get('/instagram/connect', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }
    const stateToken = createOAuthState(workspaceId, req.userId);
    const url = fbService.getInstagramAuthUrl(stateToken);
    res.redirect(url);
  } catch (err) {
    console.error('[INSTAGRAM OAUTH CONNECT ERROR]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/oauth/facebook/callback
 * Handles Facebook and Instagram OAuth redirect callbacks from Meta
 */
router.get('/facebook/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      console.error(`[META OAUTH CALLBACK ERROR] Provider error: ${error} — ${error_description}`);
      return res.redirect(`/settings?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}#connections`);
    }
    if (!code) {
      return res.redirect('/settings?error=No+code+provided#connections');
    }

    const isIgState = typeof state === 'string' && state.startsWith('ig_');
    const rawState = isIgState ? state.substring(3) : state;
    const { workspaceId, userId } = verifyOAuthState(rawState);

    if (isIgState) {
      // Instagram OAuth flow
      const { connection, accounts } = await fbService.handleInstagramOAuthCallback(code, userId);
      if (workspaceId && accounts.length > 0) {
        for (const ig of accounts) {
          await prisma.workspaceInstagramAccount.upsert({
            where: {
              workspaceId_instagramAccountId: {
                workspaceId,
                instagramAccountId: ig.id,
              },
            },
            update: {},
            create: {
              workspaceId,
              instagramAccountId: ig.id,
            },
          });
        }
      }
      return res.redirect(`/settings?igConnected=true&accountsCount=${accounts.length}&workspaceId=${workspaceId || ''}#connections`);
    } else {
      // Facebook OAuth flow
      const { connection, pages } = await fbService.handleOAuthCallback(code, userId);
      if (workspaceId && pages.length > 0) {
        for (const p of pages) {
          await prisma.workspaceFacebookPage.upsert({
            where: {
              workspaceId_facebookPageId: {
                workspaceId,
                facebookPageId: p.id,
              },
            },
            update: {},
            create: {
              workspaceId,
              facebookPageId: p.id,
            },
          });
        }
      }
      return res.redirect(`/settings?fbConnected=true&pagesCount=${pages.length}&workspaceId=${workspaceId || ''}#connections`);
    }
  } catch (err) {
    console.error('[META OAUTH CALLBACK ERROR]:', err.message);
    res.redirect(`/settings?error=${encodeURIComponent(err.message)}#connections`);
  }
});

/**
 * GET /api/oauth/:platform/connect
 * Redirects the user to the provider's OAuth page.
 * Query: ?workspaceId=...
 */
router.get('/:platform/connect', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId query parameter is required' });
    }

    const upperPlatform = platform.toUpperCase().replace('-', '_');
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE', 'GOOGLE_BUSINESS'];
    if (!validPlatforms.includes(upperPlatform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Verify workspace access
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: (await prisma.workspace.findUnique({ where: { id: workspaceId } }))?.organizationId || '',
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Workspace organization membership required' });
    }

    // If member, check explicit workspace access
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      const access = await prisma.workspaceAccess.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.userId,
            workspaceId,
          },
        },
      });
      if (!access) {
        return res.status(403).json({ error: 'No access to this workspace' });
      }
    }

    const redirectUriBase = getRedirectUriBase(req);

    // Check if we should use mock OAuth flow (only in dev or when explicitly requested via ?mock=true)
    const useMock = req.query.mock === 'true' || (process.env.ALLOW_MOCK_OAUTH === 'true' && process.env.NODE_ENV === 'development');
    if (useMock) {
      const redirectUri = `${redirectUriBase}/${platform.toLowerCase()}/callback`;
      return res.redirect(`${redirectUri}?code=mock_authorization_code&state=${workspaceId}`);
    }

    // Handle redirect error if client credentials are not configured
    if (!isConfigured(upperPlatform)) {
      const platformNames = {
        LINKEDIN: 'LinkedIn',
        PINTEREST: 'Pinterest',
        YOUTUBE: 'YouTube'
      };
      const platformName = platformNames[upperPlatform] || upperPlatform;
      return res.send(`
        <html>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px;">
              <h1 style="color: #ef4444; margin-top: 0;">Configuration Required</h1>
              <p style="line-height: 1.6;">${platformName} isn't configured yet — add ${upperPlatform}_CLIENT_ID and ${upperPlatform}_CLIENT_SECRET to your .env file</p>
              <button onclick="window.close()" style="background: #ef4444; color: #ffffff; border: none; padding: 0.75rem 1.5rem; font-weight: bold; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    // Real Provider Redirections
    const state = workspaceId;

    if (upperPlatform === 'LINKEDIN') {
      const redirectUri = (process.env.LINKEDIN_REDIRECT_URI && !process.env.LINKEDIN_REDIRECT_URI.includes('localhost')) 
        ? process.env.LINKEDIN_REDIRECT_URI 
        : `${redirectUriBase}/linkedin/callback`;
      // Base scopes for personal posting
      let scopes = 'w_member_social openid profile';
      // Add org scopes only if enabled (requires Community Management API approval from LinkedIn)
      if (process.env.LINKEDIN_ORG_SCOPES === 'true') {
        scopes += ' r_organization_social w_organization_social';
      }
      const encodedScopes = encodeURIComponent(scopes);
      const linkedInUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodedScopes}&prompt=login`;
      console.log('[OAUTH CONNECT] Generated LinkedIn auth URL:', linkedInUrl);
      return res.redirect(linkedInUrl);
    }

    if (upperPlatform === 'PINTEREST') {
      const redirectUri = `${redirectUriBase}/pinterest/callback`;
      const pinterestUrl = `https://www.pinterest.com/oauth/?consumer_id=${process.env.PINTEREST_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=boards:read,boards:write,pins:read,pins:write,user_accounts:read&state=${state}`;
      return res.redirect(pinterestUrl);
    }

    if (upperPlatform === 'YOUTUBE') {
      const redirectUri = (process.env.YOUTUBE_REDIRECT_URI && !process.env.YOUTUBE_REDIRECT_URI.includes('localhost'))
        ? process.env.YOUTUBE_REDIRECT_URI
        : `${redirectUriBase}/youtube/callback`;
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        redirectUri
      );
      
      const googleUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'select_account consent',
        scope: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly'
        ],
        state,
      });
      
      return res.redirect(googleUrl);
    }

  } catch (err) {
    console.error('OAuth connect route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/oauth/:platform/callback
 * Exchanges authorization code for tokens, encrypts them, and connects SocialAccount.
 * Query: ?code=...&state=workspaceId
 */
router.get('/:platform/callback', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state: workspaceId, error: oauthError, error_description: oauthErrorDesc } = req.query;

    console.log(`[OAUTH CALLBACK] Platform: ${platform}, Full req.query:`, req.query);

    // Handle OAuth provider error responses (e.g. user denied, invalid scopes, wrong redirect_uri)
    if (oauthError) {
      console.error(`[OAUTH CALLBACK ERROR] Provider returned error: ${oauthError} — ${oauthErrorDesc}`);
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 550px;">
              <h1 style="color: #ef4444; margin-top: 0;">Authorization Failed</h1>
              <p style="line-height: 1.6;"><strong>${oauthError}</strong></p>
              <p style="line-height: 1.6; color: #94a3b8; font-size: 0.9rem;">${oauthErrorDesc || 'The provider denied the authorization request. Check your app configuration (redirect URI, scopes).'}</p>
              <button onclick="window.close()" style="background: #ef4444; color: #ffffff; border: none; padding: 0.75rem 1.5rem; font-weight: bold; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    if (!code || !workspaceId) {
      return res.status(400).json({ error: 'code and state (workspaceId) are required' });
    }

    const upperPlatform = platform.toUpperCase();
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    if (!validPlatforms.includes(upperPlatform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Double check workspace authorization
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No membership in this organization' });
    }

    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      const access = await prisma.workspaceAccess.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.userId,
            workspaceId,
          },
        },
      });
      if (!access) {
        return res.status(403).json({ error: 'No access to this workspace' });
      }
    }

    // Handle mock connection if ALLOW_MOCK_OAUTH is enabled
    let tokenData = {};
    let accountName = '';
    let externalAccountId = '';
    let isMock = false;

    if (code === 'mock_authorization_code') {
      if (process.env.ALLOW_MOCK_OAUTH !== 'true') {
        return res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center; background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <h1 style="color: #ef4444; margin-top: 0;">Connection Failed</h1>
                <p>Mock OAuth connections are disabled. Please configure real API credentials in .env.</p>
                <button onclick="window.close()" style="background: #ef4444; color: #ffffff; border: none; padding: 0.75rem 1.5rem; font-weight: bold; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem;">Close Window</button>
              </div>
            </body>
          </html>
        `);
      }
      isMock = true;
      tokenData = {
        access_token: 'mock_access_token_' + upperPlatform.toLowerCase(),
        refresh_token: 'mock_refresh_token_' + upperPlatform.toLowerCase(),
        expires_in: 3600
      };
      accountName = `Mock ${platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase()} Account`;
      externalAccountId = `mock-${platform.toLowerCase()}-id`;
    } else {
      if (!isConfigured(upperPlatform)) {
        return res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
              <div style="text-align: center; background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <h1 style="color: #ef4444; margin-top: 0;">Connection Failed</h1>
                <p>OAuth credentials are not configured for ${upperPlatform}.</p>
                <button onclick="window.close()" style="background: #ef4444; color: #ffffff; border: none; padding: 0.75rem 1.5rem; font-weight: bold; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem;">Close Window</button>
              </div>
            </body>
          </html>
        `);
      }
    }

    const redirectUriBase = getRedirectUriBase(req);

    if (!isMock) {
      if (upperPlatform === 'LINKEDIN') {
        const redirectUri = (process.env.LINKEDIN_REDIRECT_URI && !process.env.LINKEDIN_REDIRECT_URI.includes('localhost')) 
          ? process.env.LINKEDIN_REDIRECT_URI 
          : `${redirectUriBase}/linkedin/callback`;
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      });

      let response;
      try {
        response = await axios.post(
          'https://www.linkedin.com/oauth/v2/accessToken',
          bodyParams,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );
      } catch (error) {
        console.error('LinkedIn token exchange failed:');
        console.error('Status:', error.response?.status);
        console.error('Full error body:', JSON.stringify(error.response?.data, null, 2));
        console.error('Request body sent:', bodyParams.toString());
        throw error;
      }

      const { access_token, expires_in, refresh_token } = response.data;
      tokenData = {
        access_token,
        refresh_token,
        expires_in,
      };

      // Fetch user profile to get display name and external id
      const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      accountName = profileResponse.data.name || `${profileResponse.data.given_name} ${profileResponse.data.family_name}`;
      externalAccountId = profileResponse.data.sub;

      // Fetch company pages the user is an admin of
      try {
        const orgsResponse = await axios.get(
          'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,logoV2)))',
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
              'LinkedIn-Version': '202606',
            },
          }
        );
        const elements = orgsResponse.data?.elements || [];
        tokenData.pagesJson = elements.map(el => ({
          id: String(el['organization~']?.id || ''),
          name: el['organization~']?.localizedName || '',
        })).filter(p => p.id && p.name);
        if (tokenData.pagesJson.length === 0) tokenData.pagesJson = null;
        console.log(`[LINKEDIN] Found ${tokenData.pagesJson?.length || 0} company page(s).`);
      } catch (orgErr) {
        console.warn('[LINKEDIN] Could not fetch org pages (may need Community Management API access):', orgErr.response?.data?.message || orgErr.message);
        tokenData.pagesJson = null;
      }
    }

    if (upperPlatform === 'PINTEREST') {
      const redirectUri = `${redirectUriBase}/pinterest/callback`;
      const authHeader = Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64');
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        continuous_refresh: 'true',
      });

      const pinterestApiBase = process.env.PINTEREST_API_BASE || 'https://api.pinterest.com';

      const response = await axios.post(`${pinterestApiBase}/v5/oauth/token`, bodyParams, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in, refresh_token } = response.data;
      tokenData = {
        access_token,
        refresh_token,
        expires_in,
      };

      // Fetch Pinterest user profile
      const profileResponse = await axios.get(`${pinterestApiBase}/v5/user_account`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      accountName = profileResponse.data.username;
      externalAccountId = profileResponse.data.username; // Or distinct ID if available
    }

    if (upperPlatform === 'YOUTUBE') {
      const redirectUri = (process.env.YOUTUBE_REDIRECT_URI && !process.env.YOUTUBE_REDIRECT_URI.includes('localhost'))
        ? process.env.YOUTUBE_REDIRECT_URI
        : `${redirectUriBase}/youtube/callback`;
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        redirectUri
      );

      const exchangeRes = await oauth2Client.getToken(code);
      const tokens = exchangeRes.tokens;
      oauth2Client.setCredentials(tokens);

      tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date, // absolute timestamp from google
      };

      // Fetch user profile info using youtube API
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const channelsRes = await youtube.channels.list({
        part: 'snippet',
        mine: true,
      });

      const channel = channelsRes.data.items?.[0];
      accountName = channel?.snippet?.title || 'YouTube Channel';
      externalAccountId = channel?.id || 'unknown-id';
    }
    }

    // Save tokens and update database via upsert (creates SocialAccount record if missing)
    const expiresAtDate = tokenData.expires_at 
      ? new Date(tokenData.expires_at) 
      : (tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null);

    const updateData = {
      status: 'CONNECTED',
      accountName,
      externalAccountId,
      accessTokenEncrypted: encrypt(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
      expiresAt: expiresAtDate,
      ...(tokenData.pagesJson !== undefined ? { pagesJson: tokenData.pagesJson } : {}),
    };

    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId,
          platform: upperPlatform,
        },
      },
      update: updateData,
      create: {
        workspaceId,
        platform: upperPlatform,
        ...updateData,
      },
    });

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Connection Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 1rem;">
          <div style="text-align: center; background: #0d1220; border: 1px solid rgba(255,255,255,0.1); padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); max-width: 440px; width: 100%;">
            <div style="width: 56px; height: 56px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; color: #34d399; font-size: 1.75rem; font-weight: bold;">✓</div>
            <h1 style="color: #ffffff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.5rem; tracking: -0.025em;">Connection Successful!</h1>
            <p style="color: #94a3b8; font-size: 0.875rem; margin: 0 0 1.5rem; line-height: 1.5;">${upperPlatform} account linked: <strong style="color: #f8fafc;">${accountName}</strong></p>
            <button onclick="handleDone()" style="width: 100%; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; border: none; padding: 0.875rem 1.5rem; font-size: 0.875rem; font-weight: 700; border-radius: 0.75rem; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3); transition: transform 0.1s;">Return to Dashboard</button>
            <p style="color: #64748b; font-size: 0.75rem; margin-top: 1rem;">Redirecting back automatically in 2 seconds...</p>
          </div>
          <script>
            function handleDone() {
              if (window.opener && !window.opener.closed) {
                try { window.opener.postMessage({ type: 'OAUTH_SUCCESS', platform: '${upperPlatform}' }, '*'); } catch(e){}
                window.close();
              } else {
                window.location.href = '${FRONTEND_URL}/?connected=${upperPlatform}';
              }
            }
            setTimeout(handleDone, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const errorMsg = err.message || 'Connection failed';
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Connection Failed</title></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 1rem;">
          <div style="text-align: center; background: #0d1220; border: 1px solid rgba(244, 63, 94, 0.2); padding: 2.5rem; border-radius: 1.5rem; max-width: 440px; width: 100%;">
            <div style="width: 56px; height: 56px; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; color: #fb7185; font-size: 1.5rem; font-weight: bold;">✕</div>
            <h1 style="color: #ffffff; font-size: 1.5rem; font-weight: 800; margin: 0 0 0.5rem;">Connection Failed</h1>
            <p style="color: #fb7185; font-size: 0.875rem; margin: 0 0 1.5rem; line-height: 1.5;">${errorMsg}</p>
            <button onclick="handleDone()" style="width: 100%; background: #f43f5e; color: #ffffff; border: none; padding: 0.875rem 1.5rem; font-size: 0.875rem; font-weight: 700; border-radius: 0.75rem; cursor: pointer;">Return to App</button>
          </div>
          <script>
            function handleDone() {
              if (window.opener && !window.opener.closed) {
                window.close();
              } else {
                window.location.href = '${FRONTEND_URL}/?error=${encodeURIComponent(errorMsg)}';
              }
            }
          </script>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/oauth/:platform/mock-connect
 * Connects the platform in mock developer mode.
 */
router.post('/:platform/mock-connect', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId in body is required' });
    }

    const upperPlatform = platform.toUpperCase();
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    if (!validPlatforms.includes(upperPlatform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const accountNames = {
      LINKEDIN: 'Developer LinkedIn Profile',
      PINTEREST: 'Developer Pinterest Board',
      YOUTUBE: 'Developer YouTube Channel',
    };

    const externalAccountIds = {
      LINKEDIN: 'mock-linkedin-id',
      PINTEREST: 'mock-pinterest-board-id',
      YOUTUBE: 'mock-youtube-channel-id',
    };

    // upsert or update the social account to CONNECTED with a mock token
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId,
          platform: upperPlatform,
        },
      },
      update: {
        status: 'CONNECTED',
        accountName: accountNames[upperPlatform],
        externalAccountId: externalAccountIds[upperPlatform],
        accessTokenEncrypted: encrypt('mock_developer_access_token'),
        refreshTokenEncrypted: encrypt('mock_developer_refresh_token'),
        expiresAt: null,
      },
      create: {
        workspaceId,
        platform: upperPlatform,
        status: 'CONNECTED',
        accountName: accountNames[upperPlatform],
        externalAccountId: externalAccountIds[upperPlatform],
        accessTokenEncrypted: encrypt('mock_developer_access_token'),
        refreshTokenEncrypted: encrypt('mock_developer_refresh_token'),
        expiresAt: null,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Mock connect error:', err);
    res.status(500).json({ error: 'Failed to link mock account' });
  }
});

/**
 * PUT /api/oauth/:platform/author
 * Updates the selectedAuthorUrn for a social account (e.g. switch between personal profile and company page).
 */
router.put('/:platform/author', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const { workspaceId, selectedAuthorUrn } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const upperPlatform = platform.toUpperCase();

    // Verify workspace access
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No membership in this organization' });
    }

    const updated = await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId,
          platform: upperPlatform,
        },
      },
      update: {
        selectedAuthorUrn: selectedAuthorUrn || null,
      },
      create: {
        workspaceId,
        platform: upperPlatform,
        status: 'NOT_CONNECTED',
        selectedAuthorUrn: selectedAuthorUrn || null,
      },
    });

    console.log(`[OAUTH] Updated ${upperPlatform} author URN to: ${updated.selectedAuthorUrn || 'personal profile'}`);
    res.json({ success: true, selectedAuthorUrn: updated.selectedAuthorUrn });
  } catch (err) {
    console.error('Update author URN error:', err);
    res.status(500).json({ error: 'Failed to update author URN' });
  }
});

/**
 * POST /api/oauth/:platform/disconnect
 * Clears stored tokens and flips status back to NOT_CONNECTED.
 */
router.post('/:platform/disconnect', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId in body is required' });
    }

    const upperPlatform = platform.toUpperCase();
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    if (!validPlatforms.includes(upperPlatform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Verify workspace access
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No membership in this organization' });
    }

    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId,
          platform: upperPlatform,
        },
      },
      update: {
        status: 'NOT_CONNECTED',
        accountName: null,
        externalAccountId: null,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        expiresAt: null,
        selectedAuthorUrn: null,
        pagesJson: null,
      },
      create: {
        workspaceId,
        platform: upperPlatform,
        status: 'NOT_CONNECTED',
      },
    });

    console.log(`[OAUTH] Disconnected ${upperPlatform} for workspace ${workspaceId}`);
    res.json({ success: true, message: `${upperPlatform} disconnected successfully` });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

/**
 * POST /api/oauth/facebook/disconnect
 * Disconnects the user's Facebook OAuth Connection & revokes workspace page mappings
 */
router.post('/facebook/disconnect', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.body || {};
    const userId = req.userId;

    // Delete or disconnect user's FacebookConnection
    const conn = await prisma.facebookConnection.findFirst({
      where: { OR: [{ userId }, { pages: { some: { workspacePages: { some: { workspaceId } } } } }] },
    });

    if (conn) {
      await prisma.facebookConnection.delete({ where: { id: conn.id } });
    }

    res.json({ success: true, message: 'Facebook Account disconnected successfully' });
  } catch (err) {
    console.error('[FB DISCONNECT ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to disconnect Facebook Account' });
  }
});

/**
 * POST /api/oauth/instagram/disconnect
 * Disconnects the user's Instagram OAuth Connection & revokes workspace account mappings
 */
router.post('/instagram/disconnect', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.body || {};
    const userId = req.userId;

    const conn = await prisma.instagramConnection.findFirst({
      where: { OR: [{ userId }, { accounts: { some: { workspaceAccounts: { some: { workspaceId } } } } }] },
    });

    if (conn) {
      await prisma.instagramConnection.delete({ where: { id: conn.id } });
    }

    res.json({ success: true, message: 'Instagram Account disconnected successfully' });
  } catch (err) {
    console.error('[IG DISCONNECT ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to disconnect Instagram Account' });
  }
});

/**
 * GET /api/oauth/google-business/connections
 * Lists all connected Google accounts & discovered locations
 */
router.get('/google-business/connections', requireAuth, async (req, res) => {
  try {
    const connections = await prisma.googleConnection.findMany({
      include: {
        locations: {
          include: {
            workspaceLocations: {
              include: {
                workspace: {
                  select: { id: true, brandName: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ connections });
  } catch (err) {
    console.error('[GBP CONNECTIONS ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to fetch Google Business connections' });
  }
});

/**
 * POST /api/oauth/google-business/sync-locations
 * Re-runs location discovery for a GoogleConnection
 */
router.post('/google-business/sync-locations', requireAuth, async (req, res) => {
  try {
    const { connectionId } = req.body || {};
    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required' });
    }

    const locations = await gbpService.discoverLocationsForConnection(connectionId);
    res.json({ success: true, count: locations.length, locations });
  } catch (err) {
    console.error('[GBP SYNC ERROR]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
