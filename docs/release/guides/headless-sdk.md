# Headless SDK — Architecture & Usage

The **Whoobe Headless SDK** lets any frontend render Whoobe's visual page-builder output (the JSON element trees stored in `whoobe_pages.content`) with its **own** components — 100% headless, no Vue, no server-side coupling. The page builder generates a structured, Zod-validated JSON tree; the SDK consumes that tree and maps each node to a component in the consuming app's design system via a **component registry**.

Design doc: `docs/plans/cms/headless-sdk-plan.md`. Adapter plan: `docs/plans/cms/headless-sdk-svelte-vue-plan.md`.

## Packages

All packages live in `packages/sdk/*` and share the `@whoobe-cms/*` npm scope.

| Package | Role |
| --- | --- |
| `@whoobe-cms/schema` | The shared contract: element-tree TypeScript types, Zod runtime validators, and the field-transform engine (`applyTransform`, `escapeHtml`). |
| `@whoobe-cms/renderer` | The framework-agnostic core: a pure-TS tree-walker (`walkTree`) that turns a tree into serializable **RenderDescriptors**, resolving data bindings (via the public API), DAM image references, and list-to-detail links. Also ships the typed public-API client (`ApiClient`). |
| `@whoobe-cms/react` | React 18+ adapter: provider + recursive `<WhoobeNode>`/`<WhoobePage>` + hooks. |
| `@whoobe-cms/next` | Next.js helpers for App Router / RSC: `getPageData`/`getObjectData` (with ISR `revalidate`), `generateMetadataFromPage`, static-params helpers; re-exports the React adapter. |
| `@whoobe-cms/vue` | Vue 3 adapter: provider + recursive `<WhoobeNode>`/`<WhoobePage>` + composables. Plain `defineComponent`/`h()`, builds with `tsc`. |
| `@whoobe-cms/svelte` | Svelte 5 adapter: provider + `<WhoobeNode>`/`<WhoobePage>` + stores. Built with `svelte-package`. |

React/Next is the reference adapter; the Vue and Svelte adapters follow the exact same contract, so porting is mechanical.

## Architecture

```
                   ┌────────────────────────────────────────────┐
                   │  Whoobe backend (core-api, public API)     │
                   │  GET /public/pages/:locale/*               │
                   │  GET /public/data-objects/:id              │
                   │  POST /public/data-objects/query           │
                   │  GET /public/search                        │
                   │  POST /public/forms/:classId/submit        │
                   └────────────────────────────────────────────┘
                                        │ JSON element tree
                                        ▼
        ┌─────────────────── @whoobe-cms/schema ───────────────────┐
        │  WhoobeElementNode types + Zod validators + transforms   │
        └──────────────────────────────────────────────────────────┘
                                        │ validated tree
                                        ▼
        ┌────────────────── @whoobe-cms/renderer ──────────────────┐
        │  walkTree(node, ctx, options) → RenderDescriptor tree    │
        │  (kind/tag/className/style/content/image/link/children)  │
        │  + ApiClient (typed public API fetchers)                 │
        └──────────────────────────────────────────────────────────┘
                                        │ descriptors
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
         @whoobe-cms/react       @whoobe-cms/vue       @whoobe-cms/svelte
         <WhoobeProvider>        <WhoobeProvider>      <WhoobeProvider>
         <WhoobeNode/>           <WhoobeNode/>         <WhoobeNode/>
         <WhoobePage/>           <WhoobePage/>         <WhoobePage/>
         hooks                   composables           stores
              │
              │ server-only helpers (RSC / App Router)
              ▼
         @whoobe-cms/next
         getPageData / getObjectData (ISR revalidate)
         generateMetadataFromPage / staticParamsFor*
         → fetches + walks server-side, hands the descriptor
           to @whoobe-cms/react's <WhoobePage descriptor={...} />
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              node `kind` → component (registry → defaults)
                  Consuming app's design-system components
```

The pipeline has three layers:

1. **Contract** — `@whoobe-cms/schema` defines and validates the element-tree JSON the backend serves (a malformed tree fails loudly with a clear path).
2. **Core** — `@whoobe-cms/renderer` walks a validated tree into a serializable `RenderDescriptor` tree, resolving data bindings, DAM image references and per-record links against the public API. It never touches the DOM and produces no HTML.
3. **Adapters** — one per framework turn descriptors into components through the registry; `@whoobe-cms/next` adds server-side (RSC/ISR) fetch-and-walk helpers on top of the React adapter.

### The `RenderDescriptor`

The core renderer never produces HTML itself. It walks the tree and produces a **descriptor** per node — a plain, serializable object that an adapter turns into a component:

