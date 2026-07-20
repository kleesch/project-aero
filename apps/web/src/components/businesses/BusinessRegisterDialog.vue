<script setup lang="ts">
import type { BusinessDetailView, OwnerLookupUser } from '@aero/shared';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { ref, watch } from 'vue';

import { registerBusiness } from '../../api/businesses';
import { ApiError } from '../../api/client';
import OwnerLookupField from './OwnerLookupField.vue';

/** Registrar creation form (`business:register`): name plus owner assignment. */
const open = defineModel<boolean>({ required: true });

const emit = defineEmits<{ registered: [business: BusinessDetailView] }>();

const queryClient = useQueryClient();

const name = ref('');
const owner = ref<OwnerLookupUser | null>(null);
const errorMessage = ref<string | null>(null);
watch(open, () => {
  name.value = '';
  owner.value = null;
  errorMessage.value = null;
});

const submit = useMutation({
  mutationFn: () =>
    registerBusiness({ name: name.value.trim(), ownerRobloxUserId: owner.value!.robloxUserId }),
  onSuccess: (business) => {
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    open.value = false;
    emit('registered', business);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Registration failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card title="Register a business">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis">
          The assigned owner — and only the owner — will be able to edit the business and
          transfer it.
        </p>
        <v-text-field
          v-model="name"
          label="Business name"
          density="comfortable"
          :counter="120"
          maxlength="120"
          class="mb-2"
        />
        <OwnerLookupField v-model="owner" label="Owner" />
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-3">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="name.trim().length < 2 || owner === null"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Register
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
