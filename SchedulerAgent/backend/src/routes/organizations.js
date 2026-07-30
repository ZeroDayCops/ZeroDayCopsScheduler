const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { requireAuth, requireOrgRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
const SALT_ROUNDS = 12;

/**
 * POST /api/organizations/:orgId/members
 * Adds/Invites a member to an organization.
 * Body: { email, role, name }
 * Requires requester to be OWNER or ADMIN in organization.
 */
router.post('/members', requireAuth, requireOrgRole('OWNER', 'ADMIN'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const { email, role = 'MEMBER', name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Verify role value
    const validRoles = ['OWNER', 'ADMIN', 'MEMBER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Ensure requester has higher or equal role than what they are assigning
    // (e.g., ADMIN cannot assign OWNER role)
    if (req.membership.role === 'ADMIN' && role === 'OWNER') {
      return res.status(403).json({ error: 'Admins cannot assign the Owner role' });
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const generatedPassword = await bcrypt.hash('password123', SALT_ROUNDS);
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          passwordHash: generatedPassword,
        },
      });
    }

    // Check if membership already exists
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
    });

    if (existingMembership) {
      return res.status(409).json({ error: 'User is already a member of this organization' });
    }

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({ membership });
  } catch (err) {
    console.error('Add organization member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/organizations/:orgId/members
 * Lists all members of an organization.
 * Requester must be a member of the organization.
 */
router.get('/members', requireAuth, requireOrgRole('OWNER', 'ADMIN', 'MEMBER'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const memberships = await prisma.membership.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json({ memberships });
  } catch (err) {
    console.error('List organization members error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/organizations/:orgId/members/:userId
 * Removes a member from an organization.
 * Requires OWNER or ADMIN (or self-removal).
 */
router.delete('/members/:userId', requireAuth, requireOrgRole('OWNER', 'ADMIN', 'MEMBER'), async (req, res) => {
  try {
    const { orgId, userId } = req.params;

    // Self-removal is allowed, otherwise requires OWNER/ADMIN
    const isSelf = req.userId === userId;
    if (!isSelf && req.membership.role === 'MEMBER') {
      return res.status(403).json({ error: 'Members cannot remove other users' });
    }

    // Admins cannot remove Owners
    const targetMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found in organization' });
    }

    if (!isSelf && req.membership.role === 'ADMIN' && targetMembership.role === 'OWNER') {
      return res.status(403).json({ error: 'Admins cannot remove Owners' });
    }

    // If removing the last Owner, prevent it
    if (targetMembership.role === 'OWNER') {
      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: orgId,
          role: 'OWNER',
        },
      });
      if (ownerCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last Owner from the organization' });
      }
    }

    await prisma.membership.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });

    res.json({ message: 'Member removed from organization successfully' });
  } catch (err) {
    console.error('Remove organization member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
