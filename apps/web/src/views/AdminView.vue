<script setup lang="ts">
import { CLAIM_KEYS } from '@aero/shared';
import { computed, ref } from 'vue';

import AuditLogPanel from '../components/admin/AuditLogPanel.vue';
import ClaimsAdminPanel from '../components/admin/ClaimsAdminPanel.vue';
import DocumentsAdminPanel from '../components/admin/DocumentsAdminPanel.vue';
import OutcomesAdminPanel from '../components/admin/OutcomesAdminPanel.vue';
import RostersAdminPanel from '../components/admin/RostersAdminPanel.vue';
import TagsAdminPanel from '../components/admin/TagsAdminPanel.vue';
import UserClaimsLookup from '../components/admin/UserClaimsLookup.vue';
import { useClaims } from '../composables/useClaims';

const { hasClaim, isPending } = useClaims();

/** Tabs appear per claim; the server enforces every action regardless. */
const tabs = computed(() =>
  [
    { value: 'claims', label: 'Claims', show: hasClaim(CLAIM_KEYS.CLAIMS_MANAGE) },
    { value: 'lookup', label: 'User lookup', show: hasClaim(CLAIM_KEYS.CLAIMS_MANAGE) },
    { value: 'audit', label: 'Audit log', show: hasClaim(CLAIM_KEYS.AUDIT_VIEW) },
    { value: 'documents', label: 'Documents', show: hasClaim(CLAIM_KEYS.ADMIN) },
    {
      value: 'rosters',
      label: 'Rosters',
      show: hasClaim(CLAIM_KEYS.ADMIN) || hasClaim(CLAIM_KEYS.ROSTER_RESYNC),
    },
    { value: 'tags', label: 'Tags', show: hasClaim(CLAIM_KEYS.TAGS_MANAGE) },
    { value: 'outcomes', label: 'Ruling outcomes', show: hasClaim(CLAIM_KEYS.TAGS_MANAGE) },
  ].filter((tab) => tab.show),
);

const tab = ref<string | null>(null);
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="tabs.length === 0" type="warning" variant="tonal">
    You need an admin claim (<code>claims:manage</code>, <code>audit:view</code>, or
    <code>admin</code>) to use the admin tools. This page only renders the UI — every action is
    enforced server-side regardless.
  </v-alert>

  <template v-else>
    <v-tabs v-model="tab" class="mb-4">
      <v-tab v-for="entry in tabs" :key="entry.value" :value="entry.value">
        {{ entry.label }}
      </v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="claims">
        <ClaimsAdminPanel />
      </v-tabs-window-item>
      <v-tabs-window-item value="lookup">
        <UserClaimsLookup />
      </v-tabs-window-item>
      <v-tabs-window-item value="audit">
        <AuditLogPanel />
      </v-tabs-window-item>
      <v-tabs-window-item value="documents">
        <DocumentsAdminPanel />
      </v-tabs-window-item>
      <v-tabs-window-item value="rosters">
        <RostersAdminPanel />
      </v-tabs-window-item>
      <v-tabs-window-item value="tags">
        <TagsAdminPanel />
      </v-tabs-window-item>
      <v-tabs-window-item value="outcomes">
        <OutcomesAdminPanel />
      </v-tabs-window-item>
    </v-tabs-window>
  </template>
</template>
