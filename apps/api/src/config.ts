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
  /** Port of the separate-origin PDF proxy (see DESIGN.md — PDF Storage & Safety). */
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
  /**
   * S3-compatible object storage: Cloudflare R2 in production, MinIO locally
   * — one code path (see DESIGN.md — PDF Storage & Safety). Endpoint and
   * credentials default to the compose MinIO service outside production and
   * are required in production — enforced below.
   */
  S3_ENDPOINT: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  S3_ACCESS_KEY_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  S3_BUCKET: z.string().default('aero-documents'),
  /** R2 wants 'auto'; MinIO ignores it. */
  S3_REGION: z.string().default('auto'),
  /**
   * Public base URL of the separate file origin, used to build the document
   * URLs handed to the browser (e.g. https://files.example.com in prod).
   */
  FILE_ORIGIN_BASE_URL: z.url().default('http://localhost:3001'),
});

export type Config = z.infer<typeof envSchema> & {
  COOKIE_SECURE: boolean;
  S3_ENDPOINT: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
};

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
    if (
      !result.data.S3_ENDPOINT ||
      !result.data.S3_ACCESS_KEY_ID ||
      !result.data.S3_SECRET_ACCESS_KEY
    ) {
      console.error(
        'Refusing to start: S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required in production.',
      );
      process.exit(1);
    }
  }

  return {
    ...result.data,
    COOKIE_SECURE: cookieSecure,
    // Outside production, fall back to the compose MinIO service.
    S3_ENDPOINT: result.data.S3_ENDPOINT ?? 'http://localhost:9000',
    S3_ACCESS_KEY_ID: result.data.S3_ACCESS_KEY_ID ?? 'aero',
    S3_SECRET_ACCESS_KEY: result.data.S3_SECRET_ACCESS_KEY ?? 'aero_dev_password',
  };
}

export const config = loadConfig();
