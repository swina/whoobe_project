// In-memory registry of the Pimcore object imports running in the background (POST /migration-sources/:id/import-objects with
// `background: true`): the browser polls GET /migration-sources/import-jobs/:jobId for "processed of total". Lives in this process only:
// a restart forgets the jobs (the objects already imported stay, a re-run updates them by their Pimcore id).

export interface MigrationJobResult {
  succeeded: number;
  failed: number;
  errors: { item: string; message: string }[];
}

export interface MigrationJob {
  id: string;
  sourceId: string;
  className: string;
  status: 'running' | 'done' | 'failed';
  processed: number;
  total: number;
  result?: MigrationJobResult;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const MAX_JOBS = 50;
const KEEP_FINISHED_MS = 60 * 60 * 1000;

export function createMigrationJobRegistry(now: () => number = Date.now, makeId: () => string = () => crypto.randomUUID()) {
  const jobs = new Map<string, MigrationJob>();

  function prune() {
    for (const [id, job] of jobs) {
      if (job.finishedAt && now() - job.finishedAt > KEEP_FINISHED_MS) jobs.delete(id);
    }
    while (jobs.size > MAX_JOBS) {
      const oldest = [...jobs.values()].filter((j) => j.finishedAt).sort((a, b) => a.startedAt - b.startedAt)[0];
      if (!oldest) break;
      jobs.delete(oldest.id);
    }
  }

  return {
    /** The job already running for this source and class, if any (the same import is not started twice). */
    running(sourceId: string, className: string): MigrationJob | undefined {
      return [...jobs.values()].find((j) => j.status === 'running' && j.sourceId === sourceId && j.className === className);
    },
    start(sourceId: string, className: string): MigrationJob {
      prune();
      const job: MigrationJob = { id: makeId(), sourceId, className, status: 'running', processed: 0, total: 0, startedAt: now() };
      jobs.set(job.id, job);
      return job;
    },
    progress(id: string, processed: number, total: number) {
      const job = jobs.get(id);
      if (job) { job.processed = processed; job.total = total; }
    },
    finish(id: string, result: MigrationJobResult) {
      const job = jobs.get(id);
      if (job) { job.status = 'done'; job.result = result; job.finishedAt = now(); }
    },
    fail(id: string, error: string) {
      const job = jobs.get(id);
      if (job) { job.status = 'failed'; job.error = error; job.finishedAt = now(); }
    },
    get(id: string): MigrationJob | undefined {
      return jobs.get(id);
    },
  };
}
