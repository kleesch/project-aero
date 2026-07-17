<script setup lang="ts">
import {
  chamberForBillStage,
  claimForBillTransition,
  CLAIM_KEYS,
  formatUserRef,
  isTerminalBillStatus,
  STAGE_FOR_STATUS,
  type BillStageEventView,
} from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import { fetchBill, updateBillTags, uploadBillVersion } from '../api/bills';
import { ApiError } from '../api/client';
import { uploadDocument } from '../api/documents';
import { fetchTags } from '../api/tags';
import BillTransitionDialog from '../components/bills/BillTransitionDialog.vue';
import BillVoteEntryDialog from '../components/bills/BillVoteEntryDialog.vue';
import PdfViewer from '../components/PdfViewer.vue';
import { useClaims } from '../composables/useClaims';
import {
  CHAMBER_LABELS,
  formatDate,
  OUTCOME_LABELS,
  POSITION_COLORS,
  POSITION_LABELS,
  STAGE_LABELS,
  STATUS_META,
} from '../lib/bills';

const route = useRoute();
const { hasClaim } = useClaims();
const queryClient = useQueryClient();

const billRef = computed(() => String(route.params.ref ?? ''));

const {
  data: bill,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ['bill', billRef.value] as const),
  queryFn: () => fetchBill(billRef.value),
  retry: false,
});

const errorMessage = ref<string | null>(null);

function invalidateBill() {
  void queryClient.invalidateQueries({ queryKey: ['bill'] });
  void queryClient.invalidateQueries({ queryKey: ['bills'] });
}

// --- Claim-gated affordances -------------------------------------------------

const transitionClaim = computed(() =>
  bill.value ? claimForBillTransition(bill.value.status, bill.value.chamber) : null,
);
const canTransition = computed(
  () =>
    bill.value !== undefined &&
    bill.value.legalNextStatuses.length > 0 &&
    transitionClaim.value !== null &&
    hasClaim(transitionClaim.value),
);
const canUploadVersion = computed(
  () =>
    bill.value !== undefined &&
    !isTerminalBillStatus(bill.value.status) &&
    hasClaim(CLAIM_KEYS.BILL_SUBMIT),
);
const canEditTags = computed(() => hasClaim(CLAIM_KEYS.BILL_SUBMIT));

function voteChamber(event: BillStageEventView) {
  return bill.value ? chamberForBillStage(event.stage, bill.value.chamber) : null;
}

function canRecordVotes(event: BillStageEventView): boolean {
  if (!event.acceptsVotes) return false;
  const chamber = voteChamber(event);
  if (!chamber) return false;
  const claim =
    chamber === 'house' ? CLAIM_KEYS.BILL_VOTE_UPDATE_HOUSE : CLAIM_KEYS.BILL_VOTE_UPDATE_SENATE;
  return hasClaim(claim) || hasClaim(CLAIM_KEYS.ADMIN);
}

const currentStage = computed(() => {
  if (!bill.value) return null;
  const stage = STAGE_FOR_STATUS[bill.value.status];
  if (!stage) return null;
  const chamber = chamberForBillStage(stage, bill.value.chamber);
  return {
    label: STAGE_LABELS[stage],
    chamber: chamber ? CHAMBER_LABELS[chamber] : 'The President',
  };
});

// --- Dialogs ------------------------------------------------------------------

const transitionDialog = reactive({ open: false });
const voteDialog = reactive({ open: false, event: null as BillStageEventView | null });

function openVoteDialog(event: BillStageEventView) {
  voteDialog.event = event;
  voteDialog.open = true;
}

// --- New version upload --------------------------------------------------------

const versionInput = ref<HTMLInputElement | null>(null);
const versionUpload = useMutation({
  mutationFn: async (file: File) => {
    const document = await uploadDocument(file);
    return uploadBillVersion(bill.value!.id, document.id);
  },
  onSuccess: invalidateBill,
  onError: (mutationError: unknown) => {
    errorMessage.value =
      mutationError instanceof ApiError ? mutationError.message : 'Version upload failed.';
  },
});

function onVersionPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) versionUpload.mutate(file);
  input.value = '';
}

// --- Tag editing ----------------------------------------------------------------

const { data: allTags } = useQuery({ queryKey: ['tags'], queryFn: fetchTags });
const tagDialog = reactive({ open: false, tagIds: [] as number[] });
const tagOptions = computed(
  () => allTags.value?.map((tag) => ({ value: tag.id, title: tag.name })) ?? [],
);

function openTagDialog() {
  tagDialog.tagIds = bill.value?.tags.map((tag) => tag.id) ?? [];
  tagDialog.open = true;
}

const saveTags = useMutation({
  mutationFn: () => updateBillTags(bill.value!.id, tagDialog.tagIds),
  onSuccess: () => {
    tagDialog.open = false;
    invalidateBill();
  },
  onError: (mutationError: unknown) => {
    errorMessage.value =
      mutationError instanceof ApiError ? mutationError.message : 'Updating tags failed.';
  },
});

// --- Versions -------------------------------------------------------------------

const selectedVersion = ref<number | null>(null);
const shownVersion = computed(() => {
  if (!bill.value || bill.value.versions.length === 0) return null;
  return (
    bill.value.versions.find((version) => version.versionNo === selectedVersion.value) ??
    bill.value.versions.at(-1)!
  );
});
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="error" type="error" variant="tonal">
    {{
      error instanceof ApiError && error.status === 404
        ? 'No such bill.'
        : 'Failed to load the bill.'
    }}
  </v-alert>

  <template v-else-if="bill">
    <div class="d-flex align-center flex-wrap mb-1">
      <h1 class="text-h5 mr-3">{{ bill.displayId }}</h1>
      <v-chip :color="STATUS_META[bill.status].color" variant="tonal" class="mr-2">
        {{ STATUS_META[bill.status].label }}
      </v-chip>
      <v-chip v-for="tag in bill.tags" :key="tag.id" size="small" variant="outlined" class="mr-1">
        {{ tag.name }}
      </v-chip>
      <v-btn
        v-if="canEditTags"
        size="x-small"
        variant="text"
        icon="mdi-tag-edit"
        title="Edit tags"
        @click="openTagDialog"
      />
      <v-spacer />
      <v-btn
        v-if="canTransition"
        color="primary"
        prepend-icon="mdi-gavel"
        class="mr-2"
        @click="transitionDialog.open = true"
      >
        Declare outcome
      </v-btn>
      <v-btn
        v-if="canUploadVersion"
        variant="tonal"
        prepend-icon="mdi-file-upload"
        :loading="versionUpload.isPending.value"
        @click="versionInput?.click()"
      >
        New version
      </v-btn>
      <input
        ref="versionInput"
        type="file"
        accept="application/pdf"
        class="d-none"
        @change="onVersionPicked"
      />
    </div>

    <p class="text-h6 font-weight-regular mb-1">{{ bill.title }}</p>
    <p class="text-body-2 text-medium-emphasis">
      {{ CHAMBER_LABELS[bill.chamber] }} bill · session {{ bill.session }} · submitted by
      {{ formatUserRef(bill.submittedBy) }} on {{ formatDate(bill.createdAt) }}
    </p>

    <v-alert v-if="currentStage" type="info" variant="tonal" density="compact" class="mb-4">
      Awaiting outcome: <strong>{{ currentStage.label }}</strong> ({{ currentStage.chamber }}).
    </v-alert>

    <v-row>
      <v-col cols="12" md="7">
        <v-card title="Pipeline">
          <v-card-text>
            <p v-if="bill.stageEvents.length === 0" class="text-medium-emphasis mb-0">
              No stage outcomes yet — the bill sits in committee.
            </p>
            <v-timeline v-else side="end" density="comfortable" truncate-line="both">
              <v-timeline-item
                v-for="event in bill.stageEvents"
                :key="event.id"
                :dot-color="STATUS_META[event.outcome].color"
                size="small"
              >
                <div class="d-flex align-center flex-wrap">
                  <strong class="mr-2">{{ STAGE_LABELS[event.stage] }}</strong>
                  <v-chip size="x-small" :color="STATUS_META[event.outcome].color" variant="tonal">
                    {{ OUTCOME_LABELS[event.outcome] }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ formatUserRef(event.decidedBy) }} · {{ formatDate(event.decidedAt) }}
                </div>
                <p v-if="event.notes" class="text-body-2 mt-1 mb-1">{{ event.notes }}</p>

                <template v-if="event.acceptsVotes">
                  <div class="d-flex align-center mt-1">
                    <v-chip
                      v-for="(count, position) in event.tally"
                      :key="position"
                      size="x-small"
                      :color="POSITION_COLORS[position]"
                      variant="tonal"
                      class="mr-1"
                    >
                      {{ POSITION_LABELS[position] }}: {{ count }}
                    </v-chip>
                    <v-btn
                      v-if="canRecordVotes(event)"
                      size="x-small"
                      variant="text"
                      prepend-icon="mdi-vote"
                      @click="openVoteDialog(event)"
                    >
                      Record votes
                    </v-btn>
                  </div>
                  <v-expansion-panels
                    v-if="event.votes.length > 0"
                    class="mt-2"
                    variant="accordion"
                  >
                    <v-expansion-panel :title="`Per-member votes (${event.votes.length})`">
                      <v-expansion-panel-text>
                        <v-table density="compact">
                          <tbody>
                            <tr v-for="vote in event.votes" :key="vote.member.robloxUserId">
                              <td>{{ formatUserRef(vote.member) }}</td>
                              <td>
                                <v-chip
                                  size="x-small"
                                  :color="POSITION_COLORS[vote.position]"
                                  variant="tonal"
                                >
                                  {{ POSITION_LABELS[vote.position] }}
                                </v-chip>
                              </td>
                              <td class="text-caption text-medium-emphasis">
                                recorded by {{ formatUserRef(vote.recordedBy) }}
                              </td>
                            </tr>
                          </tbody>
                        </v-table>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </template>
              </v-timeline-item>
            </v-timeline>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="5">
        <v-card title="Document">
          <v-card-text>
            <v-select
              :model-value="shownVersion?.versionNo ?? null"
              :items="
                bill.versions.map((version) => ({
                  value: version.versionNo,
                  title: `Version ${version.versionNo} — ${formatDate(version.createdAt)} by ${formatUserRef(version.uploadedBy)}`,
                }))
              "
              label="Version"
              density="compact"
              hide-details
              class="mb-3"
              @update:model-value="(value) => (selectedVersion = value)"
            />
            <v-alert
              v-if="shownVersion?.document.quarantinedAt"
              type="warning"
              variant="tonal"
              class="mb-3"
            >
              This version's document is quarantined and not being served.
            </v-alert>
            <PdfViewer
              v-else-if="shownVersion"
              :src="shownVersion.document.fileUrl"
              :title="`${bill.displayId} v${shownVersion.versionNo}`"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <BillTransitionDialog v-model="transitionDialog.open" :bill="bill" />
    <BillVoteEntryDialog
      v-if="voteDialog.event && voteChamber(voteDialog.event)"
      v-model="voteDialog.open"
      :bill-id="bill.id"
      :event="voteDialog.event"
      :chamber="voteChamber(voteDialog.event)!"
    />

    <!-- Tag editing -->
    <v-dialog v-model="tagDialog.open" max-width="480">
      <v-card title="Edit tags">
        <v-card-text>
          <v-select
            v-model="tagDialog.tagIds"
            :items="tagOptions"
            label="Tags"
            multiple
            chips
            closable-chips
            density="comfortable"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="tagDialog.open = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saveTags.isPending.value" @click="saveTags.mutate()">
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
</template>
