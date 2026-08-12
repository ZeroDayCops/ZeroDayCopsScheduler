const fs = require('fs');
const path = require('path');
const os = require('os');
const { s3Client, uploadToR2, deleteFromR2, downloadFromR2, generatePresignedUploadUrl, bucketName } = require('./r2Storage');
const { GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Resolves a stored filepath or key into an absolute local path if it exists locally,
 * or returns null if it is strictly a remote object storage key.
 */
function resolveLocalPath(filepathOrKey) {
  if (!filepathOrKey) return null;
  if (path.isAbsolute(filepathOrKey) && fs.existsSync(filepathOrKey)) {
    return filepathOrKey;
  }
  const baseUploads = process.env.VERCEL || process.env.NODE_ENV === 'production'
    ? path.join(os.tmpdir(), 'uploads')
    : path.resolve(__dirname, '../../../uploads');

  const cleanKey = filepathOrKey.replace(/^uploads[\/\\]?/, '');
  const candidatePath = path.join(baseUploads, cleanKey);
  if (fs.existsSync(candidatePath)) {
    return candidatePath;
  }
  return null;
}

/**
 * Verifies if an object exists and is non-empty either on local disk or Cloudflare R2.
 */
async function exists(keyOrPath) {
  const local = resolveLocalPath(keyOrPath);
  if (local) return true;

  if (s3Client && keyOrPath) {
    try {
      const cleanKey = keyOrPath.replace(/^uploads[\/\\]?/, '');
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: cleanKey,
      });
      const res = await s3Client.send(command);
      return res.ContentLength > 0;
    } catch (err) {
      return false;
    }
  }
  return false;
}

/**
 * Gets metadata (ContentLength, ContentType) for an object on local disk or R2.
 */
async function headObject(keyOrPath) {
  const local = resolveLocalPath(keyOrPath);
  if (local) {
    const stats = fs.statSync(local);
    const ext = path.extname(local).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
    };
    return {
      contentLength: stats.size,
      contentType: mimeMap[ext] || 'application/octet-stream',
      isLocal: true,
      localPath: local,
    };
  }

  if (s3Client && keyOrPath) {
    const cleanKey = keyOrPath.replace(/^uploads[\/\\]?/, '');
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
    });
    const res = await s3Client.send(command);
    return {
      contentLength: res.ContentLength,
      contentType: res.ContentType || 'application/octet-stream',
      isLocal: false,
      r2Key: cleanKey,
    };
  }

  throw new Error(`Media object not found: ${keyOrPath}`);
}

/**
 * Obtains a readable stream for a media asset regardless of whether it lives on local disk or R2.
 */
async function getReadStream(keyOrPath) {
  const local = resolveLocalPath(keyOrPath);
  if (local) {
    return fs.createReadStream(local);
  }

  if (s3Client && keyOrPath) {
    const cleanKey = keyOrPath.replace(/^uploads[\/\\]?/, '');
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: cleanKey,
    });
    const response = await s3Client.send(command);
    return response.Body;
  }

  throw new Error(`Media asset missing from all storage providers: ${keyOrPath}`);
}

/**
 * Downloads a media asset to a specified target local path.
 */
async function downloadFile(keyOrPath, targetLocalPath) {
  const local = resolveLocalPath(keyOrPath);
  if (local) {
    if (local !== targetLocalPath) {
      fs.mkdirSync(path.dirname(targetLocalPath), { recursive: true });
      fs.copyFileSync(local, targetLocalPath);
    }
    return targetLocalPath;
  }

  if (s3Client && keyOrPath) {
    const cleanKey = keyOrPath.replace(/^uploads[\/\\]?/, '');
    return await downloadFromR2(cleanKey, targetLocalPath);
  }

  throw new Error(`Cannot download media file; not found in local or R2 storage: ${keyOrPath}`);
}

/**
 * Deletes a media asset from local disk and/or R2 storage.
 */
async function deleteObject(keyOrPath) {
  const local = resolveLocalPath(keyOrPath);
  if (local) {
    try {
      fs.unlinkSync(local);
    } catch (err) {}
  }

  if (s3Client && keyOrPath) {
    const cleanKey = keyOrPath.replace(/^uploads[\/\\]?/, '');
    try {
      await deleteFromR2(cleanKey);
    } catch (err) {}
  }
}

/**
 * Obtains a validated, readable Buffer and MIME metadata for a Media model instance.
 * Checks local disk cache first, falls back to downloading from Cloudflare R2 if missing,
 * and validates that the resulting buffer is non-empty.
 */
async function getReadableMedia(media) {
  if (!media) return { error: 'Media parameter is null or undefined' };

  const keyOrPath = media.r2Key || media.filepath;
  if (!keyOrPath) return { error: 'No storage key or filepath defined on media' };

  const ext = path.extname(media.filename) || (media.mediaType === 'VIDEO' ? '.mp4' : '.jpg');
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
  };
  const mimeType = mimeMap[ext.toLowerCase()] || 'image/jpeg';

  // 1. Try local disk path
  const local = resolveLocalPath(keyOrPath);
  if (local && fs.existsSync(local)) {
    try {
      const stats = fs.statSync(local);
      if (stats.size > 0) {
        const buffer = fs.readFileSync(local);
        if (buffer && buffer.length > 0) {
          return {
            buffer,
            mimeType,
            contentLength: buffer.length,
            isLocal: true,
            path: local,
          };
        }
      }
    } catch (localErr) {
      console.warn(`[STORAGE PROVIDER] Failed reading local file ${local}:`, localErr.message);
    }
  }

  // 2. Try Cloudflare R2 object download
  const tempDownloadPath = path.join(os.tmpdir(), `r2-fetch-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  try {
    const downloadedPath = await downloadFile(keyOrPath, tempDownloadPath);
    if (downloadedPath && fs.existsSync(downloadedPath)) {
      const stats = fs.statSync(downloadedPath);
      if (stats.size > 0) {
        const buffer = fs.readFileSync(downloadedPath);
        if (buffer && buffer.length > 0) {
          return {
            buffer,
            mimeType,
            contentLength: buffer.length,
            isLocal: false,
            tempPath: downloadedPath,
          };
        }
      }
    }
  } catch (r2Err) {
    console.warn(`[STORAGE PROVIDER] Failed downloading media from R2 for ${keyOrPath}:`, r2Err.message);
  }

  return {
    error: `Media file missing or unreadable in local disk and R2 storage: ${keyOrPath}`,
    mediaId: media.id,
  };
}

module.exports = {
  resolveLocalPath,
  exists,
  headObject,
  getReadStream,
  downloadFile,
  deleteObject,
  getReadableMedia,
  uploadToR2,
  generatePresignedUploadUrl,
  s3Client,
  bucketName,
};
