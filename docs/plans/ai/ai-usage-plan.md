# AI usage per user (tokens), with the data protection it needs

Status: **implemented** on branch `feat/ai-usage` (2026-10-27). Asked by the owner: the token consumption of the AI functions per user, detailed
reports (never the payload), for the administrator only; every person sees the tokens of an AI answer when it arrives.

## 1. Why it needs care

A record of what an identified member of staff asked an AI, and when, is personal data (GDPR art. 4(1)). Keeping it for cost control is a
legitimate interest (art. 6(1)(f)) when it is limited, kept for a defined time, visible to few, and the people concerned know about it. The larger
risk is labour law: a per-person, timestamped record can be used to watch someone's work. In Italy a tool from which remote monitoring of workers is
possible falls under article 4 of the Statuto dei Lavoratori (law 300/1970): a tool used to do the work is exempt from the union agreement, but the
workers must be told beforehand, and the record must respect the privacy code; GDPR art. 88 leaves this to national law, and other countries have
equivalent rules (Germany: the works council, §87 BetrVG). Whoobe cannot decide this for the operator, who is the controller. The product's part is
privacy by design (art. 25): defaults that collect nothing, the least data when on, a period after which it goes, and a clear warning at the switch.

## 2. What was built

| Part | Behaviour |
|---|---|
| Token count in every AI answer | Each provider reply reports its tokens (`usage` of OpenAI-compatible APIs and Anthropic, `usageMetadata` of Google, `usage` of the gpt-image models, `prompt_tokens`/`completion_tokens` of OpenRouter's image replies) to the meter of the request (AsyncLocalStorage, `packages/core/src/ai/usage.ts`), so retries, translation batches and the wizard's calls are all counted; a reply that fails to parse is counted (it was paid for); a provider that reports no tokens counts as a call. The `aiMetered` middleware adds `usage: { calls, inputTokens, outputTokens }` to the JSON answer of the seven AI functions, failed or not; both apps show it in a small notice. Nothing is stored for this. |
| Recording (off by default) | `security_settings.ai_usage_tracking`, switched by `settings:manage` in *Security > AI Usage*, next to a warning about informing staff. While on, one row per request in `ai_usage`: user, function, provider, model, calls, tokens in and out, success or error, date. **No prompt, answer or id of what was edited.** A monthly total per user, function and model in `ai_usage_monthly`. |
| Retention | `ai_usage_retention_days` (default 90; empty keeps) for the request rows, by the daily retention job; the monthly totals stay until the user is deleted. Both tables go with the user (`ON DELETE CASCADE`). |
| Who reads | `GET /ai/usage` and `/ai/usage/monthly` need the new permission `ai_usage:read` (`admin` only by default). Opening one person's requests (`userId`) is written to the audit log as `ai_usage.read_user`. Every signed-in person reads what is recorded about them (`GET /ai/usage/me`, *Mine* in the report). |
| Reports | A main tab of its own (*AI Usage*, opened from *Security > AI Usage*, where the switch and the periods stay). Totals by person, function, model and day for a period (at most 366 days), a person's requests one by one, the monthly totals; CSV export in the dashboard (cells that a spreadsheet would read as a formula are neutralised). |
| F-064, found while doing this | `whoobe_ai_generated` keeps the full prompt and answer of every page, snippet, translation and image generation with the user id, without any retention, and was not in the personal-data table of the data-protection page. Now `ai_generated_retention_days` (empty keeps, as before) deletes them with the daily job, and the page lists both tables. |

## 3. Not done

- Cost in money: prices change and the keys belong to each person; the provider's console shows the bill per key.
- Usage of the publisher or of the Gateway's API clients (no AI there).
- An option to stop recording prompts and answers in `whoobe_ai_generated` altogether (the retention period can be set to 1 day).
