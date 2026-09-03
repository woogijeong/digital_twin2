import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'

/** Runs only e2e/demo.spec.ts (the README screen recording). Reuses the base
 *  webServers. `pnpm demo:gif` runs this then converts the .webm with ffmpeg. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/demo.spec.ts',
  outputDir: 'demo-artifacts',
  reporter: [['list']],
  projects: [{ name: 'demo', use: { ...devices['Desktop Chrome'] } }],
})
