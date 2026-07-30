const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
}

/**
 * requireAuth — verifies JWT from httpOnly cookie, attaches user to req.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * requireOrgRole(role) — checks the authenticated user has at least one of the `allowedRoles`
 * in the organization.
 */
function requireOrgRole(...allowedRoles) {
  return async (req, res, next) => {
    const orgId = req.params.orgId || req.body.organizationId || req.query.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    try {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: req.userId,
            organizationId: orgId,
          },
        },
      });

      if (!membership || !allowedRoles.includes(membership.role)) {
        return res.status(403).json({ error: 'Insufficient organization role' });
      }

      req.membership = membership;
      req.organizationId = orgId;
      next();
    } catch (err) {
      console.error('requireOrgRole error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * requireWorkspaceAccess — checks the authenticated user has access to the workspace.
 * Owners and Admins of the organization automatically have access.
 * Members require an explicit WorkspaceAccess record.
 */
async function requireWorkspaceAccess(req, res, next) {
  const workspaceId = req.params.workspaceId || req.params.id;
  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace ID required' });
  }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check membership in the workspace's organization
    const membership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: req.userId,
          organizationId: workspace.organizationId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No membership in this organization' });
    }

    // OWNER and ADMIN bypass explicit workspace access check
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      req.workspaceId = workspaceId;
      req.workspace = workspace;
      return next();
    }

    // MEMBER role requires explicit access record
    const access = await prisma.workspaceAccess.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId,
          workspaceId: workspaceId,
        },
      },
    });

    if (!access) {
      return res.status(403).json({ error: 'No access to this workspace' });
    }

    req.workspaceId = workspaceId;
    req.workspace = workspace;
    next();
  } catch (err) {
    console.error('Workspace access check error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { requireAuth, requireOrgRole, requireWorkspaceAccess };
