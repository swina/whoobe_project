# Credits

Whoobe stands on the work of many open-source projects, and it works with several others. This page thanks the main ones, by the role they play.
It is a selection, not an inventory.

- **The complete list of third-party software, with versions, licences and copyright notices, is [THIRD_PARTY_NOTICES.md](https://github.com/swina/whoobe_project/blob/master/THIRD_PARTY_NOTICES.md)**
  (generated; every release checks it, see [supply chain](security/supply-chain.md)). That is the legal record; this page is the thank-you.
- Where this page says "used", the project is a dependency of Whoobe or part of the delivered stack. Where it says "works with", Whoobe connects to it
  but does not ship it.
- The story and the people the author thanks are in [the story of Whoobe](whoobe-history.md).

## Interface and editor

| Project | Role in Whoobe |
|---|---|
| [Vue](https://vuejs.org), [Pinia](https://pinia.vuejs.org), [Vite](https://vite.dev) | The admin dashboard, the page editor and the renderer |
| [Tailwind CSS](https://tailwindcss.com) | The styling model of pages, and of the dashboard |
| [Alpine.js](https://alpinejs.dev) | Interactivity of pages and elements, and the Alpine presets |
| [Lucide](https://lucide.dev) | Icons |
| [dragula](https://github.com/bevacqua/dragula) | Drag and drop in the editor |
| [Marked](https://marked.js.org), [Mermaid](https://mermaid.js.org) | Markdown and diagrams, including documentation sites |
| [JSZip](https://stuk.github.io/jszip/) | Website export and import bundles |

## Server

| Project | Role in Whoobe |
|---|---|
| [Node.js](https://nodejs.org), [TypeScript](https://www.typescriptlang.org), [Express](https://expressjs.com) | The runtime and the three backends |
| [PostgreSQL](https://www.postgresql.org), [node-postgres](https://node-postgres.com), [Drizzle ORM](https://orm.drizzle.team) | The database, the driver and the schema layer |
| [Zod](https://zod.dev) | Validation of content trees and of the data model |
| [XState](https://stately.ai/docs/xstate) | The workflow of Data Objects |
| [Sharp](https://sharp.pixelplumbing.com) and libvips | Image transforms and thumbnails |
| [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) | Asset metadata |
| [AWS SDK for JavaScript](https://github.com/aws/aws-sdk-js-v3) | The S3 client used for every object store |
| [jose](https://github.com/panva/jose) | Validation of identity-provider tokens for the Client Hub |
| [ioredis](https://github.com/redis/ioredis) | The client for shared rate-limit counters |
| [argon2](https://github.com/ranisalt/node-argon2), [otplib](https://github.com/yeojz/otplib) | Password hashing and the second factor |
| [Nodemailer](https://nodemailer.com) | SMTP mail |
| [sanitize-html](https://github.com/apostrophecms/sanitize-html) | The allow-list sanitizer of rich text |
| [Pino](https://getpino.io) | Structured logs |
| [MiniSearch](https://lucaong.github.io/minisearch/) | Search in documentation sites and published content |
| [Multer](https://github.com/expressjs/multer) | Upload handling |
| the AI SDKs of [OpenAI](https://github.com/openai/openai-node), [Anthropic](https://github.com/anthropics/anthropic-sdk-typescript) and [Google](https://github.com/google-gemini/deprecated-generative-ai-js) | Calls to the AI providers you configure |

## Delivered stack and tooling

| Project | Role in Whoobe |
|---|---|
| [Docker](https://www.docker.com) and Compose, [nginx](https://nginx.org) | Packaging and the reverse proxy |
| [Garage](https://garagehq.deuxfleurs.fr) | The default S3-compatible object store |
| [Valkey](https://valkey.io) | The optional store for shared rate-limit counters |
| [pnpm](https://pnpm.io), [Turborepo](https://turbo.build/repo) | The monorepo |
| [Vitest](https://vitest.dev), [Playwright](https://playwright.dev) | Unit, API and browser tests |
| [Trivy](https://trivy.dev), [Semgrep](https://semgrep.dev), [gitleaks](https://gitleaks.io), [OWASP ZAP](https://www.zaproxy.org), [testssl.sh](https://testssl.sh) | The security scans described in the [test suite](security/security-test-suite.md) |

## Generated outputs

Whoobe generates, for you to deploy, sites and apps built with [Next.js](https://nextjs.org), [Nuxt](https://nuxt.com), [Capacitor](https://capacitorjs.com) and
its own SDK adapters for React, Vue and Svelte. These frameworks are not dependencies of the platform itself, but of what it produces.

## Works with

| Project | How |
|---|---|
| [Pimcore](https://pimcore.com) | Whoobe imports Pimcore classes, objects and documents ([data model](data/data-model.md)) |
| [Activepieces](https://www.activepieces.com), [n8n](https://n8n.io) | Automation engines that forms and API clients can start ([marketing automation](communication/marketing-automation.md)) |
| [Keycloak](https://www.keycloak.org) | The identity provider the Client Hub was tested with ([API clients](communication/api-clients.md)); Entra ID, Cognito and Auth0 are documented, not yet tested |
| [Brevo](https://www.brevo.com), [HubSpot](https://www.hubspot.com), Mailchimp, Cloudinary, Shopify, Stripe | Presets of the Integrations ([integrations](communication/integrations.md)) |

## Thank you

To every maintainer and contributor of these projects, and of the thousands of smaller packages below them.
If you maintain one and want your credit changed, or think one is missing, [open an issue](https://github.com/swina/whoobe_project/blob/master/CONTRIBUTING.md).
