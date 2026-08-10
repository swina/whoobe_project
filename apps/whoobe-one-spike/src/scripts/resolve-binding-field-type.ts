// Resolves a data binding's *effective* fieldType, falling back to a Data
// Class lookup when the binding predates fieldType being denormalized onto
// ElementDataBinding (field-transforms.ts) - every binding saved before
// that change has no `fieldType` key at all, which would otherwise leave
// the sidebar's transform picker only able to offer 'any'-gated
// transformers (truncate) for old bindings until manually rebound.
import { ref, watch, type Ref, type ComputedRef } from 'vue'
import { getDataClassByName } from '../data-objects-api'
import type { ElementDataBinding } from './ElementsClass.js'

// Module-level cache shared across every control instance - a class's field
// list rarely changes mid-session, and multiple selected elements often
// reference the same class, so this avoids refetching on every selection.
const classFieldTypesCache = new Map<string, Promise<Record<string, string>>>()

function fetchFieldTypeMap(className: string): Promise<Record<string, string>> {
  let pending = classFieldTypesCache.get(className)
  if (!pending) {
    pending = getDataClassByName(className)
      .then((cls) => {
        const map: Record<string, string> = {}
        for (const f of cls?.fields ?? []) map[f.name] = f.fieldType
        return map
      })
      .catch(() => ({}))
    classFieldTypesCache.set(className, pending)
  }
  return pending
}

/** `undefined` while a legacy binding's fieldType is still being looked up
 *  (matches only 'any'-gated transformers in the meantime, same as today);
 *  `null` for a whole-object binding (no field) or a lookup that found
 *  nothing; otherwise the real fieldType string. */
export function useEffectiveFieldType(binding: ComputedRef<ElementDataBinding | null | undefined>): Ref<string | null | undefined> {
  const resolved = ref<string | null | undefined>(binding.value?.fieldType)

  watch(
    binding,
    async (b) => {
      if (!b) {
        resolved.value = undefined
        return
      }
      // Denormalized already (a binding created/edited after this feature
      // shipped) - including the `null` "whole object" case, which needs
      // no lookup either. `in` distinguishes "key absent" (legacy) from
      // "key present but null/undefined" (a real, already-known answer).
      if ('fieldType' in b) {
        resolved.value = b.fieldType
        return
      }
      if (!b.field) {
        resolved.value = null
        return
      }
      resolved.value = undefined
      const map = await fetchFieldTypeMap(b.className)
      resolved.value = map[b.field] ?? null
    },
    { immediate: true }
  )

  return resolved
}
