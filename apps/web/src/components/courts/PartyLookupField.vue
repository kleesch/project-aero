<script setup lang="ts">
import { GOVERNMENT_PARTY_LABEL, type RulingPartyInput, type RulingPartySide } from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';

import { lookupParties } from '../../api/rulings';

/**
 * Typeahead over the party-lookup endpoint (users by ROBLOX username/id —
 * including people who have never logged in — businesses by name, and the
 * fixed government entity). Emits a ready-to-submit party for the given side.
 */
const props = defineProps<{ side: RulingPartySide }>();

const emit = defineEmits<{ select: [party: RulingPartyInput, label: string] }>();

interface PartyOption {
  key: string;
  label: string;
  sublabel: string;
  party: RulingPartyInput;
}

const search = ref('');
const debounced = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    debounced.value = value.trim();
  }, 250);
});

const { data, isFetching } = useQuery({
  queryKey: computed(() => ['party-lookup', debounced.value] as const),
  queryFn: () => lookupParties(debounced.value),
  enabled: computed(() => debounced.value.length > 0),
  staleTime: 30_000,
});

const options = computed<PartyOption[]>(() => {
  if (!data.value) return [];
  const side = props.side;
  const result: PartyOption[] = data.value.users.map((user) => ({
    key: `user-${user.robloxUserId}`,
    label: user.displayName ? `${user.displayName} (@${user.username})` : `@${user.username}`,
    sublabel: user.isPlatformUser
      ? `ROBLOX id ${user.robloxUserId}`
      : `ROBLOX id ${user.robloxUserId} — never logged in here`,
    party: { partyType: 'user', side, robloxUserId: user.robloxUserId },
  }));
  result.push(
    ...data.value.businesses.map((business) => ({
      key: `business-${business.id}`,
      label: business.name,
      sublabel: 'Business',
      party: { partyType: 'business', side, businessId: business.id } as RulingPartyInput,
    })),
  );
  if (data.value.government) {
    result.push({
      key: 'government',
      label: GOVERNMENT_PARTY_LABEL,
      sublabel: 'Government',
      party: { partyType: 'government', side },
    });
  }
  return result;
});

const selected = ref<PartyOption | null>(null);
watch(selected, (option) => {
  if (!option) return;
  emit('select', option.party, option.label);
  selected.value = null;
  search.value = '';
});
</script>

<template>
  <v-autocomplete
    v-model="selected"
    v-model:search="search"
    :items="options"
    :loading="isFetching"
    item-title="label"
    item-value="key"
    :item-props="(option: PartyOption) => ({ subtitle: option.sublabel })"
    return-object
    no-filter
    density="comfortable"
    :label="`Add ${props.side}`"
    placeholder="ROBLOX username or id, business name, or “United States government”"
    prepend-inner-icon="mdi-account-search"
    hide-details
    clearable
  >
    <template #no-data>
      <v-list-item
        :title="debounced ? 'No matches.' : 'Type to search users and businesses.'"
        density="compact"
      />
    </template>
  </v-autocomplete>
</template>
