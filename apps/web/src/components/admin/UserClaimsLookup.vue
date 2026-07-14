<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';

import { lookupUserClaims, type ClaimSource } from '../../api/adminClaims';
import { ApiError } from '../../api/client';

const searchInput = ref('');
const submittedQuery = ref<string | null>(null);

const { data, isFetching, error } = useQuery({
  queryKey: computed(() => ['admin', 'user-claims', submittedQuery.value] as const),
  queryFn: () => lookupUserClaims(submittedQuery.value ?? ''),
  enabled: computed(() => submittedQuery.value !== null),
  retry: false,
});

const errorMessage = computed(() => {
  if (!error.value) return null;
  return error.value instanceof ApiError ? error.value.message : 'Lookup failed.';
});

function search() {
  const query = searchInput.value.trim();
  if (query) submittedQuery.value = query;
}

/** Human sentence for a claim source — the "why" in "why does X have Y". */
function describeSource(source: ClaimSource): string {
  switch (source.type) {
    case 'group-mapping':
      return `Group ${source.groupName ?? source.groupId} (${source.groupId}): user rank ${source.userRank} satisfies rank ${source.comparison} ${source.rankValue} (mapping #${source.mappingId})`;
    case 'direct-grant':
      return `${source.isNegative ? 'Negative' : 'Positive'} direct grant #${source.grantId} by ${source.grantedBy ?? 'system'}: "${source.reason}"`;
    case 'admin-implied':
      return 'Implied by the admin claim';
  }
}
</script>

<template>
  <v-text-field
    v-model="searchInput"
    label="ROBLOX user id or username"
    prepend-inner-icon="mdi-magnify"
    :loading="isFetching"
    hide-details
    class="mb-4"
    @keyup.enter="search"
  >
    <template #append>
      <v-btn color="primary" :loading="isFetching" @click="search">Look up</v-btn>
    </template>
  </v-text-field>

  <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
    {{ errorMessage }}
  </v-alert>

  <template v-if="data">
    <v-card class="mb-4" variant="outlined">
      <v-card-item>
        <template #prepend>
          <v-avatar size="48">
            <v-img v-if="data.user.avatarUrl" :src="data.user.avatarUrl" />
            <v-icon v-else icon="mdi-account-circle" size="48" />
          </v-avatar>
        </template>
        <v-card-title>{{ data.user.displayName ?? data.user.username }}</v-card-title>
        <v-card-subtitle>
          @{{ data.user.username }} · id {{ data.user.robloxUserId }} ·
          {{ data.user.lastLoginAt ? `last login ${data.user.lastLoginAt}` : 'never logged in' }}
        </v-card-subtitle>
      </v-card-item>
    </v-card>

    <h3 class="text-subtitle-1 mb-2">Resolved claims ({{ data.resolved.length }})</h3>
    <p v-if="data.resolved.length === 0" class="text-medium-emphasis text-body-2 mb-4">
      This user holds no claims.
    </p>
    <v-card
      v-for="entry in data.resolved"
      :key="entry.key"
      variant="outlined"
      class="mb-2"
      density="compact"
    >
      <v-card-item>
        <v-card-title
          ><code>{{ entry.key }}</code></v-card-title
        >
      </v-card-item>
      <v-card-text>
        <ul class="ml-4">
          <li v-for="(source, index) in entry.sources" :key="index">
            {{ describeSource(source) }}
          </li>
        </ul>
      </v-card-text>
    </v-card>

    <template v-if="data.blocked.length">
      <h3 class="text-subtitle-1 mb-2 mt-6">Blocked by negative grants</h3>
      <v-card
        v-for="entry in data.blocked"
        :key="entry.key"
        variant="outlined"
        color="error"
        class="mb-2"
      >
        <v-card-item>
          <v-card-title
            ><code>{{ entry.key }}</code></v-card-title
          >
        </v-card-item>
        <v-card-text>
          <p class="mb-1">{{ describeSource(entry.blockedBy) }}</p>
          <p v-if="entry.overriddenSources.length" class="text-medium-emphasis">
            Overrides: {{ entry.overriddenSources.map(describeSource).join('; ') }}
          </p>
          <p v-else class="text-medium-emphasis">
            The user would not otherwise hold this claim; the block is pre-emptive.
          </p>
        </v-card-text>
      </v-card>
    </template>
  </template>
</template>
