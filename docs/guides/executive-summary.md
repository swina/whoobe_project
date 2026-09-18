# Whoobe — Executive Summary & Competitive Positioning

*As of 2026-09-18*

## Executive Summary

Whoobe is a self-hostable content platform that unifies four things most organizations buy as separate products: a headless CMS with a dynamic, Pimcore-style data model; a visual, drag-and-drop page/snippet builder with AI-assisted content generation; a native API Gateway that turns third-party services (ERPs, CRMs, payment providers, marketing platforms) into visually bindable data sources without custom integration code; and one-click native mobile app generation.

The practical effect: a team that would normally stitch together a headless CMS (Contentful/Sanity), an integration platform (Zapier/Make), a page builder (Webflow/Builder.io), and a separate mobile app project gets one system, one data model, and one place credentials live — encrypted, server-side, never exposed to the browser or the builder's own users.

Whoobe is built for teams that want SaaS-grade authoring UX without giving up control of their data, infrastructure, or integration logic.

## Product Pillars

1. **Dynamic content model.** Data Classes/Objects are defined and changed at runtime (no code deploy to add a field), covering pages, snippets, reusable components, and arbitrary structured data — the same flexibility Pimcore is known for, without Pimcore's operational weight.
2. **Visual builder with live preview.** Drag-and-drop page/snippet composition, Tailwind-based styling, reusable Kits, and a real-time preview that matches the published output pixel-for-pixel.
3. **Native API Gateway & Integrations layer.** Connect an external API (ERP, CRM, payment provider) by pointing at its base URL or an OpenAPI spec — routes, response schemas, and field types are auto-detected. Credentials (API key, bearer, basic, OAuth2 client-credentials) are AES-256-GCM encrypted and never leave the server. Editors bind block fields to external data visually, including filtering a result list by field value (`category = 'beauty' AND brand = 'chanel'`), with zero custom glue code.
4. **Multi-framework Headless SDK.** First-class adapters for React, Vue, Next.js, Nuxt, and Svelte let development teams consume content and gateway-bound data directly via API when the visual builder isn't the right tool for a given surface.
5. **Native Digital Asset Management.** S3/MinIO-backed storage, folder-level visibility rules, on-demand image transforms and thumbnailing, versioning — built in, not a bolted-on media library.
6. **One-click native mobile apps.** A Capacitor-based generator turns a published site into an installable iOS/Android app from the same content and component tree used on the web.
7. **AI-native authoring.** AI-assisted page, snippet, and image generation, plus Figma-to-page import, live inside the builder rather than as a separate tool.
8. **Security and operations by default.** Role/permission-gated access, encrypted credential storage, structured per-service logging with a live on/off switch (no restart required), and publish/workflow states for content review.

## Competitive Landscape

No single competitor covers all eight pillars — Whoobe is evaluated against the best-in-class product in each adjacent category:

- **Headless CMS:** Contentful, Sanity, Strapi, Storyblok, Directus
- **Visual / no-code page builders:** Webflow, Builder.io, Framer
- **Enterprise / legacy CMS:** WordPress (+ Elementor/Divi), Adobe Experience Manager, Sitecore
- **Integration / iPaaS platforms:** Zapier, Make (Integromat), Workato
- **No-code mobile app builders:** Adalo, Glide, Bubble

The comparison below picks one representative per category — Contentful, Webflow, WordPress, Zapier, and Adalo — as the sharpest points of contrast for each pillar.

## Pillar-by-Pillar Comparison

