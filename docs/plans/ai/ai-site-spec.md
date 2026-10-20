# Plan: a site specification any LLM can write (`site-spec`)

Status: **proposed** (2026-10-20). Nothing in this plan is implemented. It extends
`ai-website-generator.md` (the in-product wizard) and `ai-pages-snippets-generator.md`.

## 1. Why

The in-product generator (`buildWebsiteStructurePrompt`, `POST /ai/generate-website-structure`,
`POST /whoobe-one/websites/from-ai`) produces 3 pages and 3 snippets, and the contract the model has to
follow is a string inside `packages/core/src/ai/prompts.ts`. Three limits:

- **The contract is not portable.** The rules (element shape, links, bindings, classes, layout) live in
  that string and in the head of whoever wrote a site by hand. The site `whoobe.dev` was built with a
  generator (`scripts/site/whoobe-dev/`) that knows much more than the prompt does: header and footer as
  layout snippets, a theme, links and buttons with text, dynamic cards bound to a detail page, assets.
- **The model is the one configured in the product.** A person who prefers another model, a local one,
  or a coding assistant cannot use the same contract.
- **The check is shallow.** `validateElementTree` checks ids, tags and types of a few fields; it does not
  say "this link has no target" or "this binding points to a class that does not exist".

## 2. Goal

One provider-independent description of "a Whoobe site as data", with:

1. a **schema** (JSON Schema, derived from Zod) a model can be constrained by;
2. **instructions** for models (Markdown) with rules and real examples, used by the in-product wizard and
   by any outside LLM alike;
3. a **validator and importer** that turn a file into a website, with errors that name the path, reachable
   **from the dashboard**, by the people who use it (editors, designers). There is no command line in this plan.

Not a goal: promising the quality of what a model writes. The validator exists to refuse what is wrong.

## 3. Decisions

**D1. The spec compiles to the existing bundle; it is not a second import path.**
`packages/core/src/portability/bundle.ts` already defines `WebsiteBundle` (version 2: website, pages,
snippets, templates, themes, menus, data classes and objects, assets), with `parseWebsiteBundle`,
`importWebsiteBundle` and `?dryRun=1`. A site spec is a *smaller, stricter, friendlier* form that is
expanded into a bundle (ids generated, defaults filled, the template that places the header and footer
built) and then imported by the same code. One writer to the database, one set of tests, one dry run.
`POST /whoobe-one/websites/from-ai` is kept and moves onto the same path.

**D2. The schema lives in `packages/sdk/schema`** (where the Zod definitions of the nodes already are), as
a new `site-spec.ts` with its tests. The JSON Schema is generated from it at build time and committed under
`packages/sdk/schema/json/` so it can be fetched without installing anything. A drift test fails if the
committed file differs from the generated one.

**D3. Instructions are files, not strings.** They live in `docs/ai-site-spec/` (rules + examples) and are
the single source: `prompts.ts` reads them (bundled at build time), and the docs site publishes them. A test
checks that every example validates and that every rule file is referenced from the index.

**D4. Small and strict first.** The schema starts with the fields the whoobe.dev generator uses and adds
the rest one by one, each with a test. A field that is not in the schema is rejected, not ignored
(`.strict()`), so a model cannot smuggle behaviour in. The fields the current prompt tells the model to
omit (`dataBinding`, `link`, `gsap`, `alpine`, `events`, `slider`, `formConfig`) stay out until each has its
own section, rules and tests; `alpine` and `events` (code-like) stay out of the first version.

**D5. Generated content is untrusted data.** The importer sanitises like the editor does: rich text through
`sanitizeRichText`, URLs checked for scheme (no `javascript:`), images through `sanitizeGeneratedImages`
(placeholders or the library only, never a remote URL written by the model), CSS limited to Tailwind
classes plus the existing safe `style` handling. A spec cannot set permissions, users or secrets: those
fields do not exist in the schema.

**D6. No call to a model in the importer.** Validating and importing work on a file or on pasted text, with
no outside request. Calling a model stays in the product's wizard (and in the outside tool of the person's
choice). This matters on a LAN with no outbound access: the dashboard page of phase 2 needs nothing but the
installation itself.

**D8. The dashboard is the only interface; the command line is deferred.** The people who build sites
are editors and designers, and an installation on a LAN may give them no shell at all (and should not).
Every capability of the spec (get the schema and the instructions, validate, see what would be created,
import) is therefore a dashboard function backed by the API route. A command line is not part of this plan:
the people who build sites are not the people who use a shell, and a developer or operator does not create
sites. If a real need appears (automation, CI), a thin client of the same route can be added later; until
then the API route is the integration point and no capability may exist only outside the dashboard.

**D7. Permission.** Import needs `websites:create` or `objects:write`, as `from-ai` does today, and is
audited (`AUDIT.websiteFromAi`, or the import audit entry). A dry run needs the same permission and writes
nothing.

## 4. The specification (first version)

```
site.json
  version: 1
  website: { name, rootPath?, defaultLocale, supportedLocales, domains? }
  theme?: { name, colors[], fonts[] }            // or themeName: reference to an existing theme
  snippets[]: { key, name, category, node }      // `key` is a local handle, used below
  layout?: { header?: key, footer?: key, aside?: key, notFound404?: key }
  pages[]: { slug, title, category?, locale?, sections: (Node | { snippet: key })[] }
  menus[]?: { name, items[] }
  data?: { classes[], objects[] }                // phase 3
```

