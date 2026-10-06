import { describe, expect, it } from 'vitest';
import { createSelfHealingClient, isConnectTimeout } from './self-healing-client.js';

const timeout = () => Object.assign(new Error('Socket timed out without establishing a connection within 5000 ms'), { name: 'TimeoutError' });

function factory(plan: Array<(cmd: string) => Promise<string>>) {
  const made: { destroyed: boolean; calls: number }[] = [];
  const make = () => {
    const state = { destroyed: false, calls: 0 };
    const behaviour = plan[made.length] ?? (async (c: string) => `ok:${c}`);
    made.push(state);
    return { send: async (cmd: string) => { state.calls++; return behaviour(cmd); }, destroy: () => { state.destroyed = true; } };
  };
  return { make, made };
}

describe('isConnectTimeout', () => {
  it('recognises the SDK timeout and the socket one, nothing else', () => {
    expect(isConnectTimeout(timeout())).toBe(true);
    expect(isConnectTimeout({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isConnectTimeout(new Error('connect ETIMEDOUT 127.0.0.1:9000'))).toBe(true);
    for (const e of [new Error('NoSuchKey'), Object.assign(new Error('x'), { name: 'NoSuchKey' }), { code: 'ECONNREFUSED' }, null, undefined]) expect(isConnectTimeout(e)).toBe(false);
  });
});

describe('createSelfHealingClient', () => {
  it('uses one client while it works', async () => {
    const f = factory([]);
    const c = createSelfHealingClient(f.make);
    expect(await c.send('a')).toBe('ok:a');
    expect(await c.send('b')).toBe('ok:b');
    expect(f.made).toHaveLength(1);
  });

  it('rebuilds after a connection timeout, destroys the old client and repeats the call once', async () => {
    const f = factory([async () => { throw timeout(); }]);
    const healed: unknown[] = [];
    const c = createSelfHealingClient(f.make, (e) => healed.push(e));
    expect(await c.send('a')).toBe('ok:a');
    expect(f.made).toHaveLength(2);
    expect(f.made[0].destroyed).toBe(true);
    expect(healed).toHaveLength(1);
    expect(await c.send('b')).toBe('ok:b');
    expect(f.made[1].calls).toBe(2);
  });

  it('does not retry other errors (a missing key is an answer, not a fault)', async () => {
    const f = factory([async () => { throw Object.assign(new Error('missing'), { name: 'NoSuchKey' }); }]);
    const c = createSelfHealingClient(f.make);
    await expect(c.send('a')).rejects.toThrow('missing');
    expect(f.made).toHaveLength(1);
  });

  it('gives up after the one repeat: a second timeout is reported, no loop', async () => {
    const f = factory([async () => { throw timeout(); }, async () => { throw timeout(); }]);
    const c = createSelfHealingClient(f.make);
    await expect(c.send('a')).rejects.toThrow(/Socket timed out/);
    expect(f.made).toHaveLength(2);
  });

  it('calls that time out together rebuild the client once', async () => {
    const f = factory([async () => { await new Promise((r) => setTimeout(r, 5)); throw timeout(); }]);
    const c = createSelfHealingClient(f.make);
    const results = await Promise.all(['a', 'b', 'c', 'd'].map((x) => c.send(x)));
    expect(results).toEqual(['ok:a', 'ok:b', 'ok:c', 'ok:d']);
    expect(f.made).toHaveLength(2);
  });
});
