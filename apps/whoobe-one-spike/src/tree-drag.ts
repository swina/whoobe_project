// State shared by the rows of the element tree while one of them is being dragged (the rows are many components; the drag is one).
import { reactive } from 'vue'
import type { DropPosition } from '@whoobe-cms/core'

export const treeDrag = reactive<{ id: string | null; overId: string | null; position: DropPosition | null }>({ id: null, overId: null, position: null })

export function clearTreeDrag(): void {
  treeDrag.id = null
  treeDrag.overId = null
  treeDrag.position = null
}
