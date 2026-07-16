<script setup lang="ts">
import {
  ALL_AUDIT_ACTION_KEYS,
  AUDIT_ENTITIES,
  CLAIM_KEYS,
  formatUserRef,
  type AuditActionKey,
  type AuditEntityType,
  type AuditEventView,
} from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { fetchAuditLog, restoreAuditEvent, type AuditLogFilters } from '../../api/audit';
import { ApiError } from '../../api/client';
import { useClaims } from '../../composables/useClaims';

const queryClient = useQueryClient();
const { hasClaim } = useClaims();

const PAGE_SIZE = 50;

const filters = reactive({
  actor: '',
  entityType: null as AuditEntityType | null,
  entityId: '',
  action: null as AuditActionKey | null,
  from: '',
  to: '',
});
const page = ref(1);

/** datetime-local values carry no zone; convert to the ISO the API expects. */
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const queryFilters = computed<AuditLogFilters>(() => ({
  actor: filters.actor.trim() || undefined,
  entityType: filters.entityType ?? undefined,
  entityId: filters.entityId.trim() || undefined,
  action: filters.action ?? undefined,
  from: toIso(filters.from),
  to: toIso(filters.to),
  limit: PAGE_SIZE,
  offset: (page.value - 1) * PAGE_SIZE,
}));

const { data, isPending, error } = useQuery({
  queryKey: ['admin', 'audit', queryFilters] as const,
  queryFn: () => fetchAuditLog(queryFilters.value),
  placeholderData: (previous) => previous,
});

const pageCount = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / PAGE_SIZE)));

function resetPage() {
  page.value = 1;
}

const errorMessage = ref<string | null>(null);

// --- Diff dialog -------------------------------------------------------------

const diffDialog = reactive({ open: false, event: null as AuditEventView | null });

function openDiff(event: AuditEventView) {
  diffDialog.open = true;
  diffDialog.event = event;
}

function pretty(value: Record<string, unknown> | null): string {
  return value === null ? '—' : JSON.stringify(value, null, 2);
}

// --- Restore -----------------------------------------------------------------

const restoreDialog = reactive({ open: false, event: null as AuditEventView | null, reason: '' });

function openRestore(event: AuditEventView) {
  restoreDialog.open = true;
  restoreDialog.event = event;
  restoreDialog.reason = '';
}

