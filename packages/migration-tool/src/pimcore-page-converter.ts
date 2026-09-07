import { resolveMediaUrl, type PimcoreEditableElement, type PimcoreAreablockBrickInstance, type PimcoreRawDocument } from './pimcore-document-converter.js';

/**
 * Retargets Pimcore document import at apps/whoobe-one-spike's own
 * `Element` tree (ElementsClass.js) instead of `WhoobeBlockNode`/
 * `cms_documents` - see docs/plans/cms/whoobe-one-editor-integration-
 * plan.md §3 (Phase 2). `PimcoreDocumentConverter` (pimcore-document-
 * converter.ts) is untouched, not replaced in place - it's left exactly
 * as it was, dormant once cli.ts stops calling it, the same "leave the
 * old thing in place rather than delete it" treatment this monorepo
 * already gives whoobe_one_templates/DatabaseClass.js/BlocksClass.js.
 *
 * Deliberately NOT importing apps/whoobe-one-spike/src/scripts/
 * ElementsClass.js directly - that's a frontend Vite app's own internal
 * module, not something this backend/CLI package should depend on (same
 * reasoning whoobe-pages-schema.ts's own `content: jsonb` stays untyped
 * for). This file hand-constructs plain objects that structurally match
 * what `Element` produces instead - genuinely just data, not behavior,
 * so there's nothing lost by not importing the class itself.
 *
 * Only the *generic* editable types (wysiwyg/input/textarea/image/video)
 * and the Areablock/Areabrick *scaffolding* (registry + generic fallback)
 * are converted here - both are real, reusable infrastructure. `href`/
 * `multihref`/`snippet` editables and any *specific* Areabrick mapping
 * (see element-areabrick-mappings/) are each their own, separate,
 * business-specific concern:
 *   - href/multihref (a Pimcore Data Object relation) has no home in
 *     `Element` yet at all - the integration plan's own §5 explicitly
 *     defers "data integration" as future, undesigned scope. Converted to
 *     a clearly-labeled placeholder node (preserving the raw target id)
 *     rather than either dropping the reference or inventing a fake
 *     binding shape to paper over a decision that hasn't been made yet.
 *   - snippet (a Pimcore *Document* snippet reference) is a different
 *     reusable-content concept from whoobe-one-spike's own "Snippet"
 *     (whoobe_one_snippets) - resolving one into the other is a real
 *     migration of its own, not attempted here. Same placeholder
 *     treatment.
 */
export interface WhoobeOneElementNode {
  id: string;
  type: string;
  tag: string;
  element: string;
  label?: string;
  icon?: string;
  css: { css: string; container: string };
  style?: string;
  content?: string;
  blocks: WhoobeOneElementNode[];
  editable?: boolean;
  image?: { url: string | null; alt?: string | null };
  link?: string;
  linkTarget?: string;
  src?: string;
  options?: { controls?: boolean; autoplay?: boolean; loop?: boolean };
  level?: number;
  // Real HTML tag a *container* renders as (BlockContainer.vue/BlockSlider
  // .vue's own `:is="semantic || 'div'"`) - see element-areabrick-mappings/
  // header-brick.ts's own comment for why this matters for a faithful
  // Areablock port specifically (the source's real markup uses <section>/
  // <aside>/<header>/<hgroup>, not generic <div>s).
  semantic?: string;
}

export interface PimcoreConvertedPage {
  title: string;
  slug: string;
  locale: string;
  content: WhoobeOneElementNode;
  pimcoreId: string;
}

export type ElementAreabrickConverter = (
  brickIndex: number,
  brick: PimcoreAreablockBrickInstance,
  s3Prefix: string
) => WhoobeOneElementNode | null;

const elementAreabrickRegistry = new Map<string, ElementAreabrickConverter>();

/** Element-targeting counterpart to registerAreabrickConverter (pimcore-
 * document-converter.ts) - a deliberately separate registry, not a shared
 * one keyed by output type, so a brick can be mapped for one pipeline
 * without silently having to also be mapped (or break) for the other. */
