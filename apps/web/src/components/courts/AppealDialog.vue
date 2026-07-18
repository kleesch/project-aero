<script setup lang="ts">
import type { RulingDetailView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { ApiError } from '../../api/client';
import { uploadDocument } from '../../api/documents';
import { fetchOutcomes, submitAppeal } from '../../api/rulings';

/**
 * Claim-gated Supreme Court appeal entry (court:appeal-verdict): verdict PDF
 * plus outcomes. A ruling accepts exactly one appeal.
 */
const open = defineModel<boolean>({ required: true });

const props = defineProps<{ rulingId: number }>();

const emit = defineEmits<{ submitted: [ruling: RulingDetailView] }>();

const queryClient = useQueryClient();

const { data: outcomes } = useQuery({ queryKey: ['ruling-outcomes'], queryFn: fetchOutcomes });

const form = reactive({
  file: null as File | null,
  outcomeIds: [] as number[],
});
const errorMessage = ref<string | null>(null);

const outcomeOptions = computed(
  () => outcomes.value?.map((outcome) => ({ value: outcome.id, title: outcome.name })) ?? [],
);
const canSubmit = computed(() => form.file !== null && form.outcomeIds.length > 0);

const submit = useMutation({
  mutationFn: async () => {
    const document = await uploadDocument(form.file!);
    return submitAppeal(props.rulingId, {
      documentId: document.id,
      outcomeIds: form.outcomeIds,
    });
  },
  onSuccess: (ruling) => {
    void queryClient.invalidateQueries({ queryKey: ['rulings'] });
    void queryClient.invalidateQueries({ queryKey: ['ruling'] });
    open.value = false;
    form.file = null;
    form.outcomeIds = [];
    emit('submitted', ruling);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Appeal entry failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="560">
    <v-card title="Enter Supreme Court appeal verdict">
      <v-card-text>
        <v-file-input
          v-model="form.file"
          label="Verdict PDF"
          accept="application/pdf"
          density="comfortable"
          prepend-icon="mdi-file-pdf-box"
        />
        <v-select
          v-model="form.outcomeIds"
          :items="outcomeOptions"
          label="Outcomes"
          density="comfortable"
          multiple
          chips
          closable-chips
        />
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-3">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="!canSubmit"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Enter verdict
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
