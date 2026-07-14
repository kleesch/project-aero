<script setup lang="ts">
import { sessionForDate } from '@aero/shared';

const currentSession = sessionForDate(new Date());
</script>

<template>
  <v-card>
    <v-card-title>Bills</v-card-title>
    <v-card-text>
      Bill tracking arrives in phase 04. The current Congress session is
      <strong>{{ currentSession }}</strong
      >.
    </v-card-text>
  </v-card>
</template>
