# Settings (configuration)

Whoobe is configured in two places: the **dashboard**, for everything an administrator changes while it runs, and the **environment** of the
installation, for secrets, addresses and switches that are set when it starts. This section maps both.

| Document | What it covers |
|---|---|
| [Settings guide](settings-guide.md) | Every card of the dashboard's *Settings*, the AI cards, per-website settings and mail, who may change them, and where each value is stored |
| [Configuration reference](../operations/configuration-reference.md) | Every environment variable of the services |
| [Secrets and keys](../operations/secrets-and-keys.md) | Which key protects which secret, what happens if it is lost |
| [Authentication and authorization](../architecture/authentication-and-authorization.md) | Roles, permissions and the second factor |
| [Sandbox](../operations/sandbox.md) | The restricted demo profile |

**Rule of thumb.** What is specific to *content* or *a website* (themes, menus, domains, mail sender, upload limits) is a dashboard setting. What
is specific to *the installation* (database, storage, hosts, encryption keys, limits, optional services such as Valkey) is an environment
variable, listed in the configuration reference.
