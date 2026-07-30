const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'zerodaycops-scheduler';
const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

let s3Client = null;

if (accessKeyId && secretAccessKey && endpoint) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  console.log('[R2 STORAGE] Cloudflare R2 S3 Client initialized successfully.');
} else {
  console.warn('[R2 STORAGE] Cloudflare R2 credentials missing. Falling back to local disk storage only.');
}

/**
 * Uploads a local file to Cloudflare R2.
 * @param {string} localFilePath Absolute path to local file.
 * @param {string} destinationKey Key/path inside R2 bucket (e.g., workspaceId/filename).
 * @param {string} mimeType Content type of the file.
 * @returns {Promise<{ key: string, publicUrl?: string }>}
 */
async function uploadToR2(localFilePath, destinationKey, mimeType) {
  if (!s3Client) {
    throw new Error('R2 S3 Client is not configured');
  }

  const fileStream = fs.createReadStream(localFilePath);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: destinationKey,
    Body: fileStream,
    ContentType: mimeType,
  });

  await s3Client.send(command);
  console.log(`[R2 STORAGE] Uploaded ${destinationKey} to R2 bucket ${bucketName}`);

  // Build R2 URL or public domain URL if provided
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  const publicUrl = publicDomain 
    ? `${publicDomain.replace(/\/$/, '')}/${destinationKey}`
    : `${endpoint}/${bucketName}/${destinationKey}`;

  return {
    key: destinationKey,
    bucket: bucketName,
    publicUrl,
  };
}

/**
 * Deletes an object from Cloudflare R2.
 * @param {string} key Key inside R2 bucket.
 */
async function deleteFromR2(key) {
  if (!s3Client) return;

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
  console.log(`[R2 STORAGE] Deleted ${key} from R2 bucket ${bucketName}`);
}

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Generates a presigned PUT URL for direct client-to-R2 upload (bypassing Vercel 4.5MB limit).
 */
async function generatePresignedUploadUrl(destinationKey, mimeType) {
  if (!s3Client) {
    throw new Error('R2 S3 Client is not configured');
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: destinationKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  const publicUrl = publicDomain 
    ? `${publicDomain.replace(/\/$/, '')}/${destinationKey}`
    : `${endpoint}/${bucketName}/${destinationKey}`;

  return {
    uploadUrl,
    key: destinationKey,
    bucket: bucketName,
    publicUrl,
  };
}

module.exports = {
  s3Client,
  uploadToR2,
  deleteFromR2,
  generatePresignedUploadUrl,
  bucketName,
};

