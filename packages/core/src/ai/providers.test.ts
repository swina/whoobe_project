import { describe, it, expect } from 'vitest';
import { parseJsonText, AiGenerationError } from './providers.js';

function failure(text: string, truncated?: boolean): AiGenerationError {
  try {
    parseJsonText(text, truncated);
  } catch (e) {
    return e as AiGenerationError;
  }
  throw new Error('expected parseJsonText to throw');
}

describe('parseJsonText', () => {
  it('parses plain and fenced JSON', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonText('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('reports a reply cut off by the output limit as such, not as malformed JSON', () => {
    const cut = '{"blocks":[' + '{"id":"x","content":"hello"},'.repeat(200) + '{"id":"y","con';
    const err = failure(cut, true);
    expect(err).toBeInstanceOf(AiGenerationError);
    expect(err.message).toMatch(/stopped at its output limit/);
    expect(err.message).not.toMatch(/did not return valid JSON/);
  });

  it('keeps the head and the tail of a long invalid reply in the message and the full text in rawText', () => {
    const body = '{"start":"HEAD-MARK",' + '"k":"v",'.repeat(2000) + '"end":TAIL-MARK}';
    const err = failure(body);
    expect(err.message).toMatch(/did not return valid JSON/);
    expect(err.message).toContain('Raw output:');
    expect(err.message).toContain('HEAD-MARK');
    expect(err.message).toContain('TAIL-MARK');
    expect(err.message.length).toBeLessThan(3500);
    expect(err.rawText).toBe(body);
  });
});
