// Hand-written type shim for the verbatim-ported DatabaseClass.js - same
// rationale as ElementsClass.d.ts/BlocksClass.d.ts. Dexie itself ships real
// TS types, so this just describes the two tables and methods this class
// adds on top of it.
import Dexie from 'dexie'
import type Block from './BlocksClass.js'

export interface StoredSettings {
  id: number | string
  autosave?: boolean
  autosaveTimeout?: number
  categories?: string[]
}

// The actual plain-data shape of a template entry as it's ever really
// persisted/fetched - never a real `Block` class instance (that has
// methods; neither Dexie/IndexedDB nor a static JSON file can store those -
// see database-actions.ts's savePage() for the exact DataCloneError this
// already caused once for a live Block instance passed to Dexie directly).
export interface StoredTemplateBuild {
  purgeCSS: string[] | null
  images: string[] | null
  fonts: string[] | null
  plugins: any
}

export interface StoredTemplate {
  id: string
  blocks_id: string
  name: string
  description: string
  category: string
  tags: string[]
  json: { build: StoredTemplateBuild; blocks: any }
  html: string | null
  image: string
  enabled: boolean
  premium: boolean
  stars: number
  favorite: boolean
  path?: string
}

// Not in the source - whoobe-one-studio's own public/kits/*.json "UI Kit"
// format: a named, categorized collection of templates. See database-
// actions.ts's importRepoKitsIfNeeded()/addTemplateToKit().
export interface StoredKit {
  id: string
  name: string
  description: string
  category: string
  templates: StoredTemplate[]
}

export class Database extends Dexie {
  pages: Dexie.Table<Block, string>
  settings: Dexie.Table<StoredSettings, number | string>
  kits: Dexie.Table<StoredKit, string>

  constructor()

  getPages(category?: string, limit?: number, offset?: number, order?: string): Promise<Block[]>
  searchPages(field?: string, search?: string): Promise<Block[]>
  updatePage(id: string, page: Block): Promise<number>
  addPage(page: Block): Promise<string>
  deletePage(pageID: string): Promise<void>
  getKits(): Promise<StoredKit[]>
  addKit(kit: StoredKit): Promise<string>
  updateKit(id: string, kit: StoredKit): Promise<number>
  deleteKit(kitID: string): Promise<void>
  getSettings(): Promise<StoredSettings[]>
  addSettings(settings: StoredSettings): Promise<number | string>
  updateSettings(id: number | string, settings: StoredSettings): Promise<number>
}

export const forwardOrder: string
export const reverseOrder: string
export const unfinishedFirstOrder: string
