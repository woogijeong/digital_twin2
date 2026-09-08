import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/** Every JSON file under docs/sequences/ must parse, compile (IK-solve), and
 *  play to completion against the mock. Guards the docs from bit-rot. */
const EXAMPLES = ['01-three-moves', '02-pick-and-place', '03-palletize-2x2']

for (const name of EXAMPLES) {
  test(`docs/sequences/${name}.json compiles and plays`, async ({ page }) => {
    const json = readFileSync(`../docs/sequences/${name}.json`, 'utf8')
    const steps = (JSON.parse(json) as unknown[]).length

    await page.goto('/')
    await expect(page.locator('header')).toContainText('MOCK')

    await page.getByLabel('motion sequence JSON').fill(json)
    await page.getByRole('button', { name: '4×', exact: true }).click()
    await page.getByRole('button', { name: '▶ PLAY', exact: true }).click()

    await expect(page.locator('aside')).toContainText(`done · ${steps} steps`, { timeout: 60_000 })
    await expect(page.locator('aside')).not.toContainText(/step \d+:/) // no compile error
  })
}
