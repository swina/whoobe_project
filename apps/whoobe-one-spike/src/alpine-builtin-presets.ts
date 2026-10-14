// Presets that ship with the editor: always in the Alpine presets list (AlpineJS tool), read-only, not part of the
// administrator's catalog. Applying one COPIES its directives into the element, like any preset.
import type { AlpinePreset } from './alpine-presets-api'

export const BUILTIN_ALPINE_PRESETS: AlpinePreset[] = [
  {
    name: 'Form result',
    description: 'On a container around a form: done, ok and outcome are set when the form answers (event whoobe-form-result). Elements inside read them with x-show / x-text.',
    directives: {
      'x-data': '{ done: false, ok: false, outcome: null }',
      '@whoobe-form-result': 'done = true; ok = $event.detail.ok; outcome = $event.detail.outcome',
    },
  },
]
