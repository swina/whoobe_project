# Mail provider recipes (examples, not part of the distribution)

A mail provider with an HTTP API is described by one JSON file; the format is in
[`docs/release/communication/mail-providers.md`](../../docs/release/communication/mail-providers.md) ("Adding a provider").
Nothing here is built into the images: to use a recipe, copy the file into the folder named by `MAIL_PROVIDERS_PATH` (for example a
mounted volume). It is picked up without a restart and the provider appears in **Settings > Outgoing Mail**, where the connection
data are entered (secrets are stored encrypted).

| File | Service | Checked |
|---|---|---|
| [`resend.json`](resend.json) | [Resend](https://resend.com/docs/api-reference/emails/send-email) | request and answer read against the Resend API reference on 2026-10-18; unit test; **one real message accepted by Resend on 2026-10-18** (`live-check`, verified domain), and a rejected sender read back as `HTTP 403 - <Resend's text>` |

## Resend

1. In Resend: verify your sending domain (DNS) and create an API key (sending access is enough).
2. Copy `resend.json` to your `MAIL_PROVIDERS_PATH` folder.
3. In Whoobe: Outgoing Mail > *Send with* **Resend**, paste the API key and set the sender address on the verified domain.
4. Save, then use **Email Test**.

What to know: the sender goes out as the **address only**, without the display name. A recipe cannot say "name if there is one" (there are no conditions in the format), and `Name <address>` with an empty name is refused by Resend (`HTTP 422 Invalid from field`), which is what happens when the test mail is sent with a plain address in its *From* field. No attachments (the recipe format cannot carry them), a retry cannot send the same message twice (the message id is
the `Idempotency-Key`, which Resend keeps for 24 hours), `429` is retried twice (Resend limits requests per second; a daily or monthly
quota error is retried too and fails again, with Resend's text in the Mail Log).

## Trying a recipe with the real service

```bash
# credentials in a file only you can read: ~/.config/whoobe/resend.env (chmod 600)
#   RESEND_API_KEY=re_...
#   RESEND_FROM=noreply@your-verified-domain.example
#   RESEND_FROM_NAME=Whoobe
node scripts/mail/live-check.mjs --provider resend --providers examples/mail-providers --to you@example.com --dry-run
node scripts/mail/live-check.mjs --provider resend --providers examples/mail-providers --to you@example.com
```

## What the format cannot do

One HTTPS request per message with a JSON body and headers written as fixed text. So: no multipart or form-encoded bodies (Mailgun's
API), no request signing (Amazon SES), no computed `Authorization` such as Basic with base64, no attachments. For those use SMTP, which
every one of these services offers.
