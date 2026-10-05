# Whoobe — User Manual

Welcome. This is the manual for **using** Whoobe day to day — building websites, authoring content, managing assets, connecting external systems, and administering an installation from the admin dashboard.

## About this manual

**Who it's for:** content editors, marketers, site administrators, and anyone else who works inside the Whoobe admin dashboard to build and run a website. It assumes no prior familiarity with Whoobe, but doesn't teach general web concepts (what a domain is, what HTML does, etc.).

**Who it's not for, and where to go instead:** if you're setting up a local dev environment, deploying Whoobe, extending it with code, or integrating against its APIs from your own application, this isn't the right document —see `docs/guides/` (architecture and API references: the Headless SDK, the API Gateway's security model, DAM internals) and `docs/plans/` (design/implementation plans for individual features, useful when you want to know *why* something works the way it does). This manual is the user-facing companion to those — it explains **what you can do and how**, not how the system is built.

**How it's organized:** each part below roughly mirrors a section of the dashboard's own left-hand navigation, so what you see on screen and what you read here should always line up. Parts are numbered in a reasonable learning order (start-to-finish for someone new to Whoobe), but each chapter also stands on its own if you're looking something up mid-task.

**Status:** this manual is being written incrementally, chapter by chapter. The table of contents below lists the full planned structure; entries link to their chapter once it exists, and are otherwise listed as **planned**. Nothing here should ever go stale silently — if a chapter describes a workflow that's since changed in the product, that's a bug in the manual, not a footnote to live with.

**Later phase — reading this manual inside Whoobe itself:** once there's enough of it written to be genuinely useful, the plan is to surface this manual directly inside the admin dashboard (a Help/Docs area, likely searchable, rather than a link out to the repo). That's deliberately out of scope until the content itself is in reasonable shape — no point building a reader for a manual that's still mostly a table of contents.

---

## What is Whoobe?

Whoobe is a content platform you run yourself, combining a few things that are normally separate products:

- A **visual page builder** — you compose pages by dragging and arranging blocks (text, images, buttons, forms, sliders, and more) on a canvas, with a live preview that matches what actually gets published.
- A **dynamic data model** — beyond pages, you can define your own structured content types ("Data Classes" — think products, team members, events, anything with fields you decide) without writing code, and reuse them across your site.
- A **built-in media library (DAM)** — upload and organize images, documents, and video; control what's public vs. private; and optionally mirror assets to an external CDN.
- An **API Gateway** — connect an external system (an ERP, a CRM, a payment provider, a marketing platform) by pointing at its API, then bind page content to it visually, with no custom integration code and no credentials ever reaching the browser.
- **Multi-channel publishing** — the same content can reach a published website, a native mobile app shell, and outbound email (including creating email campaigns in an external provider from a page or snippet you've already built).

A few terms used throughout this manual, since they map to specific things in the product rather than being used loosely:

| Term | What it means in Whoobe |
| --- | --- |
| **Website** | A published site: a domain (or several), a set of locales, and the pages that live under it. |
| **Page** | One page of a website, built visually from blocks. Has its own URL, SEO settings, and publish state. |
| **Snippet** | A reusable block (or group of blocks) saved once and dropped into multiple pages — a hero section, a footer, a pricing table. |
| **Kit** | A saved starting-point layout (more than a single snippet, less than a whole page template) you can drop into a page while building it. |
| **Component** | A reusable, named group of fields you can attach to a Data Class — not a page-building block, a schema-design building block. |
| **Data Object / Data Class** | Your own structured content types and their records — products, staff, events, anything beyond pages/snippets. Data Classes define the fields; Data Objects are the records. |
| **Document** | Content migrated from a legacy Pimcore install (or authored the same way), distinct from the newer Page/Snippet builder — see the Documents chapter for how the two relate. |
| **Asset** | Any file in the media library — image, PDF, video, etc. |
| **Theme** | A set of colors and fonts applied to a website or an individual page. |
| **Integration / Gateway Endpoint** | A configured connection to an external API, set up once and reused by any page/form that needs it. |
| **CDN Mirror** | A copy of an asset published to an external CDN (e.g. Cloudinary) so it has a stable, public URL — useful when Whoobe itself runs somewhere not publicly reachable. |

---

## Table of Contents

### Part 1 — Getting Started
1. **Welcome to Whoobe** — this document.
2. Core Concepts, in More Depth *(planned)* — how Websites, Pages, Snippets, Kits, Themes, and Data Objects relate to each other, with a diagram.
3. [The Dashboard Tour](03-dashboard-tour.md) — logging in, the navigation sidebar, tabs, and where things live.
4. [Your First Page, Start to Finish](04-first-page.md) — a hands-on walkthrough: create a website, build a page, publish it.

### Part 2 — Building Content
5. [The Page Builder](05-page-builder.md) — the canvas, the block palette, layout/spacing controls, responsive preview, and why there's no undo.
6. [Snippets & Kits](06-snippets-kits.md) — saving a block as a reusable snippet, updating it later, organizing by category, saving/reusing kits.
7. [Themes](07-themes.md) — defining colors and fonts, applying a theme per website, and overriding it per page from inside the builder.
8. AI-Assisted Authoring *(planned)* — generating pages, snippets, and images with AI; importing a design from Figma.
9. Forms *(planned)* — building a form in the page builder, and where its submissions go (a Data Object or an external Integration).

### Part 3 — Data & Assets
10. Data Classes & Data Objects *(planned)* — designing your own content types, fields, Components, locales, and workflow states.
11. Documents *(planned)* — legacy/migrated content, and how it differs from Pages.
12. Assets & the Media Library (DAM) *(planned)* — uploading, organizing folders, public vs. private visibility, versions, image transforms.
13. CDN Mirroring *(planned)* — publishing an asset to an external CDN and when you'd want to.

### Part 4 — Reaching Your Audience
14. Outgoing Mail *(planned)* — SMTP setup, reusable Mail Templates, the sent-mail log.
15. Sending Email Campaigns *(planned)* — turning a page, snippet, or mail template into a draft campaign in an external provider (e.g. Brevo).
16. Publishing a Website *(planned)* — going live, previewing before publish, SEO/sitemap settings.
17. Native Mobile Apps *(planned)* — generating an installable app shell from a published website.

### Part 5 — Connecting External Systems
18. Integrations: the API Gateway *(planned)* — what the Gateway is, when you'd use it, the vendor presets available out of the box.
19. Setting Up an Integration *(planned)* — adding an endpoint, authentication, discovering routes, testing a call.
20. Binding Content to External Data *(planned)* — pulling data from an Integration into a page visually, filtering results, dynamic links.

### Part 6 — Administration
21. Users, Roles & Permissions *(planned)* — inviting users, what a role controls, MFA.
22. Settings Reference *(planned)* — General, DAM/storage, Data Classes, Security, Workflows, AI providers, Figma, PWA — one section per Settings tab.
23. System Logs *(planned)* — reading logs, filtering by app/level, the logging on/off switch.

### Appendix
- A. Glossary *(planned)*
- B. Getting Help *(planned)* — where to go when this manual doesn't have the answer.
