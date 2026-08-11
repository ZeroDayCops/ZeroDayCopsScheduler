const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');


const prisma = require('../prisma');

const { requireAuth, requireWorkspaceAccess } = require('../middleware/auth');
const { analyzeMedia } = require('../services/openrouter');
const router = express.Router();




const os = require('os');
const UPLOADS_DIR = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? path.join(os.tmpdir(), 'uploads')
  : path.resolve(__dirname, '../../../uploads');


// Multer disk storage engine to save files directly under uploads/:workspaceId/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const workspaceId = req.params.id;
    const destDir = path.join(UPLOADS_DIR, workspaceId);
    
    // Create directory dynamically if it doesn't exist
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});


/**
 * POST /api/workspaces
 * Creates a workspace + 3 NOT_CONNECTED SocialAccount rows.
 * Requires OWNER or ADMIN role in the organization.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      organizationId,
      brandName,
      website,
      cta,
      defaultHashtags = [],
      brandVoice,
      emojiStyle,
    } = req.body;

    if (!organizationId || !brandName) {
      return res.status(400).json({ error: 'organizationId and brandName are required' });
    }

    // Verify role in org
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId,
        },
      },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only organization Owners or Admins can create workspaces' });
    }

    // Create workspace + 3 social account rows in a transaction
    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          organizationId,
          brandName,
          website,
          cta,
          defaultHashtags,
          brandVoice,
          emojiStyle,
        },
      });

      // Platform placeholders
      const platforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
      await tx.socialAccount.createMany({
        data: platforms.map((platform) => ({
          workspaceId: ws.id,
          platform,
          status: 'NOT_CONNECTED',
        })),
      });

      // Grant access to creator
      await tx.workspaceAccess.create({
        data: {
          userId: req.userId,
          workspaceId: ws.id,
        },
      });

      return ws;
    });

    // Fetch workspace with social accounts
    const createdWorkspace = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      include: { socialAccounts: true },
    });

    res.status(201).json({ workspace: createdWorkspace });
  } catch (err) {
    console.error('Create workspace error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspaces
 * Lists workspaces within an organization.
 * Owners/Admins see all; Members see only workspaces they have access to.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId query param required' });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No membership in this organization' });
    }

    let workspaces;
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      workspaces = await prisma.workspace.findMany({
        where: { organizationId },
        include: { socialAccounts: true },
      });
    } else {
      // MEMBER: fetch only accessible workspaces
      workspaces = await prisma.workspace.findMany({
        where: {
          organizationId,
          workspaceAccess: {
            some: {
              userId: req.userId,
            },
          },
        },
        include: { socialAccounts: true },
      });
    }

    res.json({ workspaces });
  } catch (err) {
    console.error('List workspaces error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspaces/:id
 * Fetch details of a single workspace. Scoped access checked.
 */
