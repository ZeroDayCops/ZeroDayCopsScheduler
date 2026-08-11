const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { renderPost } = require('../services/renderer');
const { regenerateCaption, parseMasterJson } = require('../services/openrouter');

const router = express.Router();

async function getAccessibleMedia(req, res) {
  const media = await prisma.media.findUnique({
    where: { id: req.params.id },
    include: { workspace: true },
  });

  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return null;
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: req.userId,
        organizationId: media.workspace.organizationId,
      },
    },
  });

  if (!membership) {
    res.status(403).json({ error: 'No membership in this organization' });
    return null;
  }

  if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
    const access = await prisma.workspaceAccess.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId,
          workspaceId: media.workspaceId,
        },
      },
    });
    if (!access) {
      res.status(403).json({ error: 'No access to this workspace' });
      return null;
    }
  }

  return media;
}

async function refreshPendingPostSnapshots(media) {
  const pendingPosts = await prisma.scheduledPost.findMany({
    where: {
      mediaId: media.id,
      status: { in: ['PENDING', 'PENDING_REVIEW'] },
    },
    select: { id: true, platform: true },
  });

  const refreshedPostIds = [];
  for (const post of pendingPosts) {
    let template = await prisma.template.findFirst({
      where: { workspaceId: media.workspaceId, platform: post.platform },
    });
    if (!template) {
      template = await prisma.template.findFirst({
        where: { workspaceId: null, platform: post.platform, isDefault: true },
      });
    }
    if (!template) {
      console.warn(`[CAPTION EDIT] Skipping ScheduledPost ${post.id}: no ${post.platform} template found.`);
      continue;
    }

    const rendering = renderPost(media, media.workspace, template, post.platform);
    if (rendering.error) {
      console.warn(`[CAPTION EDIT] Skipping ScheduledPost ${post.id}: ${rendering.error}`);
      continue;
    }

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { renderedContent: rendering },
    });
    refreshedPostIds.push(post.id);
  }

  return refreshedPostIds;
}

/**
 * POST /api/media/:id/regenerate-caption
 * Refines the existing visual Master JSON with optional user-confirmed tags and notes.
 */
router.post('/:id/regenerate-caption', requireAuth, async (req, res) => {
  try {
    const { userTags = [], notes = '' } = req.body || {};
    if (!Array.isArray(userTags) || userTags.some(tag => typeof tag !== 'string' || !tag.trim())) {
      return res.status(400).json({ error: 'userTags must be an array of non-empty strings.' });
    }
    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string.' });
    }

    const media = await getAccessibleMedia(req, res);
    if (!media) return;
    if (media.status !== 'ANALYZED' || !media.aiMasterJson) {
      return res.status(400).json({ error: 'Media must have a completed analysis before its caption can be regenerated.' });
    }

    const aiMasterJson = await regenerateCaption(media, userTags.map(tag => tag.trim()), notes);
    const updatedMedia = await prisma.media.update({
      where: { id: media.id },
      data: { aiMasterJson, status: 'ANALYZED' },
    });
    const refreshedPostIds = await refreshPendingPostSnapshots({ ...media, aiMasterJson });

    res.json({
      media: updatedMedia,
      aiMasterJson,
      refreshedPostIds,
      refreshedPostCount: refreshedPostIds.length,
    });
  } catch (err) {
    console.error('[CAPTION REGENERATE] Failed:', err.response?.data || err.message);
    const status = err.message === 'OPENROUTER_API_KEY is not configured.' ? 503 : 500;
    res.status(status).json({ error: status === 503 ? 'Caption generation provider is not configured.' : 'Caption regeneration failed.' });
  }
});

/**
 * PATCH /api/media/:id/caption
 * Applies direct edits to supported Master JSON caption fields only.
 */
