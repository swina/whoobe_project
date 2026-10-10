<template>
  <!-- The corner tag button lives in this outer wrapper, as a SIBLING of
       the actual rendered `<component>` below, not as its child - the same
       fix BlockContainer.vue's/BlockSlider.vue's own corner tag badges
       already got: purely editor-only chrome that should never visually
       bounce/scale/shake along with a "preview this animation" tween run
       directly on the id'd content node (see BlockContainer.vue's own
       comment for the full reasoning). -->
  <div class="relative" :class="groupClass" :data-toolbar-anchor="doc.id">
    <button
      type="button"
      class="absolute -top-2.5 -left-2.5 z-50 px-1.5 py-0.5 rounded text-[10px] leading-none font-semibold text-white transition-opacity"
      :class="[tagOpacityClass, tagBgClass]"
      @click.stop="onSelect"
    >
      {{ doc.tag || 'container' }}
    </button>
    <component
      :is="semantic"
      :id="doc.id"
      :class="classe"
      :style="stile"
      data-type="container"
      :data-id="doc.id"
      v-bind="isometricAttrs"
      @click.self="onSelect"
    >

    <!-- Toolbar - not draggable/connectable itself, just controls -->
    <div class="relative z-10 flex items-center gap-2 mb-2 bg-slate-100 px-2 py-1.5 rounded" @click.stop>
      <span class="text-[10px] text-gray-400">{{ doc.blocks.length }} box{{ doc.blocks.length === 1 ? '' : 'es' }} · {{ edges.length }} connection{{ edges.length === 1 ? '' : 's' }}</span>
      <span class="flex-1" />
      <button
        type="button"
        title="Add box"
        class="flex items-center gap-1 h-6 px-2 rounded border border-dashed border-gray-300 text-[10px] font-semibold text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
        @click="addBox"
      >
        <Plus class="w-3.5 h-3.5" /> Add box
      </button>
    </div>

    <!-- Canvas -->
    <div
      ref="canvasEl"
      class="relative overflow-auto rounded border border-dashed border-gray-300 bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)]"
      style="background-size: 20px 20px;"
      :style="{ height: canvasHeight + 'px' }"
      @mousemove="onCanvasMousemove"
      @mouseup="onCanvasMouseup"
    >
      <div v-if="!doc.blocks.length" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span class="text-[10px] text-gray-400 text-center px-4">Click "Add box" to start, then drag from a connection point ● of one box to a ● of another to connect them.</span>
      </div>

      <!-- Cable layer -->
      <svg class="absolute inset-0 w-full h-full overflow-visible" style="pointer-events: none; z-index: 1;">
        <g v-for="edge in edges" :key="edge.id">
          <!-- wide invisible hit area - the visible stroke below can be as
               thin as 1px, too thin to reliably click -->
          <path
            :d="edgePath(edge)"
            fill="none" stroke="transparent" stroke-width="12"
            style="pointer-events: stroke; cursor: pointer;"
            @click="editingEdgeId = editingEdgeId === edge.id ? null : edge.id"
          />
          <path
            :d="edgePath(edge)"
            fill="none"
            :stroke="edge.color || '#6366f1'"
            :stroke-width="edge.width || 2"
            stroke-opacity="0.8"
            :stroke-dasharray="dashArrayFor(edge.lineStyle)"
            style="pointer-events: none;"
          />
        </g>
        <path v-if="pendingConnection" :d="pendingPath()" fill="none" stroke="#6366f1" stroke-width="2" stroke-opacity="0.4" stroke-dasharray="6 4" />
      </svg>

      <!-- Arrow heads: their own layer above the boxes and their ports, so the tip sits exactly on the box side (the
           port circle is centred on that side and would otherwise cover it) -->
      <svg class="absolute inset-0 w-full h-full overflow-visible" style="pointer-events: none; z-index: 35;">
        <polygon
          v-for="edge in edges.filter((e) => edgeArrow(e))"
          :key="edge.id"
          :points="edgeArrow(edge)"
          :fill="edge.color || '#6366f1'"
          fill-opacity="0.9"
        />
      </svg>

      <!-- Connection style popover - opened by clicking a cable (above),
           closed by clicking anywhere else. Mirrors FloatingToolbar.vue's
           own small popovers (white card, gray border) rather than
           removing the connection on click like this started out doing -
           color/width/line-style are common enough to want to change
           without having to redraw the cable from scratch. -->
      <template v-if="editingEdge">
        <div class="fixed inset-0 z-30" @click="editingEdgeId = null" />
        <div
          class="absolute z-40 bg-white border border-gray-300 rounded-lg shadow-xl p-3 flex flex-col gap-2.5 w-56"
          :style="{ left: editingEdgeMidpoint.x + 'px', top: editingEdgeMidpoint.y + 'px', transform: 'translate(-50%, -50%)' }"
          @click.stop
          @mousedown.stop
        >
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Connection</span>
            <button type="button" class="text-gray-400 hover:text-gray-700" @click="editingEdgeId = null"><X class="w-3.5 h-3.5" /></button>
          </div>
          <label class="flex items-center justify-between text-[11px] text-gray-600">
            Color
            <input type="color" class="w-8 h-6 border border-gray-300 rounded cursor-pointer" :value="editingEdge.color || '#6366f1'" @input="setEdgeColor(($event.target as HTMLInputElement).value)" />
          </label>
          <label class="flex items-center justify-between text-[11px] text-gray-600">
            Thickness
            <input type="range" min="1" max="6" step="1" class="w-28" :value="editingEdge.width || 2" @input="setEdgeWidth(Number(($event.target as HTMLInputElement).value))" />
          </label>
          <div class="flex items-center gap-1.5">
            <button
              v-for="opt in (['solid', 'dashed', 'dotted'] as const)"
              :key="opt"
              type="button"
              class="flex-1 h-6 rounded text-[10px] font-medium border capitalize"
              :class="(editingEdge.lineStyle || 'solid') === opt ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400'"
              @click="setEdgeLineStyle(opt)"
            >{{ opt }}</button>
          </div>
          <button
            type="button"
            class="flex items-center justify-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-600 pt-1.5 border-t border-gray-200"
            @click="removeEdge(editingEdge.id); editingEdgeId = null"
          >
            <Trash2 class="w-3 h-3" /> Remove connection
          </button>
        </div>
      </template>

      <!-- Boxes. No inline `width` here (deliberately, see boxWidth()'s own
           comment below) - an absolutely positioned box with only `left`/
           `top` set shrink-wraps to its content's own width, so whatever
           width the box's own css.css ends up with (its `w-60` default, or
           anything the user restyles it to) IS the wrapper's real width. -->
      <div
        v-for="box in doc.blocks"
        :key="box.id"
        :ref="(el) => setBoxEl(box.id, el)"
        :class="'absolute select-none group/' + box.id"
        :style="{ left: (box.position?.x ?? 0) + 'px', top: (box.position?.y ?? 0) + 'px', zIndex: editor.current?.id === box.id ? 3 : 2 }"
      >
        <!-- Connection ports, one on each side of the box; any port can start a cable (mousedown) or receive one
             (mouseup). z-[60] (not the z-4 this started with) is load-bearing, not cosmetic: BlockContainer.vue's own
             corner tag button (the "isometric-box" label every box gets) is absolutely positioned at -top-2.5
             -left-2.5 relative to the box's *content*, which sits right below these ports in the same stacking
             context (box content has no z-index of its own, so it doesn't isolate a new stacking context - z-index
             values compare directly against the ports). At z-50 that corner tag geometrically overlaps the left
             port's small hit-area and, being higher, silently ate every mouseup meant for it - a drag from another
             box's port would visually reach here but never complete a connection. z-[60] (and the drag handle below,
             same reasoning) simply outranks it so a port always wins the overlap. The position tracks this box's real
             measured size (boxWidth()/boxHeight()), not a fixed constant - see boxWidth()'s own comment for why. -->
        <svg
          v-for="side in PORT_SIDES"
          :key="side"
          class="absolute z-[60]"
          :style="portStyle(box, side)"
          @mousedown.stop="onPortMousedown($event, box, side)"
          @mouseup.stop="onPortMouseup(box, side)"
        >
          <circle cx="9" cy="9" r="6" fill="white" stroke="#4f46e5" stroke-width="2" />
          <title>Connection point ({{ side }})</title>
        </svg>

        <!-- Drag handle + remove, replacing the permanent header bar this
             started with - that bar was both unnecessary chrome and, sitting
             directly above the box's content, visually covered
             BlockContainer.vue's own corner tag button (which pops up
             -top-2.5 above the content, i.e. right where the bar was).
             Top-RIGHT (not top-left, where that tag button lives) and
             hover-only (this box's own named group, `group/<id>`, set on
             the wrapper above - matches BlockContainer.vue's own per-node
             named-group convention, not a shared bare `group` class, for
             the same hover-leak reason its own comment documents) - so the
             tag stays fully visible at rest and this only appears when
             actually wanted. Still z-[60]: same overlap risk as the ports,
             since it sits in the same stacking context as that tag button. -->
        <div
          class="absolute -top-2.5 right-1 z-[60] flex items-center gap-1 opacity-0 transition-opacity"
          :class="'group-hover/' + box.id + ':opacity-100'"
        >
          <button
            type="button"
            class="w-5 h-5 flex items-center justify-center rounded bg-indigo-600 text-white cursor-grab active:cursor-grabbing"
            title="Drag to move"
            @mousedown.stop="onBoxMousedown($event, box)"
          >
            <GripVertical class="w-3 h-3" />
          </button>
          <button
            type="button"
            class="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300"
            title="Remove box"
            @mousedown.stop
            @click.stop="removeBox(box)"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Box content - a real container, drops/selects/edits exactly
             like any other (dragula only needs the .dragula-container
             class BlockContainer.vue already puts on it, re-queried live). -->
        <BlockContainer :doc="box" :level="level + 1" :data-context="dataContext" />
      </div>
    </div>
    </component>
  </div>
