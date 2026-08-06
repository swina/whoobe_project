# WYSIWYG Field Editor

Plan for replacing the plain `<textarea>` that `wysiwyg`-type Data Object fields render with today with a real rich-text editor - porting the same TipTap integration this monorepo has already built and proven twice before (`whoobe-one-studio`'s original `BlockTipTap.vue` → `whoobe-one-spike`'s own port, `TipTapPanel.vue`), not a new editor-library evaluation.

---

## 0. Where this stands today

- **`wysiwyg` is already a real, first-class field type** - `ClassSettingsCard.vue`'s `FIELD_TYPES` list offers "Rich text" (`value: 'wysiwyg'`) in the Class Builder today (`apps/admin-dashboard/src/components/objects/ClassSettingsCard.vue`), and `compileFieldSchema()` (`packages/core/src/schema/dynamic.ts`) validates it as a plain `z.string()` - identical to `textarea`/`input`. No schema change is needed for this plan: an HTML string is still just a string.
- **The actual editing control is a bare `<textarea>`**, though. `DataObjectFieldControl.vue`'s case:
  ```vue
  <textarea
    v-if="field.fieldType === 'wysiwyg' || field.fieldType === 'textarea'"
    ...
  />
  ```
  renders the exact same plain multi-line textarea for both field types - an admin editing a "wysiwyg" field today is typing raw HTML by hand, with no formatting toolbar, no visual preview, nothing distinguishing it from a plain `textarea` field at all.
- **Migrated Pimcore `wysiwyg` content already carries real HTML** - `pimcore-object-converter.ts`'s and `pimcore-page-converter.ts`'s own `wysiwyg` cases pass real Pimcore rich-text HTML straight through today. The data itself is already real rich content wherever it came from a migration; this plan is purely about the *editing* experience for that HTML, not a new storage format or a data migration.
- **A real, working TipTap-based rich-text editor already exists in this exact monorepo, twice.** `apps/whoobe-one-spike/src/components/TipTapPanel.vue` is itself a port of `whoobe-one-studio`'s own `BlockTipTap.vue` (per that file's own header comment: *"Port of whoobe-one-studio's src/components/blocks/components/BlockTipTap.vue"*) - Vue 3 + `@tiptap/vue-3`/`@tiptap/starter-kit`/`@tiptap/extension-image`, a plain `v-model="string"` (HTML in/out) interface, a real toolbar (bold/italic/strike/code, paragraph, H1-4, bullet/ordered lists, blockquote, horizontal rule, inline image), ~130 lines total, no dependencies beyond the three `@tiptap/*` packages and `@lucide/vue` for icons. `admin-dashboard` already depends on `@lucide/vue` (same icon set) but not yet on any `@tiptap/*` package.
- **A `wysiwyg` field can already legally appear nested inside a `block` field's repeatable rows** - `ClassFieldDefinition.blockFields` is itself `ClassFieldDefinition[]`, and `DataObjectForm.vue`/`DataObjectFieldControl.vue` already recurse for `block` fields (each repeatable row renders a nested `DataObjectForm`). A real, not hypothetical, interaction point this plan needs to keep working, not specifically build for - each recursive `DataObjectFieldControl` instance manages its own independent editor lifecycle already, so multiple TipTap instances mounted at once (several rows, each with a wysiwyg sub-field) is the existing recursion pattern doing what it already does, not new work.

---

## 1. Scope & goals

1. **Port `TipTapPanel.vue` into `admin-dashboard`** as a new `WysiwygEditor.vue`, wired into `DataObjectFieldControl.vue`'s `wysiwyg` case, replacing the shared textarea fallback. `textarea` (the genuinely-plain-text field type) keeps the plain `<textarea>` unchanged - only `wysiwyg` gets the new control. This is porting the same component a *third* time (`whoobe-one-studio` → `whoobe-one-spike` → `admin-dashboard`), the same proven technique already used twice, not a new evaluation of editor libraries (TipTap vs. Quill vs. ProseMirror-from-scratch, etc.).
2. **No data-model or schema change.** `compileFieldSchema()`'s `z.string()` for `wysiwyg` stays exactly as-is; the field still stores/round-trips a plain HTML string, the same shape migrated Pimcore content already has and the same shape `data_objects.attributes` JSONB already expects.
3. **Explicitly not this plan's job**: redesigning `block`/`fieldcollections` rendering (already handled for free, per §0's own finding), or building new toolbar features beyond what `TipTapPanel.vue` already has (tables, custom marks, embeds) - extending the toolbar is real, separate future work, flagged rather than silently bundled in.

---

## 2. Design

### 2.1 New component: `apps/admin-dashboard/src/components/objects/WysiwygEditor.vue`

A direct port of `TipTapPanel.vue`'s structure - `Editor`/`EditorContent` from `@tiptap/vue-3`, `StarterKit` + `TipTapImage` extensions, a `shallowRef` editor instance (matching `TipTapPanel.vue`'s own documented reasoning: Tiptap manages its own ProseMirror-level reactivity, and `shallowRef` avoids both needless deep-reactivity work and a known `vue-tsc` friction point against `EditorContent`'s `editor` prop), `onMounted`/`onBeforeUnmount` lifecycle, and the same external-`modelValue`-change watcher (so the editor stays in sync if something outside it - e.g. a locale switch reusing the same mounted `DataObjectForm` - changes the bound value).

