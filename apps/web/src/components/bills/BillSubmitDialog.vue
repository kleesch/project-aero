<script setup lang="ts">
import { CHAMBERS, type BillDetailView, type Chamber } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { submitBill } from '../../api/bills';
import { ApiError } from '../../api/client';
import { uploadDocument } from '../../api/documents';
import { fetchTags } from '../../api/tags';
import { CHAMBER_LABELS } from '../../lib/bills';

/**
 * Claim-gated bill submission: uploads the PDF through the documents
 * pipeline, then submits the bill referencing the document id. The origin
 * chamber is derived from the submitter's roster membership server-side; the
 * picker only matters for members sitting in both chambers.
 */
const open = defineModel<boolean>({ required: true });

const emit = defineEmits<{ submitted: [bill: BillDetailView] }>();

const queryClient = useQueryClient();

const { data: tags } = useQuery({ queryKey: ['tags'], queryFn: fetchTags });

const form = reactive({
  title: '',
  file: null as File | null,
  chamber: null as Chamber | null,
  tagIds: [] as number[],
});
const errorMessage = ref<string | null>(null);

const chamberOptions = computed(() =>
  Object.values(CHAMBERS).map((chamber) => ({ value: chamber, title: CHAMBER_LABELS[chamber] })),
);
const tagOptions = computed(
  () => tags.value?.map((tag) => ({ value: tag.id, title: tag.name })) ?? [],
);
const canSubmit = computed(() => form.title.trim().length > 0 && form.file !== null);

const submit = useMutation({
  mutationFn: async () => {
    const document = await uploadDocument(form.file!);
    return submitBill({
      title: form.title.trim(),
      documentId: document.id,
      ...(form.chamber ? { chamber: form.chamber } : {}),
      tagIds: form.tagIds,
    });
  },
  onSuccess: (bill) => {
    void queryClient.invalidateQueries({ queryKey: ['bills'] });
    open.value = false;
    form.title = '';
    form.file = null;
    form.chamber = null;
    form.tagIds = [];
    emit('submitted', bill);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Submission failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="560">
    <v-card title="Submit a bill">
      <v-card-text>
        <v-text-field
          v-model="form.title"
          label="Title"
          density="comfortable"
          :counter="300"
          maxlength="300"
        />
        <v-file-input
          v-model="form.file"
          label="Bill PDF"
          accept="application/pdf"
          density="comfortable"
          prepend-icon="mdi-file-pdf-box"
        />
        <v-select
          v-model="form.chamber"
          :items="chamberOptions"
          label="Origin chamber"
          density="comfortable"
          clearable
          hint="Derived from your roster membership — only needed if you sit in both chambers."
          persistent-hint
        />
        <v-select
          v-model="form.tagIds"
          :items="tagOptions"
          label="Tags"
          density="comfortable"
          multiple
          chips
          closable-chips
          class="mt-2"
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
          Submit
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