export function registerElementAreabrickConverter(brickType: string, converter: ElementAreabrickConverter): void {
  elementAreabrickRegistry.set(brickType, converter);
}

export function getRegisteredElementAreabrickTypes(): string[] {
  return [...elementAreabrickRegistry.keys()];
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function baseElement(overrides: Partial<WhoobeOneElementNode> & Pick<WhoobeOneElementNode, 'id'>): WhoobeOneElementNode {
  return {
    type: 'element',
    tag: 'element',
    element: 'div',
    css: { css: '', container: '' },
    blocks: [],
    ...overrides,
  };
}

/** A clearly-labeled placeholder, not a silent drop - same "preserve the
 * content, flag it as unresolved" philosophy convertUnmappedBrick already
 * uses for a brick type with no specific converter registered. */
function placeholderElement(id: string, message: string): WhoobeOneElementNode {
  return baseElement({
    id,
    element: 'p',
    css: { css: 'text-xs italic text-gray-400 border border-dashed border-gray-300 p-2 rounded', container: '' },
    content: message,
  });
}

// Real Pimcore schema finding from Phase 5's pilot against a live install
// (docs/plans/cms/whoobe-one-editor-integration-plan.md §8): `documents.path`
// is the PARENT's path, not this document's own - e.g. document 10
// (key: 'area-comunicazione') has `path: '/it/'`, and its own real URL is
// '/it/area-comunicazione/'. Both this converter and the old, now-inert
// `pimcore-document-converter.ts` originally used `pimcoreDoc.path` alone
// as the slug (copied from that file's own pre-existing logic, never
// caught before because `cms_documents` had no unique-slug constraint to
// surface it) - against a real multi-level site this collapsed every
// document under the same parent onto one identical, colliding slug.
function resolveDocumentSlug(path: string, key: string): string {
  const parent = path.replace(/\/+$/, '');
  if (!key) return parent || '/';
  return `${parent}/${key}/`;
}

export class PimcorePageConverter {
  public static convertDocument(pimcoreDoc: PimcoreRawDocument, s3BucketPrefix: string = ''): PimcoreConvertedPage {
    const root: WhoobeOneElementNode = baseElement({
      id: `whoobe_root_${pimcoreDoc.id}`,
      type: 'container',
      tag: 'document',
      css: { css: '', container: 'flex flex-col '}// gap-4 min-h-[600px] bg-white p-6' },
    });

    if (pimcoreDoc.elements) {
      for (const [elementName, element] of Object.entries(pimcoreDoc.elements)) {
        const node = this.convertEditableToElement(elementName, element, s3BucketPrefix);
        if (node) root.blocks.push(node);
      }
    }

    return {
      title: pimcoreDoc.title || pimcoreDoc.key || 'Migrated Page',
      slug: resolveDocumentSlug(pimcoreDoc.path, pimcoreDoc.key),
      locale: 'en',
      content: root,
      pimcoreId: String(pimcoreDoc.id),
    };
  }

  public static convertEditableToElement(
    name: string,
    element: PimcoreEditableElement,
    s3Prefix: string = ''
  ): WhoobeOneElementNode | null {
    const id = `whoobe_${name.replace(/[^a-zA-Z0-9_]/g, '_')}_${randomSuffix()}`;

    switch (element.type) {
      // `input` becomes a heading, matching pimcore-document-converter.ts's
      // own `element.type === 'input' ? 'h2' : 'div'` distinction - a
      // Pimcore "input" editable is conventionally a short title field,
      // `wysiwyg`/`textarea` are body copy.
      case 'input':
        return baseElement({
          id,
          element: 'h',
          level: 2,
          css: { css: 'my-4', container: '' },
          content: typeof element.data === 'string' ? element.data : element.data?.text || '',
          editable: true,
        });

      case 'wysiwyg':
      case 'textarea':
        return baseElement({
          id,
          element: 'p',
          css: { css: 'my-4 leading-relaxed', container: '' },
          content: typeof element.data === 'string' ? element.data : element.data?.text || '',
          editable: true,
        });

      case 'image': {
        // Raw path passed straight into resolveMediaUrl(), not pre-
        // stripped of its leading slash first - that function's own
        // contract (see its header comment) is to preserve the leading
        // slash verbatim whenever no s3Prefix is given, since that's what
        // resolve-display-url.ts (the frontend's own render-time resolver)
        // recognizes as a stable Pimcore-style reference.
        const imagePath = element.data?.path || element.data;
        const url = typeof imagePath === 'string' ? resolveMediaUrl(imagePath, s3Prefix) : null;
        return baseElement({
          id,
          element: 'img',
          css: { css: 'w-full h-auto rounded', container: '' },
          image: { url: url ?? null, alt: element.data?.alt || name },
        });
      }

      case 'video': {
        const videoPath = element.data?.path || element.data;
        const url = typeof videoPath === 'string' ? resolveMediaUrl(videoPath, s3Prefix) : null;
        return baseElement({
          id,
          type: 'video',
          element: 'video',
          src: url ?? '',
          options: { controls: true, autoplay: false, loop: false },
        });
      }

      // See this file's own header comment on why these two stay
      // placeholders rather than a real conversion.
      case 'href':
      case 'multihref': {
        const targetId = String(element.data?.id || element.data || '');
        return placeholderElement(id, `[Pimcore data object relation, not yet supported: ${targetId}]`);
      }

      case 'snippet': {
        const snippetId = element.data?.id || element.data;
        return placeholderElement(id, `[Pimcore document snippet, not yet migrated: ${snippetId}]`);
      }

      case 'areablock': {
        const blocks: WhoobeOneElementNode[] = [];
        if (Array.isArray(element.data)) {
          element.data.forEach((subItem: any, index: number) => {
            if (subItem && typeof subItem === 'object' && typeof subItem.brickType === 'string' && subItem.fields) {
              const brickNode = this.convertAreablockBrickToElement(index, subItem as PimcoreAreablockBrickInstance, s3Prefix);
              if (brickNode) blocks.push(brickNode);
              return;
            }
            if (subItem?.type && subItem?.data !== undefined) {
              const subNode = this.convertEditableToElement(`${name}_${subItem.type}`, subItem, s3Prefix);
              if (subNode) blocks.push(subNode);
            }
          });
        }

        return baseElement({
          id,
          type: 'container',
          tag: 'flex',
          css: { css: '', container: 'flex flex-col gap-6 py-6' },
          blocks,
        });
      }

      default:
        return null;
    }
  }

  public static convertAreablockBrickToElement(
    brickIndex: number,
    brick: PimcoreAreablockBrickInstance,
    s3Prefix: string = ''
  ): WhoobeOneElementNode | null {
    const converter = elementAreabrickRegistry.get(brick.brickType);
    if (converter) return converter(brickIndex, brick, s3Prefix);
    return this.convertUnmappedBrickToElement(brickIndex, brick, s3Prefix);
  }

  private static convertUnmappedBrickToElement(
    brickIndex: number,
    brick: PimcoreAreablockBrickInstance,
    s3Prefix: string
  ): WhoobeOneElementNode {
    const id = `whoobe_brick_${brick.brickType.replace(/[^a-zA-Z0-9_]/g, '_')}_${brickIndex}_${randomSuffix()}`;

    const blocks: WhoobeOneElementNode[] = [];
    for (const [fieldName, fieldElement] of Object.entries(brick.fields)) {
      const fieldNode = this.convertEditableToElement(fieldName, fieldElement, s3Prefix);
      if (fieldNode) blocks.push(fieldNode);
    }

    return baseElement({
      id,
      type: 'container',
      tag: 'flex',
      css: { css: 'border border-dashed border-amber-400 p-4 rounded', container: 'flex flex-col gap-2' },
      blocks,
    });
  }
}
