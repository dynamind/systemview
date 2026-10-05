// Holds scene state, turns it into spring targets, and runs the frame loop.

import { onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue'
import { Animated, CAMERA } from '../motion/animator'
import { curveLength, layoutEdges, type Curve, type Rect } from './geometry'
import { domain, EDGES, NODES, type BaseState, type Composition } from './world'

type NodeKey = 'x' | 'y' | 'w' | 'h' | 'o' | 's' | 'f' | 'g' | 'd' | 'r'
type EdgeKey = 'o' | 'p' | 'g' | 'd'

export const SAFE = { top: 96, bottom: 270, side: 48 }
/** Bottom inset while narrating: the prompt and suggestions are hidden, so the scene gets the room. */
export const SAFE_BOTTOM_NARRATING = 170

export function useScene() {
  // Each world adds its own fields; the shell only touches the shared ones.
  const state = reactive(domain.initialState()) as BaseState
  const nodeAnims = new Map<string, Animated<NodeKey>>()
  const edgeAnims = new Map<string, Animated<EdgeKey>>()
  const camera = new Animated<'x' | 'y' | 'lz' | 'b'>({ x: 0, y: 0, lz: Math.log(0.4), b: SAFE.bottom }, CAMERA)
  const viewport = reactive({ w: window.innerWidth, h: window.innerHeight })
  const tick = shallowRef(0)
  let comp: Composition = { nodes: {}, edges: {} }
  let time = 0
  // Geometry is cached and only rebuilt while something in the scene moves.
  const geometry = { rects: new Map<string, Rect>(), curves: {} as Record<string, Curve>, lengths: {} as Record<string, number> }
  let dirty = true
  const frameHooks = new Set<(dt: number) => void>()

  const now = () => time * 1000

  function apply() {
    comp = domain.compose(state)
    for (const [id, t] of Object.entries(comp.nodes)) {
      let a = nodeAnims.get(id)
      const entering = !a || a.springs.o.target === 0
      if (!a) {
        const origin = t.from ? nodeAnims.get(t.from) : undefined
        a = new Animated<NodeKey>({
          x: origin ? origin.get('x') : t.x,
          y: origin ? origin.get('y') : t.y,
          w: t.w,
          h: t.h,
          o: 0,
          s: origin ? 0.35 : 0.9,
          f: t.f,
          g: t.g,
          d: t.d,
          r: t.r,
        })
        nodeAnims.set(id, a)
      }
      const delay = entering ? t.delay : 0
      a.set({ x: t.x, y: t.y, w: t.w, h: t.h, o: t.o, s: t.s }, now(), delay)
      a.set({ f: t.f, g: t.g, d: t.d, r: t.r }, now())
    }
    for (const [id, a] of nodeAnims) if (!comp.nodes[id]) a.set({ o: 0, s: 0.8 }, now())

    for (const [id, t] of Object.entries(comp.edges)) {
      let a = edgeAnims.get(id)
      const entering = !a || a.springs.o.target === 0
      if (!a) {
        a = new Animated<EdgeKey>({ o: 0, p: 0, g: t.g, d: t.d })
        edgeAnims.set(id, a)
      }
      if (entering) {
        a.springs.p.jump(0)
        a.set({ o: t.o, p: t.p }, now(), t.delay)
      }
      a.set({ g: t.g, d: t.d }, now())
    }
    for (const [id, a] of edgeAnims) if (!comp.edges[id]) a.set({ o: 0 }, now())
    dirty = true
    wake()
  }

  // ------------------------------------------------------------ camera

  function screenArea(bottom = camera.get('b')) {
    const w = viewport.w - SAFE.side * 2
    // The bottom inset is a spring too, so freeing up space eases the scene into it.
    const h = viewport.h - SAFE.top - bottom
    return { w, h, cx: viewport.w / 2, cy: SAFE.top + h / 2 }
  }

  function bboxOf(ids: string[]) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const id of ids) {
      const t = comp.nodes[id]
      if (!t) continue
      const kind = NODES[id].kind
      let l = t.x - t.w / 2, r = t.x + t.w / 2
      if (kind === 'sink') (l = t.x - 4), (r = t.x + 14 + t.w)
      if (kind === 'source') (l = t.x - 14 - t.w), (r = t.x + 4)
      const extraTop = kind === 'problem' || kind === 'solution' || kind === 'rule' ? 16 : 0
      const extraBottom = kind === 'solution' ? 18 : kind === 'sink' && NODES[id].note ? 12 : 0
      x0 = Math.min(x0, l)
      x1 = Math.max(x1, r)
      y0 = Math.min(y0, t.y - t.h / 2 - extraTop)
      y1 = Math.max(y1, t.y + t.h / 2 + extraBottom)
    }
    return { x0, y0, x1, y1 }
  }

  function frame(ids: string[] | 'all', pad = 24, maxZoom = domain.maxZoom ?? 2.2) {
    const list = ids === 'all' ? Object.keys(comp.nodes) : ids
    const b = bboxOf(list)
    if (!isFinite(b.x0)) return
    // Frame against where the inset is heading, not where it is mid-ease.
    const area = screenArea(camera.springs.b.target)
    const z = Math.min(area.w / (b.x1 - b.x0 + pad * 2), area.h / (b.y1 - b.y0 + pad * 2), maxZoom)
    camera.set({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, lz: Math.log(z) }, now())
    wake()
  }

  /** Moves the bottom edge of the framing area, keeping what's on screen centered in the new area. */
  function setBottomInset(px: number) {
    camera.set({ b: px }, now())
    wake()
  }

  const zoom = () => Math.exp(camera.get('lz'))

  function toWorld(sx: number, sy: number) {
    const a = screenArea()
    const z = zoom()
    return { x: (sx - a.cx) / z + camera.get('x'), y: (sy - a.cy) / z + camera.get('y') }
  }

  function wheel(sx: number, sy: number, dy: number) {
    const a = screenArea()
    const lz = Math.min(Math.max(camera.springs.lz.target - dy * 0.0016, Math.log(0.15)), Math.log(9))
    const z = Math.exp(lz)
    // Keep the world point under the cursor fixed, measured against where the camera is heading.
    const zt = Math.exp(camera.springs.lz.target)
    const wx = (sx - a.cx) / zt + camera.springs.x.target
    const wy = (sy - a.cy) / zt + camera.springs.y.target
    camera.set({ lz, x: wx - (sx - a.cx) / z, y: wy - (sy - a.cy) / z }, now())
    wake()
  }

  /**
   * Two fingers: the world points under them stay under them. Moves from
   * (ax, ay) at distance ad to (bx, by) at distance bd, with no easing.
   */
  function pinch(ax: number, ay: number, ad: number, bx: number, by: number, bd: number) {
    const a = screenArea()
    const z = zoom()
    const lz = Math.min(Math.max(Math.log((z * bd) / ad), Math.log(0.15)), Math.log(9))
    const z2 = Math.exp(lz)
    const wx = (ax - a.cx) / z + camera.get('x')
    const wy = (ay - a.cy) / z + camera.get('y')
    camera.springs.lz.jump(lz)
    camera.springs.x.jump(wx - (bx - a.cx) / z2)
    camera.springs.y.jump(wy - (by - a.cy) / z2)
    wake()
  }

  /** Moves the camera 1:1 with the pointer or trackpad, keeping any glide already in progress. */
  function pan(dx: number, dy: number) {
    const z = zoom()
    for (const [k, d] of [['x', dx], ['y', dy]] as const) {
      const sp = camera.springs[k]
      sp.value -= d / z
      sp.target -= d / z
    }
    wake()
  }

  function rebuildGeometry() {
    const rects = geometry.rects
    rects.clear()
    for (const [id, a] of nodeAnims) rects.set(id, { x: a.get('x'), y: a.get('y'), w: a.get('w'), h: a.get('h'), s: a.get('s') })
    geometry.curves = layoutEdges(
      EDGES.filter((e) => edgeAnims.has(e.id)),
      (id) => rects.get(id),
    )
    for (const [id, c] of Object.entries(geometry.curves)) geometry.lengths[id] = curveLength(c)
  }

  function onFrame(fn: (dt: number) => void) {
    frameHooks.add(fn)
    return () => frameHooks.delete(fn)
  }

  // ------------------------------------------------------------ loop

  let raf = 0
  let last = 0
  let running = false

  function loop(ts: number) {
    const dt = Math.min((ts - last) / 1000, 1 / 30)
    last = ts
    time += dt
    camera.step(dt, now())
    let moving = dirty
    for (const [id, a] of nodeAnims) {
      moving = a.step(dt, now()) || moving
      if (!comp.nodes[id] && a.get('o') < 0.002) (nodeAnims.delete(id), (moving = true))
    }
    for (const [id, a] of edgeAnims) {
      moving = a.step(dt, now()) || moving
      if (!comp.edges[id] && a.get('o') < 0.002) (edgeAnims.delete(id), (moving = true))
    }
    // Vue only re-renders while content moves; the camera and particles are drawn imperatively.
    if (moving) {
      rebuildGeometry()
      dirty = false
      tick.value++
    }
    for (const fn of frameHooks) fn(dt)
    // Particles keep flowing, so the loop never fully sleeps while the tab is visible.
    raf = requestAnimationFrame(loop)
  }

  function wake() {
    if (running) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }

  const onResize = () => {
    viewport.w = window.innerWidth
    viewport.h = window.innerHeight
  }

  onMounted(() => {
    window.addEventListener('resize', onResize)
    apply()
    frame('all', 40)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', onResize)
  })

  watch(state, apply, { deep: true })

  return {
    state,
    sync: apply,
    nodeAnims,
    edgeAnims,
    camera,
    viewport,
    tick,
    frame,
    zoom,
    toWorld,
    wheel,
    pinch,
    pan,
    screenArea,
    setBottomInset,
    geometry,
    onFrame,
    time: () => time,
    composition: () => comp,
  }
}

export type Scene = ReturnType<typeof useScene>
