# Headless SDK (Official, framework-agnostic — React/Next.js first)

An official SDK so any frontend can consume Whoobe's JSON element trees and render them with its **own** components. The visual builder (`whoobe-one-spike`) emits a structured, Zod-validated JSON tree (`whoobe_pages.content`); the SDK consumes that tree headlessly and maps each builder node to a component in the consuming app's design system via a **component registry** — no Vue, no server-side coupling, 100% headless.

See `docs/plans/executive-summary.md` §3.3 ("Svilupperemo un SDK agnostico ufficiale, con priorità per React/Next.js") — this is the concrete design for that strategy.

## Context

### What already exists

- **The JSON tree is the source of truth.** Pages are `whoobe_pages` rows whose `content` column is a JSON Element tree (built by `ElementsClass.js`, duck-typed in `packages/core/src/mail/render-mail-template.ts`, rendered client-side by `whoobe-one-spike`'s `BlockContainerPreview.vue`/`BlockElementPreview.vue`). It is already served headlessly:
  - `GET /public/pages/:locale/*` → `{ page, params }` (published pages, static slugs + dynamic path patterns, `params` holds `{placeholder}` values).
  - `GET /public/data-objects/:id`, `POST /public/data-objects/query` → published Data Objects (single + filtered/collection).
  - `GET /public/search` → site search results (pages/objects/assets, class filters).
  - `POST /public/forms/:classId/submit` → form submissions (honeypot, rate limit).
- **A reference renderer exists.** `whoobe-one-spike` already walks these trees to HTML/JSX with: node→component dispatch (`element`/`tag`/`level`), `css.css`+`css.container`→`className`, `font`/`style`→inline style, `data.attributes`→DOM attrs, `dataBinding`→field resolution + `applyTransform`, `link`/`dynamicLink` wrappers, image handling, form submit handling, and the `SearchElement`. The SDK is a framework-agnostic reimplementation of that walker with a pluggable component registry.
- **A shared contract does not exist yet.** The node types live in a frontend `.d.ts` (`ElementsClass.d.ts`) and the transform logic is duplicated server-side (`packages/core/src/mail/field-transforms.ts`). The SDK needs a versioned, framework-agnostic schema package to depend on.

### Goals

1. Official, published packages under the `@whoobe-cms/*` scope, **framework-agnostic core** + **React/Next.js first** adapter.
2. **100% headless**: the SDK fetches JSON + public API only; rendering is decided entirely by the consumer's registry.
3. Consumers map builder nodes to their own design-system components; simple primitives get sensible defaults.
4. Production-grade concerns: SSR/ISR (Next.js), data caching, hydration, typed API, deterministic rendering.

## Design principles

- **Core/renderer is pure TS, zero framework imports.** A tree-walker produces a normalized "render descriptor" (node → resolved props/children). React/Next adapters are thin and only turn descriptors into components.
- **Registry, not hardcoding.** The consumer passes `{ nodeKind: Component }`. Node kind = the node's `element` (+ `tag` disambiguators for `select`, `radiogroup`, `search`, `lucideicon`). Missing registry entries fall back to built-in primitives.
- **Same style computation as the editor**, so a page looks identical headlessly: `class = css.css + css.container (+ transform className)`, `style = font-family(stack) + node.style`; `data.attributes` spread onto the element.
- **Data resolution via public API only.** Object/query bindings hit `/public/data-objects/*`; the SDK ships a small client + cache. `applyTransform` (date/url/number/truncate/valueMap) is ported into the shared schema package so editor and SDK stay behaviorally identical (same duplication precedent `field-transforms.ts` already sets).
- **Server-renderable and deterministic.** React adapter supports SSR/RSC and client hydration from the same descriptor stream; no `window` at module scope.

## 1. Shared contract package (`@whoobe-cms/schema`)

The single source of truth for the JSON tree, shared by the editor, the SDK, and (optionally) the backend mail renderer.

- Port `ElementsClass.d.ts`'s node types into TS `interface`s (not `Element` class shims): `WhoobeElementNode` with `id`, `type: 'element' | 'container'`, `tag`, `element`, `semantic`, `level`, `content`, `css`, `style`, `font`, `image`, `dataBinding`, `dynamicLink`, `link`/`linkTarget`, `data.attributes`, `blocks`, plus the specialized configs (`formConfig`, `searchConfig`, `slider`, `gsap`, `alpine`).
- **Zod runtime schemas** generated from those types, used to *validate* fetched trees (a malformed/mutated tree fails loudly with a clear path instead of crashing a render) and to *normalize* (fill defaults).
- Include the pure `FieldTransform` type + `applyTransform`/`escapeHtml` port (from `field-transforms.ts`) so both sides format values identically.
- Versioned (`0.x`), published to npm; the Vue editor can adopt it later without breaking consumers.

Node-kind contract (canonical, from `ElementsClass.js` + `BlockElementPreview.vue` dispatch):

| `element` | rendered as | notes |
| --- | --- | --- |
| `h1`–`h6` | heading (`level` decides) | `level` present → `h{level}` |
| `p`, `span`, `div`, `section`, `nav`, `header`, `footer`, `main` | matching tag | `semantic` on containers wins |
| `img` | image | `image.url` = http(s) URL or DAM reference |
| `a` / `button` | link/button | `link`/`linkTarget` wrap children |
| `form` | form container | `formConfig` submit logic |
| `input`, `textarea`, `select`, `radiogroup`, `checkbox`, `submit`, `reset` | form fields | `data.attributes` → native attrs |
| `grid` / `flexbox` | layout container | `type: 'container'` |
| `search` | search box | `searchConfig` → `/public/search` |
| `lucideicon` | icon | icon name in `content` |
| `video`, `youtube`, `vimeo`, `slider` | media | built-in light defaults or registry-mapped |

## 2. Core renderer (`@whoobe-cms/renderer`)

Pure TS, no framework. Exports:

- `walkTree(node, context): RenderDescriptor[]` — walks `blocks`, producing a descriptor per node:
  - `kind` (canonical node kind, normalized from `element`/`tag`/`level`)
  - `props`: `id`, `className`, `style`, `attributes` (from `data.attributes`), `content` (resolved + transformed text/html), `image`, `link`, `dynamicLink`
  - `children`: `RenderDescriptor[]`
  - `config`: `formConfig`/`searchConfig`/`slider` passthrough
- `resolveDataBinding(binding, { api, cache })` — resolves `dataBinding` against the public API:
  - `explicit`/`first`/`query` → `/public/data-objects/:id` or `/public/data-objects/query` (filters/orderBy/offset/limit/locale)
  - relative (no `objectId`) → resolve against the current `context` object
  - `resolveMode: 'parent' | 'currentPage'` → context propagation rules
- `resolveFieldValue(binding, context)` + `applyTransform` — field lookup + transform, identical to the editor.
- `resolveImageUrl(ref)` — http(s)/data: as-is; DAM references (`/path` or asset UUID) → `S3_PUBLIC_BASE_URL`/`/dam-asset/*` (mirror of `packages/core/src/mail/mail-image-urls.ts`).
- `resolveDynamicLink(dynamicLink, record)` — list-to-detail URLs via `website-paths` substitution.
- `ApiClient` — typed fetchers for `/public/pages/:locale/*`, `/public/data-objects/*`, `/public/search`, `/public/forms/:classId/submit` with an injectable `fetch` (works in Node 18+ and browsers).
- **No `window`/`document` at import time** — fully SSR-safe.

## 3. React adapter (`@whoobe-cms/react`)

Thin layer over the renderer:

- `<WhoobePage page={WhoobePageRecord} context? />` — fetches (or receives) a page, validates via `@whoobe-cms/schema`, walks, renders through the registry.
- `<WhoobeNode node={RenderDescriptor} />` — recursive render of one descriptor.
- `WhoobeProvider registry={{ ... }}` — the component registry + api client + cache. Registry keys are node kinds; e.g. a consumer maps every `p`/`h1`/`img` to their design-system `Typography`/`Image`.
- Hooks: `usePage(locale, path)`, `useObject(id)`, `useQuery(options)`, `useForm(formConfig)` (wraps `/public/forms/:classId/submit`; honeypot injection; success/error popup identical to the editor's).
- **Style mode**: by default pass `className`/`style` through (Tailwind-first). A `inlineStyles` option runs `tailwindToInlineCss` (the same compiler `packages/core/src/mail/tailwind-inline.ts` uses) for consumers without Tailwind.
- Built-in default components for all primitive kinds so a page renders with zero registry entries.

## 4. Next.js specifics (`@whoobe-cms/next`)

App Router + Pages Router support:

- **RSC/SSR helpers**: `getPageData(locale, path, { revalidate })` for `generateStaticParams`/`generateMetadata` (title/description from `page.seo`); server component `<WhoobePage>` renders the full descriptor stream.
- **Route handlers**: `/public/pages/:locale/*` proxied fetch helpers with `next.revalidate` (ISR) so published edits revalidate.
- **Client hydration**: `@whoobe-cms/react`'s renderer is deterministic — server HTML and client hydration match by construction (stable node ids).
- **Dynamic paths**: map `{slug}` patterns → `generateStaticParams` from `GET /public/pages/:locale/*` + sitemap endpoint.

## 5. Adapter surface (future phases)

- `@whoobe-cms/react` and `@whoobe-cms/next` — **implemented** (see "Resolved" below).
- `@whoobe-cms/svelte` and `@whoobe-cms/vue` — **implemented** (docs/plans/cms/headless-sdk-svelte-vue-plan.md "Resolved").
- `@whoobe-cms/web` (Web Components wrapper over the core walker) — registry + descriptor rendering over the same `@whoobe-cms/renderer`.
- CLI scaffolder: `npx @whoobe-cms/cli init <app>` to bootstrap a Next.js/React app wired to a Whoobe instance.

## 6. Styling & output parity

- Document that `className` is passed through and the *consumer's* Tailwind/CSS compiles it (the editor uses runtime Tailwind; the SDK expects the consumer's build pipeline).
- Provide `tailwindToInlineCss` as an opt-in so consumers without Tailwind still get styled output.
- Note parity target: a page rendered by the SDK should match the editor's preview output for supported nodes (same class/style computation, same escaping rules).

## 7. File summary

New workspace packages (this monorepo, `packages/sdk/*`):

- `packages/sdk/schema` — `@whoobe-cms/schema`: node types + Zod validators + transforms.
- `packages/sdk/renderer` — `@whoobe-cms/renderer`: pure tree-walker, data/image/link resolution, api client.
- `packages/sdk/react` — `@whoobe-cms/react`: provider/registry + `<WhoobePage>`/`<WhoobeNode>` + hooks + default components.
- `packages/sdk/next` — `@whoobe-cms/next`: RSC/SSR helpers, route-handler fetchers, metadata helpers.
- `packages/sdk/playground` — a sample Next.js app used for manual/visual verification (fetches a real published page's tree).

New docs: `docs/plans/sdk/*` for adapter contracts; the plan's "Resolved" section updated on implementation.

Modified: root `pnpm-workspace.yaml`/Turborepo config (new packages), `CHANGES.md`.

## 8. Verification

- `pnpm turbo typecheck` / `build` clean across all packages (including the new SDK packages).
- A unit test renders a fixture Element tree (heading, paragraph with a `{token}`/transform, DAM image, form, search, collection repeater) through `@whoobe-cms/renderer` and asserts the descriptor stream + resolved data.
- The playground app fetches a **real published page** from a running `core-api` and renders it: output matches the editor's preview for supported nodes; a data-bound object resolves; a form submits and shows the success popup; a DAM image resolves to `/dam-asset/*`.
- SSR check: the same tree renders to identical HTML server-side and on hydration (no hydration mismatch warnings).
- React registry override: map `img` → a custom design-system `<Image>` and confirm it renders instead of the default.

## Resolved

Phase 1 (`@whoobe-cms/schema`) implemented 2026-08-15:

- New workspace package `packages/sdk/schema` (added to `pnpm-workspace.yaml` via `packages/sdk/*`).
- `src/node.ts` — framework-agnostic port of the Element-tree data contract (`WhoobeElementNode`, `ElementCss`, `ElementImage`, `ElementDataBinding`, `DynamicLinkBinding`, `ElementFormConfig`/`ElementSearchConfig`/`ElementSlider`, …) with the canonical node-kind mapping documented in the type docs.
- `src/transform.ts` — port of `field-transforms.ts` (`FieldTransform`/`TransformResult`, `applyTransform`, `escapeHtml`, `TRANSFORMERS`, `transformersForFieldType`) so editor, backend mail renderer, and SDK format values identically.
- `src/validators.ts` — Zod schemas (`whoobeElementSchema` recursive lazy, `dataBindingSchema` with a discriminated-union transform, `formConfig`/`searchConfig`/`slider`), `.passthrough()` so unknown editor fields survive a round-trip, plus `validatePageContent`/`parsePageContent`.
- 15 vitest tests pass (transforms, escaping, realistic-tree validation, clear nested error paths, passthrough, defaults); typecheck + build clean; validated against 4 real trees from the live `whoobe_pages`/`whoobe_one_templates` tables.

Phase 2 (`@whoobe-cms/renderer`) implemented 2026-08-15:

- New workspace package `packages/sdk/renderer`, depending on `@whoobe-cms/schema`.
- `src/kind.ts` — `normalizeKind()` (canonical registry key: container/heading/paragraph/image/form/input/textarea/select/radiogroup/submit/reset/search/slider/youtube/vimeo/icon/button/link/code/span…) and `resolveTag()` (heading levels, semantic containers), mirroring `BlockElementPreview.vue`'s dispatch.
- `src/descriptor.ts` — the serializable `RenderDescriptor` (id/kind/tag/className/style/attributes/content/image/link/children/configs/options + raw `node`).
- `src/walk.ts` — `walkTree()`/`walkNode()` (async): validates via the schema, resolves field bindings, collection repeaters (query → children per record), `form`/`search`/`slider` config passthrough.
- `src/resolve.ts` — `resolveDataBinding` (explicit/first/query/parent/currentPage via public API), `resolveFieldValue`, `formatBoundContent` (transform + escaping, safe HTML), `resolveRecordField`.
- `src/url.ts` — `resolveImageUrl()` (DAM path → proxy URL; http/data passthrough; UUIDs documented unresolvable), `objectKeyForPath`.
- `src/path-pattern.ts` — `resolveDynamicLinkPath()` (list-to-detail slugs).
- `src/api-client.ts` — `ApiClient` (injectable `fetch`, typed `getPage`/`getObject`/`queryObjects`/`search`/`submitForm`), `RenderApi` structural interface for mocking.
- 27 vitest tests pass; typecheck + build clean; smoke-tested walking a real `whoobe_pages.content` from the live DB (containers/headings/paragraphs/images resolve to correct kinds/tags).

Phase 3/4 (`@whoobe-cms/react` + `@whoobe-cms/next`) implemented 2026-08-15:

- **`@whoobe-cms/react`** (`packages/sdk/react`, React 18+, `jsx: react-jsx`, builds with `tsc`): `WhoobeProvider` (context), `WhoobeNode` (recursive registry renderer), `WhoobePage` (fetch+walk, or a pre-walked `descriptor` for SSR), default primitives (container/headings/image/link/form+honeypot+result-popup/inputs/select/radiogroup/buttons/search/media), hooks (`usePage`/`useObject`/`useQuery`/`useForm`/`useWhoobe`), `descriptorToProps`. Tested via `renderToStaticMarkup` (3 tests).
- **`@whoobe-cms/next`** (`packages/sdk/next`, server-only helpers, no `next` dependency): `getPageData`/`getObjectData` (Next-patched `fetch` + `revalidate` for ISR, then `walkTree`), `generateMetadataFromPage` (from `page.seo`), `staticParamsForSlugs`/`staticParamsForRecords` (dynamic pages), `whoobeApi(baseUrl)`, and re-exports the React adapter. Tested with a mocked fetch (3 tests).
- Full headless SDK surface now: `schema` (15), `renderer` (27), `react` (3), `next` (3), `vue` (4), `svelte` (3) tests — all pass; turbo build green.
