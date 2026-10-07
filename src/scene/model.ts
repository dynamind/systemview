// The vocabulary every world is written in: what kinds of thing exist, how they
// relate, how big they draw, and what a world has to provide to be shown.

import type { Scene } from './useScene'

export type Valence = 'desired' | 'undesired' | 'unknown' | 'neutral'
export type Kind =
  | 'system'
  | 'part'
  | 'source'
  | 'sink'
  | 'problem'
  | 'solution'
  | 'rule'
  | 'hypothesis'
  | 'context'
  /** What someone actually wants: a rung on the ladder of “what is this for?” */
  | 'need'
export type Strategy = 'eliminate' | 'transform' | 'contain' | 'shift' | 'accept' | 'reverse'
export type Side = 'left' | 'right' | 'top' | 'bottom'

export interface NodeDef {
  id: string
  kind: Kind
  label: string
  note?: string
  valence?: Valence
  strategy?: Strategy
  /** Undesirable that is hard to address because it spreads beyond reach. */
  diffuse?: boolean
  /** Lineage: what this thing exists for or comes from. */
  parent?: string
  relation?: string
  why?: string
  pattern?: string
  /** Who chose this solution: every solution is someone’s hypothesis. */
  by?: string
  /** A rule designed as a solution, the mirror image of a rule that makes a problem. */
  byRule?: boolean
  /** A named output that condensed out of the fog: drawn as a cloud shrinking into a dot. */
  condenses?: boolean
  /** The caption over a box, in place of what its kind would say. */
  tag?: string
  /** Output: the worst gap it makes at an input it reaches, which colors its note. */
  gap?: 'pain' | 'refused'
  /** Solution: stands for many of its kind, drawn as a stack. */
  many?: boolean

  // Statements only derived worlds read (see derive.ts).
  /** Problem: the rule that makes it one. Solution on a ladder: the rule that made it the sensible answer. */
  pressedBy?: string
  /** Condensing output: the input whose people traced it. */
  tracedBy?: string
  /** Other words people use for it. */
  aka?: string[]
  /** Problem: the question that opens it. Solution: the question that brings it forward. Need: the question that climbs to it. Rule: the question that changes it. */
  ask?: string
  /** Problem: said when it first opens. Solution: said when swapped in. Condensing output: said when it surfaces. Need: said on arrival. Rule: said when it changes. */
  says?: string
  /** Problem: said when it's opened again. */
  again?: string
  /** Output with a problem: said on the first look, before the problem opens; the next look opens it. First alternative on a ladder: said when the alternatives come up. */
  prelude?: string
  /** Rule on a ladder: said when someone reaches for an answer it still keeps off the table. */
  blocked?: string

  // Finishing touches by hand, for derived worlds.
  /** Part: where it sits inside the box. */
  at?: [x: number, y: number]
  /** Problem: moves its branch from where the layout would put it. */
  nudge?: [dx: number, dy: number]
}

export interface EdgeDef {
  id: string
  from: string
  to: string
  /** serves: a means rising to the end it's for. */
  kind: 'flow' | 'becomes' | 'solves' | 'pressure' | 'speculates' | 'involves' | 'serves'
  valence?: Valence
  fromSide?: Side
  toSide?: Side
  /** Anchor this end at the system-side port of another edge (boundary balance). */
  viaFrom?: string
  viaTo?: string
  inner?: boolean
  /** A loop back: the edge runs along a lane at the bottom of this frame, under the machines in it. */
  under?: string
  /** The edge runs level from its start and turns only at the end, where it merges with the other flows into its end. */
  late?: boolean
}

/** What every world's scene state has; the rest is the world's own. */
export interface BaseState {
  zoom: 'root' | 'inside'
  focus: string | null
  hover: string | null
}

// ---------------------------------------------------------------- sizing

export const FONT = { system: 17, part: 4.6, label: 12.5, box: 13.5 }

export function textWidth(s: string, size: number): number {
  return s.length * size * 0.54
}

export function sizeOf(n: NodeDef): { w: number; h: number } {
  switch (n.kind) {
    case 'system':
      return { w: 280, h: 180 }
    case 'part':
      return { w: Math.max(42, textWidth(n.label, FONT.part) + 12), h: 15 }
    case 'problem':
    case 'need':
      return { w: 176, h: 46 }
    case 'solution':
      return { w: 150, h: 40 }
    case 'rule':
      return { w: 176, h: 30 }
    case 'hypothesis':
      return { w: 250, h: 50 }
    default:
      return { w: textWidth(n.label, FONT.label), h: 16 }
  }
}

// ---------------------------------------------------------------- composition

export interface NodeTarget {
  x: number
  y: number
  w: number
  h: number
  /** opacity, scale, frame-ness (box seen from inside), ghost-ness, dimmed-ness, reversed-ness */
  o: number
  s: number
  f: number
  g: number
  d: number
  r: number
  delay: number
  /** Where a newly appearing node grows out of. */
  from?: string
}

