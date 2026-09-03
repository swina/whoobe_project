export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface Vector2D {
  x: number
  y: number
}

export interface TransformMatrix {
  [0]: [number, number, number]
  [1]: [number, number, number]
}

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export interface RGB {
  r: number
  g: number
  b: number
}

export interface ColorStop {
  position: number
  color: RGBA
}

export interface BasePaint {
  visible?: boolean
  opacity?: number
  blendMode?: string
}

export interface SolidPaint extends BasePaint {
  type: 'SOLID'
  color: RGB
  opacity: number
}

export interface GradientPaint extends BasePaint {
  type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND'
  gradientHandlePositions: Vector2D[]
  gradientStops: ColorStop[]
}

export interface ImagePaint extends BasePaint {
  type: 'IMAGE'
  scaleMode: 'FILL' | 'FIT' | 'TILE' | 'STRETCH'
  imageRef: string
  imageTransform?: TransformMatrix
  scalingFactor?: number
  rotation?: number
  filters?: Record<string, unknown>
}

export type Paint = SolidPaint | GradientPaint | ImagePaint

export interface Effect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR' | 'PROGRESSIVE_BLUR'
  visible?: boolean
  radius?: number
  color?: RGBA
  offset?: Vector2D
  spread?: number
  blendMode?: string
}

export interface LayoutConstraint {
  vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE'
  horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE'
}

export interface LayoutGrid {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID'
  gutterSize?: number
  alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER'
  count?: number
  offset?: number
  sectionSize?: number
  visible?: boolean
  color?: RGBA
}

export interface TypeStyle {
  fontFamily: string
  fontPostScriptName: string | null
  fontStyle?: string
  italic?: boolean
  fontWeight: number
  fontSize: number
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED'
  textAlignHorizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFIED'
  textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM'
  letterSpacing: number
  lineHeightPx: number | null
  lineHeightPercentFontSize?: number | null
  lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%'
  fills?: Paint[]
  hyperlink?: { type: 'URL' | 'NODE'; url: string } | null
  textDecoration?: 'NONE' | 'STRIKETHROUGH' | 'UNDERLINE'
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'
  paragraphSpacing?: number
  paragraphIndent?: number
  listSpacing?: number
  maxLines?: number
}

export interface ComponentMetadata {
  key: string
  name: string
  description?: string
  componentSetId?: string
  remote?: boolean
}

export interface StyleMetadata {
  key: string
  name: string
  description?: string
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'
  remote?: boolean
}

/* ---------- Node base traits ---------- */

export interface BaseNodeMixin {
  id: string
  name: string
  type: string
  visible: boolean
  locked: boolean
  rotation: number
  pluginData?: Record<string, string>
  sharedPluginData?: Record<string, string>
}

export interface LayoutMixin {
  absoluteBoundingBox: Rectangle | null
  absoluteRenderBounds?: Rectangle | null
  preserveRatio?: boolean
  constraints?: LayoutConstraint
  relativeTransform?: TransformMatrix
  layoutAlign?: 'INHERIT' | 'STRETCH' | 'MIN' | 'CENTER' | 'MAX'
  layoutGrow?: number
  layoutPositioning?: 'AUTO' | 'ABSOLUTE'
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL'
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL'
  minWidth?: number | null
  maxWidth?: number | null
  minHeight?: number | null
  maxHeight?: number | null
}

export interface FrameProperties {
  clipsContent?: boolean
  background?: Paint[]
  layoutGrids?: LayoutGrid[]
  overflowDirection?: 'NONE' | 'HORIZONTAL_SCROLLING' | 'VERTICAL_SCROLLING' | 'HORIZONTAL_AND_VERTICAL_SCROLLING'
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'
  primaryAxisSizingMode?: 'FIXED' | 'AUTO'
  counterAxisSizingMode?: 'FIXED' | 'AUTO'
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  itemSpacing?: number
  itemReverseZIndex?: boolean
  strokesIncludedInLayout?: boolean
  layoutWrap?: 'NO_WRAP' | 'WRAP'
  counterAxisSpacing?: number
  counterAxisAlignContent?: 'AUTO' | 'SPACE_BETWEEN'
}

export interface GeometryMixin {
  fills: Paint[]
  strokes?: Paint[]
  strokeWeight?: number
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER'
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND'
  strokeDashes?: number[]
  strokeCap?: string
  strokeMiterAngle?: number
  styles?: Record<string, string>
}

export interface CornerMixin {
  cornerRadius: number
  cornerSmoothing: number
  rectangleCornerRadii: [number, number, number, number]
}

export interface BlendMixin {
  blendMode: string
  opacity: number
}

export interface EffectMixin {
  effects: Effect[]
}

export interface ChildrenMixin {
  children: FigmaNode[]
}

