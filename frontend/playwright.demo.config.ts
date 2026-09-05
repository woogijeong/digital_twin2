import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

/** Runs a single e2e/demo*.spec.ts recording (which one is picked by the file
 *  argument `make-demo-gif.mjs` passes on the CLI). Reuses the base
 *  webServers. `pnpm demo:gif` / `demo:pickplace:gif` run this then convert
 *  the .webm with ffmpeg. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/demo*.spec.ts',
  outputDir: 'demo-artifacts',
  reporter: [['list']],
  projects: [{ name: 'demo', use: { ...devices['Desktop Chrome'] } }],
})
