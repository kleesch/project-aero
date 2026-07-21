<script setup lang="ts">
import { formatEoNumber, type ExecutiveOrderDetailView, type OwnerLookupUser } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';

import { ApiError } from '../../api/client';
import { uploadDocument } from '../../api/documents';
import {
  fetchExecutiveOrders,
  fetchNextEoNumber,
  issueExecutiveOrder,
} from '../../api/executiveOrders';
import OwnerLookupField from '../businesses/OwnerLookupField.vue';

/**
 * Claim-gated EO issue form (`eo:manage`): uploads the PDF through the
 * documents pipeline, then files the order. The number is prefilled with the
 * server's `max + 1` suggestion but stays editable; a collision comes back as
 * a 409 shown inline so the editor can pick another number without re-uploading.
 */
const open = defineModel<boolean>({ required: true });

const emit = defineEmits<{ issued: [order: ExecutiveOrderDetailView] }>();

const queryClient = useQueryClient();

const form = reactive({
  eoNumber: null as number | null,
  title: '',
  president: null as OwnerLookupUser | null,
  file: null as File | null,
  effectiveDate: '',
  expiresAt: '',
  summary: '',
  linkMode: 'none' as 'none' | 'repeals' | 'supersedes',
  targetId: null as number | null,
});
const errorMessage = ref<string | null>(null);

// Suggest the next number and refresh it whenever the dialog opens.
const { data: nextNumber, refetch: refetchNext } = useQuery({
  queryKey: ['eo-next-number'],
  queryFn: fetchNextEoNumber,
  enabled: false,
});

// Active orders are the only valid repeal/supersede targets.
const { data: activeOrders } = useQuery({
  queryKey: ['executive-orders', { status: 'active', pageSize: 100 }],
  queryFn: () => fetchExecutiveOrders({ status: 'active', pageSize: 100 }),
  enabled: computed(() => open.value),
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  form.eoNumber = null;
  form.title = '';
  form.president = null;
  form.file = null;
  form.effectiveDate = '';
  form.expiresAt = '';
  form.summary = '';
  form.linkMode = 'none';
  form.targetId = null;
  errorMessage.value = null;
  void refetchNext().then((result) => {
    if (form.eoNumber === null) form.eoNumber = result.data?.nextNumber ?? null;
  });
});

const targetOptions = computed(
  () =>
    activeOrders.value?.items.map((order) => ({
      value: order.id,
      title: `${formatEoNumber(order.eoNumber)} — ${order.title}`,
    })) ?? [],
);

const canSubmit = computed(
  () =>
    form.eoNumber !== null &&
    form.eoNumber > 0 &&
    form.title.trim().length >= 2 &&
    form.president !== null &&
    form.file !== null &&
    form.effectiveDate !== '' &&
    (form.linkMode === 'none' || form.targetId !== null),
);

const submit = useMutation({
  mutationFn: async () => {
    const document = await uploadDocument(form.file!);
    return issueExecutiveOrder({
      eoNumber: form.eoNumber!,
      title: form.title.trim(),
      issuedByRobloxUserId: form.president!.robloxUserId,
      effectiveDate: form.effectiveDate,
      documentId: document.id,
      ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      ...(form.summary.trim() ? { summary: form.summary.trim() } : {}),
      ...(form.linkMode === 'repeals' && form.targetId ? { repealsEoId: form.targetId } : {}),
      ...(form.linkMode === 'supersedes' && form.targetId
        ? { supersedesEoId: form.targetId }
        : {}),
    });
  },
  onSuccess: (order) => {
    void queryClient.invalidateQueries({ queryKey: ['executive-orders'] });
    open.value = false;
    emit('issued', order);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Issuing the order failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="620">
    <v-card title="Issue an executive order">
      <v-card-text>
        <v-row dense>
          <v-col cols="4">
            <v-text-field
              v-model.number="form.eoNumber"
              label="EO #"
              type="number"
              min="1"
              density="comfortable"
              :hint="nextNumber ? `Suggested: ${nextNumber.nextNumber}` : ''"
              persistent-hint
            />
          </v-col>
          <v-col cols="8">
            <v-text-field
              v-model="form.title"
              label="Title"
              density="comfortable"
              :counter="300"
              maxlength="300"
            />
          </v-col>
        </v-row>

        <OwnerLookupField v-model="form.president" label="Issuing president" class="mb-2" />

        <v-file-input
          v-model="form.file"
          label="Order PDF"
          accept="application/pdf"
          density="comfortable"
          prepend-icon="mdi-file-pdf-box"
        />

        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="form.effectiveDate"
              label="Effective date"
              type="date"
              density="comfortable"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.expiresAt"
              label="Expires (optional)"
              type="date"
              density="comfortable"
              clearable
            />
          </v-col>
        </v-row>

        <v-textarea
          v-model="form.summary"
          label="Summary (optional)"
          rows="3"
          density="comfortable"
          :counter="5000"
          maxlength="5000"
        />

        <v-select
          v-model="form.linkMode"
          :items="[
            { value: 'none', title: 'Standalone order' },
            { value: 'repeals', title: 'Repeals an earlier order' },
            { value: 'supersedes', title: 'Supersedes an earlier order' },
          ]"
          label="Relationship"
          density="comfortable"
        />
        <v-select
          v-if="form.linkMode !== 'none'"
          v-model="form.targetId"
          :items="targetOptions"
          :label="form.linkMode === 'repeals' ? 'Order to repeal' : 'Order to supersede'"
          density="comfortable"
          :hint="targetOptions.length === 0 ? 'No active orders to target.' : ''"
          persistent-hint
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
          Issue
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
