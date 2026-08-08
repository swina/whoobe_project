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
  listWebsites,
  getWebsite,
  getWebsiteByDomain,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  listMenus,
  getMenu,
  createMenu,
  updateMenu,
  deleteMenu,
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
  listWhoobePages,
  getWhoobePage,
  listWhoobePageTranslations,
  createWhoobePage,
  updateWhoobePage,
  deleteWhoobePage,
  getPublishedWhoobePageBySlug,
  listPublishedWhoobePages,
  listDataClasses,
  getDataClass,
  createDataClass,
  updateDataClass,
  deleteDataClass,
  listDataComponents,
  getDataComponent,
  createDataComponent,
  updateDataComponent,
  deleteDataComponent,
  isDataComponentInUse,
  listDataObjects,
  getDataObject,
  listDataObjectTranslations,
  createDataObject,
  updateDataObject,
  deleteDataObject,
  listPublishedDataObjects,
  getPublishedDataObject,
  getDataObjectsByIds,
  getPublishedDataObjectsByIds,
  getDataClassByName,
  createPreviewToken,
  getPreviewToken,
  listPreviewTokensForObject,
  revokePreviewToken,
  incrementPreviewTokenViewCount,
  isPreviewTokenValid,
  getWorkflowDefinitionByClassId,
  upsertWorkflowDefinition,
  deleteWorkflowDefinition,
  isTransitionValid,
  getTransitionDefinition,
  logWorkflowTransition,
  listWorkflowTransitionsForObject,
  listMigrationSources,
  getMigrationSource,
  getMigrationSourceConnectionConfig,
  createMigrationSource,
  updateMigrationSource,
  deleteMigrationSource,
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
import { runClassMigration, runObjectMigration } from '@pimcore-custom/migration-tool';


function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

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

// whoobe-one-spike's own real, published website pages - see docs/plans/
// cms/whoobe-one-editor-integration-plan.md §4. Distinct from the
// `/whoobe-one/templates` routes above: templates stay a reusable
// starting-point library, pages are the CMS's actual content.
app.get('/whoobe-one/pages', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const pages = await listWhoobePages();
    res.json({ pages });
  } catch (error: any) {
    console.error('List whoobe-one pages error:', error);
    res.status(500).json({ error: error.message || 'Failed to list pages' });
  }
});

app.get('/whoobe-one/pages/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await getWhoobePage(req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    res.json({ page });
  } catch (error: any) {
    console.error('Get whoobe-one page error:', error);
    res.status(500).json({ error: error.message || 'Failed to get page' });
  }
});

// Every locale variant of the same logical page (see the integration
// plan §4 on `translationGroupId`) - for a translations picker/switcher,
// not part of the plain CRUD set above.
app.get(
  '/whoobe-one/pages/:id/translations',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await getWhoobePage(req.params.id);
      if (!page) {
        res.status(404).json({ error: 'Page not found' });
        return;
      }
      const translations = await listWhoobePageTranslations(page.translationGroupId);
      res.json({ translations });
    } catch (error: any) {
      console.error('List whoobe-one page translations error:', error);
      res.status(500).json({ error: error.message || 'Failed to list page translations' });
    }
  }
);

app.post('/whoobe-one/pages', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { translationGroupId, locale, slug, title, category, content, seo, sitemap, search, pimcoreId } = req.body ?? {};
    if (typeof slug !== 'string' || !slug.trim() || typeof title !== 'string' || !title.trim() || content == null) {
      res.status(400).json({ error: 'slug, title, and content are required' });
      return;
    }

    const page = await createWhoobePage({
      translationGroupId: typeof translationGroupId === 'string' ? translationGroupId : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      slug: slug.trim(),
      title: title.trim(),
      category: typeof category === 'string' ? category : undefined,
      content,
      seo: seo ?? null,
      sitemap: sitemap ?? null,
      search: search ?? null,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
    });
    res.status(201).json({ page });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A page with slug "${req.body?.slug}" already exists for this locale` });
      return;
    }
    console.error('Create whoobe-one page error:', error);
    res.status(500).json({ error: error.message || 'Failed to create page' });
  }
});

app.patch('/whoobe-one/pages/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug, title, category, published, workflowState, content, locale, seo, sitemap, search } = req.body ?? {};

    const page = await updateWhoobePage(req.params.id, {
      slug: typeof slug === 'string' ? slug : undefined,
      title: typeof title === 'string' ? title : undefined,
      category: typeof category === 'string' ? category : undefined,
      published: typeof published === 'boolean' ? published : undefined,
      workflowState: workflowState === null || typeof workflowState === 'string' ? workflowState : undefined,
      content: content !== undefined ? content : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      seo: seo !== undefined ? seo : undefined,
      sitemap: sitemap !== undefined ? sitemap : undefined,
      search: search !== undefined ? search : undefined,
    });
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    res.json({ page });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A page with slug "${req.body?.slug}" already exists for this locale` });
      return;
    }
    console.error('Update whoobe-one page error:', error);
    res.status(500).json({ error: error.message || 'Failed to update page' });
  }
});

