const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
}

/**
 * POST /api/auth/logout
 * Clears JWT auth cookie.
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/auth/register
 * Creates an Organization + first User as OWNER.
 * Body: { email, password, name, orgName }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, orgName } = req.body;

    if (!email || !password || !name || !orgName) {
      return res.status(400).json({
        error: 'email, password, name, and orgName are required',
      });
    }

    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create org + user + OWNER membership + default workspace in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName },
      });

      const user = await tx.user.create({
        data: { email, passwordHash, name },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'OWNER',
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          organizationId: org.id,
          brandName: `${orgName} Workspace`,
          brandVoice: 'Bold & Precise',
          emojiStyle: 'moderate',
        },
      });

      const platforms = ['LINKEDIN', 'PINTEREST', 'YOUTUBE'];
      await tx.socialAccount.createMany({
        data: platforms.map((platform) => ({
          workspaceId: workspace.id,
          platform,
          status: 'NOT_CONNECTED',
        })),
      });

      await tx.workspaceAccess.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
        },
      });

      return { user, org, workspace };
    });

    // Issue JWT
    const token = jwt.sign({ userId: result.user.id }, getJwtSecret(), {
      expiresIn: '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
      },
      workspace: {
        id: result.workspace.id,
        brandName: result.workspace.brandName,
      },
    });
  } catch (err) {
    console.error('Register error details:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Bcrypt compare, issues JWT in httpOnly cookie.
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    if (!email.includes('@')) {
      email = `${email}@gmail.com`;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, getJwtSecret(), {
      expiresIn: '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        role: m.role,
      })),
    });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Internal server error', details: String(err) });
  }

});

/**
 * GET /api/auth/me
 * Returns authenticated user's profile + memberships.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        memberships: {
          include: { organization: true },
        },
        workspaceAccess: {
          include: { workspace: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        notificationPrefs: user.notificationPrefs || { muteSuccess: true, muteScheduled: true, alertFailure: true },
      },
      organizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        role: m.role,
      })),
      workspaces: user.workspaceAccess.map((wa) => ({
        id: wa.workspace.id,
        brandName: wa.workspace.brandName,
      })),
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/notification-preferences
 * Updates user's notification preferences.
 * Body: { muteSuccess, muteScheduled, alertFailure }
 */
router.put('/notification-preferences', requireAuth, async (req, res) => {
  try {
    const { muteSuccess, muteScheduled, alertFailure } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: {
        notificationPrefs: {
          muteSuccess: !!muteSuccess,
          muteScheduled: !!muteScheduled,
          alertFailure: alertFailure !== undefined ? !!alertFailure : true,
        },
      },
    });

    res.json({
      success: true,
      notificationPrefs: updated.notificationPrefs,
    });
  } catch (err) {
    console.error('Update notification prefs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