export interface IndividualStrokesMixin {
  individualStrokeWeights: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

/* ---------- Node types ---------- */

export interface DocumentNode extends BaseNodeMixin, ChildrenMixin {
  type: 'DOCUMENT'
  children: CanvasNode[]
}

export interface CanvasNode extends BaseNodeMixin, ChildrenMixin, BlendMixin {
  type: 'CANVAS'
  backgroundColor?: RGBA
  children: SubcanvasNode[]
  prototypeStartNode?: { nodeId: string; nodeType: 'DOCUMENT' | 'COMPONENT' | 'COMPONENT_SET' } | null
  exportSettings?: unknown[]
}

export type SubcanvasNode = FrameNode | GroupNode | TextNode | RectangleNode | EllipseNode | LineNode | VectorNode | RegularPolygonNode | StarNode | BooleanOperationNode | InstanceNode | ComponentNode | ComponentSetNode | SectionNode | SliceNode

export interface FrameNode extends BaseNodeMixin, LayoutMixin, FrameProperties, GeometryMixin, CornerMixin, BlendMixin, EffectMixin, ChildrenMixin, IndividualStrokesMixin {
  type: 'FRAME'
  children: SubcanvasNode[]
}

export interface GroupNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, CornerMixin, BlendMixin, EffectMixin, ChildrenMixin {
  type: 'GROUP'
  children: SubcanvasNode[]
}

export interface TextNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, BlendMixin, EffectMixin {
  type: 'TEXT'
  characters: string
  style: TypeStyle
  characterStyleOverrides?: number[]
  styleOverrideTable?: Record<string, TypeStyle>
  lineTypes?: ('NONE' | 'ORDERED' | 'UNORDERED')[]
  lineIndentations?: number[]
}

export interface RectangleNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, CornerMixin, BlendMixin, EffectMixin, IndividualStrokesMixin {
  type: 'RECTANGLE'
  children?: SubcanvasNode[]
}

export interface EllipseNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, CornerMixin, BlendMixin, EffectMixin {
  type: 'ELLIPSE'
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number }
}

export interface LineNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, BlendMixin, EffectMixin {
  type: 'LINE'
}

export interface VectorNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, CornerMixin, BlendMixin, EffectMixin {
  type: 'VECTOR'
  vectorNetwork?: unknown
  vectorPaths?: unknown
}

export interface StarNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, CornerMixin, BlendMixin, EffectMixin {
  type: 'STAR'
}

export interface RegularPolygonNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, CornerMixin, BlendMixin, EffectMixin {
  type: 'REGULAR_POLYGON'
}

export interface BooleanOperationNode extends BaseNodeMixin, LayoutMixin, GeometryMixin, BlendMixin, EffectMixin, ChildrenMixin {
  type: 'BOOLEAN_OPERATION'
  booleanOperation: 'UNION' | 'INTERSECT' | 'SUBTRACT' | 'EXCLUDE'
  children: SubcanvasNode[]
}

export interface InstanceNode extends BaseNodeMixin, LayoutMixin, FrameProperties, GeometryMixin, CornerMixin, BlendMixin, EffectMixin, ChildrenMixin, IndividualStrokesMixin {
  type: 'INSTANCE'
  componentId: string
  componentProperties?: Record<string, { type: string; value: unknown; preferredValues?: unknown[] }>
  children: SubcanvasNode[]
  isExposedInstance?: boolean
  exposedInstances?: unknown[]
}

export interface ComponentNode extends BaseNodeMixin, LayoutMixin, FrameProperties, GeometryMixin, CornerMixin, BlendMixin, EffectMixin, ChildrenMixin, IndividualStrokesMixin {
  type: 'COMPONENT'
  children: SubcanvasNode[]
  componentPropertyDefinitions?: Record<string, unknown>
}

export interface ComponentSetNode extends BaseNodeMixin, LayoutMixin, FrameProperties, GeometryMixin, CornerMixin, BlendMixin, EffectMixin, ChildrenMixin, IndividualStrokesMixin {
  type: 'COMPONENT_SET'
  children: (ComponentNode | InstanceNode)[]
  componentPropertyDefinitions?: Record<string, unknown>
}

export interface SectionNode extends BaseNodeMixin, LayoutMixin, BlendMixin, ChildrenMixin {
  type: 'SECTION'
  sectionContentsHidden?: boolean
  children: SubcanvasNode[]
}

export interface SliceNode extends BaseNodeMixin, LayoutMixin, BlendMixin {
  type: 'SLICE'
  exportSettings?: unknown[]
}

/* Union type for any Figma node */
export type FigmaNode = DocumentNode | CanvasNode | FrameNode | GroupNode | TextNode | RectangleNode | EllipseNode | LineNode | VectorNode | StarNode | RegularPolygonNode | BooleanOperationNode | InstanceNode | ComponentNode | ComponentSetNode | SectionNode | SliceNode | { type: string; id: string; name: string; [key: string]: unknown }

/* File API response */
export interface FigmaFileResponse {
  name: string
  role?: string
  lastModified: string
  editorType?: string
  thumbnailUrl?: string
  version?: string
  document: DocumentNode
  components?: Record<string, ComponentMetadata>
  componentSets?: Record<string, unknown>
  schemaVersion: number
  styles?: Record<string, StyleMetadata>
}

/* Nodes API response */
export interface FigmaNodesResponse {
  name: string
  role?: string
  lastModified: string
  editorType?: string
  thumbnailUrl?: string
  version?: string
  nodes: Record<string, {
    document: FigmaNode | null
    components?: Record<string, ComponentMetadata>
    componentSets?: Record<string, unknown>
    styles?: Record<string, StyleMetadata>
  }>
}

/* Images API response */
export interface FigmaImagesResponse {
  err: string | null
  images: Record<string, string | null>
}

/* Image fills API response */
export interface FigmaImageFillsResponse {
  error: boolean
  status: number
  meta: {
    images: Record<string, string>
  }
}

export const ALLOWED_AUTO_LAYOUT_VALUES = ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'] as const
export const ALLOWED_PRIMARY_ALIGN = ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] as const
export const ALLOWED_COUNTER_ALIGN = ['MIN', 'CENTER', 'MAX', 'BASELINE'] as const