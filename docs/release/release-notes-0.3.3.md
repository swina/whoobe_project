# Whoobe 0.3.3 - release notes

A patch release of 0.3.0 (*Operate*): the tokens used by the AI functions, shown to whoever asked and, when an administrator turns it on,
recorded per person; a retention period for the AI history. Written from `CHANGES.md` on **2026-10-27**; the procedure is in
[`release-process.md`](release-process.md). **One migration** (`0073_ai_usage.sql`).

## AI usage

- **Every AI answer carries what it consumed.** The answer of each AI function (page, snippet and element text, website structure, wizard
  texts, image, page translation) has a `usage` object: provider calls, tokens in, tokens out. The dashboard and the editor show it in a small
  notice to the person who asked. Nothing is stored for this. Retries and translation batches are counted; a reply that fails to parse is
  counted (it was paid for); a provider that reports no tokens counts as a call.
- **Recording per person, off by default** (*Security > AI Usage*, `settings:manage`). While on, one row per request: the person, the
  function, provider, model, tokens and date, **never the prompt, the answer or what was being edited**, deleted after 90 days by default;
  monthly totals stay until the person is deleted. The page carries a warning: a record per person is personal data about staff and can be
  used to watch their work; inform them, and check whether your country needs an agreement for such a tool (in Italy, article 4 of the
  Statuto dei Lavoratori). See [data protection](security/data-protection.md).
- **The report** opens as its own tab (*Open the AI usage report*): totals by person, function, model and day, one person's requests, monthly
  totals, CSV export. Every user's figures need the new permission `ai_usage:read` (administrators only by default); opening one person's
  requests is written to the audit log. Every signed-in person sees what is recorded about them under *Mine*.
- Providers: OpenAI-compatible APIs, Anthropic and Google report tokens; for images, the gpt-image models and OpenRouter (tried with a real
  OpenRouter image model). Details in [AI features](ai/ai-features.md), section 5.

## Security

**F-064** ([`security/findings.md`](security/findings.md), Medium), found by the project on 2026-10-27 while designing the report: the AI history
(`whoobe_ai_generated`) keeps the **full prompt and answer** of every page, snippet, translation and image generation with the user id, without
any retention, and was missing from the personal-data table of the data-protection page. **Affected: every earlier release.** Fixed: a period
for it can be set next to the AI usage switch (*Keep generated pages and prompts for*), applied by the daily retention job; the data-protection
page lists both tables. **Empty keeps them, as before**: set a period if you do not need the history.

## Other changes

- Data Objects: the *Generate* button of a slug field, on an empty field, now makes the slug from the object's title (it did nothing before).
- Documentation: [How Whoobe evolves](community/project-evolution.md), what comes next, what is built only when an organisation funds it, and
  the rule that the code stays MIT; contributors and testers are asked for.

## Behaviour changes to check before you upgrade

| Change | What you see | What to do |
|---|---|---|
| Migration `0073_ai_usage.sql`: tables `ai_usage` and `ai_usage_monthly`, three columns in `security_settings` | runs at the start of core-api | back up before upgrading, as for any migration |
| The answers of the AI routes have a new `usage` field | nothing, unless a client of yours rejects unknown fields | allow the field |
| New permission `ai_usage:read`, given to the `admin` role | administrators see every user's AI usage report | give it to another role only if that role should see it |
| AI usage recording | **off**: nothing is recorded until an administrator turns it on | inform your staff before turning it on |
| Retention of the AI history | **unchanged** (kept) until you set a period | set one in *Security > AI Usage* if you do not need the history |
| New routes `GET /ai/usage`, `/ai/usage/monthly`, `/ai/usage/me` | in the [API reference](api/api-reference.md) | none |

No new environment variable. Upgrade as for any release (`scripts/workspaces.sh upgrade v0.3.3`, or pull the `0.3.3` images).

## Known limits

The limits of [0.3.0](release-notes-0.3.0.md#known-limits-of-this-release), [0.3.1](release-notes-0.3.1.md#known-limits) and
[0.3.2](release-notes-0.3.2.md#known-limits) still hold. For this release: the token counts are those the provider reports, not a bill (no
price is computed); a provider that reports no tokens shows calls only; the recording covers the dashboard and editor AI functions, not the
publisher or the Gateway's API clients. Tried against a real provider (OpenRouter): images, a snippet and the text of an element; the
website wizard and the page translation share the same provider code and were tested with a fake provider only.
