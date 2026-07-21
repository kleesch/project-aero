<script setup lang="ts">
import {
  ALL_EFFECTIVE_EO_STATUSES,
  CLAIM_KEYS,
  formatEoNumber,
  formatUserRef,
  type ExecutiveOrderDetailView,
} from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { fetchExecutiveOrders } from '../api/executiveOrders';
import ExecutiveOrderIssueDialog from '../components/executive-orders/ExecutiveOrderIssueDialog.vue';
import { useClaims } from '../composables/useClaims';
import { formatDate } from '../lib/bills';
import { EO_STATUS_META } from '../lib/executiveOrders';

/** Public Executive Order archive: search, status/date filters, pagination. */
const router = useRouter();
const { hasClaim } = useClaims();

const PAGE_SIZE = 25;

const filters = reactive({
  q: '',
  status: null as string | null,
  from: '',
  to: '',
  page: 1,
});

const queryFilters = computed(() => ({
  q: filters.q.trim() || undefined,
  status: filters.status ?? undefined,
  from: filters.from || undefined,
  to: filters.to || undefined,
  page: filters.page,
  pageSize: PAGE_SIZE,
}));

const { data, isPending } = useQuery({
  queryKey: computed(() => ['executive-orders', queryFilters.value] as const),
  queryFn: () => fetchExecutiveOrders(queryFilters.value),
  placeholderData: (previous) => previous,
});

const statusOptions = ALL_EFFECTIVE_EO_STATUSES.map((value) => ({
  value,
  title: EO_STATUS_META[value].label,
}));
const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / PAGE_SIZE)) : 1,
);

function resetPage() {
  filters.page = 1;
}

const issueDialog = reactive({ open: false });

function openOrder(eoNumber: number) {
  void router.push({ name: 'executive-order-detail', params: { eoNumber } });
}

function onIssued(order: ExecutiveOrderDetailView) {
  openOrder(order.eoNumber);
}
</script>

<template>
  <div class="d-flex align-center mb-4">
    <div>
      <h1 class="text-h5">Executive Orders</h1>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Orders issued by Presidents — public record.
      </p>
    </div>
    <v-spacer />
    <v-btn
      v-if="hasClaim(CLAIM_KEYS.EO_MANAGE)"
      color="primary"
      prepend-icon="mdi-file-sign"
      @click="issueDialog.open = true"
    >
      Issue order
    </v-btn>
  </div>

  <v-card class="mb-4">
    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="5">
          <v-text-field
            v-model="filters.q"
            label="Search by title or number"
            density="compact"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="filters.status"
            :items="statusOptions"
            label="Status"
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
          <th>EO #</th>
          <th>Title</th>
          <th>President</th>
          <th>Effective</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="order in data?.items"
          :key="order.id"
          class="cursor-pointer"
          @click="openOrder(order.eoNumber)"
        >
          <td class="font-weight-bold text-no-wrap">{{ formatEoNumber(order.eoNumber) }}</td>
          <td>
            {{ order.title }}
            <v-icon
              v-if="!order.hasSummary"
              icon="mdi-text-box-remove-outline"
              size="x-small"
              class="ml-1 text-medium-emphasis"
              title="No summary yet"
            />
          </td>
          <td class="text-no-wrap">{{ formatUserRef(order.issuedBy) }}</td>
          <td class="text-no-wrap text-medium-emphasis">{{ formatDate(order.effectiveDate) }}</td>
          <td>
            <v-chip :color="EO_STATUS_META[order.status].color" size="small" variant="tonal">
              {{ EO_STATUS_META[order.status].label }}
            </v-chip>
          </td>
        </tr>
        <tr v-if="data && data.items.length === 0">
          <td colspan="5" class="text-center text-medium-emphasis py-6">
            No executive orders match these filters.
          </td>
        </tr>
      </tbody>
    </v-table>
    <v-card-actions v-if="pageCount > 1">
      <v-pagination v-model="filters.page" :length="pageCount" density="comfortable" />
    </v-card-actions>
  </v-card>

  <ExecutiveOrderIssueDialog v-model="issueDialog.open" @issued="onIssued" />
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
