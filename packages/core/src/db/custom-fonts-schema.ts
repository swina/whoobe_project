import { pgTable, text, integer, uuid, timestamp } from 'drizzle-orm/pg-core';

/** Web fonts uploaded to the DAM, shared by every website of the workspace. One row is one face: a family has a row per weight and style. */
export const customFonts = pgTable('custom_fonts', {
  id: uuid('id').primaryKey().defaultRandom(),
  family: text('family').notNull(),
  weight: integer('weight').notNull().default(400),
  style: text('style').notNull().default('normal'),
  /** `pimcorePath` of the woff2 asset (a public folder) */
  assetPath: text('asset_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
