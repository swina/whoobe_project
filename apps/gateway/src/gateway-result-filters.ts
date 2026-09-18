import { resolveFieldPath } from './resolve-field-path.js';

// Filters applied to an already-resolved GatewayBinding array result -
// there's no upstream "WHERE clause" equivalent for an arbitrary third-
// party REST API, so this runs client-of-the-upstream-side, once here in
// the gateway service, so every consumer (editor canvas, preview, and the
// headless SDK/published sites - all of which hit this same /resolve
// endpoint) gets identical filtering instead of three more independently-
// drifting copies (see resolveFieldFromRecord's history in this repo for
// what happens when the same logic gets duplicated per-consumer instead).
export interface GatewayResultFilter {
  /** Dot-path relative to one array item (e.g. "category", or "variant.color" -
   *  never prefixed with the container's own fieldPath). */
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt';
  value?: unknown;
}

/** Same operator semantics as data-resolver.ts's applyFilters (Data Object
 *  bindings) - 'eq'/'neq' are strict equality (a UI-typed string won't
 *  match a numeric field without 'gt'/'lt' or a matching string cast on the
 *  editor's side - an existing, accepted limitation there too, not a new
 *  one introduced here). All filters must match (AND), no OR support. */
export function applyResultFilters(items: unknown[], filters: GatewayResultFilter[]): unknown[] {
  if (!filters?.length) return items;
  return items.filter((item) =>
    filters.every((f) => {
      const value = resolveFieldPath(item, f.field);
      switch (f.operator) {
        case 'eq':
          return value === f.value;
        case 'neq':
          return value !== f.value;
        case 'in':
          return Array.isArray(f.value) ? f.value.includes(value) : String(value) === String(f.value);
        case 'contains':
          return String(value ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
        case 'gt':
          return Number(value) > Number(f.value);
        case 'lt':
          return Number(value) < Number(f.value);
        default:
          return true;
      }
    })
  );
}
