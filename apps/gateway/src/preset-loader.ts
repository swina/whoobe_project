import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GatewayPreset } from './preset-types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUILTIN_PRESETS_DIR = resolve(__dirname, '..', 'presets');

function presetDirs(extraPath?: string): string[] {
  const dirs = [BUILTIN_PRESETS_DIR];
  if (extraPath) dirs.push(resolve(extraPath));
  return dirs;
}

/** Every `*.json` file of the directories, with its modification time and size: what a change shows up in. */
function listPresetFiles(dirs: string[]): { path: string; stamp: string }[] {
  const files: { path: string; stamp: string }[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const path = join(dir, entry);
      try {
        const st = statSync(path);
        if (st.isFile()) files.push({ path, stamp: `${st.mtimeMs}:${st.size}` });
      } catch {
        continue;
      }
    }
  }
  return files;
}

function readPresets(files: { path: string }[]): GatewayPreset[] {
  const byId = new Map<string, GatewayPreset>();
  for (const { path } of files) {
    try {
      const preset = JSON.parse(readFileSync(path, 'utf-8')) as GatewayPreset;
      if (!preset || !preset.id || !preset.label) continue;
      // a later directory (GATEWAY_PRESETS_PATH) replaces a built-in preset with the same id: that is how an
      // installation adapts one without touching the product's files
      byId.set(preset.id, preset);
    } catch {
      continue;
    }
  }
  return [...byId.values()];
}

/** Loads every `*.json` vendor preset from apps/gateway/presets/ (+ an
 *  optional second directory, same GATEWAY_PRESETS_PATH convention as
 *  plugin-loader.ts's GATEWAY_PLUGINS_PATH) - plain data, no code execution,
 *  unlike loadPlugins(). A malformed file is skipped rather than failing
 *  gateway startup entirely - one bad vendor file shouldn't take down every
 *  other preset (or the gateway) with it. */
export function loadPresets(extraPath?: string): GatewayPreset[] {
  return readPresets(listPresetFiles(presetDirs(extraPath)));
}

/** The presets as a function to call per request: the directories are looked at every time (one stat per file) and
 *  the files are read again only when one was added, removed or changed - so a preset dropped into the folder (or
 *  into GATEWAY_PRESETS_PATH, e.g. a mounted volume) shows up without restarting the gateway. Plugins are code and
 *  still need a restart; presets are data and do not. */
export function createPresetSource(extraPath?: string): () => GatewayPreset[] {
  const dirs = presetDirs(extraPath);
  let signature = '';
  let cached: GatewayPreset[] = [];
  return () => {
    const files = listPresetFiles(dirs);
    const next = files.map((f) => `${f.path}|${f.stamp}`).join('\n');
    if (next !== signature) {
      cached = readPresets(files);
      signature = next;
    }
    return cached;
  };
}
