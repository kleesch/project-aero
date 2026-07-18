<script setup lang="ts">
import {
  ALL_BILL_STATUSES,
  CHAMBERS,
  CLAIM_KEYS,
  sessionForDate,
  type BillDetailView,
  type BillStatus,
  type Chamber,
} from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { fetchBills } from '../api/bills';
import { fetchTags } from '../api/tags';
import BillSubmitDialog from '../components/bills/BillSubmitDialog.vue';
import { useClaims } from '../composables/useClaims';
import { CHAMBER_LABELS, formatDate, statusMeta } from '../lib/bills';

const router = useRouter();
const { hasClaim } = useClaims();

const currentSession = sessionForDate(new Date());
const PAGE_SIZE = 25;

const filters = reactive({
  session: null as number | null,
  chamber: null as Chamber | null,
  status: null as BillStatus | null,
  tags: [] as number[],
  q: '',
  page: 1,
});

const queryFilters = computed(() => ({
  session: filters.session ?? undefined,
  chamber: filters.chamber ?? undefined,
  status: filters.status ?? undefined,
  tags: filters.tags.length > 0 ? [...filters.tags] : undefined,
  q: filters.q.trim() || undefined,
  page: filters.page,
  pageSize: PAGE_SIZE,
}));

const { data, isPending } = useQuery({
  queryKey: computed(() => ['bills', queryFilters.value] as const),
  queryFn: () => fetchBills(queryFilters.value),
  placeholderData: (previous) => previous,
});
const { data: tags } = useQuery({ queryKey: ['tags'], queryFn: fetchTags });

const chamberOptions = Object.values(CHAMBERS).map((chamber) => ({
  value: chamber,
  title: CHAMBER_LABELS[chamber],
}));
const statusOptions = ALL_BILL_STATUSES.map((status) => ({
  value: status,
  title: statusMeta(status).label,
}));
const tagOptions = computed(
  () => tags.value?.map((tag) => ({ value: tag.id, title: tag.name })) ?? [],
);
const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / PAGE_SIZE)) : 1,
);

function resetPage() {
  filters.page = 1;
}

const submitDialog = reactive({ open: false });

function openBill(displayId: string) {
  void router.push({ name: 'bill-detail', params: { ref: displayId } });
}

function onSubmitted(bill: BillDetailView) {
  openBill(bill.displayId);
}
</script>

<template>
  <div class="d-flex align-center mb-4">
    <div>
      <h1 class="text-h5">Bills</h1>
      <p class="text-body-2 text-medium-emphasis mb-0">
        Current Congress session: <strong>{{ currentSession }}</strong>
      </p>
    </div>
    <v-spacer />
    <v-btn
      v-if="hasClaim(CLAIM_KEYS.BILL_SUBMIT)"
      color="primary"
      prepend-icon="mdi-file-plus"
      @click="submitDialog.open = true"
    >
      Submit bill
    </v-btn>
  </div>

  <v-card class="mb-4">
    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="filters.q"
            label="Search by display id or title"
            density="compact"
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field
            v-model.number="filters.session"
            label="Session"
            type="number"
            density="compact"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="filters.chamber"
            :items="chamberOptions"
            label="Chamber"
            density="compact"
            clearable
            hide-details
            @update:model-value="resetPage"
          />
        </v-col>
        <v-col cols="6" md="2">
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
          <v-select
            v-model="filters.tags"
            :items="tagOptions"
            label="Tags"
            density="compact"
            multiple
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
          <th>Bill</th>
          <th>Title</th>
          <th>Chamber</th>
          <th>Session</th>
          <th>Status</th>
          <th>Tags</th>
          <th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="bill in data?.items"
          :key="bill.id"
          class="cursor-pointer"
          @click="openBill(bill.displayId)"
        >
          <td class="font-weight-bold text-no-wrap">{{ bill.displayId }}</td>
          <td>{{ bill.title }}</td>
          <td>{{ CHAMBER_LABELS[bill.chamber] }}</td>
          <td>{{ bill.session }}</td>
          <td>
            <v-chip :color="statusMeta(bill.status, bill.chamber).color" size="small" variant="tonal">
              {{ statusMeta(bill.status, bill.chamber).label }}
            </v-chip>
          </td>
          <td>
            <v-chip
              v-for="tag in bill.tags"
              :key="tag.id"
              size="x-small"
              class="mr-1"
              variant="outlined"
            >
              {{ tag.name }}
            </v-chip>
          </td>
          <td class="text-no-wrap text-medium-emphasis">{{ formatDate(bill.createdAt) }}</td>
        </tr>
        <tr v-if="data && data.items.length === 0">
          <td colspan="7" class="text-center text-medium-emphasis py-6">
            No bills match these filters.
          </td>
        </tr>
      </tbody>
    </v-table>
    <v-card-actions v-if="pageCount > 1">
      <v-pagination v-model="filters.page" :length="pageCount" density="comfortable" />
    </v-card-actions>
  </v-card>

  <BillSubmitDialog v-model="submitDialog.open" @submitted="onSubmitted" />
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
