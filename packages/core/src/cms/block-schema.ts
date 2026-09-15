import { z } from 'zod';

export const WhoobeBlockTypeSchema = z.enum([
  'container',
  'grid',
  'typography',
  'media',
  'areablock',
  'widget',
  'snippet',
]);

export type WhoobeBlockType = z.infer<typeof WhoobeBlockTypeSchema>;

export interface WhoobeDataBinding {
  objectId?: string;
  field?: string;
  locale?: string;
}

export interface GatewayBinding {
  endpointName: string;
  routePath: string;
  fieldPath: string;
  params?: Record<string, string> | null;
}

export interface WhoobeBlockNode {
  id: string;
  type: WhoobeBlockType;
  name: string;
  tag?: string;
  style?: Record<string, string>;
  props?: Record<string, any>;
  content?: string;
  children?: WhoobeBlockNode[];
  dataBinding?: WhoobeDataBinding;
  gatewayBinding?: GatewayBinding;
}

export const WhoobeDataBindingSchema = z.object({
  objectId: z.string().optional(),
  field: z.string().optional(),
  locale: z.string().optional(),
});

export const WhoobeBlockNodeSchema: z.ZodType<WhoobeBlockNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: WhoobeBlockTypeSchema,
    name: z.string(),
    tag: z.string().optional(),
    style: z.record(z.string()).optional(),
    props: z.record(z.any()).optional(),
    content: z.string().optional(),
    children: z.array(WhoobeBlockNodeSchema).optional(),
    dataBinding: WhoobeDataBindingSchema.optional(),
    gatewayBinding: z.object({
      endpointName: z.string(),
      routePath: z.string(),
      fieldPath: z.string(),
      params: z.record(z.string()).optional().nullable(),
    }).optional(),
  })
);

export const WhoobeDocumentLayoutSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  locale: z.string().default('en'),
  rootBlock: WhoobeBlockNodeSchema,
  metadata: z.record(z.any()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type WhoobeDocumentLayout = z.infer<typeof WhoobeDocumentLayoutSchema>;

/**
 * Validate a raw JSON object against WhoobeDocumentLayoutSchema.
 */
export function validateWhoobeDocument(data: unknown): WhoobeDocumentLayout {
  return WhoobeDocumentLayoutSchema.parse(data);
}

/**
 * Create a new blank WhoobeDocumentLayout document tree.
 */
export function createEmptyWhoobeDocument(title: string = 'Untitled Document', slug: string = '/'): WhoobeDocumentLayout {
  const timestamp = new Date().toISOString();
  return {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    slug,
    locale: 'en',
    rootBlock: {
      id: `block_root_${Date.now()}`,
      type: 'container',
      name: 'Main Page Container',
      tag: 'main',
      style: {
        width: '100%',
        minHeight: '100vh',
        padding: '2rem 1rem',
      },
      children: [],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Pre-built Hero Banner block layout preset.
 */
export function createHeroBannerPreset(heading: string, subheading: string, imageSrc?: string): WhoobeBlockNode {
  return {
    id: `preset_hero_${Date.now()}`,
    type: 'container',
    name: 'Hero Banner Section',
    tag: 'section',
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      textAlign: 'center',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      borderRadius: '1rem',
    },
    children: [
      {
        id: `block_hero_title_${Date.now()}`,
        type: 'typography',
        name: 'Hero Title',
        tag: 'h1',
        content: heading,
        style: {
          fontSize: '2.5rem',
          fontWeight: '800',
          marginBottom: '1rem',
        },
      },
      {
        id: `block_hero_sub_${Date.now()}`,
        type: 'typography',
        name: 'Hero Subtitle',
        tag: 'p',
        content: subheading,
        style: {
          fontSize: '1.125rem',
          color: '#94a3b8',
          marginBottom: '2rem',
        },
      },
      ...(imageSrc
        ? [
            {
              id: `block_hero_img_${Date.now()}`,
              type: 'media' as WhoobeBlockType,
              name: 'Hero Image',
              tag: 'img',
              props: { src: imageSrc, alt: heading },
              style: { maxWidth: '100%', borderRadius: '0.75rem', marginTop: '1rem' },
            },
          ]
        : []),
    ],
  };
}

/**
 * Pre-built Feature Grid block layout preset.
 */
export function createFeatureGridPreset(features: Array<{ title: string; description: string }>): WhoobeBlockNode {
  return {
    id: `preset_grid_${Date.now()}`,
    type: 'grid',
    name: 'Feature Grid Section',
    tag: 'section',
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '1.5rem',
      padding: '2rem 0',
    },
    children: features.map((feat, idx): WhoobeBlockNode => ({
      id: `block_feat_${idx}_${Date.now()}`,
      type: 'container',
      name: `Feature Card ${idx + 1}`,
      tag: 'div',
      style: {
        padding: '1.5rem',
        backgroundColor: '#1e293b',
        borderRadius: '0.75rem',
        border: '1px solid #334155',
      },
      children: [
        {
          id: `block_feat_h_${idx}_${Date.now()}`,
          type: 'typography',
          name: 'Feature Title',
          tag: 'h3',
          content: feat.title,
          style: { fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem', color: '#818cf8' },
        },
        {
          id: `block_feat_p_${idx}_${Date.now()}`,
          type: 'typography',
          name: 'Feature Description',
          tag: 'p',
          content: feat.description,
          style: { fontSize: '0.875rem', color: '#cbd5e1' },
        },
      ],
    })),
  };
}
