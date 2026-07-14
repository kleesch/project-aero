<script setup lang="ts">
import { CLAIM_KEYS } from '@aero/shared';
import { computed, onMounted, ref } from 'vue';

import { useClaims, useLogout } from './composables/useClaims';

const drawer = ref(true);

const { user, isAuthenticated, hasClaim } = useClaims();
const logout = useLogout();

const navItems = computed(() => [
  { title: 'Home', icon: 'mdi-home', to: '/' },
  { title: 'Bills', icon: 'mdi-file-document-multiple', to: '/bills' },
  { title: 'Courts', icon: 'mdi-gavel', to: '/courts' },
  { title: 'Businesses', icon: 'mdi-store', to: '/businesses' },
  ...(hasClaim(CLAIM_KEYS.CLAIMS_MANAGE)
    ? [{ title: 'Admin', icon: 'mdi-shield-crown', to: '/admin' }]
    : []),
]);

// The OAuth callback lands failures back here as ?auth_error=<code>.
const authError = ref<string | null>(null);
onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('auth_error');
  if (error) {
    authError.value = error;
    params.delete('auth_error');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }
});
</script>

<template>
  <v-app>
    <v-navigation-drawer v-model="drawer">
      <v-list nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          exact
        />
      </v-list>
    </v-navigation-drawer>

    <v-app-bar color="primary">
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-app-bar-title>USA Project</v-app-bar-title>

      <template #append>
        <v-menu v-if="isAuthenticated && user">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" variant="text" class="text-none">
              <v-avatar size="28" class="mr-2">
                <v-img v-if="user.avatarUrl" :src="user.avatarUrl" :alt="user.username" />
                <v-icon v-else icon="mdi-account-circle" />
              </v-avatar>
              {{ user.displayName ?? user.username }}
              <v-icon icon="mdi-chevron-down" end />
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item
              :subtitle="'@' + user.username"
              :title="user.displayName ?? user.username"
            />
            <v-divider />
            <v-list-item
              prepend-icon="mdi-logout"
              title="Log out"
              :disabled="logout.isPending.value"
              @click="logout.mutate()"
            />
          </v-list>
        </v-menu>

        <v-btn v-else href="/auth/login" variant="outlined" prepend-icon="mdi-login">
          Log in with ROBLOX
        </v-btn>
      </template>
    </v-app-bar>

    <v-main>
      <v-container>
        <router-view />
      </v-container>
    </v-main>

    <v-snackbar
      :model-value="authError !== null"
      color="error"
      @update:model-value="authError = null"
    >
      Login failed ({{ authError }}). Try again, or check the server logs.
    </v-snackbar>
  </v-app>
</template>
