# One renderer, many outputs

## Decision
A page is a **tree of elements** stored as data. The editor's live preview, the preview sites, the generated Next.js, Nuxt and static sites, the
mobile app and the headless SDK adapters all render **that same tree with the same renderer library**. Rich text, SVG and Markdown that authors write
are cleaned by a **server-side allow-list sanitizer** when content is served, not trusted as stored.

## Why
- **What you see is what is published.** The preview is not an approximation: it is the output code path, so there is no "it looked different live".
- **One content, every channel.** A change made once reaches the website, the app and an API consumer; nothing is re-entered per channel.
- **Safe by construction.** Because authors' HTML is sanitised on the way out by an allow-list, a pasted script does not reach a visitor, whatever
  was saved.
- **Frameworks are outputs, not lock-in.** The same tree can be published as a framework site you then host anywhere, or consumed through the
  adapters (React, Vue, Svelte).

## What it costs
- **Authors work inside the element model.** Arbitrary hand-written page code is not the authoring path; custom behaviour goes through the supported
  hooks (AlpineJS directives, presets, elements) or in the consuming front end.
- **Generated sites are snapshots until rebuilt** (or revalidated, for server-rendered ones): publishing is an explicit step.

## When to revisit
When a framework needs features the shared renderer cannot express; the adapters are the escape hatch.

## Where it shows in the product
[Content pillar](../../content/README.md), [website publishing](../../content/publishing/website-publishing.md), [headless SDK](../../content/headless-sdk.md).
