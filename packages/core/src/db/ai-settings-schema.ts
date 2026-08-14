import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Global AI generation config (docs/plans/ai/ai-pages-snippets-generator.md)
// - a single row, not scoped per-website, mirroring mail_settings. The API
// key is server-side-only: the GET route never returns it (only
// `hasApiKey`), so it can't leak out over the wire to the dashboard form.
export const aiSettings = pgTable('ai_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // openai | anthropic | google | zen | openrouter | custom (zen = OpenCode
  // Zen gateway at https://opencode.ai/zen/v1; openrouter = OpenRouter
  // gateway at https://openrouter.ai/api/v1; custom = OpenAI-compatible
  // endpoint, e.g. LM Studio/Ollama/vLLM).
  provider: text('provider').notNull().default('openai'),
  // The "AI agent" from the plan doc - the model name sent to the provider.
  model: text('model').notNull().default('gpt-4o-mini'),
  // Base URL override; required for provider === 'custom', optional
  // otherwise (SDK defaults apply).
  endpoint: text('endpoint'),
  apiKey: text('api_key'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});