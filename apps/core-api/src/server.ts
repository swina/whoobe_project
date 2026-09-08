import {
  randomBytes, randomUUID
} from 'node:crypto';
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
  getWebsiteByRootPath,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  listWebsiteTemplates,
  getWebsiteTemplate,
  createWebsiteTemplate,
  updateWebsiteTemplate,
  deleteWebsiteTemplate,
  getWebsiteTemplateForPath,
  listPublishedModulePages,
  getWhoobeOneSnippet,
  listWebsitePaths,
  getWebsitePath,
  createWebsitePath,
  updateWebsitePath,
  deleteWebsitePath,
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
  listStagedWhoobePages,
  deleteStagedWhoobePage,
  isDynamicSlug,
  matchPagePath,
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
  queryDataObjects,
  queryPublishedDataObjects,
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
  getConnectionConfig,
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
  getMailSettings,
  upsertMailSettings,
  sendMail,
  sendMailFromTemplate,
  renderMailTemplate,
  collectMailFonts,
  buildMailDocument,
  resolveMailImageUrls,
  listMailLog,
  getMailLogEntry,
  deleteMailLogEntries,
  listMailTemplates,
  getMailTemplate,
  createMailTemplate,
  updateMailTemplate,
  deleteMailTemplate,
  getAiSettings,
  upsertAiSettings,
  getFigmaSettings,
  upsertFigmaSettings,
  listAiGenerated,
  createAiGenerated,
  generateAiJson,
  buildSystemPrompt,
  buildUserPrompt,
  buildWebsiteStructurePrompt,
  validateElementTree,
  validateWebsiteStructure,
  sanitizeGeneratedImages,
  AiGenerationError,
  searchContent,
  reindexAll,
  loadRootEnv,
  listThemes,
  getTheme,
  createTheme,
  updateTheme,
  deleteTheme,
  generateResetToken,
  findUserByResetToken,
  clearResetToken,
  updatePassword,
  RESET_TOKEN_TTL_MS,
  listUsers,
  getUserWithRoles,
  createUser,
  updateUser,
  deleteUser as deleteUserRecord,
  adminResetPassword,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole as deleteRoleRecord,
  listAllPermissions,
  type AuthenticatedRequest,
  type SearchOptions,
  type SearchDocumentType,
} from '@whoobe-cms/core/server';
// Root package entry, not '/server' - compileDynamicSchema lives in
// schema/dynamic.ts, exported from index.ts and kept out of the Node-only
// './server' barrel on purpose (no DB/crypto dependency, so it's also
// reachable from browser bundles - admin-dashboard already imports other
// root-package exports like ClassFieldDefinition the same way).
import { compileDynamicSchema } from '@whoobe-cms/core';
import { runClassMigration, runObjectMigration, runDocumentMigration, runPromoteDocuments, runPromoteDocument, runExtractCollectionTypes } from '@whoobe-cms/migration-tool';
import { fetchAndConvert } from '@whoobe-cms/figma-converter';


function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Load the repo-root .env (single source of truth for all apps, see
// docs/plans/environment/env-optimization.md) with ${VAR} expansion.
// Shell-exported vars win, which is how ./dev-cms.sh --hostname overrides
// WHOOBE_HOSTNAME-derived values. No .env present -> fall back to whatever
// is already in process.env.
loadRootEnv();

const cfg = getConnectionConfig();
console.log('');
console.log('=== Database Connection ===');
console.log(`  Host: ${cfg.host}`);
console.log(`  Port: ${cfg.port}`);
console.log(`  DB:   ${cfg.database}`);
console.log(`  User: ${cfg.user}`);
console.log('==========================\n');

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

// --- Simple in-memory fixed-window rate limit for /public/forms/*/submit ---
// Same single-process/dev-scale caveat as loginAttempts above. A separate
// map rather than reusing loginAttempts/recordFailedAttempt: that one
// models failure-triggered lockout (N wrong passwords -> locked out), this
// is a plain request-volume window (N submissions per IP per window,
// success or failure doesn't matter) - different enough semantics to be a
// real bug if conflated (e.g. a burst of legitimate submissions would never
// trip a failure-counting lockout at all).
const FORM_SUBMIT_MAX = 10;
const FORM_SUBMIT_WINDOW_MS = 15 * 60 * 1000;
const formSubmitCounts = new Map<string, { count: number; windowStart: number }>();

function isFormSubmitRateLimited(key: string): boolean {
  const entry = formSubmitCounts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > FORM_SUBMIT_WINDOW_MS) {
    formSubmitCounts.delete(key);
    return false;
  }
  return entry.count >= FORM_SUBMIT_MAX;
}

function recordFormSubmit(key: string): void {
  const entry = formSubmitCounts.get(key);
  if (!entry || Date.now() - entry.windowStart > FORM_SUBMIT_WINDOW_MS) {
    formSubmitCounts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

function setSessionCookie(res: Response, token: string, expiresAt: Date, _req: Request): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
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
  setSessionCookie(res, token, expiresAt, req);

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

    if (!user) {
      console.warn(`Login failed: user not found for email "${email.toLowerCase()}"`);
      recordFailedAttempt(rateLimitKey);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      console.warn(`Login failed: user "${user.id}" is inactive`);
      recordFailedAttempt(rateLimitKey);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      console.warn(
        `Login failed: wrong password for user "${user.id}" ` +
        `(hash prefix: ${user.passwordHash.slice(0, 16)}..., email: "${user.email}")`
      );
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

// --- Password Reset ---
// Rate-limited to the same in-memory approach as the login-lockout map
// above. Separate map: a forgot-password request is not a login attempt,
// it's a volume guard against email-bombing a single address.
const FORGOT_PASSWORD_MAX = 3;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const forgotPasswordCounts = new Map<string, { count: number; windowStart: number }>();

function isForgotPasswordRateLimited(email: string): boolean {
  const entry = forgotPasswordCounts.get(email);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > FORGOT_PASSWORD_WINDOW_MS) {
    forgotPasswordCounts.delete(email);
    return false;
  }
  return entry.count >= FORGOT_PASSWORD_MAX;
}

function recordForgotPassword(email: string): void {
  const entry = forgotPasswordCounts.get(email);
  if (!entry || Date.now() - entry.windowStart > FORGOT_PASSWORD_WINDOW_MS) {
    forgotPasswordCounts.set(email, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

app.post('/auth/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (isForgotPasswordRateLimited(normalizedEmail)) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }

  recordForgotPassword(normalizedEmail);

// Always respond with success, whether or not the email exists - never
  // reveal account existence to unauthenticated callers.
  try {
    const user = await findUserByEmail(normalizedEmail);
    if (user && user.isActive) {
      const token = await generateResetToken(user.id);
      console.log(`Password reset token generated for user "${user.id}": ${token.slice(0, 8)}...`);
      const hostname = process.env.WHOOBE_HOSTNAME || 'localhost';
      const resetUrl = `http://${hostname}:3000/reset-password?token=${token}`;

      const settings = await getMailSettings();
      if (!settings) {
        // Dev fallback: no SMTP configured, log the URL so testing can
        // still proceed without mail infrastructure.
        console.log('');
        console.log('=== Password reset link (no mail settings configured) ===');
        console.log(`  ${resetUrl}`);
        console.log('========================================================');
        console.log('');
      } else {
        await sendMail({
          to: user.email,
          subject: 'Password Reset Request',
          html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, ignore this email.</p>`,
          text: `You requested a password reset.\n\nReset your password here: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.`,
        });
      }
    }
  } catch (error: any) {
    console.error('Forgot-password error:', error);
    // Still return success - don't leak whether the account exists.
  }

  res.json({ success: true });
});

app.post('/auth/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'token and password (min 8 characters) are required' });
    return;
  }

  try {
    const user = await findUserByResetToken(token);
    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    // Double-check expiry server-side against the DB timestamp.
    const fullUser = await findUserById(user.id);
    if (!fullUser?.resetTokenExpiresAt || fullUser.resetTokenExpiresAt.getTime() < Date.now()) {
      await clearResetToken(user.id);
      res.status(400).json({ error: 'Reset token has expired' });
      return;
    }

    await updatePassword(user.id, password);
    await clearResetToken(user.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Reset-password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// --- Admin: User & Role CRUD (requires users:manage) ---

app.get('/auth/users', requirePermission(PERMISSIONS.USERS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const usersList = await listUsers();
    res.json({ users: usersList });
  } catch (error: any) {
    console.error('List users error:', error);
    res.status(500).json({ error: error.message || 'Failed to list users' });
  }
});

app.post('/auth/users', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const { email, password, displayName, roleIds } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < 8 || typeof displayName !== 'string') {
    res.status(400).json({ error: 'email, password (min 8 chars), and displayName are required' });
    return;
  }
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    res.status(400).json({ error: 'At least one roleId is required' });
    return;
  }
  try {
    const user = await createUser({ email, password, displayName, roleIds });
    res.status(201).json({ user });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

app.get('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserWithRoles(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ user });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message || 'Failed to get user' });
  }
});

app.patch('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const { email, displayName, isActive, roleIds } = req.body ?? {};
  try {
    const user = await updateUser(req.params.id, {
      email: typeof email === 'string' ? email : undefined,
      displayName: typeof displayName === 'string' ? displayName : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
      roleIds: Array.isArray(roleIds) ? roleIds : undefined,
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ user });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

app.delete('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteUserRecord(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete user' });
  }
});

app.post('/auth/users/:id/reset-password', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const token = await adminResetPassword(req.params.id);
    const hostname = process.env.WHOOBE_HOSTNAME || 'localhost';
    const resetUrl = `http://${hostname}:3000/reset-password?token=${token}`;
    console.log(`Admin-triggered password reset for user ${req.params.id}: ${resetUrl}`);
    res.json({ resetUrl, token });
  } catch (error: any) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

app.get('/auth/roles', requirePermission(PERMISSIONS.USERS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const rolesList = await listRoles();
    res.json({ roles: rolesList });
  } catch (error: any) {
    console.error('List roles error:', error);
    res.status(500).json({ error: error.message || 'Failed to list roles' });
  }
});

app.post('/auth/roles', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionKeys } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const role = await createRole({ name: name.trim(), description, permissionKeys: Array.isArray(permissionKeys) ? permissionKeys : [] });
    res.status(201).json({ role });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'A role with this name already exists' });
      return;
    }
    console.error('Create role error:', error);
    res.status(500).json({ error: error.message || 'Failed to create role' });
  }
});

app.get('/auth/roles/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await getRole(req.params.id);
    if (!role) { res.status(404).json({ error: 'Role not found' }); return; }
    res.json({ role });
  } catch (error: any) {
    console.error('Get role error:', error);
    res.status(500).json({ error: error.message || 'Failed to get role' });
  }
});

app.patch('/auth/roles/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const { name, description, permissionKeys } = req.body ?? {};
  try {
    const role = await updateRole(req.params.id, {
      name: typeof name === 'string' ? name.trim() : undefined,
      description: description === null ? null : typeof description === 'string' ? description : undefined,
      permissionKeys: Array.isArray(permissionKeys) ? permissionKeys : undefined,
    });
    if (!role) { res.status(404).json({ error: 'Role not found' }); return; }
    res.json({ role });
  } catch (error: any) {
    console.error('Update role error:', error);
    res.status(500).json({ error: error.message || 'Failed to update role' });
  }
});

