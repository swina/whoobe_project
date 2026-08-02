import type { Request, Response, NextFunction } from 'express';
import { validateSessionToken, SESSION_COOKIE_NAME, type AuthenticatedUser } from './session.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

async function resolveUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = (req as any).cookies?.[SESSION_COOKIE_NAME];
  return validateSessionToken(token);
}

/** Rejects unless a valid, non-expired, non-revoked session is present. */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('requireAuth error:', error);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

/** requireAuth() plus a specific permission key in the session's effective permission set. */
export function requirePermission(permissionKey: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await resolveUser(req);
      if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      if (!user.permissions.includes(permissionKey)) {
        res.status(403).json({ error: `Missing permission: ${permissionKey}` });
        return;
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('requirePermission error:', error);
      res.status(500).json({ error: 'Authentication check failed' });
    }
  };
}