</template>

<script setup lang="ts">
// Editing-time renderer for a `tag === 'isometric'` canvas (see
// ElementsClass.js's Isometric()/IsometricBox()) - a freely-positioned,
// connectable node canvas modeled on a MIDI-style patch bay: boxes
// (`doc.blocks`, each a real container) placed by absolute `position`, wired
// together by dragging from a port ● on any side of a box to a port on another box, wires stored as
// `doc.isometricEdges` (with the side each end uses; see ../isometric-ports.ts).
//
// Deliberately NOT a port of any existing block component - closest kin is
// BlockSlider.vue (same corner-tag/selection/dragula-container conventions,
// same "children are just doc.blocks" idea), but a slider only ever shows
// one linear sequence with no geometry; this needs real x/y placement and a
// second piece of state (edges) with no equivalent anywhere else in this
// app, so it's its own file rather than a conditional branch bolted onto
// BlockContainer.vue or BlockSlider.vue.
//
// Box dragging and cable dragging share one mousemove/mouseup pair on the
// canvas element (mirrors the reference patch-bay UI this was modeled on -
// MidiWizardFlow.vue's onCanvasMousemove/onCanvasMouseup) rather than two
// separate listener sets, since at most one of them is ever active at once.
// A window-level mouseup is also wired so releasing the mouse outside the
// canvas (a fast drag) still ends the gesture instead of leaving a phantom
// pending connection or a box stuck mid-drag.
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { CSSProperties } from 'vue'
import { GripVertical, Plus, Trash2, X } from '@lucide/vue'
import Element from '../scripts/ElementsClass.js'
import type { IsometricEdge } from '../scripts/ElementsClass.js'
import { BOX_W, PORT_SIDES, arrowPoints, cablePath, edgeFromSide, edgeToSide, oppositeSide, portPos } from '../isometric-ports'
import type { PortSide } from '../isometric-ports'
import { useEditorStore } from '../store/editor'
import { resolveDisplayUrl } from '../resolve-display-url'
import { customAttrs } from '../helpers'
import type { DataObjectRecord } from '../data-objects-api'
import BlockContainer from './BlockContainer.vue'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  doc: WhoobeElement
  level: number
  dataContext?: DataObjectRecord | null
}>()

