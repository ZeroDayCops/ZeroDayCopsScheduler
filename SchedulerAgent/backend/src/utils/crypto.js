const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits is recommended for GCM

/**
 * Gets the 32-byte key from TOKEN_ENCRYPTION_KEY env var.
 * Converts from a 64-character hex string or hashes a plain string if needed.
 */
function getEncryptionKey() {
  const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }

  // If it's a 64-char hex string, convert to Buffer
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // Fallback: SHA-256 hash the string to generate a clean 32-byte key
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns string format: iv_hex:authTag_hex:ciphertext_hex
 */
function encrypt(text) {
  if (!text) return null;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts ciphertext format: iv_hex:authTag_hex:ciphertext_hex
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }
    
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('Decryption failed:', err.message);
    throw new Error('Decryption failed. Token might be corrupted or key mismatch.');
  }
}

module.exports = { encrypt, decrypt };
