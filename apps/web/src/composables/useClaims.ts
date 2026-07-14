import type { ClaimKey } from '@aero/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';

import { apiFetch } from '../api/client';

export interface MeUser {
  robloxUserId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface MeResponse {
  user: MeUser | null;
  claims: ClaimKey[];
}

export const ME_QUERY_KEY = ['me'] as const;

/** The merged claim set from /api/me. Display-only — every mutation is re-checked server-side. */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiFetch<MeResponse>('/api/me'),
    staleTime: 60_000,
  });
}

/**
 * `v-if` style helpers for gating UI affordances:
 *
 *   const { isAuthenticated, hasClaim } = useClaims();
 *   <v-btn v-if="hasClaim(CLAIM_KEYS.BILL_SUBMIT)">Submit bill</v-btn>
 */
export function useClaims() {
  const { data, isPending } = useMe();

  const user = computed(() => data.value?.user ?? null);
  const claims = computed(() => data.value?.claims ?? []);
  const isAuthenticated = computed(() => user.value !== null);

  function hasClaim(key: ClaimKey): boolean {
    return claims.value.includes(key);
  }

  return { user, claims, isAuthenticated, isPending, hasClaim };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
  });
}
