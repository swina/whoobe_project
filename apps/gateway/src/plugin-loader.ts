import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';
import type { GatewayPlugin } from './plugin-types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUILTIN_PLUGINS_DIR = resolve(__dirname, '..', 'plugins');

export function loadPlugins(router: Router, extraPath?: string): GatewayPlugin[] {
  const plugins: GatewayPlugin[] = [];
  const dirs = [BUILTIN_PLUGINS_DIR];
  if (extraPath) dirs.push(resolve(extraPath));

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (!statSync(fullPath).isFile()) continue;
      if (!entry.endsWith('.ts') && !entry.endsWith('.js')) continue;
      if (entry.endsWith('.d.ts')) continue;
      try {
        const mod = require(fullPath) as { default?: GatewayPlugin };
        const plugin = mod.default;
        if (!plugin || !plugin.name) continue;
        plugin.routes?.(router);
        plugins.push(plugin);
      } catch {
        continue;
      }
    }
  }
  return plugins;
}