# Headless SDK — Svelte & Vue adapters

The official headless SDK (docs/plans/cms/headless-sdk-plan.md) already ships a framework-agnostic core (`@whoobe-cms/schema` §1 + `@whoobe-cms/renderer` §2) and a React-first adapter (`@whoobe-cms/react` §3, Next.js §4). This plan adds the **Svelte** and **Vue** adapters, reusing that core 100% — no duplicated walk/validation/resolution logic, only framework-specific rendering over the same `RenderDescriptor` stream.

## Context

### What already exists

- **`@whoobe-cms/schema`** — the shared element-tree contract + Zod validators + transform engine.
- **`@whoobe-cms/renderer`** — pure-TS, SSR-safe core: `walkTree()` validates and walks a tree into serializable `RenderDescriptor`s (kind/tag/className/style/content/image/link/children/configs), resolves data bindings via the public API, DAM image references, and list-to-detail dynamic links. No `window`/`document` at module scope, so it runs identically in Node (SSR) and browsers.
- **`@whoobe-cms/react`** — the reference adapter: provider + component registry + `<WhoobePage>`/`<WhoobeNode>` + hooks. Its output for a given tree is the parity target for the other adapters.

### Why these two are cheap to add

Everything framework-specific is a thin, mechanical layer over the core:

1. A **provider** that injects the registry + api client + options (assetBaseUrl, resolveTargetPage) into the component tree.
2. A recursive **`WhoobeNode`** that looks a descriptor's `kind` up in the registry (falling back to built-in primitives) and renders its `children` recursively.
3. A **`WhoobePage`** that fetches a page, validates + walks it, and renders the root node.
4. Async-data helpers (page/object/query/form) as Svelte stores / Vue composables over `ApiClient`.

`walkTree` is async and deterministic, so SSR and hydration render the same descriptor stream by construction — the same guarantee the React adapter relies on.

## Design principles

- **Zero core duplication.** Adapters import `walkTree`, `RenderDescriptor`, `normalizeKind`, `ApiClient` from `@whoobe-cms/renderer` (and types from `@whoobe-cms/schema`). No re-implementations.
- **Identical registry contract.** `Registry = Partial<Record<NodeKind, NodeComponent>>` where `NodeKind` = `normalizeKind()`'s output and `NodeComponent` is a framework component receiving a `RenderDescriptor`. Defaults cover every primitive kind so a page renders with an empty registry.
- **Deterministic SSR/hydration.** Both adapters must be able to render the full tree synchronously from a descriptor already walked server-side (SvelteKit `load` / Nuxt server).
- **Parity target.** A fixture tree renders the same normalized output across React, Svelte, and Vue — verified by a cross-adapter snapshot test.
- **Styling parity.** `className`/`style` pass through unchanged (consumer compiles Tailwind); `tailwindToInlineCss`-style inline styles remain an opt-in (same as the React adapter).

## 1. `@whoobe-cms/svelte`

Svelte 5 (runes-first, Svelte 4-compatible) + SvelteKit.

Components (SFCs, `packages/sdk/svelte/src/lib`):

- **`WhoobeProvider.svelte`** — `setContext('whoobe', { registry, api, options })`.
- **`WhoobeNode.svelte`** — the recursive renderer: `$props<{ descriptor, depth? }>()`; resolves the component for `descriptor.kind` from the context registry or defaults, then `<svelte:component this={...} {...descriptorProps} />` with children mapped recursively. Exports `descriptorToProps(descriptor)` so consumers can use the raw props.
- **`WhoobePage.svelte`** — `$props<{ locale, path, websiteId? }>()`; `$derived`/await the page → `walkTree` → renders the root `WhoobeNode`. Also accepts a pre-walked descriptor (SSR path) via a `descriptor` prop so SvelteKit can walk in `+page.server.ts`.
- **Default primitives** — `DefaultContainer`, `DefaultHeading`, `DefaultParagraph`, `DefaultImage`, `DefaultLink`, `DefaultForm` (submit + honeypot + success/error popup), form-field defaults, `DefaultSearch` (wires `/public/search`).

Stores / helpers (`src/lib/stores.ts`):

- `createPageStore(locale, path)` — loads + walks a page, exposes `{ status, descriptor, error }`.
- `createObjectStore(id)`, `createQueryStore(params)` — thin wrappers over `ApiClient`.
- `createFormStore(formConfig)` — wraps `submitForm` with the same success-clears / error-keeps behavior.

SSR (SvelteKit):

- `+page.server.ts`: `await walkTree(await api.getPage(locale, path), {}, options)` → pass the descriptor to the client component → identical hydration (no re-walk client-side; `WhoobeNode` is synchronous).

## 2. `@whoobe-cms/vue`

Vue 3 (Composition API) + Nuxt.

Components (SFCs, `packages/sdk/vue/src`):

- **`WhoobeProvider.vue`** — `provide('whoobe', { registry, api, options })`.
- **`WhoobeNode.vue`** — recursive renderer: resolves the component for `descriptor.kind` (inject registry → defaults), renders `<component :is>` with the descriptor props and recursive children. Exposes `descriptorToProps` for programmatic use.
- **`WhoobePage.vue`** — async `setup`: fetch page → `walkTree` → expose root descriptor → render `WhoobeNode`. Accepts a pre-walked `descriptor` prop for the Nuxt SSR path.

