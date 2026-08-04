import { randomBytes } from 'node:crypto';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import {
  findUserByEmail,
  findUserById,
  touchLastLogin,
  createSession,
  revokeSession,
  getEffectivePermissions,
  verifyPassword,
  requireAuth,
  requirePermission,
  PERMISSIONS,
  bootstrapDatabase,
  listDocuments,
  getDocumentById,
  updateDocumentContent,
  listSnippets,
  createSnippet,
  deleteSnippet,
  listWhoobeOneSnippets,
  createWhoobeOneSnippet,
  updateWhoobeOneSnippet,
  deleteWhoobeOneSnippet,
  listWhoobeOneTemplates,
  getWhoobeOneTemplate,
  createWhoobeOneTemplate,
  updateWhoobeOneTemplate,
  deleteWhoobeOneTemplate,
  listWhoobeOneKits,
  getWhoobeOneKit,
  createWhoobeOneKit,
  addTemplateToWhoobeOneKit,
  deleteWhoobeOneKit,
  SESSION_COOKIE_NAME,
  generateTotpSecret,
  totpKeyUri,
  totpQrCodeDataUrl,
  verifyTotpToken,
  generateRecoveryCodes,
  hashRecoveryCodes,
  consumeRecoveryCode,
  setPendingTotpSecret,
  enableTotp,
  disableTotp,
  updateMfaRecoveryCodes,
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

// --- Pending MFA challenges: password already verified, waiting on a TOTP/
// recovery code. Same "in-memory, single-process, dev/small-deployment
// scale" tradeoff as the login-attempt guard above - a multi-instance
// deployment would need this shared (e.g. a short-lived DB row) instead.
// Kept out of the session table entirely: a pending challenge is not a
// session (it grants nothing on its own), so it shouldn't be reachable by
// anything that trusts SESSION_COOKIE_NAME/validateSessionToken.
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
const pendingMfaChallenges = new Map<string, { userId: string; expiresAt: number; attempts: number }>();

function createMfaChallenge(userId: string): string {
  const token = randomBytes(24).toString('hex');
  pendingMfaChallenges.set(token, { userId, expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS, attempts: 0 });
  return token;
}

// Read-only lookup - a wrong code shouldn't force the user to re-enter
// their password and start over, so the challenge itself is only removed
// on success, expiry, or hitting MFA_CHALLENGE_MAX_ATTEMPTS (see
// recordMfaFailure()/resolveMfaChallenge() below), not on every call.
function peekMfaChallenge(token: string): string | null {
  const entry = pendingMfaChallenges.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    pendingMfaChallenges.delete(token);
    return null;
  }
  return entry.userId;
}

function recordMfaFailure(token: string): void {
  const entry = pendingMfaChallenges.get(token);
  if (!entry) return;
  entry.attempts += 1;
  if (entry.attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
    pendingMfaChallenges.delete(token);
  }
}

function resolveMfaChallenge(token: string): void {
  pendingMfaChallenges.delete(token);
}

