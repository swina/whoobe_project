import type { InjectionKey, Ref } from 'vue'
import type { DropPosition, SiblingMove } from '@whoobe-cms/core'
import type { EditNode } from '../../utils/docs-nav-edit'

/** What the rows of the index editor need from the editor around them. */
export interface NavEditorContext {
  root: Ref<EditNode>
  selectedId: Ref<string | null>
  select(id: string): void
  rename(id: string, title: string): void
  remove(id: string): void
  move(id: string, how: SiblingMove): void
  dropNode(id: string, targetId: string, pos: DropPosition): void
  dropDocument(path: string, targetId: string, pos: DropPosition): void
}

export const navEditorKey: InjectionKey<NavEditorContext> = Symbol('docs-nav-editor')
