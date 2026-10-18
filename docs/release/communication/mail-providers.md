# Outgoing mail: SMTP, mail providers and per-website settings

Whoobe sends mail for form notifications, password resets and the test button of the mail screen. How it is sent is
configured in **Settings > Outgoing Mail**, for the whole installation and, if a website needs something different,
for that website alone.

## Whose configuration sends a message

| Mail | Sent with |
|---|---|
| A form notification | the configuration of the **website of the page** the form is in; if that website has none of its own, the default |
| Password reset, the test button without a website chosen | the **default** |
| The test button with a website chosen, "resend" from the log | that website's configuration (or the default it falls back to) |

*Settings for* at the top of the screen picks the scope. The default always exists once it is configured; a website
gets its own with **Give this website its own configuration**, and goes back to the default with **Use the default
again**. Deleting a website deletes its configuration, secrets included.

## What a configuration can be

- **SMTP server**: host, port, TLS, user, password. Any provider that offers SMTP (Brevo, Mailgun, Amazon SES, your
  own server...) works this way.
- **A mail provider** with an HTTP API instead of SMTP. OneSignal is built in; others are one JSON file each (below).

Either way you set the sender (address and name) and, optionally, a blind copy of every message to the sender address.

### OneSignal

1. In OneSignal: **Settings > Email** - verify your sending domain (DNS records), and note the **App ID** and the
   **App API key** (Settings > Keys & IDs). If the key has an IP allow-list, it must include the server that runs Whoobe.
2. In Whoobe: Outgoing Mail > *Send with* **OneSignal**; fill **App ID** and **App API key**; *Sender domain* is the
   verified domain (empty = the default of the OneSignal email settings); *From address* must be on that domain.
3. Save, then use **Email Test** to send one message to yourself.

What to know: OneSignal takes HTML only (a plain-text message is wrapped in HTML that keeps its line breaks), has no
CC (Whoobe refuses a message that needs one instead of dropping it) and accepts up to 5 blind copies. Messages go out
as account/transactional mail (`include_unsubscribed`), so a recipient who unsubscribed from the OneSignal app still
receives a password reset. Each message carries an idempotency key, so a retry cannot send it twice. The id OneSignal
gives the message is kept in the **Mail Log** (hover the provider name). A `403` usually means the plan does not
include email or the key lacks the permission; an answer with an empty id and `errors` means no recipient was
delivered - the log shows OneSignal's own text.

## Secrets

The SMTP password and the provider's secret fields (OneSignal's API key) are **encrypted in the database** and never
sent back to the browser: the form shows only that one is set, and a blank field on save means "keep it". This needs
`MAIL_SETTINGS_ENCRYPTION_KEY` in the server's environment (`openssl rand -hex 32`; new workspaces get one from
`provision-workspace.sh`). Without it the screen says so and refuses to save a secret. **Keep the key**: if it is lost the
saved passwords and keys cannot be read and have to be entered again.

A password saved by an older version (in clear text in the database) keeps working, and is encrypted at the next start
once the key is set.

## Adding a provider

A provider is a JSON file in `packages/core/mail-providers/` (built in) or in the folder named by `MAIL_PROVIDERS_PATH`
(yours, for example a mounted volume; a file there replaces a built-in one with the same `id`). The folders are read
again when a file changes: **no restart**. A file that is malformed or refused is skipped and logged.

```jsonc
{
  "id": "acme",                        // lower case, digits, hyphens; "smtp" is taken
  "label": "Acme Mail",
  "description": "...", "docsUrl": "https://...",
  "configFields": [                    // what the screen asks for
    { "name": "apiKey", "label": "API key", "required": true, "secret": true },
    { "name": "domain", "label": "Domain", "required": true }
  ],
  "request": {
    "method": "POST",
    "url": "https://api.acme.example/v3/{{config.domain}}/messages",   // https only; no placeholder in the host
    "headers": { "Authorization": "Bearer {{config.apiKey}}" },
    "body": { "to": ["{{to}}"], "subject": "{{subject}}", "html": "{{html}}", "from": "{{fromName}} <{{from}}>" }
  },
  "success": {
    "status": [200, 202],              // default: any 2xx
    "failWhen": [{ "path": "errors", "nonEmpty": true }],   // an accepted status that is a failure after all
    "reference": "id",                 // dot path of the provider's id for the message (kept in the log)
    "errorFrom": ["errors"]            // where to read the reason when it failed
  },
  "retry": { "on": [429, 503], "max": 2, "maxWaitSeconds": 10 },   // honours Retry-After
  "capabilities": { "html": true, "text": false, "attachments": false, "cc": false, "bccMax": 5 }
}
```

Placeholders: `{{to}}`, `{{cc}}`, `{{bcc}}` (a list), `{{subject}}`, `{{html}}`, `{{text}}`, `{{from}}` (address),
`{{fromName}}`, `{{replyTo}}`, `{{messageId}}` (unique per message) and `{{config.<field>}}`. A value that is exactly one
placeholder keeps its type (a list stays a list) and **the key is left out when it has no value**; a placeholder inside
longer text becomes text. Values are put into the structure, never pasted into the JSON, so what a message contains
cannot change the request. The call goes through the same outbound guard as the gateway (no private or loopback
addresses unless allowed), and an error never contains a secret.

### Recipes

Ready-made files for services that are not built in are in
[`examples/mail-providers/`](https://github.com/swina/whoobe_project/tree/master/examples/mail-providers) in the repository (not part of the
images; copy one into your `MAIL_PROVIDERS_PATH` folder). The first is **Resend**. A file can only describe one HTTPS request with a JSON
body and headers written as fixed text: no multipart or form-encoded body (Mailgun's API), no request signing (Amazon SES), no computed
`Authorization` such as Basic with base64, no attachments. For those use SMTP, which these services also offer.

## Trying a provider with the real service

```bash
# credentials in a file only you can read (chmod 600), one line per field:
#   ONESIGNAL_APP_ID=...  ONESIGNAL_API_KEY=...  ONESIGNAL_SENDER_DOMAIN=mail.example.com  ONESIGNAL_FROM=noreply@mail.example.com
node scripts/mail/live-check.mjs --provider onesignal --to you@example.com --dry-run   # shows the request, key masked
node scripts/mail/live-check.mjs --provider onesignal --to you@example.com             # sends one message
```

It prints the result and the provider's message id, never the key. Needs `packages/core` built. `--providers DIR` (or `MAIL_PROVIDERS_PATH`) adds a
folder of provider files, for a recipe that is not built in.

## For several recipients (newsletters, campaigns)

This is transactional mail: one message to one recipient (plus blind copies). Sending to a segment or a list is a
different thing and belongs to an **API Gateway** endpoint (see the Brevo integration guide for the pattern).
