<script setup lang="ts">
import { CLAIM_KEYS, type BusinessDetailView, type BusinessLicenseView } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';

import { fetchLicenseTypes, grantLicense, revokeLicense, updateLicense } from '../../api/businesses';
import { ApiError } from '../../api/client';
import { useClaims } from '../../composables/useClaims';
import { formatDate } from '../../lib/bills';
import { LICENSE_STATUS_META } from '../../lib/businesses';

/**
 * License section of the business page: public read for everyone, grant /
 * expiry update / revoke affordances for `business:license-grant` holders.
 */
const props = defineProps<{ business: BusinessDetailView }>();

const emit = defineEmits<{ changed: [business: BusinessDetailView] }>();

const { hasClaim } = useClaims();
const canManage = computed(() => hasClaim(CLAIM_KEYS.BUSINESS_LICENSE_GRANT));

const queryClient = useQueryClient();
const errorMessage = ref<string | null>(null);

function onMutationError(error: unknown) {
  errorMessage.value = error instanceof ApiError ? error.message : 'Request failed.';
}

function onChanged(business: BusinessDetailView) {
  void queryClient.invalidateQueries({ queryKey: ['businesses'] });
  emit('changed', business);
}

const { data: licenseTypes } = useQuery({
  queryKey: ['business-license-types'],
  queryFn: fetchLicenseTypes,
  enabled: canManage,
});

// --- Grant -------------------------------------------------------------------

const grantDialog = reactive({ open: false, licenseTypeId: null as number | null, expiresAt: '' });

function openGrant() {
  grantDialog.licenseTypeId = null;
  grantDialog.expiresAt = '';
  errorMessage.value = null;
  grantDialog.open = true;
}

const grant = useMutation({
  mutationFn: () =>
    grantLicense(props.business.id, {
      licenseTypeId: grantDialog.licenseTypeId!,
      ...(grantDialog.expiresAt
        ? { expiresAt: new Date(grantDialog.expiresAt).toISOString() }
        : {}),
    }),
  onSuccess: (business) => {
    grantDialog.open = false;
    onChanged(business);
  },
  onError: onMutationError,
});

const typeOptions = computed(
  () => licenseTypes.value?.map((type) => ({ value: type.id, title: type.name })) ?? [],
);

// --- Expiry update -------------------------------------------------------------

const expiryDialog = reactive({
  open: false,
  license: null as BusinessLicenseView | null,
  expiresAt: '',
});

function openExpiry(license: BusinessLicenseView) {
  expiryDialog.license = license;
  expiryDialog.expiresAt = license.expiresAt ? license.expiresAt.slice(0, 10) : '';
  errorMessage.value = null;
  expiryDialog.open = true;
}

const updateExpiry = useMutation({
  mutationFn: () =>
    updateLicense(props.business.id, expiryDialog.license!.id, {
      expiresAt: expiryDialog.expiresAt
        ? new Date(expiryDialog.expiresAt).toISOString()
        : null,
    }),
  onSuccess: (business) => {
    expiryDialog.open = false;
    onChanged(business);
  },
  onError: onMutationError,
});

// --- Revoke ---------------------------------------------------------------------

const revokeDialog = reactive({
  open: false,
  license: null as BusinessLicenseView | null,
  reason: '',
});

function openRevoke(license: BusinessLicenseView) {
  revokeDialog.license = license;
  revokeDialog.reason = '';
  errorMessage.value = null;
  revokeDialog.open = true;
}

const revoke = useMutation({
  mutationFn: () =>
    revokeLicense(props.business.id, revokeDialog.license!.id, revokeDialog.reason.trim()),
  onSuccess: (business) => {
    revokeDialog.open = false;
    onChanged(business);
  },
  onError: onMutationError,
});
</script>

<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center">
      Licenses
      <v-spacer />
      <v-btn
        v-if="canManage"
        size="small"
        variant="tonal"
        prepend-icon="mdi-license"
        @click="openGrant"
      >
        Grant license
      </v-btn>
    </v-card-title>
    <v-card-text>
      <v-table v-if="business.licenses.length > 0" density="compact">
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Granted</th>
            <th>Expires</th>
            <th v-if="canManage" class="text-right" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="license in business.licenses" :key="license.id">
            <td class="font-weight-bold">{{ license.licenseType.name }}</td>
            <td>
              <v-chip
                :color="LICENSE_STATUS_META[license.status].color"
                :prepend-icon="LICENSE_STATUS_META[license.status].icon"
                size="small"
                variant="tonal"
              >
                {{ LICENSE_STATUS_META[license.status].label }}
              </v-chip>
              <v-tooltip
                v-if="license.status === 'revoked' && license.revokeReason"
                activator="parent"
                location="top"
              >
                {{ license.revokeReason }}
              </v-tooltip>
            </td>
            <td class="text-medium-emphasis text-no-wrap">
              {{ formatDate(license.grantedAt) }}
            </td>
            <td class="text-medium-emphasis text-no-wrap">
              {{ license.expiresAt ? formatDate(license.expiresAt) : 'Never' }}
            </td>
            <td v-if="canManage" class="text-right text-no-wrap">
              <template v-if="license.status === 'active'">
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-calendar-edit"
                  title="Change expiry"
                  @click="openExpiry(license)"
                />
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-cancel"
                  color="error"
                  title="Revoke"
                  @click="openRevoke(license)"
                />
              </template>
            </td>
          </tr>
        </tbody>
      </v-table>
      <p v-else class="text-body-2 text-medium-emphasis mb-0">
        No licenses on record for this business.
      </p>
    </v-card-text>
  </v-card>

  <v-dialog v-model="grantDialog.open" max-width="460">
    <v-card title="Grant a license">
      <v-card-text>
        <v-select
          v-model="grantDialog.licenseTypeId"
          :items="typeOptions"
          label="License type"
          density="comfortable"
          class="mb-2"
        />
        <v-text-field
          v-model="grantDialog.expiresAt"
          label="Expires (optional)"
          type="date"
          density="comfortable"
          clearable
        />
        <p v-if="typeOptions.length === 0" class="text-caption text-medium-emphasis">
          No license types exist yet — an admin can add them under Admin → License types.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="grantDialog.open = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="grantDialog.licenseTypeId === null"
          :loading="grant.isPending.value"
          @click="grant.mutate()"
        >
          Grant
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="expiryDialog.open" max-width="460">
    <v-card title="Change license expiry">
      <v-card-text>
        <v-text-field
          v-model="expiryDialog.expiresAt"
          label="Expires (empty = never)"
          type="date"
          density="comfortable"
          clearable
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="expiryDialog.open = false">Cancel</v-btn>
        <v-btn color="primary" :loading="updateExpiry.isPending.value" @click="updateExpiry.mutate()">
          Save
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="revokeDialog.open" max-width="460">
    <v-card title="Revoke this license">
      <v-card-text>
        <v-textarea
          v-model="revokeDialog.reason"
          label="Reason (required, audited)"
          rows="2"
          density="comfortable"
          :counter="2000"
          maxlength="2000"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="revokeDialog.open = false">Cancel</v-btn>
        <v-btn
          color="error"
          :disabled="revokeDialog.reason.trim().length < 3"
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
