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

export class Database extends Dexie {
  pages: Dexie.Table<Block, string>
  settings: Dexie.Table<StoredSettings, number | string>

  constructor()

  getPages(category?: string, limit?: number, offset?: number, order?: string): Promise<Block[]>
  searchPages(field?: string, search?: string): Promise<Block[]>
  updatePage(id: string, page: Block): Promise<number>
  addPage(page: Block): Promise<string>
  deletePage(pageID: string): Promise<void>
  getSettings(): Promise<StoredSettings[]>
  addSettings(settings: StoredSettings): Promise<number | string>
  updateSettings(id: number | string, settings: StoredSettings): Promise<number>
}

export const forwardOrder: string
export const reverseOrder: string
export const unfinishedFirstOrder: string
