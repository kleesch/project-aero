<script setup lang="ts">
import { ref } from 'vue';

const drawer = ref(true);

const navItems = [
  { title: 'Home', icon: 'mdi-home', to: '/' },
  { title: 'Bills', icon: 'mdi-file-document-multiple', to: '/bills' },
  { title: 'Courts', icon: 'mdi-gavel', to: '/courts' },
  { title: 'Businesses', icon: 'mdi-store', to: '/businesses' },
  { title: 'Admin', icon: 'mdi-shield-crown', to: '/admin' },
];
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
    </v-app-bar>

    <v-main>
      <v-container>
        <router-view />
      </v-container>
    </v-main>
  </v-app>
</template>
