# For security officers, DPOs and compliance

## Your questions
| Question | Answer and where |
|---|---|
| What are the threats and controls? | [Threat model](../security/threat-model.md) |
| What is the overall status? | [Status summary](../security/status-summary.md), [findings register](../security/findings.md) |
| What testing has been done, and what does it prove? | [Test suite summary](../security/test-suite-summary.md), [automated suite](../security/security-test-suite.md), [plan](../security/security-testing-plan.md), [manual checklist](../security/manual-test-checklist.md) |
| How are identity and access handled? | [Authentication and authorization](../architecture/authentication-and-authorization.md); applications: [API clients](../communication/api-clients.md) (scopes, deny by default, same 404 for "not there" and "not yours") |
| How are secrets protected? | [Encryption](../operations/encryption.md), [secrets and keys](../operations/secrets-and-keys.md), [credentials stay on the server](../architecture/design-decisions/credentials-stay-on-the-server.md) |
| Which personal data, where, how long, which third parties? | [Data protection](../security/data-protection.md); AI providers see only what a person sends: [AI features](../ai/ai-features.md) |
| What is exposed to the Internet? | The public surface is read-only and published-only: [architecture, section 5](../architecture/architecture-overview.md), [draft is never public](../architecture/design-decisions/draft-is-never-public.md) |
| What goes into the software? | [Supply chain](../security/supply-chain.md): SBOM, licences, provenance |
| What happens to our logs and audit trail? | [Audit log](../operations/audit-log.md) (administrative actions, append-only) and [observability and logging](../operations/observability-and-logging.md) |
| Can we run it in our environment? | One workspace per organisation: [design decision](../architecture/design-decisions/one-workspace-per-organisation.md) |

## Known gaps to put in your risk assessment
Single sign-on is one OpenID Connect provider (no SAML or LDAP, no single logout; a session already open outlives a person's removal at the provider until it
is deactivated), the audit log records successful actions only, retention and data subject requests do not reach backups and retention is off until you set a number,
two-factor authentication and the password policy are off until an administrator turns them on, no per-website roles, no full Content-Security-Policy on the
admin applications, no malware scanning, no third-party certification, throttling counted in memory per process (shared counters with the optional Valkey),
a stolen client token valid until it expires. The evidence is the project's own; nobody
outside the team has audited it. See the [overview, chapter 4 and 8](../overview/whoobe-overview.md).

## Reading path
[Threat model](../security/threat-model.md), [status summary](../security/status-summary.md), [findings](../security/findings.md),
[data protection](../security/data-protection.md), [encryption](../operations/encryption.md), [supply chain](../security/supply-chain.md), then the
[design decisions](../architecture/design-decisions/README.md).
