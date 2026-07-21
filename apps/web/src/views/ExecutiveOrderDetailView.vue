<script setup lang="ts">
import {
  CLAIM_KEYS,
  formatEoNumber,
  formatUserRef,
  type ExecutiveOrderDetailView,
  type ExecutiveOrderRef,
} from '@aero/shared';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useRoute } from 'vue-router';

import { ApiError } from '../api/client';
import { fetchExecutiveOrder } from '../api/executiveOrders';
import ExecutiveOrderEditDialog from '../components/executive-orders/ExecutiveOrderEditDialog.vue';
import ExecutiveOrderStatusDialog from '../components/executive-orders/ExecutiveOrderStatusDialog.vue';
import PdfViewer from '../components/PdfViewer.vue';
import { useClaims } from '../composables/useClaims';
import { formatDate } from '../lib/bills';
import { EO_STATUS_META } from '../lib/executiveOrders';

/**
 * Executive Order detail (phase 10): header with status, summary, the
 * sandboxed PDF, repeal/supersede cross-links in both directions, and
 * claim-gated edit/status affordances.
 */
const route = useRoute();
const { hasClaim } = useClaims();
const queryClient = useQueryClient();

const eoNumber = computed(() => Number(route.params.eoNumber));

const {
  data: order,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ['executive-order', eoNumber.value] as const),
  queryFn: () => fetchExecutiveOrder(eoNumber.value),
  retry: false,
});

const canManage = computed(() => hasClaim(CLAIM_KEYS.EO_MANAGE));

const editDialog = reactive({ open: false });
const statusDialog = reactive({ open: false });

function refresh(updated: ExecutiveOrderDetailView) {
  queryClient.setQueryData(['executive-order', updated.eoNumber], updated);
}

/** A cross-link chip → the linked order's detail page. */
function linkTo(ref: ExecutiveOrderRef) {
  return { name: 'executive-order-detail', params: { eoNumber: ref.eoNumber } };
}
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="error" type="error" variant="tonal">
    {{
      error instanceof ApiError && error.status === 404
        ? 'No such executive order.'
        : 'Failed to load the executive order.'
    }}
  </v-alert>

  <template v-else-if="order">
    <div class="d-flex align-center flex-wrap mb-1">
      <h1 class="text-h5 mr-3">{{ formatEoNumber(order.eoNumber) }}</h1>
      <v-chip :color="EO_STATUS_META[order.status].color" variant="tonal" class="mr-2">
        {{ EO_STATUS_META[order.status].label }}
      </v-chip>
      <v-spacer />
      <template v-if="canManage">
        <v-btn
          variant="tonal"
          prepend-icon="mdi-pencil"
          class="mr-2"
          @click="editDialog.open = true"
        >
          Edit
        </v-btn>
        <v-btn variant="tonal" color="warning" prepend-icon="mdi-flag" @click="statusDialog.open = true">
          Status
        </v-btn>
      </template>
    </div>

    <h2 class="text-h6 mb-1">{{ order.title }}</h2>
    <p class="text-body-2 text-medium-emphasis">
      Issued by
      <router-link :to="{ name: 'user-profile', params: { robloxId: order.issuedBy.robloxUserId } }">
        {{ formatUserRef(order.issuedBy) }}
      </router-link>
      · effective {{ formatDate(order.effectiveDate) }}
      <template v-if="order.expiresAt"> · expires {{ formatDate(order.expiresAt) }}</template>
      · filed {{ formatDate(order.createdAt) }} by {{ formatUserRef(order.createdBy) }}
    </p>

    <!-- Cross-links in both directions. -->
    <div v-if="order.repeals || order.supersedes || order.repealedBy || order.supersededBy" class="mb-4">
      <v-chip
        v-if="order.repeals"
        :to="linkTo(order.repeals)"
        color="error"
        variant="tonal"
        class="mr-2 mb-1"
        prepend-icon="mdi-file-remove"
      >
        Repeals {{ formatEoNumber(order.repeals.eoNumber) }}
      </v-chip>
      <v-chip
        v-if="order.supersedes"
        :to="linkTo(order.supersedes)"
        color="grey"
        variant="tonal"
        class="mr-2 mb-1"
        prepend-icon="mdi-file-replace"
      >
        Supersedes {{ formatEoNumber(order.supersedes.eoNumber) }}
      </v-chip>
      <v-chip
        v-if="order.repealedBy"
        :to="linkTo(order.repealedBy)"
        color="error"
        variant="flat"
        class="mr-2 mb-1"
        prepend-icon="mdi-cancel"
      >
        Repealed by {{ formatEoNumber(order.repealedBy.eoNumber) }}
      </v-chip>
      <v-chip
        v-if="order.supersededBy"
        :to="linkTo(order.supersededBy)"
        color="grey-darken-1"
        variant="flat"
        class="mr-2 mb-1"
        prepend-icon="mdi-update"
      >
        Superseded by {{ formatEoNumber(order.supersededBy.eoNumber) }}
      </v-chip>
    </div>

    <v-row>
      <v-col cols="12" md="5">
        <v-card title="Summary" class="mb-4">
          <v-card-text>
            <p v-if="order.summary" class="text-body-2" style="white-space: pre-wrap">
              {{ order.summary }}
            </p>
            <p v-else class="text-medium-emphasis mb-0">No summary has been written yet.</p>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="7">
        <v-card title="Order document">
          <v-card-text>
            <v-alert v-if="order.document.quarantinedAt" type="warning" variant="tonal">
              This document is quarantined and not being served.
            </v-alert>
            <PdfViewer
              v-else
              :src="order.document.fileUrl"
              :title="`${formatEoNumber(order.eoNumber)} — ${order.title}`"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <ExecutiveOrderEditDialog v-model="editDialog.open" :order="order" @updated="refresh" />
    <ExecutiveOrderStatusDialog v-model="statusDialog.open" :order="order" @changed="refresh" />
  </template>
</template>
