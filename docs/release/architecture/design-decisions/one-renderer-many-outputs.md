# One renderer, many outputs

## Decision
A page is a **tree of elements** stored as data. The generated Next.js, Nuxt and static sites, the mobile app and the headless SDK adapters render
**that tree with one renderer library** (`@whoobe-cms/renderer`). The editor draws the same tree on its canvas, in its preview and in the preview
sites with **its own components**, which follow the same element model and share some modules with the renderer (animations, collapse, selection) but
are a separate implementation. Rich text, SVG and Markdown that authors write are cleaned by a **server-side allow-list sanitizer** when content is
served, not trusted as stored.

## Why
- **One content, every channel.** A change made once reaches the website, the app and an API consumer; nothing is re-entered per channel.
- **One renderer for every output.** What a visitor sees is the same code whether the site is Next.js, Nuxt, static, an app or a headless consumer.
- **Safe by construction.** Because authors' HTML is sanitised on the way out by an allow-list, a pasted script does not reach a visitor, whatever
  was saved.
- **Frameworks are outputs, not lock-in.** The same tree can be published as a framework site you then host anywhere, or consumed through the
  adapters (React, Vue, Svelte).

## What it costs
- **The editor preview is a close image of the output, not the output code path.** Two implementations follow one element model and are kept in step by
  hand. Differences have been found and fixed (a Markdown field bound to an element was converted in the preview but shown as source in a generated
  site, until 2026-10-17). Open a page in a generated site before you announce it.
- **Authors work inside the element model.** Arbitrary hand-written page code is not the authoring path; custom behaviour goes through the supported
  hooks (AlpineJS directives, presets, elements) or in the consuming front end.
- **Generated sites are snapshots until rebuilt** (or revalidated, for server-rendered ones): publishing is an explicit step.

## When to revisit
When a framework needs features the shared renderer cannot express; the adapters are the escape hatch. And when the editor's preview should be the
renderer itself, so that nothing can differ (planned: [release 0.2 plan](https://github.com/swina/whoobe_project/blob/master/docs/plans/system/release-0.2-plan.md)).

## Where it shows in the product
[Content pillar](../../content/README.md), [website publishing](../../content/publishing/website-publishing.md), [headless SDK](../../content/headless-sdk.md).
