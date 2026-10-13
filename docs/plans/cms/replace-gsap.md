# Replacing GSAP

*Analysis of 2026-10-13. Status: **option A implemented on 2026-10-13** (see section 8); sections 1 to 7 are the analysis that led to it. Context: the dependency inventory ([`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md),
[supply chain](../../release/security/supply-chain.md) section 4) found that GSAP is under a proprietary licence (https://gsap.com/standard-license), free for
commercial use but with a restriction on tools that let users build visual animations without code if they compete with the licensor's animation builder.
Whoobe's editor has an animation panel, so the licence has to be answered: ask for consent, accept after a legal review, or remove GSAP. This page prepares the third option.*

## 1. Where GSAP is used

| Place | What it does | Size |
|---|---|---|
| `apps/whoobe-one-spike/src/scripts/animations.js` | Registers **19 named effects** (`gsap.registerEffect`) and the list of **14 ease names** | 495 lines |
| `apps/whoobe-one-spike/src/scripts/gsap-actions.ts` | `previewAnimation()` (play now, in the editor) and `mountAnimation()` (play when scrolled into view with ScrollTrigger, or on hover with reverse on leave); a cleanup function | 142 lines |
| Editor components | `AnimationControl.vue` (the panel), `FloatingToolbar.vue` (picker and preview button), the four preview components (`BlockElementPreview`, `BlockContainerPreview`, `BlockSliderPreview`, `BlockTablePreview`) call `mountAnimation()` | 7 files, a few lines each |
| `packages/sdk/react/src/defaults.tsx` | `useGsapAnimation()`: dynamic `import('gsap')` and `gsap/ScrollTrigger`, the same logic again for React (Next) sites | ~55 lines |
| `packages/publish/src/cli.ts` | Adds `gsap` as a **dependency of every generated Next.js site**, so GSAP ships inside customers' sites | 1 line |
| `apps/whoobe-one-spike/package.json` | The dependency | 1 line |
| Data | `node.gsap = { animation, ease, duration, delay }` (+ `trigger`) on every element; schema `elementGsapSchema`; seed kits use `slide-down`, `slide-left`, `scale-in` | stored in pages and kits |

Not using GSAP today: the **Vue and Svelte adapters** and the Nuxt template carry the `gsap` object in the tree but run **no animation code**, so animations
set in the editor do not play on Nuxt, Vue or Svelte outputs (only the editor preview and React/Next sites). That is a gap independent of the licence.

## 2. What the effects really need

All 19 effects are tweens (`fromTo`) of properties the browser animates natively: `opacity`, `scale`, `x`/`y` (translate), `rotation`/`rotateX`/`rotateY`,
`width`/`height`, `scaleX`/`scaleY`, `transformOrigin`, `transformPerspective`. Nothing uses a GSAP-only capability (no timelines of substance, no morphing, no
physics, no text splitting). The ease names are GSAP's (`power1`..`power4`, `back`, `elastic`, `bounce`, `rough`, `slow`, `steps`, `circ`, `expo`, `sine`).
The scroll behaviour is "play once when the element enters the viewport (restart on re-entry)", the hover mode is "play on mouse enter, reverse on leave".

## 3. Options

| Option | Licence | Fit | Cost |
|---|---|---|---|
| **A. Web Animations API + IntersectionObserver, our own small module** | none: browser features | Covers everything in section 2; no dependency in the editor, in generated sites or in the SDK adapters; one implementation for all adapters | write about 250 lines, test |
| B. [Motion](https://motion.dev) (`animate`, `inView`) | MIT | Same capabilities with a nicer API and springs; adds a library to the editor and to generated sites | similar to A, plus a dependency |
| C. CSS keyframes with Tailwind and Alpine (`x-intersect`) | MIT (Alpine plugin) | Fully declarative, works without our JS in exported HTML; per-element duration, delay and ease become CSS variables; hover reverse is harder | medium; changes how output is generated |
| D. Keep GSAP and obtain Webflow's written consent | proprietary | No work; depends on a third party and on future changes of its terms; generated sites keep shipping GSAP | a request, and an answer you cannot control |

**Recommendation: A.** The need is small and fully covered by the browser; it removes a proprietary dependency from the editor and from every generated site; and it can
fix the Vue, Svelte and Nuxt gap at the same time, because the module is shared. B is a reasonable fallback if spring physics is wanted later.

## 4. Design of option A

- A new module in `packages/sdk/renderer` (framework-neutral, no dependencies): `animations.ts` with
  - the 19 effects as keyframe definitions (`from`, `to`, default duration, delay, ease), a direct translation of `animations.js`;
  - an **ease map** from the 14 GSAP names to CSS easing: `power1` to `power4` as cubic-bezier (quad, cubic, quart, quint ease-out), `sine`, `circ`, `expo`, `back` as the standard
    cubic-beziers, `steps` as `steps(n)`, `bounce`, `elastic` and `rough` as CSS `linear(...)` functions (supported by current browsers) or the closest approximation;
  - `playAnimation(el, config)` (immediate, returns the `Animation`; used by the editor preview and its "duration" tracking via `effect.getTiming()`);
  - `mountAnimation(el, config)` with `IntersectionObserver` (play when entering, restart when entering again) or hover (`mouseenter` plays, `mouseleave` reverses), returning a cleanup;
  - SSR safety: nothing runs on import; everything is called from the client lifecycle.
- The **data format does not change** (`animation`, `ease`, `duration`, `delay`, `trigger`), so no content migration and the seed kits keep working.
- Editor: `gsap-actions.ts` becomes a thin wrapper (or is replaced) and the seven components import the new module; `animations.js` shrinks to the name lists.
- Adapters: React uses the module instead of `import('gsap')`; **Vue and Svelte (and the Nuxt template) call it too**, which makes animations work there for the first time.
- `packages/publish/src/cli.ts` stops adding `gsap`; `apps/whoobe-one-spike/package.json` drops it; `THIRD_PARTY_NOTICES.md` is regenerated and the licence gate no longer needs the GSAP exception.

## 5. Findings to fix in the same change

1. `animations.js` registers an effect named **`growh-eight`** while the list offers **`grow-height`**: that effect cannot play today.
2. `ElementGsap` and `elementGsapSchema` (`packages/sdk/schema`) have **no `trigger` field**, but the editor writes `trigger` (hover mode) and the React hook reads it. If content is validated or parsed with
   that schema the flag may be dropped; check, and add the field.
3. `close-right` animates only `x` while `close-left` animates width, height and origin; check the intended behaviour when translating.
4. Animations do not run on Vue, Svelte and Nuxt outputs (section 1).

## 6. Work and risks

| Step | Estimate |
|---|---|
| Module: effects, ease map, play and mount, unit tests of the pure parts (keyframes, ease map) | 1 day |
| Editor: replace the seven usages, keep preview timing (`previewAnimationActive`) | 0.5 day |
| Adapters: React, Vue, Svelte, Nuxt template; publish tool; dependency removal | 1 day |
| **Visual parity check**: render each of the 19 effects in Chromium with GSAP and with the new module at sampled times and compare computed `opacity` and `transform` (tolerance); fix the eases that differ | 0.5 to 1 day |
| Documentation (credits, notices, content guides), `CHANGES.md` | 0.25 day |

About **3 to 4 days**. Risks: exact visual parity of `elastic`, `bounce` and `rough` (approximations), the behaviour of "restart on re-entry" and of hover reverse (verified in the parity test),
and old generated sites that still contain `gsap` until they are regenerated (they keep working; nothing is removed from them).

## 7. Decision needed

Choose A (recommended), B, or D (ask for consent). If A or B, start with the parity test harness: it fixes the target before any code is replaced.

## 8. What was done (2026-10-13)

- `packages/sdk/renderer/src/animations.ts`: the 19 effects as two states each, the 14 ease names as curves (sampled into CSS `linear(...)`, with cubic-bezier fallbacks), `createAnimation`, `previewAnimation`,
  `mountAnimation` (IntersectionObserver or hover with reverse, cleanup, reduced motion). Exported from `@whoobe-cms/renderer`. `animations.test.ts` (16 tests): the eases against values measured on GSAP 3.15, effects and timing rules.
- Editor: `gsap-actions.ts` became `animation-actions.ts` (same two functions and the `previewAnimationActive` flag); `animations.js` only exposes the name lists; `gsap` dependency removed from `apps/whoobe-one-spike`, `@whoobe-cms/renderer` added.
- Outputs: React uses the module (no dynamic import of an external library), **Vue (and so Nuxt) and Svelte now play animations** (a `vWhoobeAnimation` directive and an `animate` action on Container and Text, like React); `packages/publish` no longer adds `gsap` to generated Next sites.
- Schema: `trigger` added to `ElementGsap` and `elementGsapSchema`.
- `THIRD_PARTY_NOTICES.md` regenerated (617 packages) and the GSAP review exception removed from the licence gate.

**Parity check.** A throwaway harness loaded GSAP 3.15 and the new module in Chromium and compared, at 7 points of each animation, the computed `opacity`, `visibility`, `transform`, `width` and `height` for all 19 effects with default settings, 10 eases and a custom duration and delay: **all 30 cases match** (largest deviation 0.3 px, on the `elastic` ease). A second run checked scroll-in, restart on re-entry, hover and reverse, cleanup, preview and reduced motion.

**Differences from the previous behaviour, all deliberate:**
1. *Default duration.* In the old editor a node with no duration set played with duration 0 (the animation library's effect defaults were never applied, because the editor passed `undefined` values), i.e. it **did not animate**: it jumped to the end. Now an empty or zero duration means the effect's own (0.7 s), as the effects were designed. Pages and kits that have an animation but no duration (the seed kits' `slide-down`, `slide-left`, `scale-in`) will now animate.
2. `rough` and `slow` never worked (they fell back to the default curve) and `steps` raised an error; they now have a curve (`rough` is the default curve, `slow` is ease-in-out, `steps` is 12 steps).
3. `grow-height` could not play (the effect was registered as `growh-eight`); it does now.
4. `width-reverse` slid in from the right in the design, but the old library measured the percentage while the element was 0 wide, so it never moved; the new one grows the width only, as before.
5. A full turn (`rotate-scale`, `flip-x`, `flip-y`, `rotate`) turns, as before; the new module writes both states with the same transform functions so the browser interpolates them one by one.
6. Visitors with *reduced motion* get no animation (new).
7. After a preview in the editor the element is left as it was; the old preview left the end state in inline styles.

## 9. Collapse (2026-10-13)

The editor and the generated sites also loaded the separate Alpine plugin `@alpinejs/collapse` for the `x-collapse` directive (menus, dropdowns, accordions). It is now part of the same module:

- `packages/sdk/renderer/src/collapse.ts`: `alpineCollapse(Alpine)`, a drop-in replacement of the plugin on the Web Animations API (`x-collapse`, `.duration.<n>ms|s`, `.min.<n>px`); it supplies the `el._x_transition` object that `x-show` uses, so existing content is unchanged. The function is self-contained so a generator can copy its compiled text.
- Used by the editor (`main.ts`), the generated Next.js sites (`AlpineStarter`), the Nuxt sites (`app.vue`) and the mobile app (the generator copies `dist/collapse.js` and `collapse.d.ts` from the renderer into `src/lib/alpine-collapse.*`). The `@alpinejs/collapse` dependency, its types and the `declare module` lines are gone from all of them.
- A `collapse` **effect** in the animation list (`animations.ts`): the element opens from nothing to its own measured height when it scrolls into view, then returns to its natural size (default 0.35 s). It is an entrance animation; a click-driven open and close is what `x-show` with `x-collapse` is for.

Checked in Chromium against the real plugin (Alpine 3.16): accordion open and close, `.duration.600ms`, `.min.40px` and an interrupted opening and closing give the same initial and final states (`hidden`, `display`, `height`, `overflow`); in between, the new one starts a frame or two earlier because it does not wait for two animation frames before starting. Checked also in the running editor.
