<script setup lang="ts">
import {
  CLAIM_KEYS,
  formatUserRef,
  RULING_PARTY_SIDES,
  RULING_STATUSES,
  type RulingPartyView,
} from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import { useRoute } from 'vue-router';

import { ApiError } from '../api/client';
import { fetchRuling } from '../api/rulings';
import AppealDialog from '../components/courts/AppealDialog.vue';
import RulingModerationDialog from '../components/courts/RulingModerationDialog.vue';
import PdfViewer from '../components/PdfViewer.vue';
import { useClaims } from '../composables/useClaims';
import { formatDate } from '../lib/bills';
import {
  formatParty,
  formatRulingDate,
  PARTY_SIDE_LABELS,
  partiesOnSide,
  RULING_STATUS_BANNERS,
  RULING_STATUS_META,
} from '../lib/courts';

const route = useRoute();
const { hasClaim } = useClaims();

const rulingId = computed(() => Number(route.params.id));

const {
  data: ruling,
  isPending,
  error,
} = useQuery({
  queryKey: computed(() => ['ruling', rulingId.value] as const),
  queryFn: () => fetchRuling(rulingId.value),
  retry: false,
});

const sides = Object.values(RULING_PARTY_SIDES);

const canAppeal = computed(
  () =>
    ruling.value !== undefined &&
    ruling.value.appeal === null &&
    ruling.value.status === RULING_STATUSES.ACTIVE &&
    hasClaim(CLAIM_KEYS.COURT_APPEAL_VERDICT),
);
const canExpunge = computed(
  () =>
    ruling.value !== undefined &&
    ruling.value.status === RULING_STATUSES.ACTIVE &&
    hasClaim(CLAIM_KEYS.COURT_EXPUNGE),
);
const canPardon = computed(
  () =>
    ruling.value !== undefined &&
    ruling.value.status === RULING_STATUSES.ACTIVE &&
    hasClaim(CLAIM_KEYS.COURT_PARDON),
);

const appealDialog = reactive({ open: false });
const moderationDialog = reactive({ open: false, action: 'expunge' as 'expunge' | 'pardon' });

function openModeration(action: 'expunge' | 'pardon') {
  moderationDialog.action = action;
  moderationDialog.open = true;
}

