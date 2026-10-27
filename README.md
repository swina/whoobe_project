# Whoobe

A visual page editor, a data model you can change without a developer, a media library and a gateway to your existing APIs, in **one installation you run yourself**.
TypeScript, Vue 3, Postgres, S3-compatible storage. MIT licence, one organisation per installation, no per-user fee.

[**Live sandbox**](https://sandbox.whoobe.dev) · [**Documentation**](https://docs.whoobe.dev) · [**How Whoobe evolves**](docs/release/community/project-evolution.md) (contributors and testers wanted) · [unifythestack.dev](https://unifythestack.dev)

## Try it

**Online, nothing to install:** open the [sandbox](https://sandbox.whoobe.dev). The demo login is in the banner. It is a shared workspace that is deleted and rebuilt every 3 hours.

**On your machine, one command** (Docker with Compose; the first start builds the images and takes several minutes):

```bash
git clone https://github.com/swina/whoobe_project && cd whoobe_project && ./try.sh
```

When it is up, the script prints the address (`http://localhost:3000`) and the login. `./try.sh stop` stops it and keeps the data, `./try.sh reset` deletes everything.
Ports busy? `TRY_PORT_BASE=3200 ./try.sh` moves them all.

## What you get

- **Visual page editor**: blocks, snippets and kits, themes, templates, translations. A page is stored as a validated JSON tree, not as HTML.
- **A data model you change yourself**: classes, fields and relations edited in the dashboard, objects bound to blocks in the editor.
- **Media library (DAM)** on any S3-compatible store, with image presets and metadata.
- **API gateway** to the systems you already have, with the credentials kept on the server and the fields bound to blocks.
- **Publishing**: static or server-rendered sites (Nuxt, Next.js), documentation sites from Markdown, and native mobile apps (Capacitor).
- **Running it**: roles and permissions, two-factor authentication by role, single sign-on (OIDC), an audit log, encrypted scheduled backups.

## Documentation

Everything else is at **[docs.whoobe.dev](https://docs.whoobe.dev)** and in [`docs/release`](docs/release/README.md): [what Whoobe is](docs/release/overview/what-is-whoobe.md),
[reading paths by role](docs/release/by-role/README.md) (operators, developers, data owners, security), [creating a workspace](docs/release/operations/creating-workspaces.md),
the [architecture](docs/release/architecture/architecture-overview.md) and [why it is built this way](docs/release/architecture/design-decisions/README.md).
For the code: [developing Whoobe](docs/development.md) (monorepo layout, local development, configuration, the Pimcore migration tool, the publishing CLIs).

## Status

Whoobe is in the `0.` series: behaviour can change between minor releases. The [release section](docs/release/README.md) lists the current release and links the release notes, which say what changed.

## Questions, contributing, security, licence

**Questions and ideas:** [GitHub Discussions](https://github.com/swina/whoobe_project/discussions) is the one public place (Q&A, Ideas): no form, no private queue. Contributions of every kind are welcome: [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Security problems, privately and never in a public discussion: [SECURITY.md](SECURITY.md).

Released under the [MIT License](LICENSE.md). Copyright (c) 2026 Antonio Nardone. The licence covers this repository's own code and documentation; the third-party packages it depends on keep their own licenses.