const restore = useMutation({
  mutationFn: () =>
    restoreAuditEvent(restoreDialog.event?.id ?? 0, restoreDialog.reason.trim()),
  onSuccess: () => {
    restoreDialog.open = false;
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  },
  onError: (mutationError: unknown) => {
    errorMessage.value =
      mutationError instanceof ApiError ? mutationError.message : 'Restore failed.';
  },
});

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <v-row dense class="mb-2">
    <v-col cols="12" sm="2">
      <v-text-field
        v-model="filters.actor"
        label="Actor (id or 'system')"
        density="compact"
        clearable
        hide-details
        @update:model-value="resetPage"
      />
    </v-col>
    <v-col cols="12" sm="3">
      <v-select
        v-model="filters.action"
        :items="[...ALL_AUDIT_ACTION_KEYS]"
        label="Action"
        density="compact"
        clearable
        hide-details
        @update:model-value="resetPage"
      />
    </v-col>
    <v-col cols="6" sm="2">
      <v-select
        v-model="filters.entityType"
        :items="Object.values(AUDIT_ENTITIES)"
        label="Entity type"
        density="compact"
        clearable
        hide-details
        @update:model-value="resetPage"
      />
    </v-col>
    <v-col cols="6" sm="1">
      <v-text-field
        v-model="filters.entityId"
        label="Entity id"
        density="compact"
        clearable
        hide-details
        @update:model-value="resetPage"
      />
    </v-col>
    <v-col cols="6" sm="2">
      <v-text-field
        v-model="filters.from"
        label="From"
        type="datetime-local"
        density="compact"
        hide-details
        @update:model-value="resetPage"
      />
    </v-col>
    <v-col cols="6" sm="2">
      <v-text-field
        v-model="filters.to"
        label="To"
        type="datetime-local"
        density="compact"
        hide-details
        @update:model-value="resetPage"
      />
    </v-col>
  </v-row>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-2">
    {{ error instanceof ApiError ? error.message : 'Failed to load the audit log.' }}
  </v-alert>
  <v-progress-linear v-else-if="isPending" indeterminate />

  <template v-if="data">
    <v-table density="compact">
      <thead>
        <tr>
          <th>When</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Entity</th>
          <th>Reason</th>
          <th class="text-right">Details</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in data.events" :key="event.id">
          <td class="text-no-wrap">{{ formatTimestamp(event.occurredAt) }}</td>
          <td>{{ formatUserRef(event.actor) }}</td>
          <td><code>{{ event.actionKey }}</code></td>
          <td>
            <code>{{ event.entityType }}#{{ event.entityId }}</code>
          </td>
          <td class="text-truncate" style="max-width: 200px">{{ event.reason ?? '' }}</td>
          <td class="text-right text-no-wrap">
            <v-btn size="x-small" variant="text" icon="mdi-file-compare" @click="openDiff(event)" />
            <v-btn
              v-if="event.restorable && hasClaim(CLAIM_KEYS.ADMIN)"
              size="x-small"
              variant="text"
              icon="mdi-backup-restore"
              @click="openRestore(event)"
            />
          </td>
        </tr>
        <tr v-if="data.events.length === 0">
          <td colspan="6" class="text-center text-medium-emphasis py-4">
            No audit events match the filters.
          </td>
        </tr>
      </tbody>
    </v-table>
    <div class="d-flex align-center justify-space-between mt-2">
      <span class="text-caption text-medium-emphasis">{{ data.total }} events</span>
      <v-pagination v-model="page" :length="pageCount" density="compact" total-visible="7" />
    </div>
  </template>

  <!-- Before/after diff -->
  <v-dialog v-model="diffDialog.open" max-width="900">
    <v-card v-if="diffDialog.event">
      <v-card-title>
        <code>{{ diffDialog.event.actionKey }}</code> —
        {{ diffDialog.event.entityType }}#{{ diffDialog.event.entityId }}
      </v-card-title>
      <v-card-subtitle>
        {{ formatUserRef(diffDialog.event.actor) }} ·
        {{ formatTimestamp(diffDialog.event.occurredAt) }}
        <template v-if="diffDialog.event.requestIp"> · {{ diffDialog.event.requestIp }}</template>
      </v-card-subtitle>
      <v-card-text>
        <p v-if="diffDialog.event.reason" class="mb-3">
          <strong>Reason:</strong> {{ diffDialog.event.reason }}
        </p>
        <v-row dense>
          <v-col cols="6">
            <div class="text-subtitle-2 mb-1">Before</div>
            <pre class="diff-pane">{{ pretty(diffDialog.event.before) }}</pre>
          </v-col>
          <v-col cols="6">
            <div class="text-subtitle-2 mb-1">After</div>
            <pre class="diff-pane">{{ pretty(diffDialog.event.after) }}</pre>
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="diffDialog.open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Restore from before snapshot -->
  <v-dialog v-model="restoreDialog.open" max-width="520">
    <v-card v-if="restoreDialog.event" title="Restore from audit">
      <v-card-text>
        <p class="mb-3">
          Re-apply the <strong>before</strong> snapshot of
          <code>{{ restoreDialog.event.entityType }}#{{ restoreDialog.event.entityId }}</code
          >? A deleted record is recreated with its original id; a changed record is overwritten.
          The restore is itself audited.
        </p>
        <pre class="diff-pane mb-3">{{ pretty(restoreDialog.event.before) }}</pre>
        <v-textarea
          v-model="restoreDialog.reason"
          label="Reason (required)"
          rows="2"
          density="comfortable"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="restoreDialog.open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="restoreDialog.reason.trim().length === 0"
          :loading="restore.isPending.value"
          @click="restore.mutate()"
        >
          Restore
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

<style scoped>
.diff-pane {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 4px;
  padding: 8px;
  font-size: 0.75rem;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
