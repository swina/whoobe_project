# Contributing to Whoobe

Thank you for thinking about it. Whoobe is open (MIT) and welcomes contributions of every kind, not only code. Please read the
[code of conduct](CODE_OF_CONDUCT.md) first. For security problems, do not open a public issue: see [SECURITY.md](SECURITY.md).

[Why contribute, and what is most needed](docs/release/community/why-sponsor-and-contribute.md) is on the documentation site; the concrete gaps are in
its section 3.1.

## Ways to help

- **Try it and tell.** Install a workspace, run a pilot, tell what was hard (a Q&A or Show and tell discussion, or an issue for a bug). A clear report is a contribution.
- **Test what has not been tested:** other identity providers (Entra ID, Cognito, Auth0), the runbooks (restore, upgrade), load, a live TLS host.
- **Documentation:** corrections, review by a reader who is not the author, translations, unwritten chapters of the user manual.
- **Integrations:** presets for vendors, mail-provider descriptions, automation engines.
- **Code:** bug fixes, tests, features that were discussed first.
- **Security review:** see [SECURITY.md](SECURITY.md) for how to report.

## Before you start

- **Ask or propose in [GitHub Discussions](https://github.com/swina/whoobe_project/discussions)** (Q&A for a question, Ideas for a proposal): it is the one public
  place, there is no form and no private queue. For anything bigger than a small fix, discuss the idea there before you spend the time; an **issue** is for a
  confirmed bug or a piece of work that was accepted. Small fixes and documentation corrections can go straight to a pull request.
- **Read the reasons behind the design:** [what Whoobe is](docs/release/overview/what-is-whoobe.md) and the
  [design decisions](docs/release/architecture/design-decisions/README.md). A change that goes against one of them needs a strong argument and a discussion.

## Setting up

```bash
git clone https://github.com/swina/whoobe_project
cd whoobe_project
pnpm install                  # Node.js 18+ (22 for the images), pnpm 9
```

The [README](README.md) describes the ways to run it (the whole stack in Docker, or only PostgreSQL and S3 in Docker with the services run locally).
Notes that save time:

- The shared packages (`packages/core`, `packages/publish`, `packages/sdk/*`) are consumed from their `dist/` folders: after changing their source, run
  `pnpm build` (or the package's own build) before the services see it.
- The three backends share one database schema through `@whoobe-cms/core`. A change to the schema is a **new, hand-written SQL migration** in
  `packages/core/drizzle` plus its entry in `packages/core/drizzle/meta/_journal.json`; migrations are expand-only (they must not break the previous release).
  They run when core-api starts.
- `pnpm typecheck` and `pnpm lint` run through Turborepo.

## Tests

| What | How |
|---|---|
| Unit tests | in `scripts/security`: `node node_modules/vitest/vitest.mjs run --config vitest.config.ts unit/<file>` |
| API tests on a throwaway stack | `scripts/security/stack.sh up`, `pnpm security:api`, `scripts/security/stack.sh down` |
| Static scans | `pnpm security:static` |
| Browser tests | `pnpm security:browser` |
| The documentation gate | `python3 scripts/release/check-docs.py` |

Add or update a test for the behaviour you change. A change that touches authentication, permissions, uploads, outbound requests, credentials or the
public surface needs a test that proves the rule. How the suites are organised is in the [security test suite](docs/release/security/security-test-suite.md)
and `scripts/security/README.md`.

## The rules of the repository

1. **Log every change in `CHANGES.md`** (root): a dated entry, a brief bulleted summary of what changed, and the branch. See `AGENTS.md`.
2. **Keep the documentation true.** `docs/release` describes what the code does. If you change behaviour, change the page that describes it; paths, commands, variables
   and screen labels in it must exist. The API reference and `openapi.yaml` are **generated**: edit the route table in `docs/release/api/gen-api-docs.py` and run it,
   do not edit the generated files. A new environment variable goes in the [configuration reference](docs/release/operations/configuration-reference.md).
3. **Never commit secrets.** Examples use placeholders; `.env` files are ignored.
4. **Follow the style of the code around you:** naming, comment density, idioms. Comments explain *why*, and point to the plan or decision when there is one.
5. **One logical change per commit,** with a message that says what changed and why in plain sentences. Small pull requests are reviewed faster.

## Pull requests

1. Fork the repository and create a branch from `master`.
2. Make the change, with its tests and documentation, and the `CHANGES.md` entry.
3. Run the relevant tests and `python3 scripts/release/check-docs.py`.
4. Open the pull request: say what it changes and why, link the issue, say how you tested it, and say what you did **not** test.
5. Be ready for review comments; they are about the code, and they are how the project stays maintainable.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE.md) of the project, and that you have the right to submit it. Do not submit code
you do not have the right to share, or code whose licence is incompatible with MIT.