router.patch('/:id/caption', requireAuth, async (req, res) => {
  try {
    const editableFields = new Set(['headline', 'description', 'keywords', 'hashtags', 'destinationUrl']);
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Caption update body must be an object.' });
    }
    const unknownFields = Object.keys(body).filter(field => !editableFields.has(field));
    if (unknownFields.length > 0) {
      return res.status(400).json({ error: `Unsupported caption fields: ${unknownFields.join(', ')}` });
    }
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: 'At least one caption field is required.' });
    }
    for (const field of ['headline', 'description']) {
      if (field in body && (typeof body[field] !== 'string' || !body[field].trim())) {
        return res.status(400).json({ error: `${field} must be a non-empty string.` });
      }
    }
    for (const field of ['keywords', 'hashtags']) {
      if (field in body && (!Array.isArray(body[field]) || body[field].some(value => typeof value !== 'string' || !value.trim()))) {
        return res.status(400).json({ error: `${field} must be an array of non-empty strings.` });
      }
    }

    const media = await getAccessibleMedia(req, res);
    if (!media) return;
    if (media.status !== 'ANALYZED' || !media.aiMasterJson) {
      return res.status(400).json({ error: 'Media must have a completed analysis before its caption can be edited.' });
    }

    const { destinationUrl, ...captionBody } = body;
    const updateData = { status: 'ANALYZED' };

    if (destinationUrl !== undefined) {
      updateData.destinationUrl = typeof destinationUrl === 'string' && destinationUrl.trim() ? destinationUrl.trim() : null;
    }

    let aiMasterJson = media.aiMasterJson;
    if (Object.keys(captionBody).length > 0) {
      aiMasterJson = parseMasterJson(JSON.stringify({ ...media.aiMasterJson, ...captionBody }));
      updateData.aiMasterJson = aiMasterJson;
    }

    const updatedMedia = await prisma.media.update({
      where: { id: media.id },
      data: updateData,
    });
    const refreshedPostIds = await refreshPendingPostSnapshots({ ...updatedMedia, aiMasterJson });

    res.json({
      media: updatedMedia,
      aiMasterJson,
      refreshedPostIds,
      refreshedPostCount: refreshedPostIds.length,
    });
  } catch (err) {
    console.error('[CAPTION EDIT] Failed:', err.message);
    res.status(500).json({ error: 'Caption update failed.' });
  }
});

/**
 * GET /api/media/:id/preview
 * Generates and returns a draft post preview using the resolved template and media master JSON.
 * Query: ?platform=LINKEDIN|PINTEREST|YOUTUBE
 */
