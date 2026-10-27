# How Whoobe evolves

*Last updated 2026-10-27, release 0.3.2. This page changes when a decision changes; each change is dated in
[`CHANGES.md`](https://github.com/swina/whoobe_project/blob/master/CHANGES.md).*

Whoobe is built today by one person. Whoever evaluates it should know what comes next, what is built only if someone pays for it, and what
the author does not offer. This page says it in one place.

> **Contributors and testers are highly needed.** With one author, what moves Whoobe forward most is not money but people who use it,
> try it and improve it. Much of what is written has been tested by its author only, on one machine. Every report from a real use, every
> test on a setup the author does not have, every review and every pull request makes it more trustworthy for the next person.

## 0. How to help now

**Testers**: try the [sandbox](https://sandbox.whoobe.dev) or install Whoobe on your own machine, use it for something real, and report
what was hard, unclear or broken as an issue on the [repository](https://github.com/swina/whoobe_project/issues). Especially wanted: a
pilot in a small organisation or an agency, other identity providers than Keycloak, a restore and an upgrade on your own host, a load
test, a review of the documentation by someone other than the author.

**Contributors**: code, presets for more vendors, the unwritten chapters of the user manual, translations, an independent review of the
security findings. How to start is in the
[contributing guide](https://github.com/swina/whoobe_project/blob/master/CONTRIBUTING.md); the list of concrete gaps, each one a real
task, is in [why sponsor and contribute, section 3.1](why-sponsor-and-contribute.md).

The 0.4 items in section 2 are open to contributors too: say which one you take in an issue, so the work is not done twice.

## 1. The rules that do not change

- **One codebase, MIT.** Everything Whoobe does is in this repository under the MIT licence. There is no edition, no paid module, no
  private branch and no "community" version with features held back.
- **Funded work is published like any other work.** A feature paid for by an organisation is merged here and released under the MIT
  licence in the release after its delivery, for everyone.
- **"Enterprise" is a way to install Whoobe, not a product.** Like the `sandbox` and `private` profiles: settings, documents and tests in
  the same code.
- **Whoobe excludes no automation engine, and holds no infrastructure of its own.** What runs around it is the operator's choice.

## 2. What comes next

| Release | Contents | State |
|---|---|---|
| **0.3.3** | AI usage per person: the tokens of every AI answer shown to whoever asked, an optional record per person (off by default) with an administrator report; a retention period for the AI history (prompts and answers). | On `master`, to be released |
| **0.4 "Operable"** | What makes every installation, of any size, installable the same way twice, checkable and restorable: one request id across nginx, core-api and the gateway; failed sign-ins, failed two-factor codes and refused permissions in the audit log; the Gateway's administration audited; metrics and readiness for the asset processor and the gateway; a log retention setting; restore and rollback rehearsed on a real host; an installation checklist; the unwritten chapters of the user manual and a guide per role. About 26-34 days of work. | Planned |

The detailed plan, with what was checked in the code and the estimates, is
[`release-0.4-plan.md`](https://github.com/swina/whoobe_project/blob/master/docs/plans/system/release-0.4-plan.md).

## 3. Built when an organisation funds it

These are what an organisation running its own high-availability infrastructure needs. They are **not built in advance**: without an
installation that uses them they could not be verified. The estimates are kept so a request can be answered with a figure.

| Item | Days |
|---|---|
| More than one replica of the services (shared counters and limiters, a migration lock, a two-replica test in CI) | 12-16 |
| A managed database and external object store, and a reference architecture page | 3 |
| A Helm chart (one workspace per release) | 5-8 |
| Tracing (OpenTelemetry, off by default) | 4-5 |
| Alert rules and a Grafana dashboard | 1-2 |
| A hash chain over the audit log, a verify command and an export | 3-4 |
| The `enterprise` installation profile and its checklist | 1-2 |
| A load test on two replicas | 2-3 |

## 4. What funding buys, and what it does not

**It buys** the development, with priority and a date, in a generic form that fits the funder's infrastructure (their host names,
addresses and configuration never enter the repository). The funder can be credited in the release notes.

**It does not buy**:

- **Exclusivity.** Everyone gets the same code.
- **Maintenance.** Funded work is delivered and verified; nothing more is promised. So that it does not stop working unnoticed, each item
  comes with an automatic check in CI where one is cheap (for example the Helm chart rendered and started on a throwaway cluster), and the
  documentation states the version in which it was last verified. An item that cannot be checked in CI is marked *verified in version X*.
- **Installation, training or support.** For now the author works on the code only. Whoobe has no support organisation and no
  service-level agreement.

To fund an item, or to ask for one not listed here, talk to the author (see [why sponsor and contribute](why-sponsor-and-contribute.md),
section 3.2).

## 5. Not planned

Per-class permissions (a release of their own, with their own plan); a control plane for many workspaces (only past about ten
workspaces); native SAML or LDAP; several tenants in one installation; a hosted service. The
[overview](../overview/whoobe-overview.md) lists what Whoobe does not do.
