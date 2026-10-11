# Automations panel and list (prototype)

*Date: 2026-10-11. Status: implemented, unit-tested (the scan), **not yet tried in a browser** (checks in section 4).*
*Part of [marketing-automation-review-and-plan.md](marketing-automation-review-and-plan.md); follows [why-no-custom-automation-engine.md](why-no-custom-automation-engine.md).*

Whoobe does not run automations, but a form can be connected to a flow in an external engine, and without a list one has to
remember which page or snippet holds which connection. The **Automations** tool (workflow icon, right-hand bar of the editor,
under Integrations) lists them all.

## 1. What it lists

Every form with **Handle submissions** on, in every page and snippet. For each:

- **Name**: the optional *Automation name* of the form (Advanced > Form settings), else the page or snippet title.
- **Where**: page or snippet, with "(draft)" for an unpublished page.
- **Target**: endpoint and route for a Gateway form (`Activepieces /api/v1/webhooks/...`), or "Data Object".
- **Reacts to the answer**: an AlpineJS `@whoobe-form-result` (or `x-on:whoobe-form-result`) directive on the form or on an element
  above it, see [form-result-event.md](form-result-event.md). "no reaction" means the answer is not used by the page.
- **popup off**: the built-in success / error popup is switched off.

Search box, endpoint filter and *Only forms sent to an endpoint* (on by default; turn it off to include forms that save Data Objects).

## 2. Actions

- **Open**: opens the page or snippet in a **new tab** with the form selected (`/editor?pageId=...&elementId=...`, or `snippetId`).
  A new tab, so unsaved work in the current one is not replaced.
- **Service**: opens the address of the endpoint (only an `http(s)` base URL), where the engine has its own editor.
- **Refresh**: reads pages and snippets again. The list is not stored anywhere; it is built from the saved content each time the panel opens.

## 3. Limits

- It lists what is **saved**: a form added in the open, unsaved page appears after saving and Refresh.
- It reads all pages and snippets (with their content) in the browser; fine for a site of hundreds, to revisit for thousands (a server-side index is the next step).
- A form inside a **repeater or a reused snippet instance** is listed once per saved tree, not once per place it is shown.
- It cannot tell whether the flow exists or is published in the engine; that is the engine's own screen (*Service*).
- A listener on a **sibling or below** the form does not count as "reacts" (the event bubbles up, never down).

## 4. Still to check in a browser

1. The icon is in the bar; the panel lists a known form, with the right endpoint, route and "reacts" badge.
2. *Open* in a new tab selects the form (page and snippet); an unknown `elementId` just opens the page.
3. Filters, an empty site, a failing API (the red message).
4. The *Automation name* field saves and shows in the list after Refresh.

## 5. The list outside the editor (admin dashboard)

**Data & Communication > Automations** in the main navigation shows the same list as a table: name, where (page / snippet), website,
endpoint and route, page reaction, with search, endpoint and website filters and *Only forms sent to an endpoint*. Both screens use
`collectAutomations()` from `@whoobe-cms/schema`, so they always agree.

- **Open** (or a click on the row) opens the page or snippet as a tab of the dashboard (the embedded editor) with the form selected.
  If that page is **already open in a tab** the tab is only focused: its editor is loaded and may hold unsaved work, so the form is not selected again.
- The external-link icon opens the endpoint's address (the engine), as *Service* does in the editor.
- The website filter keeps the pages of that site; snippets have no website and are hidden while a site is chosen.
- After changing `packages/sdk/schema`, rebuild it (`pnpm --filter @whoobe-cms/schema build`): the apps read its `dist`.

## 6. Files

| Where | What |
|---|---|
| `packages/sdk/schema/src/automations.ts` | `collectAutomations`, `filterAutomations`, `automationEditorUrl` (pure, shared by the editor and the dashboard) |
| `apps/admin-dashboard/src/views/AutomationsView.vue`, `DashboardLayout.vue`, `tabsStore.ts`, the page / snippet tab and embed components | the list in the main navigation; `elementId` reaches the embedded editor |
| `apps/whoobe-one-spike/src/components/AutomationsPanel.vue`, `BlockEditor.vue` | the panel and its tool in the bar |
| `apps/whoobe-one-spike/src/views/Editor.vue` | `?elementId=` selects the element after loading |
| `packages/sdk/schema` (`node.ts`, `validators.ts`), `ElementsClass.d.ts`, `FormConfigControl.vue` | optional `formConfig.name` |
| `scripts/security/unit/automations-registry.test.ts` | the scan, the filter and the url |
