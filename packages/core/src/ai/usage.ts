// Token usage of the AI calls (docs/plans/ai/ai-usage-plan.md). Every reply of a provider reports what it consumed to
// the meter of the request that caused it, if there is one: the meter is carried by AsyncLocalStorage, so a route that
// retries, batches or calls the provider from a helper is counted without passing anything through each call.
// A provider that does not report tokens (some OpenAI-compatible servers, image endpoints) still counts as a call.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface AiUsage {
  /** provider calls that returned an answer (a retry after a transport error is not one) */
  calls: number;
  /** null when no reply of the request reported tokens */
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiUsageMeter {
  readonly usage: AiUsage;
  /** provider and model of the last call (a request uses one configuration) */
  provider: string | null;
  model: string | null;
}

const scope = new AsyncLocalStorage<AiUsageMeter>();

export function createAiUsageMeter(): AiUsageMeter {
  return { usage: { calls: 0, inputTokens: null, outputTokens: null }, provider: null, model: null };
}

/** Runs `fn` with `meter` receiving the usage of every provider reply until `fn` and what it started are done. */
export function runWithAiUsageMeter<T>(meter: AiUsageMeter, fn: () => T): T {
  return scope.run(meter, fn);
}

const tokens = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);
const plus = (a: number | null, b: number | null): number | null => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

/** Called by the provider adapters once per reply, before its text is parsed (a reply that fails to parse was paid for). */
export function reportAiUsage(provider: string, model: string, inputTokens: unknown, outputTokens: unknown): void {
  const meter = scope.getStore();
  if (!meter) return;
  meter.usage.calls += 1;
  meter.usage.inputTokens = plus(meter.usage.inputTokens, tokens(inputTokens));
  meter.usage.outputTokens = plus(meter.usage.outputTokens, tokens(outputTokens));
  meter.provider = provider;
  meter.model = model;
}
