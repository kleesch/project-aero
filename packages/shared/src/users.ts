/**
 * User identity on the wire (see DESIGN.md — Core): the ROBLOX user id is
 * the primary identity; names are cached snapshots. Any API response that
 * mentions a person carries a `UserRef` — never a bare id — so every surface
 * can show a name. `null` in an actor position always means the system acted
 * (jobs, seed migrations), not an unknown user.
 */
export interface UserRef {
  robloxUserId: number;
  /** Null only when no snapshot exists for the id (should not happen — every referenced id has a users row). */
  username: string | null;
  displayName: string | null;
}

/**
 * The one way to render a person as text, everywhere: "Display Name
 * (@username)", "@username" when they match, "user #id" without a snapshot,
 * "System" for a null actor.
 */
export function formatUserRef(ref: UserRef | null | undefined): string {
  if (!ref) return 'System';
  if (ref.username === null) return `user #${ref.robloxUserId}`;
  if (ref.displayName && ref.displayName !== ref.username) {
    return `${ref.displayName} (@${ref.username})`;
  }
  return `@${ref.username}`;
}
