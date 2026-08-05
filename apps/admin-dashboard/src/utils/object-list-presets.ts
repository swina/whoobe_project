// Named, user-saved presets for ObjectsView.vue's list-view extra columns
// - docs/plans/UI/editing-object-class.md's own explicit instruction that
// this belongs "in the list view and not in the settings" (superseding
// native-class-authoring-plan.md §3.3's original design, where an admin
// authored one fixed `viewConfig.listColumns` array per class from the
// Class Builder). A deliberate scoping choice: presets live in this
// browser's localStorage, per class, not synced server-side or across
// users/devices - a real, working "save and recall" feature without
// inventing a new per-user-preferences backend surface this app doesn't
// have anywhere else. Stated here rather than silently assumed.
export interface ObjectListPreset {
  name: string
  columns: string[]
}

function storageKey(classId: string): string {
  return `whoobe:object-list-presets:${classId}`
}

export function loadObjectListPresets(classId: string): ObjectListPreset[] {
  try {
    const raw = localStorage.getItem(storageKey(classId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is ObjectListPreset => typeof p?.name === 'string' && Array.isArray(p?.columns))
  } catch {
    return []
  }
}

function saveObjectListPresets(classId: string, presets: ObjectListPreset[]): void {
  try {
    localStorage.setItem(storageKey(classId), JSON.stringify(presets))
  } catch {
    // Storage unavailable/full - presets just won't persist this time,
    // not worth surfacing an error for a convenience feature.
  }
}

/** Insert-or-replace by name - saving under an existing preset's name
 * updates it in place rather than creating a duplicate. */
export function upsertObjectListPreset(classId: string, preset: ObjectListPreset): ObjectListPreset[] {
  const presets = loadObjectListPresets(classId).filter((p) => p.name !== preset.name)
  presets.push(preset)
  saveObjectListPresets(classId, presets)
  return presets
}

export function deleteObjectListPreset(classId: string, name: string): ObjectListPreset[] {
  const presets = loadObjectListPresets(classId).filter((p) => p.name !== name)
  saveObjectListPresets(classId, presets)
  return presets
}
