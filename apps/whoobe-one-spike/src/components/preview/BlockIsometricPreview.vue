<template>
  <component :is="semantic" :id="doc.id" :class="classe" :style="stile" v-bind="extraAttrs">
    <div class="relative" :style="{ height: canvasHeight + 'px' }">
      <svg class="absolute inset-0 w-full h-full overflow-visible" style="pointer-events: none;">
        <g v-for="edge in edges" :key="edge.id">
          <path
            :d="edgePath(edge)"
            fill="none"
            :stroke="edge.color || '#6366f1'"
            :stroke-width="edge.width || 2"
            stroke-opacity="0.8"
            :stroke-dasharray="dashArrayFor(edge.lineStyle)"
          />
          <polygon v-if="edgeArrow(edge)" :points="edgeArrow(edge)" :fill="edge.color || '#6366f1'" fill-opacity="0.8" />
        </g>
      </svg>
      <div
        v-for="box in doc.blocks"
        :key="box.id"
        :ref="(el) => setBoxEl(box.id, el)"
        class="absolute"
        :style="{ left: ((box as any).position?.x ?? 0) + 'px', top: ((box as any).position?.y ?? 0) + 'px' }"
      >
        <component :is="childComponent(box)" v-bind="childProps(box)" />
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
// Read-only preview/publish-time counterpart to ../BlockIsometric.vue - see
// that file's header comment for the full feature. No drag handles, ports,
// or add/remove controls here (nothing to edit at preview time, same split
// as every other *Preview.vue in this folder) - just the boxes placed at
// their saved `position`, connected by the same bezier lines the editing
// canvas draws, each box's own content dispatched exactly like
// BlockContainerPreview.vue dispatches any other container's children.
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import type { Component } from 'vue'
import type Element from '../../scripts/ElementsClass.js'
import type { IsometricEdge } from '../../scripts/ElementsClass.js'
import { BOX_W, arrowPoints, cablePath, edgeFromSide, edgeToSide, portPos } from '../../isometric-ports'
import type { PortSide } from '../../isometric-ports'
import { resolveDisplayUrl } from '../../resolve-display-url'
import { customAttrs, safeAlpineValue } from '../../helpers'
import BlockElementPreview from './BlockElementPreview.vue'
import BlockIFramePreview from './BlockIFramePreview.vue'
import BlockContainerPreview from './BlockContainerPreview.vue'
// Self-import for the (unusual but not invalid) case of a box that's
// itself another Isometric canvas - same pattern BlockSliderPreview.vue
// already uses for a slide that's itself another slider.
import BlockIsometricPreview from './BlockIsometricPreview.vue'
import BlockSliderPreview from './BlockSliderPreview.vue'
import BlockTablePreview from './BlockTablePreview.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
}>()

// BOX_W (../../isometric-ports.ts) is a fallback only, used before a box's real size has been measured - see
// ../BlockIsometric.vue's boxWidth()/setBoxEl() for the full reasoning (same fix, mirrored here since this preview
// also renders real DOM boxes whose size comes from their own css.css, not a fixed constant).
const BOX_H = 120

const edges = computed<IsometricEdge[]>(() => (props.doc as any).isometricEdges ?? [])

function boxById(id: string): WhoobeElement | undefined {
  return props.doc.blocks.find((b) => b.id === id)
}

const boxEls = new Map<string, HTMLElement>()
const boxWidths = reactive<Record<string, number>>({})
const boxHeights = reactive<Record<string, number>>({})
let resizeObserver: ResizeObserver | null = null

function boxWidth(id: string): number {
  return boxWidths[id] ?? BOX_W
}
function boxHeight(id: string): number {
  return boxHeights[id] ?? BOX_H
}

function setBoxEl(id: string, el: unknown) {
  const node = el instanceof HTMLElement ? el : null
  const prev = boxEls.get(id)
  if (prev === node) return
  if (prev && resizeObserver) resizeObserver.unobserve(prev)
  if (node) {
    boxEls.set(id, node)
    boxWidths[id] = node.offsetWidth || BOX_W
    boxHeights[id] = node.offsetHeight || BOX_H
    resizeObserver?.observe(node)
  } else {
    boxEls.delete(id)
    delete boxWidths[id]
    delete boxHeights[id]
  }
}

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      for (const [id, node] of boxEls) {
        if (node !== entry.target) continue
        boxWidths[id] = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
        boxHeights[id] = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        break
      }
    }
  })
  for (const node of boxEls.values()) resizeObserver.observe(node)
})
onUnmounted(() => resizeObserver?.disconnect())

// Same 3 line styles ../BlockIsometric.vue's popover offers - kept in sync
// by hand (no shared constant module between the two files, same as every
// other editor/preview pair in this app).
function dashArrayFor(lineStyle: IsometricEdge['lineStyle']): string | undefined {
  if (lineStyle === 'dashed') return '8 5'
  if (lineStyle === 'dotted') return '1.5 4'
  return undefined
}

function boxPortPos(box: WhoobeElement, side: PortSide) {
  return portPos((box as any).position ?? { x: 0, y: 0 }, boxWidth(box.id), boxHeight(box.id), side)
}

function edgePath(edge: IsometricEdge): string {
  const from = boxById(edge.fromId)
  const to = boxById(edge.toId)
  if (!from || !to) return ''
  const s1 = edgeFromSide(edge)
  const s2 = edgeToSide(edge)
  return cablePath(boxPortPos(from, s1), s1, boxPortPos(to, s2), s2)
}

function edgeArrow(edge: IsometricEdge): string {
  const to = boxById(edge.toId)
  if (!to || !boxById(edge.fromId)) return ''
  const s2 = edgeToSide(edge)
  return arrowPoints(boxPortPos(to, s2), s2, edge.width || 2)
}

const canvasHeight = computed(() => {
  const maxY = props.doc.blocks.reduce((m, b) => Math.max(m, ((b as any).position?.y ?? 0) + 160), 0)
  return Math.max(320, maxY + 60)
})

function childComponent(child: WhoobeElement): Component {
  const c = child as any
  if (c.tag === 'isometric') return BlockIsometricPreview as unknown as Component
  if (c.tag === 'slider') return BlockSliderPreview as unknown as Component
  if (c.tag === 'table') return BlockTablePreview as unknown as Component
  if (c.type === 'container') return BlockContainerPreview as unknown as Component
  if (c.tag === 'youtube' || c.tag === 'vimeo') return BlockIFramePreview as unknown as Component
  return BlockElementPreview as unknown as Component
}

function childProps(child: WhoobeElement): Record<string, unknown> {
  const c = child as any
  if (c.tag === 'table') return { doc: child }
  if (c.tag === 'isometric' || c.tag === 'slider' || c.type === 'container') return { doc: child }
  return { element: child }
}

const semantic = computed(() => (props.doc as any).semantic || 'div')

const classe = computed(() => {
  const doc = props.doc as any
  return `${doc.css?.css ?? ''} ${doc.css?.container ?? ''}`.trim()
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
  return st + (doc.style ?? '')
})

const alpineAttrs = computed(() => {
  const alpine = (props.doc as any).alpine as Record<string, string> | undefined
  if (!alpine) return {}
  const result: Record<string, string> = {}
  for (const key of Object.keys(alpine)) {
    result[key] = alpine[key] ? safeAlpineValue(alpine[key], key) : ''
  }
  return result
})

const extraAttrs = computed(() => ({
  ...customAttrs((props.doc as any).data?.attributes),
  ...alpineAttrs.value,
}))
</script>