app.delete('/whoobe-one/pages/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWhoobePage(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete whoobe-one page error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete page' });
  }
});

// --- Websites ---
app.get('/whoobe-one/websites', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await listWebsites();
    res.json({ websites: result });
  } catch (error: any) {
    console.error('List websites error:', error);
    res.status(500).json({ error: error.message || 'Failed to list websites' });
  }
});

app.post('/whoobe-one/websites', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, domains, defaultLocale, supportedLocales, settings } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const website = await createWebsite({
      name,
      domains: Array.isArray(domains) ? domains : undefined,
      defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : undefined,
      supportedLocales: Array.isArray(supportedLocales) ? supportedLocales : undefined,
      settings: settings !== undefined ? settings : undefined,
    });
    res.status(201).json({ website });
  } catch (error: any) {
    console.error('Create website error:', error);
    res.status(500).json({ error: error.message || 'Failed to create website' });
  }
});

app.get('/whoobe-one/websites/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    res.json({ website });
  } catch (error: any) {
    console.error('Get website error:', error);
    res.status(500).json({ error: error.message || 'Failed to get website' });
  }
});

app.patch('/whoobe-one/websites/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, domains, defaultLocale, supportedLocales, settings } = req.body ?? {};
    const website = await updateWebsite(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      domains: Array.isArray(domains) ? domains : undefined,
      defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : undefined,
      supportedLocales: Array.isArray(supportedLocales) ? supportedLocales : undefined,
      settings: settings !== undefined ? settings : undefined,
    });
    if (!website) {
      res.status(404).json({ error: 'Website not found' });
      return;
    }
    res.json({ website });
  } catch (error: any) {
    console.error('Update website error:', error);
    res.status(500).json({ error: error.message || 'Failed to update website' });
  }
});

app.delete('/whoobe-one/websites/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWebsite(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete website error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete website' });
  }
});

// --- Menus ---
app.get('/whoobe-one/menus', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const result = await listMenus(websiteId);
    res.json({ menus: result });
  } catch (error: any) {
    console.error('List menus error:', error);
    res.status(500).json({ error: error.message || 'Failed to list menus' });
  }
});

app.post('/whoobe-one/menus', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { websiteId, name, items } = req.body ?? {};
    if (!websiteId || typeof websiteId !== 'string') {
      res.status(400).json({ error: 'websiteId is required' });
      return;
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const menu = await createMenu({
      websiteId,
      name,
      items: Array.isArray(items) ? items : undefined,
    });
    res.status(201).json({ menu });
  } catch (error: any) {
    console.error('Create menu error:', error);
    res.status(500).json({ error: error.message || 'Failed to create menu' });
  }
});

app.get('/whoobe-one/menus/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const menu = await getMenu(req.params.id);
    if (!menu) {
      res.status(404).json({ error: 'Menu not found' });
      return;
    }
    res.json({ menu });
  } catch (error: any) {
    console.error('Get menu error:', error);
    res.status(500).json({ error: error.message || 'Failed to get menu' });
  }
});

app.patch('/whoobe-one/menus/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, items } = req.body ?? {};
    const menu = await updateMenu(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      items: Array.isArray(items) ? items : undefined,
    });
    if (!menu) {
      res.status(404).json({ error: 'Menu not found' });
      return;
    }
    res.json({ menu });
  } catch (error: any) {
    console.error('Update menu error:', error);
    res.status(500).json({ error: error.message || 'Failed to update menu' });
  }
});

app.delete('/whoobe-one/menus/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteMenu(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete menu error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete menu' });
  }
});

// Public page endpoints (no auth required)
app.get('/public/pages/:locale/:slug', async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    const page = await getPublishedWhoobePageBySlug(req.params.locale, req.params.slug, websiteId);
    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }
    res.json({ page });
  } catch (error: any) {
    console.error('Public page lookup error:', error);
    res.status(500).json({ error: error.message || 'Failed to look up page' });
  }
});

