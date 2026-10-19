# Self-hosted and MIT

## Decision
Whoobe is **self-hosted** and released under the **MIT licence**. You install it on infrastructure you choose, you hold the database, the files and
the keys, and there is no fee per user, per site, per page or per API call.

## Why
- **Data and credential control.** Organisations with regulated data, internal systems or strict suppliers' rules need to know where everything is and
  who can reach it. Self-hosting makes that an infrastructure question you already know how to answer.
- **No usage-based pricing surprises.** The cost of a platform that sits in front of your systems should not grow with every call or editor.
- **A way out.** A whole website, with its data and files, exports as one archive and imports into another workspace; the code is open.
- **You choose the suppliers.** AI, mail and storage providers are configured by you, with your keys; none is built in.

## What it costs
- **You operate it.** Installation, TLS, backups, upgrades and monitoring are yours (the scripts and runbooks help; see [operations](../../operations/README.md)).
- **No vendor SLA, no vendor-held certification.** Compliance evidence is the documentation and tests in this folder, reviewed by you, not a
  third-party certificate.
- **Young software.** The first release was 0.1.0 (October 2026) and the current one is 0.2.0; while the version starts with `0.`, a minor release may change behaviour (read the release notes before you upgrade). The [overview](../../overview/whoobe-overview.md) lists what has and has not been tested.

## When to revisit
If a managed offering is ever added, it would be a separate decision with its own operations and responsibilities.

## Where it shows in the product
[Creating workspaces](../../operations/creating-workspaces.md), [website export and import](../../content/website-bundle.md),
[release process](../../release-process.md).
