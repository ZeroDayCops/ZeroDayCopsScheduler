const prisma = require('../prisma');

// Sliding window batch tracking (in-memory lock / window tracker)
const recentWindow = new Map(); // workspaceId -> Array of timestamps

/**
 * Checks if digest batching should trigger (>3 notifications in 5 seconds).
 */
function shouldDigest(workspaceId) {
  const now = Date.now();
  const windowMs = 5000;
  const timestamps = (recentWindow.get(workspaceId) || []).filter(t => now - t < windowMs);
  timestamps.push(now);
  recentWindow.set(workspaceId, timestamps);
  return timestamps.length > 3;
}

/**
 * Creates an in-app notification with optional digest batching and actionable URL.
 * @param {object} params - { workspaceId, mediaId, type, title, message, actionUrl }
 */
async function createNotification({ workspaceId, mediaId, type, title, message, actionUrl }) {
  try {
    if (!workspaceId) return null;

    if (shouldDigest(workspaceId)) {
      // Find or update recent DIGEST notification within last 5 seconds
      const fiveSecAgo = new Date(Date.now() - 5000);
      const existingDigest = await prisma.notification.findFirst({
        where: {
          workspaceId,
          type: 'DIGEST',
          createdAt: { gte: fiveSecAgo },
        },
      });

      if (existingDigest) {
        return prisma.notification.update({
          where: { id: existingDigest.id },
          data: {
            message: `Bulk Activity Digest: Multiple processing & automation events collapsed. Click for details.`,
          },
        });
      } else {
        return prisma.notification.create({
          data: {
            workspaceId,
            type: 'DIGEST',
            title: 'Bulk Processing Summary',
            message: `High volume of content activity detected. Multiple events collapsed into digest.`,
            actionUrl: actionUrl || 'media',
          },
        });
      }
    }

    const notif = await prisma.notification.create({
      data: {
        workspaceId,
        mediaId: mediaId || null,
        type,
        title,
        message,
        actionUrl: actionUrl || null,
        read: false,
      },
    });

    console.log(`[NOTIFICATION] [${type}] ${title}: ${message}`);
    return notif;
  } catch (err) {
    console.error('[NOTIFICATION ERROR]:', err.message);
    return null;
  }
}

/**
 * Emits an ingestion started notification immediately when Media row created with status NEW.
 */
async function createIngestionNotification(media) {
  return createNotification({
    workspaceId: media.workspaceId,
    mediaId: media.id,
    type: 'INGESTION',
    title: `Ingestion Started: ${media.filename}`,
    message: `File detected and registered (${media.mediaType}). Triggering AI content analysis...`,
    actionUrl: 'media',
  });
}

/**
 * Emits ONE consolidated fan-out summary notification for a Media item after auto-schedule processing.
 * @param {string} mediaId 
 * @param {Array} outcomes - Array of { platform, status: 'SCHEDULED'|'SKIPPED'|'FAILED', detail, scheduledFor }
 */
async function createMediaAutoScheduleSummaryNotification(mediaId, outcomes = []) {
  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { workspace: true },
    });
    if (!media) return null;

    const parts = outcomes.map(o => {
      if (o.status === 'SCHEDULED') {
        const timeStr = o.scheduledFor ? new Date(o.scheduledFor).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'queued';
        return `${o.platform}: Scheduled (${timeStr})`;
      } else if (o.status === 'SKIPPED') {
        return `${o.platform}: Skipped (${o.detail})`;
      } else {
        return `${o.platform}: Failed (${o.detail})`;
      }
    });

    const hasFailure = outcomes.some(o => o.status === 'FAILED' || (o.status === 'SKIPPED' && o.detail?.includes('connection')));
    const title = `Auto-Schedule Summary: ${media.filename}`;
    const message = parts.length > 0 ? parts.join(' | ') : 'No connected social accounts found for auto-scheduling.';
    const actionUrl = hasFailure ? 'settings#connections' : 'calendar';

    return createNotification({
      workspaceId: media.workspaceId,
      mediaId: media.id,
      type: hasFailure ? 'FAILED' : 'SCHEDULED_SUMMARY',
      title,
      message,
      actionUrl,
    });
  } catch (err) {
    console.error('[NOTIFICATION AUTO-SCHEDULE SUMMARY ERROR]:', err.message);
    return null;
  }
}

/**
 * Checks if all ScheduledPosts for a Media item have reached terminal state (PUBLISHED or FAILED),
 * and if so, emits ONE consolidated summary notification.
 */
async function checkAndCreateMediaPublishSummaryNotification(mediaId) {
  try {
    if (!mediaId) return null;

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        scheduledPosts: {
          include: { postLogs: { orderBy: { createdAt: 'desc' } } },
        },
      },
    });

    if (!media || !media.scheduledPosts || media.scheduledPosts.length === 0) return null;

    // Check if any post is still pending or processing
    const isPending = media.scheduledPosts.some(p => p.status === 'PENDING' || p.status === 'PROCESSING');
    if (isPending) return null; // Not all terminal yet

    // All terminal! Build summary outcome per platform
    const outcomes = media.scheduledPosts.map(p => {
      if (p.status === 'PUBLISHED') {
        return `${p.platform}: Published successfully (${p.externalPostId || 'OK'})`;
      } else {
        const lastLog = p.postLogs[0]?.message || 'Unknown error';
        return `${p.platform}: Failed — ${lastLog}`;
      }
    });

    const hasFailure = media.scheduledPosts.some(p => p.status === 'FAILED');
    const title = `Publish Outcome: ${media.filename}`;
    const message = outcomes.join(' | ');
    const actionUrl = hasFailure ? 'settings#connections' : 'calendar';

    return createNotification({
      workspaceId: media.workspaceId,
      mediaId: media.id,
      type: hasFailure ? 'FAILED' : 'PUBLISH_SUMMARY',
      title,
      message,
      actionUrl,
    });
  } catch (err) {
    console.error('[NOTIFICATION PUBLISH SUMMARY ERROR]:', err.message);
    return null;
  }
}

module.exports = {
  createNotification,
  createIngestionNotification,
  createMediaAutoScheduleSummaryNotification,
  checkAndCreateMediaPublishSummaryNotification,
};

