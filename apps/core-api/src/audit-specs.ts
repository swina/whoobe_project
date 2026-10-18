import { createHash } from 'node:crypto';
import {
  getFigmaSettings, getMailSettingsFor, getMigrationSource, getObjectEventSubscription, getRole, getUserWithRoles, getWebsite, getWebsitePath,
  listWebsites, pickAllowed, publicMailSettings,
  type RoleWithPermissions, type UserWithRoles, type WebsiteRecord,
} from '@whoobe-cms/core/server';
import type { AuditSpec } from './audit.js';

// What is audited, route by route, and exactly which fields (docs/plans/system/audit-log-plan.md, section 4). Add a route here AND put
// `audited(AUDIT.<name>)` in its middleware list; the route-drift test fails for a changing route that has neither this nor a written reason
// in scripts/security/routes.expected.json. A snapshot lists the fields it records: anything not listed is not written. A credential is never
// listed; when one can change, the spec names it in `secrets` and the row says "changed".

type P = { params: Record<string, string>; body?: any; query?: any };
const fp = (v: unknown): string => `sha:${createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 12)}`;

// ── users and roles ────────────────────────────────────────────────────────
const userFields = ['email', 'displayName', 'isActive', 'roleNames'] as const;
const roleFields = ['name', 'description', 'permissionKeys'] as const;
const userSnapshot = (u: UserWithRoles) => pickAllowed(u as unknown as Record<string, unknown>, userFields);
const roleSnapshot = (r: RoleWithPermissions) => pickAllowed(r as unknown as Record<string, unknown>, roleFields);
const userLabel = (u?: UserWithRoles | null) => u?.email;
const roleLabel = (r?: RoleWithPermissions | null) => r?.name;
const loadUser = (req: P) => getUserWithRoles(req.params.id);
const loadRole = (req: P) => getRole(req.params.id);

// ── websites ───────────────────────────────────────────────────────────────
// Settings the dashboard writes as plain values. Every other key of a website's `settings` is recorded only as a fingerprint (so a change
// is visible, a value that might be a credential is not): themes and presets carry large CSS and code, `uploads` rules are listed in full.
const PLAIN_SETTINGS = ['defaultPlaceholderImage', 'stripHtmlComments', 'logging', 'autosave', 'cdnMirror', 'uploads', 'defaultThemeId'] as const;
const websiteFields = ['name', 'rootPath', 'domains', 'defaultLocale', 'supportedLocales', 'themeId', 'pwaEnabled'] as const;
export function websiteSnapshot(w: WebsiteRecord): Record<string, unknown> {
  const out: Record<string, unknown> = pickAllowed(w as unknown as Record<string, unknown>, websiteFields);
  out.hasGatewayApiKey = !!w.gatewayApiKeyPrefix;
  if (w.pwaConfig) out.pwaConfig = fp(w.pwaConfig);
  for (const [k, v] of Object.entries(w.settings ?? {})) out[`settings.${k}`] = (PLAIN_SETTINGS as readonly string[]).includes(k) ? v : fp(v);
  return out;
}
const websiteLabel = (w?: WebsiteRecord | null) => w?.name;
const loadWebsite = (req: P) => getWebsite(req.params.id);
const websiteChange = (action: string): AuditSpec<WebsiteRecord> => ({
  action, kind: 'update', targetType: 'website', snapshot: websiteSnapshot, loadBefore: loadWebsite, loadAfter: loadWebsite, targetLabel: websiteLabel,
});

// ── settings kept in the first website's `settings` ───────────────────────
type SettingEntity = { key: string; value: unknown };
const settingEntity = (key: string) => async (): Promise<SettingEntity | null> => {
  const first = (await listWebsites())[0];
  return first ? { key, value: (first.settings ?? {})[key] ?? null } : null;
};
const settingChange = (action: string, key: string, show: (v: unknown) => unknown = (v) => v): AuditSpec<SettingEntity> => ({
  action, kind: 'update', targetType: 'setting', snapshot: (e) => ({ [e.key]: show(e.value) }),
  loadBefore: settingEntity(key), loadAfter: settingEntity(key), targetId: () => key, targetLabel: () => key,
});