`Node` is the existing element shape reduced to what a model needs: `element`, `content` or `blocks`,
`css` (Tailwind classes), `link` (`href`, `external`), `image` (`assetKey` or placeholder). The expansion
step adds `id`, `type`, `tag` and the document root, so the model does not have to produce them.

Rules that the validator enforces (each one is a test, with a failing example):

- every `snippet` reference, `layout` key and `menu` target exists;
- slugs are unique per locale and URL-safe; a page has at least one section;
- a link has text or children, and a target (`href` or a page slug that exists);
- a button/link text is not empty (the bug found on whoobe.dev on 2026-10-20);
- size limits per page and per snippet (as today, but configurable and reported with the count);
- only allowed elements and attributes; no inline event handlers; no script.

## 5. Delivery in phases

Each phase is its own branch, with `CHANGES.md` and tests, and does not depend on the later ones.

**Phase 1: schema, expansion, validator (no network).**
- `packages/sdk/schema/src/site-spec.ts` + tests; generated JSON Schema + drift test.
- `expandSiteSpec(spec) -> WebsiteBundle` in `packages/core/src/portability/` + tests: expanding the spec of
  the whoobe.dev site gives a bundle `parseWebsiteBundle` accepts and `importWebsiteBundle` imports in dry run.
- Done when: the examples validate; each rule has a failing example; the whoobe.dev site can be described in
  a spec (the content of `scripts/site/whoobe-dev/content.json` is the first real example).

**Phase 2: instructions, route and dashboard.**
- **The instructions come first, because the page hands them out.** `docs/ai-site-spec/` (the rules, at
  least two complete examples taken from real sites, and a short "how to ask a model" page), written against
  the phase 1 schema. The dashboard serves them from the same files (bundled at build time), so the text a
  person copies is the text in the repository. A test validates every example and checks that each rule in
  the index has a file. The first version covers only what the schema of phase 1 covers: no instruction
  describes a field the validator does not know.
- `POST /whoobe-one/websites/from-spec` (`?dryRun=1` supported; validation errors returned as a list of
  `{ path, message }`); `from-ai` calls the same expansion. Routes added to the API documentation (the
  route-drift check must stay green).
- **Dashboard page "Import a site from a spec"** (Websites area, same permissions as the import of a
  website bundle):
  1. *Get the material*: buttons that copy or download the instructions and the JSON Schema, to take to any
     model the person uses (a chat in a browser is enough), with a short "how to ask" text.
  2. *Bring the result*: paste the text or choose a file; nothing leaves the installation.
  3. *Check*: runs the dry run and shows, in plain words, the errors with the place in the file ("page
     'Pricing', section 2, the link has no text") or, if valid, what will be created (pages, snippets,
     theme, layout) and what already exists.
  4. *Import*: creates the website as a draft; the person is taken to it. Publication stays a separate step
     with its own permission.
  The schema is the same Zod module, so the page can also validate in the browser while the person edits
  the text, with the server check as the authority.
- Done when: the instructions and the examples exist and are tested; a person with only a browser can go from a model's output to a draft website without a
  terminal (a browser test covers it: paste, error shown with its place, fix, check, import); an invalid
  spec writes nothing; a valid one imports on an empty database in a test and the result passes the existing
  portability round-trip test.

**Phase 3: the wizard.**
- `prompts.ts` reads the instructions of phase 2 instead of its own string.
- The wizard returns the larger site (layout snippets, links) instead of 3 pages and 3 snippets.
- Done when: the wizard's output passes the same validator; the instructions are published on
  docs.whoobe.dev (if question 3 is answered that way).

**Phase 4 (only if the previous ones are used): data and bindings.**
Classes, objects, a list bound to a class and a detail link (`dynamicLink`), assets from the library.
Bigger surface and the part where a wrong reference hurts most: it needs its own plan.

## 6. Tests and checks

- Unit: every rule, valid and invalid example, expansion determinism (same spec, same bundle shape).
- Drift: committed JSON Schema equals the generated one; every `docs/ai-site-spec/` example validates.
- Round trip: spec -> bundle -> import -> export gives a bundle that validates again.
- Security (added to `scripts/security`): a spec with `javascript:` links, script tags, event attributes,
  remote image URLs and an oversize tree is rejected or sanitised; an unauthenticated or unprivileged call
  to the route is refused.
- Not measured, and not claimed: how well a given model writes a spec. If we publish such a number later it
  will say which model, which prompts, how many runs, and how many failed.

## 7. Risks and what we do not do

- **A second format to keep.** Mitigation: D1 (it compiles to the bundle) and the drift tests.
- **A schema too wide too early.** Mitigation: D4 and the phases.
- **Models write plausible but wrong sites** (empty links, a section that says nothing). The validator
  catches structure, not meaning: a person still reads the result before publishing.
- Not in scope: a command line (deferred, see D8), calling models from the importer, hosting a model, fine-tuning, a marketplace of specs.
- Not claimed anywhere (README, site, posts) until phase 1 is released: "works with any LLM".

## 8. Open questions for the maintainer

1. Should a spec be able to reference an existing theme/snippet by name, or always carry its own?
2. Languages: one locale per spec, or several in one file?
3. Do we publish the instructions under `docs/` (visible on docs.whoobe.dev) as soon as phase 2 is released, or later?
