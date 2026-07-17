<script setup lang="ts">
/**
 * The one way to render a stored PDF (see DESIGN.md — PDF Storage & Safety).
 *
 * Native browser PDF viewers refuse to run inside a sandboxed context, and
 * the file origin sends `Content-Security-Policy: sandbox` on every response
 * — so an iframe/embed can never preview these documents. Instead pdf.js
 * fetches the raw bytes (CORS, no credentials) and rasterizes each page to a
 * canvas: nothing embedded in the PDF ever executes (pdf.js ≥6 has no
 * eval-based code paths at all), and the sandbox headers stay intact for
 * direct navigation, which downloads the file.
 */
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { onBeforeUnmount, reactive, ref, watch } from 'vue';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const props = defineProps<{
  /** File-origin URL (DocumentView.fileUrl). */
  src: string;
  title?: string;
}>();

const container = ref<HTMLElement | null>(null);
const state = reactive({ loading: true, error: false, pageCount: 0 });
const pageCanvases = new Map<number, HTMLCanvasElement>();

let loadingTask: PDFDocumentLoadingTask | null = null;
// Guards against a stale load finishing after `src` changed mid-flight.
let loadGeneration = 0;

function setPageCanvas(pageNo: number, el: unknown): void {
  if (el instanceof HTMLCanvasElement) {
    pageCanvases.set(pageNo, el);
  } else {
    pageCanvases.delete(pageNo);
  }
}

async function renderPage(pdf: PDFDocumentProxy, pageNo: number): Promise<void> {
  const canvas = pageCanvases.get(pageNo);
  if (!canvas) return;

  const page = await pdf.getPage(pageNo);
  const containerWidth = container.value?.clientWidth ?? 800;
  const fitScale = containerWidth / page.getViewport({ scale: 1 }).width;
  // Backing store at device resolution, CSS-scaled down, so text stays crisp.
  const viewport = page.getViewport({ scale: fitScale * (window.devicePixelRatio || 1) });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
}

async function load(src: string): Promise<void> {
  const generation = ++loadGeneration;
  state.loading = true;
  state.error = false;
  state.pageCount = 0;

  await loadingTask?.destroy().catch(() => {});
  if (generation !== loadGeneration) return;

  try {
    loadingTask = getDocument({ url: src });
    const pdf = await loadingTask.promise;
    if (generation !== loadGeneration) return;

    state.pageCount = pdf.numPages;
    state.loading = false;
    // Canvases mount when pageCount renders; let that happen before drawing.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      if (generation !== loadGeneration) return;
      await renderPage(pdf, pageNo);
    }
  } catch {
    if (generation !== loadGeneration) return;
    state.loading = false;
    state.error = true;
  }
}

watch(() => props.src, load, { immediate: true });

onBeforeUnmount(() => {
  loadGeneration += 1;
  void loadingTask?.destroy().catch(() => {});
});
</script>

<template>
  <div>
    <div
      ref="container"
      class="pdf-frame"
      role="document"
      :aria-label="title ?? 'PDF document'"
    >
      <div v-if="state.loading" class="d-flex justify-center align-center h-100">
        <v-progress-circular indeterminate />
      </div>
      <v-alert v-else-if="state.error" type="error" variant="tonal" class="ma-3">
        This document couldn't be displayed. You can still
        <a :href="src" target="_blank" rel="noopener noreferrer">download it directly</a>.
      </v-alert>
      <template v-else>
        <canvas
          v-for="pageNo in state.pageCount"
          :key="pageNo"
          :ref="(el) => setPageCanvas(pageNo, el)"
          class="pdf-page"
        />
      </template>
    </div>
    <p class="text-caption text-medium-emphasis mt-1 mb-0">
      Document not rendering?
      <a :href="src" target="_blank" rel="noopener noreferrer">Download it directly</a>.
    </p>
  </div>
</template>

<style scoped>
.pdf-frame {
  width: 100%;
  height: 70vh;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.pdf-page {
  display: block;
  width: 100%;
  height: auto;
}

.pdf-page + .pdf-page {
  margin-top: 8px;
}
</style>
