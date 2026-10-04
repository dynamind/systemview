// Renders the narrated tour to video, frame by frame.
//
// The page runs on a virtual clock: timers, requestAnimationFrame and CSS
// animations only advance when we step them, so every frame is exact no matter
// how long a 4K screenshot takes. Frames are piped straight into ffmpeg.
//
//   npm run render                            4K, 60 fps, dark  -> renders/systemview-dark.mp4
//   npm run render -- --light --fps 30
//   npm run render -- --res 1080 --seconds 20   quick check of the opening
//
// The page is laid out at a laptop-sized 1536×864 CSS px (--width) and scaled
// up to the output resolution, so text reads at a comfortable size on video.
//
// The narrator's voice (npm run voice) is mixed in afterwards: each clip starts
// on the frame its line appears, and the tour already waits for it to finish.
//
// Needs Google Chrome and ffmpeg on the PATH.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const { values: opt } = parseArgs({
  options: {
    fps: { type: 'string', default: '60' },
    res: { type: 'string', default: '2160' }, // output height; 16:9
    width: { type: 'string', default: '1536' }, // layout width in CSS px
    light: { type: 'boolean', default: false },
    seconds: { type: 'string' }, // stop early, for previews
    out: { type: 'string' },
    crf: { type: 'string', default: '14' },
  },
})
const fps = Number(opt.fps)
const res = Number(opt.res)
const css = { width: Number(opt.width), height: Math.round((Number(opt.width) * 9) / 16) }
const scale = res / css.height
const scheme = opt.light ? 'light' : 'dark'
const limit = opt.seconds ? Number(opt.seconds) * fps : Infinity
const out = opt.out ?? `renders/systemview-${scheme}${res === 2160 ? '' : `-${res}p`}.mp4`
const HOLD_START = 1.2 // seconds on the opening frame before the narration starts
const HOLD_END = 3 // seconds after the last line

mkdirSync('renders', { recursive: true })

const server = await createServer({ server: { port: 0 }, logLevel: 'error' })
await server.listen()
const url = server.resolvedUrls.local[0]

const browser = await chromium.launch({ channel: 'chrome', handleSIGINT: false, args: ['--hide-scrollbars', '--force-color-profile=srgb'] })
const context = await browser.newContext({
  viewport: css,
  deviceScaleFactor: scale,
  colorScheme: scheme,
  reducedMotion: 'no-preference',
})
const page = await context.newPage()

// CSS animations and transitions run on the compositor's real clock; take them
// over so they advance in lockstep with the virtual one.
await page.addInitScript(() => {
  window.__advanceAnimations = (ms) => {
    for (const a of document.getAnimations()) {
      if (a.playState === 'finished') continue
      if (!a.__virtual) {
        a.pause()
        a.__virtual = true
      }
      const t = (a.currentTime ?? 0) + ms
      const end = a.effect?.getComputedTiming().endTime ?? 0
      if (t >= end) a.finish()
      else a.currentTime = t
    }
  }
})
// Installed, the fake clock still follows wall time; paused, it only moves when we step it.
const T0 = Date.UTC(2026, 0, 1)
await page.clock.install({ time: T0 })
await page.clock.pauseAt(T0 + 1000)
await page.goto(`${url}?render`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

// Encode to a partial file and rename at the end: a file under the final name is always complete.
const partial = out.replace(/\.mp4$/, '.partial.mp4')
const ffmpeg = spawn(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    // Screenshots are full-range JPEG; convert to the standard-range BT.709 every player expects.
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt.crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', partial],
  // Own process group, so Ctrl-C reaches only us and we can close the file properly.
  { stdio: ['pipe', 'inherit', 'inherit'], detached: true },
)
let stopped = false
process.on('SIGINT', () => {
  if (stopped) process.exit(130)
  stopped = true
  console.log('\nStopping: finishing the video so far (Ctrl-C again to abort)…')
})

let elapsed = 0 // virtual ms
let frames = 0
const spoken = [] // { text, at } in seconds of video
let lastKey = -1
async function step() {
  const target = Math.round(((frames + 1) * 1000) / fps)
  await page.clock.runFor(target - elapsed)
  elapsed = target
  const line = await page.evaluate((ms) => {
    window.__advanceAnimations(ms)
    return window.systemview.line()
  }, 1000 / fps)
  if (line.key !== lastKey && line.text) spoken.push({ text: line.text, at: frames / fps })
  lastKey = line.key
  // Playwright's screenshot honours the device scale; a raw CDP capture comes back at CSS size.
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 95, scale: 'device', caret: 'initial' })
  if (!ffmpeg.stdin.write(jpeg)) await new Promise((r) => ffmpeg.stdin.once('drain', r))
  frames++
  if (frames % fps === 0) {
    const s = frames / fps
    process.stdout.write(`\r  ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} rendered`)
  }
}

const started = Date.now()
console.log(`Rendering ${Math.round(css.width * scale)}×${res} @ ${fps} fps, ${scheme} → ${out}`)
const going = () => frames < limit && !stopped
while (frames < HOLD_START * fps && going()) await step()
await page.evaluate(() => { window.systemview.tour() })
while (going() && (await page.evaluate(() => window.systemview.touring()))) await step()
for (let i = 0; i < HOLD_END * fps && going(); i++) await step()

ffmpeg.stdin.end()
const code = await new Promise((r) => ffmpeg.on('close', r))
if (code !== 0) throw new Error(`ffmpeg exited with ${code}; partial output left at ${partial}`)
await addVoice()
await browser.close()
await server.close()
console.log(`\n${frames} frames (${(frames / fps).toFixed(1)} s of video) in ${((Date.now() - started) / 60000).toFixed(1)} min → ${out}`)

// ------------------------------------------------------------ voice

async function addVoice() {
  const manifest = 'public/voice/manifest.json'
  const clips = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).lines : {}
  // A line replaced before its clip ends is cut where the next one starts.
  const parts = spoken
    .map((s, i) => ({ ...s, clip: clips[s.text], until: spoken[i + 1]?.at ?? Infinity }))
    .filter((p) => p.clip && p.until > p.at)
  if (!parts.length) return renameSync(partial, out)

  const inputs = parts.flatMap((p) => ['-i', `public/voice/${p.clip.file}`])
  const chains = parts.map((p, i) => {
    const trim = Number.isFinite(p.until) ? `atrim=0:${(p.until - p.at).toFixed(3)},` : ''
    return `[${i + 1}:a]${trim}adelay=${Math.round(p.at * 1000)}:all=1[v${i}]`
  })
  const mix = `${parts.map((_, i) => `[v${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,apad[a]`
  const voiced = out.replace(/\.mp4$/, '.voiced.mp4')
  const code = await new Promise((r) =>
    spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', partial, ...inputs, '-filter_complex', [...chains, mix].join(';'),
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', voiced],
    { stdio: 'inherit' }).on('close', r),
  )
  if (code !== 0) throw new Error(`mixing the voice failed (ffmpeg ${code}); silent video left at ${partial}`)
  renameSync(voiced, out)
  rmSync(partial)
  console.log(`\n  voice: ${parts.length} lines`)
}
