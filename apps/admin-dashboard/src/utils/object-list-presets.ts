export interface ObjectListPreset {
  name: string
  columns: string[]
  isDefault?: boolean
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
  }
}

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

export function setDefaultPreset(classId: string, name: string): ObjectListPreset[] {
  const presets = loadObjectListPresets(classId)
  for (const p of presets) p.isDefault = p.name === name
  saveObjectListPresets(classId, presets)
  return presets
}

export function getDefaultPreset(classId: string): ObjectListPreset | null {
  return loadObjectListPresets(classId).find((p) => p.isDefault) ?? null
}

export function clearDefaultPreset(classId: string): ObjectListPreset[] {
  const presets = loadObjectListPresets(classId)
  for (const p of presets) p.isDefault = false
  saveObjectListPresets(classId, presets)
  return presets
}