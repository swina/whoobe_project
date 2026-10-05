# Release process

How a Whoobe CMS release is made. Decisions taken on 2026-10-05: one aligned product version, first release
**0.1.0**, container images published on **ghcr.io**, security fixes for the **latest two minor versions**.

Status of the automation: the gates and the preparation step (`scripts/release.sh`) exist and are described below.
Publishing the container images and the GitHub Release from a tag (`release.yml`) is the next step and is **not built
yet**; until then, steps 5 and 6 are manual.

## 1. Versions

- **One version for the whole product**, in the form `MAJOR.MINOR.PATCH`. The root `package.json` and every package
  under `apps/`, `packages/` and `packages/sdk/` carry the same number (`scripts/security` is a test package and is
  not part of it). The SDK packages (`@whoobe-cms/*`) are versioned with the product, not on their own.
- While the version starts with `0.`: a **minor** release may change behaviour or break compatibility, a **patch**
  release contains only fixes (including security fixes and base-image updates).
- A release is the git tag `vMAJOR.MINOR.PATCH` on a commit of `master`, or of a `release/MAJOR.MINOR` branch for a
  patch of an older line. The tag is annotated and never moved.

## 2. Support

Security fixes are made for the **latest two minor versions** (for example, with 0.3.x current: 0.3.x and 0.2.x).
Anything older gets no fix: upgrade. A fix lands on `master` first, then is cherry-picked to the `release/` branch of
the other supported line and released as a patch of both.

## 3. What a release contains

| Artifact | Where |
|---|---|
| Source | the tag, and the GitHub Release page |
| Container images, one per service, referenced by digest | `ghcr.io` (see step 5) |
| Documentation | `docs/release/` at the tag; `docs/release/README.md` states the release it is aligned to |
| API description | `docs/release/api/openapi.yaml`, attached to the GitHub Release |
| Security evidence | reports of the CI run on the release commit, attached to the GitHub Release |
| Release notes | draft from `CHANGES.md`, edited by hand |

## 4. The gates

`./scripts/release.sh check` runs them on the current commit and changes nothing.

| Gate | Automatic | What it checks |
|---|---|---|
| Git | yes | clean working tree; on `master` or `release/*`; HEAD is pushed, so the CI result belongs to it |
| CI | yes | the `security` workflow succeeded on exactly this commit, **and** its DAST job (OWASP ZAP) succeeded on it. DAST does not run on push: start the workflow by hand with *Also run the ZAP DAST scan* ticked, on the release commit |
| Documentation | yes | every core-api route is in the API route table; `api-reference.md` and `openapi.yaml` equal what the generator produces; no broken link, no `docs/...` path or quoted repository path that does not exist; the alignment line is present |
| Upgrade test | **no** | install the previous release, load data, upgrade to this commit, check the migrations and a login. Not automated yet - the most valuable test still missing |
| Fresh install | **no** | follow `docs/release/operations/creating-workspaces.md` on an empty host |
| Behaviour changes | **no** | operators are told about new or changed environment variables and defaults, in the release notes |
| Security summary | **no** | `docs/release/security/status-summary.md` is current and its open items are acknowledged |

The non-automatic gates are printed as a reminder every time; they are the release manager's responsibility.

## 5. Procedure

1. **Freeze.** Merge what goes in; wait for the `security` workflow on the last commit; start the DAST run on it.
2. **Gates.** `./scripts/release.sh check` - fix what fails, do the manual gates.
3. **Prepare.** `./scripts/release.sh prepare 0.1.0`. After the gates pass, it
   - sets the version in the root and in every product package (a version must be higher than the latest `v*` tag);
   - adds a `# Release vX.Y.Z - date` marker and a release entry at the top of `CHANGES.md`. Everything under a
     marker, down to the next one, belongs to that release; entries above the newest marker are unreleased;
   - writes the alignment line of `docs/release/README.md`;
   - drafts `.release/notes-vX.Y.Z.md` (git-ignored) from the entry titles. Edit it: highlights, behaviour changes.

   `--dry-run` shows the plan without writing. The script does not commit, tag or push.
4. **Commit and tag**, by hand, as the script prints:
   `git commit -m "Release vX.Y.Z"`, `git tag -a vX.Y.Z -m "Whoobe CMS vX.Y.Z"`, `git push origin <branch> --follow-tags`.
5. **Publish images** *(to automate in `release.yml`)*: build each service image from the tag and push it to
   `ghcr.io/<owner>/whoobe-<service>:X.Y.Z` (plus `X.Y`), record the digests in the release notes.
6. **Publish the release** *(partly manual until `release.yml`)*: create the GitHub Release from the tag, with the
   notes, `openapi.yaml` and the CI security reports; publish it after review.

## 6. Patches and security updates

- A patch release follows the same steps from the relevant branch. Typical triggers: a CVE in a dependency or in the
  pinned base image (as with `libpcre2` and `perl-base` in the Debian runtime image on 2026-10-05), a vulnerability
  found by the security suites, a regression.
- For a security fix, the release notes say what was fixed and which versions are affected; supported versions get the
  patch at the same time.

## 7. Not done yet

- `release.yml` (images on ghcr.io, GitHub Release, attachments) - step 5 and 6 above.
- The automated upgrade test.
- Pinning the base images' freshness: the pinned digests lag behind Debian's security updates (see `CHANGES.md`,
  2026-10-05), which today costs a patch release or a manual `apt-get` upgrade line in the `Dockerfile`.