async function completeLogin(res: Response, userId: string, req: Request): Promise<void> {
  const { token, expiresAt } = await createSession(userId, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  await touchLastLogin(userId);
  setSessionCookie(res, token, expiresAt);

  const user = await findUserById(userId);
  const permissions = await getEffectivePermissions(userId);
  res.json({ id: userId, email: user?.email, displayName: user?.displayName, permissions });
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

    if (user.totpEnabledAt) {
      const mfaToken = createMfaChallenge(user.id);
      res.json({ mfaRequired: true, mfaToken });
      return;
    }

    await completeLogin(res, user.id, req);
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Step 2 of login when the account has MFA enabled - password was already
// verified by /auth/login (that's what mfaToken proves), this only checks
// the TOTP/recovery code before actually creating a session.
app.post('/auth/mfa/challenge', async (req: Request, res: Response): Promise<void> => {
  const { mfaToken, code, recoveryCode } = req.body ?? {};
  if (typeof mfaToken !== 'string') {
    res.status(400).json({ error: 'mfaToken is required' });
    return;
  }

  const userId = peekMfaChallenge(mfaToken);
  if (!userId) {
    res.status(401).json({ error: 'MFA challenge expired - please log in again' });
    return;
  }

  try {
    const user = await findUserById(userId);
    if (!user || !user.isActive || !user.totpEnabledAt) {
      resolveMfaChallenge(mfaToken);
      res.status(401).json({ error: 'Invalid session - please log in again' });
      return;
    }

    if (typeof code === 'string' && user.totpSecret && verifyTotpToken(user.totpSecret, code)) {
      resolveMfaChallenge(mfaToken);
      await completeLogin(res, user.id, req);
      return;
    }

    if (typeof recoveryCode === 'string' && user.mfaRecoveryCodes) {
      const updated = await consumeRecoveryCode(user.mfaRecoveryCodes, recoveryCode);
      if (updated) {
        resolveMfaChallenge(mfaToken);
        await updateMfaRecoveryCodes(user.id, updated);
        await completeLogin(res, user.id, req);
        return;
      }
    }

    recordMfaFailure(mfaToken);
    res.status(401).json({ error: 'Invalid code' });
  } catch (error: any) {
    console.error('MFA challenge error:', error);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

app.get('/auth/mfa/status', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = await findUserById(req.user!.id);
  res.json({ enabled: !!user?.totpEnabledAt });
});

// Step 1 of enrollment: generate a new secret and return it as both a QR
// code (scan) and a plain string (manual entry) - nothing is enforced yet,
// see setPendingTotpSecret()'s own comment.
app.post('/auth/mfa/setup', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const secret = generateTotpSecret();
    await setPendingTotpSecret(req.user!.id, secret);
    const otpauthUrl = totpKeyUri(req.user!.email, secret);
    const qrCodeDataUrl = await totpQrCodeDataUrl(otpauthUrl);
    res.json({ secret, otpauthUrl, qrCodeDataUrl });
  } catch (error: any) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'Failed to start MFA setup' });
  }
});

// Step 2 of enrollment: prove the authenticator app actually works before
// MFA starts being enforced on this account. Recovery codes are generated
// and returned here, once, in plaintext - only their argon2 hash is ever
// persisted (see hashRecoveryCodes()).
app.post('/auth/mfa/verify-setup', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { code } = req.body ?? {};
  if (typeof code !== 'string') {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const user = await findUserById(req.user!.id);
    if (!user?.totpSecret) {
      res.status(400).json({ error: 'No MFA setup in progress - call /auth/mfa/setup first' });
      return;
    }
    if (!verifyTotpToken(user.totpSecret, code)) {
      res.status(401).json({ error: 'Invalid code' });
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    await enableTotp(user.id, await hashRecoveryCodes(recoveryCodes));
    res.json({ success: true, recoveryCodes });
  } catch (error: any) {
    console.error('MFA verify-setup error:', error);
    res.status(500).json({ error: 'Failed to verify MFA setup' });
  }
});

app.post('/auth/mfa/disable', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string') {
    res.status(400).json({ error: 'password is required' });
    return;
  }

  try {
    const user = await findUserById(req.user!.id);
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    await disableTotp(user.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('MFA disable error:', error);
    res.status(500).json({ error: 'Failed to disable MFA' });
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

// Documents migrated from Pimcore (or authored fresh) - see
// docs/plans/cms/pimcore-areablock-import-plan.md. Reuses the objects:read
// permission rather than introducing a separate documents:* domain, since
// no distinct access-control need has come up yet.
app.get('/documents', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const documents = await listDocuments();
    res.json({ documents });
  } catch (error: any) {
    console.error('List documents error:', error);
    res.status(500).json({ error: error.message || 'Failed to list documents' });
  }
});

app.get('/documents/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const document = await getDocumentById(req.params.id);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ document });
  } catch (error: any) {
    console.error('Get document error:', error);
    res.status(500).json({ error: error.message || 'Failed to get document' });
  }
});

