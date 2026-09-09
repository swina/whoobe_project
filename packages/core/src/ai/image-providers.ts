import OpenAI from 'openai';
import { OPENROUTER_DEFAULT_ENDPOINT } from './providers.js';

export type ImageAiProvider = 'openai' | 'openrouter' | 'custom';

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
  return new OpenAI({ apiKey: settings.apiKey ?? undefined, baseURL });
}

export async function generateImage(input: AiImageGenerateInput): Promise<AiImageGenerateOutput> {
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
        url: d.url ?? d.b64_json ?? '',
        revisedPrompt: d.revised_prompt ?? undefined,
      }));

      // Fallback: if all urls are empty, try extracting from the raw response
      if (images.every((img) => !img.url)) {
        const raw = response as any;
        const rawData = raw?.data ?? [];
        for (let i = 0; i < rawData.length; i++) {
          const entry = typeof rawData[i] === 'string' ? rawData[i] : rawData[i]?.url ?? rawData[i]?.b64_json ?? '';
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