router.get('/:id', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.id },
      include: { socialAccounts: true },
    });

    res.json({ workspace });
  } catch (err) {
    console.error('Get workspace error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/workspaces/:id
 * Updates workspace properties.
 * Restricted to organization Owners/Admins (requireWorkspaceAccess checks org membership).
 */
router.put('/:id', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const { brandName, website, cta, defaultHashtags, brandVoice, brandDescription, contactInfoBlock, emojiStyle, automationMode, defaultSlotTime, timezone, allowVideoImageFallback } = req.body;

    // Additional security: Only OWNER/ADMIN membership role in workspace's organization
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: req.workspace.organizationId,
        },
      },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only organization Owners or Admins can update workspace settings' });
    }

    // Build update payload, only including defined fields
    const updateData = {};
    if (brandName !== undefined) updateData.brandName = brandName;
    if (website !== undefined) updateData.website = website;
    if (cta !== undefined) updateData.cta = cta;
    if (defaultHashtags !== undefined) updateData.defaultHashtags = defaultHashtags;
    if (brandVoice !== undefined) updateData.brandVoice = brandVoice;
    if (brandDescription !== undefined) updateData.brandDescription = brandDescription;
    if (contactInfoBlock !== undefined) updateData.contactInfoBlock = contactInfoBlock;
    if (emojiStyle !== undefined) updateData.emojiStyle = emojiStyle;
    if (allowVideoImageFallback !== undefined) updateData.allowVideoImageFallback = !!allowVideoImageFallback;

    // Automation fields
    if (automationMode !== undefined) {
      const validModes = ['MANUAL', 'AUTO_SCHEDULE', 'AUTO_PUBLISH'];
      if (!validModes.includes(automationMode)) {
        return res.status(400).json({ error: 'Invalid automationMode. Must be MANUAL, AUTO_SCHEDULE, or AUTO_PUBLISH' });
      }
      updateData.automationMode = automationMode;
    }
    if (defaultSlotTime !== undefined) {
      // Validate HH:mm format
      if (!/^\d{2}:\d{2}$/.test(defaultSlotTime)) {
        return res.status(400).json({ error: 'defaultSlotTime must be in HH:mm format' });
      }
      updateData.defaultSlotTime = defaultSlotTime;
    }
    if (timezone !== undefined) {
      updateData.timezone = timezone;
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
      include: { socialAccounts: true },
    });

    res.json({ workspace: updated });
  } catch (err) {
    console.error('Update workspace error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/workspaces/:id
 * Deletes workspace.
 */
router.delete('/:id', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;

    // Restrict to OWNER/ADMIN
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: req.workspace.organizationId,
        },
      },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only organization Owners or Admins can delete workspaces' });
    }

    await prisma.workspace.delete({ where: { id: workspaceId } });
    console.log(`[AUDIT] User ${req.userId} deleted Workspace ${workspaceId} (${req.workspace.brandName})`);
    res.json({ message: 'Workspace deleted successfully' });
  } catch (err) {
    console.error('Delete workspace error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/workspaces/:id/access
 * Grants a user workspace access.
 * Scoped access check: requires OWNER or ADMIN membership.
 */
router.post('/:id/access', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { userId } = req.body;
    const workspaceId = req.params.id;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Verify creator's role is OWNER/ADMIN
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: req.workspace.organizationId,
        },
      },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only organization Owners or Admins can manage workspace access' });
    }

    // Verify target user has membership in organization
    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: req.workspace.organizationId,
        },
      },
    });

    if (!targetMembership) {
      return res.status(400).json({ error: 'User must belong to the organization before getting workspace access' });
    }

    const access = await prisma.workspaceAccess.upsert({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      update: {},
      create: {
        userId,
        workspaceId,
      },
    });

    res.status(201).json({ access });
  } catch (err) {
    console.error('Grant workspace access error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/workspaces/:id/access/:userId
 * Revokes workspace access from a user.
 */
router.delete('/:id/access/:userId', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const targetUserId = req.params.userId;

    // Verify role is OWNER/ADMIN
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: req.workspace.organizationId,
        },
      },
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Only organization Owners or Admins can manage workspace access' });
    }

    await prisma.workspaceAccess.delete({
      where: {
        userId_workspaceId: {
          userId: targetUserId,
          workspaceId,
        },
      },
    });

    res.json({ message: 'Workspace access revoked successfully' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Access record not found' });
    }
    console.error('Revoke workspace access error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const { uploadToR2, generatePresignedUploadUrl, s3Client } = require('../services/r2Storage');

/**
 * POST /api/workspaces/:id/media/upload-url
 * Generates a presigned upload URL to upload large files directly to Cloudflare R2 (bypassing Vercel 4.5MB limit).
 */
router.post('/:id/media/upload-url', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { filename, mimeType } = req.body;
    const workspaceId = req.params.id;

    if (!filename || !mimeType) {
      return res.status(400).json({ error: 'filename and mimeType are required' });
    }

    const ext = path.extname(filename).toLowerCase();
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

    let mediaType;
    if (IMAGE_EXTS.includes(ext)) {
      mediaType = 'IMAGE';
    } else if (VIDEO_EXTS.includes(ext)) {
      mediaType = 'VIDEO';
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const destinationKey = `${workspaceId}/file-${uniqueSuffix}${ext}`;

    if (!s3Client) {
      return res.status(400).json({ error: 'R2 storage is not configured for direct upload' });
    }

    const presigned = await generatePresignedUploadUrl(destinationKey, mimeType);

    const media = await prisma.media.create({
      data: {
        workspaceId,
        filename,
        filepath: destinationKey,
        r2Url: presigned.publicUrl,
        r2Key: presigned.key,
        mediaType,
        status: 'NEW',
      },
    });

    res.json({
      uploadUrl: presigned.uploadUrl,
      mediaId: media.id,
      media,
    });
  } catch (err) {
    console.error('Presigned upload URL generation error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

const storageProvider = require('../services/storageProvider');

/**
 * POST /api/workspaces/:id/media/:mediaId/complete-r2
 * Signals that direct R2 upload has completed, verifies storage integrity, and triggers AI analysis.
 */
router.post('/:id/media/:mediaId/complete-r2', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { mediaId } = req.params;
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) {
      return res.status(404).json({ error: 'Media asset not found' });
    }

    // Verify storage presence before proceeding
    const isStored = await storageProvider.exists(media.r2Key || media.filepath);
    if (!isStored) {
      console.warn(`[COMPLETE R2 WARNING]: Verification failed for media ${media.id} (${media.filename}). Key ${media.r2Key} not found in R2 bucket.`);
      const updatedFailed = await prisma.media.update({
        where: { id: mediaId },
        data: {
          status: 'FAILED',
          statusDetail: 'Storage verification failed: Object missing from storage bucket.',
          aiMasterJson: { error: 'Direct upload to R2 failed or was blocked by browser CORS policy.' },
        },
      });
      return res.status(400).json({ error: 'Storage verification failed: file object not found in storage bucket.', media: updatedFailed });
    }

    console.log(`R2 storage verified for media ${media.id} (${media.filename}). Triggering Vision analysis async.`);
    analyzeMedia(media.id).catch((err) => console.error(`[VISION ANALYSIS ERROR]:`, err.message));
    res.json({ success: true, media });
  } catch (err) {
    console.error('Complete R2 upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/workspaces/:id/media/:mediaId/upload-proxy
 * Backend proxy upload fallback route used when browser direct PUT to R2 fails (e.g. CORS/network error).
 */
router.post('/:id/media/:mediaId/upload-proxy', requireAuth, requireWorkspaceAccess, upload.single('file'), async (req, res) => {
  try {
    const { mediaId, id: workspaceId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided in proxy upload' });
    }

    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Media asset record not found' });
    }

    let r2Details = { publicUrl: media.r2Url, key: media.r2Key };
    if (s3Client) {
      try {
        const destinationKey = media.r2Key || `${workspaceId}/proxy-${Date.now()}-${req.file.originalname}`;
        r2Details = await storageProvider.uploadToR2(req.file.path, destinationKey, req.file.mimetype || 'image/jpeg');
      } catch (r2Err) {
        console.warn(`[UPLOAD PROXY R2 WARNING]: ${r2Err.message}`);
      }
    }

    const updatedMedia = await prisma.media.update({
      where: { id: mediaId },
      data: {
        filepath: req.file.path,
        r2Url: r2Details.publicUrl || media.r2Url,
        r2Key: r2Details.key || media.r2Key,
        status: 'NEW',
        statusDetail: 'Uploaded via server proxy fallback. Starting AI analysis...',
      },
    });

    console.log(`[UPLOAD PROXY SUCCESS]: File uploaded via server proxy for media ${mediaId}. Triggering Vision analysis.`);
    analyzeMedia(mediaId).catch((err) => console.error(`[VISION ANALYSIS ERROR]:`, err.message));

    res.json({ success: true, media: updatedMedia });
  } catch (err) {
    console.error('Upload proxy fallback error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Internal server error during upload proxy fallback' });
  }
});


/**
 * POST /api/workspaces/:id/media
 * Uploads a media file manually.
 * Uploads to Cloudflare R2 if configured.
 * Triggers the async Gemini analysis.
 */
router.post('/:id/media', requireAuth, requireWorkspaceAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workspaceId = req.params.id;
    const filename = req.file.originalname;
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    // Check file extension
    const ext = path.extname(filename).toLowerCase();
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];

    let mediaType;
    if (IMAGE_EXTS.includes(ext)) {
      mediaType = 'IMAGE';
    } else if (VIDEO_EXTS.includes(ext)) {
      mediaType = 'VIDEO';
    } else {
      // Remove incompatible file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Try Cloudflare R2 upload
    let r2Url = null;
    let r2Key = null;

    try {
      const destinationKey = `${workspaceId}/${path.basename(filePath)}`;
      const r2Result = await uploadToR2(filePath, destinationKey, mimeType);
      r2Url = r2Result.publicUrl;
      r2Key = r2Result.key;
    } catch (r2Err) {
      console.warn('[R2 UPLOAD WARNING] Could not upload to Cloudflare R2, falling back to local filepath:', r2Err.message);
    }

    // Create database row synchronously
    const media = await prisma.media.create({
      data: {
        workspaceId,
        filename,
        filepath: filePath,
        r2Url,
        r2Key,
        mediaType,
        status: 'NEW',
      },
    });

    console.log(`Created Media row via manual upload for ${filename}. Triggering instant Vision analysis async.`);
    analyzeMedia(media.id).catch((err) => console.error(`[VISION ANALYSIS ERROR]:`, err.message));

    res.status(201).json({ media });
  } catch (err) {
    console.error('Manual media upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspaces/:id/media
 * Retrieves all media ingested for the workspace, with optional status filter.
 */
router.get('/:id/media', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const { status } = req.query;

    const whereClause = { workspaceId };
    if (status) {
      whereClause.status = status;
    }

    const media = await prisma.media.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ media });
  } catch (err) {
    console.error('List workspace media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/workspaces/:id/style-guides
 * Returns per-platform AI style guides for workspace.
 */
router.get('/:id/style-guides', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const platforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    const result = { LINKEDIN: null, PINTEREST: null, YOUTUBE: null };

    const templates = await prisma.template.findMany({
      where: { workspaceId },
    });

    for (const p of platforms) {
      const match = templates.find((t) => t.platform === p);
      if (match && match.aiStyleGuide) {
        result[p] = match.aiStyleGuide;
      }
    }

    res.json({ styleGuides: result });
  } catch (err) {
    console.error('Get style guides error:', err);
    res.status(500).json({ error: 'Failed to fetch style guides' });
  }
});

/**
 * PATCH /api/workspaces/:id/style-guides/:platform
 * Updates or creates a workspace-specific template's aiStyleGuide.
 */
router.patch('/:id/style-guides/:platform', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const platform = req.params.platform.toUpperCase();
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];

    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be LINKEDIN, PINTEREST, or YOUTUBE.' });
    }

    const { aiStyleGuide } = req.body;
    const guideValue = typeof aiStyleGuide === 'string' && aiStyleGuide.trim() ? aiStyleGuide.trim() : null;

    let template = await prisma.template.findFirst({
      where: { workspaceId, platform },
    });

    if (template) {
      template = await prisma.template.update({
        where: { id: template.id },
        data: { aiStyleGuide: guideValue },
      });
    } else {
      // Find global default template to clone templateBody
      const defaultTemplate = await prisma.template.findFirst({
        where: { workspaceId: null, platform, isDefault: true },
      });

      const templateBody = defaultTemplate?.templateBody || '{{headline}}\n\n{{description}}\n\n{{hashtags}}';
      const brandName = req.workspace?.brandName || 'Custom';

      template = await prisma.template.create({
        data: {
          workspaceId,
          platform,
          name: `${brandName} ${platform} Template`,
          templateBody,
          aiStyleGuide: guideValue,
          isDefault: false,
        },
      });
    }

    res.json({ template, platform, aiStyleGuide: template.aiStyleGuide });
  } catch (err) {
    console.error('Update style guide error:', err);
    res.status(500).json({ error: 'Failed to update style guide' });
  }
});

module.exports = router;
