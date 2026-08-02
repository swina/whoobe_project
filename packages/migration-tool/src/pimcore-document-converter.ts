import { WhoobeBlockNode, WhoobeDocumentLayout } from '@pimcore-custom/core';

export interface PimcoreEditableElement {
  name: string;
  type: 'areablock' | 'wysiwyg' | 'input' | 'textarea' | 'image' | 'video' | 'href' | 'multihref' | 'snippet';
  data: any;
}

/**
 * One placed Areabrick instance inside an Areablock: a named brick type
 * (e.g. "herobanner", instance-specific - there is no fixed enum, every
 * Pimcore installation defines its own) plus its own typed sub-fields,
 * each already a normalized PimcoreEditableElement. Distinct from a bare
 * PimcoreEditableElement because a brick is a *template* with several
 * fields, not a single value - see registerAreabrickConverter below.
 */
export interface PimcoreAreablockBrickInstance {
  brickType: string;
  fields: Record<string, PimcoreEditableElement>;
}

export type AreabrickConverter = (
  brickIndex: number,
  brick: PimcoreAreablockBrickInstance,
  s3Prefix: string
) => WhoobeBlockNode | null;

const areabrickRegistry = new Map<string, AreabrickConverter>();

/**
 * Registers how a specific Areabrick type (as it exists in one particular
 * Pimcore installation) becomes a WhoobeBlockNode. There is no fixed list
 * of brick types to support up front - every installation defines its own
 * Areabricks with its own fields, discovered by inspecting real content
 * (see docs/plans/cms/pimcore-areablock-import-plan.md, Phase 0). Bricks
 * with no registered converter still convert, via convertUnmappedBrick's
 * generic fallback, so importing never silently drops content while a
 * brick's specific mapping is still being written.
 */
export function registerAreabrickConverter(brickType: string, converter: AreabrickConverter): void {
  areabrickRegistry.set(brickType, converter);
}

export function getRegisteredAreabrickTypes(): string[] {
  return [...areabrickRegistry.keys()];
}

/**
 * Builds a full URL from a resolved asset path, prefixing with s3Prefix if
 * given. Shared by the generic Image/Video editable conversion below and
 * by per-brick Areabrick converters (packages/migration-tool/src/
 * areabrick-mappings/) that build their own media references - e.g. a
 * background-image style, which the generic conversion has no case for.
 */
export function resolveMediaUrl(path: string, s3Prefix: string = ''): string {
  const cleanPath = path.replace(/^\/+/, '');
  return s3Prefix ? `${s3Prefix.replace(/\/+$/, '')}/${cleanPath}` : cleanPath;
}

export interface PimcoreRawDocument {
  id: number;
  parentId: number;
  type: 'page' | 'snippet' | 'folder' | 'link';
  key: string;
  path: string;
  title?: string;
  elements?: Record<string, PimcoreEditableElement>;
}