// ── mail, figma, migration sources, object event subscriptions ────────────
type MailEntity = Record<string, unknown>;
const mailScopeId = (req: P): string | null => {
  const v = req.body?.websiteId ?? req.query?.websiteId;
  return typeof v === 'string' && v && v !== 'default' ? v : null;
};
const loadMail = async (req: P): Promise<MailEntity | null> => {
  const rec = await getMailSettingsFor(mailScopeId(req));
  // publicMailSettings already leaves the secrets out and says only whether one is set
  return rec ? (publicMailSettings(rec, mailScopeId(req) ? 'website' : 'default') as unknown as MailEntity) : null;
};
const mailSnapshot = (m: MailEntity) => pickAllowed(m, ['provider', 'smtp', 'providerConfig', 'secretsSet', 'fromAddress', 'fromName', 'bccFromAddress']);

type FigmaEntity = { teamId: string | null; hasToken: boolean };
const loadFigma = async (): Promise<FigmaEntity> => {
  const f = await getFigmaSettings();
  return { teamId: f?.teamId ?? null, hasToken: !!f?.accessToken };
};

const subFields = ['name', 'enabled', 'classId', 'events', 'endpointId', 'routeId', 'payloadMode', 'fields', 'ignoreActors'] as const;
const subSnapshot = (s: any) => ({ ...pickAllowed(s, subFields), signed: !!s?.signingSecretRef });
const loadSub = (req: P) => getObjectEventSubscription(req.params.id);

const migrationFields = ['label', 'dbHost', 'dbPort', 'dbUser', 'dbName', 'classesPath'] as const;
const loadSource = (req: P) => getMigrationSource(req.params.id);
// a dry run changes nothing; a background import is audited when it is started
const sourceEvent = (action: string): AuditSpec<any> => ({ action, kind: 'event', targetType: 'migration_source', loadBefore: loadSource, targetLabel: (s) => s?.label, skip: (req) => !!req.body?.dryRun });

