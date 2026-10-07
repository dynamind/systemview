// Edge geometry: ports are spread along a box side in the order of whatever is
// at the other end, so flows never cross at the boundary.

import { NODES, type EdgeDef, type Side } from './world'

export interface Pt {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
  s: number
  /** How far the box is open: 0 is closed. */
  f?: number
}
export interface Cubic {
  p0: Pt
  c0: Pt
  c1: Pt
  p1: Pt
}
/** One cubic for most edges; a loop back takes three: down, along its lane, and up. */
export interface Curve {
  parts: Cubic[]
  lengths: number[]
}

/** How far the back box of a stack stands from the front box, as in SystemCanvas.vue. */
export const STACKED = 8

/** The room each loop back takes along the bottom of its frame. */
export const LANE = 7

const isBox = (id: string) => !['source', 'sink'].includes(NODES[id].kind)
// The same test as the caption in SystemCanvas.vue: a solution without a tag, a rule or a strategy shows none.
const hasCaption = (id: string) => {
  const n = NODES[id]
  return n.kind !== 'solution' || !!(n.tag || n.byRule || n.strategy)
}

function sideCenter(r: Rect, side: Side): Pt {
  const hw = (r.w * r.s) / 2
  const hh = (r.h * r.s) / 2
  switch (side) {
    case 'left':
      return { x: r.x - hw, y: r.y }
    case 'right':
      return { x: r.x + hw, y: r.y }
    case 'top':
      return { x: r.x, y: r.y - hh }
    case 'bottom':
      return { x: r.x, y: r.y + hh }
  }
}

function pointAnchor(id: string, r: Rect, outgoing: boolean): Pt {
  const n = NODES[id]
  // A sink's label sits to the right of its dot; flows leaving it start after the label.
  if (n.kind === 'sink' && outgoing) return { x: r.x + 12 + r.w * r.s, y: r.y }
  if (n.kind === 'source' && !outgoing) return { x: r.x - 12 - r.w * r.s, y: r.y }
  return { x: r.x, y: r.y }
}

const tangent: Record<Side, Pt> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

