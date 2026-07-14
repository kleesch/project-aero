import { z } from 'zod';

// For non-Docker local runs, pull in the repo-root .env; Docker and deployed
// environments inject real environment variables instead. Existing variables
// always win over .env contents.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // No .env file — rely on the process environment.
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Main application/API port. */
  PORT: z.coerce.number().int().positive().default(3000),
  /** Reserved for the separate-origin PDF proxy (wired up in phase 03). */
  FILE_ORIGIN_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Public origin the browser reaches the app at (the Vite dev URL locally,
   * the real origin in prod). Every OAuth URL — redirect_uri and the
   * post-login redirect — derives from this.
   */
  APP_BASE_URL: z.url().default('http://localhost:5173'),
  /**
   * ROBLOX OAuth app credentials. Optional in development so a fresh checkout
   * boots before the (manual) Creator Hub registration — .env.example ships
   * them empty, hence the empty-string-as-absent preprocessing; /auth/login
   * answers 503 until they are set. Required in production — enforced below.
   */
  ROBLOX_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  ROBLOX_CLIENT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /** Signs session and OAuth-state cookies (cookie-parser). */
  SESSION_SECRET: z.string().min(32),
  /**
   * `Secure` flag on every auth cookie. Defaults by NODE_ENV; explicit
   * override exists for prod-like TLS setups in development. Safari drops
   * `Secure` cookies on insecure origins including http://localhost, so this
   * must stay off for plain-http local dev.
   */
  COOKIE_SECURE: z.stringbool().optional(),
});

export type Config = z.infer<typeof envSchema> & { COOKIE_SECURE: boolean };

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Deliberately prints only variable names and what is wrong with them,
    // never the values — secrets must not end up in logs.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    console.error('See .env.example for the full list of required variables.');
    process.exit(1);
  }

  const cookieSecure = result.data.COOKIE_SECURE ?? result.data.NODE_ENV === 'production';
  if (result.data.NODE_ENV === 'production') {
    if (!cookieSecure) {
      console.error('Refusing to start: COOKIE_SECURE must not be disabled in production.');
      process.exit(1);
    }
    if (!result.data.ROBLOX_CLIENT_ID || !result.data.ROBLOX_CLIENT_SECRET) {
      console.error(
        'Refusing to start: ROBLOX_CLIENT_ID and ROBLOX_CLIENT_SECRET are required in production.',
      );
      process.exit(1);
    }
  }

  return { ...result.data, COOKIE_SECURE: cookieSecure };
}

export const config = loadConfig();
