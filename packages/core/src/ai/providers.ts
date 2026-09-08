// Provider adapters for AI page/snippet generation (docs/plans/ai/ai-pages-
// snippets-generator.md). Each provider call is non-streaming and returns
// a single text completion which the caller parses as JSON (see
// parseJsonText()). The endpoint/model/key come from the ai_settings DB row
// (server-side only - the key is never sent to any client).

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type AiProviderName = 'openai' | 'anthropic' | 'google' | 'zen' | 'openrouter' | 'custom';

// OpenCode Zen (https://opencode.ai/docs/zen/) - a curated gateway of
// tested models served through one OpenAI-compatible endpoint. The chat
// completions models (DeepSeek, GLM, Kimi, MiniMax, and the free tier)
// work through the OpenAI SDK's chat.completions path directly.
export const ZEN_DEFAULT_ENDPOINT = 'https://opencode.ai/zen/v1';
export const ZEN_DEFAULT_MODEL = 'deepseek-v4-flash-free';

// OpenRouter (https://openrouter.ai/docs) - OpenAI-compatible gateway to a
// large catalog of models, routed across upstream providers. Model IDs use
// the `vendor/slug` convention (e.g. openai/gpt-5.2, deepseek/deepseek-chat).
export const OPENROUTER_DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1';
export const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-chat';

export interface AiProviderSettings {
  provider: string;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
}

export interface AiGenerateInput {
  settings: AiProviderSettings;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export class AiGenerationError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'AiGenerationError';
  }
}

function requireApiKey(settings: AiProviderSettings, provider: string): string {
  if (!settings.apiKey) {
    throw new AiGenerationError(`No API key configured for the AI provider (${provider}). Save it in Settings → AI.`);
  }
  return settings.apiKey;
}

/** Strips markdown code fences, non-printable ASCII control characters
 *  (except \t, \n, \r — valid JSON whitespace), and extracts the first
 *  JSON value from a model reply. Providers are instructed to output bare
 *  JSON, but most wrap it in ```json fences, and some inject invisible
 *  control characters that break JSON.parse. */
export function parseJsonText(text: string): unknown {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  // Strip non-printable ASCII control characters (0x00-0x1F except \t \n \r)
  // that some AI providers inject and break JSON.parse.
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Log the first 3000 chars for debugging, then truncate to avoid
    // shipping megabytes of garbage in an error message.
    const preview = cleaned.length > 3000 ? cleaned.substring(0, 3000) + '\n... [truncated]' : cleaned;
    throw new AiGenerationError(`The AI provider did not return valid JSON. Raw output:\n${preview}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the provider's Retry-After header (seconds) from an SDK error,
 *  capped at 60s. Returns undefined when absent or in HTTP-date form. */
function retryAfterMs(error: unknown): number | undefined {
  const headers = (error as { headers?: unknown })?.headers;
  if (!headers) return undefined;
  const raw =
    typeof (headers as { get?: (k: string) => string | null }).get === 'function'
      ? (headers as { get: (k: string) => string | null }).get('retry-after')
      : (headers as Record<string, unknown>)['retry-after'];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(seconds * 1000, 60_000);
}

/** True when the provider reports an account-level free-tier quota
 *  exhaustion (OpenCode Zen's gateway returns `FreeUsageLimitError` for
 *  the `*-free` models). Retrying is pointless - the quota is spent, not
 *  momentarily throttled. The OpenAI SDK v7 surfaces the parsed response
 *  on `.error` (a plain-object `{ type, message }`), older versions on
 *  `.body.error` - both shapes are checked. */
function isFreeQuotaError(error: unknown): boolean {
  const e = error as {
    body?: { error?: { type?: string } };
    error?: { type?: string; error?: { type?: string } };
  };
  const bodyType = e.body?.error?.type;
  const sdkError = e.error;
  const sdkType = typeof sdkError?.type === 'string' ? sdkError.type : sdkError?.error?.type;
  return bodyType === 'FreeUsageLimitError' || sdkType === 'FreeUsageLimitError';
}

/** Maps raw SDK/provider errors to friendly, actionable messages. */
function mapProviderError(error: unknown, model: string): AiGenerationError {
  const anyError = error as { status?: number; message?: string };
  const status = anyError.status;
  if (status === 401) return new AiGenerationError('The AI provider rejected the API key (401). Check Settings → AI.', 401);
  if (status === 429 && isFreeQuotaError(error)) {
    return new AiGenerationError(
      `The free-tier usage limit for model "${model}" has been reached (FreeUsageLimitError from the upstream provider). Retrying won't help - wait for the quota window to reset, or switch to a paid model (e.g. deepseek-v4-flash) in Settings → AI.`,
      429
    );
  }
  if (status === 429) {
    const waitMs = retryAfterMs(error);
    const hint = waitMs
      ? ` Wait ~${Math.ceil(waitMs / 1000)}s per the provider's Retry-After header.`
      : ' Try again in a moment.';
    return new AiGenerationError(`The AI provider rate-limited the request (429).${hint}`, 429);
  }
  if (status === 404) return new AiGenerationError(`The AI provider does not know model "${model}" (404). Check the model name in Settings → AI.`, 404);
  if (typeof status === 'number' && status >= 502 && status <= 504) {
    return new AiGenerationError('The AI provider endpoint is temporarily unavailable (gateway error). Try again in a moment, or switch provider/model in Settings → AI.', status);
  }
  return new AiGenerationError(anyError.message || 'AI provider request failed', status);
}

