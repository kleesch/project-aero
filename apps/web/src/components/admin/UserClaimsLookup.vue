<script setup lang="ts">
import { formatUserRef, type ClaimKey, type ClaimSourceView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { createGrant, lookupUserClaims } from '../../api/adminClaims';
import { ApiError } from '../../api/client';

const queryClient = useQueryClient();

const searchInput = ref('');
const submittedQuery = ref<string | null>(null);

const lookupQueryKey = computed(() => ['admin', 'user-claims', submittedQuery.value] as const);

const { data, isFetching, error } = useQuery({
  queryKey: lookupQueryKey,
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

// --- Block a claim (negative grant) ----------------------------------------

const mutationError = ref<string | null>(null);

const blockDialog = reactive({
  open: false,
  claimKey: null as ClaimKey | null,
  reason: '',
});

function openBlockDialog(claimKey: ClaimKey) {
  blockDialog.open = true;
  blockDialog.claimKey = claimKey;
  blockDialog.reason = '';
}

const block = useMutation({
  mutationFn: () =>
    createGrant({
      userId: data.value?.user.robloxUserId ?? 0,
      claimKey: blockDialog.claimKey as ClaimKey,
      isNegative: true,
      reason: blockDialog.reason.trim(),
    }),
  onSuccess: () => {
    blockDialog.open = false;
    void queryClient.invalidateQueries({ queryKey: lookupQueryKey.value });
  },
  onError: (err: unknown) => {
    mutationError.value = err instanceof ApiError ? err.message : 'Request failed.';
  },
});

const resolvedHeaders = [
  { title: 'Claim', key: 'key' },
  { title: 'Why the user holds it', key: 'sources', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 0 },
] as const;

const blockedHeaders = [
  { title: 'Claim', key: 'key' },
  { title: 'Blocked by', key: 'blockedBy', sortable: false },
  { title: 'Overrides', key: 'overrides', sortable: false },
] as const;

/** Human sentence for a claim source — the "why" in "why does X have Y". */
function describeSource(source: ClaimSourceView): string {
  switch (source.type) {
    case 'group-mapping':
      return `Group ${source.groupName ?? source.groupId} (${source.groupId}): user rank ${source.userRank} satisfies rank ${source.comparison} ${source.rankValue} (mapping #${source.mappingId})`;
    case 'direct-grant':
      return `${source.isNegative ? 'Negative' : 'Positive'} direct grant #${source.grantId} by ${formatUserRef(source.grantedBy)}: "${source.reason}"`;
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
    <v-data-table
      v-else
      :headers="resolvedHeaders"
      :items="data.resolved"
      item-value="key"
      density="compact"
      class="mb-4"
      hide-default-footer
      :items-per-page="-1"
    >
      <template #[`item.key`]="{ item }">
        <code>{{ item.key }}</code>
      </template>
      <template #[`item.sources`]="{ item }">
        <ul class="ml-4 py-2">
          <li v-for="(source, index) in item.sources" :key="index">
            {{ describeSource(source) }}
          </li>
        </ul>
      </template>
      <template #[`item.actions`]="{ item }">
        <v-btn
          color="error"
          variant="text"
          size="small"
          prepend-icon="mdi-cancel"
          @click="openBlockDialog(item.key)"
        >
          Block
        </v-btn>
      </template>
    </v-data-table>

    <template v-if="data.blocked.length">
      <h3 class="text-subtitle-1 mb-2 mt-6">Blocked by negative grants</h3>
      <v-data-table
        :headers="blockedHeaders"
        :items="data.blocked"
        item-value="key"
        density="compact"
        hide-default-footer
        :items-per-page="-1"
      >
        <template #[`item.key`]="{ item }">
          <code class="text-error">{{ item.key }}</code>
        </template>
        <template #[`item.blockedBy`]="{ item }">
          {{ describeSource(item.blockedBy) }}
        </template>
        <template #[`item.overrides`]="{ item }">
          <span class="text-medium-emphasis">
            <template v-if="item.overriddenSources.length">
              {{ item.overriddenSources.map(describeSource).join('; ') }}
            </template>
            <template v-else>
              The user would not otherwise hold this claim; the block is pre-emptive.
            </template>
          </span>
        </template>
      </v-data-table>
    </template>
  </template>

  <!-- Block claim -->
  <v-dialog v-model="blockDialog.open" max-width="420">
    <v-card :title="`Block ${blockDialog.claimKey}`">
      <v-card-text>
        <p class="mb-3">
          Block <code>{{ blockDialog.claimKey }}</code> for
          <strong>{{ data?.user.username ?? data?.user.robloxUserId }}</strong
          >?
        </p>
        <v-textarea
          v-model="blockDialog.reason"
          label="Reason (required)"
          rows="2"
          density="comfortable"
        />
        <v-alert type="warning" density="compact" variant="tonal">
          A negative grant blocks this claim unconditionally and takes effect immediately, even if a
          group role or positive grant would provide it.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="blockDialog.open = false">Cancel</v-btn>
        <v-btn
          color="error"
          :disabled="blockDialog.reason.trim().length === 0"
          :loading="block.isPending.value"
          @click="block.mutate()"
        >
          Block
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar
    :model-value="mutationError !== null"
    color="error"
    @update:model-value="mutationError = null"
  >
    {{ mutationError }}
  </v-snackbar>
</template>
