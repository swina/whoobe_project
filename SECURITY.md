# Security policy

Whoobe is software that stores credentials and sits in front of other systems, so security reports are taken seriously and handled privately first.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

- Write to **web@moodgiver.com** with the subject `Whoobe security`, or
- use GitHub's private vulnerability reporting (the repository's **Security** tab, *Report a vulnerability*), if it is enabled on the repository.

Please include:

- what you found and which component is affected (core-api, asset-processor, gateway, admin dashboard, editor, scripts, documentation);
- the version or commit, and how it is deployed (a workspace, the development stack);
- the steps to reproduce it, ideally with a minimal request or a proof of concept;
- what an attacker could do with it, as you see it.

Do not send real secrets or personal data of other people. If you need to demonstrate access, stop at proof.

## What to expect

Whoobe is maintained by one person, so the process is best effort:

1. you get an acknowledgement as soon as the report is read;
2. the report is reproduced and rated, and you are told what is decided;
3. a fix is prepared and released, and the release notes say what was fixed and which versions are affected;
4. the report is disclosed **after** the fix is available, and you are credited if you wish.

There is no bug bounty.

## Supported versions

Security fixes are made for the **latest two minor versions** ([release process](docs/release/release-process.md)). The first release is 0.1.0; older development
snapshots are not supported.

## Scope

In scope: the code in this repository, the generated deployment files and scripts, and the documentation where it gives security-relevant advice.

Out of scope: the security of a third-party service you connect, of your own infrastructure (host, network, TLS certificates, backups) and of the
automation engines Whoobe can call, except where Whoobe's own behaviour makes it worse. Reports that need an already-compromised administrator account, or a
physical access to the host, are rated accordingly.

Before reporting, you may want to read what is already known: the [threat model](docs/release/security/threat-model.md), the
[findings register](docs/release/security/findings.md) (open items and accepted risks, with review dates) and the
[status summary](docs/release/security/status-summary.md).

## Testing in good faith

You are welcome to test your **own** installation of Whoobe. Please do not test systems that belong to others, do not degrade a service for its users, and do not
access, change or keep data that is not yours. Research done in good faith, within these limits, will not be treated as hostile. The public sandbox (if one is
running) is rebuilt every few hours and has its risky features switched off ([sandbox](docs/release/operations/sandbox.md)).

## Hardening your own installation

The operations documents describe how to run Whoobe safely: [secrets and keys](docs/release/operations/secrets-and-keys.md),
[encryption](docs/release/operations/encryption.md), [creating workspaces](docs/release/operations/creating-workspaces.md) and the
[security test suite](docs/release/security/security-test-suite.md) you can run against a throwaway stack.
