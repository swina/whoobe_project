// State shared by every open BaseModal: which one is on top (only that one answers Esc) and how many hold the page's scroll.
const stack: symbol[] = []
let locks = 0

export const modalStack = {
  push(id: symbol): void { stack.push(id) },
  remove(id: symbol): void { const i = stack.indexOf(id); if (i >= 0) stack.splice(i, 1) },
  isTop(id: symbol): boolean { return stack[stack.length - 1] === id },
  get size(): number { return stack.length },
}

export function lockPageScroll(): void {
  if (++locks === 1) document.body.style.overflow = 'hidden'
}

export function unlockPageScroll(): void {
  locks = Math.max(0, locks - 1)
  if (locks === 0) document.body.style.overflow = ''
}
