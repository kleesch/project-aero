<script setup lang="ts">
/**
 * The one way to render a stored PDF (see DESIGN.md — PDF Storage & Safety):
 * a fully sandboxed iframe pointed at the separate file origin. The `sandbox`
 * attribute grants nothing — no scripts, no same-origin — layered on top of
 * the `Content-Security-Policy: sandbox` the file origin already sends.
 */
defineProps<{
  /** File-origin URL (DocumentView.fileUrl). */
  src: string;
  title?: string;
}>();
</script>

<template>
  <div>
    <iframe :src="src" sandbox="" :title="title ?? 'PDF document'" class="pdf-frame" />
    <p class="text-caption text-medium-emphasis mt-1 mb-0">
      Document not rendering?
      <a :href="src" target="_blank" rel="noopener noreferrer">Open or download it directly</a>.
    </p>
  </div>
</template>

<style scoped>
.pdf-frame {
  width: 100%;
  height: 70vh;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
