<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { fetchOwnedBusinesses } from '../api/businesses';
import { ApiError } from '../api/client';
import { fetchIssuedExecutiveOrders } from '../api/executiveOrders';
import { fetchUserCourtRecord, fetchUserProfile } from '../api/rulings';
import CourtRecordSection from '../components/courts/CourtRecordSection.vue';
import { formatEoNumber } from '@aero/shared';
import { formatDate } from '../lib/bills';
import { EO_STATUS_META } from '../lib/executiveOrders';

/**
 * Public profile: identity card, the court-record section (phase 05), and
 * the owned-businesses section (phase 06). Later phases add bills and medals
 * as further independent sections.
 */
const route = useRoute();

const robloxId = computed(() => Number(route.params.robloxId));

const {
  data: profile,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ['user-profile', robloxId.value] as const),
  queryFn: () => fetchUserProfile(robloxId.value),
  retry: false,
});

const { data: courtRecord, isPending: courtRecordPending } = useQuery({
  queryKey: computed(() => ['user-court-record', robloxId.value] as const),
  queryFn: () => fetchUserCourtRecord(robloxId.value),
});

const { data: ownedBusinesses } = useQuery({
  queryKey: computed(() => ['user-businesses', robloxId.value] as const),
  queryFn: () => fetchOwnedBusinesses(robloxId.value),
});

const { data: issuedOrders } = useQuery({
  queryKey: computed(() => ['user-executive-orders', robloxId.value] as const),
  queryFn: () => fetchIssuedExecutiveOrders(robloxId.value),
});
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="error" type="error" variant="tonal">
    {{
      error instanceof ApiError && error.status === 404
        ? 'No such user.'
        : 'Failed to load the profile.'
    }}
  </v-alert>

  <template v-else-if="profile">
    <v-card class="mb-4">
      <v-card-text class="d-flex align-center">
        <v-avatar size="64" class="mr-4">
          <v-img v-if="profile.avatarUrl" :src="profile.avatarUrl" :alt="profile.username ?? ''" />
          <v-icon v-else icon="mdi-account-circle" size="64" />
        </v-avatar>
        <div>
          <h1 class="text-h5 mb-0">
            {{ profile.displayName ?? profile.username ?? `user #${profile.robloxUserId}` }}
          </h1>
          <p class="text-body-2 text-medium-emphasis mb-0">
            @{{ profile.username ?? profile.robloxUserId }} · ROBLOX id
            {{ profile.robloxUserId }}
            <template v-if="profile.lastLoginAt">
              · last seen {{ formatDate(profile.lastLoginAt) }}
            </template>
            <template v-else> · has never logged in here</template>
          </p>
        </div>
      </v-card-text>
    </v-card>

    <v-card v-if="ownedBusinesses && ownedBusinesses.items.length > 0" class="mb-4">
      <v-card-title>Businesses</v-card-title>
      <v-list density="compact">
        <v-list-item
          v-for="business in ownedBusinesses.items"
          :key="business.id"
          :title="business.name"
          :to="{ name: 'business-detail', params: { id: business.id } }"
          prepend-icon="mdi-store"
        >
          <template #subtitle>
            <template v-if="business.activeLicenses.length > 0">
              Licensed: {{ business.activeLicenses.join(', ') }}
            </template>
            <template v-else>No active licenses</template>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card v-if="issuedOrders && issuedOrders.items.length > 0" class="mb-4">
      <v-card-title>Executive orders issued</v-card-title>
      <v-list density="compact">
        <v-list-item
          v-for="order in issuedOrders.items"
          :key="order.id"
          :title="`${formatEoNumber(order.eoNumber)} — ${order.title}`"
          :to="{ name: 'executive-order-detail', params: { eoNumber: order.eoNumber } }"
          prepend-icon="mdi-file-sign"
        >
          <template #append>
            <v-chip :color="EO_STATUS_META[order.status].color" size="x-small" variant="tonal">
              {{ EO_STATUS_META[order.status].label }}
            </v-chip>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <CourtRecordSection :items="courtRecord?.items" :is-pending="courtRecordPending" />
  </template>
</template>