app.get('/public/sitemap.xml', async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    const pages = await listPublishedWhoobePages(websiteId);
    const sitemapPages = pages.filter((p) => p.sitemap?.included !== false);

    const baseUrl = process.env.PUBLIC_SITE_URL || 'https://example.com';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const page of sitemapPages) {
      const loc = `${baseUrl}${page.slug}`;
      const lastmod = page.updatedAt instanceof Date ? page.updatedAt.toISOString() : new Date(page.updatedAt).toISOString();
      xml += '  <url>\n';
      xml += `    <loc>${escapeXml(loc)}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      if (page.sitemap?.changefreq) {
        xml += `    <changefreq>${page.sitemap.changefreq}</changefreq>\n`;
      }
      if (page.sitemap?.priority !== null && page.sitemap?.priority !== undefined) {
        xml += `    <priority>${page.sitemap.priority.toFixed(1)}</priority>\n`;
      }
      xml += '  </url>\n';
    }
    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error: any) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate sitemap' });
  }
});

app.get('/public/robots.txt', async (_req: Request, res: Response): Promise<void> => {
  const baseUrl = process.env.PUBLIC_SITE_URL || 'https://example.com';
  const content = [
    'User-agent: *',
    `Allow: /`,
    '',
    `Sitemap: ${baseUrl}/public/sitemap.xml`,
    '',
  ].join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(content);
});

// Data Object classes (Pimcore's "Classes" concept) - see docs/plans/
// datamodel/advanced-data-modeling-plan.md §4.1/§6. Reuses the same
// PERMISSIONS.OBJECTS_* triad every other resource in this file does
// (documents/snippets/templates/kits/pages) rather than inventing
// class-specific permission strings - that's this codebase's own existing
// convention for "any admin-managed content", not something this plan
// introduces new permissions for.
app.get('/data-classes', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const classes = await listDataClasses();
    res.json({ classes });
  } catch (error: any) {
    console.error('List data classes error:', error);
    res.status(500).json({ error: error.message || 'Failed to list classes' });
  }
});

app.get('/data-classes/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const dataClass = await getDataClass(req.params.id);
    if (!dataClass) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    res.json({ class: dataClass });
  } catch (error: any) {
    console.error('Get data class error:', error);
    res.status(500).json({ error: error.message || 'Failed to get class' });
  }
});

app.post('/data-classes', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields, viewConfig, pimcoreId } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof label !== 'string' || !label.trim() || !Array.isArray(fields)) {
      res.status(400).json({ error: 'name, label, and fields are required' });
      return;
    }

    const dataClass = await createDataClass({
      name: name.trim(),
      label: label.trim(),
      fields,
      viewConfig: viewConfig ?? null,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
    });
    res.status(201).json({ class: dataClass });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A class named "${req.body?.name}" already exists` });
      return;
    }
    console.error('Create data class error:', error);
    res.status(500).json({ error: error.message || 'Failed to create class' });
  }
});

