<template>
  <component :is="wrapperTag" :class="classes" :style="inlineStyle" v-bind="extraAttrs">
    <template v-if="isContainer">
      <SnippetNodeRenderer v-for="child in node.blocks" :key="child.id" :node="child" />
    </template>
    <template v-else>
      <img v-if="showImage" :src="node.image?.url" :alt="node.image?.alt || ''" style="max-width:100%;height:auto;display:block" />
      <span v-if="node.content" v-html="safeHtml(node.content)"></span>
    </template>
  </component>
</template>

<script setup lang="ts">
import { sanitizeRichText as safeHtml } from '@whoobe-cms/schema'
import { computed } from 'vue'

const props = defineProps<{ node: Record<string, any> }>()

const isContainer = computed(() => props.node.type === 'container' || props.node.tag === 'slider')

const classes = computed(() => {
  const css = props.node.css
  return `${css?.css ?? ''} ${css?.container ?? ''}`.trim() || undefined
})

const inlineStyle = computed(() => {
  let s = props.node.style || ''
  if (props.node.image?.url && typeof props.node.image.url === 'string' && props.node.element !== 'img') {
    s += `;background-image:url(${props.node.image.url})`
  }
  if (props.node.font) {
    s += `;font-family:"${props.node.font.replaceAll('+', ' ')}"`
  }
  return s || undefined
})

const showImage = computed(() => props.node.element === 'img' && props.node.image?.url)

const wrapperTag = computed(() => {
  if (props.node.link) return 'a'
  if (props.node.level) {
    const level = Number(props.node.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  if (props.node.semantic) return props.node.semantic
  if (props.node.element === 'grid') return 'div'
  return props.node.element || 'div'
})

const extraAttrs = computed(() => {
  const attrs: Record<string, any> = {}
  if (props.node.link) {
    attrs.href = props.node.link
    if (props.node.linkTarget) attrs.target = props.node.linkTarget
  }
  return attrs
})
</script>