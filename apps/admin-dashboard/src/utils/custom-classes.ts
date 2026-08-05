// Splits an admin-typed "custom classes" string (ClassSettingsCard.vue's
// View Layout tree - section containerClass and per-field className,
// docs/plans/UI/editing-object-class.md) into a real Tailwind class string
// plus a real inline-style object.
//
// Why this exists: Tailwind generates CSS by scanning source files for
// literal class-name strings at BUILD time. These values are admin-
// authored data fetched from the API at RUNTIME - Tailwind's build never
// sees them, so any class it hasn't otherwise compiled (e.g. a specific
// arbitrary value like "w-[640px]" or "bg-[#ff0000]") silently renders as
// nothing, with no error anywhere. Named, finite-value utilities (bg-
// slate-100, p-4, rounded-lg, grid-cols-2, ...) are handled by force-
// generating a broad, finite set via tailwind-safelist.ts - but genuinely
// arbitrary bracket values are inherently unbounded and can't be pre-
// generated for every possible value. For those, this converts the token
// to a real inline style property instead, which needs no build-time
// compilation and so always works regardless of what value was typed.
const ARBITRARY_VALUE_PATTERN = /^([a-z-]+)-\[(.+)\]$/;

// Unambiguous prefixes - always mean the same CSS property regardless of
// the value's shape.
const PROPERTY_BY_PREFIX: Record<string, string> = {
  w: 'width',
  h: 'height',
  'max-w': 'maxWidth',
  'min-w': 'minWidth',
  'max-h': 'maxHeight',
  'min-h': 'minHeight',
  p: 'padding',
  px: 'paddingInline',
  py: 'paddingBlock',
  pt: 'paddingTop',
  pr: 'paddingRight',
  pb: 'paddingBottom',
  pl: 'paddingLeft',
  m: 'margin',
  mx: 'marginInline',
  my: 'marginBlock',
  mt: 'marginTop',
  mr: 'marginRight',
  mb: 'marginBottom',
  ml: 'marginLeft',
  gap: 'gap',
  'gap-x': 'columnGap',
  'gap-y': 'rowGap',
  bg: 'backgroundColor',
  rounded: 'borderRadius',
  opacity: 'opacity',
};

// Ambiguous prefixes - Tailwind itself infers the property from the
// value's own shape when no explicit type hint is given (e.g.
// `text-[length:14px]` vs `text-[#bada55]`), and this does the same,
// simplified: a color-shaped value picks the color property, anything
// else falls back to the size/width property.
const AMBIGUOUS_PREFIXES: Record<string, { color: string; fallback: string }> = {
  text: { color: 'color', fallback: 'fontSize' },
  border: { color: 'borderColor', fallback: 'borderWidth' },
};

function looksLikeColor(value: string): boolean {
  return /^#|^rgba?\(|^hsla?\(|^oklch\(|^oklab\(|^color-mix\(/.test(value);
}

export interface ResolvedCustomClasses {
  class: string
  style: Record<string, string>
}

export function resolveCustomClasses(raw: string | undefined): ResolvedCustomClasses {
  const tokens = (raw ?? '').split(/\s+/).filter(Boolean);
  const classTokens: string[] = [];
  const style: Record<string, string> = {};

  for (const token of tokens) {
    const match = token.match(ARBITRARY_VALUE_PATTERN);
    if (!match) {
      classTokens.push(token);
      continue;
    }
    const [, prefix, rawValue] = match;
    // Tailwind's own arbitrary-value convention: underscores stand in for
    // spaces inside brackets (a literal space would break class-attribute
    // tokenization) - reversed here since this becomes a real CSS value,
    // not a class name.
    const value = rawValue.replace(/_/g, ' ');

    if (PROPERTY_BY_PREFIX[prefix]) {
      style[PROPERTY_BY_PREFIX[prefix]] = value;
    } else if (AMBIGUOUS_PREFIXES[prefix]) {
      const { color, fallback } = AMBIGUOUS_PREFIXES[prefix];
      style[looksLikeColor(value) ? color : fallback] = value;
    } else {
      // An arbitrary value for a utility this resolver doesn't know how
      // to map to a CSS property - left as a class rather than silently
      // dropped, same as any other unrecognized token; it just won't
      // render unless tailwind-safelist.ts (or coincidental elsewhere-
      // in-app usage) happens to cover it.
      classTokens.push(token);
    }
  }

  return { class: classTokens.join(' '), style };
}
