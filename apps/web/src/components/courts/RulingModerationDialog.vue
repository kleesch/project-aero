<script setup lang="ts">
import type { RulingDetailView } from '@aero/shared';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';

import { ApiError } from '../../api/client';
import { expungeRuling, pardonRuling } from '../../api/rulings';

/**
 * Expunge (court:expunge) / pardon (court:pardon) dialog. Both are status
 * changes with a required, audited reason — never a delete; the record stays
 * visible to judicial/admin claim holders with a status banner.
 */
const open = defineModel<boolean>({ required: true });

const props = defineProps<{ rulingId: number; action: 'expunge' | 'pardon' }>();

const emit = defineEmits<{ moderated: [ruling: RulingDetailView] }>();

const queryClient = useQueryClient();

const reason = ref('');
const errorMessage = ref<string | null>(null);
watch(open, () => {
  reason.value = '';
  errorMessage.value = null;
});

const copy = computed(() =>
  props.action === 'expunge'
    ? {
        title: 'Expunge this ruling',
        body:
          'Expungement removes the ruling from the public record — the list, the parties’ ' +
          'profiles, and the public API — as though it had not occurred. The record and its ' +
          'audit trail are preserved and stay visible to judicial and admin claim holders.',
        button: 'Expunge',
      }
    : {
        title: 'Pardon this ruling',
        body:
          'A pardon sets the ruling’s consequences aside and removes it from the public ' +
          'record. The record and its audit trail are preserved and stay visible to judicial ' +
          'and admin claim holders.',
        button: 'Pardon',
      },
);

const submit = useMutation({
  mutationFn: () =>
    props.action === 'expunge'
      ? expungeRuling(props.rulingId, reason.value.trim())
      : pardonRuling(props.rulingId, reason.value.trim()),
  onSuccess: (ruling) => {
    void queryClient.invalidateQueries({ queryKey: ['rulings'] });
    void queryClient.invalidateQueries({ queryKey: ['ruling'] });
    open.value = false;
    emit('moderated', ruling);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'The action failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card :title="copy.title">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis">{{ copy.body }}</p>
        <v-textarea
          v-model="reason"
          label="Reason (required, audited)"
          rows="3"
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
          color="error"
          :disabled="reason.trim().length < 3"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          {{ copy.button }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
