# Whoobe 0.3.2 - release notes

A patch release of 0.3.0 (*Operate*): the `publisher` image without the build tools it carried, and the image scan of the CI now covering it. Written
from `CHANGES.md` on **2026-10-26**; the procedure is in [`release-process.md`](release-process.md). No migration.

## Security

**F-063** ([`security/findings.md`](security/findings.md)), found by the project on 2026-10-26 while checking the published 0.3.1 images. The
`publisher` image (the optional service that runs the site generator for the dashboard's *Publish* tab) was never in the image scan of the
`security` workflow: the scan took its list from `docker compose config --images`, and the publisher sits behind the compose profile `publisher`.
The published `whoobe-publisher:0.3.1` has **171 fixable HIGH/CRITICAL** reports (11 critical), almost all in build tools shipped with it: the Go
standard library of three `esbuild` binaries, the `pnpm` 9.0.0 left in the corepack cache, the `npm` of the node base image, and dev packages of
the build tree (`vite`, `vitest`, `tinypool`, `devalue`, `brace-expansion`). **Affected: the `publisher` image of 0.3.1**; earlier releases were
built the same way and were not measured. The other five images are not affected.

Exposure: the publisher is optional, publishes no port and runs only the site builds the dashboard asks for; none of these tools runs as a server,
but they do run on content written by editors.

What changed:

- the publisher is built like the other services: the runtime base without pnpm, corepack or npm, and the pruned production tree. **0** fixable
  HIGH/CRITICAL on the new image;
- the SDK packages the generator puts in each generated site (`vendor/*.tgz`) are packed when the image is built, so the image needs no package
  manager; outside the image the generator still packs them with `pnpm`;
- the image scan of the `security` workflow builds and scans the publisher too, so a release cannot again ship it unscanned.

## Behaviour changes to check before you upgrade

| Change | What you see | What to do |
|---|---|---|
| The `publisher` image has no `pnpm`, `npm` or `corepack` | the same generated sites; the SDK tarballs in `vendor/` come from the image | a script of yours that ran a package manager *inside* the publisher container: run it elsewhere |
| New environment variable `WHOOBE_SDK_TARBALL_DIR`, set in the image to `/opt/whoobe-sdk` ([configuration reference](operations/configuration-reference.md)) | nothing | do not override it in your compose file |
| Documentation sites: `whoobe-publish --kind docs` has three new optional flags, `--version-label`, `--version-url` and `--repo-url` (a version badge after the site title, a repository link in the header) | nothing until you pass them | see [documentation sites](content/documentation-sites.md) |

**No migration.** Upgrade as for any release (`scripts/workspaces.sh upgrade v0.3.2`, or pull the `0.3.2` images). Only the `publisher` image
changes in substance; pull or rebuild it if you run the `publisher` profile.

## Known limits

The limits of [0.3.0](release-notes-0.3.0.md#known-limits-of-this-release) and [0.3.1](release-notes-0.3.1.md#known-limits) still hold. For this
release: a publish job was run in the new image through the publisher's own job runner (Vue and Next sites, against a local API), not from the
dashboard of a running workspace with the `publisher` profile; the arm64 image is built and scanned only by the release workflow.
