<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { ApiError } from '../api/client';
import { fetchUserCourtRecord, fetchUserProfile } from '../api/rulings';
import CourtRecordSection from '../components/courts/CourtRecordSection.vue';
import { formatDate } from '../lib/bills';

/**
 * Minimal public profile (phase 05): identity card plus the court-record
 * section. Later phases add bills, businesses, and medals as further
 * independent sections.
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

    <CourtRecordSection :items="courtRecord?.items" :is-pending="courtRecordPending" />
  </template>
</template>
