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
}
export interface Curve {
  p0: Pt
  c0: Pt
  c1: Pt
  p1: Pt
}

const isBox = (id: string) => !['source', 'sink'].includes(NODES[id].kind)

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
    const c = sideCenter(r, side)
    ends.forEach((end, i) => {
      const off = (i - (ends.length - 1) / 2) * gap
      ports.set(`${end.edge.id}|${end.end}`, vertical ? { x: c.x, y: c.y + off } : { x: c.x + off, y: c.y })
    })
  }

  const out: Record<string, Curve> = {}
  for (const e of edges) {
    const ra = rect(e.from)
    const rb = rect(e.to)
    if (!ra || !rb) continue
    const p0 = e.viaFrom
      ? ports.get(`${e.viaFrom}|to`)
      : isBox(e.from)
        ? ports.get(`${e.id}|from`)
        : pointAnchor(e.from, ra, true)
    let p1 = e.viaTo ? ports.get(`${e.viaTo}|from`) : isBox(e.to) ? ports.get(`${e.id}|to`) : pointAnchor(e.to, rb, false)
    if (!p0 || !p1) continue
    // Edges arriving from above stop short of the caption that sits over the box.
    if (sideOf(e, 'to') === 'top' && isBox(e.to) && (e.kind === 'pressure' || e.kind === 'involves')) p1 = { x: p1.x, y: p1.y - 19 * rb.s }
    // Edges entering from the boundary travel inward: flip the boundary-side tangent.
    const t0 = e.viaFrom ? tangent.right : tangent[sideOf(e, 'from')]
    const t1 = e.viaTo ? tangent.left : tangent[sideOf(e, 'to')]
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const k = Math.min(dist * 0.48, 220)
    out[e.id] = {
      p0,
      c0: { x: p0.x + t0.x * k, y: p0.y + t0.y * k },
      c1: { x: p1.x + t1.x * k, y: p1.y + t1.y * k },
      p1,
    }
  }
  return out
}

export function bezier(c: Curve, t: number): Pt {
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

export function curveLength(c: Curve): number {
  let len = 0
  let prev = c.p0
  for (let i = 1; i <= 10; i++) {
    const p = bezier(c, i / 10)
    len += Math.hypot(p.x - prev.x, p.y - prev.y)
    prev = p
  }
  return len
}

export function pathD(c: Curve): string {
  const r = (n: number) => n.toFixed(2)
  return `M${r(c.p0.x)},${r(c.p0.y)} C${r(c.c0.x)},${r(c.c0.y)} ${r(c.c1.x)},${r(c.c1.y)} ${r(c.p1.x)},${r(c.p1.y)}`
}