| Pillar | Whoobe | Contentful | Webflow | WordPress | Zapier | Adalo |
| --- | --- | --- | --- | --- | --- | --- |
| Dynamic content model | Runtime-defined Data Classes, no deploy needed | Runtime-defined content types | Fixed CMS collections, limited relations | Custom post types, needs code/plugin | Not a CMS | Basic data collections |
| Visual page builder | Drag-and-drop, live preview matches published output | None — headless only | Best-in-class visual builder | Plugin-dependent (Elementor, Divi) | None | Visual builder, mobile-only |
| Native integrations / gateway | Built-in: OpenAPI auto-detect, OAuth2, visual field binding + result filters, encrypted credentials | None native — via Zapier or custom code | Limited (Zapier, webhooks) | Plugin-dependent, quality varies widely | 7,000+ app catalog, purpose-built for automation | Limited (Zapier, generic API connector) |
| Headless SDK | React, Vue, Next.js, Nuxt, Svelte adapters | Strong, mature, multi-SDK | Limited API access | REST/GraphQL via plugins | Not applicable | Not applicable |
| Digital Asset Management | Built-in, S3/MinIO, on-demand transforms | Basic asset API | Basic asset manager | Media library, plugin-dependent | Not applicable | Not applicable |
| Native mobile app generation | One-click Capacitor build from the same content tree | None | None | PWA only, via plugins | Not applicable | Core product — mobile-only, no web |
| AI-native authoring | Built into the builder: page/snippet/image generation, Figma import | Add-on AI content tagging | AI page generation (beta) | Plugin-dependent | AI steps inside automations | None |
| Self-hosted / data ownership | Yes — full control of DB, assets, infrastructure | No — SaaS only | No — SaaS only | Yes | No — SaaS only | No — SaaS only |

Read top to bottom: Whoobe is the only row with no "None" or "Not applicable" cell — the trade-off is that no single pillar yet has the years of hardening its best-in-class rival has (see Current Maturity & Roadmap).

## Key Differentiators

1. **Configuration, not custom code, for integrations.** Pointing at an OpenAPI spec (or a single sample request) auto-generates routes, response schemas, and field types — the same outcome Zapier delivers through thousands of hand-built app connectors, but usable against any API a team already has, including internal/legacy ones no iPaaS vendor will ever build a connector for.
2. **One data model, every channel.** The same Data Class and page tree renders to web, PWA, and a native Capacitor mobile app — competitors force a rebuild (or a second product) per channel.
3. **Credentials never leave the server.** OAuth2 tokens and API keys are AES-256-GCM encrypted at rest and only ever used inside the gateway proxy — the visual builder, the browser, and the published site never see a raw credential, a property most page builders and lightweight CMSs don't guarantee.
4. **AI generation is a first-class editor action**, not a separate app or a paid add-on bolted onto the CMS after the fact.
5. **Full self-hosting**, with SaaS-grade authoring UX — a combination WordPress offers without the UX, and Contentful/Webflow offer without the hosting control.

## Current Maturity & Roadmap

**Production-ready today:** core CMS (pages, snippets, dynamic Data Classes/Objects, themes, DAM, outgoing mail, multi-site, roles/permissions); the visual builder with AI page/snippet/image generation and Figma import; the headless SDK (React, Vue, Next.js, Nuxt, Svelte); native mobile app generation via Capacitor; and the full read side of the API Gateway — proxying, rate limiting, a plugin system, AES-256-GCM encrypted credentials (API key, bearer, basic, and OAuth2 client-credentials with automatic token refresh), OpenAPI/Swagger auto-import, vendor starter templates (Shopify, Stripe, HubSpot, Brevo), and visual field binding with drag-and-drop and per-field result filtering.

**In progress, not yet shipped:**
- A builder UI for mapping a Form element to a write (POST/PUT) route — the gateway proxy already supports arbitrary writes, but there's no visual mapping UI yet.
- An offline write queue for the Capacitor mobile app (submit while offline, sync on reconnect).
- A validated real-vendor pilot end-to-end — the integration layer has been fully verified against a local mock ERP service, not yet against a live third-party account.
- OAuth2 authorization-code grant (user-consent flows) — only the server-to-server client-credentials grant is implemented.

**Not started:** a public marketplace for community-contributed connectors, and formal third-party compliance certification (e.g. SOC 2) — self-hosting gives a team direct control over its own compliance posture today, but Whoobe itself carries no third-party audit yet.
