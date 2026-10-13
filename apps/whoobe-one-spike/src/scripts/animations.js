// The animation effects and eases the editor offers (the Animation panel and the toolbar picker). The effects themselves, and how they
// play, are in @whoobe-cms/renderer (animations.ts), shared with every output; this file only exposes the names, under the keys the editor uses.
import { ANIMATION_EFFECTS, ANIMATION_EASES } from '@whoobe-cms/renderer'

const gsapEffects = [...ANIMATION_EFFECTS]
const gsapEase = [...ANIMATION_EASES]

export default { gsapEffects, gsapEase }
