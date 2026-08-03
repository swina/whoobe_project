<template>
  <div class="h-full flex flex-col items-center justify-center gap-4 bg-gray-100 text-black">
    <h1 class="text-2xl font-bold text-gray-800">Whoobe One Studio - Phase 0/1 spike</h1>
    <p class="text-gray-500 max-w-md text-center text-sm">
      Minimal dashboard stub - the source repo's real Dashboard.vue (New Template / Templates / UI Kit / Settings) is
      Phase 3 scope (blocks/gallery, blocks/desktop). This route only exists to prove Vue Router 4 actually works
      end-to-end (see port plan §5 Phase 1) - a single static route wouldn't demonstrate real navigation.
    </p>
    <router-link
      to="/editor"
      class="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
    >
      Open Editor
    </router-link>
  </div>
</template>
