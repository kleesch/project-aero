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
});

export type Config = z.infer<typeof envSchema>;

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
  return result.data;
}

export const config = loadConfig();
