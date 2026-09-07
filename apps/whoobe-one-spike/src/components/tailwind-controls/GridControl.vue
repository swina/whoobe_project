<template>
  <div class="flex flex-col gap-2">
    <span class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold capitalize">{{ title }}</span>

    <!-- Column count buttons -->
    <div class="flex gap-1">
      <button
        v-for="n in 6"
        :key="n"
        @click="selectCols(n)"
        class="flex-1 px-2 py-1.5 text-xs font-semibold rounded border transition"
        :class="cols === n ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'"
      >{{ n }}</button>
    </div>

    <!-- Distribution patterns -->
    <div v-if="patterns.length" class="space-y-1.5 mt-1">
      <span class="text-[10px] text-gray-400">Column span patterns</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="(pat, pIdx) in patterns"
          :key="pIdx"
          @click="selectPattern(pat)"
          class="flex items-center gap-0.5 px-2 py-1 rounded text-xs border transition"
          :class="activePatternIdx === pIdx ? 'bg-indigo-100 border-indigo-400 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
        >
          <span
            v-for="(span, sIdx) in pat"
            :key="sIdx"
            class="inline-flex items-center justify-center h-5 rounded text-[10px] font-mono font-bold"
            :class="span === activeSpan(sIdx, pat) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'"
            :style="{ width: `${(span / Math.max(...pat)) * 40 + 16}px`, minWidth: '20px' }"
          >{{ span }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorStore } from '../../store/editor'
import { currentValueFor, applyValue } from '../../scripts/tailwind-control'
import colSpans from '../../scripts/grid'

const props = defineProps<{ attr: string; title?: string }>()
const editor = useEditorStore()

const currentVal = computed(() => currentValueFor(editor, props.attr))
const cols = ref(parseCurrentCols(currentVal.value))

function parseCurrentCols(val: string): number {
  const m = val.match(/grid-cols-(\d+)/)
  return m ? parseInt(m[1], 10) : 2
}

const patterns = computed(() => (colSpans as Record<string, number[][]>)[String(cols.value)] ?? [])
const activePatternIdx = ref(-1)
const activeColsAtSelection = ref(cols.value)

function activeSpan(sIdx: number, pat: number[]): number {
  if (activePatternIdx.value === -1 || activeColsAtSelection.value !== cols.value) return 0
  return pat[sIdx] ?? 0
}

function selectCols(n: number) {
  cols.value = n
  activePatternIdx.value = -1
  applyValue(editor, props.attr, `md:grid-cols-${n}`)
}

function selectPattern(pat: number[]) {
  activePatternIdx.value = patterns.value.indexOf(pat)
  activeColsAtSelection.value = cols.value
  applyValue(editor, props.attr, `md:grid-cols-${cols.value}`)
}
</script>