export interface EdgeTarget {
  o: number
  /** draw-on progress */
  p: number
  g: number
  d: number
  delay: number
}

export interface Composition {
  nodes: Record<string, NodeTarget>
  edges: Record<string, EdgeTarget>
}

export function lineage(nodes: Record<string, NodeDef>, id: string): string[] {
  const chain: string[] = []
  let cur: string | undefined = id
  while (cur && !chain.includes(cur)) {
    chain.push(cur)
    cur = nodes[cur]?.parent
  }
  return chain
}

/** Places nodes by id; `column` centers a list on cy. */
export function placer(nodes: Record<string, NodeDef>, out: Composition) {
  const put = (id: string, x: number, y: number, extra: Partial<NodeTarget> = {}) => {
    const { w, h } = sizeOf(nodes[id])
    out.nodes[id] = { x, y, w, h, o: 1, s: 1, f: 0, g: 0, d: 0, r: 0, delay: 0, ...extra }
  }
  const column = (ids: string[], x: number, cy: number, gap: number, extra: (i: number) => Partial<NodeTarget>) =>
    ids.forEach((id, i) => put(id, x, cy + (i - (ids.length - 1) / 2) * gap, extra(i)))
  return { put, column }
}

/** The part of composing every world shares: edges between placed nodes, hover, and focus. */
export function finish(out: Composition, s: BaseState, nodes: Record<string, NodeDef>, edges: EdgeDef[]) {
  for (const e of edges) {
    const a = out.nodes[e.from]
    const b = out.nodes[e.to]
    if (!a || !b) continue
    if (e.inner && s.zoom !== 'inside') continue
    out.edges[e.id] = {
      o: 1,
      p: 1,
      // A reversed solution stops being fed by its problem, and stops producing.
      // A rung nobody needs any more leaves the links to it ghosted, above and below,
      // and what it left behind goes quiet with it.
      g: e.kind === 'solves' || e.kind === 'speculates' ? Math.max(b.g, b.r) : e.kind === 'serves' ? Math.max(a.g, b.g) : e.kind === 'flow' ? a.g : 0,
      // What condensed out of a reversed solution stays lit: it's the lesson.
      d: Math.max(a.r, b.r) > 0 && !nodes[e.to].condenses ? 0.6 : 0,
      delay: Math.max(a.delay, b.delay) + (e.inner ? 120 : 60),
    }
  }

  // Hover lifts, focus dims everything off the purpose path. An open frame stays put: its machines don't lift with it.
  if (s.hover && out.nodes[s.hover] && nodes[s.hover].kind !== 'system' && out.nodes[s.hover].f < 0.5) out.nodes[s.hover].s *= 1.045
  if (s.focus) {
    const path = new Set(lineage(nodes, s.focus))
    for (const [id, t] of Object.entries(out.nodes)) if (!path.has(id)) t.d = 1
    for (const e of edges) {
      const t = out.edges[e.id]
      if (!t) continue
      if (!(path.has(e.from) && path.has(e.to))) t.d = 1
    }
  }
  return out
}

// ---------------------------------------------------------------- worlds

export interface Suggestion {
  label: string
  run: () => void
}

/** What the story shell hands a world's script. */
export interface Kit<S extends BaseState> {
  scene: Scene
  state: S
  say: (text: string, spoken?: boolean) => void
  /** Recompose now and frame these nodes. */
  settle: (view: string[] | 'all', pad?: number, max?: number) => void
}

/** A world's conversational side: what it does when clicked, asked, or narrated. */
export interface Script {
  intro: string
  actions: {
    overview(): void
    open(): void
    why(id: string, text?: string): void
    clearFocus(): void
  }
  click(id: string): void
  /** A click on the empty canvas. Without it, the canvas zooms back out or lets go of the focus. */
  background?(): void
  /** Lower-cased, trimmed, non-empty. */
  ask(text: string): void
  suggestions(): Suggestion[]
  /** The narrated tour, one step per line. */
  tour: (() => void)[]
}

export interface Domain<S extends BaseState = BaseState> {
  id: string
  /** The system's name, for the header. */
  title: string
  /** What the system is for, closing every purpose path. */
  goal: string
  /** The id of the system box. */
  system: string
  NODES: Record<string, NodeDef>
  EDGES: EdgeDef[]
  initialState(): S
  compose(s: S): Composition
  script(kit: Kit<S>): Script
  /** How close the camera may come when framing (default 2.2): worlds with few boxes keep them life-size. */
  maxZoom?: number
  /** The purpose path stops where the canvas does: for worlds that reveal a lineage one step at a time. */
  visiblePath?: boolean
  /** Every line the script can say, for worlds whose lines are built rather than written out. */
  lines?(): string[]
}
