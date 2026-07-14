<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';

interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  database: string;
}

// Exercises the Vite dev proxy + TanStack Query end to end.
const { data, isPending, isError } = useQuery({
  queryKey: ['health'],
  queryFn: async (): Promise<HealthResponse> => {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return response.json() as Promise<HealthResponse>;
  },
});
</script>

<template>
  <v-card>
    <v-card-title>USA Project</v-card-title>
    <v-card-text>
      <p class="mb-4">
        Administrative and public auditing tools for the mock United States Government.
      </p>
      <v-alert v-if="isPending" type="info" variant="tonal">Checking API status…</v-alert>
      <v-alert v-else-if="isError" type="error" variant="tonal">API is unreachable.</v-alert>
      <v-alert v-else type="success" variant="tonal">
        API {{ data?.status }} — v{{ data?.version }} ({{ data?.environment }}), database
        {{ data?.database }}.
      </v-alert>
    </v-card-text>
  </v-card>
</template>