app.patch('/data-classes/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields, viewConfig } = req.body ?? {};

    // Guardrail (docs/plans/datamodel/native-class-authoring-plan.md §3.1):
    // once a class has real objects, a field's `name` disappearing or its
    // `fieldType` changing would silently orphan/invalidate data already
    // stored in those objects' `attributes` JSONB - blocked outright rather
    // than allowed to break quietly. Adding new fields, or editing
    // title/mandatory/localized/options on a surviving same-name-same-type
    // field, is unrestricted.
    if (Array.isArray(fields)) {
      const existing = await getDataClass(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Class not found' });
        return;
      }
      const objects = await listDataObjects(req.params.id);
      if (objects.length > 0) {
        const oldFieldsByName = new Map(existing.fields.map((f) => [f.name, f]));
        const newFieldsByName = new Map(fields.map((f: { name: string }) => [f.name, f]));
        const removed = [...oldFieldsByName.keys()].filter((name) => !newFieldsByName.has(name));
        const typeChanged = [...oldFieldsByName.entries()]
          .filter(([name, old]) => newFieldsByName.has(name) && (newFieldsByName.get(name) as any).fieldType !== old.fieldType)
          .map(([name]) => name);
        if (removed.length > 0 || typeChanged.length > 0) {
          res.status(409).json({
            error: `Cannot change these fields while ${objects.length} object(s) exist for this class: ${[...removed, ...typeChanged].join(', ')}. Remove the objects first, or leave the field's name/type unchanged.`,
          });
          return;
        }
      }
    }

    const dataClass = await updateDataClass(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      label: typeof label === 'string' ? label : undefined,
      fields: Array.isArray(fields) ? fields : undefined,
      viewConfig: viewConfig !== undefined ? viewConfig : undefined,
    });
    if (!dataClass) {
      res.status(404).json({ error: 'Class not found' });
      return;
    }
    res.json({ class: dataClass });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A class named "${req.body?.name}" already exists` });
      return;
    }
    console.error('Update data class error:', error);
    res.status(500).json({ error: error.message || 'Failed to update class' });
  }
});

app.delete('/data-classes/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    // Guardrail: deleteDataClass has no cascade (data_objects.classId is a
    // plain uuid, not a real FK - advanced-data-modeling-plan.md §4.2's
    // Phase 1 note on drizzle-kit's cross-file FK limit), so deleting a
    // class with existing objects would silently orphan them rather than
    // erroring - blocked outright instead.
    const objects = await listDataObjects(req.params.id);
    if (objects.length > 0) {
      res.status(409).json({ error: `Cannot delete this class: ${objects.length} object(s) still belong to it. Delete those objects first.` });
      return;
    }
    await deleteDataClass(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete data class error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete class' });
  }
});

// Component Types - docs/plans/datamodel/component-fields-plan.md. This
// plan's own name for Pimcore's "Field Collection" concept - a named,
// reusable field-list definition a `fieldcollections`-type class field can
// reference by name (`allowedComponentTypes`). Same PERMISSIONS.OBJECTS_*
// triad as every other resource in this file, per that plan's own §3.
// Phase 1 scope only: no in-use guardrail on delete yet (component-fields-
// plan.md §2.5/Phase 4 is real, separate work - deliberately not built
// here, same as this plan's own stated phase boundary).
app.get('/data-components', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const components = await listDataComponents();
    res.json({ components });
  } catch (error: any) {
    console.error('List data components error:', error);
    res.status(500).json({ error: error.message || 'Failed to list components' });
  }
});

app.get('/data-components/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const component = await getDataComponent(req.params.id);
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    res.json({ component });
  } catch (error: any) {
    console.error('Get data component error:', error);
    res.status(500).json({ error: error.message || 'Failed to get component' });
  }
});

// Real in-use check - component-fields-plan.md §2.5/Phase 4. Lets
// ComponentSettingsCard.vue show a live warning the same way
// ClassSettingsCard.vue's own `objectCount` already does for classes,
// rather than only surfacing the guardrail reactively via a 409 on save.
app.get('/data-components/:id/usage', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const component = await getDataComponent(req.params.id);
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    const inUse = await isDataComponentInUse(component.name);
    res.json({ inUse });
  } catch (error: any) {
    console.error('Get data component usage error:', error);
    res.status(500).json({ error: error.message || 'Failed to check component usage' });
  }
});

app.post('/data-components', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof label !== 'string' || !label.trim() || !Array.isArray(fields)) {
      res.status(400).json({ error: 'name, label, and fields are required' });
      return;
    }

    const component = await createDataComponent({ name: name.trim(), label: label.trim(), fields });
    res.status(201).json({ component });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A component named "${req.body?.name}" already exists` });
      return;
    }
    console.error('Create data component error:', error);
    res.status(500).json({ error: error.message || 'Failed to create component' });
  }
});

app.patch('/data-components/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, label, fields } = req.body ?? {};

    // Guardrail (component-fields-plan.md §2.5/Phase 4) - mirrors PATCH
    // /data-classes/:id's own field-rename/type-change block, one level
    // down: while this Component is referenced by any object's own
    // fieldcollections item, a field disappearing or changing type would
    // silently invalidate data already stored under the old shape.
    if (Array.isArray(fields)) {
      const existing = await getDataComponent(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Component not found' });
        return;
      }
      const inUse = await isDataComponentInUse(existing.name);
      if (inUse) {
        const oldFieldsByName = new Map(existing.fields.map((f) => [f.name, f]));
        const newFieldsByName = new Map(fields.map((f: { name: string }) => [f.name, f]));
        const removed = [...oldFieldsByName.keys()].filter((name) => !newFieldsByName.has(name));
        const typeChanged = [...oldFieldsByName.entries()]
          .filter(([name, old]) => newFieldsByName.has(name) && (newFieldsByName.get(name) as any).fieldType !== old.fieldType)
          .map(([name]) => name);
        if (removed.length > 0 || typeChanged.length > 0) {
          res.status(409).json({
            error: `Cannot change these fields while this component is referenced by an existing object: ${[...removed, ...typeChanged].join(', ')}. Leave the field's name/type unchanged, or remove the references first.`,
          });
          return;
        }
      }
    }

    const component = await updateDataComponent(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      label: typeof label === 'string' ? label : undefined,
      fields: Array.isArray(fields) ? fields : undefined,
    });
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    res.json({ component });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `A component named "${req.body?.name}" already exists` });
      return;
    }
    console.error('Update data component error:', error);
    res.status(500).json({ error: error.message || 'Failed to update component' });
  }
});

