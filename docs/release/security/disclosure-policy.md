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

- **Where "private" is.** The repository is public, and **every branch pushed to it is public**: a private branch cannot live there. The private place is
  a **draft security advisory** of the repository (Security > Advisories > New draft; private vulnerability reporting is enabled) with its
  **temporary private fork**: a private copy of the repository, free, where the failing test and the fix are developed as a branch and a pull request
  only the owner and the people invited to the advisory see. Publishing the advisory merges the fork into the public repository. If the advisory
  cannot be used, the fallback is a branch that is **never pushed** (kept in a local clone, with an encrypted copy of the patch: `git format-patch`
  and `age`), never a branch on `origin`.
- **The test.** A suite entry written with `known()` (`scripts/security/lib/known.ts`) asserts the secure behaviour and is expected to fail: it
  names the finding. For a High or Critical finding it is **not** committed to the public branch or pushed to any branch of the public repository; it
  lives in the private place above and is run from there. It joins the public suite, as a normal `it`, in the commit that fixes the defect.
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
3. **Deadlines.** The project is one person, best effort, and says so; these are the targets, and a reporter is told at once when one will be missed:
   - the report is **acknowledged within 7 days**;
   - a High or Critical finding is **fixed and released within 30 days** of being rated (target, not a promise); Medium within 90 days;
   - the finding is made public **at the release that fixes it**; if no fix has been released **90 days after the report**, the reporter may disclose it
     and the project then publishes its own entry with what is known and the mitigation; a longer time is agreed with the reporter beforehand, in writing;
   - a defect that is **actively exploited** is disclosed as soon as there is a mitigation, fix or not, with the advice to operators.
   These times follow the common practice of coordinated disclosure (90 days) and are shorter for what the project finds itself, since there is nobody to wait for.
4. Only the latest two minor versions get the fix ([release process](../release-process.md)); the notes say which.

## Order of work for a High or Critical finding

1. Rate it; open a draft advisory, start its temporary private fork, write the failing test and the draft register entry there.
2. Fix it in the fork; run the full suites with the private test.
3. Release: publish the advisory (the fork merges), move the test to the public suite as a normal `it`, write the register entry with `Public from`, write the *Security* section of the
   release notes, tag.
4. Delete CI artifacts that described it, if any (above).

The commit that fixes a High or Critical finding is public the moment it reaches `master`, whatever its title says: anyone reading the diff (a fork that
syncs, a watcher) can see what it closes. So the advisory is published, the fork merged, the tag pushed and the images released **in one sitting**, with the
release notes already written; the fix is never pushed on its own days before the release.

## Contributions from outside

A pull request from a fork that fixes a High or Critical defect in public would disclose it. When one arrives, or a contributor mentions a security
problem in an issue or a pull request, the answer is the one of `SECURITY.md`: ask to report it privately (the Security tab, *Report a vulnerability*,
or the email), close or convert the public thread without repeating the details, and handle it as any other report. The contributor is credited if they wish.

## Not covered

A vulnerability in a dependency that has a public advisory is not secret: it follows the normal process (`pnpm audit`, the supply-chain page).
A defect in the operator's own configuration is not a finding of the product.
