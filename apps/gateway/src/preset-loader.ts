import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GatewayPreset } from './preset-types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUILTIN_PRESETS_DIR = resolve(__dirname, '..', 'presets');

/** Loads every `*.json` vendor preset from apps/gateway/presets/ (+ an
 *  optional second directory, same GATEWAY_PRESETS_PATH convention as
 *  plugin-loader.ts's GATEWAY_PLUGINS_PATH) - plain data, no code execution,
 *  unlike loadPlugins(). A malformed file is skipped rather than failing
 *  gateway startup entirely - one bad vendor file shouldn't take down every
 *  other preset (or the gateway) with it. */
export function loadPresets(extraPath?: string): GatewayPreset[] {
  const presets: GatewayPreset[] = [];
  const dirs = [BUILTIN_PRESETS_DIR];
  if (extraPath) dirs.push(resolve(extraPath));

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const fullPath = join(dir, entry);
      try {
        if (!statSync(fullPath).isFile()) continue;
        const preset = JSON.parse(readFileSync(fullPath, 'utf-8')) as GatewayPreset;
        if (!preset || !preset.id || !preset.label) continue;
        presets.push(preset);
      } catch {
        continue;
      }
    }
  }
  return presets;
}
