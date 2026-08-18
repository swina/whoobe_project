import { pgTable, text, jsonb, uuid, timestamp } from 'drizzle-orm/pg-core';

export const themes = pgTable('themes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  colors: jsonb('colors').$type<{ name: string; hex: string }[]>().notNull().default([]),
  fonts: text('fonts').array().notNull().default([]),
  styles: text('styles').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});