// Saves edits made in Whoobe Studio. Only title/rootBlock are writable by
// the autosave loop; `status` is optional and only ever sent by the
// explicit Save as Draft/Save and Publish actions (MasterDocumentTab.vue) -
// transitioning to 'published' additionally requires objects:publish, kept
// separate from the base objects:write gate on this route since editors can
// autosave drafts without necessarily being allowed to publish.
app.patch('/documents/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { title, rootBlock, status } = req.body ?? {};
    if (typeof title !== 'string' || !rootBlock) {
      res.status(400).json({ error: 'title and rootBlock are required' });
      return;
    }
    if (status !== undefined) {
      if (typeof status !== 'string') {
        res.status(400).json({ error: 'status must be a string' });
        return;
      }
      if (status === 'published' && !req.user?.permissions.includes(PERMISSIONS.OBJECTS_PUBLISH)) {
        res.status(403).json({ error: `Missing permission: ${PERMISSIONS.OBJECTS_PUBLISH}` });
        return;
      }
    }

    const document = await updateDocumentContent(req.params.id, { title, rootBlock, status });
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json({ document });
  } catch (error: any) {
    console.error('Update document error:', error);
    res.status(500).json({ error: error.message || 'Failed to update document' });
  }
});

// Reusable content fragments saved from Whoobe Studio's "Save as Snippet"
// action (a full WhoobeBlockNode subtree, not a whole document) - see
// packages/core/src/db/snippet-schema.ts. Reuses the same objects:read/write
// permissions as documents, same rationale as that route's comment above.
app.get('/snippets', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const snippets = await listSnippets();
    res.json({ snippets });
  } catch (error: any) {
    console.error('List snippets error:', error);
    res.status(500).json({ error: error.message || 'Failed to list snippets' });
  }
});

app.post('/snippets', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, icon, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || !node) {
      res.status(400).json({ error: 'name and node are required' });
      return;
    }

    const snippet = await createSnippet({ name: name.trim(), icon: typeof icon === 'string' ? icon : null, node });
    res.status(201).json({ snippet });
  } catch (error: any) {
    console.error('Create snippet error:', error);
    res.status(500).json({ error: error.message || 'Failed to create snippet' });
  }
});

app.delete('/snippets/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteSnippet(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete snippet error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete snippet' });
  }
});

// Same idea as /snippets above, but for apps/whoobe-one-spike's own,
// incompatible node format (an ElementsClass.js `Element` subtree, not a
// WhoobeBlockNode) - see packages/core/src/db/whoobe-one-snippet-schema.ts.
// whoobe-one-spike has no login flow of its own (same situation as
// dam-api.ts's callers), so these routes work for it exactly like the DAM
// ones do - as long as there's already a session cookie for the current
// hostname.
app.get('/whoobe-one/snippets', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const snippets = await listWhoobeOneSnippets();
    res.json({ snippets });
  } catch (error: any) {
    console.error('List whoobe-one snippets error:', error);
    res.status(500).json({ error: error.message || 'Failed to list snippets' });
  }
});

app.post('/whoobe-one/snippets', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, icon, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() || node == null) {
      res.status(400).json({ error: 'name, category, and node are required' });
      return;
    }

    const snippet = await createWhoobeOneSnippet({
      name: name.trim(),
      category: category.trim(),
      icon: typeof icon === 'string' ? icon : null,
      node,
    });
    res.status(201).json({ snippet });
  } catch (error: any) {
    console.error('Create whoobe-one snippet error:', error);
    res.status(500).json({ error: error.message || 'Failed to create snippet' });
  }
});

// Overwrites an existing snippet in place - lets a minor tweak get saved
// back onto the snippet it came from instead of always creating a new,
// near-duplicate one (see SaveSnippetModal.vue's "Update existing" mode).
app.patch('/whoobe-one/snippets/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, icon, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() || node == null) {
      res.status(400).json({ error: 'name, category, and node are required' });
      return;
    }

    const snippet = await updateWhoobeOneSnippet(req.params.id, {
      name: name.trim(),
      category: category.trim(),
      icon: typeof icon === 'string' ? icon : null,
      node,
    });
    if (!snippet) {
      res.status(404).json({ error: 'Snippet not found' });
      return;
    }
    res.json({ snippet });
  } catch (error: any) {
    console.error('Update whoobe-one snippet error:', error);
    res.status(500).json({ error: error.message || 'Failed to update snippet' });
  }
});

app.delete('/whoobe-one/snippets/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWhoobeOneSnippet(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete whoobe-one snippet error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete snippet' });
  }
});