/** Government parties render distinctly — a flag icon, no profile link. */
function partyLink(
  party: RulingPartyView,
): { name: string; params: Record<string, number> } | null {
  if (party.partyType === 'user' && party.user) {
    return { name: 'user-profile', params: { robloxId: party.user.robloxUserId } };
  }
  if (party.partyType === 'business' && party.business) {
    return { name: 'business-detail', params: { id: party.business.id } };
  }
  return null;
}
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="error" type="error" variant="tonal">
    {{
      error instanceof ApiError && error.status === 404
        ? 'No such ruling.'
        : 'Failed to load the ruling.'
    }}
  </v-alert>

  <template v-else-if="ruling">
    <v-alert
      v-if="ruling.status !== RULING_STATUSES.ACTIVE"
      :color="RULING_STATUS_META[ruling.status].color"
      variant="tonal"
      :icon="ruling.status === 'pardoned' ? 'mdi-bird' : 'mdi-eraser'"
      class="mb-4"
    >
      {{ RULING_STATUS_BANNERS[ruling.status] }}
    </v-alert>

    <div class="d-flex align-center flex-wrap mb-1">
      <h1 class="text-h5 mr-3">Ruling of {{ formatRulingDate(ruling.rulingDate) }}</h1>
      <v-chip :color="RULING_STATUS_META[ruling.status].color" variant="tonal" class="mr-2">
        {{ RULING_STATUS_META[ruling.status].label }}
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="canAppeal"
        color="primary"
        prepend-icon="mdi-bank"
        class="mr-2"
        @click="appealDialog.open = true"
      >
        Enter appeal verdict
      </v-btn>
      <v-btn
        v-if="canExpunge"
        variant="tonal"
        color="warning"
        prepend-icon="mdi-eraser"
        class="mr-2"
        @click="openModeration('expunge')"
      >
        Expunge
      </v-btn>
      <v-btn
        v-if="canPardon"
        variant="tonal"
        color="purple"
        prepend-icon="mdi-bird"
        @click="openModeration('pardon')"
      >
        Pardon
      </v-btn>
    </div>

    <p class="text-body-2 text-medium-emphasis">
      Entered by {{ formatUserRef(ruling.enteredBy) }} on {{ formatDate(ruling.createdAt) }}
    </p>

    <v-row>
      <v-col cols="12" md="7">
        <v-card title="Parties" class="mb-4">
          <v-card-text>
            <v-row>
              <v-col v-for="side in sides" :key="side" cols="12" sm="6">
                <div class="text-subtitle-2 mb-2">{{ PARTY_SIDE_LABELS[side] }}s</div>
                <p
                  v-if="partiesOnSide(ruling.parties, side).length === 0"
                  class="text-caption text-medium-emphasis mb-0"
                >
                  None recorded.
                </p>
                <v-list density="compact" class="py-0">
                  <v-list-item
                    v-for="party in partiesOnSide(ruling.parties, side)"
                    :key="party.id"
                    :to="partyLink(party) ?? undefined"
                    :prepend-icon="
                      party.partyType === 'government'
                        ? 'mdi-flag'
                        : party.partyType === 'business'
                          ? 'mdi-store'
                          : 'mdi-account'
                    "
                    :class="party.partyType === 'government' ? 'government-party' : ''"
                  >
                    <v-list-item-title>{{ formatParty(party) }}</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-card title="Outcomes" class="mb-4">
          <v-card-text>
            <v-chip
              v-for="outcome in ruling.outcomes"
              :key="outcome.id"
              variant="tonal"
              color="primary"
              class="mr-2 mb-1"
              :title="outcome.description ?? undefined"
            >
              {{ outcome.name }}
            </v-chip>
          </v-card-text>
        </v-card>

        <v-card title="Supreme Court appeal">
          <v-card-text>
            <template v-if="ruling.appeal">
              <p class="text-body-2 text-medium-emphasis">
                Verdict entered by {{ formatUserRef(ruling.appeal.enteredBy) }} on
                {{ formatDate(ruling.appeal.enteredAt) }}
              </p>
              <div class="mb-3">
                <v-chip
                  v-for="outcome in ruling.appeal.outcomes"
                  :key="outcome.id"
                  variant="tonal"
                  color="secondary"
                  class="mr-2 mb-1"
                  :title="outcome.description ?? undefined"
                >
                  {{ outcome.name }}
                </v-chip>
              </div>
              <v-alert v-if="ruling.appeal.document.quarantinedAt" type="warning" variant="tonal">
                The verdict document is quarantined and not being served.
              </v-alert>
              <PdfViewer
                v-else
                :src="ruling.appeal.document.fileUrl"
                :title="`Appeal verdict — ruling ${ruling.id}`"
              />
            </template>
            <p v-else class="text-medium-emphasis mb-0">No appeal has been entered.</p>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="5">
        <v-card title="Judgment">
          <v-card-text>
            <v-alert v-if="ruling.document.quarantinedAt" type="warning" variant="tonal">
              The judgment document is quarantined and not being served.
            </v-alert>
            <PdfViewer
              v-else
              :src="ruling.document.fileUrl"
              :title="`Judgment — ruling ${ruling.id}`"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <AppealDialog v-model="appealDialog.open" :ruling-id="ruling.id" />
    <RulingModerationDialog
      v-model="moderationDialog.open"
      :ruling-id="ruling.id"
      :action="moderationDialog.action"
    />
  </template>
</template>

<style scoped>
.government-party {
  font-style: italic;
}
</style>
