# Supply chain, dependencies and build integrity

What goes into a Whoobe release, how it is checked, what a consumer can verify, and what is not done yet. For
procurement and security teams that need an SBOM, licence information and a statement about build provenance.

## 1. What a release is built from

| Input | Control |
|---|---|
| Source | one git repository, tagged `vMAJOR.MINOR.PATCH` on `master` (annotated tag, never moved); one product version for every package ([release process](../release-process.md)) |
| JavaScript dependencies | pnpm workspaces; **`pnpm-lock.yaml` is committed** and every image build runs `pnpm install --frozen-lockfile`, so a build cannot pick up a different version than the lockfile names; 669 components in the source SBOM (section 3) |
| Base images | `node:22-bookworm-slim` and `nginxinc/nginx-unprivileged:alpine` **pinned by digest** in the `Dockerfile`; `postgres:16-alpine` pinned by digest in `docker-compose.yml`; Garage built from `docker/garage` (v2.4.1) |
| Build tools in the image | `pnpm`/`corepack`/`npm` exist only in the build stage; the runtime images contain none of them (they carried most of the image CVEs) |
| Generated sites | `packages/publish` vendors the SDK packages as tarballs into the site's own Dockerfile, so a published site does not fetch `@whoobe-cms/*` from a registry |

## 2. Checks that run on every change

All in `.github/workflows/security.yml` (jobs `static`, `stack-tests`, `tls`, `isolation`, plus a monthly ZAP DAST). The thresholds
below are summarised; the exact commands and pass criteria of each tool are in [`security-test-suite.md`](security-test-suite.md):

| Check | Tool | Gate |
|---|---|---|
| Known vulnerabilities in dependencies | `pnpm audit` | fails on any HIGH/CRITICAL not in `scripts/security/static/baseline.json`; each accepted entry has a reason and a **review date** (expired entries fail the run). Accepted today: `xlsx` (2 high, write-only use, no npm fix) and `braces`, until 2027-01-31 |
| Secrets in the repository and history | gitleaks | fails on a finding outside the baseline |
| Code patterns (injection, unsafe `eval`, SQL string building ...) | semgrep | fails on findings outside the baseline |
| Shell scripts | shellcheck | fails |
| Dockerfiles / compose misconfiguration | hadolint, `trivy config` | fails on HIGH/CRITICAL |
| Container images | `trivy image` on the images the stack built | fails on HIGH/CRITICAL with a fix available; the PostgreSQL image is advisory (upstream) |
| TLS configuration | `testssl.sh` against the rendered nginx template | fails below the policy |
| Dynamic scan | OWASP ZAP (active API scan, passive SPA baseline) | monthly or by hand; **required, on the release commit, by the release gate** |
| Dependency updates | Dependabot, monthly, one grouped PR per ecosystem; majors are planned by hand | the static scan runs on each PR |

Heavy suites are limited to master pushes, nightly and manual runs to save CI minutes; the release procedure
requires a green run **on the release commit**, including DAST (`scripts/release.sh check`).

Known residual advisories: PostgreSQL's `gosu` in the upstream image (F-050; MinIO was removed from the stack), the two accepted npm advisories above, and the base-image lag handled by explicit
`apt-get --only-upgrade` / `apk upgrade` lines in the `Dockerfile` that are removed when the pinned digest catches up.

## 3. Software bill of materials

`scripts/release/sbom.sh` writes **CycloneDX 1.7 JSON** to `.release/sbom/` using the same scanner as CI
(`aquasec/trivy`):

- `whoobe-cms-<version>-source.cdx.json`: every component of the lockfile across all workspaces (669 at the time of
  writing);
- with `--images`, one SBOM per service image of the running disposable stack (OS packages included).

Attach the files to the GitHub Release. They are not generated automatically by the release workflow yet.

## 4. Licences

The product is **MIT** (`LICENSE.md`); every product `package.json` declares `"license": "MIT"` and the release gate
checks it.

**Third-party licences.** `THIRD_PARTY_NOTICES.md` (root) lists the production dependencies of every workspace with version, licence and copyright notice, and the
licence texts. It is **generated** by `scripts/release/third-party-notices.py` from the installed packages (`pnpm licenses`) and checked by the release gate:
the check fails when the file is out of date, or when a dependency has a licence that is neither on the permissive allow-list (MIT, ISC, Apache-2.0, BSD,
and similar) nor reviewed with a written reason in the script. Today (617 packages) one is reviewed: the **libvips** binaries of `sharp` (LGPL-3.0-or-later, a separate library, not modified). The editor's animation library, GSAP
(a proprietary licence with a restriction on visual animation builders), was **removed on 2026-10-13**: element animations now run on the browser's Web Animations
API ([plan](https://github.com/swina/whoobe_project/blob/master/docs/plans/cms/replace-gsap.md)), and the gate would fail if it came back. Packages whose metadata lacks a licence (two) are set to MIT by hand after reading their licence files. Operating-system packages in the images are not covered
(the image SBOMs carry them). A legal review of the inventory has not been done.

Fonts loaded from Google Fonts by the editor, dashboard and generated sites are third-party content under their own
licences (and a privacy consideration, see [data protection](data-protection.md)).

## 5. Provenance and signing - what a consumer can and cannot verify

| Claim | Today |
|---|---|
| The tag is the reviewed source | git tag, annotated and signed; `release.yml` stops if GitHub does not verify the signature (**from the first release made with this workflow**; v0.1.0 to v0.2.0 tags are not signed; commits are not signed) |
| The images match the tag | images are built from the tag by `release.yml` (amd64 and arm64) and pushed to `ghcr.io` |
| The images are signed | **yes**, by digest with cosign (keyless, GitHub OIDC), plus a SLSA build provenance attestation (`actions/attest-build-provenance`, from the first release made with this workflow) |
| Images pinned by digest in the release notes | the digests are appended to the draft release notes by `release.yml` |
| Reproducible builds | the inputs are pinned (lockfile, digests) but a bit-for-bit reproduction has not been checked |

Until `release.yml` exists, a consumer who needs assurance should build from the tag themselves
(`docker compose up -d --build` uses only the pinned inputs) and compare with the published digests.

## 6. Incoming code

- Third-party code inside the product: the **gateway plugins** (`GATEWAY_PLUGINS_PATH`) are arbitrary code loaded at
  start with the gateway's privileges; treat the folder like deployed code. Vendor **presets** and **mail provider
  definitions** are JSON, not code.
- Generated sites run with the credentials their operator gives them; the CMS never ships its own secrets into them
  (the site key is the site's own and belongs on its server).
- Contributions: pull requests run the static scan; there is no signed-off-by or CLA requirement recorded in the repository.

## 7. Gaps (candidates for the next releases)

Signed commits (tags and image provenance are in place); a licence report with an allow-list policy; a dependency-review check on
pull requests; scanning of the generated sites' dependencies.