app.delete('/data-components/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const component = await getDataComponent(req.params.id);
    if (!component) {
      res.status(404).json({ error: 'Component not found' });
      return;
    }
    const inUse = await isDataComponentInUse(component.name);
    if (inUse) {
      res.status(409).json({ error: 'Cannot delete this component: at least one existing object still references it. Remove those references first.' });
      return;
    }
    await deleteDataComponent(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete data component error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete component' });
  }
});

// Migration sources - configured connections to a source Pimcore install,
// letting an admin trigger migrate-classes/migrate-objects on demand from
// the Class Builder instead of needing shell/DB/filesystem access to run
// packages/migration-tool's CLI directly - docs/plans/datamodel/native-
// class-authoring-plan.md §3.4/Phase 4. `listMigrationSources`/
// `getMigrationSource` never return the encrypted password (see that
// records module's own `toRecord` stripping it) - only
// `getMigrationSourceConnectionConfig`, used here strictly server-side to
// build a real DB connection, ever decrypts it.
app.get('/migration-sources', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const sources = await listMigrationSources();
    res.json({ sources });
  } catch (error: any) {
    console.error('List migration sources error:', error);
    res.status(500).json({ error: error.message || 'Failed to list migration sources' });
  }
});

app.post('/migration-sources', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, dbHost, dbPort, dbUser, dbPassword, dbName, classesPath } = req.body ?? {};
    if (
      typeof label !== 'string' || !label.trim() ||
      typeof dbHost !== 'string' || !dbHost.trim() ||
      typeof dbUser !== 'string' || !dbUser.trim() ||
      typeof dbPassword !== 'string' || !dbPassword ||
      typeof dbName !== 'string' || !dbName.trim() ||
      typeof classesPath !== 'string' || !classesPath.trim()
    ) {
      res.status(400).json({ error: 'label, dbHost, dbUser, dbPassword, dbName, and classesPath are required' });
      return;
    }
    const source = await createMigrationSource({
      label: label.trim(),
      dbHost: dbHost.trim(),
      dbPort: typeof dbPort === 'number' ? dbPort : 3306,
      dbUser: dbUser.trim(),
      dbPassword,
      dbName: dbName.trim(),
      classesPath: classesPath.trim(),
    });
    res.status(201).json({ source });
  } catch (error: any) {
    console.error('Create migration source error:', error);
    res.status(500).json({ error: error.message || 'Failed to create migration source' });
  }
});

app.patch('/migration-sources/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { label, dbHost, dbPort, dbUser, dbPassword, dbName, classesPath } = req.body ?? {};
    const source = await updateMigrationSource(req.params.id, {
      label: typeof label === 'string' ? label : undefined,
      dbHost: typeof dbHost === 'string' ? dbHost : undefined,
      dbPort: typeof dbPort === 'number' ? dbPort : undefined,
      dbUser: typeof dbUser === 'string' ? dbUser : undefined,
      // Omitted entirely (not just falsy) keeps the currently-stored
      // password - see updateMigrationSource's own doc comment.
      dbPassword: typeof dbPassword === 'string' && dbPassword ? dbPassword : undefined,
      dbName: typeof dbName === 'string' ? dbName : undefined,
      classesPath: typeof classesPath === 'string' ? classesPath : undefined,
    });
    if (!source) {
      res.status(404).json({ error: 'Migration source not found' });
      return;
    }
    res.json({ source });
  } catch (error: any) {
    console.error('Update migration source error:', error);
    res.status(500).json({ error: error.message || 'Failed to update migration source' });
  }
});

app.delete('/migration-sources/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteMigrationSource(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete migration source error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete migration source' });
  }
});

// Wraps packages/migration-tool's real migrate-classes/migrate-objects
// logic (runClassMigration/runObjectMigration, refactored from the CLI-
// only migrateClasses/migrateObjects to accept per-request config rather
// than reading process.env - see cli.ts's own comment on those exports)
// rather than reimplementing it, per this plan's own explicit intent.
app.post(
  '/migration-sources/:id/import-classes',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const source = await getMigrationSource(req.params.id);
      if (!source) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      const { dryRun, className } = req.body ?? {};
      const result = await runClassMigration({
        classesDir: source.classesPath,
        dryRun: dryRun === true,
        className: typeof className === 'string' && className ? className : undefined,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Import classes error:', error);
      res.status(500).json({ error: error.message || 'Failed to import classes' });
    }
  }
);

