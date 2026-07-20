<script setup lang="ts">
import { CLAIM_KEYS, formatUserRef, type BusinessDetailView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import { fetchBusinessDetail, updateBusiness } from '../api/businesses';
import { ApiError } from '../api/client';
import { fetchBusinessCourtRecord } from '../api/rulings';
import BusinessLicensesCard from '../components/businesses/BusinessLicensesCard.vue';
import BusinessTransferDialog from '../components/businesses/BusinessTransferDialog.vue';
import CourtRecordSection from '../components/courts/CourtRecordSection.vue';
import { useClaims } from '../composables/useClaims';
import { formatDate } from '../lib/bills';
import { BUSINESS_STATUS_META } from '../lib/businesses';

/**
 * Business page (phase 06): registration card, licenses, ownership history,
 * and the phase-05 court-record section. Edit is owner-only (no claim
 * overrides it); transfer is owner-or-admin.
 */
const route = useRoute();
const { user, hasClaim } = useClaims();
const queryClient = useQueryClient();

const businessId = computed(() => Number(route.params.id));

const {
  data: business,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ['business', businessId.value] as const),
  queryFn: () => fetchBusinessDetail(businessId.value),
  retry: false,
});

const { data: courtRecord, isPending: courtRecordPending } = useQuery({
  queryKey: computed(() => ['business-court-record', businessId.value] as const),
  queryFn: () => fetchBusinessCourtRecord(businessId.value),
});

const isOwner = computed(
  () => business.value !== undefined && user.value?.robloxUserId === business.value.owner.robloxUserId,
);
const isAdmin = computed(() => hasClaim(CLAIM_KEYS.ADMIN));
const canTransfer = computed(() => isOwner.value || isAdmin.value);

function refresh(updated: BusinessDetailView) {
  queryClient.setQueryData(['business', updated.id], updated);
}

// --- Owner-only rename ---------------------------------------------------------

const editDialog = reactive({ open: false, name: '' });
const errorMessage = ref<string | null>(null);

function openEdit() {
  editDialog.name = business.value?.name ?? '';
  errorMessage.value = null;
  editDialog.open = true;
}

const saveEdit = useMutation({
  mutationFn: () => updateBusiness(businessId.value, { name: editDialog.name.trim() }),
  onSuccess: (updated) => {
    void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    editDialog.open = false;
    refresh(updated);
  },
  onError: (err: unknown) => {
    errorMessage.value = err instanceof ApiError ? err.message : 'The update failed.';
  },
});

const transferDialog = reactive({ open: false });
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="error" type="error" variant="tonal">
    {{
      error instanceof ApiError && error.status === 404
        ? 'No such business.'
        : 'Failed to load the business.'
    }}
  </v-alert>

  <template v-else-if="business">
    <v-card class="mb-4">
      <v-card-text class="d-flex align-center">
        <v-avatar size="64" class="mr-4" color="surface-variant">
          <v-icon icon="mdi-store" size="40" />
        </v-avatar>
        <div>
          <h1 class="text-h5 mb-0">{{ business.name }}</h1>
          <p class="text-body-2 text-medium-emphasis mb-0">
            Owned by
            <router-link
              :to="{ name: 'user-profile', params: { robloxId: business.owner.robloxUserId } }"
            >
              {{ formatUserRef(business.owner) }}
            </router-link>
            · registered {{ formatDate(business.createdAt) }} by
            {{ formatUserRef(business.createdBy) }} ·
            <v-chip
              :color="BUSINESS_STATUS_META[business.status].color"
              size="x-small"
              variant="tonal"
            >
              {{ BUSINESS_STATUS_META[business.status].label }}
            </v-chip>
          </p>
        </div>
        <v-spacer />
        <div class="text-no-wrap">
          <v-btn
            v-if="isOwner"
            size="small"
            variant="tonal"
            prepend-icon="mdi-pencil"
            class="mr-2"
            @click="openEdit"
          >
            Edit
          </v-btn>
          <v-btn
            v-if="canTransfer"
            size="small"
            variant="tonal"
            color="error"
            prepend-icon="mdi-swap-horizontal"
            @click="transferDialog.open = true"
          >
            Transfer
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <BusinessLicensesCard :business="business" @changed="refresh" />

    <v-card v-if="business.transfers.length > 0" class="mb-4">
      <v-card-title>Ownership history</v-card-title>
      <v-card-text>
        <v-timeline density="compact" side="end">
          <v-timeline-item
            v-for="transfer in business.transfers"
            :key="transfer.id"
            dot-color="primary"
            size="x-small"
          >
            <div class="text-body-2">
              {{ formatUserRef(transfer.from) }}
              <v-icon icon="mdi-arrow-right" size="x-small" />
              {{ formatUserRef(transfer.to) }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ formatDate(transfer.transferredAt) }} · initiated by
              {{ formatUserRef(transfer.initiatedBy) }}
              <template v-if="transfer.reason"> · “{{ transfer.reason }}”</template>
            </div>
          </v-timeline-item>
        </v-timeline>
      </v-card-text>
    </v-card>

    <CourtRecordSection :items="courtRecord?.items" :is-pending="courtRecordPending" />

    <v-dialog v-model="editDialog.open" max-width="460">
      <v-card title="Edit business">
        <v-card-text>
          <v-text-field
            v-model="editDialog.name"
            label="Business name"
            density="comfortable"
            :counter="120"
            maxlength="120"
          />
          <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-2">
            {{ errorMessage }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="editDialog.open = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :disabled="editDialog.name.trim().length < 2"
            :loading="saveEdit.isPending.value"
            @click="saveEdit.mutate()"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <BusinessTransferDialog
      v-model="transferDialog.open"
      :business="business"
      :as-admin="!isOwner && isAdmin"
      @transferred="refresh"
    />
  </template>
</template>
