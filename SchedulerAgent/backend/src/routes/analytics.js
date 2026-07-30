const express = require('express');
const prisma = require('../prisma');
const { requireAuth, requireWorkspaceAccess } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

/**
 * GET /api/workspaces/:workspaceId/analytics?days=7|30
 * Returns observability metrics: Pipeline Funnel, Platform Success Rates, Latency, Schedule Sources, Automation Health.
 */
router.get('/', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req;
    const days = parseInt(req.query.days, 10) || 30;
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { socialAccounts: true },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // 1. Pipeline Funnel Counts
    const uploadedCount = await prisma.media.count({
      where: { workspaceId, createdAt: { gte: fromDate } },
    });

    const analyzedCount = await prisma.media.count({
      where: { workspaceId, status: 'ANALYZED', createdAt: { gte: fromDate } },
    });

    const failedAnalysisCount = await prisma.media.count({
      where: { workspaceId, status: 'FAILED', createdAt: { gte: fromDate } },
    });

    const autoScheduledCount = await prisma.scheduledPost.count({
      where: {
        workspaceId,
        scheduledFor: { gte: fromDate },
        scheduleSource: { in: ['FILENAME_PARSER', 'DEFAULT_RULE'] },
      },
    });

    const publishedCount = await prisma.scheduledPost.count({
      where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: fromDate } },
    });

    const failedPublishCount = await prisma.scheduledPost.count({
      where: { workspaceId, status: 'FAILED', scheduledFor: { gte: fromDate } },
    });

    const funnel = {
      uploaded: uploadedCount,
      analyzed: analyzedCount,
      failedAnalysis: failedAnalysisCount,
      autoScheduled: autoScheduledCount,
      published: publishedCount,
      failedPublish: failedPublishCount,
    };

    // 2. Per-Platform Success Rates
    const platforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
    const platformStats = {};

    for (const platform of platforms) {
      const pub = await prisma.scheduledPost.count({
        where: { workspaceId, platform, status: 'PUBLISHED', publishedAt: { gte: fromDate } },
      });
      const fail = await prisma.scheduledPost.count({
        where: { workspaceId, platform, status: 'FAILED', scheduledFor: { gte: fromDate } },
      });
      const total = pub + fail;
      const rate = total > 0 ? Math.round((pub / total) * 100) : 100;
      platformStats[platform] = {
        published: pub,
        failed: fail,
        total,
        successRate: rate,
      };
    }

    // 3. Time-to-Publish Latency (Media.createdAt -> ScheduledPost.publishedAt)
    const publishedPosts = await prisma.scheduledPost.findMany({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        publishedAt: { gte: fromDate },
      },
      include: { media: true },
    });

    const latenciesSeconds = publishedPosts
      .filter((p) => p.publishedAt && p.media && p.media.createdAt)
      .map((p) => Math.max(0, Math.floor((new Date(p.publishedAt).getTime() - new Date(p.media.createdAt).getTime()) / 1000)));

    let avgLatencyMinutes = 0;
    let medianLatencyMinutes = 0;

    if (latenciesSeconds.length > 0) {
      const sumSec = latenciesSeconds.reduce((acc, v) => acc + v, 0);
      avgLatencyMinutes = Math.round((sumSec / latenciesSeconds.length / 60) * 10) / 10;

      const sorted = [...latenciesSeconds].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianSec = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      medianLatencyMinutes = Math.round((medianSec / 60) * 10) / 10;
    }

    const latency = {
      sampleCount: latenciesSeconds.length,
      averageMinutes: avgLatencyMinutes,
      medianMinutes: medianLatencyMinutes,
    };

    // 4. Schedule Source Breakdown
    const totalScheduled = await prisma.scheduledPost.count({
      where: { workspaceId, scheduledFor: { gte: fromDate } },
    });

    const filenameCount = await prisma.scheduledPost.count({
      where: { workspaceId, scheduleSource: 'FILENAME_PARSER', scheduledFor: { gte: fromDate } },
    });

    const defaultRuleCount = await prisma.scheduledPost.count({
      where: { workspaceId, scheduleSource: 'DEFAULT_RULE', scheduledFor: { gte: fromDate } },
    });

    const manualCount = await prisma.scheduledPost.count({
      where: { workspaceId, scheduleSource: 'MANUAL', scheduledFor: { gte: fromDate } },
    });

    const scheduleSources = {
      total: totalScheduled,
      filenameParserPct: totalScheduled > 0 ? Math.round((filenameCount / totalScheduled) * 100) : 0,
      defaultRulePct: totalScheduled > 0 ? Math.round((defaultRuleCount / totalScheduled) * 100) : 0,
      manualOverridePct: totalScheduled > 0 ? Math.round((manualCount / totalScheduled) * 100) : 0,
      rawCounts: {
        filenameParser: filenameCount,
        defaultRule: defaultRuleCount,
        manual: manualCount,
      },
    };

    // 5. Workspace Automation Health Indicator
    const healthReasons = [];

    // Check account connection status
    for (const sa of workspace.socialAccounts) {
      if (sa.status === 'EXPIRED') {
        healthReasons.push(`Social account connection for ${sa.platform} has EXPIRED.`);
      } else if (sa.status === 'NOT_CONNECTED' && workspace.automationMode !== 'MANUAL') {
        healthReasons.push(`${sa.platform} account is NOT_CONNECTED while automation is ${workspace.automationMode}.`);
      }
    }

    // Check recent 7-day publish failure rate
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pub7 = await prisma.scheduledPost.count({
      where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: sevenDaysAgo } },
    });
    const fail7 = await prisma.scheduledPost.count({
      where: { workspaceId, status: 'FAILED', scheduledFor: { gte: sevenDaysAgo } },
    });
    const total7 = pub7 + fail7;

    if (total7 > 0) {
      const failRate = (fail7 / total7) * 100;
      if (failRate > 15) {
        healthReasons.push(`High publish failure rate (${Math.round(failRate)}% failed over the last 7 days).`);
      }
    }

    const automationHealth = {
      status: healthReasons.length === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION',
      automationMode: workspace.automationMode,
      reasons: healthReasons,
    };

    res.json({
      days,
      funnel,
      platformStats,
      latency,
      scheduleSources,
      automationHealth,
    });
  } catch (err) {
    console.error('Fetch analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