app.post(
  '/migration-sources/:id/import-objects',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { className, dryRun, limit } = req.body ?? {};
      if (typeof className !== 'string' || !className.trim()) {
        res.status(400).json({ error: 'className is required' });
        return;
      }
      const resolved = await getMigrationSourceConnectionConfig(req.params.id);
      if (!resolved) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      const result = await runObjectMigration({
        className: className.trim(),
        source: 'mysql',
        // runObjectMigration's sourceConfig is a plain Record (it hands
        // this straight to createPimcoreSourceAdapter, which is adapter-
        // name-agnostic and so can't know the mysql adapter's own typed
        // shape) - MigrationSourceConnectionConfig is that same shape,
        // just named for readability at this call site.
        sourceConfig: { ...resolved.connection } as Record<string, unknown>,
        dryRun: dryRun === true,
        limit: typeof limit === 'number' ? limit : undefined,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Import objects error:', error);
      res.status(500).json({ error: error.message || 'Failed to import objects' });
    }
  }
);

// Data Object instances (Pimcore's PIM/MDM "Objects") - see docs/plans/
// datamodel/advanced-data-modeling-plan.md §4.2/§6. `?classId=` supports
// ObjectsView.vue's own class filter (§6.2) - a plain query param, not a
// separate route, since it's an optional narrowing of the same list.
app.get('/data-objects', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const objects = await listDataObjects(classId);
    res.json({ objects });
  } catch (error: any) {
    console.error('List data objects error:', error);
    res.status(500).json({ error: error.message || 'Failed to list objects' });
  }
});

// Batch-fetch multiple objects by id - one round-trip for the editor's
// data-binding resolution instead of N single-object requests. Must be
// registered BEFORE the `/:id` route below (Express matches in order, and
// "batch" would otherwise be captured as an :id).
app.get(
  '/data-objects/batch',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ids = (typeof req.query.ids === 'string' ? req.query.ids : '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const objects = await getDataObjectsByIds(ids);
      res.json({ objects });
    } catch (error: any) {
      console.error('Batch get data objects error:', error);
      res.status(500).json({ error: error.message || 'Failed to batch get objects' });
    }
  }
);

app.get('/data-objects/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const dataObject = await getDataObject(req.params.id);
    if (!dataObject) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    res.json({ object: dataObject });
  } catch (error: any) {
    console.error('Get data object error:', error);
    res.status(500).json({ error: error.message || 'Failed to get object' });
  }
});

// Every locale variant of the same logical object - same role
// /whoobe-one/pages/:id/translations plays for pages.
app.get(
  '/data-objects/:id/translations',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const dataObject = await getDataObject(req.params.id);
      if (!dataObject) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      const translations = await listDataObjectTranslations(dataObject.translationGroupId);
      res.json({ translations });
    } catch (error: any) {
      console.error('List data object translations error:', error);
      res.status(500).json({ error: error.message || 'Failed to list object translations' });
    }
  }
);

// Same lookup, keyed directly by translationGroupId rather than resolved
// from one specific locale row's id first - MasterObjectTab.vue (admin-
// dashboard) opens a tab per logical record (docs/plans/datamodel/
// data-objects-views-editing.md), and needs this decoupled from
// ObjectsView.vue's own list-level store state (which can be pointed at
// a different class entirely while this tab stays open in the
// background - see that component's own comment on why it doesn't just
// filter the shared list store instead).
app.get(
  '/data-objects/translations/:translationGroupId',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const translations = await listDataObjectTranslations(req.params.translationGroupId);
      res.json({ translations });
    } catch (error: any) {
      console.error('List data object translations by group error:', error);
      res.status(500).json({ error: error.message || 'Failed to list object translations' });
    }
  }
);

app.post('/data-objects', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { classId, key, path, parentId, translationGroupId, locale, attributes, pimcoreId } = req.body ?? {};
    if (typeof classId !== 'string' || !classId.trim() || typeof key !== 'string' || !key.trim() || attributes == null) {
      res.status(400).json({ error: 'classId, key, and attributes are required' });
      return;
    }

    const dataObject = await createDataObject({
      classId,
      key: key.trim(),
      path: typeof path === 'string' ? path : undefined,
      parentId: typeof parentId === 'string' ? parentId : null,
      translationGroupId: typeof translationGroupId === 'string' ? translationGroupId : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      attributes,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
    });
    res.status(201).json({ object: dataObject });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `An object with key "${req.body?.key}" already exists for this class` });
      return;
    }
    console.error('Create data object error:', error);
    res.status(500).json({ error: error.message || 'Failed to create object' });
  }
});

app.patch('/data-objects/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { key, path, parentId, published, workflowState, attributes } = req.body ?? {};

    const dataObject = await updateDataObject(req.params.id, {
      key: typeof key === 'string' ? key : undefined,
      path: typeof path === 'string' ? path : undefined,
      parentId: parentId === null || typeof parentId === 'string' ? parentId : undefined,
      published: typeof published === 'boolean' ? published : undefined,
      workflowState: workflowState === null || typeof workflowState === 'string' ? workflowState : undefined,
      attributes: attributes !== undefined ? attributes : undefined,
    });
    if (!dataObject) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    res.json({ object: dataObject });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: `An object with key "${req.body?.key}" already exists for this class` });
      return;
    }
    console.error('Update data object error:', error);
    res.status(500).json({ error: error.message || 'Failed to update object' });
  }
});