// whoobe-one-spike's own "templates" (whole documents, see that app's
// README) - previously local-only, browser-IndexedDB storage; moved here
// so this editor's data lives in the same real database as everything
// else in this monorepo, ahead of integrating it for real. `path` is
// unique (whoobe-one-template-schema.ts's own index) - Postgres error code
// 23505 (unique_violation) is what a path collision actually looks like,
// surfaced as a 409 rather than a generic 500 so the UI can tell the user
// to pick a different path instead of just failing.
app.get('/whoobe-one/templates', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await listWhoobeOneTemplates();
    res.json({ templates });
  } catch (error: any) {
    console.error('List whoobe-one templates error:', error);
    res.status(500).json({ error: error.message || 'Failed to list templates' });
  }
});

app.get('/whoobe-one/templates/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getWhoobeOneTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    console.error('Get whoobe-one template error:', error);
    res.status(500).json({ error: error.message || 'Failed to get template' });
  }
});

app.post('/whoobe-one/templates', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, path, description, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof path !== 'string' || !path.trim() || node == null) {
      res.status(400).json({ error: 'name, path, and node are required' });
      return;
    }

    const template = await createWhoobeOneTemplate({
      name: name.trim(),
      category: typeof category === 'string' ? category : '',
      path: path.trim(),
      description: typeof description === 'string' ? description : null,
      node,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A template with path "${req.body?.path}" already exists` });
      return;
    }
    console.error('Create whoobe-one template error:', error);
    res.status(500).json({ error: error.message || 'Failed to create template' });
  }
});

app.patch('/whoobe-one/templates/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, description, node } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || node == null) {
      res.status(400).json({ error: 'name and node are required' });
      return;
    }

    const template = await updateWhoobeOneTemplate(req.params.id, {
      name: name.trim(),
      category: typeof category === 'string' ? category : '',
      description: typeof description === 'string' ? description : null,
      node,
    });
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    console.error('Update whoobe-one template error:', error);
    res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

app.delete('/whoobe-one/templates/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWhoobeOneTemplate(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete whoobe-one template error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// whoobe-one-spike's own "kits" (named, categorized template collections -
// see that app's README's Kits section) - same "moved from local
// IndexedDB to this real database" motivation as templates above. The
// repo's own reference kits are seeded server-side now (packages/core/src/
// db/seed.ts's seedWhoobeOneKits(), see bootstrapDatabase()) rather than
// fetched-and-imported from the client, so there's no client-facing
// "import" endpoint here at all - only real CRUD.
app.get('/whoobe-one/kits', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const kits = await listWhoobeOneKits();
    res.json({ kits });
  } catch (error: any) {
    console.error('List whoobe-one kits error:', error);
    res.status(500).json({ error: error.message || 'Failed to list kits' });
  }
});

app.get('/whoobe-one/kits/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const kit = await getWhoobeOneKit(req.params.id);
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.json({ kit });
  } catch (error: any) {
    console.error('Get whoobe-one kit error:', error);
    res.status(500).json({ error: error.message || 'Failed to get kit' });
  }
});

app.post('/whoobe-one/kits', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, category, templates } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const kit = await createWhoobeOneKit({
      name: name.trim(),
      description: typeof description === 'string' ? description : null,
      category: typeof category === 'string' ? category : '',
      templates: Array.isArray(templates) ? templates : [],
    });
    res.status(201).json({ kit });
  } catch (error: any) {
    console.error('Create whoobe-one kit error:', error);
    res.status(500).json({ error: error.message || 'Failed to create kit' });
  }
});

// Appends one template entry to an existing kit - a dedicated endpoint
// (rather than a generic PATCH the client would have to fetch-modify-
// write through) so the read-modify-write on `templates` happens exactly
// once, at the DB layer, not racily from the client.
app.post('/whoobe-one/kits/:id/templates', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { template } = req.body ?? {};
    if (template == null) {
      res.status(400).json({ error: 'template is required' });
      return;
    }
    const kit = await addTemplateToWhoobeOneKit(req.params.id, template);
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.json({ kit });
  } catch (error: any) {
    console.error('Add template to whoobe-one kit error:', error);
    res.status(500).json({ error: error.message || 'Failed to add template to kit' });
  }
});

app.delete('/whoobe-one/kits/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWhoobeOneKit(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete whoobe-one kit error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete kit' });
  }
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
