import { z } from 'zod';

/**
 * ROBLOX Users API — resolves identities for users who have never logged in
 * here (claim grants and admin lookups take a ROBLOX id or username).
 */

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  displayName: z.string().optional(),
});

export interface RobloxUser {
  robloxUserId: number;
  username: string;
  displayName: string | null;
}

export async function findRobloxUserById(userId: number): Promise<RobloxUser | null> {
  const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Users API responded ${response.status}`);
  const user = userSchema.parse(await response.json());
  return { robloxUserId: user.id, username: user.name, displayName: user.displayName ?? null };
}

const usernameLookupSchema = z.object({ data: z.array(userSchema) });

export async function findRobloxUserByUsername(username: string): Promise<RobloxUser | null> {
  const response = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  if (!response.ok) throw new Error(`Users API responded ${response.status}`);
  const { data } = usernameLookupSchema.parse(await response.json());
  const user = data[0];
  if (!user) return null;
  return { robloxUserId: user.id, username: user.name, displayName: user.displayName ?? null };
}
