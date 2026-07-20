<script setup lang="ts">
import type { OwnerLookupUser } from '@aero/shared';
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';

import { lookupOwners } from '../../api/businesses';

/**
 * User typeahead over the owner-lookup endpoint (platform users by username/
 * display name, plus a ROBLOX fallback for ids and exact usernames nobody has
 * referenced yet). v-model carries the selected user, null when cleared.
 */
const model = defineModel<OwnerLookupUser | null>({ required: true });

defineProps<{ label: string }>();

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
  queryKey: computed(() => ['owner-lookup', debounced.value] as const),
  queryFn: () => lookupOwners(debounced.value),
  enabled: computed(() => debounced.value.length > 0),
  staleTime: 30_000,
});

const options = computed<OwnerLookupUser[]>(() => data.value?.users ?? []);

function optionTitle(user: OwnerLookupUser): string {
  return user.displayName ? `${user.displayName} (@${user.username})` : `@${user.username}`;
}
</script>

<template>
  <v-autocomplete
    v-model="model"
    v-model:search="search"
    :items="options"
    :loading="isFetching"
    :item-title="optionTitle"
    item-value="robloxUserId"
    :item-props="
      (user: OwnerLookupUser) => ({
        subtitle: user.isPlatformUser
          ? `ROBLOX id ${user.robloxUserId}`
          : `ROBLOX id ${user.robloxUserId} — never logged in here`,
      })
    "
    return-object
    no-filter
    density="comfortable"
    :label="label"
    placeholder="ROBLOX username or id"
    prepend-inner-icon="mdi-account-search"
    clearable
  >
    <template #no-data>
      <v-list-item
        :title="debounced ? 'No matches.' : 'Type a ROBLOX username or id.'"
        density="compact"
      />
    </template>
  </v-autocomplete>
</template>
