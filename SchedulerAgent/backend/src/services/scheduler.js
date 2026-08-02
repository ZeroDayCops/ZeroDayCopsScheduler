const cron = require('node-cron');
const prisma = require('../prisma');
const { decrypt } = require('../utils/crypto');
const { refreshTokenIfNeeded } = require('./oauth-refresh');
const { publishToPlatform } = require('./publishers');
const { createNotification, checkAndCreateMediaPublishSummaryNotification } = require('./notification');

let schedulerLastRunAt = null;

function getSchedulerLastRunAt() {
  return schedulerLastRunAt ? schedulerLastRunAt.toISOString() : null;
}

/**
 * Claims due posts atomically to prevent double publishing.
 */
async function claimDuePosts() {
  const query = `
    UPDATE "ScheduledPost"
    SET status = 'PROCESSING'
    WHERE status = 'PENDING' AND "scheduledFor" <= timezone('utc', now())
    RETURNING *
  `;
  return prisma.$queryRawUnsafe(query);
}

/**
 * Processes all due scheduled posts with retry backoff and notification delivery.
 */
async function processDuePosts() {
  schedulerLastRunAt = new Date();
  let claimed = [];
  try {
    claimed = await claimDuePosts();
  } catch (err) {
    console.error('[SCHEDULER] Failed to claim due posts:', err);
    return;
  }

  if (claimed.length === 0) {
    return;
  }

  console.log(`[SCHEDULER] Atomically claimed ${claimed.length} due posts.`);

  for (const post of claimed) {
    const scheduledTime = new Date(post.scheduledFor).getTime();
    const now = Date.now();
    const delayMs = Math.max(0, now - scheduledTime);
    const GRACE_PERIOD_MS = 3 * 60 * 1000; // 3 minutes

    let attemptMessage = `Attempting publication to ${post.platform}.`;
    if (delayMs > GRACE_PERIOD_MS) {
      const totalSeconds = Math.floor(delayMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      attemptMessage = `Attempting publication to ${post.platform} (Published late — ${minutes}m ${seconds}s after scheduled time, likely due to a backend cold-start or sleep gap).`;
    }

    await prisma.postLog.create({
      data: {
        scheduledPostId: post.id,
        event: 'ATTEMPT',
        message: attemptMessage,
      },
    });

    try {
      // 1. Proactive Token Refresh
      const refreshedAccount = await refreshTokenIfNeeded(post.socialAccountId);
      
      // 2. Decrypt Access Token
      const decryptedToken = decrypt(refreshedAccount.accessTokenEncrypted);

      // 3. Fetch Media Details with Workspace
      const media = await prisma.media.findUnique({
        where: { id: post.mediaId },
        include: { workspace: true },
      });

      if (!media) {
        throw new Error(`Associated media file not found`);
      }

      // 4. Trigger platform publisher
      post.socialAccount = refreshedAccount;
      post.workspace = media.workspace;
      const pubResult = await publishToPlatform(post, decryptedToken, media);

      if (pubResult.success) {
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            externalPostId: pubResult.externalPostId,
          },
        });

        const logMsg = pubResult.isFallback
          ? `published as image fallback — video upload failed: ${pubResult.fallbackReason}`
          : `Published successfully. External ID: ${pubResult.externalPostId}`;

        await prisma.postLog.create({
          data: {
            scheduledPostId: post.id,
            event: 'SUCCESS',
            message: logMsg,
          },
        });

        if (pubResult.isFallback) {
          await createNotification({
            workspaceId: post.workspaceId,
            mediaId: post.mediaId,
            type: 'WARNING_FALLBACK',
            title: `Published as Static Image Fallback (${post.platform})`,
            message: `Video upload failed: ${pubResult.fallbackReason}. Published static cover frame image fallback per workspace setting.`,
            actionUrl: 'calendar',
          });
        }

        // Trigger per-Media publish summary check
        await checkAndCreateMediaPublishSummaryNotification(post.mediaId);

        console.log(`[SCHEDULER] Post ${post.id} published successfully to ${post.platform} (fallback: ${!!pubResult.isFallback}).`);
      } else {
        const err = new Error(pubResult.error || 'Unknown publishing failure');
        if (pubResult.isPermanent) {
          err.isPermanent = true;
        }
        throw err;
      }
    } catch (err) {
      console.error(`[SCHEDULER] Publishing attempt failed for post ${post.id}:`, err.message);

      const isPermanent = err.isPermanent === true;

      await prisma.postLog.create({
        data: {
          scheduledPostId: post.id,
          event: 'FAILURE',
          message: isPermanent ? `Permanent validation failure: ${err.message}` : (err.message || 'Unknown publishing error'),
        },
      });

      const nextRetryCount = post.retryCount + 1;
      // Fast-fail immediately on 4xx / isPermanent errors without burning 3 retries
      if (isPermanent || nextRetryCount >= 3) {
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            retryCount: isPermanent ? post.retryCount : nextRetryCount,
          },
        });

        // Trigger per-Media publish summary check
        await checkAndCreateMediaPublishSummaryNotification(post.mediaId);

        console.log(`[SCHEDULER] Post ${post.id} permanently marked FAILED (isPermanent: ${isPermanent}).`);
      } else {
        // Spec Retry backoff intervals: 5 mins, 15 mins, 30 mins
        const delayMinutes = [5, 15, 30][nextRetryCount - 1] || 30;
        const nextScheduledDate = new Date(Date.now() + delayMinutes * 60 * 1000);

        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: {
            status: 'PENDING',
            retryCount: nextRetryCount,
            scheduledFor: nextScheduledDate,
          },
        });

        await prisma.postLog.create({
          data: {
            scheduledPostId: post.id,
            event: 'RETRY',
            message: `Scheduled retry attempt ${nextRetryCount}/3 in ${delayMinutes} minutes (at ${nextScheduledDate.toISOString()}).`,
          },
        });

        await createNotification({
          workspaceId: post.workspaceId,
          mediaId: post.mediaId,
          type: 'RETRYING',
          title: `Publishing Retrying (${post.platform})`,
          message: `Attempt ${nextRetryCount}/3 failed for ${post.platform}: ${err.message}. Retrying in ${delayMinutes} mins.`,
          actionUrl: 'settings#connections',
        });

        console.log(`[SCHEDULER] Post ${post.id} queued for retry ${nextRetryCount}/3.`);
      }
    }
  }

  return claimed.length;
}

/**
 * Starts the scheduling cron worker. Runs every 30 seconds.
 */
function startScheduler() {
  console.log('[SCHEDULER] Starting scheduled post cron worker (every 30 seconds)...');
  const task = cron.schedule('*/30 * * * * *', async () => {
    await processDuePosts();
  });
  return task;
}

module.exports = { startScheduler, processDuePosts, claimDuePosts, getSchedulerLastRunAt };
