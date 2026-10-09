# Whoobe CMS - release documentation

The documentation in this folder describes the product **as it is delivered and operated**. Everything here has been
checked against the code at the time of the last reorganisation (see [Status](#status)); the design history of the
project stays in [`../plans`](../plans) and is deliberately not part of a release.

**Aligned to release:** not released yet (set by `scripts/release.sh prepare`, see [`release-process.md`](release-process.md))

## Contents

| Folder | Audience | What is in it |
|---|---|---|
| [`architecture/`](architecture) | IT architects, DevOps, security | [Architecture overview](architecture/architecture-overview.md) (components, ports, routing, trust boundaries, topologies, tenancy), [data and storage](architecture/data-and-storage.md) (tables, object layout, migrations, retention), [authentication and authorization](architecture/authentication-and-authorization.md) (identities, sessions, MFA, permissions, public surface) |
| [`operations/`](operations) | Operators, DevOps | [Creating and managing workspaces](operations/creating-workspaces.md) (the tested install), [configuration reference](operations/configuration-reference.md) (every environment variable), [secrets and keys](operations/secrets-and-keys.md), [encryption and encrypted backups](operations/encryption.md), [backup, restore and disaster recovery](operations/backup-restore-and-dr.md), [upgrading and migrations](operations/upgrade-and-migrations.md), [observability and logging](operations/observability-and-logging.md), [capacity, scaling and availability](operations/capacity-and-scaling.md), [storage backends](operations/storage-backends.md), [public sandbox](operations/sandbox.md); bare-metal alternatives: [deployment](operations/deployment.md), [deployment mini-guide](operations/miniguide-deployment.md) (not re-verified for 0.1.0) |
| [`security/`](security) | Security and compliance reviewers, fork maintainers | [Threat model](security/threat-model.md), [status summary](security/status-summary.md), [findings register](security/findings.md), [data protection](security/data-protection.md), [supply chain and SBOM](security/supply-chain.md), [test suite summary](security/test-suite-summary.md) (one page), [automated test suite](security/security-test-suite.md), [test plan](security/security-testing-plan.md), [manual checklist](security/manual-test-checklist.md), [Security CI for forks](security/security-ci-for-forks.md) |
| [`api/`](api) | Integrators | [API reference](api/api-reference.md) and [`openapi.yaml`](api/openapi.yaml), both generated from one route table by [`gen-api-docs.py`](api/gen-api-docs.py) |
| [`guides/`](guides) | Editors, developers, integrators | [Asset management (DAM)](guides/WCMS_asset_management.md), [Alpine presets](guides/alpine-presets.md), [Audio element](guides/audio-element.md), [Download element](guides/download-element.md), [Markdown element](guides/markdown-element.md), [file uploads in forms](guides/form-uploads.md), [documentation sites](guides/documentation-sites.md), [outgoing mail and providers](guides/mail-providers.md), [dynamic website paths](guides/dynamic-website-paths.md), [website export and import](guides/website-bundle.md), [headless SDK](guides/headless-sdk.md), [API Gateway security](guides/api-gateway-security.md), [Brevo integration](guides/integrations/Brevo-Integration.md), [website publishing](guides/publish/website-publishing.md), [Capacitor mobile app](guides/publish/capacitor-mobile-app.md) |
| [`getting-started/`](getting-started) | Everyone | [Executive summary](getting-started/executive-summary.md) (positioning, dated) and the [user manual](getting-started/manual/README.md) (dashboard tour, first page, page builder, snippets and kits, themes) |
| [`release-process.md`](release-process.md) | Maintainers | How a release is made: versions, support policy, release gates, procedure |
| [`release-notes-0.1.0.md`](release-notes-0.1.0.md) | Operators | What 0.1.0 contains, the behaviour changes to check before installing over a development setup, known limits |

**Reading paths.** *Architect*: architecture overview → data and storage → authentication → capacity. *DevOps*: creating
workspaces → configuration reference → secrets and keys → backup/DR → upgrade → observability. *Security / compliance*:
threat model → status summary and findings → data protection → supply chain → encryption.

## What is not here

- **`docs/plans/`** - design documents and implementation plans, written before or while a feature was built. They
  explain *why* something is the way it is, and many code comments point to them, but they are not kept in step with
  the code and some describe work that was changed or not done. Read them as history.
- **Early notes and one-off documents** at the top of `docs/` (initial notes and plan, the DAM implementation plan,
  Studio integration notes, an exported console log, a Figma export).

## Rules for this folder

1. **Only current documents.** A document is added here when it describes behaviour that exists in the code, and it
   leaves (back to `plans/`, or deleted) when it stops being true.
2. **Facts that can be checked are checked.** Paths, commands, environment variables, screen labels and route lists
   in these files must exist in the repository. The API reference and OpenAPI file are generated:
   edit the route table in `api/gen-api-docs.py` and run `python3 docs/release/api/gen-api-docs.py`. A route added to
   core-api without an entry there leaves the API documentation behind; compare with
   `scripts/security/routes.expected.json` (all 214 core-api routes are documented, checked by `scripts/release/check-docs.py`). The same
   script fails when an environment variable read by the services or listed in `.env.example` is missing from the
   [configuration reference](operations/configuration-reference.md).
3. **Changes are logged** in the root `CHANGES.md`, as for any other file.

## Status

Reorganised on **2026-10-05**; technical layer (architecture, operations, security reviews) added on **2026-10-09**.
The documentation gate of the release (`./scripts/release.sh check`, `scripts/release/check-docs.py`) passes: every core-api
route documented, no broken link or quoted repository path, every environment variable documented.

### What a documentation release still needs

| Item | State | Owner / next step |
|---|---|---|
| Alignment line (the release this documentation matches) | set by `scripts/release.sh prepare` | release manager |
| Technical set for architects, DevOps and security (this page's first three folders) | **written 2026-10-09 from the code**; statements that depend on running systems (TLS on a live host, upgrade, restore, load, multi-replica) are marked as untested | review by someone other than the author; rehearse the runbooks once ([backup](operations/backup-restore-and-dr.md), [upgrade](operations/upgrade-and-migrations.md)) |
| Findings found by the review: F-055 to F-058 | recorded in [`security/findings.md`](security/findings.md), **open** | fix before or accept explicitly in the release notes |
| Security status summary, DAST, manual security checklist | summary updated 2026-10-09; **DAST and the manual checklist not repeated** for the features of 2026-10-08/09 | run on the release commit (release gate) |
| SBOM | `scripts/release/sbom.sh` works (CycloneDX, 669 components in the source tree); not attached automatically | attach to the GitHub Release; automate in `release.yml` |
| Image digests, signatures, provenance | not available (images are published by hand) | `release.yml` ([release process](release-process.md) section 7) |
| Bare-metal guides (`operations/deployment.md`, `miniguide-deployment.md`) | flagged as not re-verified; the container workspace is the tested path | rewrite or retire |
| [User manual](getting-started/manual/README.md) | partial by design: chapters listed in its table of contents are not written; no App Mode, thumbnail capture, documentation-site, form-upload chapters (the guides cover them) | write after the release |
| [`guides/headless-sdk.md`](guides/headless-sdk.md), [`guides/dynamic-website-paths.md`](guides/dynamic-website-paths.md), publishing guides | names checked, not read line by line | review |
| [Executive summary](getting-started/executive-summary.md) | positioning text dated 2026-09-18 (still mentions MinIO among the stores); not a technical reference | refresh before external use |
| Runbooks never rehearsed: restore on a new host, upgrade, workspace removal and re-creation | written, not run end to end | rehearse once and note the date here |
| Generated documentation sites | the product can publish this folder as a documentation site (Markdown, index, search); not set up for the release | optional: publish `docs/release` with the product's own *documentation site* feature |
| Languages | English only | |
