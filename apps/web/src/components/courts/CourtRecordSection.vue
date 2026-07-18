<script setup lang="ts">
import type { RulingListItemView } from '@aero/shared';
import { useRouter } from 'vue-router';

import {
  formatParty,
  formatRulingDate,
  PARTY_SIDE_LABELS,
  RULING_STATUS_META,
} from '../../lib/courts';

/**
 * The court-record section shared by profile and business pages. The API
 * already applied the visibility rule; non-active statuses only ever appear
 * here for privileged viewers, so the status chip doubles as the flag.
 */
defineProps<{ items: RulingListItemView[] | undefined; isPending: boolean }>();

const router = useRouter();

function openRuling(id: number) {
  void router.push({ name: 'ruling-detail', params: { id } });
}
</script>

<template>
  <v-card title="Court record">
    <v-progress-linear v-if="isPending" indeterminate />
    <v-card-text v-else-if="items && items.length === 0" class="text-medium-emphasis">
      No court records.
    </v-card-text>
    <v-table v-else-if="items" hover>
      <thead>
        <tr>
          <th>Date</th>
          <th>Parties</th>
          <th>Outcomes</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="ruling in items"
          :key="ruling.id"
          class="cursor-pointer"
          @click="openRuling(ruling.id)"
        >
          <td class="text-no-wrap">{{ formatRulingDate(ruling.rulingDate) }}</td>
          <td>
            <span v-for="(party, index) in ruling.parties" :key="party.id">
              <template v-if="index > 0">, </template>
              {{ formatParty(party) }}
              <span class="text-caption text-medium-emphasis">
                ({{ PARTY_SIDE_LABELS[party.side] }})
              </span>
            </span>
          </td>
          <td>
            <v-chip
              v-for="outcome in ruling.outcomes"
              :key="outcome.id"
              size="x-small"
              variant="outlined"
              class="mr-1"
            >
              {{ outcome.name }}
            </v-chip>
          </td>
          <td>
            <v-chip :color="RULING_STATUS_META[ruling.status].color" size="small" variant="tonal">
              {{ RULING_STATUS_META[ruling.status].label }}
            </v-chip>
            <v-icon
              v-if="ruling.hasAppeal"
              icon="mdi-gavel"
              size="small"
              class="ml-1"
              title="Appealed"
            />
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
