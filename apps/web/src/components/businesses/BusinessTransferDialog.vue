<script setup lang="ts">
import type { BusinessDetailView, OwnerLookupUser } from '@aero/shared';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ref, watch } from 'vue';

import { transferBusiness } from '../../api/businesses';
import { ApiError } from '../../api/client';
import OwnerLookupField from './OwnerLookupField.vue';

/**
 * Ownership transfer, initiated by the current owner (or an admin, for
 * recovery). Writes an append-only transfer log row server-side.
 */
const open = defineModel<boolean>({ required: true });

const props = defineProps<{ business: BusinessDetailView; asAdmin: boolean }>();

const emit = defineEmits<{ transferred: [business: BusinessDetailView] }>();

const queryClient = useQueryClient();

const target = ref<OwnerLookupUser | null>(null);
const reason = ref('');
const errorMessage = ref<string | null>(null);
watch(open, () => {
  target.value = null;
  reason.value = '';
  errorMessage.value = null;
});

const submit = useMutation({
  mutationFn: () =>
    transferBusiness(props.business.id, {
      toRobloxUserId: target.value!.robloxUserId,
      ...(reason.value.trim() ? { reason: reason.value.trim() } : {}),
    }),
  onSuccess: (business) => {
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    void queryClient.invalidateQueries({ queryKey: ['business'] });
    open.value = false;
    emit('transferred', business);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Transfer failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card title="Transfer ownership">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis">
          {{
            asAdmin
              ? 'Admin recovery transfer: the transfer is logged with you as the initiator.'
              : 'Ownership of the business — including the right to edit and transfer it — moves to the chosen user. This cannot be undone by you afterwards.'
          }}
        </p>
        <OwnerLookupField v-model="target" label="New owner" />
        <v-textarea
          v-model="reason"
          label="Reason (optional, logged)"
          rows="2"
          density="comfortable"
          :counter="2000"
          maxlength="2000"
          class="mt-2"
        />
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-2">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn
          color="error"
          :disabled="target === null"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Transfer
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