app.delete('/data-objects/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteDataObject(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete data object error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete object' });
  }
});

// Public Data Object API - see docs/plans/backend/object-publish-
// workflow-plan.md §2.2/§7 Phase 1. Deliberately no requireAuth/
// requirePermission here at all (matching /auth/login's own precedent
// for a genuinely public route in this file) - visibility is enforced by
// always going through listPublishedDataObjects/getPublishedDataObject
// (§2.2's "one shared place", packages/core), never by re-deriving a
// `published = true` filter here. `?class=<Name>` resolves to a classId
// the same way the admin `/data-objects?classId=` route already expects
// one, just accepting the human name instead (a public consumer has no
// reason to know an internal class uuid).
app.get('/public/data-objects', async (req: Request, res: Response): Promise<void> => {
  try {
    const className = typeof req.query.class === 'string' ? req.query.class : undefined;
    const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    let classId: string | undefined;
    if (className) {
      const dataClass = await getDataClassByName(className);
      if (!dataClass) {
        res.json({ objects: [] });
        return;
      }
      classId = dataClass.id;
    }
    const objects = await listPublishedDataObjects(classId, locale);
    res.json({ objects });
  } catch (error: any) {
    console.error('List public data objects error:', error);
    res.status(500).json({ error: error.message || 'Failed to list objects' });
  }
});

// Public batch-fetch by id - same published-only gate as the single-object
// endpoint. Must be registered BEFORE the `/:id` route below.
app.get('/public/data-objects/batch', async (req: Request, res: Response): Promise<void> => {
  try {
    const ids = (typeof req.query.ids === 'string' ? req.query.ids : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const objects = await getPublishedDataObjectsByIds(ids);
    res.json({ objects });
  } catch (error: any) {
    console.error('Batch get public data objects error:', error);
    res.status(500).json({ error: error.message || 'Failed to batch get objects' });
  }
});

app.get('/public/data-objects/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const object = await getPublishedDataObject(req.params.id);
    if (!object) {
      // Identical response whether the id doesn't exist or exists but
      // isn't published - never leak "this exists but is a draft" (§2.2).
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    res.json({ object });
  } catch (error: any) {
    console.error('Get public data object error:', error);
    res.status(500).json({ error: error.message || 'Failed to get object' });
  }
});

// Preview links - object-publish-workflow-plan.md §2.3/§7 Phase 2. Issuing
// one is admin-only (gated on OBJECTS_PUBLISH, the same permission that
// gates flipping `published` itself - sharing a preview of unpublished
// content is a publish-adjacent action); *resolving* one is deliberately
// public with zero auth, same as the public Data Object routes above -
// the token itself is the only credential, matching the plan's own "a
// separate route, reachable only by having the exact token" design.
app.post(
  '/data-objects/:id/preview-link',
  requirePermission(PERMISSIONS.OBJECTS_PUBLISH),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const object = await getDataObject(req.params.id);
      if (!object) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      const expiresInDays = typeof req.body?.expiresInDays === 'number' ? req.body.expiresInDays : undefined;
      const previewToken = await createPreviewToken({ objectId: object.id, createdBy: req.user?.id ?? null, expiresInDays });
      res.status(201).json({ token: previewToken.token, expiresAt: previewToken.expiresAt });
    } catch (error: any) {
      console.error('Create preview link error:', error);
      res.status(500).json({ error: error.message || 'Failed to create preview link' });
    }
  }
);

app.get(
  '/data-objects/:id/preview-links',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tokens = await listPreviewTokensForObject(req.params.id);
      res.json({ tokens });
    } catch (error: any) {
      console.error('List preview links error:', error);
      res.status(500).json({ error: error.message || 'Failed to list preview links' });
    }
  }
);

app.delete(
  '/data-objects/preview-links/:token',
  requirePermission(PERMISSIONS.OBJECTS_PUBLISH),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await revokePreviewToken(req.params.token);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Revoke preview link error:', error);
      res.status(500).json({ error: error.message || 'Failed to revoke preview link' });
    }
  }
);

