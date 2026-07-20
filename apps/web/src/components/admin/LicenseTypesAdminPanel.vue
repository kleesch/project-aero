<script setup lang="ts">
import type { LicenseTypeView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { reactive, ref } from 'vue';

import {
  createLicenseType,
  deleteLicenseType,
  fetchLicenseTypes,
  updateLicenseType,
} from '../../api/businesses';
import { ApiError } from '../../api/client';

/** Business license-type vocabulary management (tags:manage). */
const queryClient = useQueryClient();

const { data: licenseTypes, isPending } = useQuery({
  queryKey: ['business-license-types'],
  queryFn: fetchLicenseTypes,
});

const errorMessage = ref<string | null>(null);

function onMutationError(error: unknown) {
  errorMessage.value = error instanceof ApiError ? error.message : 'Request failed.';
}

function invalidate() {
  void queryClient.invalidateQueries({ queryKey: ['business-license-types'] });
}

const dialog = reactive({
  open: false,
  editing: null as LicenseTypeView | null,
  name: '',
  description: '',
});

function openDialog(licenseType?: LicenseTypeView) {
  dialog.editing = licenseType ?? null;
  dialog.name = licenseType?.name ?? '';
  dialog.description = licenseType?.description ?? '';
  dialog.open = true;
}

const save = useMutation({
  mutationFn: () => {
    const payload = {
      name: dialog.name.trim(),
      ...(dialog.description.trim() ? { description: dialog.description.trim() } : {}),
    };
    return dialog.editing
      ? updateLicenseType(dialog.editing.id, payload)
      : createLicenseType(payload);
  },
  onSuccess: () => {
    dialog.open = false;
    invalidate();
  },
  onError: onMutationError,
});

const remove = useMutation({
  mutationFn: (id: number) => deleteLicenseType(id),
  onSuccess: invalidate,
  onError: onMutationError,
});
</script>

<template>
  <div class="d-flex align-center mb-3">
    <span class="text-subtitle-2">Business license types</span>
    <v-spacer />
    <v-btn size="small" variant="tonal" prepend-icon="mdi-license" @click="openDialog()">
      New license type
    </v-btn>
  </div>

  <v-progress-linear v-if="isPending" indeterminate />

  <v-table v-else density="compact">
    <thead>
      <tr>
        <th>Name</th>
        <th>Description</th>
        <th class="text-right" />
      </tr>
    </thead>
    <tbody>
      <tr v-for="licenseType in licenseTypes" :key="licenseType.id">
        <td>
          <v-chip size="small" variant="outlined">{{ licenseType.name }}</v-chip>
        </td>
        <td class="text-medium-emphasis">{{ licenseType.description ?? '—' }}</td>
        <td class="text-right text-no-wrap">
          <v-btn size="x-small" variant="text" icon="mdi-pencil" @click="openDialog(licenseType)" />
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-delete"
            color="error"
            :loading="remove.isPending.value"
            @click="remove.mutate(licenseType.id)"
          />
        </td>
      </tr>
      <tr v-if="licenseTypes && licenseTypes.length === 0">
        <td colspan="3" class="text-center text-medium-emphasis py-4">No license types yet.</td>
      </tr>
    </tbody>
  </v-table>

  <v-dialog v-model="dialog.open" max-width="420">
    <v-card :title="dialog.editing ? 'Edit license type' : 'New license type'">
      <v-card-text>
        <v-text-field
          v-model="dialog.name"
          label="Name"
          density="comfortable"
          :counter="50"
          maxlength="50"
        />
        <v-textarea
          v-model="dialog.description"
          label="Description (optional)"
          rows="2"
          density="comfortable"
          :counter="300"
          maxlength="300"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="dialog.open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="dialog.name.trim().length === 0"
          :loading="save.isPending.value"
          @click="save.mutate()"
        >
          Save
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
