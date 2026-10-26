# Whoobe 0.3.1 - release notes

A patch release of 0.3.0 (*Operate*): security updates of dependencies and of the two nginx images, and two changes to the public sandbox's
visit log. Written from `CHANGES.md` on **2026-10-26**; the procedure is in [`release-process.md`](release-process.md). No new feature, no migration.

## Security

Advisories published by others in third-party packages, found by the nightly `security` run of 2026-10-24 (static scan, `pnpm audit --prod`) and
by the image scan; none was found by the project, so all are public ([disclosure policy](security/disclosure-policy.md)). **Affected: every release
from 0.1.0 to 0.3.0** (the same versions are in the lockfile of each tag).

**No 0.2.1.** The support policy ([release process](release-process.md), section 2) gives security fixes to the latest two minor lines; for this
patch the owner decided (2026-10-26) not to release a 0.2.1: 0.2.0 is one week old and the upgrade from it to 0.3.x has six migrations, tested from
0.2.0 on 2026-10-23. **On 0.2.x, upgrade to 0.3.1.**

| Package | Was | Now | Advisory | Where |
|---|---|---|---|---|
| `zod` | 3.25.76 | 4.6.7 | GHSA-mrhx-c7xc-m3w5 (high): memory exhaustion when an array schema without a length limit validates a large array | core, schema SDK (validation of Data Objects written through the gateway, site specifications, page content) |
| `body-parser` | 1.20.6 | 1.20.9 | GHSA-27r3-jxmh-p828 (high): denial of service via trailing bytes after a compressed body | `express` in core-api, asset-processor, gateway |
| `multer` | 2.4.0 | 2.5.0 | GHSA-q7qp-rjg7-q26m (high): denial of service via a pending file filter after the request is torn down | asset-processor uploads |
| `undici` | 6.28.1 | 6.29.1 | GHSA-xjj6-f33q-929c (high): denial of service via too many content encodings | gateway (OpenAPI parser) |
| `brotli-libs` | 1.2.0-r1 | 1.2.1-r0 | CVE-2026-111497 (high) | the `admin-dashboard` and `whoobe-one-spike` images (nginx alpine base) |

The register entries are F-003 (dependencies) and F-050 (images) in [`security/findings.md`](security/findings.md). `postgres:16-alpine` still carries
the 26 reports of its `gosu` helper (advisory, see 0.3.0).

## Behaviour changes to check before you upgrade

| Change | What you see | What to do |
|---|---|---|
| **Zod 4** validates Data Objects written by API clients, site specifications and page content | the same values pass and fail; some error messages read differently (a site specification's messages are still rewritten in plain words) | a client that matches the exact text of an error message: check it |
| The JSON Schema of a site specification (*Settings > Import site specification > Download*, `GET` of the spec endpoint) describes the element union with `oneOf` instead of `anyOf` | same meaning (each element has its own `kind`) | a tool that does not accept `oneOf`: tell us |
| Sandbox profile: requests from **ClaudeBot** are not written to the visit log; new optional `SANDBOX_UNTRACKED_IPS` in `/etc/whoobe-sandbox.env` (addresses or CIDR ranges left out of the log, see [sandbox](operations/sandbox.md)) | a smaller log | after the next reset, `sudo nginx -t && sudo systemctl reload nginx` once |

**No migration.** Upgrade as for any release (`scripts/workspaces.sh upgrade v0.3.1`, or pull the `0.3.1` images); the images must be rebuilt or pulled,
because the fixes are inside them.

## Known limits

The limits of [0.3.0](release-notes-0.3.0.md#known-limits-of-this-release) still hold. For this release: the API and browser suites, isolation, TLS and
DAST passed on the branch of the fix (run 40218614564); a manual try of the site wizard, the spec import and gateway writes with Zod 4 on a running stack
was not done.
