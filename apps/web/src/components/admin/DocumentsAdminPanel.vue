<script setup lang="ts">
import { formatUserRef, type DocumentView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { reactive, ref } from 'vue';

import { ApiError } from '../../api/client';
import {
  fetchAdminDocuments,
  quarantineDocument,
  unquarantineDocument,
  uploadDocument,
} from '../../api/documents';
import PdfViewer from '../PdfViewer.vue';

const queryClient = useQueryClient();
const DOCUMENTS_QUERY_KEY = ['admin', 'documents'] as const;

const { data: documents, isPending } = useQuery({
  queryKey: DOCUMENTS_QUERY_KEY,
  queryFn: fetchAdminDocuments,
});

const errorMessage = ref<string | null>(null);

function onMutationError(error: unknown) {
  errorMessage.value = error instanceof ApiError ? error.message : 'Request failed.';
}

function invalidate() {
  void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
}

// --- Upload ------------------------------------------------------------------

const uploadInput = ref<HTMLInputElement | null>(null);

const upload = useMutation({
  mutationFn: (file: File) => uploadDocument(file),
  onSuccess: invalidate,
  onError: onMutationError,
});

function onUploadPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) upload.mutate(file);
  input.value = '';
}

// --- Preview -----------------------------------------------------------------

const previewDialog = reactive({ open: false, document: null as DocumentView | null });

function openPreview(document: DocumentView) {
  previewDialog.open = true;
  previewDialog.document = document;
}

// --- Quarantine toggle ---------------------------------------------------------

const quarantineDialog = reactive({
  open: false,
  document: null as DocumentView | null,
  reason: '',
});

function openQuarantineDialog(document: DocumentView) {
  quarantineDialog.open = true;
  quarantineDialog.document = document;
  quarantineDialog.reason = '';
}

const toggleQuarantine = useMutation({
  mutationFn: () => {
    const target = quarantineDialog.document;
    if (!target) return Promise.reject(new Error('No document selected.'));
    const reason = quarantineDialog.reason.trim();
    return target.quarantinedAt
      ? unquarantineDocument(target.id, reason)
      : quarantineDocument(target.id, reason);
  },
  onSuccess: () => {
    quarantineDialog.open = false;
    invalidate();
  },
  onError: onMutationError,
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <div class="d-flex align-center mb-3">
    <span class="text-subtitle-2">Recent uploads</span>
    <v-spacer />
    <v-btn
      size="small"
      variant="tonal"
      prepend-icon="mdi-file-upload"
      :loading="upload.isPending.value"
      @click="uploadInput?.click()"
    >
      Upload PDF
    </v-btn>
    <input
      ref="uploadInput"
      type="file"
      accept="application/pdf"
      class="d-none"
      @change="onUploadPicked"
    />
  </div>

  <v-progress-linear v-if="isPending" indeterminate />

  <template v-else>
    <v-table density="compact">
      <thead>
        <tr>
          <th>Filename</th>
          <th>Uploader</th>
          <th>Size</th>
          <th>Uploaded</th>
          <th>Status</th>
          <th class="text-right" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="document in documents" :key="document.id">
          <td>{{ document.displayFilename }}</td>
          <td>{{ formatUserRef(document.uploader) }}</td>
          <td>{{ formatBytes(document.byteSize) }}</td>
          <td class="text-no-wrap">{{ formatTimestamp(document.createdAt) }}</td>
          <td>
            <v-chip v-if="document.quarantinedAt" color="error" size="x-small">
              quarantined
            </v-chip>
            <v-chip v-else color="success" size="x-small">served</v-chip>
          </td>
          <td class="text-right text-no-wrap">
            <v-btn size="x-small" variant="text" icon="mdi-eye" @click="openPreview(document)" />
            <v-btn
              size="x-small"
              variant="text"
              :icon="document.quarantinedAt ? 'mdi-lock-open-variant' : 'mdi-lock-alert'"
              :color="document.quarantinedAt ? undefined : 'error'"
              @click="openQuarantineDialog(document)"
            />
          </td>
        </tr>
        <tr v-if="documents && documents.length === 0">
          <td colspan="6" class="text-center text-medium-emphasis py-4">No documents yet.</td>
        </tr>
      </tbody>
    </v-table>
  </template>

  <!-- Preview -->
  <v-dialog v-model="previewDialog.open" max-width="900">
    <v-card v-if="previewDialog.document" :title="previewDialog.document.displayFilename">
      <v-card-text>
        <v-alert
          v-if="previewDialog.document.quarantinedAt"
          type="warning"
          variant="tonal"
          class="mb-3"
        >
          This document is quarantined; the file origin answers 410 for it.
        </v-alert>
        <PdfViewer
          :src="previewDialog.document.fileUrl"
          :title="previewDialog.document.displayFilename"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="previewDialog.open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Quarantine / un-quarantine -->
  <v-dialog v-model="quarantineDialog.open" max-width="480">
    <v-card
      v-if="quarantineDialog.document"
      :title="
        quarantineDialog.document.quarantinedAt ? 'Un-quarantine document' : 'Quarantine document'
      "
    >
      <v-card-text>
        <p class="mb-3">
          <template v-if="quarantineDialog.document.quarantinedAt">
            Resume serving <strong>{{ quarantineDialog.document.displayFilename }}</strong> from the
            file origin?
          </template>
          <template v-else>
            Stop serving <strong>{{ quarantineDialog.document.displayFilename }}</strong>
            platform-wide? Its URL answers 410 from the next request on.
          </template>
        </p>
        <v-textarea
          v-model="quarantineDialog.reason"
          label="Reason (required)"
          rows="2"
          density="comfortable"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="quarantineDialog.open = false">Cancel</v-btn>
        <v-btn
          :color="quarantineDialog.document.quarantinedAt ? 'primary' : 'error'"
          :disabled="quarantineDialog.reason.trim().length === 0"
          :loading="toggleQuarantine.isPending.value"
          @click="toggleQuarantine.mutate()"
        >
          {{ quarantineDialog.document.quarantinedAt ? 'Un-quarantine' : 'Quarantine' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar
    :model-value="errorMessage !== null"
    color="error"
    @update:model-value="errorMessage = null"
  >
    {{ errorMessage }}
  </v-snackbar>
</template>
