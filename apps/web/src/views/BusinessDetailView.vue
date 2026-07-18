<script setup lang="ts">
import { formatUserRef } from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { ApiError } from '../api/client';
import { fetchBusiness, fetchBusinessCourtRecord } from '../api/rulings';
import CourtRecordSection from '../components/courts/CourtRecordSection.vue';
import { formatDate } from '../lib/bills';

/**
 * Minimal public business page (phase 05): registration card plus the
 * court-record section. Phase 06 adds licensing and ownership history.
 */
const route = useRoute();

const businessId = computed(() => Number(route.params.id));

const {
  data: business,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ['business', businessId.value] as const),
  queryFn: () => fetchBusiness(businessId.value),
  retry: false,
});

const { data: courtRecord, isPending: courtRecordPending } = useQuery({
  queryKey: computed(() => ['business-court-record', businessId.value] as const),
  queryFn: () => fetchBusinessCourtRecord(businessId.value),
});
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
            · registered {{ formatDate(business.createdAt) }} ·
            <v-chip size="x-small" variant="tonal">{{ business.status }}</v-chip>
          </p>
        </div>
      </v-card-text>
    </v-card>

    <CourtRecordSection :items="courtRecord?.items" :is-pending="courtRecordPending" />
  </template>
</template>
