// The answers of the template wizard, as a strict schema: what the dashboard sends and what `wizardToSiteSpec` reads. Anything not listed is an error.
import { z } from 'zod';
import { BLOCK_TYPES, SECTORS } from './copy.js';
import { PRESET_NAMES } from './themes.js';

const plain = (max: number) => z.string().trim().min(1, 'must not be empty').max(max).regex(/^[^<>{}\\]*$/, 'plain text only');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #RRGGBB');

/** A position of a page structure: a generated block, or a snippet of the library standing for a block of that category. */
export const blockChoiceSchema = z.union([
  z.object({ type: z.enum(BLOCK_TYPES) }).strict(),
  z.object({ snippet: z.string().trim().min(1).max(120), category: z.enum(BLOCK_TYPES) }).strict(),
]);

export const wizardAnswersSchema = z.object({
  name: plain(60),
  /** one language in the first version */
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'a locale such as "en"').default('en'),
  sector: z.enum(SECTORS),
  /** the market context, free text: "hotel", "bakery" */
  context: z.string().max(120).optional(),
  theme: z.union([z.object({ preset: z.enum(PRESET_NAMES) }).strict(), z.object({ background: hex }).strict()]),
  accent: hex.optional(),
  font: z.enum(['sans', 'serif']).default('sans'),
  /** the first page is the landing page; at most three more */
  pages: z.array(z.object({ title: plain(60), blocks: z.array(blockChoiceSchema).max(10) }).strict()).min(1).max(4),
  headerButton: z.boolean().default(false),
}).strict();

export type WizardAnswers = z.infer<typeof wizardAnswersSchema>;
export type WizardAnswersInput = z.input<typeof wizardAnswersSchema>;
