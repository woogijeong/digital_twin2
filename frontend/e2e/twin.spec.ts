import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Written into the repo so the README can show them.
const SHOTS = '../docs/screenshots'
mkdirSync(SHOTS, { recursive: true })

test('loads the twin, mirrors telemetry, and moves on an applied target', async ({
  page,
}) => {
  // Uncaught JS exceptions are always a failure. The deliberate 422 from the
  // unreachable-target step surfaces as a "Failed to load resource" console
  // error, which is expected and filtered out.
  const jsErrors: string[] = []
  page.on('pageerror', (e) => jsErrors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
      jsErrors.push(m.text())
    }
  })

  await page.goto('/')

  // Header + status
  await expect(page.getByText('INDY7 · DIGITAL TWIN')).toBeVisible()
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  // 3D canvas mounted
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()

  // Live TCP pose readout is populated (not the placeholder dash)
  const xCell = page.locator('text=X · mm').locator('xpath=following-sibling::div').first()
  await expect(xCell).not.toHaveText('—', { timeout: 10_000 })

  // At rest the twin holds its pose — no idle drift, it only moves on command
  const jointRow = () =>
    page.locator('aside span').filter({ hasText: /^-?\d+\.\d$/ }).allTextContents()
  const j0 = await jointRow()
  await page.waitForTimeout(1200)
  expect(await jointRow()).toEqual(j0)

  await page.screenshot({ path: `${SHOTS}/01-overview.png` })

  // Apply a reachable target -> the rendered joints move to the IK solution
  const inputs = page.locator('aside input')
  await inputs.nth(0).fill('300')
  await inputs.nth(1).fill('0')
  await inputs.nth(2).fill('480')
  await inputs.nth(3).fill('180')
  await inputs.nth(4).fill('0')
  await inputs.nth(5).fill('-90')
  const beforeApply = await jointRow()
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await expect(page.getByRole('button', { name: 'APPLY TARGET' })).toBeEnabled({
    timeout: 10_000,
  })
  await page.waitForTimeout(1400) // let the tween finish
  const afterApply = await jointRow()
  const moved = afterApply.some((v, i) => Math.abs(Number(v) - Number(beforeApply[i])) > 3)
  expect(moved, `joints did not move: ${beforeApply} -> ${afterApply}`).toBe(true)
  await page.screenshot({ path: `${SHOTS}/02-target-applied.png` })

  // Unreachable target -> inline IK error, no crash
  await inputs.nth(0).fill('5000')
  await expect(inputs.nth(0)).toHaveValue('5000')
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await expect(page.locator('text=/IK:/')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: `${SHOTS}/03-ik-rejected.png` })

  expect(jsErrors, jsErrors.join('\n')).toHaveLength(0)
})

test('relative target mode offsets from the live pose', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const readCell = async (axis: string) => {
    const el = page.locator(`text=${axis} · mm`).locator('xpath=following-sibling::div').first()
    await expect(el).not.toHaveText('—', { timeout: 10_000 })
    return Number(((await el.textContent()) ?? '').replace('\u2212', '-'))
  }

  const [x0, y0, z0] = [await readCell('X'), await readCell('Y'), await readCell('Z')]

  // Switch to relative mode and nudge X by -70 mm and Z by +60 mm.
  await page.getByRole('button', { name: 'REL', exact: true }).click()
  const inputs = page.locator('aside input')
  await inputs.nth(0).fill('-70')
  await inputs.nth(2).fill('60')
  await expect(page.locator('text=/→ abs \\[/')).toBeVisible()

  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await expect(page.getByRole('button', { name: 'APPLY TARGET' })).toBeEnabled({ timeout: 10_000 })
  await page.waitForTimeout(1500) // let the move settle

  expect(await readCell('X')).toBeCloseTo(x0 - 70, 0)
  expect(await readCell('Y')).toBeCloseTo(y0, 0)
  expect(await readCell('Z')).toBeCloseTo(z0 + 60, 0)
})

test('reset to home returns the twin to the ready pose', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const jointRow = () =>
    page.locator('aside span').filter({ hasText: /^-?\d+\.\d$/ }).allTextContents()

  // Drive it away from home.
  const inputs = page.locator('aside input')
  for (const [i, v] of [420, -120, 300, 178, 2, -60].entries()) await inputs.nth(i).fill(String(v))
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await page.waitForTimeout(1400)
  expect(await jointRow()).not.toEqual(['0.0', '0.0', '-90.0', '0.0', '-90.0', '0.0'])

  // RESET TO HOME -> the URDF ready configuration.
  await page.getByRole('button', { name: 'RESET TO HOME' }).click()
  await page.waitForTimeout(1500)
  expect(await jointRow()).toEqual(['0.0', '0.0', '-90.0', '0.0', '-90.0', '0.0'])
})

test('connecting to an unreachable controller reports an error and stays on mock', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  await page.locator('header input').fill('10.255.255.1')
  await page.getByRole('button', { name: 'CONNECT' }).click()

  await expect(page.locator('header')).toContainText(/did not respond|cannot connect/i, {
    timeout: 15_000,
  })
  await expect(page.locator('header')).toContainText('MOCK')
  await expect(page.locator('header')).not.toContainText('SIMULATION')
})
