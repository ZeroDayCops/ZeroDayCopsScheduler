const axios = require('axios');
const { google } = require('googleapis');
const prisma = require('../prisma');
const { encrypt, decrypt } = require('../utils/crypto');

const BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

/**
 * Proactively refreshes the SocialAccount's access token if it's expired or close to it.
 * Marks status as EXPIRED if the refresh token itself is invalid.
 */
async function refreshTokenIfNeeded(socialAccountId) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: socialAccountId },
  });

  if (!account) {
    throw new Error(`SocialAccount not found: ${socialAccountId}`);
  }

  // If not connected, we cannot refresh
  if (account.status === 'NOT_CONNECTED') {
    return account;
  }

  const now = new Date();
  const expiresAt = account.expiresAt ? new Date(account.expiresAt) : null;

  // If expiresAt is null (non-expiring token / mock mode), OR if expiresAt is more than 5 minutes in the future,
  // OR if we don't have a refresh token stored, use the existing token directly.
  const isTokenStillValid = !expiresAt || (expiresAt.getTime() - now.getTime() > BUFFER_MS);
  if (isTokenStillValid || !account.refreshTokenEncrypted) {
    console.log(`[OAUTH REFRESH] Using token directly for ${account.platform} (account: ${account.accountName}) — token valid, non-expiring, or no refresh token stored.`);
    return account;
  }

  console.log(`[OAUTH REFRESH] Token for ${account.platform} is expired or expiring soon. Attempting refresh...`);

  // Decrypt refresh token safely without mutating DB on decryption failure
  let refreshToken;
  try {
    refreshToken = decrypt(account.refreshTokenEncrypted);
  } catch (decErr) {
    console.error(`[OAUTH REFRESH ERROR] Failed to decrypt refresh token for ${account.platform}:`, decErr.message);
    throw new Error(`Refresh token decryption failed: ${decErr.message}`);
  }

  // Handle mock refresh if ALLOW_MOCK_OAUTH is enabled or if using mock tokens
  if ((process.env.ALLOW_MOCK_OAUTH === 'true' || refreshToken?.startsWith('mock_')) && refreshToken !== 'mock_revoked_token') {
    console.log(`[OAUTH REFRESH] Simulating mock token refresh for ${account.platform}`);
    return prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: {
        accessTokenEncrypted: encrypt('mock_access_token_' + account.platform.toLowerCase() + '_refreshed'),
        expiresAt: new Date(Date.now() + 3600 * 1000),
        status: 'CONNECTED',
      },
    });
  }

  // Handle Real token refresh per platform
  try {
    if (!refreshToken || refreshToken === 'mock_revoked_token') {
      const revErr = new Error('OAuth credentials revoked');
      revErr.isRevoked = true;
      throw revErr;
    }

    if (account.platform === 'LINKEDIN') {
      // LinkedIn refresh token exchange
      const bodyParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      });

      const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', bodyParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in, refresh_token: new_refresh_token } = response.data;
      
      const updateData = {
        accessTokenEncrypted: encrypt(access_token),
        expiresAt: new Date(Date.now() + expires_in * 1000),
        status: 'CONNECTED',
      };

      if (new_refresh_token) {
        updateData.refreshTokenEncrypted = encrypt(new_refresh_token);
      }

      return prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: updateData,
      });
    }

    if (account.platform === 'PINTEREST') {
      // Pinterest refresh token exchange (uses basic auth client credentials header)
      const authHeader = Buffer.from(`${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`).toString('base64');
      const bodyParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const pinterestApiBase = process.env.PINTEREST_API_BASE || 'https://api.pinterest.com';

      const response = await axios.post(`${pinterestApiBase}/v5/oauth/token`, bodyParams, {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in, refresh_token: new_refresh_token } = response.data;

      const updateData = {
        accessTokenEncrypted: encrypt(access_token),
        expiresAt: new Date(Date.now() + expires_in * 1000),
        status: 'CONNECTED',
      };

      if (new_refresh_token) {
        updateData.refreshTokenEncrypted = encrypt(new_refresh_token);
      }

      return prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: updateData,
      });
    }

    if (account.platform === 'YOUTUBE') {
      // YouTube/Google OAuth2 refresh
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        'http://localhost:3001/api/oauth/youtube/callback'
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const refreshRes = await oauth2Client.refreshAccessToken();
      const tokens = refreshRes.credentials;

      const updateData = {
        accessTokenEncrypted: encrypt(tokens.access_token),
        expiresAt: new Date(tokens.expiry_date),
        status: 'CONNECTED',
      };

      if (tokens.refresh_token) {
        updateData.refreshTokenEncrypted = encrypt(tokens.refresh_token);
      }

      return prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: updateData,
      });
    }
  } catch (err) {
    const errorBody = err.response?.data;
    const isExplicitRevocation =
      err.isRevoked ||
      (err.response?.status === 400 &&
        (errorBody?.error === 'invalid_grant' ||
         errorBody?.error === 'unauthorized_client' ||
         errorBody?.error_description?.includes('revoked')));

    if (isExplicitRevocation) {
      console.warn(`[OAUTH REFRESH] Refresh token explicitly revoked by provider for ${account.platform}. Marking status as EXPIRED.`);
      await prisma.socialAccount.update({
        where: { id: socialAccountId },
        data: {
          status: 'EXPIRED',
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          expiresAt: null,
        },
      });
    } else {
      console.error(`[OAUTH REFRESH TRANSIENT ERROR] Refresh attempt failed for ${account.platform} (preserving CONNECTED status):`, errorBody || err.message);
    }

    throw new Error(`Token refresh failed: ${err.message}`);
  }
}

module.exports = { refreshTokenIfNeeded };
