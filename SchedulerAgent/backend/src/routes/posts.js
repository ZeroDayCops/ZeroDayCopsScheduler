const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireWorkspaceAccess } = require('../middleware/auth');
const { renderPost } = require('../services/renderer');

const router = express.Router({ mergeParams: true });

/**
 * GET /api/workspaces/:workspaceId/scheduled-posts
 * Returns all scheduled posts for the workspace, including media and execution logs (postLogs).
 */
router.get('/scheduled-posts', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req;

    const posts = await prisma.scheduledPost.findMany({
      where: { workspaceId },
      include: {
        media: true,
        postLogs: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { scheduledFor: 'desc' }
    });
    res.json({ posts });
  } catch (err) {
    console.error('Fetch scheduled posts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/workspaces/:workspaceId/scheduled-posts
 * Schedules a new post by rendering the template snapshot.
 * Body: { mediaId, platform, scheduledFor }
 */
router.post('/scheduled-posts', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { mediaId, platform, scheduledFor } = req.body;

    if (!mediaId || !platform || !scheduledFor) {
      return res.status(400).json({ error: 'mediaId, platform, and scheduledFor are required' });
    }

    const upperPlatform = platform.toUpperCase();
    const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    if (!validPlatforms.includes(upperPlatform)) {
      return res.status(400).json({ error: 'Invalid platform. Must be LINKEDIN, PINTEREST, or YOUTUBE' });
    }

    // Verify media exists and belongs to the workspace
    const media = await prisma.media.findFirst({
      where: {
        id: mediaId,
        workspaceId,
      },
    });

    if (!media) {
      return res.status(400).json({ error: 'Media asset not found in this workspace' });
    }

    if (media.status !== 'ANALYZED') {
      return res.status(400).json({ error: 'Media asset analysis has not completed successfully' });
    }

    // Media-type / platform compatibility validation
    if (upperPlatform === 'YOUTUBE' && media.mediaType === 'IMAGE') {
      return res.status(400).json({ error: 'YouTube requires video assets. Cannot schedule an image to YouTube.' });
    }
    if (upperPlatform === 'LINKEDIN' && media.mediaType === 'VIDEO') {
      return res.status(400).json({ error: 'LinkedIn publishing currently supports image assets only. Cannot schedule a video to LinkedIn.' });
    }

    // Find custom template for workspace + platform, falling back to default
    let template = await prisma.template.findFirst({
      where: {
        workspaceId,
        platform: upperPlatform,
      },
    });

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

    // Render the content snapshot
    const rendering = renderPost(media, req.workspace, template, upperPlatform);
    if (rendering.error) {
      return res.status(400).json({ error: rendering.error });
    }

    // Find connected SocialAccount for this platform and workspace
    const socialAccount = await prisma.socialAccount.findFirst({
      where: {
        workspaceId,
        platform: upperPlatform,
      },
    });

    if (!socialAccount) {
      return res.status(400).json({
        error: `System database record missing: SocialAccount row for platform ${upperPlatform} does not exist in workspace ${workspaceId}. Please contact system administrator.`
      });
    }

    if (socialAccount.status !== 'CONNECTED' && process.env.ALLOW_UNCONNECTED_SCHEDULING !== 'true') {
      console.warn(`[SCHEDULER NOTICE] Scheduling post for ${upperPlatform} on workspace ${workspaceId} while SocialAccount status is ${socialAccount.status}.`);
    }

    // Save scheduled post
    const post = await prisma.scheduledPost.create({
      data: {
        workspaceId,
        mediaId,
        socialAccountId: socialAccount.id,
        platform: upperPlatform,
        renderedContent: rendering,
        scheduledFor: new Date(scheduledFor),
        scheduleSource: 'MANUAL',
        status: 'PENDING',
      },
    });

    res.status(201).json({ post });
  } catch (err) {
    console.error('Schedule post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/scheduled-posts/:id
 * Updates scheduled post parameters. Re-renders content if platform or mediaId changes.
 * Body: { mediaId, platform, scheduledFor, status }
 */
router.put('/scheduled-posts/:id', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req;
    const postId = req.params.id;
    const { mediaId, platform, scheduledFor, status } = req.body;

    const existingPost = await prisma.scheduledPost.findFirst({
      where: { id: postId, workspaceId },
    });

    if (!existingPost) {
      return res.status(404).json({ error: 'Scheduled post not found in this workspace' });
    }

    const updateData = {};

    if (scheduledFor) {
      updateData.scheduledFor = new Date(scheduledFor);
    }

    if (status) {
      const validStatuses = ['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid post status' });
      }
      updateData.status = status;
    }

    // If mediaId or platform is updated, we must re-render the snapshot
    const activeMediaId = mediaId || existingPost.mediaId;
    const activePlatform = (platform || existingPost.platform).toUpperCase();

    if (mediaId || platform) {
      // Validate platform
      const validPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
      if (!validPlatforms.includes(activePlatform)) {
        return res.status(400).json({ error: 'Invalid platform. Must be LINKEDIN, PINTEREST, or YOUTUBE' });
      }

      // Verify media
      const media = await prisma.media.findFirst({
        where: { id: activeMediaId, workspaceId },
      });

      if (!media) {
        return res.status(400).json({ error: 'Media asset not found in this workspace' });
      }

      if (media.status !== 'ANALYZED') {
        return res.status(400).json({ error: 'Media asset analysis has not completed successfully' });
      }

      // Media-type / platform compatibility validation
      if (activePlatform === 'YOUTUBE' && media.mediaType === 'IMAGE') {
        return res.status(400).json({ error: 'YouTube requires video assets. Cannot schedule an image to YouTube.' });
      }
      if (activePlatform === 'LINKEDIN' && media.mediaType === 'VIDEO') {
        return res.status(400).json({ error: 'LinkedIn publishing currently supports image assets only. Cannot schedule a video to LinkedIn.' });
      }

      // Fetch template
      let template = await prisma.template.findFirst({
        where: { workspaceId, platform: activePlatform },
      });

      if (!template) {
        template = await prisma.template.findFirst({
          where: { workspaceId: null, platform: activePlatform, isDefault: true },
        });
      }

      const rendering = renderPost(media, req.workspace, template, activePlatform);
      if (rendering.error) {
        return res.status(400).json({ error: rendering.error });
      }

      // Find social account
      const socialAccount = await prisma.socialAccount.findFirst({
        where: { workspaceId, platform: activePlatform },
      });

      if (!socialAccount) {
        return res.status(400).json({
          error: `System database record missing: SocialAccount row for platform ${activePlatform} does not exist in workspace ${workspaceId}.`
        });
      }

      updateData.mediaId = activeMediaId;
      updateData.platform = activePlatform;
      updateData.socialAccountId = socialAccount.id;
      updateData.renderedContent = rendering;
    }

    const updatedPost = await prisma.scheduledPost.update({
      where: { id: postId },
      data: updateData,
    });

    res.json({ post: updatedPost });
  } catch (err) {
    console.error('Update scheduled post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/scheduled-posts/:id
 * Deletes a scheduled post.
 */
router.delete('/scheduled-posts/:id', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req;
    const postId = req.params.id;

    const existingPost = await prisma.scheduledPost.findFirst({
      where: { id: postId, workspaceId },
    });

    if (!existingPost) {
      return res.status(404).json({ error: 'Scheduled post not found in this workspace' });
    }

    await prisma.scheduledPost.delete({ where: { id: postId } });
    console.log(`[AUDIT] User ${req.userId} deleted ScheduledPost ${postId} (Platform: ${existingPost.platform}, Workspace: ${workspaceId})`);
    res.json({ message: 'Scheduled post deleted successfully' });
  } catch (err) {
    console.error('Delete scheduled post error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const { createDateInTimezone } = require('../services/filename-parser');

/**
 * GET /api/workspaces/:workspaceId/calendar
 * Returns scheduled posts in a date range, grouped by date.
 * Query: ?from=ISO_DATE&to=ISO_DATE
 */
router.get('/calendar', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const timezone = req.workspace?.timezone || 'Asia/Kolkata';
    let startDate = new Date(from);
    let endDate = new Date(to);

    // Expand date-only strings (YYYY-MM-DD) to full 24-hour day ranges in workspace timezone
    if (typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from.trim())) {
      const [y, m, d] = from.trim().split('-').map(Number);
      startDate = createDateInTimezone(y, m - 1, d, 0, 0, timezone);
    }

    if (typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
      const [y, m, d] = to.trim().split('-').map(Number);
      endDate = createDateInTimezone(y, m - 1, d, 23, 59, timezone);
      endDate.setMilliseconds(999);
    } else if (!isNaN(endDate.getTime()) && endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0) {
      endDate.setUTCHours(23, 59, 59, 999);
    }

    const posts = await prisma.scheduledPost.findMany({
      where: {
        workspaceId,
        scheduledFor: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    // Group by date string (YYYY-MM-DD)
    const grouped = {};
    for (const post of posts) {
      const dateStr = post.scheduledFor.toISOString().split('T')[0];
      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }
      grouped[dateStr].push(post);
    }

    res.json({ calendar: grouped });
  } catch (err) {
    console.error('Fetch calendar error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/workspaces/:workspaceId/scheduled-posts/:id/publish-now
 * Forces immediate publishing of a queued/failed post.
 */
router.post('/scheduled-posts/:id/publish-now', requireAuth, requireWorkspaceAccess, async (req, res) => {
  const { processDuePosts } = require('../services/scheduler');
  try {
    const { workspaceId } = req;
    const postId = req.params.id;

    const post = await prisma.scheduledPost.findFirst({
      where: { id: postId, workspaceId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    if (post.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Post is already published' });
    }

    // Set scheduledFor in the past (so the scheduler claims it)
    await prisma.scheduledPost.update({
      where: { id: postId },
      data: {
        status: 'PENDING',
        scheduledFor: new Date(Date.now() - 5000), // 5 seconds ago
      },
    });

    // Run the scheduler worker loop immediately
    await processDuePosts();

    res.json({ success: true, message: 'Immediate publish triggered successfully' });
  } catch (err) {
    console.error('Publish now error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
