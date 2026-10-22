# Disclosure policy: when a finding becomes public

`SECURITY.md` tells a reporter that a report is handled privately and disclosed **after** the fix is available. This page says what that means
for what the project itself finds (the test suites, the scans, a review), because the repository is public and a test that describes an open
defect is a description of it.

## The rule

| Severity | Where it is recorded while it is open | When the register entry becomes public |
|---|---|---|
| **Critical, High** | Privately (below). Nothing in the public repository names or describes it. | **With the release that fixes it** (the same commit range as the tag), never before. |
| Medium, Low, Info | The public register ([findings](findings.md)) when found, as before. | When found. |

The severity is the one the finding is rated at when it is found; a rating that is lowered after a partial fix (`Medium (was High)` in the register)
does not make the earlier days public retroactively. Findings already in the register were published when found and stay as they are.

## What "private" means in practice

- **The test.** A suite entry written with `known()` (`scripts/security/lib/known.ts`) asserts the secure behaviour and is expected to fail: it
  names the finding. For a High or Critical finding it is **not** committed to the public branch. It lives in a private repository or a private
  branch of the owner's choice (a copy of `scripts/security/` is enough), and is run from there on the owner's machine. It joins the public suite,
  as a normal `it`, in the commit that fixes the defect.
- **The fix.** The commit and the `CHANGES.md` entry that carry it say what was changed in neutral words ("harden input handling in the asset
  service") until the release; the register entry and the release notes then say what it was.
- **The register.** The entry is written in the release commit: the full text, the `Public from` column filled with the release (`v0.3.1`).
- **Reports of the tools.** CI keeps its reports as workflow artifacts (`static-reports`, `stack-test-reports`, `zap-reports`, 30 days) and on a
  public repository anyone signed in to GitHub can download them. The static scanners report known public advisories, which is no secret. The
  **ZAP (DAST) report and the stack-test logs can describe a defect of ours** that is not fixed yet: run the DAST job before a release as
  today, read the report from the run, and if it holds an open High or Critical finding delete the run's artifacts (Actions > the run >
  delete) until the release that fixes it.
- **Discussions and issues.** A High or Critical finding is never discussed in a public issue or pull request before the fix; a pull request that
  fixes one is opened with the neutral title above.

## What an operator can expect

1. **The fix is released first**, as a normal release (signed tag, images, release notes). A release that fixes a High or Critical finding says
   so in its release notes under *Security*, with the register ids (`F-0xx`) and the versions affected, and tells the operator to upgrade
   ([upgrade and migrations](../operations/upgrade-and-migrations.md)). The notes say what the defect allowed and what to do, and no more detail
   than is needed to decide to upgrade.
2. **The register entry is public from that release**, in the same push as the tag.
3. A defect that is being **actively exploited**, or a report from outside that the reporter wants disclosed, is handled as in `SECURITY.md`; the
   project does not promise a deadline (one person, best effort), and agrees the date with the reporter.
4. Only the latest two minor versions get the fix ([release process](../release-process.md)); the notes say which.

## Order of work for a High or Critical finding

1. Rate it; write the failing test and the draft register entry in the private place.
2. Fix it on a branch with a neutral name; run the full suites with the private test.
3. Release: move the test to the public suite as a normal `it`, write the register entry with `Public from`, write the *Security* section of the
   release notes, tag.
4. Delete CI artifacts that described it, if any (above).

## Not covered

A vulnerability in a dependency that has a public advisory is not secret: it follows the normal process (`pnpm audit`, the supply-chain page).
A defect in the operator's own configuration is not a finding of the product.
