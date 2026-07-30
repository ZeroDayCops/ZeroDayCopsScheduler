const prisma = require('../prisma');
const { renderPost } = require('./renderer');
const { parseFilenameSchedule } = require('./filename-parser');
const { createMediaAutoScheduleSummaryNotification } = require('./notification');

/**
 * Handles post-analysis automation for a media asset.
 * Auto-schedules to connected platforms if filename date pattern is detected OR workspace is in AUTO_SCHEDULE/AUTO_PUBLISH mode.
 */
async function handlePostAnalysisAutomation(mediaId) {
  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        workspace: {
          include: {
            socialAccounts: true,
          },
        },
      },
    });

    if (!media || media.status !== 'ANALYZED') {
      return;
    }

    const workspace = media.workspace;
    const mode = workspace.automationMode;

    // Parse filename schedule (e.g. 19may.jpg, 19may-2030.png)
    const scheduleParsed = parseFilenameSchedule(
      media.filename,
      workspace.defaultSlotTime || '20:00',
      workspace.timezone || 'Asia/Kolkata'
    );

    // Skip only if MANUAL mode AND no filename date pattern detected
    if (mode === 'MANUAL' && !scheduleParsed.isMatch) {
      console.log(`[AUTOMATION] Workspace "${workspace.brandName}" is in MANUAL mode and filename "${media.filename}" has no date pattern. Skipping.`);
      return;
    }

    console.log(`[AUTOMATION] Processing media ${mediaId} (${media.filename}). Date pattern match:`, scheduleParsed.isMatch ? scheduleParsed.formattedText : 'none');

    const createdPosts = [];
    const outcomes = [];
    const source = scheduleParsed.isMatch ? 'FILENAME_PARSER' : 'DEFAULT_RULE';

    // We inspect all possible platforms (LINKEDIN, PINTEREST, YOUTUBE)
    const allPlatforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];

    for (const platform of allPlatforms) {
      const socialAccount = workspace.socialAccounts.find(sa => sa.platform === platform);

      if (!socialAccount || socialAccount.status !== 'CONNECTED') {
        const reason = !socialAccount ? 'No account configured' : `Account ${socialAccount.status.toLowerCase()}`;
        outcomes.push({ platform, status: 'SKIPPED', detail: reason });
        continue;
      }

      try {
        // Find template for platform
        let template = await prisma.template.findFirst({
          where: { workspaceId: workspace.id, platform },
        });

        if (!template) {
          template = await prisma.template.findFirst({
            where: { workspaceId: null, platform, isDefault: true },
          });
        }

        if (!template) {
          console.log(`[AUTOMATION] No template found for ${platform}. Skipping.`);
          outcomes.push({ platform, status: 'SKIPPED', detail: 'No template' });
          continue;
        }

        // Render content — skip if incompatible (e.g. YouTube + IMAGE)
        const rendering = renderPost(media, workspace, template, platform);
        if (rendering.error) {
          console.log(`[AUTOMATION] Skipping ${platform}: ${rendering.error}`);
          outcomes.push({ platform, status: 'SKIPPED', detail: rendering.error });
          continue;
        }

        // Target schedule time: filename date > default slot time
        let scheduledFor;
        if (scheduleParsed.isMatch) {
          scheduledFor = scheduleParsed.scheduledDate;
        } else {
          scheduledFor = await determineScheduleTime(workspace, platform);
        }

        // Upsert ScheduledPost
        const existingPost = await prisma.scheduledPost.findFirst({
          where: { workspaceId: workspace.id, mediaId: media.id, platform },
        });

        let post;
        if (existingPost) {
          post = await prisma.scheduledPost.update({
            where: { id: existingPost.id },
            data: {
              renderedContent: rendering,
              scheduledFor,
              scheduleSource: source,
              status: 'PENDING',
              retryCount: 0,
            },
          });
        } else {
          post = await prisma.scheduledPost.create({
            data: {
              workspaceId: workspace.id,
              mediaId: media.id,
              socialAccountId: socialAccount.id,
              platform,
              renderedContent: rendering,
              scheduledFor,
              scheduleSource: source,
              status: 'PENDING',
            },
          });
        }

        createdPosts.push(post);
        outcomes.push({ platform, status: 'SCHEDULED', scheduledFor });

      } catch (err) {
        console.error(`[AUTOMATION] Error processing ${platform}:`, err.message);
        outcomes.push({ platform, status: 'FAILED', detail: err.message });
      }
    }

    // Emit consolidated per-Media auto-schedule fan-out summary notification!
    await createMediaAutoScheduleSummaryNotification(mediaId, outcomes);

    // AUTO_PUBLISH mode or immediate due post trigger
    if ((mode === 'AUTO_PUBLISH' || (scheduleParsed.isMatch && scheduleParsed.scheduledDate <= new Date())) && createdPosts.length > 0) {
      console.log(`[AUTOMATION] Triggering immediate publish for ${createdPosts.length} post(s)...`);
      const { processDuePosts } = require('./scheduler');
      await processDuePosts();
    }

    console.log(`[AUTOMATION] Completed auto-scheduling for media ${mediaId}. Created ${createdPosts.length} post(s).`);
  } catch (err) {
    console.error(`[AUTOMATION] Fatal error for media ${mediaId}:`, err);
  }
}

/**
 * Determines schedule time if no filename date pattern exists.
 */
async function determineScheduleTime(workspace, platform) {
  const now = new Date();
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

  const conflictingPost = await prisma.scheduledPost.findFirst({
    where: {
      workspaceId: workspace.id,
      platform,
      status: 'PENDING',
      scheduledFor: {
        gte: now,
        lte: thirtyMinutesFromNow,
      },
    },
  });

  if (!conflictingPost) {
    return now;
  }

  return getNextSlotTime(workspace.defaultSlotTime);
}

function getNextSlotTime(slotTime) {
  const [hours, minutes] = (slotTime || '20:00').split(':').map(Number);
  const now = new Date();

  const slotToday = new Date(now);
  slotToday.setHours(hours, minutes, 0, 0);

  if (slotToday > now) {
    return slotToday;
  }

  const slotTomorrow = new Date(slotToday);
  slotTomorrow.setDate(slotTomorrow.getDate() + 1);
  return slotTomorrow;
}

module.exports = { handlePostAnalysisAutomation };
