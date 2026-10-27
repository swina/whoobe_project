# AI features

## 1. Principles

- **Bring your own provider and key.** Whoobe has no AI of its own and no default account. Without a configured key the functions answer
  "AI is not configured".
- **Nothing automatic.** AI runs only when a signed-in person uses a function. There is no background AI and no training on your content by Whoobe.
- **The output is a draft.** Generated pages, snippets, text, images and translations are inputs for a human to review; nothing is published by AI.
- **Keys stay on the server** and are never returned by the API (only a flag that one is set). They are encrypted at rest when
  `INTEGRATION_SECRETS_ENCRYPTION_KEY` is set; without it they are stored in clear text and a warning is logged
  ([secrets and keys](../operations/secrets-and-keys.md)).

## 2. What it does

| Function | Where | What happens |
|---|---|---|
| **Generate a page or a snippet** | the editor's composer | You describe it; the provider returns a tree of elements, which is validated structurally and inserted into the editor. The exchange is recorded in `whoobe_ai_generated` |
| **Generate text** | the editor | Plain text for a text element |
| **Generate an image** | the editor, and *Assets > Generate with AI* in the dashboard | The provider returns an image, which is stored in the media library like any asset |
| **Translate** | the page and snippet editor, *Translate* | The content is translated into another language as a new, linked translation (same translation group), in batches; **a human reviews it** |
| **AI Website Wizard** | the website settings in the dashboard | Proposes a website structure (pages and sections) from a description |
| **Generate Website Wizard: texts with AI** | *Settings > Websites > Generate Website Wizard*, step *Texts* | Writes the texts of the slots of the wizard's structure (titles, leads, box texts, button labels), only when you choose it; the model gets the business name, the sector, the context, an optional description and the list of slots, and can change nothing but those texts (see the [wizard guide](../content/website-wizard.md)) |
| **Figma import** *(beta)* | the editor | Converts a Figma frame into a page or a snippet, either through the Figma API (token in *Settings > Figma*) or from an exported JSON file |

## 3. Providers and configuration

Three independent settings, each in its own card of the **AI** entry:

| Card | Used for | Providers |
|---|---|---|
| **AI Agent** | pages, snippets, text, website structure | `openai`, `anthropic`, `google`, `openrouter`, `zen` (OpenCode Zen) and `custom` (any OpenAI-compatible endpoint, for example a model you host) |
| **AI Image Generation** | images | `openai`, `openrouter`, `google`, `custom`; if left empty, the Agent configuration is used |
| **AI Translation** | translating pages and snippets | the same list as the Agent; if left empty, the Agent configuration is used |

Each card takes the provider, the model, an optional endpoint and the key. Keys are **per user**: each person who uses AI configures their own, so cost
and access follow the person. A `custom` endpoint lets you point at a model you run yourself, which keeps content inside your network.

## 4. Permissions and limits

| Rule | Value |
|---|---|
| Configure the providers | the `settings:manage` permission |
| Use the functions | the objects write permission, the same that lets a person edit pages |
| Rate limit | `AI_RATE_LIMIT_PER_MINUTE` calls per user per minute (default 20; `0` turns the limit off) |
| Outbound calls | go through the SSRF guard, which refuses loopback, link-local and metadata addresses |
| The public sandbox | AI is switched off |

## 5. Tokens and usage per person

Every AI answer carries what the request consumed (`usage`: provider calls, tokens in and out, summed over retries and translation batches), and the
dashboard and the editor show it in a small notice to the person who asked; nothing is stored for that. A provider that does not report tokens shows
the number of calls.

An administrator can also **record** the usage of each person (*Security > AI Usage*, off by default): one row per request with the function, provider,
model, tokens and date, **never the prompt or the answer**, deleted after 90 days by default, plus monthly totals. The report of every person needs
the `ai_usage:read` permission (`admin` only); opening one person's requests is written to the audit log; every person sees what is recorded about
them under *Mine*. The report opens as its own tab (the *Open the AI usage report* button of *Security > AI Usage*). A record per person is personal data about staff: inform them before turning it on, and check whether your country needs an
agreement for a tool that can monitor workers ([data protection](../security/data-protection.md), section 2). The same card sets how long the AI
history (`whoobe_ai_generated`, which keeps prompts and answers) is kept.

## 6. Data protection

When someone uses a function, **the prompt and the content they chose to send leave your installation for the provider they configured** (for
translation, the text of the page). Nothing else is sent. Whether that is acceptable depends on the provider's terms: choose one that suits
your data, use a self-hosted `custom` endpoint, or do not configure a key. See [data protection](../security/data-protection.md), section 4.

## 7. What AI does not do

- It does not publish, delete or change anything without a person saving it.
- It does not read your data objects, assets or integrations on its own: it receives only what the person sends in the prompt or the selected content.
- Translations and generated text are not proofread; a human must review them.
- There is no cost control per provider beyond the rate limit and the usage report (section 5, tokens, not money): spending is governed by your account at the provider.
- Figma import is in beta: complex frames need clean-up in the editor.

## 8. Related

[Content pillar](../content/README.md), [secrets and keys](../operations/secrets-and-keys.md), [API reference](../api/api-reference.md) (`/ai/*`).