app.delete('/auth/roles/:id', requirePermission(PERMISSIONS.USERS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await deleteRoleRecord(req.params.id);
    if (result.blocked) {
      res.status(409).json({ error: `Cannot delete role: ${result.userCount} user(s) are assigned to it` });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete role' });
  }
});

app.get('/auth/permissions', requirePermission(PERMISSIONS.USERS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const allPerms = await listAllPermissions();
    res.json({ permissions: allPerms });
  } catch (error: any) {
    console.error('List permissions error:', error);
    res.status(500).json({ error: error.message || 'Failed to list permissions' });
  }
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
    const { name, category, icon, node, themeId } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || !category.trim() || node == null) {
      res.status(400).json({ error: 'name, category, and node are required' });
      return;
    }

    const snippet = await createWhoobeOneSnippet({
      name: name.trim(),
      category: category.trim(),
      icon: typeof icon === 'string' ? icon : null,
      node,
      themeId: typeof themeId === 'string' ? themeId : null,
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
app.get('/whoobe-one/snippets/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const snippet = await getWhoobeOneSnippet(req.params.id);
    if (!snippet) {
      res.status(404).json({ error: 'Snippet not found' });
      return;
    }
    res.json({ snippet });
  } catch (error: any) {
    console.error('Get whoobe-one snippet error:', error);
    res.status(500).json({ error: error.message || 'Failed to get snippet' });
  }
});

app.patch('/whoobe-one/snippets/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, category, icon, node, themeId } = req.body ?? {};
    // category may be empty (an uncategorised snippet), name/node required.
    if (typeof name !== 'string' || !name.trim() || typeof category !== 'string' || node == null) {
      res.status(400).json({ error: 'name, category, and node are required' });
      return;
    }

    const snippet = await updateWhoobeOneSnippet(req.params.id, {
      name: name.trim(),
      category: category.trim(),
      icon: typeof icon === 'string' ? icon : null,
      node,
      themeId: themeId !== undefined ? (typeof themeId === 'string' ? themeId : null) : undefined,
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
app.get('/whoobe-one/pages', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const pages = await listWhoobePages(websiteId);
    res.json({ pages });
  } catch (error: any) {
    console.error('List whoobe-one pages error:', error);
    res.status(500).json({ error: error.message || 'Failed to list pages' });
  }
});

// Review surface for the staged migration workflow (docs/plans/cms/
// documents-migration.md §3 Phase 1 / Option B): list the rows currently
// sitting in whoobe_pages_staging - the same shape a reviewer edits later -
// without touching whoobe_pages, and delete a single staged page
// (reject/re-stage). Registered BEFORE the /whoobe-one/pages/:id GET and
// DELETE routes below so the literal "staged" segment isn't captured as an
// id (same reason /data-objects/batch precedes /data-objects/:id).
app.get('/whoobe-one/pages/staged', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const staged = await listStagedWhoobePages();
    res.json({ pages: staged });
  } catch (error: any) {
    console.error('List staged whoobe-one pages error:', error);
    res.status(500).json({ error: error.message || 'Failed to list staged pages' });
  }
});

app.delete(
  '/whoobe-one/pages/staged/:id',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await deleteStagedWhoobePage(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete staged whoobe-one page error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete staged page' });
    }
  }
);

// Promote the whole staging table into whoobe_pages - the Pages panel's own
// "review then promote" action. Source-agnostic (reads all of
// whoobe_pages_staging), unlike the migration-sources-scoped
// /migration-sources/:id/promote-documents which is the CLI-equivalent
// trigger from the Migration Sources card. Both call the same
// runPromoteDocuments.
app.post(
  '/whoobe-one/pages/staged/promote',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, clear } = req.body ?? {};
      const result = await runPromoteDocuments({
        dryRun: dryRun === true,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Promote staged whoobe-one pages error:', error);
      res.status(500).json({ error: error.message || 'Failed to promote staged pages' });
    }
  }
);

