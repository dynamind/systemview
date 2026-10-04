<script setup lang="ts">
// Canvas layer for everything that moves every frame: the dot grid, the fog of
// unknowns, and the particles on flows. Drawn imperatively so Vue stays idle.
// This is also the slot a WebGPU renderer would take over later.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { bezier } from '../scene/geometry'
import type { Scene } from '../scene/useScene'
import { EDGES, NODES, type Valence } from '../scene/world'

const props = defineProps<{ scene: Scene; layer: 'back' | 'front' }>()
const sc = props.scene
const canvas = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let dpr = 1
const RENDER = new URLSearchParams(location.search).has('render')

// ------------------------------------------------------------ colours

const colors: Record<string, string> = {}
const media = window.matchMedia('(prefers-color-scheme: dark)')
function readColors() {
  const css = getComputedStyle(document.documentElement)
  for (const k of ['desired', 'undesired', 'unknown', 'neutral', 'hair']) colors[k] = css.getPropertyValue(`--${k}`).trim()
}

function resize() {
  const el = canvas.value
  if (!el) return
  // Capped for frame rate, except when rendering video frames (?render), where sharpness wins.
  dpr = Math.min(window.devicePixelRatio || 1, RENDER ? 4 : 2)
  el.width = Math.round(sc.viewport.w * dpr)
  el.height = Math.round(sc.viewport.h * dpr)
}

function setCamera() {
  const a = sc.screenArea()
  const z = sc.zoom()
  ctx!.setTransform(dpr * z, 0, 0, dpr * z, dpr * (a.cx - sc.camera.get('x') * z), dpr * (a.cy - sc.camera.get('y') * z))
  return z
}

// ------------------------------------------------------------ back: grid + fog

function drawGrid(z: number) {
  // Coarser grid when zoomed out, so dots never crowd closer than ~16px.
  let step = 40
  while (step * z < 16) step *= 2
  const a = sc.screenArea()
  const x0 = sc.camera.get('x') - a.cx / z
  const y0 = sc.camera.get('y') - a.cy / z
  const x1 = x0 + sc.viewport.w / z
  const y1 = y0 + sc.viewport.h / z
  const r = 0.9 / z
  const c = ctx!
  c.fillStyle = colors.hair
  c.beginPath()
  for (let x = Math.floor(x0 / step) * step + step / 2; x < x1 + step; x += step)
    for (let y = Math.floor(y0 / step) * step + step / 2; y < y1 + step; y += step) {
      c.moveTo(x + r, y)
      c.arc(x, y, r, 0, Math.PI * 2)
    }
  c.fill()
}

const born = new Map<string, number>()

function drawFog() {
  const t = sc.time()
  let i = 0
  for (const [id, a] of sc.nodeAnims) {
    const def = NODES[id]
    const hypo = def.kind === 'hypothesis'
    const g = a.get('g')
    // A named output born from the fog: the cloud shrinks as the dot appears.
    if (def.condenses && sc.composition().nodes[id]) {
      if (!born.has(id)) born.set(id, t)
      const k = Math.min(1, (t - born.get(id)!) / 1.8)
      const left = Math.max(1 - a.get('o'), 1 - k * k * (3 - 2 * k))
      if (left > 0.01) cloud(a.get('x'), a.get('y'), 10 + 30 * left, 8 + 22 * left, 0.3 * left)
      continue
    }
    if (def.condenses) born.delete(id)
    if (def.valence !== 'unknown' && !(hypo && g > 0.02)) continue
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.7 + i++ * 1.9)
    const op = a.get('o') * (1 - 0.8 * a.get('d')) * (hypo ? g : 1) * (0.1 + 0.06 * breathe)
    if (op < 0.003) continue
    const rx = hypo ? a.get('w') * 0.55 : 22 + 4 * breathe
    const ry = hypo ? a.get('h') * 0.9 : 16 + 3 * breathe
    cloud(hypo ? a.get('x') : a.get('x') + 6, a.get('y'), rx, ry, op)
  }
}

