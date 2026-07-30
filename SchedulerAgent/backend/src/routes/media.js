const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { renderPost } = require('../services/renderer');

const router = express.Router();

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
  return path.resolve(__dirname, '../../../', mediaFilepath);
}

/**
 * GET /api/media/:id/file
 * Streams the raw uploaded media file.
 */
router.get('/:id/file', requireAuth, async (req, res) => {
  const fs = require('fs');
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

    const absolutePath = getAbsoluteFilePath(media.filepath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Physical media file missing' });
    }

    res.sendFile(absolutePath);
  } catch (err) {
    console.error('Fetch file error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/media/:id/thumbnail
 * Resizes the image to 300px width using sharp and streams it.
 * Videos or failed images fall back to standard raw file or mock icon.
 */
router.get('/:id/thumbnail', requireAuth, async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const sharp = require('sharp');
  let media = null;
  try {
    media = await prisma.media.findUnique({
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

    const absolutePath = getAbsoluteFilePath(media.filepath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Physical media file missing' });
    }

    if (media.mediaType === 'VIDEO') {
      // Return a tiny 1x1 transparent PNG placeholder for video thumbnails
      const placeholder = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
        'base64'
      );
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(placeholder);
    }

    // Disk cache path: uploads/{wsId}/thumbs/{mediaId}_300.webp
    const thumbsDir = path.join(path.dirname(absolutePath), 'thumbs');
    const thumbPath = path.join(thumbsDir, `${media.id}_300.webp`);

    // Serve from cache if it exists
    if (fs.existsSync(thumbPath)) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(thumbPath);
    }

    // Generate, cache, and serve
    if (!fs.existsSync(thumbsDir)) {
      fs.mkdirSync(thumbsDir, { recursive: true });
    }

    await sharp(absolutePath)
      .resize(300)
      .webp({ quality: 80 })
      .toFile(thumbPath);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(thumbPath);
  } catch (err) {
    console.error('Fetch thumbnail error, sending original file:', err.message);
    try {
      if (media) {
        const absolutePath = getAbsoluteFilePath(media.filepath);
        if (fs.existsSync(absolutePath)) {
          const fileBuffer = fs.readFileSync(absolutePath);
          const ext = path.extname(media.filename).toLowerCase();
          const mimeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
          };
          res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
          return res.send(fileBuffer);
        }
      }
    } catch (fsErr) {
      console.error('Sync file send failed:', fsErr.message);
    }
    res.status(500).json({ error: 'Internal server error' });
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
