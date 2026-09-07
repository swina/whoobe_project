# Plan: "Create Website Structure with AI" Feature

## Overview
Add an AI-powered option to the website creation flow that generates a complete website (config + pages + snippets) from a natural language description, then creates everything in one orchestrated transaction.

## 1. Backend — New AI prompt (packages/core/src/ai/prompts.ts)

Add buildWebsiteStructurePrompt(context) that instructs the LLM to return a JSON object with this shape:
{
  "website": {
    "name": "string — short, URL-safe",
    "defaultLocale": "en",
    "supportedLocales": ["en"],
    "settings": { "description": "brief site purpose from the prompt" }
  },
  "pages": [
    {
      "slug": "home",
      "title": "Home",
      "category": "main",
      "kind": "content",
      "content": { /* full Element tree root with tag: "document" */ }
    }
  ],
  "snippets": [
    {
      "name": "Hero Banner",
      "category": "hero",
      "node": { /* reusable Element subtree, no document root */ }
    }
  ]
}
Constraints: 3–8 pages max, 5–15 snippets max, each page tree ≤80 nodes, each snippet tree ≤30 nodes.

## 2. Backend — Validation (packages/core/src/ai/prompts.ts)

Add validateWebsiteStructure(json) that checks:
- Website name is a non-empty string
- pages is a non-empty array, each page has slug, title, content (element tree)
- snippets is an array (may be empty), each has name, category, node
- Each page/snippet content passes validateElementTree

## 3. Backend — Route: POST /ai/generate-website-structure (apps/core-api/src/server.ts)

New route (behind OBJECTS_WRITE):
- Accepts { prompt: string }
- Stores AI settings, calls generateAiJson with buildWebsiteStructurePrompt
- Validates with validateWebsiteStructure
- Sanitizes images via sanitizeGeneratedImages
- Logs to whoobe_ai_generated with kind 'website-structure'
- Returns the full structure JSON

## 4. Backend — Extended whoobe_ai_generated schema (packages/core/src/db/ai-generated-schema.ts)

Add 'website-structure' to the allowed kind values so audit logging works for this new kind.

## 5. Backend — Route: POST /whoobe-one/websites/from-ai (apps/core-api/src/server.ts)

New route (behind OBJECTS_WRITE):
- Accepts { structure: { website, pages, snippets } } (the output from step 3)
- In order:
    1. Creates the website via createWebsite
    2. Creates all pages via createWhoobePage (each linked to the new website's id)
    3. Creates all snippets via createWhoobeOneSnippet
- Returns { website, pages: [...], snippets: [...] }
- Rolls back on failure (wrap in a transaction)

## 6. Backend — DB schema update (packages/core/src/db/ai-generated-schema.ts)

Extend the kind check in aiGeneratedSchema or ai-generated-schema.ts to accept 'website-structure' as a valid value.

## 7. Frontend — UI (apps/admin-dashboard/src/components/settings/WebsiteSettingsCard.vue)

- Add an "AI Website Wizard" button next to the existing "+ New Website" button
- On click: opens a modal (AiWebsiteWizardModal.vue) with:
- Textarea: "Describe the website you want to create..."
- Optional: locale selector, number of pages hint
- "Generate" button → calls POST /ai/generate-website-structure
- Loading state with progress indication
- Result preview: shows generated website name, list of pages (with slugs), list of snippets
- "Create Website" button → calls POST /whoobe-one/websites/from-ai
- On success: opens the new website tab and shows a toast

## 8. Frontend — New store action (apps/admin-dashboard/src/stores/websitesStore.ts)

Add generateWebsiteStructure(prompt) and createFromAiStructure(structure) that call the two new backend endpoints.

## 9. Frontend — New API functions (apps/admin-dashboard/src/utils/websites-api.ts)

Add generateAiWebsiteStructure(baseUrl, prompt) and createWebsiteFromAi(baseUrl, structure).

## DB Migration

Extend the whoobe_ai_generated table's kind column CHECK constraint (or just handle it in application code) to accept 'website-structure'. No schema migration is strictly needed since the field is just a text column, but the validation at the record layer should accept the new value.

| Files modified | File Change |
| --- | --- |
| packages/core/src/ai/prompts.ts |	Add buildWebsiteStructurePrompt(), validateWebsiteStructure(), export new helpers |
| packages/core/src/db/ai-generated-records.ts	| Accept 'website-structure' in kind validation |
| apps/core-api/src/server.ts |	Add POST /ai/generate-website-structure and POST /whoobe-one/websites/from-ai |
| apps/admin-dashboard/src/components/settings/WebsiteSettingsCard.vue	| Add "AI Website Wizard" button |
| apps/admin-dashboard/src/components/settings/AiWebsiteWizardModal.vue	| New modal component |
| apps/admin-dashboard/src/stores/websitesStore.ts | Add generateStructure() and createFromStructure() |
| apps/admin-dashboard/src/utils/websites-api.ts | Add generateAiWebsiteStructure() and createWebsiteFromAi() |

## No risk areas
- The existing /ai/generate endpoint is untouched
- Existing manual website creation flow unchanged
- The AI prompt is a strict JSON contract, same pattern as existing snippet/page prompts
- Snippets and pages are created with the same record functions already used elsewhere