```ts
interface RenderDescriptor {
  id: string
  kind: string        // registry key, e.g. 'container' | 'heading' | 'image'
  tag: string         // resolved HTML tag, e.g. 'h2', 'p', 'div'
  node: WhoobeElementNode
  className: string   // css.css + css.container (+ valueMap transform class)
  style: string       // font-family (from `font`) + raw inline style
  attributes: Record<string, unknown>   // data.attributes (form fields, etc.)
  data: Record<string, unknown> | null
  content: string     // safe-to-inject HTML (bound values escaped)
  contentIsHtml: boolean
  image: { url: string; alt?: string | null } | null
  link: { href: string; target?: string; dynamic?: DynamicLinkBinding | null } | null
  headingLevel?: number
  children: RenderDescriptor[]
  formConfig: ElementFormConfig | null
  searchConfig: ElementSearchConfig | null
  slider: ElementSlider | null
  dataBinding: ElementDataBinding | null
  options: FieldOption[] | null   // select/radiogroup options
}
```

Because it's a plain object graph, it can cross an SSR boundary: walk once server-side, pass the descriptor to the client, hydrate from it.

### Node kinds (registry keys)

`normalizeKind()` in `@whoobe-cms/renderer` maps a raw node to its canonical kind, mirroring the editor's own node→component dispatch:

| kind | node shape |
| --- | --- |
| `container` | `type: 'container'` (grid/flex/section/nav/…) |
| `heading` | `element: 'h'` + `level` |
| `paragraph`, `span`, `blockquote`, `code` | `element: 'p'/'span'/'blockquote'/'pre'` |
| `image` | `element: 'img'` |
| `link` | `element: 'a'` or a node with `link`/`dynamicLink` |
| `form`, `input`, `textarea`, `select`, `radiogroup`, `submit`, `reset`, `button` | form family |
| `search` | `tag: 'search'` |
| `slider`, `youtube`, `vimeo`, `video`, `audio` | media (`audio` renders the plain browser player; the waveform look is editor/public-page only, see the [Audio element guide](audio-element.md)) |
| (Markdown element) | has no kind of its own: the public API converts its Markdown to HTML and sends an ordinary element, see the [Markdown element guide](markdown-element.md) |
| `icon` | `tag: 'lucideicon'` |

### The registry contract

Adapters accept a **registry**: `Record<kind, Component>`. Each registry component receives the `RenderDescriptor` (plus its resolved children — as VNodes in Vue, slots in Svelte, React nodes in React) and is responsible for rendering them. Missing kinds fall back to built-in defaults, so a page renders even with an empty registry.

```ts
// Vue
const registry = { paragraph: MyParagraph, image: MyImage }
// Svelte
const registry = { paragraph: MyParagraph, image: MyImage }
```

## Using the core (`@whoobe-cms/renderer`)

### Walking a tree

```ts
import { walkTree, ApiClient } from '@whoobe-cms/renderer'

const api = new ApiClient('https://cms.example.com')   // or your own RenderApi
const { page } = await api.getPage('it', '/contatti')

const descriptor = await walkTree(page.content, {}, {
  api,                                        // RenderApi (getObject/queryObjects)
  assetBaseUrl: 'https://cms.example.com/dam-asset', // DAM image proxy base
  resolveTargetPage: async (id) => ({ slug: '/it/news/{slug}', locale: 'it' }),
})
```

- **`walkTree(root, ctx, options)`** — validates the tree against `@whoobe-cms/schema` (throws a `ZodError` with a clear path on malformed input) and walks it.
- **`ctx`** — the in-scope data for *relative* bindings: `{ record?, form? }`. The walker sets `record` as it descends into bound containers (repeaters).
- **`options`**:
  - `api` — a `RenderApi` (implemented by `ApiClient`); used for `explicit`/`first`/`query` data bindings.
  - `assetBaseUrl` + `keyPrefix` — DAM path references (`/uploads/hero.jpg`) resolve to `${assetBaseUrl}/${key}`.
  - `resolveTargetPage` — resolves a `dynamicLink.targetPageId` to the target page's slug pattern + locale (list-to-detail links).

### Data bindings

`dataBinding` nodes resolve against the current record or the public API:

- **relative** (no `objectId`) — the field is read from the in-scope `ctx.record`/`ctx.form`.
- **`explicit`** — `GET /public/data-objects/:id`.
- **`first`** — `POST /public/data-objects/query`, first result.
- **`query`** — same endpoint; the container repeats its children **once per record** (a collection/repeater), each with that record in scope — so per-record dynamic links and field values resolve correctly.
- **`parent` / `currentPage`** — the record comes from the consumer-supplied context.

Field values are run through `applyTransform` (date/url/number/truncate/valueMap) and **escaped** before going into `content` (link transforms produce a sanitized `<a>`). Select/radiogroup options are passed through as `descriptor.options`.

### Public API client

