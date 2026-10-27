import { describe, it, expect, vi } from 'vitest';

// The providers' SDKs, answering with the usage each one reports (no network).
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: async () => ({ choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 30 } }) } };
    // OpenRouter's image reply: chat-style token names, no input/output_tokens
    images = { generate: async () => ({ data: [{ b64_json: 'AAAA' }], usage: { prompt_tokens: 4, completion_tokens: 989, total_tokens: 993, cost: 0.01 } }) };
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: async () => ({ content: [{ type: 'text', text: 'not json' }], stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 7 } }) };
  },
}));

const { createAiUsageMeter, runWithAiUsageMeter, reportAiUsage } = await import('./usage.js');
const { generateAiJson, AiGenerationError } = await import('./providers.js');
const { generateImage } = await import('./image-providers.js');

const settings = (provider: string) => ({ provider, model: 'm-test', endpoint: null, apiKey: 'k' });

describe('AI usage meter', () => {
  it('adds up the replies of one request across awaits, and keeps provider and model', async () => {
    const meter = createAiUsageMeter();
    await runWithAiUsageMeter(meter, async () => {
      reportAiUsage('openai', 'gpt-x', 10, 2);
      await new Promise((r) => setTimeout(r, 5));
      await Promise.all([(async () => reportAiUsage('openai', 'gpt-x', 5, 1))(), (async () => reportAiUsage('openai', 'gpt-x', 5, 1))()]);
    });
    expect(meter.usage).toEqual({ calls: 3, inputTokens: 20, outputTokens: 4 });
    expect(meter.provider).toBe('openai');
    expect(meter.model).toBe('gpt-x');
  });

  it('counts a reply without tokens as a call and keeps the tokens null until one reports them', () => {
    const meter = createAiUsageMeter();
    runWithAiUsageMeter(meter, () => reportAiUsage('custom', 'local', undefined, null));
    expect(meter.usage).toEqual({ calls: 1, inputTokens: null, outputTokens: null });
    runWithAiUsageMeter(meter, () => reportAiUsage('custom', 'local', 8, 'x'));
    expect(meter.usage).toEqual({ calls: 2, inputTokens: 8, outputTokens: null });
  });

  it('does nothing outside a request, and two requests at the same time do not mix', async () => {
    expect(() => reportAiUsage('openai', 'gpt-x', 1, 1)).not.toThrow();
    const a = createAiUsageMeter();
    const b = createAiUsageMeter();
    await Promise.all([
      runWithAiUsageMeter(a, async () => { await new Promise((r) => setTimeout(r, 5)); reportAiUsage('openai', 'gpt-x', 1, 1); }),
      runWithAiUsageMeter(b, async () => { reportAiUsage('anthropic', 'claude', 100, 100); }),
    ]);
    expect(a.usage).toEqual({ calls: 1, inputTokens: 1, outputTokens: 1 });
    expect(b.usage).toEqual({ calls: 1, inputTokens: 100, outputTokens: 100 });
  });

  it('receives the tokens an OpenAI-compatible provider reports', async () => {
    const meter = createAiUsageMeter();
    const r = await runWithAiUsageMeter(meter, () => generateAiJson({ settings: settings('openai'), systemPrompt: '', userPrompt: 'x' }));
    expect(r.json).toEqual({ a: 1 });
    expect(meter.usage).toEqual({ calls: 1, inputTokens: 120, outputTokens: 30 });
  });

  it('counts a reply that cannot be parsed: it was paid for', async () => {
    const meter = createAiUsageMeter();
    await expect(runWithAiUsageMeter(meter, () => generateAiJson({ settings: settings('anthropic'), systemPrompt: '', userPrompt: 'x' }))).rejects.toBeInstanceOf(AiGenerationError);
    expect(meter.usage).toEqual({ calls: 1, inputTokens: 50, outputTokens: 7 });
    expect(meter.provider).toBe('anthropic');
  });

  it('receives the tokens of an image reply in the OpenRouter shape (prompt/completion_tokens)', async () => {
    const meter = createAiUsageMeter();
    await runWithAiUsageMeter(meter, () => generateImage({ settings: { provider: 'openrouter', model: 'meta/muse-image', endpoint: null, apiKey: 'k' }, prompt: 'x' } as any));
    expect(meter.usage).toEqual({ calls: 1, inputTokens: 4, outputTokens: 989 });
  });
});
