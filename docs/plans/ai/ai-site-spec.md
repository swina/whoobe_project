# Plan: a site specification any LLM can write (`site-spec`)

Status: **proposed** (2026-10-20). Nothing in this plan is implemented. It extends

**Update 2026-10-20:** phases 1 and 2 are done (see below). Phase 3 (the wizard reading the instructions) is replaced by
`template-wizard.md`: editors and designers do not write or paste JSON, so the guided wizard becomes the main way in, and this plan's engine
(schema, expansion, check, import) and the specification window (kept under *Advanced*) stay as they are.
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

**D3. Instructions are files, not strings.** They live in `docs/release/content/ai-site-spec/` (rules + examples) and are
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

**D9. At most two languages per spec, for now.** A spec describes a site in one language or in two (the
default and one more). Each page is written once per language (two entries with the same `slug` and
different `locale`), so a model writes real text in each and nothing is machine-translated behind the scenes.
The limit keeps the files small enough for a model to produce in one go and the checks simple; it is a
validator rule, not a limit of the product, and can be raised later without changing the format. The
product's own translation tool is unaffected.

**D10. Existing theme and snippets: the person chooses, nothing is overwritten.** A spec may carry its own
theme and snippets or point to ones that already exist by name (`themeName`, or `{ use: "<name>" }` in place
of a snippet body). When the check finds a name that already exists in the installation, the dashboard asks,
for each one: *use the existing one* or *create a new one* (given a free name, e.g. "Hero (2)"). The
default is *create new*; an existing theme or snippet is never changed or replaced by an import. A name the
spec points to that does not exist is an error shown with its place. The choices are made on the check step
and the import follows them exactly, so the dry run and the import describe the same result.

**D11. The instructions are published when phase 2 is finished,** not before: the docs site gets
`docs/release/content/ai-site-spec/` once the phase 2 "done" criterion is met (examples tested, dashboard page working in the
browser test). Until then the files are in the repository only.

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
  website: { name, rootPath?, defaultLocale, supportedLocales (1 or 2), description?, otherPaths? }
  theme?: { name, colors[], fonts[] }            // or themeName: reference to an existing theme
  snippets[]: { key, name, category, node }      // `key` is a local handle, used below
  layout?: { header?: key, footer?: key, aside?: key, notFound404?: key }
  pages[]: { slug, title, category?, locale?, sections: (Node | { snippet: key })[] }
  data?: { classes[], objects[] }                // phase 4
