import { describe, it, expect } from 'vitest';
import { createMigrationJobRegistry } from './import-jobs.js';

describe('createMigrationJobRegistry', () => {
  const make = () => {
    let t = 1000;
    let n = 0;
    const reg = createMigrationJobRegistry(() => t, () => `job-${++n}`);
    return { reg, advance: (ms: number) => { t += ms; } };
  };

  it('tracks progress and the result of a job', () => {
    const { reg } = make();
    const job = reg.start('s1', 'Customer');
    expect(reg.get(job.id)).toMatchObject({ status: 'running', processed: 0, total: 0 });
    reg.progress(job.id, 40, 100);
    expect(reg.get(job.id)).toMatchObject({ processed: 40, total: 100 });
    reg.finish(job.id, { succeeded: 99, failed: 1, errors: [{ item: '7', message: 'x' }] });
    expect(reg.get(job.id)).toMatchObject({ status: 'done', result: { succeeded: 99, failed: 1 } });
  });

  it('finds the job already running for the same source and class, not a finished one or another class', () => {
    const { reg } = make();
    const a = reg.start('s1', 'Customer');
    expect(reg.running('s1', 'Customer')?.id).toBe(a.id);
    expect(reg.running('s1', 'Car')).toBeUndefined();
    reg.fail(a.id, 'boom');
    expect(reg.running('s1', 'Customer')).toBeUndefined();
    expect(reg.get(a.id)).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('forgets finished jobs after an hour but never a running one', () => {
    const { reg, advance } = make();
    const done = reg.start('s1', 'A');
    reg.finish(done.id, { succeeded: 1, failed: 0, errors: [] });
    const running = reg.start('s1', 'B');
    advance(61 * 60 * 1000);
    reg.start('s1', 'C'); // pruning happens when a job starts
    expect(reg.get(done.id)).toBeUndefined();
    expect(reg.get(running.id)).toBeDefined();
  });
});
