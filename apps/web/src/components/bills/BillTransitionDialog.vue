<script setup lang="ts">
import { STAGE_FOR_STATUS, type BillDetailView, type BillStatus } from '@aero/shared';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { transitionBill } from '../../api/bills';
import { ApiError } from '../../api/client';
import { outcomeLabel, stageLabel } from '../../lib/bills';

/**
 * Declares the outcome of the bill's current stage. Options come from the
 * shared transition map (legalNextStatuses); the server re-checks legality
 * and the stage's claim regardless.
 */
const props = defineProps<{ bill: BillDetailView }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ transitioned: [bill: BillDetailView] }>();

const queryClient = useQueryClient();

const form = reactive({ toStatus: null as BillStatus | null, notes: '' });
const errorMessage = ref<string | null>(null);

const currentStageLabel = computed(() => {
  const stage = STAGE_FOR_STATUS[props.bill.status];
  return stage ? stageLabel(stage, props.bill.chamber) : '';
});
const options = computed(() =>
  props.bill.legalNextStatuses.map((status) => ({
    value: status,
    title: outcomeLabel(status, props.bill.chamber),
  })),
);

const submit = useMutation({
  mutationFn: () => transitionBill(props.bill.id, form.toStatus!, form.notes.trim() || undefined),
  onSuccess: (bill) => {
    void queryClient.invalidateQueries({ queryKey: ['bills'] });
    void queryClient.invalidateQueries({ queryKey: ['bill'] });
    open.value = false;
    form.toStatus = null;
    form.notes = '';
    emit('transitioned', bill);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Transition failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card :title="`Declare outcome — ${currentStageLabel}`">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          {{ bill.displayId }} — {{ bill.title }}. The outcome is declared manually; recorded
          tallies are supporting documentation.
        </p>
        <v-radio-group v-model="form.toStatus">
          <v-radio
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :label="option.title"
          />
        </v-radio-group>
        <v-textarea
          v-model="form.notes"
          label="Notes (optional)"
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
          :disabled="form.toStatus === null"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Declare outcome
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
