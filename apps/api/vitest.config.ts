import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Hermetic config so tests never depend on a .env file or a live
    // database — everything the config schema requires is stubbed here.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      SESSION_SECRET: 'test_session_secret_at_least_32_chars_long',
    },
  },
});
