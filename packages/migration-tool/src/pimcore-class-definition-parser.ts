import type { ClassFieldDefinition } from '@whoobe-cms/core';

/**
 * Parses a real Pimcore `var/classes/definition_<Name>.php` file into
 * `ClassFieldDefinition[]` - see docs/plans/datamodel/advanced-data-
 * modeling-plan.md §5.1/§8 Phase 3. Two real, distinct sources inside one
 * file, deliberately not blended into one generic PHP-literal parser:
 *
 * 1. The `Fields Summary` doc-comment at the top of the file - a
 *    human-readable name/fieldtype/nesting census Pimcore itself
 *    generates. Cheap, reliable, and enough on its own for the dynamic
 *    form/validator's core needs (name, fieldType, localized, block
 *    nesting) - parsed by `parseFieldsSummary` below.
 * 2. The full `ClassDefinition::__set_state(array(...))` PHP-literal tree
 *    below it, for the two things the summary doesn't carry:
 *    `mandatory` and a relation-flavored field's target class. Real
 *    Pimcore field definitions don't serialize properties in a
 *    consistent order (`classes`/`optionsProviderClass` can appear
 *    *before or after* `'name' => '...'` depending on field type/version -
 *    confirmed directly against this install's own files, not assumed),
 *    so this is a **bounded, windowed heuristic** - the text strictly
 *    between one field's own `'name' => '...'` occurrence and its
 *    immediate neighbors' - not a real PHP parser. Good enough for this
 *    real install's actual field definitions; a field targeting more
 *    than one class only gets the first, and a genuinely pathological
 *    layout could bleed between neighbors - stated here rather than
 *    quietly assumed away.
 */

interface SummaryNode {
  name: string;
  fieldType: string;
  depth: number;
  children: SummaryNode[];
}