export function layoutEdges(edges: EdgeDef[], rect: (id: string) => Rect | undefined): Record<string, Curve> {
  // Group box-attached ends by (node, side).
  type End = { edge: EdgeDef; end: 'from' | 'to'; other: Pt }
  const groups = new Map<string, End[]>()
  const sideOf = (e: EdgeDef, end: 'from' | 'to'): Side => (end === 'from' ? (e.fromSide ?? 'right') : (e.toSide ?? 'left'))

  for (const e of edges) {
    for (const end of ['from', 'to'] as const) {
      const id = e[end]
      if (!isBox(id)) continue
      if ((end === 'from' && e.viaFrom) || (end === 'to' && e.viaTo)) continue
      const other = rect(end === 'from' ? e.to : e.from)
      if (!other) continue
      const key = `${id}|${sideOf(e, end)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ edge: e, end, other })
    }
  }

  const ports = new Map<string, Pt>() // `${edgeId}|from` -> point
  for (const [key, ends] of groups) {
    const [id, side] = key.split('|') as [string, Side]
    const r = rect(id)
    if (!r) continue
    const vertical = side === 'left' || side === 'right'
    ends.sort((a, b) => (vertical ? a.other.y - b.other.y : a.other.x - b.other.x))
    const length = (vertical ? r.h : r.w) * r.s
    const gap = Math.min(length / (ends.length + 1), NODES[id].kind === 'system' ? 30 : 9 * r.s + 4)
    // A closed stack gives out from its back box, so its outputs leave clear of the boxes in front.
    const back = side === 'right' && NODES[id].many && (r.f ?? 0) < 0.5 ? STACKED * r.s : 0
    const c0 = sideCenter(r, side)
    const c = { x: c0.x + back, y: c0.y + back }
    ends.forEach((end, i) => {
      const off = (i - (ends.length - 1) / 2) * gap
      ports.set(`${end.edge.id}|${end.end}`, vertical ? { x: c.x, y: c.y + off } : { x: c.x + off, y: c.y })
    })
  }

  // Loops back in one frame take a lane each: the widest runs lowest and turns widest, so loops nest.
  const lanes = new Map<string, { lane: number; of: number }>()
  const span = (e: EdgeDef) => (rect(e.from)?.x ?? 0) - (rect(e.to)?.x ?? 0)
  for (const frame of new Set(edges.filter((e) => e.under).map((e) => e.under!)))
    edges
      .filter((e) => e.under === frame)
      .sort((a, b) => span(b) - span(a))
      .forEach((e, i, all) => lanes.set(e.id, { lane: i, of: all.length }))

  const out: Record<string, Curve> = {}
  for (const e of edges) {
    const ra = rect(e.from)
    const rb = rect(e.to)
    if (!ra || !rb) continue
    let p0 = e.viaFrom
      ? ports.get(`${e.viaFrom}|to`)
      : isBox(e.from)
        ? ports.get(`${e.id}|from`)
        : pointAnchor(e.from, ra, true)
    let p1 = e.viaTo ? ports.get(`${e.viaTo}|from`) : isBox(e.to) ? ports.get(`${e.id}|to`) : pointAnchor(e.to, rb, false)
    if (!p0 || !p1) continue
    // A rung's link up starts above the caption that sits over it.
    if (e.kind === 'serves' && sideOf(e, 'from') === 'top') p0 = { x: p0.x, y: p0.y - 19 * ra.s }
    // Edges arriving from above stop short of the caption that sits over the box.
    if (sideOf(e, 'to') === 'top' && isBox(e.to) && hasCaption(e.to) && (e.kind === 'pressure' || e.kind === 'involves')) p1 = { x: p1.x, y: p1.y - 19 * rb.s }
    // Edges entering from the boundary travel inward: flip the boundary-side tangent.
    const t0 = e.viaFrom ? tangent.right : tangent[sideOf(e, 'from')]
    const t1 = e.viaTo ? tangent.left : tangent[sideOf(e, 'to')]
    const frame = e.under ? rect(e.under) : undefined
    if (frame) {
      const { lane, of } = lanes.get(e.id)!
      const y = frame.y + (frame.h / 2 - 8 - LANE * lane) * frame.s
      const a = { x: p0.x, y }
      const b = { x: p1.x, y }
      const turn = (from: Pt, to: Pt, dx: number) => {
        const r = (14 + 2 * LANE * (of - 1 - lane)) * frame.s * dx
        return { p0: from, c0: { x: from.x + r, y: from.y }, c1: { x: to.x + r, y: to.y }, p1: to }
      }
      out[e.id] = withLengths([turn(p0, a, 1), { p0: a, c0: a, c1: b, p1: b }, turn(b, p1, -1)])
      continue
    }
    // A long edge that merges late runs level and turns in a short stretch before its end.
    const dx = p1.x - p0.x
    const turn = Math.min(dx / 2, Math.max(60, Math.abs(p1.y - p0.y) * 3))
    if (e.late && dx > 0 && turn < dx / 2) {
      const m = { x: p1.x - turn, y: p0.y }
      out[e.id] = withLengths([
        { p0, c0: p0, c1: m, p1: m },
        { p0: m, c0: { x: m.x + turn / 2, y: m.y }, c1: { x: p1.x - turn / 2, y: p1.y }, p1 },
      ])
      continue
    }
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const k = Math.min(dist * 0.48, 220)
    out[e.id] = withLengths([
      {
        p0,
        c0: { x: p0.x + t0.x * k, y: p0.y + t0.y * k },
        c1: { x: p1.x + t1.x * k, y: p1.y + t1.y * k },
        p1,
      },
    ])
  }
  return out
}

function withLengths(parts: Cubic[]): Curve {
  return { parts, lengths: parts.map(cubicLength) }
}

function point(c: Cubic, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const d = 3 * u * t * t
  const e = t * t * t
  return {
    x: a * c.p0.x + b * c.c0.x + d * c.c1.x + e * c.p1.x,
    y: a * c.p0.y + b * c.c0.y + d * c.c1.y + e * c.p1.y,
  }
}

/** The point at a fraction t of the length of the whole curve. */
export function bezier(c: Curve, t: number): Pt {
  let at = t * curveLength(c)
  for (let i = 0; i < c.parts.length; i++) {
    const l = c.lengths[i]
    if (at <= l || i === c.parts.length - 1) return point(c.parts[i], l ? Math.min(1, at / l) : 0)
    at -= l
  }
  return c.parts[0].p0
}

export function curveLength(c: Curve): number {
  return c.lengths.reduce((a, b) => a + b, 0)
}

function cubicLength(c: Cubic): number {
  let len = 0
  let prev = c.p0
  for (let i = 1; i <= 10; i++) {
    const p = point(c, i / 10)
    len += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  return len
}

export function pathD(c: Curve): string {
  const r = (n: number) => n.toFixed(2)
  const p0 = c.parts[0].p0
  return `M${r(p0.x)},${r(p0.y)}` + c.parts.map((p) => ` C${r(p.c0.x)},${r(p.c0.y)} ${r(p.c1.x)},${r(p.c1.y)} ${r(p.p1.x)},${r(p.p1.y)}`).join('')
}

