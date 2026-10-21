import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

/** Palettes of the Generate Website Wizard made by a person; the built-in ones are in the code (site-wizard/themes.ts). `colors` has the eight roles. */
export const wizardPalettes = pgTable('wizard_palettes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  colors: jsonb('colors').$type<Record<string, string>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
