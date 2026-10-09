import { pgTable, text, uuid, timestamp, bigint, index } from 'drizzle-orm/pg-core';

// Files visitors sent through a form's Upload field (docs/plans/forms/form-upload-plan.md). A row exists from the "intent" step;
// `status` is plain text on purpose (staged -> attached | rejected | expired), new states need no migration.
export const formUploads = pgTable('form_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  websiteId: uuid('website_id').notNull(),
  formRef: text('form_ref').notNull(),
  status: text('status').notNull().default('pending'),
  extension: text('extension').notNull(),
  // what the visitor called the file: display and metadata only, never a path
  originalName: text('original_name').notNull(),
  declaredSize: bigint('declared_size', { mode: 'number' }).notNull(),
  size: bigint('size', { mode: 'number' }),
  // where the bytes are: the staging key first, the library key after the form was submitted
  s3Key: text('s3_key'),
  assetId: uuid('asset_id'),
  submissionId: uuid('submission_id'),
  rejectedReason: text('rejected_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  attachedAt: timestamp('attached_at', { withTimezone: true }),
}, (t) => ({
  byWebsiteDay: index('form_uploads_website_created').on(t.websiteId, t.createdAt),
  byStatus: index('form_uploads_status_created').on(t.status, t.createdAt),
}));
