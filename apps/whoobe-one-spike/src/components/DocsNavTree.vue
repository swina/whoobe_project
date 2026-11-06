<template>
  <ul class="space-y-0.5">
    <li v-for="(n, i) in items" :key="i">
      <template v-if="n.type === 'section'">
        <!-- A section opens and closes with the arrow; only the sections on the way to the current page start open. A section with
             its own page (index: in _nav.yml) keeps its title as a link to it; without one, the title opens and closes it too. -->
        <div :class="['flex items-center rounded', n.route && n.route === current ? 'bg-indigo-50' : 'hover:bg-gray-100']">
          <button type="button" class="shrink-0 w-5 h-6 flex items-center justify-center text-gray-400" data-testid="docs-nav-toggle"
            :aria-expanded="isOpen(i)" :aria-label="(isOpen(i) ? 'Close ' : 'Open ') + n.title" @click="toggle(i)">
            <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" :style="{ transform: isOpen(i) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }">
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <a v-if="n.route" :href="hrefOf(n.route)" :aria-current="n.route === current ? 'page' : undefined"
            :class="['flex-1 min-w-0 block pr-2 py-1 text-[13px] font-semibold', n.route === current ? 'text-indigo-600' : 'text-gray-800']" @click="go($event, n.route)">{{ n.title }}</a>
          <button v-else type="button" class="flex-1 min-w-0 text-left pr-2 py-1 text-[13px] font-semibold text-gray-800" :aria-expanded="isOpen(i)" @click="toggle(i)">{{ n.title }}</button>
        </div>
        <DocsNavTree v-show="isOpen(i)" class="ml-3 pl-2 border-l border-gray-200" :items="n.items" :current="current" :href-of="hrefOf" @go="(r: string) => $emit('go', r)" />
      </template>
      <a v-else-if="n.type === 'doc'" :href="hrefOf(n.route)" :aria-current="n.route === current ? 'page' : undefined"
        :class="['block px-2 py-0.5 rounded text-[13px] leading-snug', n.route === current ? 'text-indigo-600 bg-indigo-50 font-medium' : 'text-gray-600 hover:bg-gray-100']" @click="go($event, n.route)">{{ n.title }}</a>
      <a v-else :href="n.href" target="_blank" rel="noopener noreferrer" class="block px-2 py-0.5 rounded text-[13px] text-gray-600 hover:bg-gray-100">{{ n.title }} <span aria-hidden="true">↗</span></a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { NavNode } from '../docs-api'

defineOptions({ name: 'DocsNavTree' })
const props = defineProps<{ items: NavNode[]; current: string; hrefOf: (route: string) => string }>()
const emit = defineEmits<{ go: [route: string] }>()

/** Does this part of the index hold the page `route` (the section's own page included)? */
function holds(n: NavNode, route: string): boolean {
  if (n.type === 'doc') return n.route === route
  if (n.type === 'section') return n.route === route || n.items.some((c) => holds(c, route))
  return false
}

// open sections of this level, by position; moving to another page opens the sections on its way and leaves the others as the
// reader left them
const open = reactive(new Set<number>())
watch(() => [props.current, props.items] as const, ([route, items]) => {
  items.forEach((n, i) => { if (n.type === 'section' && holds(n, route)) open.add(i) })
}, { immediate: true })
const isOpen = (i: number) => open.has(i)
function toggle(i: number) { if (open.has(i)) open.delete(i); else open.add(i) }

function go(e: Event, route: string) {
  const me = e as MouseEvent
  if (me.ctrlKey || me.metaKey || me.shiftKey || me.button === 1) return   // let the browser open a new tab
  e.preventDefault()
  emit('go', route)
}
</script>
