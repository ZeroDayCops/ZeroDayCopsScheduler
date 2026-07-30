const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/workspaces/:workspaceId/notifications
 * Returns latest notifications for the workspace.
 */
router.get('/:workspaceId/notifications', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const notifications = await prisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const unreadCount = await prisma.notification.count({
      where: { workspaceId, read: false },
    });

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * PUT /api/workspaces/:workspaceId/notifications/read
 * Marks all notifications as read for the workspace.
 */
router.put('/:workspaceId/notifications/read', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    await prisma.notification.updateMany({
      where: { workspaceId, read: false },
      data: { read: true },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
