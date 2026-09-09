import OpenAI from 'openai';

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
  const baseURL = settings.endpoint
    ? settings.endpoint.replace(/\/+$/, '') + '/v1'
    : 'https://api.openai.com/v1';
  return new OpenAI({ apiKey: settings.apiKey ?? undefined, baseURL });
}

export async function generateImage(input: AiImageGenerateInput): Promise<AiImageGenerateOutput> {
  const { settings, prompt, n, size, quality, style } = input;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = buildOpenAiClient(settings);
      const response = await client.images.generate({
        model: settings.model,
        prompt,
        n: n ?? 1,
        size: (size ?? '1024x1024') as any,
        quality: (quality ?? 'standard') as any,
        style: (style ?? 'vivid') as any,
        response_format: 'url',
      });

      if (!response.data) {
        throw new AiImageGenerationError('No image data returned from provider', 500);
      }

      const images = response.data.map((d) => ({
        url: d.url ?? '',
        revisedPrompt: d.revised_prompt ?? undefined,
      }));

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