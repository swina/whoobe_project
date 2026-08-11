# Whoobe One Spike missing features

In the original repo of whoobe-one-spike (https://github.com/swina/whoobe-one-studio) some features were not ported:

- style: any element can have a style attribute where the user can add custom CSS styles.
- attributes: any element can have more attributes defined by the user. e.g. an element can have 2 custom attributes. User can add the attribute key and the attribute value. attributes defined by the user are added to the element html
- animations: animations are working in the canvas editor, but are not implemented in the preview.
- alpinejs: in the original repo was implemented the alpinejs framework

## Plan

### Context

The Vue 3 port (`docs/plans/cms/whoobe-one-studio-vue3-port-plan.md`, `apps/whoobe-one-spike/README.md`) stopped partway through "Phase 3": only the Elements/Customize/Tree sidebar tabs exist today; the reference editor's CSS/Attributes/Animation/AlpineJS tabs were never ported. This plan closes out that remaining slice.

A full checkout of the reference repo (read directly to confirm exact behavior) is available at `<local>/whoobe-one-studio` — specifically `src/components/blocks/components/BlockCss.vue`, `BlockAttributes.vue`, `BlockAnimation.vue`, `BlockAlpine.vue`, `src/scripts/gsap.js`, and `src/components/blocks/preview/BlockElement.vue`/`BlockContainer.vue`.

Key finding that simplifies all four: **the data model already has the right fields** in `apps/whoobe-one-spike/src/scripts/ElementsClass.js`/`.d.ts` — `Element.style`, `Element.alpine`, `Element.gsap.{animation,ease,duration,delay,trigger}`, `Element.data.attributes` — ported in Phase 0/1 but either fully inert or only partially wired. No backend/schema change is needed (`cms_documents`/snippets/templates store this as plain `jsonb`). This is a front-end-only change confined to `apps/whoobe-one-spike/src/`.

UI decision: the new editing controls go in a **new 4th right-sidebar tab ("Advanced")**, alongside Elements/Customize/Tree — not more `FloatingToolbar.vue` popovers — since attribute/directive lists need real vertical space a popover can't give them.

### Shared foundation: the "Advanced" sidebar tab

New files, following `TailwindCustomizer.vue`'s existing pattern (a panel bound to `useEditorStore().current`, shown when the tab is active) and `CustomClassesControl.vue`'s pattern (a small focused control per concern):

- `src/components/AdvancedPanel.vue` — tab body, stacks 4 sections (Style / Attributes / Animation / AlpineJS), each shown only when `editor.current` is set.
- `src/components/advanced/StyleControl.vue`, `AttributesControl.vue`, `AnimationControl.vue`, `AlpineControl.vue`

Wire-up in `src/components/BlockEditor.vue` (~line 82, next to the existing tab buttons at lines 61-99): add a 4th `<button @click="sidebarTab = 'advanced'">Advanced</button>` and `<AdvancedPanel v-else-if="sidebarTab === 'advanced'" />`.

### Feature 1: style

`element.style: string` already exists (`ElementsClass.d.ts:160`) and is already rendered in **both** the canvas and preview trees (`BlockElement.vue:163`, `BlockContainer.vue:238`, `BlockSlider.vue:211`, and their `preview/*Preview.vue` equivalents) — confirmed working end to end already. The only gap is that nothing lets a user type into it; today it's only mutated indirectly by the Text/Fill color pickers in `FloatingToolbar.vue` via regex string surgery.

- `advanced/StyleControl.vue`: a plain `<textarea>` bound to `editor.current.style`, `@change` (matching `CustomClassesControl.vue`'s existing blur-not-keystroke convention). Just the `style` field — CSS/Container CSS/Semantic are already covered by `CustomClassesControl.vue`/`SemanticControl.vue`.

### Feature 2: attributes

`element.data.attributes: Record<string,string>` already exists as a *concept* but is populated only by the `Form()`/`inputElement()`/`InputTextarea()` builders (`ElementsClass.js:516,527,578`) with a fixed schema, and — confirmed by grep — **is never applied to the DOM in either render tree today**, even for those form builders. Reuse this same field for generic user-defined attributes (matches the reference: `BlockAttributes.vue` uses the identical bag for both purposes).

- `advanced/AttributesControl.vue`: key/value rows (name input, value input, chip list with delete, Enter/"+ Add") reading/writing `editor.current.data.attributes`.
- Shared helper in `src/helpers.ts`, e.g. `customAttrs(attributes)`, filtering out reserved keys (`id`, `class`, `style`, `data-id`, `data-type`, `ref`) — those already have dedicated bindings, and in canvas `id`/`data-id` are load-bearing for selection, dragula, and `gsap-actions.ts`'s `document.getElementById(element.id)` lookup.
- Apply `v-bind="customAttrs(element.data.attributes)"` on the rendered `<component>` in `BlockElement.vue`, `BlockContainer.vue` (canvas) and `BlockElementPreview.vue`, `BlockContainerPreview.vue`, `BlockSliderPreview.vue` (preview + slides) — new wiring in all five files.

### Feature 3: animations in preview

Root cause: `scripts/gsap-actions.ts` only ports the reference's `$animationElement` (immediate-play, editor-only, fired from `FloatingToolbar.vue`'s "▶ Preview" button). The reference's real trigger, `$animation`, is ScrollTrigger-driven — plays when the element scrolls into view, or on `mouseenter` when `element.gsap.trigger` is set — and was never ported because there was no static-export pipeline for it to matter to yet. It matters now: `PublicPage.vue`/`DocumentPreview.vue` already render the live preview tree in-page.

- Add `mountAnimation(element, el: HTMLElement): () => void` to `gsap-actions.ts` — a port of the reference's `$animation`, returning a cleanup function (a real improvement over the source, which never tears anything down): `ScrollTrigger.create(...)` when no `gsap.trigger`, `mouseenter`/`mouseleave` listeners when `gsap.trigger` is set.
- Call it from `onMounted()`/`onUnmounted()` in `BlockElementPreview.vue`, `BlockContainerPreview.vue`, `BlockSliderPreview.vue` (per slide), gated on `element.gsap?.animation`. Needs `:id="element.id"`/`:id="doc.id"` added to these preview templates (currently absent, unlike canvas), then `document.getElementById(element.id)` lookup — same pattern the existing `previewAnimation()` already uses.
- Leave `FloatingToolbar.vue`'s existing animation-name picker + "▶ Preview" button untouched — it edits the same reactive `element.gsap` object, so both stay in sync for free.

### Feature 4: AlpineJS

Confirmed fully absent: no dependency, no directive application anywhere, `element.alpine: Record<string, unknown>` (`ElementsClass.d.ts:164`) is an inert placeholder. Use this existing root-level field (not the reference's `element.data.alpine`).

- Add `alpinejs` (and `@types/alpinejs` if published) to `package.json` dependencies.
- `main.ts`: `import Alpine from 'alpinejs'; window.Alpine = Alpine; Alpine.start()` once at bootstrap — a real ESM import, not the reference's CDN-script/iframe approach (this app has no iframe/static-export path; preview renders straight into the app's own live DOM). Safe to start unconditionally since the editor canvas never sets `x-*` attributes.
- `advanced/AlpineControl.vue`: directive picker (`<select>` of the reference's list — `x-data`, `x-init`, `x-show`, `x-bind`, `x-on:click`, `x-text`, `x-html`, `x-model`, `x-for`, `x-transition`, `x-effect`, `x-ignore`, `x-ref`, `x-cloak`, `x-if`, plus free-text) + value textarea + chip list, reading/writing `editor.current.alpine`.
- Apply directives in the preview tree only (canvas stays plain WYSIWYG): computed `alpineAttrs` (filters empty values) spread via `v-bind` in the same three preview components touched for Feature 2.
- Since directives are set reactively via `v-bind` rather than one-time `setAttribute()`, add `watch(() => element.alpine, () => nextTick(() => Alpine.initTree(el)), { deep: true })` in each of those three components — Alpine's MutationObserver may not re-scan an attribute-only change on an already-initialized node.

### File summary

New: `AdvancedPanel.vue`, `advanced/StyleControl.vue`, `AttributesControl.vue`, `AnimationControl.vue`, `AlpineControl.vue`.

Modified: `BlockEditor.vue` (4th tab), `helpers.ts` (`customAttrs()`), `gsap-actions.ts` (`mountAnimation()`), `main.ts` (Alpine bootstrap), `package.json` (`alpinejs`), `BlockElement.vue`/`BlockContainer.vue` (attributes spread), `preview/BlockElementPreview.vue`/`BlockContainerPreview.vue`/`BlockSliderPreview.vue` (attributes spread, `:id`, animation mount/unmount, Alpine attrs + `initTree` watch).

### Verification

- `npm run typecheck` and `npm run build` in `apps/whoobe-one-spike`, clean.
- Dev server: select an element, use the Advanced tab to set raw CSS, add a custom attribute (confirm `id`/`class` untouched), pick an animation + ease/duration/delay/trigger, add an `x-data`/`x-show` pair.
- Open Preview and the real `PublicPage.vue` route: confirm the custom attribute is on the DOM, the animation plays on scroll-into-view (or hover if `trigger` set) without the editor's "▶ Preview" button, and the Alpine directive is live.
- Save/reload the document and confirm all four fields round-trip through IndexedDB/JSON export-import unchanged.

### Doc update

Once implemented, append a "resolved" note here and add a corresponding section to `apps/whoobe-one-spike/README.md`, matching its existing round-by-round build-log style.

## Resolved (2026-08-12)

All four features implemented per the plan above: a new "Advanced" sidebar tab (`AdvancedPanel.vue` + `components/advanced/{Style,Attributes,Animation,Alpine}Control.vue`) in `apps/whoobe-one-spike`, `element.data.attributes`/`element.alpine` now actually rendered (canvas + preview), GSAP ScrollTrigger/hover animation wired into the preview tree (`gsap-actions.ts`'s new `mountAnimation()`), and AlpineJS added as a real dependency and bootstrapped in `main.ts`. `npm run typecheck` and `npm run build` both pass. See `apps/whoobe-one-spike/README.md`'s matching build-log section for full detail.

Not independently verified in a browser this pass (no browser tooling available in this session) - typecheck, production build, and a dev-server smoke test (no console/transform errors touching any changed file) were used instead. Worth an interactive pass before considering this fully done: confirm the Advanced tab's four controls actually edit the right fields, and that the animation/Alpine wiring visibly works on a real Preview/`PublicPage` render.