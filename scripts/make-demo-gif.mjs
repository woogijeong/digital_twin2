// Runs a Playwright demo recording, then converts the .webm to a docs/*.gif
// with ffmpeg (two-pass palette for quality).
// Usage: `pnpm demo:gif` / `pnpm demo:pickplace:gif`
// (or directly: `node scripts/make-demo-gif.mjs <spec.ts> <output.gif>`)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [specFile = 'demo.spec.ts', outFile = 'demo.gif'] = process.argv.slice(2)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fe = join(root, 'frontend')
const artifacts = join(fe, 'demo-artifacts')
const out = join(root, 'docs', outFile)

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

function findWebm(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = findWebm(p)
      if (hit) return hit
    } else if (entry.name.endsWith('.webm')) {
      return p
    }
  }
  return null
}

rmSync(artifacts, { recursive: true, force: true })
run('pnpm', ['exec', 'playwright', 'test', `e2e/${specFile}`, '--config=playwright.demo.config.ts'], fe)

const webm = findWebm(artifacts)
if (!webm) throw new Error('no .webm recorded under ' + artifacts)
console.log('recorded', webm, `(${(statSync(webm).size / 1e6).toFixed(1)} MB)`)

mkdirSync(dirname(out), { recursive: true })
const vf =
  'fps=10,scale=760:-1:flags=lanczos,split[s0][s1];' +
  '[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5'
run('ffmpeg', ['-y', '-i', webm, '-vf', vf, '-loop', '0', out])

if (!existsSync(out)) throw new Error('ffmpeg produced no gif')
const mb = statSync(out).size / 1e6
console.log('wrote', out, `(${mb.toFixed(1)} MB)`)
if (mb > 5) console.warn('WARNING: gif is large for a README; consider trimming demo.spec.ts')
rmSync(artifacts, { recursive: true, force: true })