router.get('/:id/preview', requireAuth, async (req, res) => {
  try {
    const mediaId = req.params.id;
    const { platform } = req.query;

    if (!platform) {
      return res.status(400).json({ error: 'platform query parameter is required' });
    }

    const upperPlatform = platform.toUpperCase();
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    if (!validPlatforms.includes(upperPlatform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be LINKEDIN, PINTEREST, or YOUTUBE' });
    }

    // Fetch media with workspace details
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { workspace: true },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Verify workspace access for the user
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: media.workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No membership in this organization' });
    }

    // If member, check explicit workspace access
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
      const access = await prisma.workspaceAccess.findUnique({
        where: {
          userId_workspaceId: {
            userId: req.userId,
            workspaceId: media.workspaceId,
          },
        },
      });
      if (!access) {
        return res.status(403).json({ error: 'No access to this workspace' });
      }
    }

    // Check if media is analyzed yet
    if (media.status !== 'ANALYZED') {
      return res.status(400).json({
        error: `Media analysis has status: ${media.status}. It must be ANALYZED to preview.`,
      });
    }

    // Find custom template for workspace + platform
    let template = await prisma.template.findFirst({
      where: {
        workspaceId: media.workspaceId,
        platform: upperPlatform,
      },
    });

    // Fall back to global default template
    if (!template) {
      template = await prisma.template.findFirst({
        where: {
          workspaceId: null,
          platform: upperPlatform,
          isDefault: true,
        },
      });
    }

    if (!template) {
      return res.status(500).json({ error: 'Default template not found for platform' });
    }

    // Render post
    const result = renderPost(media, media.workspace, template, upperPlatform);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      mediaId: media.id,
      platform: upperPlatform,
      templateName: template.name,
      rendered: result,
    });
  } catch (err) {
    console.error('Preview generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper to resolve root-relative media paths (like uploads/ws-id/filename)
 * to absolute paths, since uploads directory is at the project root.
 */
function getAbsoluteFilePath(mediaFilepath) {
  const path = require('path');
  const os = require('os');
  if (path.isAbsolute(mediaFilepath)) {
    return mediaFilepath;
  }
  const baseUploads = process.env.VERCEL || process.env.NODE_ENV === 'production'
    ? path.join(os.tmpdir(), 'uploads')
    : path.resolve(__dirname, '../../../uploads');
  return path.join(baseUploads, mediaFilepath.replace(/^uploads[\/\\]?/, ''));
}

const storageProvider = require('../services/storageProvider');

/**
 * GET /api/media/:id/file
 * Streams raw uploaded media file via storageProvider.
 */
router.get('/:id/file', requireAuth, async (req, res) => {
  try {
    const media = await prisma.media.findUnique({
      where: { id: req.params.id },
      include: { workspace: true },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Access check
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: media.workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const keyOrPath = media.r2Key || media.filepath;
    const meta = await storageProvider.headObject(keyOrPath);
    const readStream = await storageProvider.getReadStream(keyOrPath);

    res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', meta.contentLength);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    readStream.pipe(res);
  } catch (err) {
    console.error('Fetch media file error:', err.message);
    res.status(404).json({ error: 'Media asset file missing from storage' });
  }
});


/**
 * GET /api/media/:id/thumbnail
 * Resizes image to 300px width using sharp via storageProvider and streams WebP.
 * Caches generated thumbnail locally for instant repeat requests.
 */
router.get('/:id/thumbnail', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const sharp = require('sharp');
  try {
    const media = await prisma.media.findUnique({
      where: { id: req.params.id },
      include: { workspace: true },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Access check
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: media.workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (media.mediaType === 'VIDEO') {
      const placeholder = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
        'base64'
      );
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(placeholder);
    }

    // Disk cache path
    const cacheDir = path.join(os.tmpdir(), 'thumbs');
    const cachePath = path.join(cacheDir, `${media.id}_300.webp`);

    if (fs.existsSync(cachePath)) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(cachePath);
    }

    // Obtain read stream via storageProvider
    const keyOrPath = media.r2Key || media.filepath;
    const stream = await storageProvider.getReadStream(keyOrPath);

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    await sharp(buffer)
      .resize(300)
      .webp({ quality: 80 })
      .toFile(cachePath);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(cachePath);
  } catch (err) {
    console.error(`[THUMBNAIL ENGINE ERROR] Failed for media ${req.params.id}:`, err.message);
    res.status(404).json({ error: 'Thumbnail generation failed; media missing from storage' });
  }
});


/**
 * DELETE /api/media/:id
 * Deletes the media database record and its physical file from disk.
 * Cascades to delete any scheduled posts targeting this media.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  try {
    const media = await prisma.media.findUnique({
      where: { id: req.params.id },
      include: { workspace: true },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media asset not found' });
    }

    // Access check: User must be member of organization owning this workspace
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: media.workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete physical file from disk
    const absolutePath = getAbsoluteFilePath(media.filepath);
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log(`Deleted physical media file: ${absolutePath}`);
      }
    } catch (fsErr) {
      console.warn(`Failed to delete physical file on disk: ${fsErr.message}`);
    }

    // Delete DB record
    await prisma.media.delete({
      where: { id: media.id },
    });
    console.log(`[AUDIT] User ${req.userId} deleted Media asset ${media.id} (${media.filename}) from workspace ${media.workspaceId}`);

    res.json({ success: true, message: 'Media asset deleted successfully' });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
