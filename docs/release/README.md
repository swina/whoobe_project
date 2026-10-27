# Whoobe - release documentation

The documentation in this folder describes the product **as it is delivered and operated**. Everything here has been
checked against the code at the time of the last reorganisation (see [Status](#status)); the design history of the
project stays in [`../plans`](https://github.com/swina/whoobe_project/tree/master/docs/plans) and is deliberately not part of a release.

**Aligned to release:** v0.3.2 (2026-10-27) - see [`release-process.md`](release-process.md)
**0.3.3** shows the tokens of every AI answer and can record them per person, off by default, with a retention period for the AI history ([release notes](release-notes-0.3.3.md)); **0.3.2** is a patch of 0.3.0 that removes the build tools from the `publisher` image ([release notes](release-notes-0.3.2.md)); **0.3.1** brought security updates ([release notes](release-notes-0.3.1.md)). New in **0.3.0**, *Operate* (see the [release notes](release-notes-0.3.0.md)): fleet commands over many workspaces, install from released
images, the `private` profile for a network with no route to the internet, custom fonts, a site specification any LLM can write, the Generate
Website Wizard, Kits, and the disclosure policy. Earlier releases: [0.2.0](release-notes-0.2.0.md) (*Conduct*: audit log, two-factor
authentication, single sign-on, object events), [0.1.1](release-notes-0.1.1.md), [0.1.0](release-notes-0.1.0.md).

**Deployment model.** One workspace per organisation. Divisions of the same entity share a workspace and are told apart with
roles; different companies or legal entities get separate workspaces. Whoobe is not a shared multi-tenant platform
([why](architecture/design-decisions/one-workspace-per-organisation.md)).

## 1. Start here

| If you want to... | Read |
|---|---|
| understand what Whoobe is and why a platform like it | [What Whoobe is](overview/what-is-whoobe.md) (one page) |
| see what it can do for you, with everyday examples | [What you can do with Whoobe](overview/what-you-can-do.md) |
| judge fit, cost and limits | [Full overview](overview/whoobe-overview.md) |
| understand how it is built and why | [Architecture overview](architecture/architecture-overview.md), [design decisions](architecture/design-decisions/README.md) |
| read what is written for **your role** | [Documentation by role](by-role/README.md): CEO, IT manager, operators, security and compliance, marketing, data owners, developers |
| learn to use it | [User manual](guides/user-manual/README.md) |
| install it | [Operations: start here](operations/README.md) |

## 2. The pillars

The detailed documentation is organised by what Whoobe does. Each pillar has an index page.

| Pillar | What it is | Index |
|---|---|---|
| **Content** | Websites, pages, snippets, themes, languages, documentation sites, publishing to sites, apps and headless | [content/](content/README.md) |
| **Data** (PIM, MDM) | Data Classes and Objects, relations, languages, publish workflow, import from Pimcore, using data in pages and apps | [data/](data/README.md) |
| **Communication** | Integrations, Automations, the Client Hub (API clients), forms and mail | [communication/](communication/README.md) |
| **DAM** | The media library: storage, folders, visibility, transforms, CDN mirror | [dam/](dam/README.md) |
| **AI** | Generating pages, snippets and images, translation, Figma import; your provider, your key | [ai/](ai/README.md) |
| **Settings** | Configuration in the dashboard and in the environment | [settings/](settings/README.md) |
| **Security** | Threat model, findings, data protection, test evidence, supply chain | [security/](security/README.md) |
| **Operations** | Install, configure, back up, upgrade, observe | [operations/](operations/README.md) |
| **Guides** | The user manual and an index of every how-to | [guides/](guides/README.md) |

## 3. Other sections

| Section | What is in it |
|---|---|
| [`overview/`](https://github.com/swina/whoobe_project/tree/master/docs/release/overview) | [What Whoobe is](overview/what-is-whoobe.md), [what you can do with it](overview/what-you-can-do.md), the [full overview](overview/whoobe-overview.md) (what it does and does not do, costs, fit, by role), the dated [executive summary](overview/executive-summary.md) |
| [`architecture/`](https://github.com/swina/whoobe_project/tree/master/docs/release/architecture) | [Architecture overview](architecture/architecture-overview.md), [data and storage](architecture/data-and-storage.md), [authentication and authorization](architecture/authentication-and-authorization.md), and the [design decisions](architecture/design-decisions/README.md) |
| [`by-role/`](by-role/README.md) | Reading paths for CEO, IT manager, operators, security and compliance, marketing, data owners, developers |
| [`api/`](https://github.com/swina/whoobe_project/tree/master/docs/release/api) | [API reference](api/api-reference.md) and [`openapi.yaml`](https://github.com/swina/whoobe_project/blob/master/docs/release/api/openapi.yaml), both generated from one route table by [`gen-api-docs.py`](https://github.com/swina/whoobe_project/blob/master/docs/release/api/gen-api-docs.py) |
| [`whoobe-history.md`](whoobe-history.md) | The story of Whoobe |
| [`credits.md`](credits.md) | Thanks to the open-source projects Whoobe is built with and works with; the legal record is [`THIRD_PARTY_NOTICES.md`](https://github.com/swina/whoobe_project/blob/master/THIRD_PARTY_NOTICES.md) |
| [`community/`](community/why-sponsor-and-contribute.md) | Why sponsor and why contribute to open-source projects, and how to help Whoobe; [how Whoobe evolves](community/project-evolution.md): what comes next, what is built only when funded, and the rule that the code stays MIT |
| [`release-process.md`](release-process.md) | How a release is made: versions, support policy, release gates, procedure |
| [`release-notes-0.3.3.md`](release-notes-0.3.3.md), [`0.3.2`](release-notes-0.3.2.md), [`0.3.1`](release-notes-0.3.1.md), [`0.3.0`](release-notes-0.3.0.md), [`0.2.0`](release-notes-0.2.0.md), [`0.1.1`](release-notes-0.1.1.md), [`0.1.0`](release-notes-0.1.0.md) | What each release contains, behaviour changes to check before upgrading, known limits |

**Reading paths.** *Architect*: architecture overview, data and storage, authentication, capacity. *DevOps*: creating workspaces, configuration
reference, secrets and keys, backup/DR, upgrade, observability. *Security / compliance*: threat model, status summary and findings, data
protection, supply chain, encryption. More in [documentation by role](by-role/README.md).

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
   `scripts/security/routes.expected.json` (all 228 core-api routes are documented, checked by `scripts/release/check-docs.py`). The same
   script fails when an environment variable read by the services or listed in `.env.example` is missing from the
   [configuration reference](operations/configuration-reference.md).
3. **Changes are logged** in the root `CHANGES.md`, as for any other file.

## Status

Reorganised on **2026-10-05**; technical layer (architecture, operations, security reviews) added on **2026-10-09**; restructured by pillar, with the platform overview,
design decisions, reading paths by role and the pillars Data, AI and Settings, on **2026-10-13**.
The documentation gate of the release (`./scripts/release.sh check`, `scripts/release/check-docs.py`) passes: every core-api
route documented, no broken link or quoted repository path, every environment variable documented.

### What a documentation release still needs

| Item | State | Owner / next step |
|---|---|---|
| Alignment line (the release this documentation matches) | set by `scripts/release.sh prepare` | release manager |
| Technical set for architects, DevOps and security (`architecture/`, `operations/`, `security/`) | **written 2026-10-09 from the code**; statements that depend on running systems (TLS on a live host, upgrade, restore, load, multi-replica) are marked as untested | review by someone other than the author; rehearse the runbooks once ([backup](operations/backup-restore-and-dr.md), [upgrade](operations/upgrade-and-migrations.md)) |
| Findings found by the review: F-055 to F-058 | recorded in [`security/findings.md`](security/findings.md); **fixed 2026-10-09** (see the status summary, section 3) | none |
| Security status summary, DAST, manual security checklist | summary updated 2026-10-23; DAST run on the release candidate (run 39934951757, all jobs green); the **manual checklist was not repeated** for the features added since 0.2.0 (see the status summary, section 3) | run the checklist on the release commit, or accept in the release notes |
| SBOM | `scripts/release/sbom.sh` works (CycloneDX, 669 components in the source tree); not attached automatically | attach to the GitHub Release; automate in `release.yml` |
| Image digests, signatures, provenance | published by `release.yml` on a tag: amd64 and arm64 images on ghcr.io, signed by digest, with a source SBOM on the draft GitHub Release (v0.1.1, v0.2.0) | [release process](release-process.md) section 7 |
| Bare-metal guides (`operations/deployment.md`, `miniguide-deployment.md`) | flagged as not re-verified; the container workspace is the tested path | rewrite or retire |
| [User manual](guides/user-manual/README.md) | partial by design: chapters listed in its table of contents are not written; no App Mode, thumbnail capture, documentation-site, form-upload chapters (the guides cover them) | write after the release |
| [`content/headless-sdk.md`](content/headless-sdk.md), [`content/dynamic-website-paths.md`](content/dynamic-website-paths.md), publishing guides | names checked, not read line by line | review |
| [Executive summary](overview/executive-summary.md) | positioning text dated 2026-09-18; not a technical reference | refresh before external use |
| Runbooks: restore, upgrade, workspace removal and re-creation | restore of a destroyed workspace and the upgrade from the previous release are run by scripts (`rehearse.sh`, `upgrade-test.sh`); the public host was upgraded by hand 2026-10-19; not run on a customer's host and data | the operator rehearses once and notes the date |
| Generated documentation sites | the product can publish this folder as a documentation site (Markdown, index, search); published at https://docs.whoobe.dev from the site "whoobe docs release" (re-upload the folder to the DAM, generate with `whoobe-publish --kind docs --strict`, copy to the host) | regenerate after each release |
| Languages | English only | |
