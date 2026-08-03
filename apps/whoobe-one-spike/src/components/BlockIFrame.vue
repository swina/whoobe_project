<template>
  <div
    v-if="element.content"
    :id="element.id"
    :class="[classe, 'relative']"
    :data-id="element.id"
    data-type="element"
    @click="onClick"
  >
    <iframe
      :src="iframeSrc"
      class="w-full h-full pointer-events-none"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
      allowfullscreen
      frameborder="0"
    ></iframe>
  </div>
  <div
    v-else
    :id="element.id"
    :class="classe"
    data-type="element"
    class="flex items-center justify-center text-xs text-gray-400 bg-gray-100 border border-dashed"
    @click="onClick"
  >
    No {{ element.tag }} video ID set - click "Edit content" to add one
  </div>
</template>

<script setup lang="ts">
// Port of whoobe-one-studio's src/components/blocks/components/BlockIFrame.
// vue - renders the actual embed for youtube/vimeo elements (BlockContainer.
// vue dispatches here instead of the generic BlockElement.vue whenever a
// child's `tag` is "youtube"/"vimeo", matching the source's own dispatch).
// The full embed URL is `element.src + element.content` - ElementsClass.js's
// YTVideo()/VimeoVideo() builders already set `src` to the fixed embed-
// prefix ("https://youtube.com/embed/" etc.); `content` holds just the
// video ID, entered via FloatingToolbar.vue's "Edit content" action for
// these two tags specifically (see that file's own onEditContent()).
//
// Deviation from the source: it always rendered the iframe (blank src when
// no ID set yet) - here, no ID shows a clear placeholder box explaining
// what to do instead of a blank/broken-looking iframe.
//
// A second, real bug the source doesn't have to deal with in an editor
// context at all (its own version only ever renders in an already-static
// preview, never a clickable editing canvas): the source bound `@click`
// directly on the `<iframe>` itself. An iframe is its own separate
// browsing context - a click that lands on its visibly-rendered content
// (e.g. YouTube's own thumbnail/play button) is handled entirely by that
// embedded page and never bubbles up to this component's listener at all.
// In practice that meant "select this element" was unreachable by clicking
// it - the click always went straight to YouTube's/Vimeo's own player
// instead and started playback. Fixed by moving `data-id`/`data-type`/the
// click handler onto a wrapping div and giving the iframe itself
// `pointer-events-none` - every click now lands on our own div (fully
// selectable, never triggers playback), and `iframeSrc` appends each
// provider's own API-enabling query params so FloatingToolbar.vue's new
// "Play" button can start playback deliberately instead: YouTube's real
// IFrame Player API (`enablejsapi=1` + `origin`, see ../scripts/youtube-
// player.ts) and Vimeo's raw player postMessage protocol (`api=1`).
//
// `picture-in-picture` was dropped from `allow` below (present in the
// source's own copy of this attribute, likely copied from a generic embed
// boilerplate) - this app never uses PiP, and granting the permission to
// the iframe while the top-level page's own Permissions-Policy doesn't
// explicitly allow it logs a real, if harmless, "Permissions policy
// violation" console warning on every embed.
import { computed } from 'vue'
import type Element from '../scripts/ElementsClass.js'
import { useEditorStore } from '../store/editor'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
  level: number
}>()

const editor = useEditorStore()
const isSelected = computed(() => editor.current?.id === props.element.id)

const classe = computed(() => {
  const el = props.element as any
  let cls = `${el.css.css} ${el.css.container}`
  if (isSelected.value) cls += ' shadow-lg ring-2 ring-indigo-500'
  return cls
})

const iframeSrc = computed(() => {
  const el = props.element as any
  if (el.tag === 'vimeo') return `${el.src}${el.content}?api=1`
  // `origin` isn't optional in practice for the YouTube IFrame Player API
  // (youtube-player.ts) to reliably take control of an already-rendered
  // iframe - YouTube's own docs call it out as required for the postMessage
  // command channel its player.playVideo() is built on to be accepted.
  return `${el.src}${el.content}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
})

function onClick(e: MouseEvent) {
  e.stopPropagation()
  editor.setCurrent(isSelected.value ? null : props.element)
}
</script>