const editor = useEditorStore()

// BOX_W (../isometric-ports.ts) is a fallback only, used before a box's real size has ever been measured (first paint,
// one frame) - see boxWidth()/setBoxEl() below for why ports no longer trust a fixed constant past that point. It
// matches IsometricBox()'s own `w-60` default (ElementsClass.js), so that one frame looks right too.
const BOX_H = 120

const edges = computed<IsometricEdge[]>(() => (props.doc as any).isometricEdges ?? [])

function boxById(id: string): WhoobeElement | undefined {
  return props.doc.blocks.find((b) => b.id === id)
}

// Real, measured width of each box's rendered DOM element, kept live via a
// single shared ResizeObserver (below) - NOT a fixed constant. A box's
// width isn't fixed data (there's no `box.width` field): it's whatever
// its own css.css ends up rendering at (the `w-60` IsometricBox() starts
// it at, or anything wider/narrower the user restyles it to via the
// Custom Classes popover). Reading the real DOM width, live, is the only
// way the OUT port (and any cable landing on it) tracks that - a fixed
// BOX_W constant here left the port stuck exactly where the box's WIDTH
// AT CREATION TIME put it, ignoring every later resize (the reported bug
// this fixes).
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

// Vue 3 function-ref callback (`:ref="(el) => setBoxEl(box.id, el)"` on the
// box wrapper in the template) - fires with the real element on mount and
// with `null` on unmount, which is also how a removed box's own entry gets
// cleaned up here (no separate watch needed).
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