// Resolution - no requireAuth/requirePermission at all, deliberately: the
// token itself is the credential. Not part of the /data-objects surface
// (a distinct top-level path), so it can never be reached by anything
// that also has access to the admin listing/search routes.
app.get('/preview/objects/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const previewToken = await getPreviewToken(req.params.token);
    if (!previewToken || !isPreviewTokenValid(previewToken)) {
      res.status(404).json({ error: 'Preview link not found or expired' });
      return;
    }
    const object = await getDataObject(previewToken.objectId);
    if (!object) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    await incrementPreviewTokenViewCount(previewToken.token);
    res.json({ object });
  } catch (error: any) {
    console.error('Resolve preview link error:', error);
    res.status(500).json({ error: error.message || 'Failed to resolve preview link' });
  }
});

// Workflow definitions - object-publish-workflow-plan.md §2.4/§3/§7 Phase 3.
// Authoring (define/replace/remove a class's whole workflow) is gated on
// WORKFLOWS_MANAGE, a distinct permission from OBJECTS_* - editing what
// states/transitions *exist* is a different, more structural capability
// than reading/writing/publishing individual objects.
app.get(
  '/data-classes/:id/workflow',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const definition = await getWorkflowDefinitionByClassId(req.params.id);
      res.json({ workflow: definition });
    } catch (error: any) {
      console.error('Get workflow definition error:', error);
      res.status(500).json({ error: error.message || 'Failed to get workflow definition' });
    }
  }
);

app.put(
  '/data-classes/:id/workflow',
  requirePermission(PERMISSIONS.WORKFLOWS_MANAGE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { initialPlace, places, transitions } = req.body ?? {};
      if (typeof initialPlace !== 'string' || !Array.isArray(places) || !Array.isArray(transitions)) {
        res.status(400).json({ error: 'initialPlace, places, and transitions are required' });
        return;
      }
      if (!places.some((p: any) => p.name === initialPlace)) {
        res.status(400).json({ error: `initialPlace "${initialPlace}" is not one of this workflow's own places` });
        return;
      }
      const definition = await upsertWorkflowDefinition({ classId: req.params.id, initialPlace, places, transitions });
      res.json({ workflow: definition });
    } catch (error: any) {
      console.error('Save workflow definition error:', error);
      res.status(500).json({ error: error.message || 'Failed to save workflow definition' });
    }
  }
);

app.delete(
  '/data-classes/:id/workflow',
  requirePermission(PERMISSIONS.WORKFLOWS_MANAGE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await deleteWorkflowDefinition(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete workflow definition error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete workflow definition' });
    }
  }
);

// Transitioning one object through its class's workflow. No single fixed
// requirePermission() here - each transition declares its own
// `allowedPermissions` (§2.4), checked against the signed-in identity's
// real permission set once the object/definition/transition are all
// known - just `requireAuth` up front so `req.user` exists to check.
app.post(
  '/data-objects/:id/transition',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { transitionName } = req.body ?? {};
      if (typeof transitionName !== 'string' || !transitionName.trim()) {
        res.status(400).json({ error: 'transitionName is required' });
        return;
      }

      const object = await getDataObject(req.params.id);
      if (!object) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      const definition = await getWorkflowDefinitionByClassId(object.classId);
      if (!definition) {
        res.status(400).json({ error: 'This object\'s class has no workflow defined' });
        return;
      }

      const currentPlace = object.workflowState ?? definition.initialPlace;
      if (!isTransitionValid(definition, currentPlace, transitionName)) {
        res.status(400).json({ error: `Transition "${transitionName}" is not valid from "${currentPlace}"` });
        return;
      }
      const transition = getTransitionDefinition(definition, transitionName)!;

      if (transition.allowedPermissions && transition.allowedPermissions.length > 0) {
        const userPermissions = req.user?.permissions ?? [];
        if (!transition.allowedPermissions.some((p) => userPermissions.includes(p))) {
          res.status(403).json({ error: `Missing permission for transition "${transitionName}"` });
          return;
        }
      }

      const updated = await updateDataObject(object.id, {
        workflowState: transition.to,
        ...(transition.setPublished !== undefined ? { published: transition.setPublished } : {}),
      });
      await logWorkflowTransition({
        objectId: object.id,
        fromPlace: currentPlace,
        toPlace: transition.to,
        transitionName,
        actorId: req.user?.id ?? null,
      });

      res.json({ object: updated });
    } catch (error: any) {
      console.error('Transition object workflow error:', error);
      res.status(500).json({ error: error.message || 'Failed to transition object' });
    }
  }
);

app.get(
  '/data-objects/:id/transitions',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const transitions = await listWorkflowTransitionsForObject(req.params.id);
      res.json({ transitions });
    } catch (error: any) {
      console.error('List object transitions error:', error);
      res.status(500).json({ error: error.message || 'Failed to list transitions' });
    }
  }
);

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
