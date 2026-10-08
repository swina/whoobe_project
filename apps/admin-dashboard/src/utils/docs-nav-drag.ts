// State of the drag in the index editor: a row of the tree ('node') or a document taken from the list of those not yet in the index ('doc').
import { reactive } from 'vue'
import type { DropPosition } from '@whoobe-cms/core'

export const navDrag = reactive<{ kind: 'node' | 'doc' | null; id: string | null; overId: string | null; position: DropPosition | null }>({
  kind: null, id: null, overId: null, position: null,
})

export function clearNavDrag(): void {
  navDrag.kind = null
  navDrag.id = null
  navDrag.overId = null
  navDrag.position = null
}
