import type { Request, Response, NextFunction } from 'express';
import { validateSessionToken, SESSION_COOKIE_NAME, type AuthenticatedUser } from './session.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Rejects unless a valid, non-expired, non-revoked session is present. */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      console.warn(`requireAuth: no cookie "${SESSION_COOKIE_NAME}" on ${req.method} ${req.path} (origin: ${req.headers.origin ?? 'unknown'})`);
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const user = await validateSessionToken(token);
    if (!user) {
      console.warn(`requireAuth: cookie present but session invalid for ${req.method} ${req.path} (token prefix: ${token.slice(0, 8)}...)`);
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
      const token = req.cookies?.[SESSION_COOKIE_NAME];
      if (!token) {
        console.warn(`requirePermission(${permissionKey}): no cookie on ${req.method} ${req.path}`);
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const user = await validateSessionToken(token);
      if (!user) {
        console.warn(`requirePermission(${permissionKey}): cookie present but session invalid for ${req.method} ${req.path} (token prefix: ${token.slice(0, 8)}...)`);
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
