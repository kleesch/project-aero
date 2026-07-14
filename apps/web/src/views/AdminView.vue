<script setup lang="ts">
import { CLAIM_KEYS } from '@aero/shared';
import { ref } from 'vue';

import ClaimsAdminPanel from '../components/admin/ClaimsAdminPanel.vue';
import UserClaimsLookup from '../components/admin/UserClaimsLookup.vue';
import { useClaims } from '../composables/useClaims';

const { hasClaim, isPending } = useClaims();

const tab = ref('claims');
</script>

<template>
  <v-progress-linear v-if="isPending" indeterminate />

  <v-alert v-else-if="!hasClaim(CLAIM_KEYS.CLAIMS_MANAGE)" type="warning" variant="tonal">
    You need the <code>claims:manage</code> claim to use the admin tools. This page only renders the
    UI — every action is enforced server-side regardless.
  </v-alert>

  <template v-else>
    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="claims">Claims</v-tab>
      <v-tab value="lookup">User lookup</v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="claims">
        <ClaimsAdminPanel />
      </v-tabs-window-item>
      <v-tabs-window-item value="lookup">
        <UserClaimsLookup />
      </v-tabs-window-item>
    </v-tabs-window>
  </template>
</template>