export class PimcoreDocumentConverter {
  /**
   * Convert legacy Pimcore serialized Document object to Whoobe Studio JSON Document Layout.
   */
  public static convertDocument(
    pimcoreDoc: PimcoreRawDocument,
    s3BucketPrefix: string = ''
  ): WhoobeDocumentLayout {
    const rootBlock: WhoobeBlockNode = {
      id: `block_root_${pimcoreDoc.id}`,
      type: 'container',
      name: pimcoreDoc.title || pimcoreDoc.key || 'Root Layout Container',
      tag: 'main',
      style: {
        width: '100%',
        minHeight: '100vh',
        padding: '2rem 1rem',
      },
      children: [],
    };

    if (pimcoreDoc.elements) {
      for (const [elementName, element] of Object.entries(pimcoreDoc.elements)) {
        const blockNode = this.convertEditableToBlockNode(elementName, element, s3BucketPrefix);
        if (blockNode) {
          rootBlock.children!.push(blockNode);
        }
      }
    }

    return {
      id: `doc_${pimcoreDoc.id}`,
      title: pimcoreDoc.title || pimcoreDoc.key || 'Migrated Page',
      slug: pimcoreDoc.path || `/${pimcoreDoc.key}`,
      locale: 'en',
      rootBlock,
      metadata: {
        pimcoreId: pimcoreDoc.id,
        pimcorePath: pimcoreDoc.path,
        migratedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Translate individual Pimcore editable (areablock, wysiwyg, image, href, etc.) into WhoobeBlockNode.
   */
  public static convertEditableToBlockNode(
    name: string,
    element: PimcoreEditableElement,
    s3Prefix: string = ''
  ): WhoobeBlockNode | null {
    const blockId = `block_${name.replace(/[^a-zA-Z0-9_]/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;

    switch (element.type) {
      case 'wysiwyg':
      case 'input':
      case 'textarea':
        return {
          id: blockId,
          type: 'typography',
          name: name,
          tag: element.type === 'input' ? 'h2' : 'div',
          content: typeof element.data === 'string' ? element.data : element.data?.text || '',
          style: {
            margin: '1rem 0',
            lineHeight: '1.6',
          },
        };

      case 'image': {
        const imagePath = element.data?.path || element.data;
        const s3Key = typeof imagePath === 'string' ? imagePath.replace(/^\/+/, '') : '';
        const fullUrl = resolveMediaUrl(s3Key, s3Prefix);

        return {
          id: blockId,
          type: 'media',
          name: name,
          tag: 'img',
          props: {
            src: fullUrl,
            alt: element.data?.alt || name,
            s3Key,
          },
          style: {
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '0.5rem',
          },
        };
      }

      case 'video': {
        const videoPath = element.data?.path || element.data;
        const fullUrl = typeof videoPath === 'string' ? resolveMediaUrl(videoPath, s3Prefix) : videoPath;
        return {
          id: blockId,
          type: 'media',
          name: name,
          tag: 'video',
          props: {
            src: fullUrl,
            controls: true,
          },
        };
      }

      case 'href':
      case 'multihref': {
        const targetId = String(element.data?.id || element.data || '');
        return {
          id: blockId,
          type: 'widget',
          name: name,
          dataBinding: {
            objectId: targetId,
            field: name,
          },
          props: {
            targetType: 'PimcoreDataObjectRelation',
            relationIds: Array.isArray(element.data) ? element.data : [targetId],
          },
        };
      }

      case 'snippet': {
        return {
          id: blockId,
          type: 'snippet',
          name: name,
          props: {
            snippetId: element.data?.id || element.data,
          },
        };
      }

      case 'areablock': {
        const children: WhoobeBlockNode[] = [];
        if (Array.isArray(element.data)) {
          element.data.forEach((subItem: any, index: number) => {
            // Real Areabrick instance: a named brick type with its own
            // typed field set (see PimcoreAreablockBrickInstance).
            if (subItem && typeof subItem === 'object' && typeof subItem.brickType === 'string' && subItem.fields) {
              const brickBlock = this.convertAreablockBrick(index, subItem as PimcoreAreablockBrickInstance, s3Prefix);
              if (brickBlock) children.push(brickBlock);
              return;
            }

            // Simpler shape: a bare editable placed directly in the area
            // (no brick grouping) - supported for callers that don't need
            // full Areabrick field semantics.
            if (subItem?.type && subItem?.data !== undefined) {
              const subBlock = this.convertEditableToBlockNode(`${name}_${subItem.type}`, subItem, s3Prefix);
              if (subBlock) children.push(subBlock);
            }
          });
        }

        return {
          id: blockId,
          type: 'areablock',
          name: name,
          tag: 'section',
          style: {
            display: 'grid',
            gap: '1.5rem',
            padding: '1.5rem 0',
          },
          children,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Converts one Areabrick instance to a WhoobeBlockNode via whatever
   * converter was registered for its brickType (registerAreabrickConverter
   * above). Unregistered brick types (nothing has been discovered/mapped
   * for them yet) fall back to a generic container of their raw fields
   * rather than dropping the content.
   */
  public static convertAreablockBrick(
    brickIndex: number,
    brick: PimcoreAreablockBrickInstance,
    s3Prefix: string = ''
  ): WhoobeBlockNode | null {
    const converter = areabrickRegistry.get(brick.brickType);
    if (converter) {
      return converter(brickIndex, brick, s3Prefix);
    }
    return this.convertUnmappedBrick(brickIndex, brick, s3Prefix);
  }

  private static convertUnmappedBrick(
    brickIndex: number,
    brick: PimcoreAreablockBrickInstance,
    s3Prefix: string
  ): WhoobeBlockNode {
    const blockId = `block_brick_${brick.brickType.replace(/[^a-zA-Z0-9_]/g, '_')}_${brickIndex}_${Math.random().toString(36).slice(2, 6)}`;

    const children: WhoobeBlockNode[] = [];
    for (const [fieldName, fieldElement] of Object.entries(brick.fields)) {
      const fieldBlock = this.convertEditableToBlockNode(fieldName, fieldElement, s3Prefix);
      if (fieldBlock) children.push(fieldBlock);
    }

    return {
      id: blockId,
      type: 'container',
      name: `Unmapped Brick: ${brick.brickType}`,
      tag: 'div',
      props: { unmappedBrickType: brick.brickType },
      style: {
        padding: '1rem',
        border: '1px dashed #f59e0b',
        borderRadius: '0.5rem',
      },
      children,
    };
  }
}
