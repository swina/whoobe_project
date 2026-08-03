<template>
  <iframe
    v-if="element.content"
    :src="element.src + element.content"
    :class="classe"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
    allowfullscreen
    frameborder="0"
  ></iframe>
</template>

<script setup lang="ts">
// Read-only counterpart of ../BlockIFrame.vue, for DocumentPreview.vue - no
// click-to-select, no placeholder "no video ID set" box (a preview only
// ever shows real, already-configured embeds), and no enablejsapi/origin/
// api query params either - those only matter for the editor's own "Play"
// button (../BlockIFrame.vue + ../../scripts/youtube-player.ts), not a
// plain read-only embed. `picture-in-picture` dropped from `allow` for the
// same reason as the editing version - unused, and logs a harmless-but-
// real Permissions Policy violation otherwise.
import { computed } from 'vue'
import type Element from '../../scripts/ElementsClass.js'

type WhoobeElement = InstanceType<typeof Element>

const props = defineProps<{
  element: WhoobeElement
}>()

const classe = computed(() => {
  const el = props.element as any
  return `${el.css.css} ${el.css.container}`
})
</script>
