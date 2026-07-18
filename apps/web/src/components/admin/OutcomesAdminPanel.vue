<script setup lang="ts">
import type { OutcomeView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { reactive, ref } from 'vue';

import { ApiError } from '../../api/client';
import { createOutcome, deleteOutcome, fetchOutcomes, updateOutcome } from '../../api/rulings';

/**
 * Ruling outcome vocabulary management (tags:manage). Outcomes referenced by
 * court records cannot be deleted — the API refuses, since rulings are
 * historical records.
 */
const queryClient = useQueryClient();

const { data: outcomes, isPending } = useQuery({
  queryKey: ['ruling-outcomes'],
  queryFn: fetchOutcomes,
});

const errorMessage = ref<string | null>(null);

function onMutationError(error: unknown) {
  errorMessage.value = error instanceof ApiError ? error.message : 'Request failed.';
}

function invalidate() {
  void queryClient.invalidateQueries({ queryKey: ['ruling-outcomes'] });
}

const dialog = reactive({
  open: false,
  editing: null as OutcomeView | null,
  name: '',
  description: '',
});

function openDialog(outcome?: OutcomeView) {
  dialog.editing = outcome ?? null;
  dialog.name = outcome?.name ?? '';
  dialog.description = outcome?.description ?? '';
  dialog.open = true;
}

const save = useMutation({
  mutationFn: () => {
    const payload = {
      name: dialog.name.trim(),
      ...(dialog.description.trim() ? { description: dialog.description.trim() } : {}),
    };
    return dialog.editing ? updateOutcome(dialog.editing.id, payload) : createOutcome(payload);
  },
  onSuccess: () => {
    dialog.open = false;
    invalidate();
  },
  onError: onMutationError,
});

const remove = useMutation({
  mutationFn: (id: number) => deleteOutcome(id),
  onSuccess: invalidate,
  onError: onMutationError,
});
</script>

<template>
  <div class="d-flex align-center mb-3">
    <span class="text-subtitle-2">Ruling outcome vocabulary</span>
    <v-spacer />
    <v-btn size="small" variant="tonal" prepend-icon="mdi-gavel" @click="openDialog()">
      New outcome
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
      <tr v-for="outcome in outcomes" :key="outcome.id">
        <td>
          <v-chip size="small" variant="outlined">{{ outcome.name }}</v-chip>
        </td>
        <td class="text-medium-emphasis">{{ outcome.description ?? '—' }}</td>
        <td class="text-right text-no-wrap">
          <v-btn size="x-small" variant="text" icon="mdi-pencil" @click="openDialog(outcome)" />
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-delete"
            color="error"
            :loading="remove.isPending.value"
            @click="remove.mutate(outcome.id)"
          />
        </td>
      </tr>
      <tr v-if="outcomes && outcomes.length === 0">
        <td colspan="3" class="text-center text-medium-emphasis py-4">
          No outcomes yet — judges cannot enter rulings until the vocabulary exists.
        </td>
      </tr>
    </tbody>
  </v-table>

  <v-dialog v-model="dialog.open" max-width="420">
    <v-card :title="dialog.editing ? 'Edit outcome' : 'New outcome'">
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