Composables (`src/composables.ts`):

- `usePage(locale, path)` — `{ status, descriptor, error }` (async ref).
- `useObject(id)`, `useQuery(params)`.
- `useForm(formConfig)` — wraps `submitForm`, returns `{ submit, submitting, result }`.
- `useWhoobe()` — returns the injected provider (registry + api + options).

SSR (Nuxt):

- A `definePageMeta`/`useAsyncData` pattern: walk in a server route/`fetch` and render the descriptor on the client; Nuxt serializes the descriptor stream, so hydration matches.

> Distinct from this repo's *editor* app (`whoobe-one-spike`, which is Vue): this adapter is the **consumer-side headless renderer**, same purpose as the React adapter, not the editor.

## 3. Shared cross-adapter contract (documented, not duplicated)

- `NodeKind` = union of `normalizeKind()` outputs (container, heading, paragraph, span, image, link, button, form, input, textarea, select, radiogroup, submit, reset, search, slider, youtube, vimeo, icon, code, blockquote).
- `Registry` shape and `descriptorToProps` field contract are the same across React/Svelte/Vue — the plan's §parity test enforces it.
- A tiny `@whoobe-cms/adapter-types` package is **optional**: the registry is a per-framework `Record<NodeKind, Component>`, so only the `NodeKind` union (already exported from `@whoobe-cms/renderer`) is truly shared; the plan keeps it there rather than adding a package.

## 4. File summary

New workspace packages (the `packages/sdk/*` glob already covers them):

- `packages/sdk/svelte` → `@whoobe-cms/svelte`: provider, `WhoobePage`, `WhoobeNode`, default primitives, stores, `index.ts`, SvelteKit demo route.
- `packages/sdk/vue` → `@whoobe-cms/vue`: provider, `WhoobePage`, `WhoobeNode`, default primitives, composables, `index.ts`, Nuxt demo page.

Both depend on `@whoobe-cms/renderer` (`workspace:*`) + `@whoobe-cms/schema`.

New docs: `docs/plans/sdk/svelte-adapter.md`, `docs/plans/sdk/vue-adapter.md` (or one combined adapter-contract doc). `CHANGES.md` updated on implementation.

## 5. Verification

- `pnpm turbo typecheck` / `build` clean across the new packages (and no regressions in `@whoobe-cms/renderer`).
- **Unit**: render a fixture tree (heading, paragraph with a bound/transformed value, DAM image, form, search, query repeater) through `WhoobeNode` in each framework — `@vue/test-utils` for Vue, `@testing-library/svelte` for Svelte — asserting the same output as the React adapter for the same descriptor.
- **Cross-adapter parity snapshot**: one fixture tree → normalized HTML compared across `@whoobe-cms/react`, `@whoobe-cms/svelte`, `@whoobe-cms/vue`.
- **Playground**: a SvelteKit + a Nuxt app each fetch a **real published page** from a running `core-api`; confirm SSR HTML == hydrated DOM (no mismatch warnings), data-bound objects resolve, a form submits with the success popup, and DAM images resolve to `/dam-asset/*`.

## Resolved

Implemented 2026-08-15:

- **`@whoobe-cms/svelte`** (`packages/sdk/svelte`, Svelte 5, built with `svelte-package`): `WhoobeProvider` (context), `WhoobeNode` (recursive registry renderer via a `$derived` component), `WhoobePage` (fetch + `walkTree`, accepts a pre-walked `descriptor` for SSR), default primitives (`WhoobeContainer`/`WhoobeText`/`WhoobeImage`/`WhoobeLink`/`WhoobeForm`/`WhoobeInput`/`WhoobeTextarea`/`WhoobeSelect`/`WhoobeRadioGroup`/`WhoobeButton`/`WhoobeSearch`/`WhoobeMedia`), `defaults` registry, `stores.js` (`createPageStore`/`createObjectStore`/`createQueryStore`/`createWhoobeApi`), and `context.js` (`setWhoobeContext`/`getWhoobeContext`). Tested via `svelte/server`'s `render()` (SSR, no DOM); 3 tests pass.
- **`@whoobe-cms/vue`** (`packages/sdk/vue`, Vue 3, plain `defineComponent`+`h()` so it builds with `tsc`): `WhoobeProvider` (provide/inject), `WhoobeNode`, `WhoobePage`, default primitives, `composables` (`useWhoobe`/`usePage`/`useObject`/`useQuery`/`useForm`), `descriptorToProps`. Tested via `@vue/server-renderer`'s `renderToString`; 4 tests pass.
- **Shared registry contract** is identical across adapters: `Record<NodeKind, Component>` keyed by `normalizeKind()`, components receive `{ descriptor, children }`. Both adapters escape bound values, resolve DAM images and per-record links through `@whoobe-cms/renderer`, and support the same registry override + SSR-hydration pattern as the React adapter.
- All four SDK packages (`schema` 15, `renderer` 27, `vue` 4, `svelte` 3 tests) pass; turbo build green.
