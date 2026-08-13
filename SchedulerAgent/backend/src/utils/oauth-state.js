const crypto = require('crypto');

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes validity

function getSecretKey() {
  const key = process.env.JWT_SECRET || process.env.TOKEN_ENCRYPTION_KEY || 'default-fallback-secret-key-32bits!';
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Creates an encrypted & HMAC-signed OAuth state string containing workspaceId, userId, timestamp, and nonce.
 */
function createOAuthState(workspaceId, userId) {
  if (!workspaceId) throw new Error('workspaceId is required for state generation.');

  const payload = JSON.stringify({
    workspaceId,
    userId: userId || null,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(12).toString('hex'),
  });

  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return Buffer.from(JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
    tag: authTag,
  })).toString('base64url');
}

/**
 * Decrypts and validates the HMAC-signed state parameter.
 * Throws an Error if state is invalid, tampered with, or expired (> 15 mins).
 */
function verifyOAuthState(stateToken) {
  if (!stateToken) throw new Error('State parameter is missing.');

  try {
    const rawJson = Buffer.from(stateToken, 'base64url').toString('utf8');
    const { iv, data, tag } = JSON.parse(rawJson);

    const key = getSecretKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    const payload = JSON.parse(decrypted);

    if (!payload.workspaceId) {
      throw new Error('Invalid state payload structure.');
    }

    if (Date.now() - payload.timestamp > STATE_TTL_MS) {
      throw new Error('OAuth authorization session expired. Please click connect again.');
    }

    return {
      workspaceId: payload.workspaceId,
      userId: payload.userId,
    };
  } catch (err) {
    if (err.message.includes('expired')) throw err;
    throw new Error(`OAuth state verification failed: ${err.message}`);
  }
}

module.exports = {
  createOAuthState,
  verifyOAuthState,
};
