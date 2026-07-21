<script setup lang="ts">
import { ALL_EO_STATUSES, type ExecutiveOrderDetailView } from '@aero/shared';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ref, watch } from 'vue';

import { ApiError } from '../../api/client';
import { changeExecutiveOrderStatus } from '../../api/executiveOrders';
import { EO_STATUS_META } from '../../lib/executiveOrders';

/**
 * Manual status correction (`eo:manage`), reason required. For fixing
 * mistakes — repeal/supersede normally happen by issuing a linking order.
 */
const open = defineModel<boolean>({ required: true });

const props = defineProps<{ order: ExecutiveOrderDetailView }>();

const emit = defineEmits<{ changed: [order: ExecutiveOrderDetailView] }>();

const queryClient = useQueryClient();

const status = ref<string>('active');
const reason = ref('');
const errorMessage = ref<string | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  // Seed with the stored status (an expired order is stored 'active').
  status.value = props.order.status === 'expired' ? 'active' : props.order.status;
  reason.value = '';
  errorMessage.value = null;
});

const statusOptions = ALL_EO_STATUSES.map((value) => ({
  value,
  title: EO_STATUS_META[value].label,
}));

const submit = useMutation({
  mutationFn: () =>
    changeExecutiveOrderStatus(props.order.eoNumber, {
      status: status.value,
      reason: reason.value.trim(),
    }),
  onSuccess: (order) => {
    void queryClient.invalidateQueries({ queryKey: ['executive-orders'] });
    open.value = false;
    emit('changed', order);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'The status change failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card title="Correct order status">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis">
          Manual correction, logged with your reason. To repeal or supersede an order, issue a new
          order that links to it instead — that keeps the cross-references intact.
        </p>
        <v-select
          v-model="status"
          :items="statusOptions"
          label="Status"
          density="comfortable"
        />
        <v-textarea
          v-model="reason"
          label="Reason (required, audited)"
          rows="2"
          density="comfortable"
          :counter="2000"
          maxlength="2000"
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
          :disabled="reason.trim().length < 3"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Apply
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
