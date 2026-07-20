<script setup lang="ts">
import { CLAIM_KEYS } from '@aero/shared';
import { computed, onMounted, ref } from 'vue';
import { useDisplay, useTheme } from 'vuetify';

import { useClaims, useLogout } from './composables/useClaims';

const { mobile } = useDisplay();
const theme = useTheme();

// `drawer` controls visibility (mainly on mobile, where the drawer is
// temporary); `rail` collapses the desktop drawer down to icons only.
const drawer = ref(true);
const rail = ref(false);

// On desktop the drawer is always shown — collapsing means switching to rail,
// not hiding it. On mobile there's no rail; the nav icon opens/closes it.
const railed = computed(() => rail.value && !mobile.value);

const THEME_STORAGE_KEY = 'aero-theme';
const isDark = computed(() => theme.global.name.value === 'aeroDark');

function applyTheme(name: 'aero' | 'aeroDark') {
  theme.global.name.value = name;
}

function initTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'aero' || stored === 'aeroDark') {
    applyTheme(stored);
  } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    applyTheme('aeroDark');
  }
}

function toggleTheme() {
  const next = isDark.value ? 'aero' : 'aeroDark';
  applyTheme(next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
}

function toggleNav() {
  if (mobile.value) {
    drawer.value = !drawer.value;
  } else {
    rail.value = !rail.value;
  }
}

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
  initTheme();
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
    <v-navigation-drawer v-model="drawer" :rail="railed" rail-width="72">
      <template #prepend>
        <router-link
          to="/"
          class="d-flex align-center text-decoration-none text-high-emphasis pa-3"
          :class="railed ? 'justify-center' : ''"
        >
          <v-img
            src="/logo.png"
            alt="OSFUSA"
            :width="railed ? 40 : 44"
            max-height="52"
            class="flex-grow-0"
          />
          <span v-if="!railed" class="text-h6 font-weight-bold ml-3 text-no-wrap">OSFUSA</span>
        </router-link>
        <v-divider />
      </template>

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
      <v-app-bar-nav-icon
        :icon="railed ? 'mdi-menu' : 'mdi-menu-open'"
        aria-label="Toggle navigation"
        @click="toggleNav"
      />
      <v-app-bar-title>USA Project</v-app-bar-title>

      <template #append>
        <v-btn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          aria-label="Toggle dark mode"
          @click="toggleTheme"
        />

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
