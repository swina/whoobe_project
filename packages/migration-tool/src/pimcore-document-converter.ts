import { WhoobeBlockNode, WhoobeDocumentLayout } from '@pimcore-custom/core';

export interface PimcoreEditableElement {
  name: string;
  type: 'areablock' | 'wysiwyg' | 'input' | 'textarea' | 'image' | 'video' | 'href' | 'multihref' | 'snippet';
  data: any;
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
        const fullUrl = s3Prefix ? `${s3Prefix.replace(/\/+$/, '')}/${s3Key}` : s3Key;

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
        return {
          id: blockId,
          type: 'media',
          name: name,
          tag: 'video',
          props: {
            src: videoPath,
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
          for (const subItem of element.data) {
            if (subItem.type && subItem.data) {
              const subBlock = this.convertEditableToBlockNode(
                `${name}_${subItem.type}`,
                subItem,
                s3Prefix
              );
              if (subBlock) children.push(subBlock);
            }
          }
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
}
