<template>
  <form class="relative w-full max-w-md" @submit.prevent="onSubmit">
    <input
      v-model="q"
      type="search"
      placeholder="Search pages, products, classes…"
      aria-label="Search"
      class="w-full"
    />
    <button
      type="submit"
      class="absolute right-1"
      aria-label="Submit search"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path
          fill-rule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const q = ref('')

function onSubmit() {
  const query = q.value.trim()
  if (query.length < 2) return
  router.push({ name: 'Search', query: { q: query } })
}
</script>