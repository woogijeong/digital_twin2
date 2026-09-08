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

  // Manipulability index is carried on telemetry and rendered as a real number
  await expect(page.getByText(/manipulability -?\d/)).toBeVisible({ timeout: 10_000 })

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

test('mock mode shows NOT LINKED rather than a false LINKED status', async ({ page }) => {
  await page.goto('/')
  // "LINKED" means the real controller, not just that our own (mock) telemetry
  // is flowing -- a mock session must never claim to be linked.
  await expect(page.getByText('NOT LINKED', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('header')).toContainText('MOCK')
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

test('tool frame mode moves along the axes the tool is pointing', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const readCell = async (axis: string) => {
    const el = page.locator(`text=${axis} · mm`).locator('xpath=following-sibling::div').first()
    await expect(el).not.toHaveText('—', { timeout: 10_000 })
    return Number(((await el.textContent()) ?? '').replace('\u2212', '-'))
  }

  // At the ready pose the tool points straight down (base -Z), so a +Z move
  // in the tool's own frame extends it further down (base Z decreases) while
  // X/Y stay put -- unlike REL, which would add +50 to base Z directly.
  await page.getByRole('button', { name: 'RESET TO HOME' }).click()
  await page.waitForTimeout(1500)
  const [x0, y0, z0] = [await readCell('X'), await readCell('Y'), await readCell('Z')]

  await page.getByRole('button', { name: 'TOOL', exact: true }).click()
  const inputs = page.locator('aside input')
  await inputs.nth(2).fill('50')
  await expect(page.locator('text=/→ abs \\[/')).toBeVisible()

  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await expect(page.getByRole('button', { name: 'APPLY TARGET' })).toBeEnabled({ timeout: 10_000 })
  await page.waitForTimeout(1500) // let the move settle

  expect(await readCell('X')).toBeCloseTo(x0, 0)
  expect(await readCell('Y')).toBeCloseTo(y0, 0)
  expect(await readCell('Z')).toBeCloseTo(z0 - 50, 0)
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

test('end-effector selection shifts the reported TCP', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const readZ = async () => {
    const el = page.locator('text=Z · mm').locator('xpath=following-sibling::div').first()
    await expect(el).not.toHaveText('—', { timeout: 10_000 })
    return Number(((await el.textContent()) ?? '').replace('−', '-'))
  }

  // Normalise state: home pose, no tool.
  await page.getByRole('button', { name: 'RESET TO HOME' }).click()
  await page.getByRole('button', { name: 'NONE', exact: true }).click()
  await page.waitForTimeout(1400)
  const zBare = await readZ()

  // GRIPPER adds 50 mm of tool (110mm total vs the 60mm bare flange TCP); the
  // ready pose points it straight down.
  await page.getByRole('button', { name: 'GRIPPER', exact: true }).click()
  await expect(page.getByRole('button', { name: 'OPEN', exact: true })).toBeVisible()
  await expect.poll(readZ).toBeLessThan(zBare - 30)

  await page.getByRole('button', { name: 'NONE', exact: true }).click()
  await expect.poll(readZ).toBeCloseTo(zBare, 0)
})

test('closing the gripper on the workpiece picks it up, opening releases it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'RESET TO HOME' }).click()
  await page.getByRole('button', { name: 'GRIPPER', exact: true }).click()
  await expect(page.getByRole('button', { name: 'OPEN', exact: true })).toBeVisible()
  await page.waitForTimeout(1500)

  // SYNC copies the live home pose in, so only X/Y/Z need overriding — the
  // orientation stays one the arm is already holding.
  const inputs = page.locator('aside input')
  await page.getByRole('button', { name: 'SYNC' }).click()
  for (const [i, v] of [350, -186.5, 40].entries()) await inputs.nth(i).fill(String(v))
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await expect(page.getByRole('button', { name: 'APPLY TARGET' })).toBeEnabled({ timeout: 10_000 })
  await page.waitForTimeout(1500)

  const badge = page.getByText('PAYLOAD ATTACHED')
  await expect(badge).toBeHidden()
  await page.getByRole('button', { name: 'CLOSE', exact: true }).click()
  await expect(badge).toBeVisible()

  // Carry it somewhere else, then let go.
  await inputs.nth(0).fill('250')
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await expect(page.getByRole('button', { name: 'APPLY TARGET' })).toBeEnabled({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  await expect(badge).toBeVisible()

  await page.getByRole('button', { name: 'OPEN', exact: true }).click()
  await expect(badge).toBeHidden()
})

test('E-STOP halts an in-progress move', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const jointRow = () =>
    page.locator('aside span').filter({ hasText: /^-?\d+\.\d$/ }).allTextContents()

  // Kick off a long eased move, then slam E-STOP partway through.
  const inputs = page.locator('aside input')
  for (const [i, v] of [420, -120, 300, 178, 2, -60].entries()) await inputs.nth(i).fill(String(v))
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'E-STOP' }).click()

  // Whatever it was showing right after the stop, it stays there — no drift.
  await page.waitForTimeout(150)
  const stopped = await jointRow()
  await page.waitForTimeout(900)
  expect(await jointRow()).toEqual(stopped)
})

test('theme toggle switches the UI between dark and light', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const before = await page.evaluate(() => document.documentElement.dataset.theme)
  const toggle = page.locator('header button', { hasText: /LIGHT|DARK/ })
  await toggle.click()
  const after = await page.evaluate(() => document.documentElement.dataset.theme)
  expect(after).not.toBe(before)

  await toggle.click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(before)
})

