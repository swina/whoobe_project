// `x-collapse` for Alpine.js, on the Web Animations API: the same directive the editor, the pages and the generated sites have always used
// (`x-show="open" x-collapse`, `x-collapse.duration.500ms`, `x-collapse.min.50px`), without the separate @alpinejs/collapse package.
// Register it with `Alpine.plugin(alpineCollapse)` before `Alpine.start()`.
//
// How it fits `x-show`: Alpine's x-show asks `el._x_transition` to run `in()` when the element is shown and `out()` when it is hidden, and reads
// `el._x_isShown`. This plugin supplies that object: it animates the height between the closed height (0, or the `.min` value) and the natural height,
// and does the hiding (`display: none` / `hidden`) itself once the closing is done. The function is self-contained (no module-level helpers) so a
// generator can copy its compiled text into a project that has no access to this package.

/* eslint-disable @typescript-eslint/no-explicit-any */
export function alpineCollapse(Alpine: any): void {
  const modifierValue = (modifiers: string[], key: string, fallback: number): number => {
    const i = modifiers.indexOf(key)
    if (i === -1) return fallback
    const raw = modifiers[i + 1]
    if (!raw) return fallback
    const m = key === 'duration' ? /^([0-9.]+)(ms|s)?$/.exec(raw) : /^([0-9.]+)(px)?$/.exec(raw)
    if (!m) return fallback
    const n = Number(m[1])
    return key === 'duration' && m[2] === 's' ? n * 1000 : n
  }

  const collapse: any = (el: any, { modifiers }: { modifiers: string[] }) => {
    const duration = modifierValue(modifiers, 'duration', 250)
    const floor = modifierValue(modifiers, 'min', 0)
    const fullyHide = !modifiers.includes('min')
    const easing = 'cubic-bezier(0.4, 0.0, 0.2, 1)'
    let running: Animation | null = null

    if (!el._x_isShown) {
      el.style.height = `${floor}px`
      if (fullyHide) el.hidden = true
      el.style.overflow = 'hidden'
    }

    const run = (from: number, to: number, done: () => void): void => {
      const canAnimate = typeof el.animate === 'function' && duration > 0
      if (!canAnimate) { done(); return }
      const anim: Animation = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing })
      running = anim
      const end = () => { if (running === anim) { running = null; done() } }
      anim.onfinish = end
      anim.oncancel = () => { if (running === anim) running = null }
    }

    el._x_transition = {
      in() {
        // from wherever the element is now (it may be half way through closing) to its natural height
        let current = el.getBoundingClientRect().height
        running?.cancel()
        if (fullyHide) { el.hidden = false; el.style.display = '' }
        el.style.height = 'auto'
        const full = el.getBoundingClientRect().height
        if (current === full) current = floor
        el._x_isShown = true
        el.style.overflow = 'hidden'
        run(current, full, () => { if (Math.abs(el.getBoundingClientRect().height - full) < 1) el.style.overflow = '' })
      },
      out() {
        const full = el.getBoundingClientRect().height
        running?.cancel()
        el.style.overflow = 'hidden'
        el.style.height = `${floor}px`
        run(full, floor, () => {
          el._x_isShown = false
          if (fullyHide && el.style.height === `${floor}px`) { el.style.display = 'none'; el.hidden = true }
        })
      },
    }
  }

  // `.min`: the element is never hidden, so x-show must not touch `display`
  collapse.inline = (el: any, { modifiers }: { modifiers: string[] }) => {
    if (!modifiers.includes('min')) return
    el._x_doShow = () => {}
    el._x_doHide = () => {}
  }

  Alpine.directive('collapse', collapse)
}
