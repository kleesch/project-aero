<script setup lang="ts">
import {
  RULING_PARTY_SIDES,
  type RulingDetailView,
  type RulingPartyInput,
  type RulingPartySide,
} from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { ApiError } from '../../api/client';
import { uploadDocument } from '../../api/documents';
import { fetchOutcomes, submitRuling } from '../../api/rulings';
import { PARTY_SIDE_LABELS } from '../../lib/courts';
import PartyLookupField from './PartyLookupField.vue';

/**
 * Claim-gated ruling entry (court:submit): judgment PDF through the
 * documents pipeline, outcomes from the vocabulary, and parties on each side
 * via the lookup experience.
 */
const open = defineModel<boolean>({ required: true });

const emit = defineEmits<{ submitted: [ruling: RulingDetailView] }>();

const queryClient = useQueryClient();

const { data: outcomes } = useQuery({ queryKey: ['ruling-outcomes'], queryFn: fetchOutcomes });

interface PickedParty {
  party: RulingPartyInput;
  label: string;
}

const form = reactive({
  rulingDate: new Date().toISOString().slice(0, 10),
  file: null as File | null,
  outcomeIds: [] as number[],
  parties: [] as PickedParty[],
});
const errorMessage = ref<string | null>(null);

const outcomeOptions = computed(
  () => outcomes.value?.map((outcome) => ({ value: outcome.id, title: outcome.name })) ?? [],
);
const sides = Object.values(RULING_PARTY_SIDES);

function partyKey(party: RulingPartyInput): string {
  if (party.partyType === 'user') return `${party.side}-user-${party.robloxUserId}`;
  if (party.partyType === 'business') return `${party.side}-business-${party.businessId}`;
  return `${party.side}-government`;
}

function addParty(party: RulingPartyInput, label: string) {
  if (form.parties.some((picked) => partyKey(picked.party) === partyKey(party))) return;
  form.parties.push({ party, label });
}

function removeParty(index: number) {
  form.parties.splice(index, 1);
}

function partiesOn(side: RulingPartySide) {
  return form.parties
    .map((picked, index) => ({ ...picked, index }))
    .filter((picked) => picked.party.side === side);
}

const canSubmit = computed(
  () =>
    form.rulingDate.length > 0 &&
    form.file !== null &&
    form.outcomeIds.length > 0 &&
    form.parties.length > 0,
);

const submit = useMutation({
  mutationFn: async () => {
    const document = await uploadDocument(form.file!);
    return submitRuling({
      rulingDate: form.rulingDate,
      documentId: document.id,
      outcomeIds: form.outcomeIds,
      parties: form.parties.map((picked) => picked.party),
    });
  },
  onSuccess: (ruling) => {
    void queryClient.invalidateQueries({ queryKey: ['rulings'] });
    open.value = false;
    form.file = null;
    form.outcomeIds = [];
    form.parties = [];
    emit('submitted', ruling);
  },
  onError: (error: unknown) => {
    errorMessage.value = error instanceof ApiError ? error.message : 'Submission failed.';
  },
});
</script>

<template>
  <v-dialog v-model="open" max-width="640">
    <v-card title="Enter a ruling">
      <v-card-text>
        <v-text-field
          v-model="form.rulingDate"
          label="Ruling date"
          type="date"
          density="comfortable"
        />
        <v-file-input
          v-model="form.file"
          label="Judgment PDF"
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
          :hint="
            outcomeOptions.length === 0
              ? 'No outcomes in the vocabulary yet — an admin must create them first.'
              : undefined
          "
          persistent-hint
        />

        <div v-for="side in sides" :key="side" class="mt-4">
          <div class="text-subtitle-2 mb-2">{{ PARTY_SIDE_LABELS[side] }}s</div>
          <PartyLookupField :side="side" @select="addParty" />
          <div class="mt-2">
            <v-chip
              v-for="picked in partiesOn(side)"
              :key="partyKey(picked.party)"
              size="small"
              class="mr-1 mb-1"
              closable
              @click:close="removeParty(picked.index)"
            >
              {{ picked.label }}
            </v-chip>
            <span v-if="partiesOn(side).length === 0" class="text-caption text-medium-emphasis">
              None yet.
            </span>
          </div>
        </div>

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
          Enter ruling
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