function boxPortPos(box: WhoobeElement, side: PortSide) {
  return portPos((box as any).position ?? { x: 0, y: 0 }, boxWidth(box.id), boxHeight(box.id), side)
}

// Box-local style of a port's <svg> (18x18, centred on the port position)
function portStyle(box: WhoobeElement, side: PortSide): CSSProperties {
  const w = boxWidth(box.id)
  const h = boxHeight(box.id)
  const at = portPos({ x: 0, y: 0 }, w, h, side)
  return { left: at.x - 9 + 'px', top: at.y - 9 + 'px', width: '18px', height: '18px', pointerEvents: 'all', cursor: 'crosshair' }
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

function removeEdge(id: string) {
  const doc = props.doc as any
  doc.isometricEdges = (doc.isometricEdges ?? []).filter((e: IsometricEdge) => e.id !== id)
  if (editingEdgeId.value === id) editingEdgeId.value = null
}

// --- Per-connection style popover ---
// SVG stroke-dasharray values for the 3 line styles the popover offers -
// 'dashed'/'dotted' differ only in dash length vs gap (a short, round-ish
// dash reads as "dotted" at typical 1-6px widths without needing a real
// round linecap/circle-marker scheme).
function dashArrayFor(lineStyle: IsometricEdge['lineStyle']): string | undefined {
  if (lineStyle === 'dashed') return '8 5'
  if (lineStyle === 'dotted') return '1.5 4'
  return undefined
}

const editingEdgeId = ref<string | null>(null)
const editingEdge = computed<IsometricEdge | null>(() => edges.value.find((e) => e.id === editingEdgeId.value) ?? null)
const editingEdgeMidpoint = computed(() => {
  const edge = editingEdge.value
  if (!edge) return { x: 0, y: 0 }
  const from = boxById(edge.fromId)
  const to = boxById(edge.toId)
  if (!from || !to) return { x: 0, y: 0 }
  const p1 = boxPortPos(from, edgeFromSide(edge))
  const p2 = boxPortPos(to, edgeToSide(edge))
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
})

function mutateEditingEdge(fn: (edge: IsometricEdge) => void) {
  if (!editingEdgeId.value) return
  const doc = props.doc as any
  const list: IsometricEdge[] = doc.isometricEdges ?? []
  const edge = list.find((e) => e.id === editingEdgeId.value)
  if (edge) fn(edge)
}
function setEdgeColor(color: string) {
  mutateEditingEdge((edge) => { edge.color = color })
}
function setEdgeWidth(width: number) {
  mutateEditingEdge((edge) => { edge.width = width })
}
function setEdgeLineStyle(lineStyle: NonNullable<IsometricEdge['lineStyle']>) {
  mutateEditingEdge((edge) => { edge.lineStyle = lineStyle })
}

// Canvas grows to fit the lowest box, with a comfortable floor/margin - the
// same idea as MidiWizardFlow.vue's own overflow-auto canvas, just computed
// from data instead of scroll-detected.
const canvasHeight = computed(() => {
  const maxY = props.doc.blocks.reduce((m, b) => Math.max(m, ((b as any).position?.y ?? 0) + 160), 0)
  return Math.max(320, maxY + 60)
})

const canvasEl = ref<HTMLElement | null>(null)

function canvasRelative(e: MouseEvent): { x: number; y: number } {
  const rect = canvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left + canvasEl.value!.scrollLeft, y: e.clientY - rect.top + canvasEl.value!.scrollTop }
}

// --- Box dragging ---
const draggingBox = ref<{ id: string; ox: number; oy: number } | null>(null)

function onBoxMousedown(e: MouseEvent, box: WhoobeElement) {
  editor.setCurrent(box)
  const { x, y } = canvasRelative(e)
  const p = (box as any).position ?? { x: 0, y: 0 }
  draggingBox.value = { id: box.id, ox: x - p.x, oy: y - p.y }
}