- **Toolbar**: identical action set to `TipTapPanel.vue` - bold/italic/strike/code, paragraph, H1-4, bullet/ordered lists, blockquote, horizontal rule, inline image. A faithful port, not a redesign.
- **Styling**: restyled to this app's own slate/indigo dark+light theme (`light:` custom variant, per the dashboard's own theme work) rather than `TipTapPanel.vue`'s plain scoped `<style>` block tuned for `whoobe-one-spike`'s lighter gray/indigo palette - a real, necessary adaptation, not a mechanical copy-paste.
- **Image insertion**: `TipTapPanel.vue`'s own `setImage()` uses a bare `window.prompt('Image URL')` - real, working, but minimal. `admin-dashboard` has actual DAM asset-browsing infrastructure `whoobe-one-spike` doesn't reach (`AssetsView.vue` and friends) - wiring image insertion into a real asset picker instead of a raw URL prompt is a genuine, in-scope improvement for this port, not carried over unchanged just because the source component did it that way (see §4's phasing - real, but optional, sequenced after the core port lands).

### 2.2 Wiring into `DataObjectFieldControl.vue`

Split the existing combined case in two:
```vue
<!-- textarea: unchanged, stays plain -->
<textarea v-if="field.fieldType === 'textarea'" ... />

<!-- wysiwyg: new -->
<WysiwygEditor
  v-else-if="field.fieldType === 'wysiwyg'"
  :model-value="(modelValue as string) ?? ''"
  @update:model-value="emitUpdate"
/>
```
`WysiwygEditor.vue`'s own `v-model`-shaped interface (`modelValue: string` in, `update:modelValue` out) matches every other control in this file's own existing binding convention directly - no adapter layer needed.

### 2.3 New dependency

`@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-image` added to `apps/admin-dashboard/package.json` - the exact same versions already pinned in `apps/whoobe-one-spike/package.json` (`^2.11.5`), not a fresh version choice needing its own evaluation.

### 2.4 Real, stated risk: this field's HTML reaches the public API raw

`GET /public/data-objects` / `GET /public/data-objects/:id` (`object-publish-workflow-plan.md`'s own public routes) return a published object's `attributes` as-is, including a `wysiwyg` field's full HTML string - a consuming frontend rendering that HTML (e.g. via `v-html`) inherits whatever the editor produced. TipTap/ProseMirror's schema-constrained output is a real, meaningfully smaller XSS surface than a hand-typed textarea already was (no raw `<script>`, no arbitrary attributes outside what `StarterKit`'s schema allows) - but this plan does not add server-side HTML sanitization on top, and doesn't need to: that's the same trust boundary every other field already crosses (an admin holding `OBJECTS_WRITE` is already a trusted editor in this system, not an untrusted end user). Stated as a real fact, not silently assumed safe.

---

## 3. Explicit relationship to prior plans

- **`advanced-data-modeling-plan.md` §4.3** (field-type coverage): `wysiwyg`'s Zod validator (`z.string()`) is unchanged - this plan is additive to the *rendering* layer only, not the validation/storage layer that plan designed.
- **`native-class-authoring-plan.md` §3.1** (Class Builder field types): `wysiwyg` is already in the v1 field-type list that plan shipped - this plan doesn't add or change what field types the Class Builder can author, only what editing `wysiwyg` actually looks like once authored.
- **`docs/plans/UI/editing-object-class.md`** (per-field `className`, section layout): orthogonal - a `wysiwyg` field can already carry a `className` (e.g. to size its container) exactly like any other field type; nothing about that mechanism needs to change for this plan.

---

## 4. Proposed phases

- **Phase 1 - Core port: DONE.** `@tiptap/vue-3`/`@tiptap/starter-kit`/`@tiptap/extension-image` (`^2.11.5`, matching `whoobe-one-spike`'s own pinned versions exactly) added to `apps/admin-dashboard/package.json`. New `apps/admin-dashboard/src/components/objects/WysiwygEditor.vue` - a direct structural port of `TipTapPanel.vue` (same `Editor`/`EditorContent`, `shallowRef` editor instance, lifecycle, external-`modelValue` watcher, toolbar action set), restyled to this app's own slate/indigo dark+light theme (the `.light` custom-variant class on `<html>`, not a mechanical copy of the source's plain gray/indigo scoped styles - real adaptation, not copy-paste). `DataObjectFieldControl.vue`'s combined `wysiwyg`/`textarea` case split in two per §2.2: `wysiwyg` now renders `WysiwygEditor`, `textarea` keeps the original plain `<textarea>` unchanged.
  - Verified: `pnpm run build` (`vue-tsc` + `vite build`) clean - 2623 modules (up from 2514, TipTap/ProseMirror's own dependency tree), JS bundle grew from ~874KB to ~1180KB (expected, a real rich-text editor is not free) - both changes confirmed as the actual cause, not a regression elsewhere. Confirmed both new/changed files compile through the live dev server with no errors. `packages/core` (33/33 tests) and `core-api` typecheck both re-run and unaffected, as expected for a change scoped entirely to `admin-dashboard`. **Not verified**: no real browser click-through (no browser-automation tool available in this environment, the same stated gap every UI phase in this plan family has) - the actual round-trip against a real migrated Pimcore `wysiwyg` field's HTML (open → confirm formatted rendering, not raw tags → edit → save → confirm persistence) is reasoned through against `WysiwygEditor.vue`'s `v-model` contract matching `DataObjectFieldControl.vue`'s existing binding convention exactly, not exercised in an actual browser.
- **Phase 2 (optional, follow-up) - Real asset-picker image insertion**: replace `WysiwygEditor.vue`'s inherited `window.prompt('Image URL')` (§2.1) with `admin-dashboard`'s own DAM asset picker - a real improvement this port enables that the source component (`whoobe-one-spike`, no DAM of its own) never could have had.
