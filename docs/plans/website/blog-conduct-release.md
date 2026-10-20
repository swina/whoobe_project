---
title: Conduct: the release that shows its work
slug: conduct-the-release-that-shows-its-work
category: Security
author: A. Nardone
date: 2026-10-20
tags: conduct, security, transparency, release
abstract: Whoobe 0.2.0, named Conduct, adds the controls a security officer asks for: an audit log, mandatory two-factor authentication, single sign-on, data subject tools and metrics. Just as important is how it was released: with the tests, the results (the failed runs included) and the limits in the open.
---
Whoobe 0.2.0 came out on 19 October 2026. We named it **Conduct**, because it is about the conduct of an installation: who may do what, who did what, what happens to personal data, how to know that it is running. This post lists its five pillars. For each one it also says how you can check it without trusting us, because we think that is what an open source project owes the people who run it.

## What Conduct adds

### 1. An audit log that cannot be edited

Every administrative action (users, roles, websites, settings, publication, integrations, single sign-on, data subject requests) is recorded: who, from which address, what, on which target, and the fields before and after. Secrets are recorded as "changed", never as a value. The table is append-only: the database itself refuses to update or truncate it. A route that changes something has to say whether it is audited, and a test fails for a new route that does not decide. *Where it stops:* it records successful actions; a refused attempt is not in it. [Audit log](https://docs.whoobe.dev/operations/audit-log/)

### 2. A second factor you can require, and a password policy

An administrator chooses the roles that must use two-factor authentication. A user of such a role with no second factor is led to enrolment at the next sign-in and has no session until it is done. A password policy (length, character classes, never the e-mail address) applies wherever a password is set. *Where it stops:* both are off until you set them, and an upgrade changes nothing by itself.

### 3. Single sign-on with OpenID Connect

Authorization code with PKCE, roles taken from a claim at each sign-in, provisioning and linking by a verified e-mail only, and a local break-glass sign-in for administrators. *Where it stops:* one provider at a time. We tried it against a mock and a real Keycloak 26. Microsoft Entra, Okta and Google follow the same standard and we have **not** tried them, so we do not say they work. SAML and LDAP are not built. [Single sign-on](https://docs.whoobe.dev/operations/single-sign-on/)

### 4. Data subject requests and retention

Find, export and erase what is held about one person by one value (an e-mail): form submissions, the files they uploaded, the mail log. A dry run first, the value typed again to erase, and the action audited with a fingerprint and never with the value. Staff accounts are reported, never erased by it. Retention per data class is applied daily, and it is off until you set a number. [Data subject requests](https://docs.whoobe.dev/operations/data-subject-requests/)

### 5. Readiness and metrics

`/health` answers 503 when the database does not answer, `/health/live` is the cheap liveness check, and `/metrics` (Prometheus) is off unless you set a token. [Observability](https://docs.whoobe.dev/operations/observability-and-logging/)

Around these five: events for files and pages, with the same signed deliveries and loop guard as for objects, and a second CDN mirror provider, Cloudflare Images. The [release notes](https://docs.whoobe.dev/release-notes-0.2.0/) have the rest, including what changes behaviour on upgrade.

## The thread: showing the work

If a security officer asks "is it secure?", the honest answer is that nobody can prove it. What we can do is say what we tested, against which objectives, and publish what came out. With Conduct we tried to do that in five concrete ways.

- **The tests are in the repository.** The API, browser, isolation, DAST, TLS and static suites are in `scripts/security`. You can run them against a disposable stack, and they refuse to run against anything else.
- **Every finding is in a register, open or closed.** At the time of the release there were 62, nine of them High, all fixed. The ones still open are listed, with the reason. [Findings](https://docs.whoobe.dev/security/findings/)
- **Each release has a results record.** Not "tests passed": the run, the commit, every job and its result, what differs between the tested commit and the tag, and what the run did not cover. [The record for 0.2.0](https://github.com/swina/whoobe_project/blob/master/docs/release/security/results/v0.2.0.md)
- **Failures are in it.** On release day, two runs failed before the green one: an audit test that was not deterministic, the browser tests after a change of navigation, and a vulnerability in a library of the dashboard and editor images (libx11), fixed in the commit that was then tested. They are in the public history of the CI and in the record.
- **The limits have their own place.** What is not there (one identity provider, no SAML or LDAP, no high availability, no certification) is [on one page](/security#not-there), not in the small print.

The record also says that the tag is not exactly the commit that was tested: it adds the version number to 23 package files, the changelog and one line of documentation. No code.

## What we do not claim

We do not say “our code is secure”. A green run means that these checks passed on this code at this commit. It is not an audit, a penetration test or a certification, and there has not been an outside one. The coverage has holes, and we list them: SQL fuzzing of most endpoints, prompt injection against the AI features, a full Content-Security-Policy for the admin and the editor, a live host with a public certificate. This is one project with one architect, and the numbers go out of date quickly: the exact ones are in each run's report.

What we claim is smaller and can be checked: these controls exist, this is how they were tested, and anyone can read, rerun and challenge the results. We think that is the minimum an open source project should be able to show.

## If you want to check

Try the [sandbox](https://sandbox.whoobe.dev), read the [results record](https://github.com/swina/whoobe_project/blob/master/docs/release/security/results/v0.2.0.md), the [findings](https://docs.whoobe.dev/security/findings/) and the [security page](/security). If a claim here is not backed by something you can open, tell us.
