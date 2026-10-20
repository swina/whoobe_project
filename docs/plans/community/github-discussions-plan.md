# GitHub Discussions as the one channel for questions

Status: **decided by the owner on 2026-10-20**; the repository setup is done (`docs/github-discussions`); the dashboard Help entry is **implemented** (branch `feat/dashboard-help-link`, for the next release).

## Decision

Questions, ideas and feedback go to **one public place: GitHub Discussions** of the repository. No contact form, no private mailbox for support, no
queue of requests to manage. A public answer helps the next person, costs one person (the maintainer) less than private threads, and matches the
principle of the project: what is asked and answered is in the open, like the tests and the findings.

What stays outside: **vulnerabilities** (privately, see `SECURITY.md`; never a public discussion or issue) and **issues** (a confirmed bug, or a piece
of work that was accepted after a discussion).

## What is in the repository

| File | What it does |
|---|---|
| `.github/DISCUSSION_TEMPLATE/q-a.yml` | the form of a new Q&A discussion: version, how it is run, the goal, what was tried; a warning not to paste secrets and a pointer to `SECURITY.md` |
| `.github/ISSUE_TEMPLATE/config.yml` | the "new issue" page offers **Ask a question** (Q&A), **Suggest an idea** (Ideas) and **Report a vulnerability** (the policy) before a blank issue |
| `CONTRIBUTING.md` | questions and ideas first in Discussions, an issue for a confirmed bug or accepted work |

The categories already exist (Announcements, General, Ideas, Polls, Q&A with accepted answers, Show and tell). Done by hand on GitHub, and not in files:
pin a welcome discussion in Announcements (what to ask where, what to expect: one maintainer, best effort, no SLA), and consider enabling **private
vulnerability reporting** (Settings, Security) so that even security reports stay on GitHub: it is **not** enabled today, and `SECURITY.md` falls back to an e-mail address.

## Where it is linked

README, the site (footer, Developers, Security), the documentation (community and contributing pages), the issue chooser, and the sandbox banner if a link
there is wanted. Not linked: nothing collects an address, a form or a ticket.

## Next release: the dashboard

A **Help** entry in the dashboard that opens, in a new tab, the Discussions page (Q&A) of the project, and a link to the documentation next to it.

- **No data leaves the installation**: the link carries nothing about the installation, the user or the data. A "report with my version" shortcut, if it
  is ever added, only fills a visible field that the person can read and edit before sending (the version of Whoobe, nothing else).
- The address is a setting of the installation (`COMMUNITY_URL`, empty hides the entry), because an organisation that runs Whoobe inside its own
  network may not want a link to the public internet in its administrators' menu; documented with the other environment variables.
- Consistent with "no call home": the link is followed by the person, never by the server.

As built: the setting is read by core-api and returned in the `community` field of the public `/health` answer (the dashboard already asks `/health` every 30 seconds
for the status badge); the sidebar footer shows **Help and questions** (the discussions) and **Docs** (`https://docs.whoobe.dev`), both with `target="_blank"` and
`rel="noopener noreferrer"`, only when the field is present. Unset: the project's Discussions; empty: no entry; a value that is not an http(s) URL: no entry.
Tests: `packages/core/src/community.test.ts` (unit) and `scripts/security/browser/help-link.spec.ts` (the link, its target, hidden when empty).

Out of scope: embedding the discussions in the dashboard, single sign-on with GitHub, a private support desk.

## What is not decided

- Whether to add a short **moderation note** to the welcome post (code of conduct already exists: `CODE_OF_CONDUCT.md`).
- The label or category for "I want to contribute this": Ideas first, then an issue.
