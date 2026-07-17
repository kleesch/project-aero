<script setup lang="ts">
import {
  CHAMBERS,
  CLAIM_KEYS,
  CONGRESS_GROUP_ID,
  type Chamber,
  type RankComparison,
  type RosterRankRuleView,
} from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { ApiError } from '../../api/client';
import {
  createRankRule,
  deleteRankRule,
  fetchRankRules,
  fetchRosters,
  resyncRosters,
  updateRankRule,
} from '../../api/rosters';
import { useClaims } from '../../composables/useClaims';
import { CHAMBER_LABELS, formatDate } from '../../lib/bills';

/**
 * Congressional roster administration: which Congress-group ranks form each
 * chamber (rank rules, admin-only) plus the synced roster itself and the
 * force-resync action (roster:resync).
 */
const { hasClaim } = useClaims();
const queryClient = useQueryClient();

const errorMessage = ref<string | null>(null);

function onMutationError(error: unknown) {
  errorMessage.value = error instanceof ApiError ? error.message : 'Request failed.';
}

// --- Rank rules ---------------------------------------------------------------

const { data: rules } = useQuery({
  queryKey: ['admin', 'roster-rank-rules'],
  queryFn: fetchRankRules,
  enabled: hasClaim(CLAIM_KEYS.ADMIN),
});

const ruleDialog = reactive({
  open: false,
  editing: null as RosterRankRuleView | null,
  chamber: 'house' as Chamber,
  comparison: '>=' as RankComparison,
  rankValue: 1,
});

function openRuleDialog(rule?: RosterRankRuleView) {
  ruleDialog.editing = rule ?? null;
  ruleDialog.chamber = rule?.chamber ?? 'house';
  ruleDialog.comparison = rule?.comparison ?? '>=';
  ruleDialog.rankValue = rule?.rankValue ?? 1;
  ruleDialog.open = true;
}

function invalidateRules() {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'roster-rank-rules'] });
}

const saveRule = useMutation({
  mutationFn: () => {
    const payload = {
      chamber: ruleDialog.chamber,
      comparison: ruleDialog.comparison,
      rankValue: Number(ruleDialog.rankValue),
    };
    return ruleDialog.editing
      ? updateRankRule(ruleDialog.editing.id, payload)
      : createRankRule(payload);
  },
  onSuccess: () => {
    ruleDialog.open = false;
    invalidateRules();
  },
  onError: onMutationError,
});

const removeRule = useMutation({
  mutationFn: (id: number) => deleteRankRule(id),
  onSuccess: invalidateRules,
  onError: onMutationError,
});

const comparisonOptions = ['>=', '==', '<='] as const;
const chamberOptions = Object.values(CHAMBERS).map((chamber) => ({
  value: chamber,
  title: CHAMBER_LABELS[chamber],
}));

// --- Roster view ----------------------------------------------------------------

const rosterChamber = ref<Chamber>('house');
const { data: roster, isPending: rosterPending } = useQuery({
  queryKey: computed(() => ['rosters', rosterChamber.value] as const),
  queryFn: () => fetchRosters(rosterChamber.value),
});

const resync = useMutation({
  mutationFn: resyncRosters,
  onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['rosters'] }),
  onError: onMutationError,
});
</script>

<template>
  <v-row>
    <v-col v-if="hasClaim(CLAIM_KEYS.ADMIN)" cols="12" md="5">
      <v-card title="Rank rules">
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis">
            Which ranks in the Congress group ({{ CONGRESS_GROUP_ID }}) belong to each chamber.
            Rules per chamber are OR'd; with none, the daily sync classifies nobody.
          </p>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Chamber</th>
                <th>Rule</th>
                <th class="text-right">
                  <v-btn size="x-small" variant="tonal" icon="mdi-plus" @click="openRuleDialog()" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rule in rules" :key="rule.id">
                <td>{{ CHAMBER_LABELS[rule.chamber] }}</td>
                <td>
                  <code>rank {{ rule.comparison }} {{ rule.rankValue }}</code>
                </td>
                <td class="text-right text-no-wrap">
                  <v-btn
                    size="x-small"
                    variant="text"
                    icon="mdi-pencil"
                    @click="openRuleDialog(rule)"
                  />
                  <v-btn
                    size="x-small"
                    variant="text"
                    icon="mdi-delete"
                    color="error"
                    :loading="removeRule.isPending.value"
                    @click="removeRule.mutate(rule.id)"
                  />
                </td>
              </tr>
              <tr v-if="rules && rules.length === 0">
                <td colspan="3" class="text-center text-medium-emphasis py-3">
                  No rules yet — the roster sync is inert.
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" :md="hasClaim(CLAIM_KEYS.ADMIN) ? 7 : 12">
      <v-card>
        <v-card-title class="d-flex align-center">
          Roster
          <v-btn-toggle v-model="rosterChamber" density="compact" mandatory class="ml-4">
            <v-btn value="house" size="small">House</v-btn>
            <v-btn value="senate" size="small">Senate</v-btn>
          </v-btn-toggle>
          <v-spacer />
          <v-btn
            v-if="hasClaim(CLAIM_KEYS.ROSTER_RESYNC)"
            size="small"
            variant="tonal"
            prepend-icon="mdi-sync"
            :loading="resync.isPending.value"
            @click="resync.mutate()"
          >
            Force resync
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-progress-linear v-if="rosterPending" indeterminate />
          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>Member</th>
                <th>Rank</th>
                <th>Status</th>
                <th>Last confirmed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in roster" :key="member.robloxUserId">
                <td>{{ member.username ?? `user #${member.robloxUserId}` }}</td>
                <td>{{ member.rank }}</td>
                <td>
                  <v-chip :color="member.active ? 'success' : 'grey'" size="x-small">
                    {{ member.active ? 'active' : 'inactive' }}
                  </v-chip>
                </td>
                <td class="text-no-wrap text-medium-emphasis">
                  {{ formatDate(member.lastConfirmedAt) }}
                </td>
              </tr>
              <tr v-if="roster && roster.length === 0">
                <td colspan="4" class="text-center text-medium-emphasis py-3">
                  Roster is empty — configure rank rules, then resync.
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <!-- Rank rule create/edit -->
  <v-dialog v-model="ruleDialog.open" max-width="420">
    <v-card :title="ruleDialog.editing ? 'Edit rank rule' : 'New rank rule'">
      <v-card-text>
        <v-select
          v-model="ruleDialog.chamber"
          :items="chamberOptions"
          label="Chamber"
          density="comfortable"
        />
        <v-select
          v-model="ruleDialog.comparison"
          :items="[...comparisonOptions]"
          label="Comparison"
          density="comfortable"
        />
        <v-text-field
          v-model.number="ruleDialog.rankValue"
          label="Rank value (1–255)"
          type="number"
          density="comfortable"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="ruleDialog.open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="saveRule.isPending.value" @click="saveRule.mutate()">
          Save
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