export interface AiGenerateResult {
  json: unknown;
  rawText: string;
}

async function generateOpenAi(input: AiGenerateInput, baseUrl?: string, providerLabel = 'openai'): Promise<AiGenerateResult> {
  const client = new OpenAI({
    apiKey: requireApiKey(input.settings, providerLabel),
    baseURL: baseUrl ?? undefined,
    timeout: 120_000,
    // Retries are handled by generateAiJson's own 429 loop - the SDK's
    // internal retries would otherwise multiply with ours (3x3 attempts).
    maxRetries: 0,
  });
  const completion = await client.chat.completions.create({
    model: input.settings.model,
    temperature: 0.7,
    max_tokens: input.maxTokens ?? 4096,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
  });
  const rawText = completion.choices[0]?.message?.content ?? '';
  return { json: parseJsonText(rawText), rawText };
}

async function generateAnthropic(input: AiGenerateInput): Promise<AiGenerateResult> {
  const client = new Anthropic({
    apiKey: requireApiKey(input.settings, 'anthropic'),
    timeout: 120_000,
    maxRetries: 0,
  });
  const message = await client.messages.create({
    model: input.settings.model,
    max_tokens: input.maxTokens ?? 4096,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.userPrompt }],
  });
  const rawText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n');
  return { json: parseJsonText(rawText), rawText };
}

async function generateGoogle(input: AiGenerateInput): Promise<AiGenerateResult> {
  const genAI = new GoogleGenerativeAI(requireApiKey(input.settings, 'google'));
  const model = genAI.getGenerativeModel({
    model: input.settings.model,
    systemInstruction: input.systemPrompt,
    generationConfig: { maxOutputTokens: input.maxTokens ?? 4096 },
  });
  const result = await model.generateContent(input.userPrompt);
  const rawText = result.response.text();
  return { json: parseJsonText(rawText), rawText };
}

/** Dispatches to the configured provider. `custom` reuses the OpenAI SDK
 *  pointed at a user-supplied OpenAI-compatible base URL (LM Studio,
 *  Ollama, vLLM, ...). `zen` and `openrouter` do the same against their
 *  gateway defaults (https://opencode.ai/zen/v1 and
 *  https://openrouter.ai/api/v1) unless the stored endpoint overrides them.
 *
 *  HTTP 429s and transient gateway 5xx (502/503/504 - e.g. Zen's free
 *  models reporting "Upstream request failed: Endpoint is unavailable")
 *  are retried up to 2 extra times, sleeping per the provider's
 *  Retry-After header when it sends one (SDK-internal retries are disabled
 *  so this loop is the single source of retry behavior). */
export async function generateAiJson(input: AiGenerateInput): Promise<AiGenerateResult> {
  const provider = input.settings.provider || 'openai';
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      switch (provider) {
        case 'anthropic':
          return await generateAnthropic(input);
        case 'google':
          return await generateGoogle(input);
        case 'custom': {
          const endpoint = input.settings.endpoint?.trim();
          if (!endpoint) {
            throw new AiGenerationError('Provider "custom" requires an endpoint URL (Settings → AI).');
          }
          return await generateOpenAi(input, endpoint);
        }
        case 'zen': {
          const endpoint = input.settings.endpoint?.trim() || ZEN_DEFAULT_ENDPOINT;
          return await generateOpenAi(input, endpoint, 'zen');
        }
        case 'openrouter': {
          const endpoint = input.settings.endpoint?.trim() || OPENROUTER_DEFAULT_ENDPOINT;
          return await generateOpenAi(input, endpoint, 'openrouter');
        }
        case 'openai':
        default:
          return await generateOpenAi(input);
      }
    } catch (error) {
      if (error instanceof AiGenerationError) {
        // Our own failure (missing key, bad config, parse error) - no retry.
        throw error;
      }
      lastError = error;
      const status = (error as { status?: number }).status;
      const transient =
        (status === 429 && !isFreeQuotaError(error)) ||
        (typeof status === 'number' && status >= 502 && status <= 504);
      if (transient && attempt < maxAttempts) {
        await sleep(retryAfterMs(error) ?? attempt * 2_000);
        continue;
      }
      throw mapProviderError(error, input.settings.model);
    }
  }
  throw mapProviderError(lastError, input.settings.model);
}