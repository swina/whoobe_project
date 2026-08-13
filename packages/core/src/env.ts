// Unified environment loading for the whole monorepo: reads the single
// repo-root .env (see docs/plans/environment/env-optimization.md) with
// ${VAR} expansion, then merges it into process.env WITHOUT overwriting
// anything already exported by the shell - exported vars win, which is
// how ./dev-cms.sh --hostname <name> overrides WHOOBE_HOSTNAME-derived
// values per run.
import { readFileSync } from 'node:fs';

const ROOT_ENV_URL = new URL('../../../.env', import.meta.url);

function parseEnv(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    key = key.replace(/^export\s+/, '');
    if (key) parsed[key] = value;
  }
  return parsed;
}

function expand(value: string, values: Record<string, string>): string {
  return value.replace(/\$\{(\w+)\}|\$(\w+)/g, (_m, braced: string | undefined, plain: string | undefined) => {
    const name = (braced ?? plain) as string;
    return values[name] ?? process.env[name] ?? '';
  });
}

/** Loads the repo-root .env (if present) into process.env, shell vars win. */
export function loadRootEnv(): void {
  try {
    const parsed = parseEnv(readFileSync(ROOT_ENV_URL, 'utf8'));
    const values = { ...parsed };
    for (let pass = 0; pass < 10; pass++) {
      let changed = false;
      for (const [key, value] of Object.entries(values)) {
        const expanded = expand(value, values);
        if (expanded !== value) {
          values[key] = expanded;
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const [key, value] of Object.entries(values)) {
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file present - fall back to whatever is already in process.env.
  }
}