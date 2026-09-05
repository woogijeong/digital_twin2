import { expect, test } from '@playwright/test'

/** Records a short screen capture of the pick/place demo for the README GIF.
 *  Not a correctness test -- run with `pnpm demo:pickplace:gif` (see
 *  package.json), which converts the .webm. */
test.use({
  viewport: { width: 1280, height: 800 },
  video: { mode: 'on', size: { width: 1280, height: 800 } },
})

test('pick and place reel', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('LINKED')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(500)

  // Home, then mount the gripper.
  await page.getByRole('button', { name: 'RESET TO HOME' }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'GRIPPER', exact: true }).click()
  await page.waitForTimeout(500)

  // Descend onto the workpiece sitting on the floor.
  await page.getByRole('button', { name: 'SYNC' }).click()
  const inputs = page.locator('aside input')
  await inputs.nth(2).fill('40')
  const apply = page.getByRole('button', { name: 'APPLY TARGET' })
  await apply.click()
  await page.waitForTimeout(1600)

  // Pick it up.
  await page.getByRole('button', { name: 'CLOSE', exact: true }).click()
  await expect(page.getByText('PAYLOAD ATTACHED')).toBeVisible()
  await page.waitForTimeout(500)

  // Carry it to a new spot.
  await inputs.nth(0).fill('250')
  await inputs.nth(2).fill('120')
  await apply.click()
  await page.waitForTimeout(1600)

  // Place it down.
  await page.getByRole('button', { name: 'OPEN', exact: true }).click()
  await expect(page.getByText('PAYLOAD ATTACHED')).toBeHidden()
  await page.waitForTimeout(1000)
})