```ts
const api = new ApiClient(baseUrl, fetchImpl?)   // fetch injectable (Node/browser/RSC)

await api.getPage(locale, path, websiteId?)      // → { page, params }
await api.getObject(id)                          // → object | null
await api.queryObjects({ class, filters?, orderBy?, offset?, limit?, locale? })
await api.search({ q, type?, class?, locale? })
await api.submitForm(classId, attributes, formConfig?)
```

## Using `@whoobe-cms/react`

Install: `pnpm add @whoobe-cms/react @whoobe-cms/renderer @whoobe-cms/schema` (peer: `react@>=18`).

```tsx
import { WhoobeProvider, WhoobePage } from '@whoobe-cms/react'
import { ApiClient } from '@whoobe-cms/renderer'

const api = new ApiClient('https://cms.example.com')

export default function ContactPage() {
  return (
    <WhoobeProvider api={api} assetBaseUrl="https://cms.example.com/dam-asset">
      <WhoobePage locale="it" path="/contatti" />
    </WhoobeProvider>
  )
}
```

### Mapping nodes to your design system

```tsx
// MyParagraph.tsx
import { WhoobeNode, type RenderDescriptor } from '@whoobe-cms/react'
import type { ReactNode } from 'react'

export function MyParagraph({ descriptor, children }: { descriptor: RenderDescriptor; children?: ReactNode }) {
  return (
    <p className={descriptor.className} style={descriptor.style}>
      {children}
    </p>
  )
}

// App.tsx
const registry = { paragraph: MyParagraph, image: MyImage }
<WhoobeProvider registry={registry} api={api}>…</WhoobeProvider>
```

### Hooks

`usePage`, `useObject`, `useQuery`, `useForm`, and `useWhoobe` — all require a `<WhoobeProvider>` ancestor:

```tsx
const { status, data, error, reload } = usePage('it', '/contatti')
const form = useForm({ targetClassId: 'contact', successMessage: 'Grazie!' })
await form.submit({ name: 'A', email: 'a@b.it' }, formEl)
```

### SSR (React Server Components / Vite SSR)

Fetch + walk **server-side** and hand the serializable descriptor to the client `<WhoobePage descriptor={...} />` so hydration matches without a refetch:

```tsx
const descriptor = await walkTree(page.content, {}, { api, assetBaseUrl })
return <WhoobePage descriptor={descriptor} />
```

## Using `@whoobe-cms/next`

Install: `pnpm add @whoobe-cms/next @whoobe-cms/react @whoobe-cms/renderer` (peer: `react@>=18`).

The helpers are server-only and fetch through Next's patched `fetch`, so `revalidate` gives you **ISR**:

```tsx
// app/[locale]/news/[slug]/page.tsx (App Router, RSC)
import { getPageData, WhoobePage, generateMetadataFromPage } from '@whoobe-cms/next'

export async function generateMetadata({ params }) {
  const { page } = await getPageData(params.locale, `/news/${params.slug}`, { baseUrl, revalidate: 300 })
  return generateMetadataFromPage(page, baseUrl)
}

export default async function Page({ params }) {
  const { descriptor } = await getPageData(params.locale, `/news/${params.slug}`, { baseUrl, revalidate: 300 })
  return <WhoobePage descriptor={descriptor} />
}
```

```ts
// Dynamic pages: generateStaticParams from the records backing the slug.
import { staticParamsForRecords } from '@whoobe-cms/next'
const records = await api.queryObjects({ class: 'News', limit: 100 })
export function generateStaticParams() {
  return staticParamsForRecords(records, 'slug', 'it')
}
```

Other helpers: `getObjectData(id, { revalidate })`, `staticParamsForSlugs(slugs, locale)`, `whoobeApi(baseUrl)`.

## Using `@whoobe-cms/vue`

Install: `pnpm add @whoobe-cms/vue @whoobe-cms/renderer @whoobe-cms/schema` (peer: `vue@^3.4`).

```vue
<script setup lang="ts">
import { WhoobeProvider, WhoobePage, useWhoobe, usePage } from '@whoobe-cms/vue'
import { ApiClient } from '@whoobe-cms/renderer'

const api = new ApiClient('https://cms.example.com')
</script>

<template>
  <WhoobeProvider :api="api" asset-base-url="https://cms.example.com/dam-asset">
    <WhoobePage locale="it" path="/contatti" />
  </WhoobeProvider>
</template>
```

### Mapping nodes to your design system

Pass a `registry` to the provider. A registry component receives `{ descriptor, children }`:

```vue
<!-- MyParagraph.vue -->
<script setup lang="ts">
import { WhoobeNode } from '@whoobe-cms/vue'
defineProps<{ descriptor: any; children?: any[] }>()
</script>
<template>
  <p :class="descriptor.className" :style="descriptor.style">
    <WhoobeNode v-for="c in descriptor.children" :key="c.id" :descriptor="c" />
  </p>
</template>
```

