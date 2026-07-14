<script setup lang="ts">
import type { ClaimKey, RankComparison } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import {
  createGrant,
  createMapping,
  deleteMapping,
  fetchAdminClaims,
  revokeGrant,
  type ClaimGrant,
} from '../../api/adminClaims';
import { ApiError } from '../../api/client';

const queryClient = useQueryClient();
const CLAIMS_QUERY_KEY = ['admin', 'claims'] as const;

const { data: claims, isPending } = useQuery({
  queryKey: CLAIMS_QUERY_KEY,
  queryFn: fetchAdminClaims,
});

const errorMessage = ref<string | null>(null);

function onMutationError(error: unknown) {
  errorMessage.value = error instanceof ApiError ? error.message : 'Request failed.';
}

function invalidate() {
  void queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY });
}

// --- Add mapping -----------------------------------------------------------

const comparisons: RankComparison[] = ['>=', '==', '<='];

const mappingDialog = reactive({
  open: false,
  claimKey: null as ClaimKey | null,
  groupId: '',
  comparison: '>=' as RankComparison,
  rankValue: '',
});

function openMappingDialog(claimKey: ClaimKey) {
  mappingDialog.open = true;
  mappingDialog.claimKey = claimKey;
  mappingDialog.groupId = '';
  mappingDialog.comparison = '>=';
  mappingDialog.rankValue = '';
}

const mappingValid = computed(
  () => Number(mappingDialog.groupId) > 0 && Number(mappingDialog.rankValue) >= 1,
);

const addMapping = useMutation({
  mutationFn: () =>
    createMapping(mappingDialog.claimKey as ClaimKey, {
      groupId: Number(mappingDialog.groupId),
      comparison: mappingDialog.comparison,
      rankValue: Number(mappingDialog.rankValue),
    }),
  onSuccess: () => {
    mappingDialog.open = false;
    invalidate();
  },
  onError: onMutationError,
});

const removeMapping = useMutation({
  mutationFn: (id: number) => deleteMapping(id),
  onSuccess: invalidate,
  onError: onMutationError,
});

// --- Add / revoke grants ---------------------------------------------------

const grantDialog = reactive({
  open: false,
  claimKey: null as ClaimKey | null,
  userId: '',
  isNegative: false,
  reason: '',
});

function openGrantDialog(claimKey: ClaimKey, isNegative: boolean) {
  grantDialog.open = true;
  grantDialog.claimKey = claimKey;
  grantDialog.userId = '';
  grantDialog.isNegative = isNegative;
  grantDialog.reason = '';
}

const grantValid = computed(
  () => Number(grantDialog.userId) > 0 && grantDialog.reason.trim().length > 0,
);

const addGrant = useMutation({
  mutationFn: () =>
    createGrant({
      userId: Number(grantDialog.userId),
      claimKey: grantDialog.claimKey as ClaimKey,
      isNegative: grantDialog.isNegative,
      reason: grantDialog.reason.trim(),
    }),
  onSuccess: () => {
    grantDialog.open = false;
    invalidate();
  },
  onError: onMutationError,
});

const revokeDialog = reactive({
  open: false,
  grant: null as ClaimGrant | null,
  reason: '',
});

function openRevokeDialog(grant: ClaimGrant) {
  revokeDialog.open = true;
  revokeDialog.grant = grant;
  revokeDialog.reason = '';
}

