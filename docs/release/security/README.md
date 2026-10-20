# Security

What protects a Whoobe installation, what has been tested, and what is still open. Written for security officers, architects and reviewers.

## Start with these

| Document | What it tells you |
|---|---|
| [Threat model](threat-model.md) | What is protected, who may attack, the trust boundaries, the threats, the controls and the residual risks |
| [Status summary](status-summary.md) | One page: where security work stands |
| [Findings register](findings.md) | Every finding with its severity and whether it is open |
| [Data protection](data-protection.md) | Personal data, where it is, who can receive it, retention, rights of the data subject |
| [Design decisions](../architecture/design-decisions/README.md) | The security-relevant choices and their trade-offs |

## Controls in detail

| Area | Documents |
|---|---|
| Identity and access | [Authentication and authorization](../architecture/authentication-and-authorization.md); [API clients](../communication/api-clients.md) for applications |
| Credentials and encryption | [Encryption](../operations/encryption.md), [secrets and keys](../operations/secrets-and-keys.md), [API Gateway security](../communication/api-gateway-security.md) |
| Supply chain | [Supply chain, dependencies and SBOM](supply-chain.md) |
| Operations | [Observability and logging](../operations/observability-and-logging.md), [backup and DR](../operations/backup-restore-and-dr.md) |

## Evidence: tests

| Document | What it covers |
|---|---|
| [Test suite summary](test-suite-summary.md) | One page: what the automated suites do and their counts |
| [Automated test suite](security-test-suite.md) | Every suite, what it asserts and does not |
| [Testing plan](security-testing-plan.md) | The phases of the security programme |
| [Results of each release](results/README.md) | **The policy** (results are public, failures included, nothing is self-certified) and **one record per release**, starting with [v0.2.0](results/v0.2.0.md) |
| [Manual checklist](manual-test-checklist.md) | Checks that need a browser or a human eye |
| [Security CI for forks](security-ci-for-forks.md) | What you get when you fork, and how to keep it |

**Not available today** (stated plainly in the [overview](../overview/whoobe-overview.md), chapter 4): single sign-on for staff, a full audit trail
of administrative actions, high availability, a third-party compliance certificate.
