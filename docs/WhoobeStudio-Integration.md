# WHOOBE STUDIO INTEGRATION PLAN & PIMCORE MIGRATION SUITE

Repository Reference: [Whoobe Studio Alpha](https://github.com/swina/whoobe-studio-alpha-0122)

---

## 1. Executive Summary & Architecture

**Whoobe Studio** is an open-source, visual block-driven page and layout builder written in **Vue.js 3**. In this headless CMS architecture, Whoobe Studio serves as the core **WYSIWYG Visual Block Editor** embedded directly inside the administrative interface (`apps/admin-dashboard`).

Rather than storing unstructured HTML or monolithic page blobs, Whoobe Studio produces standardized, typed **JSON Block Layout Trees**. These trees are validated at runtime using Zod schemas provided by `@pimcore-custom/core` and rendered headlessly across frontend frameworks (Next.js, Nuxt 3, or Astro).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          WHOOBE STUDIO INTEGRATION BRIDGE                        │
└─────────────────────────────────────────────────────────────────────────────────┘

 ┌───────────────────────────┐                        ┌───────────────────────────┐
 │   apps/admin-dashboard    │   postMessage Event    │    apps/whoobe-studio     │
 │    (React / Next.js)      │ ◄────────────────────► │     (Vue 3 / Vite)        │
 │                           │   Two-Way Sync Bridge  │                           │
 │ ┌───────────────────────┐ │                        │ ┌───────────────────────┐ │
 │ │ Document Storage      │ │                        │ │ Visual Canvas Editor  │ │
 │ │ DAM Asset Picker      │ │                        │ │ Block Inspector & CSS │ │
 │ │ PIM Data Object Linker│ │                        │ │ Drag-and-Drop Tree    │ │
 │ └───────────────────────┘ │                        │ └───────────────────────┘ │
 └─────────────┬─────────────┘                        └─────────────┬─────────────┘
               │                                                    │
               ▼                                                    ▼
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │                      @pimcore-custom/core (Zod JSON Schemas)                   │
 └────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │               @pimcore-custom/migration-tool (Pimcore ETL Engine)             │
 └────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Integration Bridge Architecture (Vue 3 $\leftrightarrow$ TypeScript Headless Engine)

Because `apps/admin-dashboard` is built with React/Next.js/TypeScript and `whoobe-studio` is built with Vue 3, a clean integration bridge connects them seamlessly:

### 2.1. Embedding Mechanism
- **iFrame & PostMessage Protocol**: Whoobe Studio runs as an isolated Vite application in `/apps/whoobe-studio`. The dashboard embeds it via an `iframe` with a zero-latency `postMessage` RPC bridge.
- **Event Bus Communication**:
  - `SYNC_DOCUMENT`: Dashboard feeds document layout JSON tree into Whoobe Studio on editor load.
  - `DOCUMENT_CHANGED`: Whoobe Studio streams debounced JSON tree updates back to dashboard.
  - `OPEN_DAM_PICKER`: Whoobe Studio requests asset selection from DAM store; dashboard opens DAM modal and returns chosen S3 asset URL & metadata.
  - `OPEN_PIM_LINKER`: Whoobe Studio requests PIM Data Object relation; dashboard opens product selector and returns linked object IDs.

### 2.2. Standardized JSON Block Layout Contract (`@pimcore-custom/core`)
All layout blocks conform to a strictly typed schema:

```typescript
export interface WhoobeBlockNode {
  id: string;
  type: 'container' | 'grid' | 'typography' | 'media' | 'areablock' | 'widget';
  name: string;
  tag?: string; // e.g. section, article, div, h1, p
  style?: Record<string, string>; // Tailwind / CSS classes or inline styles
  props?: Record<string, any>; // Component props, alt text, link targets
  content?: string; // Text / HTML inner content
  children?: WhoobeBlockNode[]; // Nested block tree
  dataBinding?: {
    objectId?: string;
    field?: string;
    locale?: string;
  };
}
```

---

## 3. Functionalities & Capabilities

### 3.1. Visual Block & Element Engine
- **Drag-and-Drop Tree**: Reorder, nest, clone, and delete structural elements (Sections, Containers, Flex/Grid Rows, Columns, Cards, Modals).
- **TailwindCSS Visual Styling Inspector**: Live control panel for typography, background gradients, flexbox alignment, grid span, borders, box-shadows, and glassmorphism.
- **Micro-Animations & Transitions**: Configure hover states, entrance animations, and interactive transitions visually.

### 3.2. Dynamic Data Injection & PIM Binding
- **PIM Data Object Binding**: Bind block properties (e.g. heading, price tag, product image) directly to PostgreSQL PIM/MDM objects.
- **DAM Asset Integration**: Instant asset selection from S3/MinIO DAM with support for WebP/AVIF responsive variants (`thumb`, `medium`, `large`, `full_hd`).
- **Multi-Locale (i18n) Switching**: Switch active language in Whoobe Studio to visually edit localized text variants with fallback indicators.

---

## 4. Extra Features & Advanced Capabilities

### 4.1. Pimcore Areablock Equivalent (Whoobe Block Engine)
- **Custom Block Library**: Pre-built block components mimicking Pimcore Areablocks (Feature Grid, Hero Banner, Testimonial Carousel, Product Showcase, FAQ Accordion).
- **Reusable Block Snippets**: Save custom block subtrees as global templates that update automatically across all published pages when edited.

### 4.2. Universal Layout Renderer (`@pimcore-custom/whoobe-renderer`)
- Headless layout tree renderer supporting:
  - **Server-Side Rendering (SSR)** for Next.js and Nuxt 3.
  - **Static Site Generation (SSG)** producing zero-JS lightweight HTML/CSS bundles.
  - **Vue 3 & React Native Wrappers** for multi-platform rendering.

---

## 5. Migration Suite: Pimcore Documents & Objects Model Integration

To ensure a loss-less, automated transition from legacy Pimcore instances, the migration suite inside `@pimcore-custom/migration-tool` translates Pimcore Document structures and Data Objects directly into Whoobe Studio JSON Block Trees.

```
┌─────────────────────────────────────────┐
│        PIMCORE MYSQL DATABASE           │
│ - documents_elements (areablock, etc.)  │
│ - documents_page / documents_snippet    │
│ - classes / objects                     │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│   @pimcore-custom/migration-tool        │
│   PimcoreDocumentConverter              │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│        WHOOBE STUDIO BLOCK TREE         │
│  Valid JSON layout tree stored in       │
│  PostgreSQL (Hybrid EAV + JSONB)        │
└─────────────────────────────────────────┘
```

### 5.1. Pimcore Editable $\rightarrow$ Whoobe Block Mapping Table

| Pimcore Editable Type | Legacy Pimcore Code | Whoobe Studio Block Target |
| :--- | :--- | :--- |
| **Areablock** | `pimcore_editable('areablock', 'content')` | `ContainerBlock` / `GridBlock` with child block tree |
| **WYSIWYG** | `pimcore_editable('wysiwyg', 'text')` | `TypographyBlock` (HTML rich content) |
| **Input / Textarea**| `pimcore_editable('input', 'headline')` | `TypographyBlock` (element tag: `h1`-`h6`, `p`) |
| **Image** | `pimcore_editable('image', 'banner')` | `MediaBlock` (S3/MinIO asset key + WebP variants) |
| **Video** | `pimcore_editable('video', 'intro')` | `MediaBlock` (HTML5 Video / MP4 S3 object key) |
| **Href / Relations** | `pimcore_editable('href', 'productLink')` | `DataObjectWidget` (Bound to PIM Object ID) |
| **Multihref** | `pimcore_editable('multihref', 'related')` | `DataObjectWidgetGroup` (Array of PIM Object IDs) |
| **Snippet** | `pimcore_editable('snippet', 'footer')` | Reusable Block Snippet Reference (`snippetId`) |

### 5.2. Pimcore Document Tree Migration Algorithm

The `PimcoreDocumentConverter` class in `@pimcore-custom/migration-tool` performs automated ETL:

1. **Document Tree Traversal**: Queries Pimcore `documents` hierarchy (`page`, `snippet`, `folder`, `link`, `hardlink`).
2. **Editable Parsing**: Reads `documents_elements` table to extract all serialized editables associated with each page ID.
3. **Areablock Re-assembly**: Reconstructs nested Pimcore Areablock structures into hierarchical `WhoobeBlockNode[]` trees.
4. **Asset & PIM Object Rewriting**: Converts Pimcore `/web/var/assets/...` paths into S3 object keys and updates Data Object relation IDs to match PostgreSQL primary keys.
5. **JSON Tree Persistence**: Writes finalized Whoobe Studio layout trees into PostgreSQL `cms_documents` table using Drizzle ORM.

---

## 6. Implementation Roadmap

- [x] **Phase 1: Core Storage & DAM Foundation**
- [x] **Phase 2: Image Processing Pipeline & Microservice**
- [x] **Phase 3: Deep Metadata & EXIF Extractor**
- [x] **Phase 4: Whoobe Studio JSON Block Schemas (`@pimcore-custom/core`)**
- [x] **Phase 5: Vue 3 $\leftrightarrow$ React iFrame PostMessage Bridge (`apps/whoobe-studio`)**
- [x] **Phase 6: Pimcore Document & Areablock Migration Engine (`@pimcore-custom/migration-tool`)**