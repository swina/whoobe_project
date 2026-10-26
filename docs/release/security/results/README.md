# Security results: always public, failures included

Whoobe is open source, and open source earns the name by **showing its work**. We do not certify our own code and we do not say
“our code is secure”. What we say is what we tested, against which objectives, with which tools, and what the results were. All of it is in this repository
or in the public history of its CI, and it stays there.

## What we publish, and where

| What | Where | When |
|---|---|---|
| The tests themselves, so anyone can run them | `scripts/security/` (API, browser, isolation, DAST, TLS, image and static suites), `scripts/restore/`, `scripts/backup/selftest.sh` | always, with the code |
| What each suite asserts, and what it does not | [`security-test-suite.md`](../security-test-suite.md), [`security-testing-plan.md`](../security-testing-plan.md), [`manual-test-checklist.md`](../manual-test-checklist.md) | updated with the suites |
| Every finding, open or closed, with its severity | [`findings.md`](../findings.md) (register `F-0xx`) | when it is found, not when it is fixed |
| The state of the security work on one page, with the open items and what is **not** covered | [`status-summary.md`](../status-summary.md) | every release |
| **The result of the tests of each release**, passes and failures | `results/vX.Y.Z.md` in this folder (the first is [`v0.2.0.md`](v0.2.0.md); latest [`v0.3.1.md`](v0.3.1.md)) | every release, before it is published |
| The CI runs themselves | the repository's Actions tab: the runs and their logs are public | every push, nightly and on request |
| The reports of the run on the release commit | attached to the GitHub Release | every release |
| How the code is written, including the use of an AI assistant | [`docs/plans`](https://github.com/swina/whoobe_project/tree/master/docs/plans) (written plans, decisions and what was left out) | with the work |

The raw reports of a local run (`scripts/security/reports/`) are not committed; the record in `results/` and the CI runs it points to are what
stays.

## The rules

1. **Failures are published, not hidden.** A red run, a finding that is still open and a risk that was accepted are written down with the reason,
   the owner and a review date. A release record lists the runs that failed before the green one.
2. **A result says what it says, and no more.** A green run means that these checks passed on this commit. It does not mean there are no
   vulnerabilities, and it is not an audit, a penetration test or a certification. Each record has a section on what the run did not cover.
3. **No release without its record.** `results/vX.Y.Z.md` is part of the release procedure ([`release-process.md`](../../release-process.md)).
4. **What changed after the test is stated.** If the release commit is not the commit that was tested, the record says what differs.
5. **Nothing is tested against production.** The suites refuse to run against anything but a disposable local stack.
6. **Corrections are public too.** A record that was wrong is corrected in a new commit that says so, never rewritten silently.

Anyone who finds a problem, or a claim these documents cannot back, can report it: [SECURITY.md](https://github.com/swina/whoobe_project/blob/master/SECURITY.md) for vulnerabilities,
an issue for everything else.
