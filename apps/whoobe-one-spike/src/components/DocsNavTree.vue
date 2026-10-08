<template>
  <ul class="space-y-0.5">
    <li v-for="(n, i) in items" :key="i">
      <template v-if="n.type === 'section'">
        <component :is="n.route ? 'a' : 'div'" v-bind="n.route ? { href: hrefOf(n.route), onClick: (e: Event) => go(e, n.route!) } : {}"
          :class="['block px-2 py-1 rounded text-sm font-semibold', n.route && n.route === current ? 'text-indigo-600 bg-indigo-50' : 'text-gray-800 hover:bg-gray-100']">{{ n.title }}</component>
        <DocsNavTree class="ml-3 pl-2 border-l border-gray-200" :items="n.items" :current="current" :href-of="hrefOf" @go="(r: string) => $emit('go', r)" />
      </template>
      <a v-else-if="n.type === 'doc'" :href="hrefOf(n.route)" :class="['block px-2 py-1 rounded text-sm', n.route === current ? 'text-indigo-600 bg-indigo-50 font-medium' : 'text-gray-600 hover:bg-gray-100']" @click="go($event, n.route)">{{ n.title }}</a>
      <a v-else :href="n.href" target="_blank" rel="noopener noreferrer" class="block px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100">{{ n.title }} <span aria-hidden="true">↗</span></a>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { NavNode } from '../docs-api'

defineOptions({ name: 'DocsNavTree' })
defineProps<{ items: NavNode[]; current: string; hrefOf: (route: string) => string }>()
const emit = defineEmits<{ go: [route: string] }>()

function go(e: Event, route: string) {
  const me = e as MouseEvent
  if (me.ctrlKey || me.metaKey || me.shiftKey || me.button === 1) return   // let the browser open a new tab
  e.preventDefault()
  emit('go', route)
}
</script>
