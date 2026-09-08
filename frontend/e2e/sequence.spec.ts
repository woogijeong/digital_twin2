import { expect, test } from '@playwright/test'

// The e2e backend is mock mode, so the MOTION SEQUENCE panel is live.

const THREE_MOVE = JSON.stringify([
  { type: 'home' },
  { type: 'movej', jpos: [0, -15, -110, 0, -55, 0] },
  { type: 'movel', pose: [400, 0, 500, 180, 0, -90] },
])

const jointRow = (page: import('@playwright/test').Page) =>
  page
    .locator('aside span')
    .filter({ hasText: /^-?\d+\.\d$/ })
    .allTextContents()

// Each test drives the shared server-side mock arm; hand it back at the ready
// pose (a fresh MockRobot) so the tests don't perturb each other.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '↺ RESET', exact: true }).click().catch(() => {})
  await page.waitForTimeout(1400)
})

test('PLAY runs the sequence then holds the twin', async ({ page }) => {
  const jsErrors: string[] = []
  page.on('pageerror', (e) => jsErrors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) jsErrors.push(m.text())
  })

  await expect(page.locator('header')).toContainText('MOCK')
  await page.getByLabel('motion sequence JSON').fill(THREE_MOVE)

  const xCell = page.locator('text=X · mm').locator('xpath=following-sibling::div').first()

  await page.getByRole('button', { name: '▶ PLAY', exact: true }).click()
  await expect(page.locator('aside')).toContainText('done · 3 steps', { timeout: 15_000 })

  // the last step is movel [400, 0, 500 …] — the twin ends there
  await page.waitForTimeout(500)
  await expect(xCell).toHaveText(/^40[0-9]/)
  // and holds (telemetry frozen after a program) — no drift
  const held = await jointRow(page)
  await page.waitForTimeout(1000)
  expect(await jointRow(page)).toEqual(held)

  expect(jsErrors, jsErrors.join('\n')).toHaveLength(0)
})

test('STEP advances exactly one step at a time', async ({ page }) => {
  await page.getByLabel('motion sequence JSON').fill(THREE_MOVE)

  const stepBtn = page.getByRole('button', { name: '⏭ STEP', exact: true })
  await stepBtn.click()
  await expect(page.locator('aside')).toContainText('step 1 / 3', { timeout: 10_000 })
  await stepBtn.click()
  await expect(page.locator('aside')).toContainText('step 2 / 3')
  await stepBtn.click()
  await expect(page.locator('aside')).toContainText('step 3 / 3')
})

test('a bad target fails compilation and the run never starts', async ({ page }) => {
  await page.getByLabel('motion sequence JSON').fill(
    JSON.stringify([
      { type: 'movel', pose: [250, 0, 300, 180, 0, 90] },
      { type: 'movel', pose: [300, 0, 2, 180, 0, 90] }, // below the 5 mm floor clearance
    ]),
  )
  await page.getByRole('button', { name: '▶ PLAY', exact: true }).click()
  await expect(page.locator('aside')).toContainText(/step 2:.*(floor|clearance)/i, { timeout: 15_000 })
  await expect(page.locator('aside')).not.toContainText('done ·')

  // held after a failed compile — the twin is not drifting
  const at = await jointRow(page)
  await page.waitForTimeout(700)
  expect(await jointRow(page)).toEqual(at)
})

test('a malformed step is reported before PLAY is possible', async ({ page }) => {
  await page.getByLabel('motion sequence JSON').fill('[{ "type": "wait", "seconds": -1 }]')
  await expect(page.locator('aside')).toContainText('step 1: wait.seconds must be a positive number')
  await expect(page.getByRole('button', { name: '▶ PLAY', exact: true })).toBeDisabled()
})

test('RESET after a run eases the twin home', async ({ page }) => {
  await page.getByLabel('motion sequence JSON').fill(THREE_MOVE)
  await page.getByRole('button', { name: '▶ PLAY', exact: true }).click()
  await expect(page.locator('aside')).toContainText('done · 3 steps', { timeout: 15_000 })

  await page.getByRole('button', { name: '↺ RESET', exact: true }).click()
  await page.waitForTimeout(1600)
  expect(await jointRow(page)).toEqual(['0.0', '0.0', '-90.0', '0.0', '-90.0', '0.0'])
  await expect(page.locator('aside')).toContainText('3 steps') // back to idle, counter reset
})

test('E-STOP aborts a running sequence and freezes the twin', async ({ page }) => {
  await page.getByLabel('motion sequence JSON').fill(
    JSON.stringify([
      { type: 'movej', jpos: [40, -20, -70, 10, -60, 5] },
      { type: 'movej', jpos: [-40, 10, -110, -10, -40, -5] },
      { type: 'movej', jpos: [0, 0, -90, 0, -90, 0] },
    ]),
  )
  await page.getByRole('button', { name: '▶ PLAY', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'E-STOP' }).click()

  await page.waitForTimeout(150)
  const stopped = await jointRow(page)
  await page.waitForTimeout(900)
  expect(await jointRow(page)).toEqual(stopped)
  await expect(page.locator('aside')).toContainText('press RESET')
})
