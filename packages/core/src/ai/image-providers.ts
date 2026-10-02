import OpenAI from 'openai';
import { createSafeFetchAdapter, safeFetch } from '../http/safe-fetch.js';
import { OPENROUTER_DEFAULT_ENDPOINT } from './providers.js';

export type ImageAiProvider = 'openai' | 'openrouter' | 'google' | 'custom';

// Google Gemini's native image-generation model (generateContent with
// responseModalities: ['IMAGE'] - returns inline base64 image parts, unlike
// the Imagen family which uses a separate :predict endpoint).
export const GOOGLE_IMAGE_DEFAULT_MODEL = 'gemini-2.5-flash-image';

export interface AiImageSettings {
  provider: ImageAiProvider;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
}

export interface AiImageGenerateInput {
  settings: AiImageSettings;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
}

export interface AiImageGenerateOutput {
  images: { url: string; revisedPrompt?: string }[];
  rawResponse: unknown;
}

export class AiImageGenerationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiImageGenerationError';
    this.status = status;
  }
}

function buildOpenAiClient(settings: AiImageSettings): OpenAI {
  const defaultEndpoint = settings.provider === 'openrouter'
    ? OPENROUTER_DEFAULT_ENDPOINT
    : 'https://api.openai.com/v1';
  const baseURL = settings.endpoint?.trim() || defaultEndpoint;
  // A custom endpoint is operator-supplied: send it through the outbound (SSRF) policy.
  const custom = !!settings.endpoint?.trim();
  return new OpenAI({ apiKey: settings.apiKey ?? undefined, baseURL, ...(custom ? { fetch: createSafeFetchAdapter() as any } : {}) });
}

/** Gemini's native image-generation models (e.g. gemini-2.5-flash-image)
 *  are called through generateContent, not the OpenAI-compatible
 *  images.generate() endpoint used by the other providers - the response
 *  carries inline base64 image parts alongside any text the model emits. */
async function generateGoogleImage(input: AiImageGenerateInput): Promise<AiImageGenerateOutput> {
  const { settings, prompt, n } = input;
  if (!settings.apiKey) {
    throw new AiImageGenerationError('No API key configured for the AI image provider (google). Save it in Settings → AI Image.', 401);
  }
  const model = settings.model || GOOGLE_IMAGE_DEFAULT_MODEL;
  const endpoint = (settings.endpoint?.trim() || 'https://generativelanguage.googleapis.com/v1beta')
    .replace(/\/+$/, '');
  const url = `${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response;
    try {
      response = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'], candidateCount: n ?? 1 },
        }),
      });
    } catch (error: any) {
      throw new AiImageGenerationError(error?.message || 'Image generation request failed', 500);
    }

    if (!response.ok) {
      const status = response.status;
      if ((status === 429 || (status >= 500 && status < 600)) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      const body = await response.json().catch(() => null);
      throw new AiImageGenerationError(
        body?.error?.message || `Image generation failed (${status})`,
        status
      );
    }

    const body: any = await response.json();
    const candidates = body?.candidates ?? [];
    const images = candidates
      .flatMap((c: any) => c?.content?.parts ?? [])
      .filter((part: any) => part?.inlineData?.data)
      .map((part: any) => ({
        url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`,
      }));

    if (images.length === 0) {
      throw new AiImageGenerationError('Provider returned no image data', 500);
    }

    return { images, rawResponse: body };
  }

  throw new AiImageGenerationError('Image generation failed after 3 retries', 500);
}

export async function generateImage(input: AiImageGenerateInput): Promise<AiImageGenerateOutput> {
  if (input.settings.provider === 'google') {
    return generateGoogleImage(input);
  }

  const { settings, prompt, n, size, quality, style } = input;
  const isDallE = settings.model.startsWith('dall-e');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = buildOpenAiClient(settings);
      const response = await client.images.generate({
        model: settings.model,
        prompt,
        n: n ?? 1,
        size: (size ?? '1024x1024') as any,
        quality: isDallE ? (quality ?? 'standard') as any : undefined,
        style: isDallE ? (style ?? 'vivid') as any : undefined,
        response_format: 'url',
      });

      if (!response.data) {
        throw new AiImageGenerationError('No image data returned from provider', 500);
      }

      const images = response.data.map((d: any) => ({
        url: d.url
          ? d.url
          : d.b64_json
            ? `data:image/png;base64,${d.b64_json}`
            : '',
        revisedPrompt: d.revised_prompt ?? undefined,
      }));

      // Fallback: if all urls are empty, try extracting from the raw response
      if (images.every((img) => !img.url)) {
        const raw = response as any;
        const rawData = raw?.data ?? [];
        for (let i = 0; i < rawData.length; i++) {
          const entry = typeof rawData[i] === 'string'
            ? rawData[i]
            : rawData[i]?.url ?? (rawData[i]?.b64_json ? `data:image/png;base64,${rawData[i].b64_json}` : '');
          if (entry && !images[i]?.url) images[i].url = entry;
        }
      }

      if (images.every((img) => !img.url)) {
        throw new AiImageGenerationError('Provider returned images without accessible URLs', 500);
      }

      return { images, rawResponse: response };
    } catch (error: any) {
      const status = error?.status ?? 0;

      if (status === 429 && attempt < 3) {
        const retryAfter = parseInt(error?.headers?.get('retry-after') ?? '5', 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (status >= 500 && status < 600 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }

      if (error?.error?.code === 'content_policy_violation') {
        throw new AiImageGenerationError(
          'Content policy violation: your prompt was rejected by the content filter. Try a different prompt.',
          422
        );
      }

      throw new AiImageGenerationError(
        error?.error?.message || error?.message || 'Image generation failed',
        status || 500
      );
    }
  }

  throw new AiImageGenerationError('Image generation failed after 3 retries', 500);
}