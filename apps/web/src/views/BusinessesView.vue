<script setup lang="ts">
import { CLAIM_KEYS, formatUserRef, type BusinessDetailView } from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { fetchBusinesses } from '../api/businesses';
import BusinessRegisterDialog from '../components/businesses/BusinessRegisterDialog.vue';
import { useClaims } from '../composables/useClaims';
import { formatDate } from '../lib/bills';
import { BUSINESS_STATUS_META } from '../lib/businesses';

/** Public business directory: search by name, filter by license status. */
const router = useRouter();
const { hasClaim } = useClaims();

const PAGE_SIZE = 25;

const filters = reactive({
  q: '',
  licensed: null as boolean | null,
  page: 1,
});

const queryFilters = computed(() => ({
  q: filters.q.trim() || undefined,
  licensed: filters.licensed ?? undefined,
  page: filters.page,
  pageSize: PAGE_SIZE,
}));

const { data, isPending } = useQuery({
  queryKey: computed(() => ['businesses', queryFilters.value] as const),
  queryFn: () => fetchBusinesses(queryFilters.value),
  placeholderData: (previous) => previous,
});

const licensedOptions = [
  { value: true, title: 'Licensed' },
  { value: false, title: 'Unlicensed' },
];
const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / PAGE_SIZE)) : 1,
);

function resetPage() {
  filters.page = 1;
}

const registerDialog = reactive({ open: false });

function openBusiness(id: number) {
  void router.push({ name: 'business-detail', params: { id } });
}

function onRegistered(business: BusinessDetailView) {
  openBusiness(business.id);
}
</script>

<template>
  <div class="d-flex align-center mb-4">
    <div>
      <h1 class="text-h5">Business directory</h1>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Registered businesses, their owners, and license status — public record.
      </p>
    </div>
    <v-spacer />
    <v-btn
      v-if="hasClaim(CLAIM_KEYS.BUSINESS_REGISTER)"
      color="primary"
      prepend-icon="mdi-store-plus"
      @click="registerDialog.open = true"
    >
      Register business
    </v-btn>
  </div>

  <v-card class="mb-4">
    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="8">
          <v-text-field
            v-model="filters.q"
            label="Search by name"
            density="compact"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-select
            v-model="filters.licensed"
            :items="licensedOptions"
            label="License status"
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
          <th>Name</th>
          <th>Owner</th>
          <th>Licenses</th>
          <th>Status</th>
          <th>Registered</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="business in data?.items"
          :key="business.id"
          class="cursor-pointer"
          @click="openBusiness(business.id)"
        >
          <td class="font-weight-bold">{{ business.name }}</td>
          <td>{{ formatUserRef(business.owner) }}</td>
          <td>
            <template v-if="business.activeLicenses.length > 0">
              <v-chip
                v-for="license in business.activeLicenses"
                :key="license"
                size="x-small"
                color="success"
                variant="tonal"
                class="mr-1"
              >
                {{ license }}
              </v-chip>
            </template>
            <span v-else class="text-medium-emphasis">—</span>
          </td>
          <td>
            <v-chip
              :color="BUSINESS_STATUS_META[business.status].color"
              size="small"
              variant="tonal"
            >
              {{ BUSINESS_STATUS_META[business.status].label }}
            </v-chip>
          </td>
          <td class="text-no-wrap text-medium-emphasis">{{ formatDate(business.createdAt) }}</td>
        </tr>
        <tr v-if="data && data.items.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis py-6">
            No businesses match these filters.
          </td>
        </tr>
      </tbody>
    </v-table>
    <v-card-actions v-if="pageCount > 1">
      <v-pagination v-model="filters.page" :length="pageCount" density="comfortable" />
    </v-card-actions>
  </v-card>

  <BusinessRegisterDialog v-model="registerDialog.open" @registered="onRegistered" />
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
