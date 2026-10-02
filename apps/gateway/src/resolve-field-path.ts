// Dot-path (with optional `key[index]` array segments) getter against an
// arbitrary resolved JSON value. Shared by resolve-handler.ts (resolving a
// GatewayBinding.fieldPath against the raw upstream response) and
// gateway-result-filters.ts (resolving a filter's field against one item of
// an already-resolved array) - same walk, different root object.
// Own properties only: a path like `constructor.name` or `__proto__.x` must not walk the prototype chain.
function ownValue(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

export function resolveFieldPath(data: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      if (typeof current !== 'object') return undefined;
      const arr = ownValue(current as Record<string, unknown>, key);
      if (!Array.isArray(arr)) return undefined;
      current = arr[index];
    } else if (Array.isArray(current)) {
      return undefined;
    } else if (typeof current === 'object') {
      current = ownValue(current as Record<string, unknown>, part);
    } else {
      return undefined;
    }
  }

  return current;
}