// annotated on purpose: the inferred type would name express's internals (TS2742)
export const AUDIT: Readonly<Record<string, AuditSpec<any>>> = {
  userCreate: { action: 'user.create', kind: 'create', targetType: 'user', snapshot: userSnapshot, fromResponse: (b) => b?.user, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  userUpdate: { action: 'user.update', kind: 'update', targetType: 'user', snapshot: userSnapshot, loadBefore: loadUser, fromResponse: (b) => b?.user, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  userDelete: { action: 'user.delete', kind: 'delete', targetType: 'user', snapshot: userSnapshot, loadBefore: loadUser, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  // the reset token and URL are in the answer: they are never read here, only the fact and the user
  userResetPassword: { action: 'user.reset_password', kind: 'event', targetType: 'user', loadBefore: loadUser, targetLabel: userLabel } satisfies AuditSpec<UserWithRoles>,
  roleCreate: { action: 'role.create', kind: 'create', targetType: 'role', snapshot: roleSnapshot, fromResponse: (b) => b?.role, targetLabel: roleLabel } satisfies AuditSpec<RoleWithPermissions>,
  roleUpdate: { action: 'role.update', kind: 'update', targetType: 'role', snapshot: roleSnapshot, loadBefore: loadRole, fromResponse: (b) => b?.role, targetLabel: roleLabel } satisfies AuditSpec<RoleWithPermissions>,
  roleDelete: { action: 'role.delete', kind: 'delete', targetType: 'role', snapshot: roleSnapshot, loadBefore: loadRole, targetLabel: roleLabel } satisfies AuditSpec<RoleWithPermissions>,

  websiteCreate: { action: 'website.create', kind: 'create', targetType: 'website', snapshot: websiteSnapshot, fromResponse: (b) => b?.website, targetLabel: websiteLabel } satisfies AuditSpec<WebsiteRecord>,
  websiteUpdate: { ...websiteChange('website.update'), fromResponse: (b: any) => b?.website } satisfies AuditSpec<WebsiteRecord>,
  websiteDelete: { action: 'website.delete', kind: 'delete', targetType: 'website', snapshot: websiteSnapshot, loadBefore: loadWebsite, targetLabel: websiteLabel } satisfies AuditSpec<WebsiteRecord>,
  // a dry run writes nothing; a real import answers with the report of what was created
  websiteImport: { action: 'website.import', kind: 'event', targetType: 'website', skip: (_r, b) => !!b?.dryRun, targetId: (_r, _e) => undefined } satisfies AuditSpec<Record<string, unknown>>,
  websiteFromAi: { action: 'website.create_from_ai', kind: 'create', targetType: 'website', snapshot: websiteSnapshot, fromResponse: (b) => b?.website, targetLabel: websiteLabel } satisfies AuditSpec<WebsiteRecord>,
  websiteThemeCreate: websiteChange('website.theme_create'),
  websiteThemeUpdate: websiteChange('website.theme_update'),
  websiteThemeDelete: websiteChange('website.theme_delete'),
  websiteTheme: websiteChange('website.theme_set'),
  websiteUploadSettings: websiteChange('website.upload_settings'),
  websitePwa: websiteChange('website.pwa_generate'),
  // the key itself is in the answer of "regenerate": never read here
  websiteKeyRegenerate: { action: 'website.api_key_regenerate', kind: 'event', targetType: 'website', loadBefore: loadWebsite, targetLabel: websiteLabel } satisfies AuditSpec<WebsiteRecord>,
  websiteKeyClear: { action: 'website.api_key_clear', kind: 'event', targetType: 'website', loadBefore: loadWebsite, targetLabel: websiteLabel } satisfies AuditSpec<WebsiteRecord>,
  // Publication (publish-jobs.ts): who asked for a site to be generated, with which public settings. The site key in the request body is never read.
  publishQueue: {
    action: 'website.publish', kind: 'event', targetType: 'website',
    targetId: (r: P) => (typeof r.body?.websiteId === 'string' ? r.body.websiteId : undefined),
    loadBefore: (r: P) => (typeof r.body?.websiteId === 'string' ? getWebsite(r.body.websiteId) : Promise.resolve(null)),
    targetLabel: websiteLabel,
    describe: (r, b) => ({ jobId: b?.id ?? null, ...pickAllowed(r.body?.options ?? {}, ['framework', 'slug', 'domain', 'revalidate']), withSiteKey: !!r.body?.siteApiKey }),
  } satisfies AuditSpec<WebsiteRecord>,
  publishCancel: {
    action: 'website.publish_cancel', kind: 'event', targetType: 'publish_job', targetId: (r: P) => r.params.id,
    describe: (_r, b) => ({ result: b?.result ?? null }),
  } satisfies AuditSpec<Record<string, unknown>>,

  websitePathCreate: { action: 'website_path.create', kind: 'create', targetType: 'website_path', snapshot: (p: any) => ({ websiteId: p.websiteId, name: p.name, items: Array.isArray(p.items) ? p.items.length : 0 }), fromResponse: (b) => b?.path, targetLabel: (p: any) => p?.name } satisfies AuditSpec<any>,
  websitePathUpdate: { action: 'website_path.update', kind: 'update', targetType: 'website_path', snapshot: (p: any) => ({ name: p.name, items: fp(p.items) }), loadBefore: (r: P) => getWebsitePath(r.params.id), fromResponse: (b) => b?.path, targetLabel: (p: any) => p?.name } satisfies AuditSpec<any>,
  websitePathDelete: { action: 'website_path.delete', kind: 'delete', targetType: 'website_path', snapshot: (p: any) => ({ websiteId: p.websiteId, name: p.name }), loadBefore: (r: P) => getWebsitePath(r.params.id), targetLabel: (p: any) => p?.name } satisfies AuditSpec<any>,

  settingPlaceholder: settingChange('setting.update', 'defaultPlaceholderImage'),
  settingStripHtml: settingChange('setting.update', 'stripHtmlComments'),
  settingLogging: settingChange('setting.update', 'logging'),
  settingAutosave: settingChange('setting.update', 'autosave'),
  // presets hold directive code: their names are shown, the code is a fingerprint
  settingAlpinePresets: settingChange('setting.update', 'alpinePresets', (v) => ({ names: Array.isArray(v) ? v.map((p: any) => p?.name ?? null) : [], content: fp(v) })),
  settingCdnMirror: settingChange('setting.update', 'cdnMirror'),
  mailSettingsUpdate: { action: 'setting.mail_update', kind: 'update', targetType: 'setting', snapshot: mailSnapshot, loadBefore: loadMail, loadAfter: loadMail, targetId: (r: P) => `mail:${mailScopeId(r) ?? 'default'}`, targetLabel: () => 'Outgoing mail', secrets: ['password', 'smtp', 'providerConfig'] } satisfies AuditSpec<MailEntity>,
  mailSettingsDelete: { action: 'setting.mail_remove', kind: 'delete', targetType: 'setting', snapshot: mailSnapshot, loadBefore: loadMail, targetId: (r: P) => `mail:${mailScopeId(r) ?? 'default'}`, targetLabel: () => 'Outgoing mail' } satisfies AuditSpec<MailEntity>,
  figmaSettings: { action: 'setting.figma_update', kind: 'update', targetType: 'setting', snapshot: (f: FigmaEntity) => ({ teamId: f.teamId, hasToken: f.hasToken }), loadBefore: loadFigma, loadAfter: loadFigma, targetId: () => 'figma', targetLabel: () => 'Figma', secrets: ['accessToken'] } satisfies AuditSpec<FigmaEntity>,

  migrationSourceCreate: { action: 'migration_source.create', kind: 'create', targetType: 'migration_source', snapshot: (s: any) => pickAllowed(s, migrationFields), fromResponse: (b) => b?.source, targetLabel: (s: any) => s?.label } satisfies AuditSpec<any>,
  migrationSourceUpdate: { action: 'migration_source.update', kind: 'update', targetType: 'migration_source', snapshot: (s: any) => pickAllowed(s, migrationFields), loadBefore: loadSource, fromResponse: (b) => b?.source, targetLabel: (s: any) => s?.label, secrets: ['dbPassword'] } satisfies AuditSpec<any>,
  migrationSourceDelete: { action: 'migration_source.delete', kind: 'delete', targetType: 'migration_source', snapshot: (s: any) => pickAllowed(s, migrationFields), loadBefore: loadSource, targetLabel: (s: any) => s?.label } satisfies AuditSpec<any>,
  migrationImportClasses: sourceEvent('migration_source.import_classes'),
  migrationImportObjects: sourceEvent('migration_source.import_objects'),
  migrationImportDocuments: sourceEvent('migration_source.import_documents'),
  migrationPromoteDocuments: sourceEvent('migration_source.promote_documents'),
  migrationExtractComponents: sourceEvent('migration_source.extract_components'),

  subscriptionCreate: { action: 'object_event_subscription.create', kind: 'create', targetType: 'object_event_subscription', snapshot: subSnapshot, fromResponse: (b) => b?.subscription, targetLabel: (s: any) => s?.name } satisfies AuditSpec<any>,
  subscriptionUpdate: { action: 'object_event_subscription.update', kind: 'update', targetType: 'object_event_subscription', snapshot: subSnapshot, loadBefore: loadSub, fromResponse: (b) => b?.subscription, targetLabel: (s: any) => s?.name } satisfies AuditSpec<any>,
  subscriptionDelete: { action: 'object_event_subscription.delete', kind: 'delete', targetType: 'object_event_subscription', snapshot: subSnapshot, loadBefore: loadSub, targetLabel: (s: any) => s?.name } satisfies AuditSpec<any>,
};

