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

const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/mailer');

/**
 * POST /api/auth/forgot-password
 * Generates a password reset token and sends an email via Gmail SMTP.
 * Body: { email }
 */
router.post('/forgot-password', async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!email.includes('@')) {
      email = `${email}@gmail.com`;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal user existence for security
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }

    // Generate random 64-char token & 6-digit numeric OTP
    const rawToken = crypto.randomBytes(32).toString('hex');
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const token = `${otpCode}-${rawToken}`;
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpiry: expiry,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://scheduler.zerodaycops.in';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    // Send email via Gmail SMTP
    try {
      await sendPasswordResetEmail(user.email, otpCode, resetUrl);
    } catch (mailErr) {
      console.error('[FORGOT PASSWORD EMAIL ERROR]', mailErr.message);
      return res.status(500).json({ error: 'Failed to send password reset email via SMTP' });
    }

    res.json({
      success: true,
      message: 'Password reset link and code sent to your email successfully.',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/reset-password
 * Resets user password using valid token.
 * Body: { token, newPassword }
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Find user with matching reset token (or matching 6-digit code prefix)
    const users = await prisma.user.findMany({
      where: {
        resetTokenExpiry: { gte: new Date() },
      },
    });

    const user = users.find(
      (u) => u.resetToken === token || (u.resetToken && u.resetToken.startsWith(`${token}-`))
    );

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    console.log(`[AUTH] Password successfully reset for user ${user.email}`);

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