```ts
// App.vue
const registry = { paragraph: MyParagraph, image: MyImage }
```

### Composables

`usePage`, `useObject`, `useQuery`, `useForm`, and `useWhoobe` (the injected context) — all must be called within a `<WhoobeProvider>` subtree:

```ts
const { status, data, error, reload } = usePage('it', '/contatti')
const form = useForm({ targetClassId: 'contact', successMessage: 'Grazie!' })
await form.submit({ name: 'A', email: 'a@b.it' }, formEl)
```

### SSR (Nuxt/Vite SSR)

`walkTree` is async and deterministic. Fetch + walk **server-side** and hand the descriptor to the client so hydration matches without a client-side refetch:

```ts
// +page.server.ts (or a useAsyncData loader)
const { page } = await api.getPage('it', '/contatti')
return { descriptor: await walkTree(page.content, {}, { api, assetBaseUrl }) }
```

```vue
<WhoobePage :descriptor="descriptor" />   <!-- renders the pre-walked tree -->
```

## Using `@whoobe-cms/svelte`

Install: `pnpm add @whoobe-cms/svelte @whoobe-cms/renderer @whoobe-cms/schema` (peer: `svelte@^5`).

```svelte
<script>
  import { WhoobeProvider, WhoobePage } from '@whoobe-cms/svelte'
  import { ApiClient } from '@whoobe-cms/renderer'

  const api = new ApiClient('https://cms.example.com')
</script>

<WhoobeProvider {api} assetBaseUrl="https://cms.example.com/dam-asset">
  <WhoobePage locale="it" path="/contatti" />
</WhoobeProvider>
```

### Mapping nodes to your design system

```svelte
<!-- MyParagraph.svelte -->
<script>
  import { WhoobeNode } from '@whoobe-cms/svelte'
  export let descriptor
</script>

<p class={descriptor.className} style={descriptor.style}>
  {#each descriptor.children as child}
    <WhoobeNode {descriptor={child}} />
  {/each}
</p>
```

```svelte
<script>
  import { WhoobeProvider, WhoobePage } from '@whoobe-cms/svelte'
  import MyParagraph from './MyParagraph.svelte'
  const registry = { paragraph: MyParagraph }
</script>

<WhoobeProvider {api} {registry}>
  <WhoobePage locale="it" path="/contatti" />
</WhoobeProvider>
```

### Stores

`createPageStore(api, options, locale, path, websiteId?)`, `createObjectStore(api, id)`, `createQueryStore(api, params)`, `createWhoobeApi(baseUrl)`:

```svelte
<script>
  import { createWhoobeApi, createPageStore } from '@whoobe-cms/svelte'
  const api = createWhoobeApi('https://cms.example.com')
  const page = createPageStore(api, { assetBaseUrl: 'https://cms.example.com/dam-asset' }, 'it', '/contatti')
</script>

{#if $page.status === 'ready' && $page.data}
  <WhoobeNode {descriptor={$page.data}} />
{/if}
```

### SSR (SvelteKit)

```ts
// +page.server.ts
export const load = async () => {
  const api = new ApiClient('https://cms.example.com')
  const { page } = await api.getPage('it', '/contatti')
  return { descriptor: await walkTree(page.content, {}, { api, assetBaseUrl }) }
}
```

```svelte
<!-- +page.svelte -->
<script>
  export let data
  import { WhoobeNode } from '@whoobe-cms/svelte'
</script>
<WhoobeNode {descriptor={data.descriptor}} />
```

## Features handled by the adapters out of the box

- **Styling parity** — `className`/`style` pass through (your Tailwind/CSS compiles them); bound values are escaped.
- **Forms** — the default form component POSTs to `/public/forms/:classId/submit`, injects the honeypot, resets on success, keeps values on error, and shows a click-to-close result popup (mirroring the editor).
- **Search** — the default search component wires to `/public/search`.
- **DAM images** — path references resolve to `/dam-asset/*`; full URLs pass through.
- **Dynamic links** — list-to-detail links (`dynamicLink`) resolve per record through the target page's slug pattern.

## Verification

Each package has vitest tests (SSR-based, no DOM): `@whoobe-cms/schema` (15), `@whoobe-cms/renderer` (27), `@whoobe-cms/react` (3), `@whoobe-cms/next` (3), `@whoobe-cms/vue` (4), `@whoobe-cms/svelte` (3). Run from the repo root:

```bash
pnpm --filter @whoobe-cms/schema test
pnpm --filter @whoobe-cms/renderer test
pnpm --filter @whoobe-cms/react test
pnpm --filter @whoobe-cms/next test
pnpm --filter @whoobe-cms/vue test
pnpm --filter @whoobe-cms/svelte test
```

Build all SDK packages:

```bash
npx turbo run build --filter='@whoobe-cms/{schema,renderer,react,next,vue,svelte}'
```