const revoke = useMutation({
  mutationFn: () => revokeGrant(revokeDialog.grant?.id ?? 0, revokeDialog.reason.trim()),
  onSuccess: () => {
    revokeDialog.open = false;
    invalidate();
  },
  onError: onMutationError,
});
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-expansion-panels v-else variant="accordion">
    <v-expansion-panel v-for="claim in claims" :key="claim.key">
      <v-expansion-panel-title>
        <code class="mr-3">{{ claim.key }}</code>
        <span class="text-medium-emphasis text-truncate">{{ claim.description }}</span>
        <v-spacer />
        <v-chip v-if="claim.mappings.length" size="x-small" class="mr-1" color="primary">
          {{ claim.mappings.length }} mapping{{ claim.mappings.length === 1 ? '' : 's' }}
        </v-chip>
        <v-chip v-if="claim.grants.length" size="x-small" class="mr-2" color="secondary">
          {{ claim.grants.length }} grant{{ claim.grants.length === 1 ? '' : 's' }}
        </v-chip>
      </v-expansion-panel-title>

      <v-expansion-panel-text>
        <div class="d-flex align-center mb-2">
          <span class="text-subtitle-2">Group mappings</span>
          <v-spacer />
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-plus"
            @click="openMappingDialog(claim.key)"
          >
            Add mapping
          </v-btn>
        </div>
        <v-table v-if="claim.mappings.length" density="compact" class="mb-4">
          <thead>
            <tr>
              <th>Group id</th>
              <th>Condition</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="mapping in claim.mappings" :key="mapping.id">
              <td>{{ mapping.groupId }}</td>
              <td>
                <code>rank {{ mapping.comparison }} {{ mapping.rankValue }}</code>
              </td>
              <td class="text-right">
                <v-btn
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  :disabled="removeMapping.isPending.value"
                  @click="removeMapping.mutate(mapping.id)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
        <p v-else class="text-medium-emphasis text-body-2 mb-4">No group mappings.</p>

        <div class="d-flex align-center mb-2">
          <span class="text-subtitle-2">Direct grants</span>
          <v-spacer />
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-account-plus"
            class="mr-2"
            @click="openGrantDialog(claim.key, false)"
          >
            Grant
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            color="error"
            prepend-icon="mdi-account-cancel"
            @click="openGrantDialog(claim.key, true)"
          >
            Block
          </v-btn>
        </div>
        <v-table v-if="claim.grants.length" density="compact">
          <thead>
            <tr>
              <th>User</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Granted by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="grant in claim.grants" :key="grant.id">
              <td>{{ grant.username ?? grant.userId }}</td>
              <td>
                <v-chip :color="grant.isNegative ? 'error' : 'success'" size="x-small">
                  {{ grant.isNegative ? 'negative' : 'positive' }}
                </v-chip>
              </td>
              <td>{{ grant.reason }}</td>
              <td>{{ grant.grantedByUsername ?? grant.grantedBy ?? 'system' }}</td>
              <td class="text-right">
                <v-btn size="x-small" variant="text" @click="openRevokeDialog(grant)">
                  Revoke
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
        <p v-else class="text-medium-emphasis text-body-2">No active direct grants.</p>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>

  <!-- Add mapping -->
  <v-dialog v-model="mappingDialog.open" max-width="420">
    <v-card :title="`Add mapping — ${mappingDialog.claimKey}`">
      <v-card-text>
        <v-text-field
          v-model="mappingDialog.groupId"
          label="ROBLOX group id"
          type="number"
          density="comfortable"
        />
        <v-select
          v-model="mappingDialog.comparison"
          :items="comparisons"
          label="Comparison"
          density="comfortable"
        />
        <v-text-field
          v-model="mappingDialog.rankValue"
          label="Rank value (1–255)"
          type="number"
          density="comfortable"
        />
        <p class="text-caption text-medium-emphasis">
          The claim is held when the user's rank in the group satisfies the condition. Multiple
          mappings for one claim are OR'd.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="mappingDialog.open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="!mappingValid"
          :loading="addMapping.isPending.value"
          @click="addMapping.mutate()"
        >
          Add
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Add grant -->
  <v-dialog v-model="grantDialog.open" max-width="420">
    <v-card :title="`${grantDialog.isNegative ? 'Block' : 'Grant'} ${grantDialog.claimKey}`">
      <v-card-text>
        <v-text-field
          v-model="grantDialog.userId"
          label="ROBLOX user id"
          type="number"
          density="comfortable"
        />
        <v-textarea
          v-model="grantDialog.reason"
          label="Reason (required)"
          rows="2"
          density="comfortable"
        />
        <v-alert v-if="grantDialog.isNegative" type="warning" density="compact" variant="tonal">
          A negative grant blocks this claim unconditionally and takes effect immediately, even if a
          group role or positive grant would provide it.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="grantDialog.open = false">Cancel</v-btn>
        <v-btn
          :color="grantDialog.isNegative ? 'error' : 'primary'"
          :disabled="!grantValid"
          :loading="addGrant.isPending.value"
          @click="addGrant.mutate()"
        >
          {{ grantDialog.isNegative ? 'Block' : 'Grant' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Revoke grant -->
  <v-dialog v-model="revokeDialog.open" max-width="420">
    <v-card title="Revoke grant">
      <v-card-text>
        <p class="mb-3">
          Revoke the {{ revokeDialog.grant?.isNegative ? 'negative' : 'positive' }} grant for
          <strong>{{ revokeDialog.grant?.username ?? revokeDialog.grant?.userId }}</strong
          >?
        </p>
        <v-textarea
          v-model="revokeDialog.reason"
          label="Reason (required)"
          rows="2"
          density="comfortable"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="revokeDialog.open = false">Cancel</v-btn>
        <v-btn
          color="error"
          :disabled="revokeDialog.reason.trim().length === 0"
          :loading="revoke.isPending.value"
          @click="revoke.mutate()"
        >
          Revoke
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar
    :model-value="errorMessage !== null"
    color="error"
    @update:model-value="errorMessage = null"
  >
    {{ errorMessage }}
  </v-snackbar>
</template>
