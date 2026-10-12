// Release directories: <root>/<slug>/releases/<job id>, with <root>/<slug>/current -> releases/<job id> switched atomically
// (symlink created beside it, then renamed over it), so a visitor never sees a half-written site and a failed job never touches the live one.
import { mkdir, readdir, rename, rm, stat, symlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const JOB_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The release directory for a job, refusing anything that would land outside `root`. */
export function releaseDirFor(root: string, slug: string, jobId: string): string {
  if (!SLUG_RE.test(slug) || !JOB_RE.test(jobId)) throw new Error('Invalid slug or job id');
  const dir = resolve(root, slug, 'releases', jobId);
  const rel = relative(resolve(root), dir);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Release path escapes the publish root');
  return dir;
}

/** Points `<slug>/current` at the release, atomically. */
export async function switchCurrent(releaseDir: string): Promise<void> {
  const siteDir = dirname(dirname(releaseDir));
  const tmp = join(siteDir, `.current-${process.pid}-${Date.now()}`);
  await symlink(join('releases', releaseDir.split('/').pop()!), tmp);
  await rename(tmp, join(siteDir, 'current'));
}

/** Keeps the newest `keep` releases (by modification time), always including `except`. */
export async function pruneReleases(siteDir: string, except: string, keep = 3): Promise<string[]> {
  const base = join(siteDir, 'releases');
  const names = await readdir(base).catch(() => [] as string[]);
  const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await stat(join(base, n))).mtimeMs })));
  const old = withTime.sort((a, b) => b.t - a.t).map((x) => x.n).filter((n) => n !== except.split('/').pop()).slice(keep - 1);
  for (const n of old) await rm(join(base, n), { recursive: true, force: true });
  return old;
}

export async function prepareReleaseDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