test('viewport background toggle switches between black and gray', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  const toggle = page.locator('header button', { hasText: /GRAY BG|BLACK BG/ })
  const before = await toggle.textContent()
  await toggle.click()
  const after = await toggle.textContent()
  expect(after).not.toBe(before)

  await toggle.click()
  expect(await toggle.textContent()).toBe(before)
})

test('pallet toggle shows and hides the reference model without errors', async ({ page }) => {
  const jsErrors: string[] = []
  page.on('pageerror', (e) => jsErrors.push(String(e)))

  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('canvas')).toBeVisible()

  const toggle = page.getByRole('button', { name: 'PALLET' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true') // shown by default
  await page.waitForTimeout(1000) // let the GLB load
  await page.screenshot({ path: `${SHOTS}/04-pallet.png` })

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  expect(jsErrors, jsErrors.join('\n')).toHaveLength(0)
})

test('gripper and suction each expose their own color picker', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'GRIPPER', exact: true }).click()
  const gripperInput = page.getByLabel('gripper color')
  await expect(gripperInput).toBeVisible()
  await expect(gripperInput).toHaveValue('#2b3136')
  await gripperInput.fill('#ff0000')
  await expect(gripperInput).toHaveValue('#ff0000')

  await page.getByRole('button', { name: 'SUCTION', exact: true }).click()
  await expect(gripperInput).toBeHidden()
  const suctionInput = page.getByLabel('suction color')
  await expect(suctionInput).toBeVisible()
  await expect(suctionInput).toHaveValue('#2b3136')

  await page.getByRole('button', { name: 'NONE', exact: true }).click()
  await expect(suctionInput).toBeHidden()
})

test('suction has an ON/OFF toggle independent of the gripper', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'SUCTION', exact: true }).click()
  const onBtn = page.getByRole('button', { name: 'ON', exact: true })
  const offBtn = page.getByRole('button', { name: 'OFF', exact: true })
  await expect(onBtn).toBeVisible()
  await expect(offBtn).toBeVisible()
  await expect(offBtn).toHaveAttribute('aria-pressed', 'true') // starts OFF

  await onBtn.click()
  await expect(onBtn).toHaveAttribute('aria-pressed', 'true')
  await expect(offBtn).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'NONE', exact: true }).click()
  await expect(onBtn).toBeHidden()
})

test('ALL DO OFF clears every end-effector output', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'SUCTION', exact: true }).click()
  const onBtn = page.getByRole('button', { name: 'ON', exact: true })
  const offBtn = page.getByRole('button', { name: 'OFF', exact: true })
  await onBtn.click()
  await expect(onBtn).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'ALL DO OFF' }).click()
  await expect(offBtn).toHaveAttribute('aria-pressed', 'true')

  // and the gripper solenoids read closed afterwards
  await page.getByRole('button', { name: 'GRIPPER', exact: true }).click()
  await expect(page.getByRole('button', { name: 'CLOSE', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a target below the floor is rejected before the arm moves', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'RESET TO HOME' }).click()
  await page.getByRole('button', { name: 'GRIPPER', exact: true }).click()
  await expect(page.getByRole('button', { name: 'OPEN', exact: true })).toBeVisible()
  await page.waitForTimeout(1500)

  const readZ = async () => {
    const el = page.locator('text=Z · mm').locator('xpath=following-sibling::div').first()
    await expect(el).not.toHaveText('—', { timeout: 10_000 })
    return Number(((await el.textContent()) ?? '').replace('−', '-'))
  }
  const zBefore = await readZ()

  const inputs = page.locator('aside input')
  await page.getByRole('button', { name: 'SYNC' }).click()
  for (const [i, v] of [350, -186.5, -15].entries()) await inputs.nth(i).fill(String(v))
  await page.getByRole('button', { name: 'APPLY TARGET' }).click()

  await expect(page.getByText(/is below the floor clearance/)).toBeVisible({ timeout: 10_000 })
  expect(await readZ()).toBeCloseTo(zBefore, 0) // rejected — the arm never moved
})
