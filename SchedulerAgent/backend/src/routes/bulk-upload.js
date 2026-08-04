const express = require('express');
const path = require('path');
const prisma = require('../prisma');
const { requireAuth, requireWorkspaceAccess } = require('../middleware/auth');
const { renderPost } = require('../services/renderer');
const { generatePresignedUploadUrl, s3Client } = require('../services/r2Storage');
const { createDateInTimezone, parseFilenameSchedule } = require('../services/filename-parser');

const router = express.Router();

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * Helper to compute scheduled date per image based on scheduleConfig.
 * In 'filename-sequence' strategy, tries to parse each filename for an embedded date/time
 * (e.g., '4aug2225' → Aug 4 at 22:25). Falls back to startDate + offset when filename doesn't parse.
 */
function computeScheduleForMedia(mediaItems, scheduleConfig, workspaceTimezone = 'Asia/Kolkata') {
  const { strategy = 'sequential-daily', startDate, perDay = 1, timeSlots = ['20:00'] } = scheduleConfig || {};
  
  const parsedStartDate = startDate ? new Date(startDate) : new Date();
  const year = parsedStartDate.getFullYear();
  const month = parsedStartDate.getMonth();
  const day = parsedStartDate.getDate();

  const slots = timeSlots.length > 0 ? timeSlots : ['20:00'];
  const defaultSlotTime = slots[0] || '20:00';
  const maxPerDay = Math.max(1, parseInt(perDay, 10) || 1);

  // Clone and sort media items
  let items = [...mediaItems];
  if (strategy === 'filename-sequence') {
    items.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));
  } else {
    items.sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));
  }

  const results = [];
  let fallbackIdx = 0; // Tracks offset for items without parseable filename dates

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    let scheduledDate = null;

    // In filename-sequence strategy, try to extract date/time from the filename first
    if (strategy === 'filename-sequence') {
      const parsed = parseFilenameSchedule(item.filename, defaultSlotTime, workspaceTimezone);
      if (parsed.isMatch) {
        scheduledDate = parsed.scheduledDate;
      }
    }

    // Fallback: use startDate + offset for sequential-daily OR when filename didn't parse
    if (!scheduledDate) {
      const dayOffset = Math.floor(fallbackIdx / maxPerDay);
      const slotIndex = fallbackIdx % slots.length;
      const [hours, minutes] = (slots[slotIndex] || '20:00').split(':').map(Number);
      
      const targetDate = new Date(year, month, day + dayOffset);
      scheduledDate = createDateInTimezone(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate(),
        isNaN(hours) ? 20 : hours,
        isNaN(minutes) ? 0 : minutes,
        workspaceTimezone
      );
      fallbackIdx++;
    }

    results.push({
      mediaId: item.id,
      filename: item.filename,
      sequenceIndex: item.sequenceIndex ?? idx,
      scheduledFor: scheduledDate,
    });
  }

  return results;
}

/**
 * POST /api/workspaces/:id/media/bulk-upload-urls
 * Accepts up to 20 image metadata objects, creates UploadBatch + pending Media rows in transaction,
 * and returns presigned R2 upload URLs.
 */
router.post('/workspaces/:id/media/bulk-upload-urls', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const { files } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required and must contain at least 1 item' });
    }

    if (files.length > 20) {
      return res.status(400).json({ error: 'Bulk upload is limited to a maximum of 20 images per batch' });
    }

    // Extension validation
    for (const f of files) {
      const ext = path.extname(f.filename || '').toLowerCase();
      if (!IMAGE_EXTS.includes(ext)) {
        return res.status(400).json({ error: `Unsupported image format for file: ${f.filename}. Bulk upload supports JPEG, PNG, WEBP, GIF.` });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.uploadBatch.create({
        data: {
          workspaceId,
          createdByUserId: req.userId,
          status: 'UPLOADING',
        },
      });

      const uploads = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = path.extname(file.filename).toLowerCase();
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const destinationKey = `${workspaceId}/batch-${batch.id}-${i}-${uniqueSuffix}${ext}`;

        let presigned = { uploadUrl: null, publicUrl: null, key: destinationKey };
        if (s3Client) {
          try {
            presigned = await generatePresignedUploadUrl(destinationKey, file.mimeType || 'image/jpeg');
          } catch (r2Err) {
            console.warn(`[BULK UPLOAD R2 WARNING]: ${r2Err.message}`);
          }
        }

        const media = await tx.media.create({
          data: {
            workspaceId,
            filename: file.filename,
            filepath: destinationKey,
            r2Url: presigned.publicUrl,
            r2Key: presigned.key,
            mediaType: 'IMAGE',
            status: 'NEW',
            batchId: batch.id,
            sequenceIndex: i,
          },
        });

        uploads.push({
          mediaId: media.id,
          filename: file.filename,
          sequenceIndex: i,
          uploadUrl: presigned.uploadUrl,
          key: destinationKey,
        });
      }

      return { batch, uploads };
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('Bulk upload URL generation error:', err);
    res.status(500).json({ error: 'Failed to initialize bulk upload batch' });
  }
});

