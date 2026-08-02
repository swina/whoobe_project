import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import {
  findUserByEmail,
  touchLastLogin,
  createSession,
  revokeSession,
  getEffectivePermissions,
  verifyPassword,
  requireAuth,
  bootstrapDatabase,
  SESSION_COOKIE_NAME,
  type AuthenticatedRequest,
} from '@pimcore-custom/core/server';

try {
  process.loadEnvFile();
} catch {
  // No .env file present - fall back to whatever is already in process.env.
}

const app = express();
const port = process.env.PORT || 3003;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(cookieParser());
// origin: true reflects the request's own Origin header, which is required
// for credentialed (cookie-carrying) CORS requests - "*" is rejected by
// browsers whenever credentials are involved. Fine across the dev LAN
// hostnames this project uses (develop.local, localhost); lock this to an
// explicit allowlist before this is ever exposed beyond a trusted network.
app.use(cors({ origin: true, credentials: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'core-api', uptimeSeconds: process.uptime(), timestamp: new Date().toISOString() });
});

// --- Simple in-memory brute-force guard for /auth/login ---
// Single-process, dev/small-deployment scale. A multi-instance deployment
// would need this backed by something shared (e.g. the sessions table
// itself, or Redis) instead of process memory.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(key: string): boolean {
  const entry = loginAttempts.get(key);
  return !!entry && entry.lockedUntil > Date.now();
}

function recordFailedAttempt(key: string): void {
  const entry = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function clearFailedAttempts(key: string): void {
  loginAttempts.delete(key);
}

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

app.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const rateLimitKey = email.toLowerCase();
  if (isLockedOut(rateLimitKey)) {
    res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    return;
  }

  try {
    const user = await findUserByEmail(email);

    if (!user || !user.isActive || !(await verifyPassword(user.passwordHash, password))) {
      recordFailedAttempt(rateLimitKey);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    clearFailedAttempts(rateLimitKey);

    const { token, expiresAt } = await createSession(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    await touchLastLogin(user.id);
    setSessionCookie(res, token, expiresAt);

    const permissions = await getEffectivePermissions(user.id);
    res.json({ id: user.id, email: user.email, displayName: user.displayName, permissions });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/logout', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    await revokeSession(token);
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

app.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(req.user);
});

// On-the-fly bootstrap: create the database if it doesn't exist, apply any
// pending migrations, and seed default roles/permissions/admin user. Runs
// on every boot; all steps are idempotent, so this is a no-op once already
// up to date. Means a fresh Postgres volume (e.g. after changing the
// container's volume mount) just works on next start - no manual
// `db:migrate` / `db:seed` step required.
bootstrapDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`🔐 Core API listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Database bootstrap failed - core-api cannot start:', error);
    process.exit(1);
  });
