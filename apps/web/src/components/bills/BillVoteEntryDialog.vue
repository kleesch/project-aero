<script setup lang="ts">
import {
  ALL_VOTE_POSITIONS,
  formatUserRef,
  type BillStageEventView,
  type Chamber,
  type VotePosition,
} from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';

import { recordVotes } from '../../api/bills';
import { ApiError } from '../../api/client';
import { fetchRosters } from '../../api/rosters';
import { CHAMBER_LABELS, POSITION_LABELS } from '../../lib/bills';

/**
 * Roster-driven bulk vote entry for one stage event. Rows come from the
 * stage chamber's active roster plus anyone who already has a recorded vote;
 * changed positions supersede the previous record server-side. Members
 * missing from the roster (it may lag reality) need explicit confirmation.
 */
const props = defineProps<{
  billId: number;
  event: BillStageEventView;
  chamber: Chamber;
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ recorded: [] }>();

const queryClient = useQueryClient();

const { data: roster } = useQuery({
  queryKey: computed(() => ['rosters', props.chamber] as const),
  queryFn: () => fetchRosters(props.chamber),
});

interface VoteRow {
  robloxUserId: number;
  name: string;
  onRoster: boolean;
}

const positions = reactive(new Map<number, VotePosition | null>());
const extraMembers = ref<VoteRow[]>([]);
const extraMemberId = ref<string>('');
const confirmOffRoster = ref(false);
const errorMessage = ref<string | null>(null);
const offRosterWarning = ref<number[] | null>(null);

const rows = computed<VoteRow[]>(() => {
  const active = (roster.value ?? [])
    .filter((member) => member.active)
    .map((member) => ({
      robloxUserId: member.robloxUserId,
      name: member.username ?? `user #${member.robloxUserId}`,
      onRoster: true,
    }));
  const known = new Set(active.map((row) => row.robloxUserId));
  // Existing votes from members since departed (or recorded off-roster).
  const voted = props.event.votes
    .filter((vote) => !known.has(vote.member.robloxUserId))
    .map((vote) => ({
      robloxUserId: vote.member.robloxUserId,
      name: formatUserRef(vote.member),
      onRoster: false,
    }));
  const extras = extraMembers.value.filter(
    (row) =>
      !known.has(row.robloxUserId) && !voted.some((v) => v.robloxUserId === row.robloxUserId),
  );
  return [...active, ...voted, ...extras];
});

// Re-seed the position map from live votes whenever the dialog opens.
watch(
  () => open.value,
  (isOpen) => {
    if (!isOpen) return;
    positions.clear();
    extraMembers.value = [];
    confirmOffRoster.value = false;
    offRosterWarning.value = null;
    errorMessage.value = null;
    for (const vote of props.event.votes) {
      positions.set(vote.member.robloxUserId, vote.position);
    }
  },
  { immediate: true },
);

const hasOffRosterEntries = computed(() =>
  rows.value.some((row) => !row.onRoster && positions.get(row.robloxUserId) != null),
);

function addExtraMember() {
  const id = Number(extraMemberId.value);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!rows.value.some((row) => row.robloxUserId === id)) {
    extraMembers.value.push({ robloxUserId: id, name: `user #${id}`, onRoster: false });
  }
  extraMemberId.value = '';
}

const positionOptions = ALL_VOTE_POSITIONS.map((position) => ({
  value: position,
  title: POSITION_LABELS[position],
}));

const submit = useMutation({
  mutationFn: () => {
    const votes = rows.value.flatMap((row) => {
      const position = positions.get(row.robloxUserId);
      return position ? [{ robloxUserId: row.robloxUserId, position }] : [];
    });
    return recordVotes(props.billId, props.event.id, {
      votes,
      confirmOffRoster: confirmOffRoster.value,
    });
  },
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['bill'] });
    open.value = false;
    emit('recorded');
  },
  onError: (error: unknown) => {
    if (error instanceof ApiError && error.status === 422 && /roster/i.test(error.message)) {
      offRosterWarning.value = [];
      errorMessage.value = null;
      return;
    }
    errorMessage.value = error instanceof ApiError ? error.message : 'Recording failed.';
  },
});

const anyPositionSet = computed(() =>
  rows.value.some((row) => positions.get(row.robloxUserId) != null),
);
</script>

<template>
  <v-dialog v-model="open" max-width="640">
    <v-card :title="`Record votes — ${CHAMBER_LABELS[chamber]}`">
      <v-card-text>
        <v-table density="compact">
          <thead>
            <tr>
              <th>Member</th>
              <th style="width: 180px">Position</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.robloxUserId">
              <td>
                {{ row.name }}
                <v-chip v-if="!row.onRoster" size="x-small" color="warning" class="ml-1">
                  off roster
                </v-chip>
              </td>
              <td>
                <v-select
                  :model-value="positions.get(row.robloxUserId) ?? null"
                  :items="positionOptions"
                  density="compact"
                  hide-details
                  clearable
                  placeholder="—"
                  @update:model-value="(value) => positions.set(row.robloxUserId, value)"
                />
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="2" class="text-center text-medium-emphasis py-4">
                The {{ CHAMBER_LABELS[chamber] }} roster is empty — sync rosters or add members
                below.
              </td>
            </tr>
          </tbody>
        </v-table>

        <div class="d-flex align-center mt-3">
          <v-text-field
            v-model="extraMemberId"
            label="Add member by ROBLOX id"
            density="compact"
            type="number"
            hide-details
            class="mr-2"
            @keyup.enter="addExtraMember"
          />
          <v-btn size="small" variant="tonal" @click="addExtraMember">Add</v-btn>
        </div>

        <v-checkbox
          v-if="hasOffRosterEntries || offRosterWarning !== null"
          v-model="confirmOffRoster"
          color="warning"
          density="compact"
          label="Confirm recording votes for members missing from the active roster (it may lag reality)"
          hide-details
          class="mt-2"
        />
        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-3">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="!anyPositionSet"
          :loading="submit.isPending.value"
          @click="submit.mutate()"
        >
          Record votes
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
