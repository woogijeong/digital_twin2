import { defineConfig, devices } from '@playwright/test'

/** E2E runs the built frontend (vite preview) against a mock-mode backend.
 *  Both servers are started by the webServer blocks below. */
export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/demo.spec.ts', // recording-only; run via `pnpm demo:gif`
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'uv run --project ../backend uvicorn app.main:app --port 8000 --app-dir ../backend',
      env: { INDY_USE_MOCK: '1' },
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
