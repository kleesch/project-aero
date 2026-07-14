import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Only needed for commands that talk to a live database (push/studio);
    // `drizzle-kit generate` works offline.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/aero',
  },
});
