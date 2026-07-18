<script setup lang="ts">
import {
  ALL_RULING_PARTY_TYPES,
  CLAIM_KEYS,
  type RulingDetailView,
  type RulingPartyType,
} from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { fetchOutcomes, fetchRulings } from '../api/rulings';
import RulingSubmitDialog from '../components/courts/RulingSubmitDialog.vue';
import { useClaims } from '../composables/useClaims';
import {
  formatParty,
  formatRulingDate,
  PARTY_SIDE_LABELS,
  PARTY_TYPE_LABELS,
  RULING_STATUS_META,
} from '../lib/courts';

const router = useRouter();
const { hasClaim } = useClaims();

const PAGE_SIZE = 25;

const filters = reactive({
  partyType: null as RulingPartyType | null,
  outcomeId: null as number | null,
  from: '',
  to: '',
  party: '',
  page: 1,
});

const queryFilters = computed(() => ({
  partyType: filters.partyType ?? undefined,
  outcomeId: filters.outcomeId ?? undefined,
  from: filters.from || undefined,
  to: filters.to || undefined,
  party: filters.party.trim() || undefined,
  page: filters.page,
  pageSize: PAGE_SIZE,
}));

const { data, isPending } = useQuery({
  queryKey: computed(() => ['rulings', queryFilters.value] as const),
  queryFn: () => fetchRulings(queryFilters.value),
  placeholderData: (previous) => previous,
});
const { data: outcomes } = useQuery({ queryKey: ['ruling-outcomes'], queryFn: fetchOutcomes });

const partyTypeOptions = ALL_RULING_PARTY_TYPES.map((type) => ({
  value: type,
  title: PARTY_TYPE_LABELS[type],
}));
const outcomeOptions = computed(
  () => outcomes.value?.map((outcome) => ({ value: outcome.id, title: outcome.name })) ?? [],
);
const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / PAGE_SIZE)) : 1,
);

function resetPage() {
  filters.page = 1;
}

const submitDialog = reactive({ open: false });

function openRuling(id: number) {
  void router.push({ name: 'ruling-detail', params: { id } });
}

function onSubmitted(ruling: RulingDetailView) {
  openRuling(ruling.id);
}
</script>

<template>
  <div class="d-flex align-center mb-4">
    <div>
      <h1 class="text-h5">Court records</h1>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Final judgments, appeals, and outcomes — public record.
      </p>
    </div>
    <v-spacer />
    <v-btn
      v-if="hasClaim(CLAIM_KEYS.COURT_SUBMIT)"
      color="primary"
      prepend-icon="mdi-gavel"
      @click="submitDialog.open = true"
    >
      Enter ruling
    </v-btn>
  </div>

  <v-card class="mb-4">
    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="filters.party"
            label="Search by party (user or business)"
            density="compact"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="filters.partyType"
            :items="partyTypeOptions"
            label="Party type"
            density="compact"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="filters.outcomeId"
            :items="outcomeOptions"
            label="Outcome"
            density="compact"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field
            v-model="filters.from"
            label="From"
            type="date"
            density="compact"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field
            v-model="filters.to"
            label="To"
            type="date"
            density="compact"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>

  <v-progress-linear v-if="isPending" indeterminate class="mb-2" />

  <v-card>
    <v-table hover>
      <thead>
        <tr>
          <th>Date</th>
          <th>Parties</th>
          <th>Outcomes</th>
          <th>Status</th>
          <th>Entered</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="ruling in data?.items"
          :key="ruling.id"
          class="cursor-pointer"
          @click="openRuling(ruling.id)"
        >
          <td class="text-no-wrap font-weight-bold">{{ formatRulingDate(ruling.rulingDate) }}</td>
          <td>
            <span v-for="(party, index) in ruling.parties" :key="party.id">
              <template v-if="index > 0">, </template>
              {{ formatParty(party) }}
              <span class="text-caption text-medium-emphasis">
                ({{ PARTY_SIDE_LABELS[party.side] }})
              </span>
            </span>
          </td>
          <td>
            <v-chip
              v-for="outcome in ruling.outcomes"
              :key="outcome.id"
              size="x-small"
              variant="outlined"
              class="mr-1"
            >
              {{ outcome.name }}
            </v-chip>
          </td>
          <td>
            <v-chip :color="RULING_STATUS_META[ruling.status].color" size="small" variant="tonal">
              {{ RULING_STATUS_META[ruling.status].label }}
            </v-chip>
            <v-icon
              v-if="ruling.hasAppeal"
              icon="mdi-gavel"
              size="small"
              class="ml-1"
              title="Appealed"
            />
          </td>
          <td class="text-no-wrap text-medium-emphasis">
            {{ formatRulingDate(ruling.createdAt.slice(0, 10)) }}
          </td>
        </tr>
        <tr v-if="data && data.items.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis py-6">
            No court records match these filters.
          </td>
        </tr>
      </tbody>
    </v-table>
    <v-card-actions v-if="pageCount > 1">
      <v-pagination v-model="filters.page" :length="pageCount" density="comfortable" />
    </v-card-actions>
  </v-card>

  <RulingSubmitDialog v-model="submitDialog.open" @submitted="onSubmitted" />
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