// Promote ONE staged page into whoobe_pages - the per-row "Promote" action
// in the Pages panel's Staged tab. Deliberately separate from the
// whole-table route above (and registered after it, same method+path
// prefix, different final segment) so a single-page promote never touches
// the other staged rows.
app.post(
  '/whoobe-one/pages/staged/:id/promote',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, clear } = req.body ?? {};
      const result = await runPromoteDocument({
        stagedId: req.params.id,
        dryRun: dryRun === true,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Promote staged whoobe-one page error:', error);
      res.status(500).json({ error: error.message || 'Failed to promote staged page' });
    }
  }
);

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
    const { translationGroupId, locale, slug, title, category, kind, content, seo, sitemap, search, pimcoreId, path, websiteId, themeId } = req.body ?? {};
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
      kind: kind === 'module' ? 'module' : 'content',
      content,
      seo: seo ?? null,
      sitemap: sitemap ?? null,
      search: search ?? null,
      pimcoreId: typeof pimcoreId === 'string' ? pimcoreId : null,
      path: typeof path === 'string' ? path : null,
      websiteId: typeof websiteId === 'string' ? websiteId : null,
      themeId: typeof themeId === 'string' ? themeId : null,
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
    const { slug, title, category, kind, published, workflowState, content, locale, path, websiteId, themeId, seo, sitemap, search } = req.body ?? {};

    const page = await updateWhoobePage(req.params.id, {
      slug: typeof slug === 'string' ? slug : undefined,
      title: typeof title === 'string' ? title : undefined,
      category: typeof category === 'string' ? category : undefined,
      kind: kind === 'module' ? 'module' : kind === 'content' ? 'content' : undefined,
      published: typeof published === 'boolean' ? published : undefined,
      workflowState: workflowState === null || typeof workflowState === 'string' ? workflowState : undefined,
      content: content !== undefined ? content : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
      path: path === null || typeof path === 'string' ? path : undefined,
      websiteId: websiteId === null || typeof websiteId === 'string' ? websiteId : undefined,
      themeId: themeId === null || typeof themeId === 'string' ? themeId : undefined,
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
    const { name, rootPath, domains, defaultLocale, supportedLocales, settings, themeId } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const rp = typeof rootPath === 'string' ? rootPath.trim() : `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!/^\/[a-z0-9_-]+$/.test(rp)) {
      res.status(400).json({ error: 'rootPath must start with / and contain only lowercase letters, digits, hyphens, or underscores' });
      return;
    }
    const existingByPath = await getWebsiteByRootPath(rp);
    if (existingByPath) {
      res.status(409).json({ error: `rootPath "${rp}" is already taken` });
      return;
    }
    const website = await createWebsite({
      name,
      rootPath: rp,
      domains: Array.isArray(domains) ? domains : undefined,
      defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : undefined,
      supportedLocales: Array.isArray(supportedLocales) ? supportedLocales : undefined,
      settings: settings !== undefined ? settings : undefined,
      themeId: typeof themeId === 'string' ? themeId : null,
    });
    res.status(201).json({ website });
  } catch (error: any) {
    console.error('Create website error:', error);
    res.status(500).json({ error: error.message || 'Failed to create website' });
  }
});

// Default image placeholder — a pimcorePath pointing to a DAM asset used as
// the default placeholder for newly-created image elements. Stored in the
// first website's settings JSONB for simplicity (no separate table needed).
app.get('/whoobe-one/settings/default-placeholder-image', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const all = await listWebsites();
    const first = all[0];
    const path = first?.settings && typeof first.settings === 'object' && !Array.isArray(first.settings)
      ? (first.settings as Record<string, unknown>).defaultPlaceholderImage
      : null;
    res.json({ pimcorePath: typeof path === 'string' ? path : null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to read default placeholder' });
  }
});

app.put('/whoobe-one/settings/default-placeholder-image', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { pimcorePath } = req.body ?? {};
    const all = await listWebsites();
    if (!all.length) { res.status(404).json({ error: 'No website found' }); return; }
    const first = all[0];
    const settings = { ...(first.settings as Record<string, unknown> ?? {}), defaultPlaceholderImage: typeof pimcorePath === 'string' ? pimcorePath : null };
    await updateWebsite(first.id, { settings });
    res.json({ pimcorePath: typeof pimcorePath === 'string' ? pimcorePath : null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save default placeholder' });
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
    const { name, rootPath, domains, defaultLocale, supportedLocales, settings, themeId } = req.body ?? {};
    if (rootPath !== undefined) {
      if (typeof rootPath !== 'string' || !/^\/[a-z0-9_-]+$/.test(rootPath)) {
        res.status(400).json({ error: 'rootPath must start with / and contain only lowercase letters, digits, hyphens, or underscores' });
        return;
      }
      const existingByPath = await getWebsiteByRootPath(rootPath);
      if (existingByPath && existingByPath.id !== req.params.id) {
        res.status(409).json({ error: `rootPath "${rootPath}" is already taken` });
        return;
      }
    }
    const website = await updateWebsite(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      rootPath: rootPath !== undefined ? rootPath : undefined,
      domains: Array.isArray(domains) ? domains : undefined,
      defaultLocale: typeof defaultLocale === 'string' ? defaultLocale : undefined,
      supportedLocales: Array.isArray(supportedLocales) ? supportedLocales : undefined,
      settings: settings !== undefined ? settings : undefined,
      themeId: themeId !== undefined ? (typeof themeId === 'string' ? themeId : null) : undefined,
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

// --- Website Themes (multiple named themes per website) ---

/**
 * Reads the themes array from settings, falling back to the old singular
 * `settings.theme` format for backward compatibility.
 */
function readThemes(settings: Record<string, unknown> | null): { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[] }[] {
  const s = settings ?? {};
  if (Array.isArray(s.themes)) return s.themes as any;
  const old = s.theme as any;
  if (old) return [{ id: 'default', name: 'Default', colors: old.colors ?? [], fonts: old.fonts ?? [] }];
  return [];
}

function readDefaultThemeId(settings: Record<string, unknown> | null): string {
  const s = settings ?? {};
  if (typeof s.defaultThemeId === 'string') return s.defaultThemeId;
  const themes = readThemes(settings);
  return themes.length > 0 ? themes[0].id : 'default';
}

function themeId(): string {
  return 'theme-' + randomBytes(4).toString('hex');
}

app.get('/whoobe-one/websites/:id/themes', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const defaultThemeId = readDefaultThemeId(website.settings as Record<string, unknown> | null);
    res.json({ themes, defaultThemeId });
  } catch (error: any) {
    console.error('List website themes error:', error);
    res.status(500).json({ error: error.message || 'Failed to list themes' });
  }
});

app.post('/whoobe-one/websites/:id/themes', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts } = req.body ?? {};
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const newTheme = {
      id: themeId(),
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Untitled',
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : [],
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : [],
    };
    themes.push(newTheme);
    const settings = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    await updateWebsite(req.params.id, { settings });
    res.status(201).json({ theme: newTheme });
  } catch (error: any) {
    console.error('Create website theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to create theme' });
  }
});

app.put('/whoobe-one/websites/:id/themes/:themeId', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, isDefault } = req.body ?? {};
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const idx = themes.findIndex((t) => t.id === req.params.themeId);
    if (idx === -1) { res.status(404).json({ error: 'Theme not found' }); return; }
    if (typeof name === 'string' && name.trim()) themes[idx].name = name.trim();
    if (Array.isArray(colors)) themes[idx].colors = colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string');
    if (Array.isArray(fonts)) themes[idx].fonts = fonts.filter((f: any) => typeof f === 'string');
    const settings: Record<string, unknown> = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    if (isDefault === true) settings.defaultThemeId = req.params.themeId;
    await updateWebsite(req.params.id, { settings });
    res.json({ theme: themes[idx] });
  } catch (error: any) {
    console.error('Update website theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to update theme' });
  }
});

app.delete('/whoobe-one/websites/:id/themes/:themeId', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    let themes = readThemes(website.settings as Record<string, unknown> | null);
    const idx = themes.findIndex((t) => t.id === req.params.themeId);
    if (idx === -1) { res.status(404).json({ error: 'Theme not found' }); return; }
    themes = themes.filter((t) => t.id !== req.params.themeId);
    const settings: Record<string, unknown> = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    if (settings.defaultThemeId === req.params.themeId) {
      settings.defaultThemeId = themes.length > 0 ? themes[0].id : 'default';
    }
    await updateWebsite(req.params.id, { settings });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete website theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete theme' });
  }
});

// All themes from all websites — for snippet/standalone editors that don't
// belong to a specific website.
app.get('/whoobe-one/themes/all', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const allWebsites = await listWebsites();
    const allThemes: { websiteId: string; websiteName: string; themes: { id: string; name: string; colors: { name: string; hex: string }[]; fonts: string[] }[] }[] = [];
    for (const site of allWebsites) {
      const themes = readThemes(site.settings as Record<string, unknown> | null);
      if (themes.length > 0) {
        allThemes.push({ websiteId: site.id, websiteName: site.name, themes });
      }
    }
    res.json({ websites: allThemes });
  } catch (error: any) {
    console.error('List all themes error:', error);
    res.status(500).json({ error: error.message || 'Failed to list themes' });
  }
});

// Backward-compatible single-theme endpoints — read/write the default theme.
app.get('/whoobe-one/websites/:id/theme', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const defaultId = readDefaultThemeId(website.settings as Record<string, unknown> | null);
    const theme = themes.find((t) => t.id === defaultId) ?? themes[0] ?? { colors: [], fonts: [] };
    res.json({ theme: { colors: theme.colors, fonts: theme.fonts } });
  } catch (error: any) {
    console.error('Get website theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to get website theme' });
  }
});

app.put('/whoobe-one/websites/:id/theme', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { colors, fonts } = req.body ?? {};
    const parsed = {
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : [],
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : [],
    };
    const website = await getWebsite(req.params.id);
    if (!website) { res.status(404).json({ error: 'Website not found' }); return; }
    const themes = readThemes(website.settings as Record<string, unknown> | null);
    const defaultId = readDefaultThemeId(website.settings as Record<string, unknown> | null);
    const idx = themes.findIndex((t) => t.id === defaultId);
    if (idx >= 0) {
      themes[idx].colors = parsed.colors;
      themes[idx].fonts = parsed.fonts;
    } else {
      themes.unshift({ id: defaultId, name: 'Default', ...parsed });
    }
    const settings = { ...(website.settings as Record<string, unknown> ?? {}), themes };
    await updateWebsite(req.params.id, { settings });
    res.json({ theme: parsed });
  } catch (error: any) {
    console.error('Update website theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to update website theme' });
  }
});

// --- Themes (independent entity, own DB table) ---

app.get('/whoobe-one/themes', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await listThemes();
    res.json({ themes: result });
  } catch (error: any) {
    console.error('List themes error:', error);
    res.status(500).json({ error: error.message || 'Failed to list themes' });
  }
});

app.post('/whoobe-one/themes', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, styles, tailwindClasses } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const theme = await createTheme({
      name,
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : undefined,
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : undefined,
      styles: typeof styles === 'string' ? styles : undefined,
      tailwindClasses: typeof tailwindClasses === 'string' ? tailwindClasses : undefined,
    });
    res.status(201).json({ theme });
  } catch (error: any) {
    console.error('Create theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to create theme' });
  }
});

app.get('/whoobe-one/themes/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const theme = await getTheme(req.params.id);
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    res.json({ theme });
  } catch (error: any) {
    console.error('Get theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to get theme' });
  }
});

app.put('/whoobe-one/themes/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, colors, fonts, styles, tailwindClasses } = req.body ?? {};
    const theme = await updateTheme(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      colors: Array.isArray(colors) ? colors.filter((c: any) => c && typeof c.name === 'string' && typeof c.hex === 'string') : undefined,
      fonts: Array.isArray(fonts) ? fonts.filter((f: any) => typeof f === 'string') : undefined,
      styles: typeof styles === 'string' ? styles : undefined,
      tailwindClasses: typeof tailwindClasses === 'string' ? tailwindClasses : undefined,
    });
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    res.json({ theme });
  } catch (error: any) {
    console.error('Update theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to update theme' });
  }
});

app.delete('/whoobe-one/themes/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteTheme(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete theme error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete theme' });
  }
});

// --- Website Templates (docs/plans/cms/website-templates.md) ---
// A named composition of module pages into header/aside/footer slots around
// the routed page. Gated on SETTINGS_MANAGE (site structure config, same as
// mail settings). The list augments each template with the module page
// titles for its slots, so the UI can render slot pickers without a second
// fetch per template.
app.get('/whoobe-one/websites/:websiteId/templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = await listWebsiteTemplates(req.params.websiteId);
    res.json({ templates });
  } catch (error: any) {
    console.error('List website templates error:', error);
    res.status(500).json({ error: error.message || 'Failed to list website templates' });
  }
});

app.post('/whoobe-one/websites/:websiteId/templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, layout, pathPatterns, isDefault } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const template = await createWebsiteTemplate({
      websiteId: req.params.websiteId,
      name: name.trim(),
      description: typeof description === 'string' ? description : null,
      layout: layout !== undefined ? layout : undefined,
      pathPatterns: Array.isArray(pathPatterns) ? pathPatterns.filter((p): p is string => typeof p === 'string') : undefined,
      isDefault: !!isDefault,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    console.error('Create website template error:', error);
    res.status(500).json({ error: error.message || 'Failed to create website template' });
  }
});

app.get('/whoobe-one/websites/:websiteId/templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getWebsiteTemplate(req.params.id);
    if (!template || template.websiteId !== req.params.websiteId) {
      res.status(404).json({ error: 'Website template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    console.error('Get website template error:', error);
    res.status(500).json({ error: error.message || 'Failed to get website template' });
  }
});

app.patch('/whoobe-one/websites/:websiteId/templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await getWebsiteTemplate(req.params.id);
    if (!existing || existing.websiteId !== req.params.websiteId) {
      res.status(404).json({ error: 'Website template not found' });
      return;
    }
    const { name, description, layout, pathPatterns, isDefault } = req.body ?? {};
    const template = await updateWebsiteTemplate(req.params.id, {
      ...(name !== undefined ? { name: typeof name === 'string' ? name : existing.name } : {}),
      ...(description !== undefined ? { description: typeof description === 'string' ? description : null } : {}),
      ...(layout !== undefined ? { layout: layout ?? {} } : {}),
      ...(pathPatterns !== undefined ? { pathPatterns: Array.isArray(pathPatterns) ? pathPatterns.filter((p): p is string => typeof p === 'string') : [] } : {}),
      ...(isDefault !== undefined ? { isDefault: !!isDefault } : {}),
    });
    res.json({ template });
  } catch (error: any) {
    console.error('Update website template error:', error);
    res.status(500).json({ error: error.message || 'Failed to update website template' });
  }
});

app.delete('/whoobe-one/websites/:websiteId/templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await getWebsiteTemplate(req.params.id);
    if (!existing || existing.websiteId !== req.params.websiteId) {
      res.status(404).json({ error: 'Website template not found' });
      return;
    }
    await deleteWebsiteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Delete website template error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete website template' });
  }
});

// --- Website Paths ---
app.get('/whoobe-one/website-paths', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const result = await listWebsitePaths(websiteId);
    res.json({ paths: result });
  } catch (error: any) {
    console.error('List website paths error:', error);
    res.status(500).json({ error: error.message || 'Failed to list website paths' });
  }
});

app.post('/whoobe-one/website-paths', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
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
    const path = await createWebsitePath({
      websiteId,
      name,
      items: Array.isArray(items) ? items : undefined,
    });
    res.status(201).json({ path });
  } catch (error: any) {
    console.error('Create website path error:', error);
    res.status(500).json({ error: error.message || 'Failed to create website path' });
  }
});

app.get('/whoobe-one/website-paths/:id', requirePermission(PERMISSIONS.OBJECTS_READ), async (req: Request, res: Response): Promise<void> => {
  try {
    const path = await getWebsitePath(req.params.id);
    if (!path) {
      res.status(404).json({ error: 'Website path not found' });
      return;
    }
    res.json({ path });
  } catch (error: any) {
    console.error('Get website path error:', error);
    res.status(500).json({ error: error.message || 'Failed to get website path' });
  }
});

app.patch('/whoobe-one/website-paths/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, items } = req.body ?? {};
    const path = await updateWebsitePath(req.params.id, {
      name: typeof name === 'string' ? name : undefined,
      items: Array.isArray(items) ? items : undefined,
    });
    if (!path) {
      res.status(404).json({ error: 'Website path not found' });
      return;
    }
    res.json({ path });
  } catch (error: any) {
    console.error('Update website path error:', error);
    res.status(500).json({ error: error.message || 'Failed to update website path' });
  }
});

app.delete('/whoobe-one/website-paths/:id', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteWebsitePath(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete website path error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete menu' });
  }
});

// Public page endpoints (no auth required)
// Wildcard (not a single-segment :slug param) - a dynamic page's stored
// slug can be a multi-segment pattern (e.g. '/it/news/{slug}', see
// docs/plans/website/website-paths.md), which a plain Express 4 :param
// can never match (it stops at the first '/'). Static pages resolve
// exactly as before - the literal-match branch below reconstructs the
// same slug string the old single-segment route would have received.
app.get('/public/pages/:locale/*', async (req: Request, res: Response): Promise<void> => {
  try {
    let websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    const rootPath = typeof req.query.rootPath === 'string' ? req.query.rootPath : null;
    let requestPath = '/' + (req.params[0] ?? '');
    const locale = req.params.locale;

    // Strip the rootPath prefix from the request path when present and
    // resolve websiteId from it if not already provided.
    if (rootPath && requestPath.startsWith(rootPath)) {
      requestPath = requestPath.slice(rootPath.length) || '/';
      if (!websiteId) {
        const site = await getWebsiteByRootPath(rootPath);
        if (site) websiteId = site.id;
      }
    }

    // Cheapest, most common case first: exact literal match, identical to
    // the old route's only behavior - zero extra query for any static page.
    let page = await getPublishedWhoobePageBySlug(locale, requestPath, websiteId);
    let params: Record<string, string> = {};

    if (!page) {
      // Only fetch+scan dynamic-slug pages when the literal lookup misses.
      const candidates = await listPublishedWhoobePages(websiteId);
      const dynamicCandidates = candidates.filter((p) => p.locale === locale && isDynamicSlug(p.slug));
      const matched = matchPagePath(dynamicCandidates, requestPath);
      if (matched) {
        page = matched.page;
        params = matched.params;
      }
    }

    if (!page) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    // Website Template composition (docs/plans/cms/website-templates.md):
    // when the website has templates, resolve the one for this path
    // (path-pattern override, else the default) and attach the module pages
    // that fill its header/aside/footer slots. Non-breaking - a website with
    // no templates keeps the plain `{ page, params }` response. The website
    // is taken from the explicit ?websiteId query param, else from the
    // resolved page's own websiteId - so headless consumers that don't know
    // the website up front (e.g. whoobe-one-spike's public renderer) still
    // get the composed layout.
    let layout: Record<string, unknown> | null = null;
    const layoutWebsiteId = websiteId ?? page.websiteId;
    if (layoutWebsiteId) {
      try {
        const template = await getWebsiteTemplateForPath(layoutWebsiteId, requestPath);
        if (template) {
          const website = await getWebsite(layoutWebsiteId);
          const modules = await listPublishedModulePages(layoutWebsiteId, locale, website?.defaultLocale ?? null);
          const byId = new Map(modules.map((m) => [m.id, m]));
          const snippetIds = new Set<string>();
          for (const slot of [template.layout.header, template.layout.aside, template.layout.footer]) {
            for (const sid of slot?.snippetIds ?? []) snippetIds.add(sid);
          }
          const snippets = await Promise.all([...snippetIds].map((id) => getWhoobeOneSnippet(id)));
          const snippetById = new Map(snippets.filter((s): s is NonNullable<typeof s> => !!s).map((s) => [s.id, s]));
          const slot = (s: { pageIds: string[]; snippetIds?: string[] | null; className?: string | null; style?: string | null; content?: unknown } | null | undefined) => {
            if (!s || (s.pageIds.length === 0 && !s.snippetIds?.length && !s.content)) return null;
            const pages = s.pageIds
              .map((id) => byId.get(id))
              .filter((m): m is NonNullable<typeof m> => !!m)
              .map((m) => ({ id: m.id, title: m.title, content: m.content }));
            // Reusable snippets (whoobe_one_snippets) - each as a pseudo-page.
            for (const snippetId of s.snippetIds ?? []) {
              const snippet = snippetById.get(snippetId);
              if (snippet) pages.push({ id: snippet.id, title: snippet.name, content: snippet.node });
            }
            // Directly-authored slot elements (a node or an array of nodes) -
            // included after the module pages, each as a pseudo-page so both
            // the spike renderer and the headless SDK compose them unchanged.
            const custom = Array.isArray(s.content) ? s.content : s.content ? [s.content] : [];
            for (const node of custom) {
              const id = (node as { id?: unknown } | null)?.id;
              pages.push({ id: typeof id === 'string' ? id : 'slot-custom', title: 'Custom', content: node });
            }
            if (pages.length === 0) return null;
            return { className: s.className ?? '', style: s.style ?? '', pages };
          };
          layout = {
            template: { id: template.id, name: template.name },
            header: slot(template.layout.header),
            aside: slot(template.layout.aside),
            footer: slot(template.layout.footer),
          };
        }
      } catch (templateError) {
        // A broken template must never turn a valid page into a 500.
        console.warn('Website template resolution failed:', templateError);
      }
    }

    res.json(layout ? { page, params, layout } : { page, params });
  } catch (error: any) {
    console.error('Public page lookup error:', error);
    res.status(500).json({ error: error.message || 'Failed to look up page' });
  }
});

app.get('/public/sitemap.xml', async (req: Request, res: Response): Promise<void> => {
  try {
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : null;
    const pages = await listPublishedWhoobePages(websiteId);
    const sitemapPages = pages
      .filter((p) => p.sitemap?.included !== false)
      .filter((p) => !isDynamicSlug(p.slug));

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

// ---------------------------------------------------------------------------
// Public search (headless) - see docs/plans/search-engine/search-engine-plan.md
// §7. No auth, published-only, respects per-page search.indexable (enforced
// at index time via indexer.ts). The response contract is the website's
// integration point (whoobe-one-spike's SearchBox) and the future SSR
// renderer's.
const SEARCH_TYPES = ['page', 'object', 'class', 'asset'];

function parseSearchQuery(req: Request): { error?: string; options?: import('@whoobe-cms/core/server').SearchOptions } {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return { error: 'Query parameter "q" must be at least 2 characters' };

  // type accepts one value, several repeated (?type=object&type=asset) or a
  // comma-separated list (?type=object,asset) - the admin search toggles
  // multiple types on/off simultaneously.
  const rawTypes = Array.isArray(req.query.type) ? req.query.type : typeof req.query.type === 'string' ? req.query.type.split(',') : [];
  const types = rawTypes
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const invalid = types.find((t) => !SEARCH_TYPES.includes(t));
  if (invalid) {
    return { error: `Invalid "type": ${invalid} (expected page, object, class or asset)` };
  }
  const page = Number.parseInt(typeof req.query.page === 'string' ? req.query.page : '1', 10);
  const pageSize = Number.parseInt(typeof req.query.pageSize === 'string' ? req.query.pageSize : '20', 10);
  const sort = req.query.sort === 'date' ? 'date' : 'relevance';
  const includeUnpublished = req.query.includeUnpublished === 'true';

  return {
    options: {
      q,
      locale: typeof req.query.locale === 'string' && req.query.locale ? req.query.locale : 'en',
      websiteId: typeof req.query.websiteId === 'string' && req.query.websiteId ? req.query.websiteId : null,
      type: (types.length === 1 ? types[0] : types.length > 1 ? types : null) as
        | import('@whoobe-cms/core/server').SearchDocumentType
        | import('@whoobe-cms/core/server').SearchDocumentType[]
        | null,
      classId: typeof req.query.classId === 'string' && req.query.classId ? req.query.classId : null,
      includeUnpublished,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
      sort,
    },
  };
}

function withSearchUrls<T extends { type: string; path: string }>(results: T[], locale: string): Array<T & { url: string | null }> {
  const baseUrl = process.env.PUBLIC_SITE_URL || '';
  return results.map((row) => {
    const url = row.type === 'page' && baseUrl && row.path ? `${baseUrl}${row.path.startsWith('/') ? '' : '/'}${row.path}` : null;
    return { ...row, url };
  });
}

app.get('/public/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseSearchQuery(req);
    if (parsed.error || !parsed.options) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const results = await searchContent(parsed.options);
    res.json({ ...results, results: withSearchUrls(results.results, parsed.options.locale ?? 'en') });
  } catch (error: any) {
    console.error('Public search error:', error);
    res.status(500).json({ error: error.message || 'Search failed' });
  }
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
      const { className, dryRun, limit, clear } = req.body ?? {};
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
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Import objects error:', error);
      res.status(500).json({ error: error.message || 'Failed to import objects' });
    }
  }
);

// Document import + promote - the Documents → Pages migration
// (docs/plans/cms/documents-migration.md §3 Phase 1). import-documents
// wraps runDocumentMigration; with `staging: true` it lands converted pages
// in whoobe_pages_staging (review first, promote later) instead of touching
// the live pages table, and promote-documents copies those staged rows into
// whoobe_pages via the same upsert primitive the direct path uses.
app.post(
  '/migration-sources/:id/import-documents',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, limit, staging } = req.body ?? {};
      const resolved = await getMigrationSourceConnectionConfig(req.params.id);
      if (!resolved) {
        res.status(404).json({ error: 'Migration source not found' });
        return;
      }
      const result = await runDocumentMigration({
        source: 'mysql',
        sourceConfig: { ...resolved.connection } as Record<string, unknown>,
        dryRun: dryRun === true,
        limit: typeof limit === 'number' ? limit : undefined,
        staging: staging === true,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Import documents error:', error);
      res.status(500).json({ error: error.message || 'Failed to import documents' });
    }
  }
);

app.post(
  '/migration-sources/:id/promote-documents',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, clear } = req.body ?? {};
      const result = await runPromoteDocuments({
        dryRun: dryRun === true,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Promote documents error:', error);
      res.status(500).json({ error: error.message || 'Failed to promote documents' });
    }
  }
);

// Extract embedded collectionTypes from migrated classes into standalone
// data_components records - the CLI's extract-collection-types command,
// exposed through the migration source UI so admins can run it after
// importing classes, no shell access needed. Does not need the Pimcore DB
// (reads data_classes, writes data_components).
app.post(
  '/migration-sources/:id/extract-components',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { dryRun, className, clear } = req.body ?? {};
      const result = await runExtractCollectionTypes({
        dryRun: dryRun === true,
        className: typeof className === 'string' && className ? className : undefined,
        clear: clear === true,
      });
      res.json({ result });
    } catch (error: any) {
      console.error('Extract components error:', error);
      res.status(500).json({ error: error.message || 'Failed to extract components' });
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

// Batch actions: publish/unpublish, delete, resolve-assets. Registered
// before /batch and /:id so the path is not captured as an id.
app.post(
  '/data-objects/batch',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { ids, action } = req.body ?? {};
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids[] is required' });
        return;
      }
      switch (action) {
        case 'publish':
        case 'unpublish': {
          const published = action === 'publish';
          let succeeded = 0;
          const errors: { id: string; message: string }[] = [];
          for (const id of ids) {
            try {
              await updateDataObject(id, { published });
              succeeded++;
            } catch (e: any) {
              errors.push({ id, message: e.message });
            }
          }
          res.json({ succeeded, failed: errors.length, errors });
          return;
        }
        case 'delete': {
          let succeeded = 0;
          const errors: { id: string; message: string }[] = [];
          for (const id of ids) {
            try {
              await deleteDataObject(id);
              succeeded++;
            } catch (e: any) {
              errors.push({ id, message: e.message });
            }
          }
          res.json({ succeeded, failed: errors.length, errors });
          return;
        }
        case 'resolve-assets': {
          const objects = await getDataObjectsByIds(ids);
          const results: Record<string, Record<string, unknown>> = {};
          for (const obj of objects) {
            const resolved: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj.attributes)) {
              if (value && typeof value === 'object' && 'assetId' in (value as any)) {
                resolved[key] = value;
              }
            }
            results[obj.id] = resolved;
          }
          res.json({ results });
          return;
        }
        default:
          res.status(400).json({ error: `Unknown action "${action}". Use publish, unpublish, or delete.` });
      }
    } catch (error: any) {
      console.error('Batch action error:', error);
      res.status(500).json({ error: error.message || 'Failed to process batch action' });
    }
  }
);

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

// --- Admin query endpoint (no published filter) ---

app.post(
  '/data-objects/query',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { class: className, filters, orderBy, offset, limit, locale } = req.body ?? {};
      if (!className) {
        res.status(400).json({ error: 'class (name) is required' });
        return;
      }
      const dataClass = await getDataClassByName(className);
      if (!dataClass) {
        res.json({ objects: [] });
        return;
      }
      const validOrderBy =
        orderBy && typeof orderBy === 'object' &&
        typeof orderBy.field === 'string' &&
        (orderBy.direction === 'asc' || orderBy.direction === 'desc')
          ? { field: orderBy.field, direction: orderBy.direction }
          : undefined;
      const objects = await queryDataObjects(dataClass.id, {
        filters: Array.isArray(filters) ? filters : undefined,
        orderBy: validOrderBy,
        offset: typeof offset === 'number' && offset > 0 ? offset : undefined,
        limit: typeof limit === 'number' ? limit : undefined,
        locale: typeof locale === 'string' ? locale : undefined,
      });
      res.json({ objects });
    } catch (error: any) {
      console.error('Query data objects error:', error);
      res.status(500).json({ error: error.message || 'Failed to query objects' });
    }
  }
);

// --- Public query endpoint (published only) ---

app.post('/public/data-objects/query', async (req: Request, res: Response): Promise<void> => {
  try {
    const { class: className, filters, orderBy, offset, limit, locale } = req.body ?? {};
    if (!className) {
      res.status(400).json({ error: 'class (name) is required' });
      return;
    }
    const dataClass = await getDataClassByName(className);
    if (!dataClass) {
      res.json({ objects: [] });
      return;
    }
    const validOrderBy =
      orderBy && typeof orderBy === 'object' &&
      typeof orderBy.field === 'string' &&
      (orderBy.direction === 'asc' || orderBy.direction === 'desc')
        ? { field: orderBy.field, direction: orderBy.direction }
        : undefined;
    const objects = await queryPublishedDataObjects(dataClass.id, {
      filters: Array.isArray(filters) ? filters : undefined,
      orderBy: validOrderBy,
      offset: typeof offset === 'number' && offset > 0 ? offset : undefined,
      limit: typeof limit === 'number' ? limit : undefined,
      locale: typeof locale === 'string' ? locale : undefined,
    });
    res.json({ objects });
  } catch (error: any) {
    console.error('Query public data objects error:', error);
    res.status(500).json({ error: error.message || 'Failed to query objects' });
  }
});

// --- Public form submission endpoint (docs/plans/forms/cms-forms.md) ---
// No requireAuth/requirePermission, same as the query endpoint above - a
// site visitor submitting a page's contact/registration/etc. form has no
// admin session. classId (not class name) since the editor's Form element
// config picks a class by id (FormConfigControl.vue), same as
// createDataObject's own classId param below.
app.post('/public/forms/:classId/submit', async (req: Request, res: Response): Promise<void> => {
  try {
    const rateLimitKey = req.ip ?? 'unknown';
    if (isFormSubmitRateLimited(rateLimitKey)) {
      res.status(429).json({ error: 'Too many submissions, please try again later' });
      return;
    }
    recordFormSubmit(rateLimitKey);

    const { attributes, formConfig } = req.body ?? {};
    if (attributes == null || typeof attributes !== 'object') {
      res.status(400).json({ error: 'attributes is required' });
      return;
    }
    // Hidden decoy field a real visitor never fills in - looks like success
    // to whatever submitted it, without revealing it was a trap or that
    // any validation even ran.
    if ((attributes as Record<string, unknown>)._hp) {
      res.status(204).end();
      return;
    }

    const dataClass = await getDataClass(req.params.classId);
    if (!dataClass) {
      res.status(404).json({ error: 'Form target not found' });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = compileDynamicSchema({ id: dataClass.id, name: dataClass.name, fields: dataClass.fields as any }).parse(
        attributes
      ) as Record<string, unknown>;
    } catch (validationError: any) {
      res.status(400).json({ error: validationError?.message || 'Invalid submission' });
      return;
    }

    // Lands unpublished by default (createDataObject doesn't set
    // `published`) - a deliberate side effect, not an oversight: every
    // submission is a draft an admin has to actively review/publish in
    // Object View before it's visible anywhere, not auto-live.
    await createDataObject({
      classId: dataClass.id,
      key: `sub-${randomUUID()}`,
      attributes: parsed,
    });

    // Own try/catch, separate from the main handler's - a misconfigured or
    // failing mailer must never turn a successful Data Object write into a
    // 500 for the visitor. The client includes the Form's own `notify`
    // config in the submit payload (it already has it in hand at submit
    // time), so no separate server-side lookup is needed.
    //
    // Notification emails personalize against what the visitor actually
    // submitted, not the class-validated `parsed` subset - `parsed` drops
    // unknown fields (Zod's z.object() strips by default), so a template
    // referencing {form.message} would render empty for any input that
    // isn't a declared field on the target Data Class. The renderer
    // HTML-escapes every bound/token value, so the raw attributes are safe.
    const submitted = { ...(attributes as Record<string, unknown>) };
    delete submitted._hp;

    const notify = formConfig?.notify;
    if (notify?.enabled) {
      try {
        // A mail template id is the primary reference (docs/plans/forms/
        // mail-templates.md); the legacy templatePageId (a whoobe_pages
        // row) stays supported so already-saved Forms keep working. The
        // recipient comes from notify.recipientEmail when set, otherwise
        // from the template's own (possibly dynamic) `to` field.
        if (notify.mailTemplateId) {
          const template = await getMailTemplate(notify.mailTemplateId);
          if (template) {
            await sendMailFromTemplate({
              template,
              context: { form: submitted },
              to: notify.recipientEmail || undefined,
              subject: notify.subject || undefined,
            });
          } else {
            console.warn(`Form notify: mail template ${notify.mailTemplateId} not found`);
          }
        } else if (notify.templatePageId && notify.recipientEmail) {
          const page = await getWhoobePage(notify.templatePageId);
          if (page) {
            const imageUrls = await resolveMailImageUrls(page.content);
            const html = buildMailDocument({
              bodyHtml: renderMailTemplate(page.content, submitted, imageUrls),
              fonts: collectMailFonts(page.content),
            });
            await sendMail({
              to: notify.recipientEmail,
              subject: notify.subject || 'New form submission',
              html,
            });
          } else {
            console.warn(`Form notify: template page ${notify.templatePageId} not found`);
          }
        }
      } catch (notifyError) {
        console.warn('Form notify email failed:', notifyError);
      }
    }

    res.status(201).json({ success: true });
  } catch (error: any) {
    console.error('Form submit error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Global outgoing-mail config (docs/plans/forms/cms-forms.md's Phase 2) -
// GET never returns the stored password, only whether one is set, so the
// admin-dashboard settings form can't leak it back out over the wire.
app.get('/mail-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getMailSettings();
    if (!settings) {
      res.json(null);
      return;
    }
    const { password, ...rest } = settings;
    res.json({ ...rest, hasPassword: !!password });
  } catch (error) {
    console.error('Mail settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch mail settings' });
  }
});

app.put('/mail-settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { host, port, secure, user, password, fromAddress, fromName, bccFromAddress } = req.body ?? {};
    if (!host || !port || !fromAddress) {
      res.status(400).json({ error: 'host, port, and fromAddress are required' });
      return;
    }
    // An empty/omitted password in the request means "leave it as-is" (the
    // GET response never sends the real one back for the form to resubmit)
    // rather than clearing a previously configured one.
    const existing = await getMailSettings();
    const updated = await upsertMailSettings({
      host,
      port: Number(port),
      secure: !!secure,
      user: user || null,
      password: password ? password : existing?.password ?? null,
      fromAddress,
      fromName: fromName || null,
      bccFromAddress: !!bccFromAddress,
    });
    const { password: _pw, ...rest } = updated;
    res.json({ ...rest, hasPassword: !!updated.password });
  } catch (error) {
    console.error('Mail settings update error:', error);
    res.status(500).json({ error: 'Failed to update mail settings' });
  }
});

// Sends a test email through the configured SMTP - the "Email Test" card
// in the mail settings UI. Unlike the form-notification path it lets the
// admin override the from address and pass a cc, so delivery can be
// verified end to end.
app.post('/mail-settings/test', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, cc, subject, html, text } = req.body ?? {};
    if (!to || !subject) {
      res.status(400).json({ error: 'to and subject are required' });
      return;
    }
    await sendMail({
      to,
      subject,
      from: typeof from === 'string' && from.trim() ? from.trim() : undefined,
      cc: typeof cc === 'string' && cc.trim() ? cc.trim() : undefined,
      html: typeof html === 'string' ? html : '',
      text: typeof text === 'string' && text.trim() ? text : undefined,
    });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Mail test error:', error);
    res.status(500).json({ error: error?.message || 'Failed to send test email' });
  }
});

// Outgoing mail log (Settings → Mail → Log) - every sendMail() attempt,
// newest first by default. Read-only listing: rows are only ever deleted
// via POST /mail-log/delete. `status` (sent|failed), `search` (matches to,
// subject, and status), `order` (newest|oldest), `limit` (default 100,
// cap 500) and `offset` narrow the result. Returns `total` (matching count)
// alongside the page so the UI can paginate. The list strips the message
// body - fetch a single entry (GET /mail-log/:id) for the preview modal.
app.get('/mail-log', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search, order, limit, offset } = req.query;
    const result = await listMailLog({
      status: status === 'sent' || status === 'failed' ? status : undefined,
      search: typeof search === 'string' ? search : undefined,
      order: order === 'oldest' ? 'oldest' : 'newest',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    const records = result.records.map(({ html: _h, text: _t, ...rest }) => rest);
    res.json({ records, total: result.total });
  } catch (error: any) {
    console.error('Mail log fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch mail log' });
  }
});

// Bulk-delete selected log entries from the admin Log view. Read-only
// guards already prevent editing other data; this is the one write the log
// allows, so admins can prune noise without touching the rest of the table.
app.post('/mail-log/delete', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }
    const validIds = ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
    const deleted = await deleteMailLogEntries(validIds);
    res.json({ deleted });
  } catch (error: any) {
    console.error('Mail log delete error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete mail log entries' });
  }
});

// Mail templates (docs/plans/forms/mail-templates.md) - reusable email
// bodies referenced by Form notify configs (and future triggers). The list
// returns metadata only; the full Element tree / text body is fetched per
// template (GET /mail-templates/:id) for editing and rendering.
app.get('/mail-templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = await listMailTemplates();
    res.json({ templates });
  } catch (error: any) {
    console.error('Mail templates fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch mail templates' });
  }
});

app.post('/mail-templates', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, kind, description, subject, to, bcc, content, body } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (kind !== 'html' && kind !== 'text') {
      res.status(400).json({ error: 'kind must be "html" or "text"' });
      return;
    }
    const template = await createMailTemplate({
      name: name.trim(),
      kind,
      description: typeof description === 'string' ? description : null,
      subject: typeof subject === 'string' ? subject : null,
      to: typeof to === 'string' ? to : null,
      bcc: typeof bcc === 'string' ? bcc : null,
      content: kind === 'html' ? (content ?? null) : null,
      body: kind === 'text' ? (typeof body === 'string' ? body : '') : null,
    });
    res.status(201).json({ template });
  } catch (error: any) {
    console.error('Mail template create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create mail template' });
  }
});

app.get('/mail-templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await getMailTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Mail template not found' });
      return;
    }
    res.json({ template });
  } catch (error: any) {
    console.error('Mail template fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch mail template' });
  }
});

app.patch('/mail-templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, kind, description, subject, to, bcc, content, body } = req.body ?? {};
    if (kind !== undefined && kind !== 'html' && kind !== 'text') {
      res.status(400).json({ error: 'kind must be "html" or "text"' });
      return;
    }
    const existing = await getMailTemplate(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Mail template not found' });
      return;
    }
    const template = await updateMailTemplate(req.params.id, {
      ...(name !== undefined ? { name: typeof name === 'string' ? name : existing.name } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(description !== undefined ? { description: typeof description === 'string' ? description : null } : {}),
      ...(subject !== undefined ? { subject: typeof subject === 'string' ? subject : null } : {}),
      ...(to !== undefined ? { to: typeof to === 'string' ? to : null } : {}),
      ...(bcc !== undefined ? { bcc: typeof bcc === 'string' ? bcc : null } : {}),
      ...(content !== undefined ? { content: content ?? null } : {}),
      ...(body !== undefined ? { body: typeof body === 'string' ? body : null } : {}),
    });
    res.json({ template });
  } catch (error: any) {
    console.error('Mail template update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update mail template' });
  }
});

app.delete('/mail-templates/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteMailTemplate(req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Mail template delete error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete mail template' });
  }
});

// Full log entry including the stored body, for the admin preview modal.
app.get('/mail-log/:id', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = await getMailLogEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Mail log entry not found' });
      return;
    }
    res.json(entry);
  } catch (error: any) {
    console.error('Mail log entry fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch mail log entry' });
  }
});

// Resends a logged email verbatim (stored to/from/cc/subject/body).
// sendMail() records the resend as a fresh log row, so the resend itself
// shows up in the log with its own status.
app.post('/mail-log/:id/resend', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const entry = await getMailLogEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'Mail log entry not found' });
      return;
    }
    await sendMail({
      to: entry.to,
      from: entry.from ?? undefined,
      cc: entry.cc ?? undefined,
      subject: entry.subject,
      html: entry.html ?? '',
      text: entry.text ?? undefined,
    });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Mail resend error:', error);
    res.status(500).json({ error: error.message || 'Failed to resend email' });
  }
});

// AI generation config (docs/plans/ai/ai-pages-snippets-generator.md) -
// same shape as mail-settings: single global row, GET never returns the
// stored API key (only `hasApiKey`), PUT treats a blank key as
// "keep the existing one".
app.get('/ai/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getAiSettings();
    if (!settings) {
      res.json(null);
      return;
    }
    const { apiKey, ...rest } = settings;
    res.json({ ...rest, hasApiKey: !!apiKey });
  } catch (error) {
    console.error('AI settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

app.put('/ai/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, model, endpoint, apiKey } = req.body ?? {};
    if (!provider || !model) {
      res.status(400).json({ error: 'provider and model are required' });
      return;
    }
    const existing = await getAiSettings();
    const updated = await upsertAiSettings({
      provider,
      model,
      endpoint: endpoint || null,
      apiKey: apiKey ? apiKey : existing?.apiKey ?? null,
    });
    const { apiKey: _ak, ...rest } = updated;
    res.json({ ...rest, hasApiKey: !!updated.apiKey });
  } catch (error) {
    console.error('AI settings update error:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

// AI generation - POST /ai/generate (gated on OBJECTS_WRITE, same as the
// whoobe-one page routes it feeds): builds the prompt from the stored
// settings, calls the configured provider, structurally validates the
// returned Element tree, and logs the whole exchange into
// whoobe_ai_generated (successes and failures alike).
app.post('/ai/generate', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { kind, prompt, context } = req.body ?? {};
  if (kind !== 'snippet' && kind !== 'page') {
    res.status(400).json({ error: 'kind must be "snippet" or "page"' });
    return;
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  const settings = await getAiSettings();
  if (!settings || !settings.apiKey) {
    res.status(400).json({ error: 'AI is not configured. Save the provider, model, and API key in Settings → AI first.' });
    return;
  }
  const ctx = {
    kind,
    prompt: prompt.trim(),
    selectedTag: typeof context?.selectedTag === 'string' ? context.selectedTag : null,
    pageTitle: typeof context?.pageTitle === 'string' ? context.pageTitle : null,
    pageCategory: typeof context?.pageCategory === 'string' ? context.pageCategory : null,
  };
  try {
    const result = await generateAiJson({
      settings: { provider: settings.provider, model: settings.model, endpoint: settings.endpoint, apiKey: settings.apiKey },
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(ctx),
      maxTokens: 8192,
    });
    const validationError = validateElementTree(result.json);
    if (validationError) {
      await createAiGenerated({
        kind, prompt: ctx.prompt, provider: settings.provider, model: settings.model,
        rawResponse: result.rawText, status: 'error', error: validationError, createdBy: req.user?.id ?? null,
      });
      res.status(422).json({ error: `Generated content rejected: ${validationError}` });
      return;
    }
    // The model can't know which photo IDs really exist - replace every
    // image URL with a guaranteed-valid placeholder (see prompts.ts's
    // sanitizeGeneratedImages comment) so stored and rendered pages never
    // show broken images.
    sanitizeGeneratedImages(result.json as Record<string, any>);
    await createAiGenerated({
      kind, prompt: ctx.prompt, provider: settings.provider, model: settings.model,
      payload: result.json, rawResponse: result.rawText, status: 'success', createdBy: req.user?.id ?? null,
    });
    res.json({ payload: result.json });
  } catch (error: any) {
    const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
    try {
      await createAiGenerated({
        kind, prompt: ctx.prompt, provider: settings.provider, model: settings.model,
        status: 'error', error: message, createdBy: req.user?.id ?? null,
      });
    } catch (logError) {
      console.error('AI generation audit log write error:', logError);
    }
    const status = error instanceof AiGenerationError && error.status ? error.status : 500;
    res.status(status).json({ error: message });
  }
});

// Recent generation history for admin review.
app.get('/ai/generated', requirePermission(PERMISSIONS.OBJECTS_READ), async (_req: Request, res: Response): Promise<void> => {
  try {
    const records = await listAiGenerated();
    res.json({ records });
  } catch (error: any) {
    console.error('List AI generated error:', error);
    res.status(500).json({ error: error.message || 'Failed to list AI generations' });
  }
});

// AI website structure generation — generates a complete website with pages
// and snippets from a natural language prompt.
app.post('/ai/generate-website-structure', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { prompt } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  const settings = await getAiSettings();
  if (!settings || !settings.apiKey) {
    res.status(400).json({ error: 'AI is not configured. Save the provider, model, and API key in Settings → AI first.' });
    return;
  }
  try {
    // Retry-with-feedback loop: sample-free models (and even paid ones) often
    // truncate a large nested JSON or wrap it in stray markdown. Each retry
    // feeds the model its own previous output + the exact parse/rejection
    // error and asks for a corrected, complete JSON object.
    let lastError = '';
    let lastRaw = '';
    let structure: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let result;
      try {
        result = await generateAiJson({
          settings: { provider: settings.provider, model: settings.model, endpoint: settings.endpoint, apiKey: settings.apiKey },
          systemPrompt: 'You are an expert front-end developer and website architect. You output ONLY valid JSON, no markdown, no commentary.',
          userPrompt: (attempt === 1
            ? buildWebsiteStructurePrompt({ prompt: prompt.trim() })
            : `Your previous answer was rejected for this reason:\n${lastError}\n\nYour previous starting text was:\n${lastRaw.substring(0, 2000)}\n\nOutput ONLY the corrected, complete, valid JSON object matching the original request, no markdown fences, no commentary:\n${prompt.trim()}`),
          maxTokens: 8192,
        });
      } catch (error: any) {
        // generateAiJson throws on invalid JSON (AiGenerationError from
        // parseJsonText). Capture enough of the raw output to feed back.
        const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
        lastError = message;
        lastRaw = message.includes('\nRaw output:\n') ? message.split('\nRaw output:\n')[1] ?? '' : '';
        if (attempt === 3) {
          throw error;
        }
        continue;
      }
      lastRaw = result.rawText;
      const validationError = validateWebsiteStructure(result.json);
      if (!validationError) {
        structure = result.json;
        break;
      }
      lastError = validationError;
      if (attempt === 3) {
        await createAiGenerated({
          kind: 'website-structure', prompt: prompt.trim(), provider: settings.provider, model: settings.model,
          rawResponse: result.rawText, status: 'error', error: validationError, createdBy: req.user?.id ?? null,
        });
        res.status(422).json({ error: `Generated structure rejected: ${validationError}` });
        return;
      }
    }

    if (structure === null) {
      throw new AiGenerationError(lastError || 'AI generation failed');
    }

    const parsed = structure as Record<string, any>;
    for (const page of (parsed.pages as any[]) ?? []) {
      sanitizeGeneratedImages(page.content as Record<string, any>);
    }
    for (const snippet of (parsed.snippets as any[]) ?? []) {
      sanitizeGeneratedImages(snippet.node as Record<string, any>);
    }
    await createAiGenerated({
      kind: 'website-structure', prompt: prompt.trim(), provider: settings.provider, model: settings.model,
      payload: structure, rawResponse: lastRaw, status: 'success', createdBy: req.user?.id ?? null,
    });
    res.json({ structure });
  } catch (error: any) {
    const message = error instanceof AiGenerationError ? error.message : (error?.message || 'AI generation failed');
    try {
      await createAiGenerated({
        kind: 'website-structure', prompt: prompt.trim(), status: 'error', error: message, createdBy: req.user?.id ?? null,
      });
    } catch (logError) {
      console.error('AI website-structure audit log write error:', logError);
    }
    const status = error instanceof AiGenerationError && error.status ? error.status : 500;
    res.status(status).json({ error: message });
  }
});

// Creates a website from the AI-generated structure — creates the website,
// all its pages, and all its snippets in one orchestrated call.
app.post('/whoobe-one/websites/from-ai', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { structure } = req.body ?? {};
  if (!structure || typeof structure.website !== 'object' || !Array.isArray(structure.pages) || !Array.isArray(structure.snippets)) {
    res.status(400).json({ error: 'structure with website, pages, and snippets is required' });
    return;
  }
  try {
    const website = await createWebsite({
      name: structure.website.name,
      defaultLocale: structure.website.defaultLocale ?? 'en',
      supportedLocales: structure.website.supportedLocales ?? ['en'],
      settings: structure.website.settings ?? {},
    });
    const pages = [];
    for (const p of structure.pages) {
      const page = await createWhoobePage({
        slug: p.slug,
        title: p.title,
        category: p.category ?? '',
        content: p.content,
        websiteId: website.id,
      });
      pages.push(page);
    }
    const snippets = [];
    for (const s of structure.snippets) {
      const snippet = await createWhoobeOneSnippet({
        name: s.name,
        category: s.category,
        node: s.node,
      });
      snippets.push(snippet);
    }
    res.status(201).json({ website, pages, snippets });
  } catch (error: any) {
    console.error('Create website from AI error:', error);
    res.status(500).json({ error: error.message || 'Failed to create website from AI structure' });
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

// ---------------------------------------------------------------------------
// Admin search - same engine as /public/search, but session-gated and with
// draft visibility (index rows carry published=false for unpublished content
// and for pages whose search.indexable is false).
app.get(
  '/whoobe-one/search',
  requirePermission(PERMISSIONS.OBJECTS_READ),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = parseSearchQuery(req);
      if (parsed.error || !parsed.options) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const results = await searchContent(parsed.options);
      res.json({ ...results, results: withSearchUrls(results.results, parsed.options.locale ?? 'en') });
    } catch (error: any) {
      console.error('Admin search error:', error);
      res.status(500).json({ error: error.message || 'Search failed' });
    }
  }
);

// Full rebuild of the search index from source tables - heals any drift
// (indexing hooks are best-effort by design; see indexer.ts).
app.post(
  '/whoobe-one/search/reindex',
  requirePermission(PERMISSIONS.OBJECTS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const counts = await reindexAll();
      res.json({ ok: true, ...counts });
    } catch (error: any) {
      console.error('Search reindex error:', error);
      res.status(500).json({ error: error.message || 'Reindex failed' });
    }
  }
);

// Figma settings (single global row, same pattern as ai_settings / mail_settings).
// GET never returns the stored access token (only `hasToken`), PUT treats a
// blank token as "keep the existing one".
app.get('/figma/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getFigmaSettings();
    if (!settings) { res.json(null); return; }
    const { accessToken, ...rest } = settings;
    res.json({ ...rest, hasToken: !!accessToken });
  } catch (error) {
    console.error('Figma settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch Figma settings' });
  }
});

app.put('/figma/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken, teamId } = req.body ?? {};
    const existing = await getFigmaSettings();
    const updated = await upsertFigmaSettings({
      accessToken: accessToken ? accessToken : existing?.accessToken ?? null,
      teamId: teamId || null,
    });
    const { accessToken: _at, ...rest } = updated;
    res.json({ ...rest, hasToken: !!updated.accessToken });
  } catch (error) {
    console.error('Figma settings update error:', error);
    res.status(500).json({ error: 'Failed to update Figma settings' });
  }
});

// Figma import: proxies the Figma API, converts the tree, returns the
// Whoobe Element tree ready for insertion. Requires OBJECTS_WRITE
// permission (same as page/snippet creation).
app.post('/figma/import', requirePermission(PERMISSIONS.OBJECTS_WRITE), async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileKey, nodeId, mode = 'snippet' } = req.body ?? {};
    if (!fileKey) { res.status(400).json({ error: 'fileKey is required' }); return; }
    if (mode !== 'page' && mode !== 'snippet') { res.status(400).json({ error: 'mode must be "page" or "snippet"' }); return; }

    const settings = await getFigmaSettings();
    if (!settings || !settings.accessToken) {
      res.status(400).json({ error: 'Figma is not configured. Save the access token in Settings → Figma first.' });
      return;
    }

    const nodeIds = nodeId ? [nodeId] : undefined;
    const result = await fetchAndConvert({
      accessToken: settings.accessToken,
      fileKey,
      nodeIds,
      mode,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Figma import error:', error);
    res.status(500).json({ error: error?.message || 'Failed to import from Figma' });
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
