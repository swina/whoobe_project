import { pgTable, text, uuid, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';

// Website publications started from the dashboard (docs/plans/website/publish-from-dashboard.md, phase 1). A runner outside the CMS
// (apps/publisher) claims a queued row, runs `whoobe-publish` and reports back over HTTP. `status` is plain text on purpose
// (queued -> running -> succeeded | failed | cancelled): new states need no migration. A partial unique index (in the migration) allows
// one queued or running job per website.
export const publishJobs = pgTable('publish_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').notNull(),
  requestedBy: uuid('requested_by'),
  status: text('status').notNull().default('queued'),
  // validated generator options; never the gateway site key
  options: jsonb('options').notNull(),
  // the gateway site key for this run, encrypted at rest when INTEGRATION_SECRETS_ENCRYPTION_KEY is set; handed to the runner once and
  // cleared at claim (or cancel), so a finished job never holds it
  siteKeyEnc: text('site_key_enc'),
  // what the runner printed, secrets masked, capped
  log: text('log').notNull().default(''),
  // where the release was written, relative to the publish root: <slug>/releases/<job id>
  releasePath: text('release_path'),
  error: text('error'),
  cancelRequested: boolean('cancel_requested').notNull().default(false),
  runner: text('runner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => ({
  byWebsite: index('publish_jobs_website_created').on(t.websiteId, t.createdAt),
  byStatus: index('publish_jobs_status_created').on(t.status, t.createdAt),
}));