/** A soft-edged ellipse: the gradient reaches past the shape the way a blur would. */
function cloud(x: number, y: number, rx: number, ry: number, op: number) {
  const c = ctx!
  const reach = 1 + 30 / Math.min(rx, ry)
  c.save()
  c.translate(x, y)
  c.scale(rx, ry)
  const grad = c.createRadialGradient(0, 0, 0, 0, 0, reach)
  grad.addColorStop(0, withAlpha(colors.unknown, op))
  grad.addColorStop(0.45 / reach + 0.2, withAlpha(colors.unknown, op * 0.85))
  grad.addColorStop(1, withAlpha(colors.unknown, 0))
  c.fillStyle = grad
  c.fillRect(-reach, -reach, reach * 2, reach * 2)
  c.restore()
}

function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}

// ------------------------------------------------------------ front: particles

// Each edge integrates its own phase, so a change in length (a hovered box
// growing a little) changes speed slightly instead of making particles jump.
const flow = new Map<string, { phase: number; count: number }>()

function drawParticles(z: number, dt: number) {
  const t = sc.time()
  const c = ctx!
  const { curves, lengths } = sc.geometry
  const batches = new Map<string, { color: string; alpha: number; pts: number[] }>()

  EDGES.forEach((e, idx) => {
    const a = sc.edgeAnims.get(e.id)
    const curve = curves[e.id]
    if (!a || !curve) return flow.delete(e.id)
    const g = a.get('g')
    const carries = e.kind === 'flow' || e.kind === 'becomes' || ((e.kind === 'solves' || e.kind === 'serves') && g < 0.5)
    const op = a.get('o') * (1 - 0.82 * a.get('d'))
    if (!carries || op < 0.05) return

    const len = Math.max(lengths[e.id], 1)
    const spacing = e.inner ? 15 : 64
    const speed = e.inner ? 8 : 34
    let f = flow.get(e.id)
    const ideal = Math.max(1, Math.min(9, len / spacing))
    if (!f) flow.set(e.id, (f = { phase: (idx * 0.618) % 1, count: Math.round(ideal) }))
    // Hysteresis: the particle count only changes when the length clearly calls for it.
    else if (Math.abs(ideal - f.count) > 0.75) f.count = Math.max(1, Math.round(ideal))
    f.phase = (f.phase + (dt * speed) / len) % 1

    const valence: Valence = e.valence ?? 'neutral'
    const alpha = Math.round(op * (1 - g) * 20) / 20
    if (alpha <= 0) return
    const key = valence + alpha
    let b = batches.get(key)
    if (!b) batches.set(key, (b = { color: colors[valence], alpha, pts: [] }))
    const p = Math.min(1, Math.max(0, a.get('p')))
    const base = (e.inner ? 1.5 : 1.9) / z
    for (let i = 0; i < f.count; i++) {
      const u = (f.phase + i / f.count) % 1
      if (u > p) continue
      if (valence === 'unknown' && Math.sin(t * 2.3 + i * 1.7 + idx) < -0.2) continue
      const pt = bezier(curve, u)
      b.pts.push(pt.x, pt.y, base * Math.pow(Math.sin(Math.PI * u), 0.35))
    }
  })

  for (const b of batches.values()) {
    c.globalAlpha = b.alpha
    c.fillStyle = b.color
    c.beginPath()
    for (let i = 0; i < b.pts.length; i += 3) {
      c.moveTo(b.pts[i] + b.pts[i + 2], b.pts[i + 1])
      c.arc(b.pts[i], b.pts[i + 1], b.pts[i + 2], 0, Math.PI * 2)
    }
    c.fill()
  }
  c.globalAlpha = 1
}

// ------------------------------------------------------------ frame

function draw(dt: number) {
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.value!.width, canvas.value!.height)
  const z = setCamera()
  if (props.layer === 'back') {
    drawGrid(z)
    drawFog()
  } else drawParticles(z, dt)
}

let off: (() => void) | undefined
onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  readColors()
  resize()
  media.addEventListener('change', readColors)
  off = sc.onFrame(draw)
})
watch(() => [sc.viewport.w, sc.viewport.h], resize)
onBeforeUnmount(() => {
  off?.()
  media.removeEventListener('change', readColors)
})
</script>

<template>
  <canvas ref="canvas" class="layer" :class="layer" :style="{ width: scene.viewport.w + 'px', height: scene.viewport.h + 'px' }" />
</template>

<style scoped>
.layer {
  position: fixed;
  inset: 0;
  display: block;
  pointer-events: none;
}
</style>