/**
 * GET /api/upload-batches/:id
 * Fetches batch status and media details, defensively recomputing status if stored value is stale.
 */
router.get('/upload-batches/:id', requireAuth, async (req, res) => {
  try {
    const batchId = req.params.id;
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: {
        workspace: true,
        media: {
          orderBy: { sequenceIndex: 'asc' },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Upload batch not found' });
    }

    // Defensive status recompute
    const mediaStatuses = batch.media.map(m => m.status);
    let computedStatus = batch.status;

    if (batch.status !== 'COMMITTED' && batch.status !== 'PARTIALLY_FAILED') {
      if (mediaStatuses.some(s => s === 'NEW' || s === 'ANALYZING')) {
        computedStatus = 'ANALYZING';
      } else if (mediaStatuses.length > 0 && mediaStatuses.every(s => s === 'ANALYZED' || s === 'FAILED')) {
        computedStatus = 'READY';
      }
    }

    // Self-heal DB status if computed status moved to READY
    if (computedStatus === 'READY' && batch.status !== 'READY' && batch.status !== 'COMMITTED') {
      await prisma.uploadBatch.update({
        where: { id: batchId },
        data: { status: 'READY' },
      });
    }

    res.json({
      batch: {
        ...batch,
        status: computedStatus,
      },
    });
  } catch (err) {
    console.error('Get upload batch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/upload-batches/:id/order
 * Persists drag-and-drop sequence index reordering.
 */
router.patch('/upload-batches/:id/order', requireAuth, async (req, res) => {
  try {
    const batchId = req.params.id;
    const { mediaIds } = req.body;

    if (!Array.isArray(mediaIds)) {
      return res.status(400).json({ error: 'mediaIds array is required' });
    }

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: { media: true },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Upload batch not found' });
    }

    // Update sequenceIndex per array index in transaction
    await prisma.$transaction(
      mediaIds.map((mediaId, index) =>
        prisma.media.updateMany({
          where: { id: mediaId, batchId },
          data: { sequenceIndex: index },
        })
      )
    );

    const updatedMedia = await prisma.media.findMany({
      where: { batchId },
      orderBy: { sequenceIndex: 'asc' },
    });

    res.json({ success: true, media: updatedMedia });
  } catch (err) {
    console.error('Reorder batch media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/upload-batches/:id/schedule-preview
 * Dry-run preview of computed scheduledFor dates for media items in batch without persisting.
 */
router.post('/upload-batches/:id/schedule-preview', requireAuth, async (req, res) => {
  try {
    const batchId = req.params.id;
    const { scheduleConfig } = req.body;

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: {
        workspace: true,
        media: true,
      },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Upload batch not found' });
    }

    const preview = computeScheduleForMedia(
      batch.media,
      scheduleConfig,
      batch.workspace.timezone || 'Asia/Kolkata'
    );

    res.json({ preview });
  } catch (err) {
    console.error('Schedule preview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/upload-batches/:id/commit
 * Renders templates and creates ScheduledPost rows for analyzed media in one atomic transaction.
 */
router.post('/upload-batches/:id/commit', requireAuth, async (req, res) => {
  try {
    const batchId = req.params.id;
    const { scheduleConfig, publishModeOverride } = req.body;

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: {
        workspace: {
          include: { socialAccounts: true },
        },
        media: {
          orderBy: { sequenceIndex: 'asc' },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Upload batch not found' });
    }

    // Check if any media is still analyzing
    const pendingCount = batch.media.filter(m => m.status === 'NEW' || m.status === 'ANALYZING').length;
    if (pendingCount > 0) {
      return res.status(400).json({ error: `Cannot commit batch while ${pendingCount} media file(s) are still analyzing.` });
    }

    const analyzedMedia = batch.media.filter(m => m.status === 'ANALYZED');
    const failedMedia = batch.media.filter(m => m.status === 'FAILED');

    if (analyzedMedia.length === 0) {
      return res.status(400).json({ error: 'All media files in this batch failed analysis. Cannot schedule posts.' });
    }

    // Compute schedules
    const scheduledMap = computeScheduleForMedia(
      analyzedMedia,
      scheduleConfig,
      batch.workspace.timezone || 'Asia/Kolkata'
    ).reduce((acc, item) => {
      acc[item.mediaId] = item.scheduledFor;
      return acc;
    }, {});

    // Determine effective publish mode & post status
    const effectiveMode = publishModeOverride !== undefined ? publishModeOverride : batch.workspace.automationMode;
    const postStatus = (effectiveMode === 'MANUAL') ? 'PENDING_REVIEW' : 'PENDING';

    const committedResults = [];
    const excludedResults = [];

    // Pre-render content for each media item and connected platform
    const postCreationPayloads = [];

    for (const media of analyzedMedia) {
      const scheduledFor = scheduledMap[media.id];
      let postsCount = 0;

      for (const sa of batch.workspace.socialAccounts) {
        if (sa.status !== 'CONNECTED' && process.env.ALLOW_UNCONNECTED_SCHEDULING !== 'true') {
          continue;
        }

        // Find template for platform
        let template = await prisma.template.findFirst({
          where: { workspaceId: batch.workspaceId, platform: sa.platform },
        });
        if (!template) {
          template = await prisma.template.findFirst({
            where: { workspaceId: null, platform: sa.platform, isDefault: true },
          });
        }

        if (!template) continue;

        const rendering = renderPost(media, batch.workspace, template, sa.platform);
        if (rendering.error) {
          continue;
        }

        postCreationPayloads.push({
          workspaceId: batch.workspaceId,
          mediaId: media.id,
          socialAccountId: sa.id,
          platform: sa.platform,
          renderedContent: rendering,
          scheduledFor,
          scheduleSource: 'MANUAL',
          status: postStatus,
          batchId: batch.id,
        });
        postsCount++;
      }

      committedResults.push({
        mediaId: media.id,
        filename: media.filename,
        postsCreated: postsCount,
        scheduledFor,
      });
    }

    for (const media of failedMedia) {
      excludedResults.push({
        mediaId: media.id,
        filename: media.filename,
        reason: media.aiMasterJson?.error || 'AI analysis failed',
      });
    }

    const finalBatchStatus = failedMedia.length > 0 ? 'PARTIALLY_FAILED' : 'COMMITTED';

    // Execute atomic transaction
    await prisma.$transaction(async (tx) => {
      // 1. Create all ScheduledPosts
      for (const payload of postCreationPayloads) {
        await tx.scheduledPost.create({ data: payload });
      }

      // 2. Update UploadBatch with persisted scheduleConfig and status
      await tx.uploadBatch.update({
        where: { id: batch.id },
        data: {
          status: finalBatchStatus,
          scheduleConfig: scheduleConfig || {},
          publishModeOverride: publishModeOverride ?? null,
        },
      });
    });

    // Immediate publish check if AUTO_PUBLISH mode and due
    if (effectiveMode === 'AUTO_PUBLISH') {
      const { processDuePosts } = require('../services/scheduler');
      processDuePosts().catch((err) => console.error('[BULK COMMIT] Auto-publish trigger error:', err));
    }

    res.json({
      success: true,
      batch: {
        id: batch.id,
        status: finalBatchStatus,
      },
      effectiveMode,
      postStatus,
      committed: committedResults,
      excluded: excludedResults,
    });
  } catch (err) {
    console.error('Commit upload batch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/upload-batches/:id/approve
 * Transitions all PENDING_REVIEW posts for a batch to PENDING in one transaction.
 */
router.post('/upload-batches/:id/approve', requireAuth, async (req, res) => {
  try {
    const batchId = req.params.id;

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: { workspace: true },
    });

    if (!batch) {
      return res.status(404).json({ error: 'Upload batch not found' });
    }

    const reviewPosts = await prisma.scheduledPost.findMany({
      where: {
        batchId,
        status: 'PENDING_REVIEW',
      },
    });

    if (reviewPosts.length === 0) {
      return res.status(400).json({ error: 'No posts awaiting review in this batch' });
    }

    const updateResult = await prisma.scheduledPost.updateMany({
      where: {
        batchId,
        status: 'PENDING_REVIEW',
      },
      data: {
        status: 'PENDING',
      },
    });

    // Trigger due post processor if any approved post is due now
    const { processDuePosts } = require('../services/scheduler');
    processDuePosts().catch((err) => console.error('[BATCH APPROVE] Scheduler trigger error:', err));

    res.json({
      success: true,
      approvedCount: updateResult.count,
      message: `Successfully approved ${updateResult.count} post(s) for publishing.`,
    });
  } catch (err) {
    console.error('Approve upload batch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.computeScheduleForMedia = computeScheduleForMedia;
