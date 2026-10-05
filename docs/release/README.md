# Whoobe CMS - release documentation

The documentation in this folder describes the product **as it is delivered and operated**. Everything here has been
checked against the code at the time of the last reorganisation (see [Status](#status)); the design history of the
project stays in [`../plans`](../plans) and is deliberately not part of a release.

**Aligned to release:** not released yet (set by `scripts/release.sh prepare`, see [`release-process.md`](release-process.md))

## Contents

| Folder | Audience | What is in it |
|---|---|---|
| [`getting-started/`](getting-started) | Everyone | [Executive summary](getting-started/executive-summary.md) and the [user manual](getting-started/manual/README.md) (dashboard tour, first page, page builder, snippets and kits, themes) |
| [`guides/`](guides) | Editors, developers, integrators | [Asset management (DAM)](guides/WCMS_asset_management.md), [dynamic website paths](guides/dynamic-website-paths.md), [headless SDK](guides/headless-sdk.md), [API Gateway security](guides/api-gateway-security.md), [Brevo integration](guides/integrations/Brevo-Integration.md), [website publishing](guides/publish/website-publishing.md), [Capacitor mobile app](guides/publish/capacitor-mobile-app.md) |
| [`operations/`](operations) | Operators | [Deployment](operations/deployment.md), [deployment mini-guide](operations/miniguide-deployment.md), [creating and managing workspaces](operations/creating-workspaces.md), [storage backends](operations/storage-backends.md) |
| [`security/`](security) | Security and compliance reviewers, fork maintainers | [Security CI for forks](security/security-ci-for-forks.md), [automated test suite](security/security-test-suite.md), [status summary](security/status-summary.md), [findings register](security/findings.md), [test plan](security/security-testing-plan.md), [manual checklist](security/manual-test-checklist.md) |
| [`api/`](api) | Integrators | [API reference](api/api-reference.md) and [`openapi.yaml`](api/openapi.yaml), both generated from one route table by [`gen-api-docs.py`](api/gen-api-docs.py) |
| [`release-process.md`](release-process.md) | Maintainers | How a release is made: versions, support policy, release gates, procedure |

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
   `scripts/security/routes.expected.json` (its 196 core-api routes were all documented on 2026-10-05).
3. **Changes are logged** in the root `CHANGES.md`, as for any other file.

## Status

Reorganised on **2026-10-05**. Known gaps, to be closed as part of defining the release procedure:

- The release version this documentation is aligned to is not recorded yet; the release procedure should set it
  (and re-run the checks in rule 2) at every release.
- The [user manual](getting-started/manual/README.md) is partial by design: its table of contents lists chapters that
  are not written yet, and the chapters that exist do not yet describe editing in App Mode (the phone frame, with responsive classes following it) or capturing a thumbnail from the Mobile/Tablet preview.
- [`guides/headless-sdk.md`](guides/headless-sdk.md), [`guides/dynamic-website-paths.md`](guides/dynamic-website-paths.md) and
  the publishing guides were checked for the names they use (packages, screens) but not re-read line by line.
