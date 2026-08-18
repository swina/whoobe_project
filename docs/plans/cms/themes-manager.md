# Themes Manager

Themes are independent entities that manage:

- custom colors → custom class
- custom fonts
- custom style

## Data Model

Themes are their own database table (`themes`), not nested inside websites:

```sql
themes {
  id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
  name: text NOT NULL
  colors: jsonb DEFAULT '[]'  -- [{ name, hex }]
  fonts: text[] DEFAULT '{}'
  styles: text DEFAULT ''       -- raw CSS with syntax validation
  created_at: timestamptz NOT NULL DEFAULT now()
  updated_at: timestamptz NOT NULL DEFAULT now()
}
```

Websites, pages, and snippets reference themes via a nullable `themeId` column:

```sql
websites.theme_id       uuid REFERENCES themes(id)
whoobe_pages.theme_id   uuid REFERENCES themes(id)
whoobe_one_snippets.theme_id uuid REFERENCES themes(id)
```

## Custom Colors

- Same as current implementation: color picker → class name → `@theme { --color-{name}: {hex}; }`
- Injected via `<style>` element at render time

## Custom Fonts

- Same as current implementation: font name (Google Fonts URL form with `+` for spaces)
- Injected via `<link>` to Google Fonts stylesheet

## Custom Style

- A textarea where users can add custom CSS
- Syntax validation on blur (using `new Function()` or a lightweight CSS parser)
- Injected as a `<style id="whoobe-custom-styles">` element with the raw CSS

## Theme Injection

Two layers are always injected together, CSS cascade handles conflicts:

1. **Website theme** (from `websites.themeId`) — always injected on all website pages
2. **Page/snippet theme** (from `whoobe_pages.themeId` / `whoobe_one_snippets.themeId`) — ALSO injected when set, does not replace the website theme

Both are injected via the `useThemeStyles` composable, which now:
- Fetches theme data by `themeId` from `/whoobe-one/themes/:id/inject`
- Injects website theme colors/fonts/styles
- Also injects page/snippet theme colors/fonts/styles alongside

## Themes (sidebar)

Themes manager has its own entry in the main sidebar before Settings, with a full CRUD view.

---

## Implementation Plan

### Phase 1 — Backend: New `themes` table + API

**1.1 Schema** — `packages/core/src/db/themes-schema.ts`
- New `themes` table with columns: `id` (uuid pk), `name` (text), `colors` (jsonb), `fonts` (text[]), `styles` (text), `createdAt`, `updatedAt`

**1.2 Records** — `packages/core/src/db/themes-records.ts`
- `listThemes`, `getTheme`, `createTheme`, `updateTheme`, `deleteTheme`

**1.3 Export** — `packages/core/src/server.ts`
- Re-export both schema and records

**1.4 API endpoints** — `apps/core-api/src/server.ts`
- `GET /whoobe-one/themes` — list all themes
- `POST /whoobe-one/themes` — create theme
- `GET /whoobe-one/themes/:id` — get single theme
- `PUT /whoobe-one/themes/:id` — update theme (name, colors, fonts, styles)
- `DELETE /whoobe-one/themes/:id` — delete theme
- `GET /whoobe-one/themes/:id/inject` — returns compiled injection payload `{ colors, fonts, styles }`

**1.5 Add `themeId` to websites** — `websites-schema.ts` + `websites-records.ts`
- New column `themeId: uuid('theme_id')` (nullable, references themes.id)
- Update `WebsiteRecord`, `createWebsite`, `updateWebsite`

**1.6 Add `themeId` to whoobe_pages** — `whoobe-pages-schema.ts` + `whoobe-pages-records.ts`
- New column `themeId: uuid('theme_id')` (nullable)
- Update `WhoobePageRecord`, create/update functions

**1.7 Add `themeId` to whoobe_one_snippets** — `whoobe-one-snippet-schema.ts` + records
- New column `themeId: uuid('theme_id')` (nullable)
- Update records and API

**1.8 Drizzle migrations** — `0030` (create themes), `0031` (add themeId columns)

### Phase 2 — Admin Dashboard: Themes sidebar + CRUD + selectors

**2.1 SectionKind** — `stores/tabsStore.ts`
- Add `'themes'` to `SectionKind` union

**2.2 ThemesView** — new `components/themes/ThemesView.vue`
- Lists all themes as cards (name, color swatches, font count, styles preview)
- Each card: inline CRUD for colors/fonts (same pattern as current MasterWebsiteTab theme list)
- Custom Styles textarea with CSS syntax validation (lint on blur, show errors inline)
- "+ New Theme" button

**2.3 Sidebar** — `layouts/DashboardLayout.vue`
- Insert `{ name: 'Themes', section: 'themes', icon: Palette }` before Settings in navItems
- Add `themes: ThemesView` to sectionComponents

**2.4 Website settings** — `MasterWebsiteTab.vue` Settings tab
- Add "Theme" dropdown populated from `/whoobe-one/themes`, saves `themeId`

**2.5 Page settings** — `PageSettingsTab.vue`
- Add "Theme" dropdown populated from themes, saves `themeId`

**2.6 Snippet editor** — `SnippetEditorEmbed.vue`
- Accept optional `themeId` prop, passed as `?themeId=` query param

### Phase 3 — Editor (whoobe-one-spike): Dual theme injection

**3.1 useThemeStyles** — `composables/useThemeStyles.ts`
- Fetch theme data by `themeId` from the new API endpoint
- Inject both website theme AND page/snippet theme (both colors/fonts/styles)
- `styles` injected as `<style id="whoobe-custom-styles">` with the raw CSS

**3.2 ThemeModal** — `components/ThemeModal.vue`
- Reload themes from `/whoobe-one/themes` (not from website settings)
- Show theme selector as before, but reads from the new themes list
- Per-page/snippet overrides remain below

**3.3 FontControl** — `components/tailwind-controls/FontControl.vue`
- Cascade: page fonts → website theme fonts → default env list

### Phase 4 — Data migration

- Script to migrate existing `websites.settings.themes[]` entries into the new `themes` table
- Set `websites.themeId` to the first migrated theme per website
- Remove the old `settings.themes` / `settings.theme` fields after migration