// --- Cable dragging ---
const pendingConnection = ref<{ fromId: string; fromSide: PortSide; mx: number; my: number } | null>(null)

function onPortMousedown(e: MouseEvent, box: WhoobeElement, side: PortSide) {
  const { x, y } = canvasRelative(e)
  pendingConnection.value = { fromId: box.id, fromSide: side, mx: x, my: y }
}

function onPortMouseup(box: WhoobeElement, side: PortSide) {
  const pending = pendingConnection.value
  pendingConnection.value = null
  if (!pending || pending.fromId === box.id) return
  const doc = props.doc as any
  const list: IsometricEdge[] = doc.isometricEdges ?? (doc.isometricEdges = [])
  const exists = list.some((e) => e.fromId === pending.fromId && e.toId === box.id && edgeFromSide(e) === pending.fromSide && edgeToSide(e) === side)
  if (!exists) list.push({ id: new Element().randomID(), fromId: pending.fromId, fromSide: pending.fromSide, toId: box.id, toSide: side })
}

function pendingPath(): string {
  const pending = pendingConnection.value
  if (!pending) return ''
  const from = boxById(pending.fromId)
  if (!from) return ''
  return cablePath(boxPortPos(from, pending.fromSide), pending.fromSide, { x: pending.mx, y: pending.my }, oppositeSide(pending.fromSide))
}

function onCanvasMousemove(e: MouseEvent) {
  if (!draggingBox.value && !pendingConnection.value) return
  const { x, y } = canvasRelative(e)
  if (draggingBox.value) {
    const box = boxById(draggingBox.value.id)
    if (box) (box as any).position = { x: Math.max(0, x - draggingBox.value.ox), y: Math.max(0, y - draggingBox.value.oy) }
  }
  if (pendingConnection.value) {
    pendingConnection.value.mx = x
    pendingConnection.value.my = y
  }
}

function onCanvasMouseup() {
  draggingBox.value = null
  pendingConnection.value = null
}

onMounted(() => {
  window.addEventListener('mouseup', onCanvasMouseup)
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
onUnmounted(() => {
  window.removeEventListener('mouseup', onCanvasMouseup)
  resizeObserver?.disconnect()
})

// --- Box add/remove ---
function addBox() {
  const count = props.doc.blocks.length
  const created = new Element().IsometricBox(40 + (count * 30) % 320, 40 + (count * 60) % 320)
  props.doc.blocks.push(created)
  editor.setCurrent(created)
}

function removeBox(box: WhoobeElement) {
  props.doc.blocks = props.doc.blocks.filter((b) => b.id !== box.id)
  const doc = props.doc as any
  doc.isometricEdges = (doc.isometricEdges ?? []).filter((e: IsometricEdge) => e.fromId !== box.id && e.toId !== box.id)
  if (editor.current?.id === box.id) editor.setCurrent(null)
}

// --- Same corner-tag/selection/classe conventions as BlockContainer.vue/
// BlockSlider.vue - see those files' own comments for the full reasoning. ---
const isSelected = computed(() => editor.current?.id === props.doc.id)
const groupClass = computed(() => `group/${props.doc.id}`)
const tagOpacityClass = computed(() => (isSelected.value ? 'opacity-100' : `opacity-0 group-hover/${props.doc.id}:opacity-100`))
const tagBgClass = computed(() => {
  const doc = props.doc as any
  const hasCustomCss = !!(doc.css?.css?.trim() || doc.style?.trim())
  return hasCustomCss ? 'bg-violet-500' : 'bg-red-500'
})
const semantic = computed(() => (props.doc as any).semantic || 'div')
const isometricAttrs = computed(() => customAttrs((props.doc as any).data?.attributes))

const classe = computed(() => {
  const doc = props.doc as any
  let cls = `${doc.css.css ?? ''} ${doc.css.container ?? ''} relative cursor-pointer p-2`
  cls += isSelected.value ? ' border-2 border-red-400' : ' border border-dashed border-transparent hover:border-red-300'
  return cls
})

const stile = computed(() => {
  const doc = props.doc as any
  let st = ''
  const bgUrl = resolveDisplayUrl(doc.image?.url)
  if (bgUrl) st += `background-image:url(${bgUrl});`
  if (doc.font) st += `font-family:"${doc.font.replaceAll('+', ' ')}";`
  return st + (doc.style ?? '')
})

function onSelect() {
  editor.setCurrent(isSelected.value ? null : props.doc)
}
</script>
