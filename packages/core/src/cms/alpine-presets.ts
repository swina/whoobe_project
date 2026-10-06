// Alpine presets: named sets of Alpine.js directives (for example the six `x-transition:*` attributes of a fade-and-
// scale effect) that an administrator defines once and applies to any element from the editor (Advanced > AlpineJS).
//
// A preset is applied by COPYING its directives into the element's own `alpine` map (see AlpineControl.vue), so every
// renderer (editor preview, public page, mobile app) keeps working from `element.alpine` alone and a stored page never
// depends on the catalog: deleting or renaming a preset cannot break a page. The catalog is installation-wide and lives
// in the first website's settings, like the other `/whoobe-one/settings/*` values.
//
// Directive VALUES are JavaScript expressions that Alpine runs on the published page. Writing the catalog needs the same
// permission as editing a page (`objects:write`), and an editor can already put any directive on any element, so the
// catalog grants no new power; what is validated here is shape and size, not meaning.

export interface AlpinePreset {
  /** Unique (case-insensitive), what the editor shows and the administrator types. */
  name: string;
  description: string;
  /** Directive name -> value, the same shape as `element.alpine`. */
  directives: Record<string, string>;
}

export const ALPINE_PRESET_LIMITS = {
  presets: 100,
  directivesPerPreset: 40,
  nameLength: 40,
  descriptionLength: 200,
  valueLength: 4000,
} as const;

// Letters, digits, space, dot, underscore, hyphen; starts with a letter or digit. No prototype-ish or markup characters.
const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

// An Alpine attribute: `x-name[:arg][.modifier...]`, or the `@event[.modifier]` / `:attr` shorthands. Anything else
// (including `on*` handlers, `style`, `__proto__`) is not a directive and is refused.
const DIRECTIVE = /^(?:x-[a-z][a-z0-9-]*(?::[A-Za-z0-9_-]+)*(?:\.[A-Za-z0-9_-]+)*|@[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*(?:\.[A-Za-z0-9_-]+)*|:[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)$/;

export type AlpinePresetsResult = { ok: true; presets: AlpinePreset[] } | { ok: false; error: string };

/** Validates a whole catalog (what PUT receives). The first problem found is reported, naming the preset. */
export function normalizeAlpinePresets(input: unknown): AlpinePresetsResult {
  if (!Array.isArray(input)) return { ok: false, error: 'presets must be an array' };
  if (input.length > ALPINE_PRESET_LIMITS.presets) return { ok: false, error: `at most ${ALPINE_PRESET_LIMITS.presets} presets` };

  const seen = new Set<string>();
  const presets: AlpinePreset[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'each preset must be an object' };
    const { name, description, directives } = raw as Record<string, unknown>;

    if (typeof name !== 'string') return { ok: false, error: 'preset name must be a string' };
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > ALPINE_PRESET_LIMITS.nameLength || !NAME.test(trimmed)) {
      return { ok: false, error: `invalid preset name "${name.slice(0, 50)}": 1-${ALPINE_PRESET_LIMITS.nameLength} characters, letters, digits, space . _ -` };
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `duplicate preset name "${trimmed}"` };
    seen.add(key);

    if (description !== undefined && typeof description !== 'string') return { ok: false, error: `preset "${trimmed}": description must be a string` };
    const desc = (description ?? '') as string;
    if (desc.length > ALPINE_PRESET_LIMITS.descriptionLength) return { ok: false, error: `preset "${trimmed}": description is longer than ${ALPINE_PRESET_LIMITS.descriptionLength} characters` };

    if (!directives || typeof directives !== 'object' || Array.isArray(directives)) return { ok: false, error: `preset "${trimmed}": directives must be an object` };
    const entries = Object.entries(directives as Record<string, unknown>);
    if (entries.length === 0) return { ok: false, error: `preset "${trimmed}": at least one directive is required` };
    if (entries.length > ALPINE_PRESET_LIMITS.directivesPerPreset) return { ok: false, error: `preset "${trimmed}": at most ${ALPINE_PRESET_LIMITS.directivesPerPreset} directives` };

    // null-prototype object: a directive can never be `__proto__`, and the stored JSON stays a plain object
    const clean: Record<string, string> = Object.create(null);
    for (const [dName, dValue] of entries) {
      if (!DIRECTIVE.test(dName)) return { ok: false, error: `preset "${trimmed}": "${dName.slice(0, 60)}" is not an Alpine directive (x-..., @event or :attribute)` };
      if (typeof dValue !== 'string') return { ok: false, error: `preset "${trimmed}": the value of "${dName}" must be a string` };
      if (dValue.length > ALPINE_PRESET_LIMITS.valueLength) return { ok: false, error: `preset "${trimmed}": the value of "${dName}" is longer than ${ALPINE_PRESET_LIMITS.valueLength} characters` };
      clean[dName] = dValue;
    }
    presets.push({ name: trimmed, description: desc, directives: { ...clean } });
  }
  return { ok: true, presets };
}

/** Reads what is stored, leniently: anything that does not validate yields an empty catalog instead of an error. */
export function readAlpinePresets(stored: unknown): AlpinePreset[] {
  const result = normalizeAlpinePresets(stored);
  return result.ok ? result.presets : [];
}