function parseFieldsSummaryLines(source: string): SummaryNode[] {
  const summaryStart = source.indexOf('Fields Summary:');
  if (summaryStart === -1) return [];
  const summaryEnd = source.indexOf('*/', summaryStart);
  const block = source.slice(summaryStart, summaryEnd === -1 ? undefined : summaryEnd);

  const lineRe = /^(-+)\s+(\S+)\s+\[(\S+)\]\s*$/;
  const roots: SummaryNode[] = [];
  const stack: SummaryNode[] = [];

  for (const rawLine of block.split('\n')) {
    // the real files prefix every comment line with ` * ` (the hand-built test fixture does not)
    const match = rawLine.trim().replace(/^\*\s?/, '').match(lineRe);
    if (!match) continue;
    const depth = match[1].length;
    const node: SummaryNode = { name: match[2], fieldType: match[3], depth, children: [] };

    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

/** Hoists `localizedfields`' children to top-level (`localized: true`) -
 * `localizedfields` itself is a Pimcore container, not a real attribute. */
function flattenSummaryTree(nodes: SummaryNode[], localized = false): ClassFieldDefinition[] {
  const fields: ClassFieldDefinition[] = [];
  for (const node of nodes) {
    if (node.fieldType === 'localizedfields') {
      fields.push(...flattenSummaryTree(node.children, true));
      continue;
    }
    const field: ClassFieldDefinition = { name: node.name, title: node.name, fieldType: node.fieldType, localized: localized || undefined };
    if (node.fieldType === 'block' && node.children.length) {
      field.blockFields = flattenSummaryTree(node.children);
    }
    fields.push(field);
  }
  return fields;
}

const SET_STATE_OPEN_RE = /Pimcore\\Model\\DataObject\\ClassDefinition\\Data\\\w+::__set_state\(array\(/g;
const NAME_RE = /'name'\s*=>\s*'([^']*)'/;
const MANDATORY_RE = /'mandatory'\s*=>\s*true/;
const OPTIONS_PROVIDER_RE = /'optionsProviderClass'\s*=>\s*'[^']*[\\/]([A-Za-z0-9_]+)OptionsProvider'/;
const CLASSES_RE = /'classes'\s*=>\s*\n?\s*array\s*\(\s*\n?\s*0\s*=>\s*\n?\s*array\s*\(\s*\n?\s*'classes'\s*=>\s*'([A-Za-z0-9_]+)'/;

/** Finds the index of the `)` balancing the `(` at `openIndex`, skipping
 * over single-quoted PHP string contents (including `\'` escapes) so a
 * paren inside a title/tooltip string doesn't miscount. */
function findMatchingParenClose(source: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip the escaped character entirely (e.g. \')
        continue;
      }
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") {
      inString = true;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Maps each field name to its OWN bounded `::__set_state(array(...))`
 * text - found via real balanced-paren scanning (see the file header
 * comment for why a naive "between two 'name' occurrences" window isn't
 * reliable: `optionsProviderClass`/`classes` can land closer to a
 * *neighboring* field's name than to their own). Nested blocks (a
 * `block`/`localizedfields` wrapper's own children) are matched via this
 * same global scan too, each getting their own precise bounds - a
 * wrapper's own bounds happen to also contain its children's text, but
 * wrappers never carry `mandatory`/`optionsProviderClass`/`classes`
 * themselves in practice, so that's harmless for this function's purpose. */
function findFieldBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  let match: RegExpExecArray | null;
  SET_STATE_OPEN_RE.lastIndex = 0;
  while ((match = SET_STATE_OPEN_RE.exec(source))) {
    const openIndex = match.index + match[0].length - 1; // the '(' right after 'array'
    const closeIndex = findMatchingParenClose(source, openIndex);
    if (closeIndex === -1) continue;
    const blockText = source.slice(openIndex, closeIndex + 1);
    // The block's own direct `'name'` always appears before any nested
    // child block's - a wrapper's own properties are serialized before
    // its `'childs' => array(...)` content in every real file checked.
    const nameMatch = NAME_RE.exec(blockText);
    if (nameMatch && !blocks.has(nameMatch[1])) blocks.set(nameMatch[1], blockText);
  }
  return blocks;
}

/** Enriches an already-flattened field list with `mandatory`/
 * `relationTarget`, using each field's own precisely-bounded block. */
function enrichWithFullDefinition(fields: ClassFieldDefinition[], source: string): ClassFieldDefinition[] {
  const blocksByName = findFieldBlocks(source);

  function enrichOne(field: ClassFieldDefinition): ClassFieldDefinition {
    const block = blocksByName.get(field.name) ?? '';
    const enriched: ClassFieldDefinition = { ...field };
    if (MANDATORY_RE.test(block)) enriched.mandatory = true;

    const optionsProvider = OPTIONS_PROVIDER_RE.exec(block);
    const classesMatch = CLASSES_RE.exec(block);
    if (optionsProvider) enriched.relationTarget = optionsProvider[1];
    else if (classesMatch) enriched.relationTarget = classesMatch[1];

    if (enriched.blockFields) enriched.blockFields = enriched.blockFields.map(enrichOne);
    return enriched;
  }

  return fields.map(enrichOne);
}

export function parsePimcoreClassDefinitionFile(source: string): ClassFieldDefinition[] {
  const summaryTree = parseFieldsSummaryLines(source);
  const fields = flattenSummaryTree(summaryTree);
  return enrichWithFullDefinition(fields, source);
}

// The class's own `'id'` (a number in old Pimcore, a string such as 'CAR' in Pimcore 10/11) followed by its `'name'`, within the first
// properties of the outer ClassDefinition (a bounded window, so a nested field's own id/name is never taken). Properties before the id can
// have any value (a description with commas, a multi-line array), so the window is not limited to simple `'key' => value,` pairs.
const CLASS_META_RE = /ClassDefinition::__set_state\(\s*array\s*\(\s*[\s\S]{0,600}?'id'\s*=>\s*(?:'([^']+)'|"([^"]+)"|(\d+))\s*,\s*'name'\s*=>\s*(?:'([A-Za-z0-9_]+)'|"([A-Za-z0-9_]+)")/;

/** The class's own real Pimcore id/name - always near the very top of the
 * file (the outer `ClassDefinition::__set_state`, not a nested field's
 * own `Data\X::__set_state`), so a bounded regex against the file's head
 * is reliable without needing the same balanced-paren machinery the
 * per-field enrichment above does. */
export function parsePimcoreClassMeta(source: string): { id: string; name: string } | null {
  const match = CLASS_META_RE.exec(source);
  return match ? { id: match[1] ?? match[2] ?? match[3], name: match[4] ?? match[5] } : null;
}

const ALLOWED_TYPES_RE = /'allowedTypes'\s*=>\s*\n?\s*array\s*\(([^)]*)\)/;
const ALLOWED_TYPE_ENTRY_RE = /'([A-Za-z0-9_]+)'/g;

/**
 * A `fieldcollections` field's own allowed collection type names (e.g.
 * Product's real `content` field: `['ProductVideoSlider', 'ProductSlider',
 * 'ProductBanner', ...]`) - confirmed stored as a plain `'allowedTypes' =>
 * array(0 => 'X', 1 => 'Y', ...)` list (§6, Phase 6), a simpler shape than
 * the nested `'classes' => array(0 => array('classes' => 'X'))` an object
 * relation field uses. Uses the same bounded-block scanner as `mandatory`/
 * `relationTarget` above, for the same reason (this property can land
 * before or after the field's own `'name'`).
 */
export function parseAllowedTypes(source: string, fieldName: string): string[] {
  const block = findFieldBlocks(source).get(fieldName);
  if (!block) return [];
  const match = ALLOWED_TYPES_RE.exec(block);
  if (!match) return [];
  const names: string[] = [];
  let entryMatch: RegExpExecArray | null;
  ALLOWED_TYPE_ENTRY_RE.lastIndex = 0;
  while ((entryMatch = ALLOWED_TYPE_ENTRY_RE.exec(match[1]))) names.push(entryMatch[1]);
  return names;
}

/**
 * Parses a Field Collection *type's own* definition file (`var/classes/
 * DataObject/Fieldcollection/Data/<Type>.php`, e.g. `ProductBanner.php`) -
 * a genuinely different file format than a class definition (§6, Phase
 * 6): a real, generated PHP class (getters/setters), not a
 * `ClassDefinition::__set_state(array(...))` structure at all. It carries
 * the identical `Fields Summary` doc-comment class definitions do (reused
 * directly here), but there's no `__set_state()` tree to enrich from -
 * fields from a Field Collection type never get `mandatory`/
 * `relationTarget` populated. Stated here as a real, checked limitation
 * (confirmed by reading a real file, not assumed), not silently patched
 * over by pretending this file format has data it doesn't.
 */
export function parseFieldCollectionTypeFile(source: string): ClassFieldDefinition[] {
  return flattenSummaryTree(parseFieldsSummaryLines(source));
}
