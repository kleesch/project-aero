<script setup lang="ts">
import type { ExecutiveOrderDetailView } from '@aero/shared';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { reactive, ref, watch } from 'vue';

import { ApiError } from '../../api/client';
import { updateExecutiveOrder } from '../../api/executiveOrders';

/** Edit an order's title, summary, and dates (`eo:manage`). */
const open = defineModel<boolean>({ required: true });

const props = defineProps<{ order: ExecutiveOrderDetailView }>();

const emit = defineEmits<{ updated: [order: ExecutiveOrderDetailView] }>();

const queryClient = useQueryClient();

const form = reactive({ title: '', summary: '', effectiveDate: '', expiresAt: '' });
const errorMessage = ref<string | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  form.title = props.order.title;
  form.summary = props.order.summary ?? '';
  form.effectiveDate = props.order.effectiveDate;
  form.expiresAt = props.order.expiresAt ? props.order.expiresAt.slice(0, 10) : '';
  errorMessage.value = null;
});

const submit = useMutation({
  mutationFn: () =>
    updateExecutiveOrder(props.order.eoNumber, {
      title: form.title.trim(),
      summary: form.summary.trim() || null,
      effectiveDate: form.effectiveDate,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    }),
  onSuccess: (order) => {
    void queryClient.invalidateQueries({ queryKey: ['executive-orders'] });
    open.value = false;
    emit('updated', order);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'The update failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="560">
    <v-card title="Edit executive order">
      <v-card-text>
        <v-text-field
          v-model="form.title"
          label="Title"
          density="comfortable"
          :counter="300"
          maxlength="300"
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
              label="Expires (empty = never)"
              type="date"
              density="comfortable"
              clearable
            />
          </v-col>
        </v-row>
        <v-textarea
          v-model="form.summary"
          label="Summary"
          rows="4"
          density="comfortable"
          :counter="5000"
          maxlength="5000"
        />
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-2">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="form.title.trim().length < 2 || form.effectiveDate === ''"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