```

`Node` is the existing element shape reduced to what a model needs: `element`, `content` or `blocks`,
`css` (Tailwind classes), `link` (`href`, `external`), `image` (`assetKey` or placeholder). The expansion
step adds `id`, `type`, `tag` and the document root, so the model does not have to produce them.

Rules that the validator enforces (each one is a test, with a failing example):

- every `snippet` reference, `layout` key and `menu` target exists;
- at most **two locales** per spec (`supportedLocales` has one or two entries, `defaultLocale` is one of them),
  and every `locale` of a page is one of them; a page without `locale` is in the default one;
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

**Phase 1 delivered (2026-10-20, branch `feat/ai-site-spec`).** What was built and what it showed:
- `packages/sdk/schema/src/site-spec.ts` (+ committed `json/site-spec.schema.json`, drift test) and `packages/core/src/portability/site-spec.ts`
  (`expandSiteSpec`). The first real example is the site whoobe.dev itself, converted from its generator's output
  (`packages/core/src/portability/fixtures/whoobe-dev.site-spec.json`, 5 pages, header, footer, a reference to the
  existing "Benefits by role" snippet): it validates, expands, imports on an empty database and every link keeps its text.
- **The real site failed the first validation:** it links to `/blog`, whose pages live outside the file (they are copies from another
  website). Instead of loosening the rule, the spec got `website.otherPaths` (pages that exist outside the file that links may
  name). The blog itself (a list bound to a class, detail pages) stays a phase 4 matter.
- **The importer dropped references to existing themes:** a theme id that is not in the bundle became `null` on the website, its pages
  and its snippets. It is now kept when that theme exists here (a dangling id is still dropped).
- **The importer renamed the site and its root path** (suffix `-xxxxxxxx`), which broke every internal link of a spec (links carry the
  root path). New option `keepNames`: name and root path as written; a root path already taken is a 409, in a dry run too. Copies of
  a site keep the suffix.
- **Not in version 1:** menus (`websitePaths`) and data. Both are out until they have their own section, rules and tests.
- Tests: 27 in the schema package (each rule has a failing example), 15 unit and 4 integration (disposable database) in core, the
  integration ones skipped without `PORTABILITY_TEST_DATABASE_URL`. Mutation check: breaking the link text or the sanitiser makes tests fail.

**Phase 2: instructions, route and dashboard.**
- **The instructions come first, because the page hands them out.** `docs/release/content/ai-site-spec/` (the rules, at
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
     theme, layout) and what already exists; for every theme or snippet whose name is already taken, the
     person chooses *use the existing one* or *create a new one* (D10).
  4. *Import*: creates the website as a draft; the person is taken to it. Publication stays a separate step
     with its own permission.
  The schema is the same Zod module, so the page can also validate in the browser while the person edits
  the text, with the server check as the authority.
- Done when: the instructions and the examples exist and are tested; a person with only a browser can go from a model's output to a draft website without a
  terminal (a browser test covers it: paste, error shown with its place, fix, check, import); an invalid
  spec writes nothing; a valid one imports on an empty database in a test and the result passes the existing
  portability round-trip test.

**Phase 2 delivered (2026-10-20, branch `feat/ai-site-spec`).** Instructions and two examples
(`docs/release/content/ai-site-spec/`, moved under `docs/release` so that the documentation site carries them, D11), the routes
`GET /whoobe-one/site-spec/material` and `POST /whoobe-one/websites/from-spec` (`importSiteSpec` in core), and the dashboard window
(*Settings > Websites > Import from a spec*): material to copy or download, paste or choose a file, check, summary with the choices of D10, import
as a draft. A browser test (`scripts/security/browser/site-spec-import.spec.ts`) goes through it all: a text that is not JSON, a fenced answer with three
mistakes shown with their place, the corrected one, the import, then the same file again to meet a taken root path, an existing theme and
existing snippets. What building it showed:
- **The validator spoke library, and in two rounds.** "Too small: expected string to have >=1 characters" is not for an editor, and the
  rules across the file did not run while the structure had an error, so a person fixed one wave of problems and met the next. Messages are now
  in words (`a link needs visible text`), and the rules across the file run on what can be read, so the problems come together.
- **A link inside a text** is plain HTML (no root path is added, the target is not checked): only outside addresses and paths from the root are
  accepted there; the real whoobe.dev has such links.
- **Reserved root paths** (`/api`, `/settings`, ...) are refused, from the name too, by the check and by the importer under `keepNames`.
- **Copying on a LAN:** the Clipboard API exists only on https or localhost, so the window falls back to the old way and, failing that, shows the
  text to select. Plain-http installations are the case this plan was written for.
- **Found, not changed (maintainer to decide):** deleting a website leaves its templates behind, and turns its pages into pages of no website; a
  second page `/` of no website breaks the unique index and the website delete answers 500. A template that still places a snippet then stops that
  snippet from being deleted ("used by unknown site"). This is older than the feature, but a spec import makes it easy to meet.
- **Layout is shared by the two languages** (the template has a `locale`, the spec does not): the instructions ask for a header and footer with no
  words of one language. A layout per language is a later extension.
- The command line stays out (D8). The sandbox keeps the feature on: it calls nothing outside and creates drafts.

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
- Drift: committed JSON Schema equals the generated one; every `docs/release/content/ai-site-spec/` example validates.
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

## 8. Decisions taken by the maintainer (2026-10-20)

- Existing theme/snippets: the user chooses, reuse or create new (D10).
- Languages: two at most for now (D9).
- Command line: deferred (D8).
- Instructions published when phase 2 is finished (D11); written in phase 2, not 3.

No open question remains in this plan; the next step is to approve it and start phase 1.
