// A world derived from statements. The author writes what things are and how
// they relate ("escaped bugs: output of the team", "QA sign-off: solves
// customers find the bugs"), plus whatever only a person can say: why each
// thing exists, and the lines worth saying in their own words. Everything else
// is worked out here: the flows, the layout, what a click does, what to suggest
// next, the narration nobody wrote, and the narrated tour.
//
// The reading of each statement:
//   system                       the black box; exactly one
//   source, parent = system      an input crossing the boundary
//   source, parent = solution    an input that solution needs (a question of its own)
//   sink, parent = system        an output of the system; valence says how it’s seen
//   sink, parent = solution      what that solution leaves behind
//   sink, condenses              an output nobody named, until it surfaces
//   part, parent = system        inside the box; flows between parts come from `inner`
//   problem, parent = sink       an output that became a problem; pressedBy: the rule that made it one
//   problem, parent = system     a problem that arises inside; it opens below the system
//   solution, parent = problem   one answer; the first listed is the one in front
//   rule, parent = context       someone else’s solution, landing here as a problem
//   hypothesis                   a guess about the system’s unknown output

import {
  finish,
  lineage,
  placer,
  sizeOf,
  type BaseState,
  type Composition,
  type Domain,
  type EdgeDef,
  type Kit,
  type NodeDef,
  type NodeTarget,
  type Script,
  type Suggestion,
  type Valence,
} from './model'

export interface World {
  id: string
  title: string
  goal: string
  /** How the narration names the system: “the team”. */
  who: string
  intro: string
  /** Said on opening the box. */
  inside: string
  outro: string
  nodes: NodeDef[]
  /** Flows inside the box: from an input or part, to a part or output. Parts are listed in flow order. */
  inner: [from: string, to: string, valence?: Valence, extra?: Partial<EdgeDef>][]
  /**
   * The narrated tour, in the order the story tells it: a problem opens (an experiment plays through, and the
   * alternatives get tried unless the tour names them), a solution is swapped in, an output with a prelude is
   * looked at, and 'fog' shows the guesses and confirms the first.
   */
  tour: string[]

  // Finishing touches by hand: each one optional.
  /** Inputs and outputs in the order they're drawn, where flow order doesn't say it best. */
  boundary?: string[]
  /** Words that lead straight to a node, checked in order before anything else is matched. */
  intents?: [RegExp, string][]
  /** The tour's closing line, in place of the derived chain. */
  chain?: string
}

export interface DerivedState extends BaseState {
  /** Problems on the canvas. */
  open: string[]
  /** For each problem, the solution in front (the first listed if absent). */
  choice: Record<string, string>
  /** Condensing outputs that have surfaced. */
  revealed: string[]
  fog: boolean
  promoted: string[]
}

// Lines no world needs to write: they hold for any system.
const OVERVIEW = 'The whole machine, as far as we’ve drawn it. Every box here exists because of something to its left.'
const FOG_ALL =
  'Every box has an output nobody can name at design time. These are guesses, not facts, each matched to a pattern that has caught systems out before. Click one to make it a known undesirable.'
const FOG_SOME = 'Some guesses are confirmed now, and sit with the other outputs. The rest are still guesses, not facts. Click one to make it a known undesirable.'
const FOG_NONE = 'Every guess here has been confirmed, and joined the other outputs. The question mark stays anyway: there is always an output nobody has named yet.'
const WHICH = 'Which part? Name it, or click it, and I’ll trace what it’s there for.'
const LOST = 'This prototype follows a scripted story, so I only understand a little. Try a suggestion below, or click anything on the canvas.'

/** Lower-cases a label's first letter for use mid-sentence, unless it's an acronym (QA). */
const low = (s: string) => (/^[A-Z][a-z’']/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five']

export function derive(w: World): Domain<DerivedState> {
  // ------------------------------------------------------------ the model

  const nodes = [...w.nodes]
  const system = nodes.find((n) => n.kind === 'system')!.id
  const fogSink = nodes.find((n) => n.kind === 'sink' && n.parent === system && n.valence === 'unknown')?.id
  const hypotheses = nodes.filter((n) => n.kind === 'hypothesis').map((n) => n.id)

  // A confirmed guess joins the system's other outputs: same name, now a fact.
  const named = (h: string) => `${h}Named`
  for (const id of hypotheses) {
    const h = nodes.find((n) => n.id === id)!
    nodes.push({ id: named(id), kind: 'sink', label: h.label, note: h.pattern, valence: 'undesired', parent: system, relation: 'output of', why: h.why })
  }

  const N: Record<string, NodeDef> = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const childrenOf = (id: string, kind: NodeDef['kind']) => nodes.filter((n) => n.parent === id && n.kind === kind).map((n) => n.id)
  const outputsOf = (id: string) => childrenOf(id, 'sink')
  const inputsOf = (id: string) => childrenOf(id, 'source')
  const problemsOf = (id: string) => childrenOf(id, 'problem')
  const solutionsOf = (id: string) => childrenOf(id, 'solution')
  const sources = nodes.filter((n) => n.kind === 'source' && (!n.parent || n.parent === system)).map((n) => n.id)
  const parts = childrenOf(system, 'part')
  const isNamed = (id: string) => hypotheses.some((h) => named(h) === id)
  const plainOutputs = outputsOf(system).filter((id) => id !== fogSink && !isNamed(id))
  /** Problems that open from the system's own outputs, or inside it. */
  const topProblems = nodes.filter((n) => n.kind === 'problem' && (n.parent === system || N[n.parent!]?.parent === system)).map((n) => n.id)
  const condensing = (sol: string) => outputsOf(sol).filter((o) => N[o].condenses)
  /** The problem a node hangs under, at the top level. */
  const topOf = (id: string) => [...lineage(N, id)].reverse().find((c) => topProblems.includes(c))

  // Parts sit in flow order, zig-zagging so neighbours never share a line.
  const rank: Record<string, number> = Object.fromEntries(parts.map((p) => [p, 0]))
  for (const [a, b] of w.inner)
    if (parts.includes(a) && parts.includes(b) && parts.indexOf(a) < parts.indexOf(b)) rank[b] = Math.max(rank[b], rank[a] + 1)
  const maxRank = Math.max(1, ...Object.values(rank))
  const partAt: Record<string, { x: number; y: number }> = {}
  const shared: Record<number, number> = {}
  for (const id of parts) {
    const r = rank[id]
    const k = (shared[r] = (shared[r] ?? -1) + 1)
    const [x, y] = N[id].at ?? [-110 + (r * 220) / maxRank, (r % 2 ? 24 : -24) + k * 26]
    partAt[id] = { x, y }
  }
  // Inputs and outputs line up with where they land inside, so the flows through the boundary don't cross.
  const landing = (id: string, end: 0 | 1) => {
    const at = w.inner.filter((f) => f[end] === id).map((f) => partAt[f[1 - end] as string]).find(Boolean)
    return at ? at.y * 1000 + (end ? -at.x : at.x) : Infinity
  }
  const told = (id: string) => (w.boundary?.includes(id) ? w.boundary.indexOf(id) : Infinity)
  const byLanding = (ids: string[], end: 0 | 1) =>
    ids
      .map((id, i) => ({ id, k: landing(id, end), i }))
      .sort((a, b) => told(a.id) - told(b.id) || a.k - b.k || a.i - b.i)
      .map((e) => e.id)
  sources.splice(0, Infinity, ...byLanding(sources, 0))
  plainOutputs.splice(0, Infinity, ...byLanding(plainOutputs, 1))

  // ------------------------------------------------------------ flows

  const edges: EdgeDef[] = []
  const flow = (from: string, to: string, valence: Valence, extra: Partial<EdgeDef> = {}) =>
    edges.push({ id: `f:${from}>${to}`, from, to, kind: 'flow', valence, ...extra })

  for (const id of sources) flow(id, system, 'neutral')
  for (const n of nodes) {
    const p = n.parent ? N[n.parent] : undefined
    if (n.kind === 'sink' && p) flow(p.id, n.id, n.valence ?? 'neutral')
    if (n.kind === 'source' && p?.kind === 'solution') flow(n.id, p.id, 'neutral', { toSide: 'top' })
    if (n.kind === 'problem' && p && p.id !== system)
      edges.push({ id: `b:${p.id}>${n.id}`, from: p.id, to: n.id, kind: 'becomes', valence: 'undesired', toSide: p.kind === 'source' ? 'bottom' : undefined })
    if (n.kind === 'problem' && n.pressedBy)
      edges.push({ id: `p:${n.pressedBy}>${n.id}`, from: n.pressedBy, to: n.id, kind: 'pressure', fromSide: 'bottom', toSide: 'top' })
    if (n.kind === 'solution' && p) edges.push({ id: `s:${p.id}>${n.id}`, from: p.id, to: n.id, kind: 'solves', valence: 'undesired' })
    if (n.kind === 'hypothesis' && p) edges.push({ id: `q:${p.id}>${n.id}`, from: p.id, to: n.id, kind: 'speculates' })
    if (n.tracedBy) edges.push({ id: `t:${n.tracedBy}>${n.id}`, from: n.tracedBy, to: n.id, kind: 'involves', toSide: 'top' })
  }
  // Inside: a flow from an input enters where that input crosses the boundary; one to an output leaves where it does.
  for (const [a, b, valence = 'neutral', extra] of w.inner) {
    const fromIn = sources.includes(a)
    const toOut = N[b].kind === 'sink'
    edges.push({
      id: `i:${a}>${b}`,
      from: fromIn ? system : a,
      to: toOut ? system : b,
      kind: 'flow',
      valence,
      inner: true,
      viaFrom: fromIn ? `f:${a}>${system}` : undefined,
      viaTo: toOut ? `f:${system}>${b}` : undefined,
      // A loop back runs underneath the parts it skips.
      ...(parts.includes(a) && parts.includes(b) && rank[b] <= rank[a] ? { fromSide: 'bottom' as const, toSide: 'bottom' as const } : {}),
      ...extra,
    })
  }

  // ------------------------------------------------------------ what's shown

  const chosenOf = (s: DerivedState, p: string) => s.choice[p] ?? solutionsOf(p)[0]
  /** What a solution leaves behind, as far as anyone knows: what surfaced first, where its line can reach it. */
  const shownOutputs = (s: DerivedState, sol: string) => {
    const outs = outputsOf(sol).filter((o) => !N[o].condenses || s.revealed.includes(o))
    return [...outs.filter((o) => N[o].condenses), ...outs.filter((o) => !N[o].condenses)]
  }
  /** A solution is reversed when the problem it caused is being answered by undoing it. */
  const reversed = (s: DerivedState, sol: string) =>
    outputsOf(sol).some((o) => problemsOf(o).some((p) => s.open.includes(p) && N[chosenOf(s, p)].strategy === 'reverse'))

  function branchIds(s: DerivedState, p: string): string[] {
    const sol = chosenOf(s, p)
    const ends = [...inputsOf(sol), ...shownOutputs(s, sol)]
    const ids = [p, ...(N[p].pressedBy ? [N[p].pressedBy!] : []), ...solutionsOf(p), ...ends]
    for (const x of ends) for (const c of problemsOf(x)) if (s.open.includes(c)) ids.push(...branchIds(s, c))
    return ids
  }
  const branchView = (s: DerivedState, p: string) => [...(N[p].parent === system ? [] : [N[p].parent!]), ...branchIds(s, p)]

  // ------------------------------------------------------------ layout

  interface Placed {
    id: string
    x: number
    y: number
    extra: Partial<NodeTarget>
  }
  const extent = (it: Placed) => {
    const n = N[it.id]
    const { h } = sizeOf(n)
    const top = ['problem', 'solution', 'rule'].includes(n.kind) ? 16 : 0
    const bottom = n.kind === 'solution' ? 18 : n.kind === 'sink' && n.note ? 12 : 0
    return [it.y - h / 2 - top, it.y + h / 2 + bottom]
  }
  const bounds = (items: Placed[]) => ({
    top: Math.min(...items.map((it) => extent(it)[0])),
    bottom: Math.max(...items.map((it) => extent(it)[1])),
  })
  /** A sink's dot plus its label, and the gap a box needs to its right. */
  const reach = (id: string) => 14 + sizeOf(N[id]).w + 24 + sizeOf({ id: '', kind: 'problem', label: '' }).w / 2

  /** A problem and everything hanging off it, with the problem at (x, 0). */
  function block(s: DerivedState, p: string, x: number, from: string | undefined): Placed[] {
    const items: Placed[] = []
    const add = (id: string, px: number, py: number, extra: Partial<NodeTarget> = {}) => items.push({ id, x: px, y: py, extra })
    const rule = N[p].pressedBy
    const t = rule ? 260 : 0
    if (rule) add(rule, x, -78)
    add(p, x, 0, { delay: t, from })
    const sol = chosenOf(s, p)
    const back = reversed(s, sol)
    add(sol, x + 240, 0, { delay: t + 260, from: p, r: back ? 1 : 0 })
    solutionsOf(p)
      .filter((alt) => alt !== sol)
      .forEach((alt, k) => add(alt, x + 240, 122 * (k + 1), { delay: t + 380, from: p, g: 1, s: 0.86 }))
    const ins = inputsOf(sol)
    ins.forEach((id, k) => add(id, x + 110, -100 - k * 30, { delay: t + 420, from: sol }))
    const outs = shownOutputs(s, sol)
    // Once reversed, what the solution produced stops flowing; only what surfaced stays lit.
    outs.forEach((id, i) =>
      add(id, x + 390, (i - (outs.length - 1) / 2) * 42, {
        delay: N[id].condenses ? 700 : t + 520 + i * 70,
        from: N[id].condenses ? undefined : sol,
        d: back && !N[id].condenses ? 0.7 : 0,
      }),
    )
    // Problems that grew out of this branch hang off its ends, pushed apart if they'd overlap.
    let floor = -Infinity
    for (const end of [...ins, ...outs])
      for (const c of problemsOf(end)) {
        if (!s.open.includes(c)) continue
        const at = items.find((it) => it.id === end)!
        const input = N[end].kind === 'source'
        const [nx, ny] = N[c].nudge ?? [0, 0]
        const child = block(s, c, (input ? x + 240 : x + 390 + reach(end)) + nx, end)
        const b = bounds(child)
        let dy = (input ? at.y - 110 : at.y) + ny
        if (dy + b.top < floor + 24) dy = floor + 24 - b.top
        floor = dy + b.bottom
        items.push(...child.map((it) => ({ ...it, y: it.y + dy })))
      }
    return items
  }

  function compose(s: DerivedState): Composition {
    const out: Composition = { nodes: {}, edges: {} }
    const { put, column } = placer(N, out)
    const place = (items: Placed[], dy = 0) => items.forEach((it) => put(it.id, it.x, it.y + dy, it.extra))

    put(system, 0, 0, { f: s.zoom === 'inside' ? 1 : 0 })
    column(sources, -420, 0, 50, (i) => ({ delay: 120 + i * 60, from: system }))
    // Confirmed guesses line up with the other outputs, above the question mark: the fog shrinks, it never closes.
    const confirmed = s.fog ? s.promoted : []
    const outs = [...plainOutputs, ...confirmed.map(named), ...(fogSink ? [fogSink] : [])]
    column(outs, 420, 0, 50, (i) =>
      outs[i].endsWith('Named') ? { delay: 150, from: confirmed[i - plainOutputs.length] } : { delay: 120 + i * 60, from: system },
    )

    if (s.zoom === 'inside') {
      parts.forEach((id, i) => put(id, partAt[id].x, partAt[id].y, { delay: 320 + i * 70, from: system, s: 1 }))
    }

    // Whatever opens right of the outputs stays clear of the labels it sits beside.
    const clear = (top: number, bottom: number) =>
      Math.max(690, ...outs.filter((o) => out.nodes[o].y > top - 12 && out.nodes[o].y < bottom + 12).map((o) => 420 + reach(o)))

    // Branches off the outputs stack to the right and stay centred on what they grew from.
    const right: { items: Placed[]; y: number; top: number; bottom: number }[] = []
    for (const o of outs)
      for (const p of problemsOf(o))
        if (s.open.includes(p)) {
          const [nx, ny] = N[p].nudge ?? [0, 0]
          const items = block(s, p, nx, o)
          right.push({ items, y: out.nodes[o].y + ny, ...bounds(items) })
        }
    let floor = -Infinity
    const pushed = right.map((b) => {
      const y = Math.max(b.y, floor + 30 - b.top)
      floor = y + b.bottom
      return y - b.y
    })
    const shift = pushed.length ? pushed.reduce((a, b) => a + b, 0) / pushed.length : 0
    const placedRight: Placed[] = []
    right.forEach((b, i) => {
      const y = b.y + pushed[i] - shift
      const x = clear(y + b.top, y + b.bottom)
      placedRight.push(...b.items.map((it) => ({ ...it, x: it.x + x, y: it.y + y })))
    })
    place(placedRight)

    // Problems that arise inside the system open below it, each under the last.
    let below = 300
    for (const p of problemsOf(system))
      if (s.open.includes(p)) {
        const [nx, ny] = N[p].nudge ?? [0, 0]
        const items = block(s, p, -710 + nx, system)
        const b = bounds(items)
        const y = Math.max(below, below - b.top - 60) + ny
        place(items, y)
        below = y + b.bottom + 90
      }

    // The fog: guesses, not facts. It steps down only under the boxes it would run into.
    if (s.fog) {
      const left = hypotheses.filter((id) => !s.promoted.includes(id))
      const half = sizeOf({ id: '', kind: 'hypothesis', label: '' }).w / 2
      const above = placedRight.filter((it) => Math.abs(it.x - 720) < sizeOf(N[it.id]).w / 2 + half + 10)
      const y0 = Math.max(400, ...above.map((it) => extent(it)[1] + 85))
      const hx = clear(y0 - 37, y0 + left.length * 74) + 30
      left.forEach((id, i) => put(id, hx, y0 + i * 74, { delay: 200 + i * 160, from: fogSink, g: 1 }))
    }

    return finish(out, s, N, edges)
  }

  // ------------------------------------------------------------ what gets said

  const residue = (sol: string) => {
    const left = outputsOf(sol).filter((o) => !N[o].condenses && N[o].valence === 'undesired').map((o) => low(N[o].label))
    if (outputsOf(sol).some((o) => N[o].valence === 'unknown')) left.push('a question mark')
    return list(left)
  }
  const experiment = (p: string) => solutionsOf(p).some((sol) => condensing(sol).length > 0)

  const say = {
    opens: (p: string) => {
      const n = N[p]
      if (n.says) return n.says
      const sol = solutionsOf(p)[0]
      const from = n.parent === system ? `Inside ${w.who}, a problem: ${low(n.label)}.` : `${N[n.parent!].label} becomes a problem: ${low(n.label)}.`
      return `${from} ${N[sol].label} answers it, and leaves behind ${residue(sol)}.`
    },
    again: (p: string) => {
      if (N[p].again) return N[p].again
      const sols = solutionsOf(p)
      if (experiment(p)) return `“${N[sols[0]].label}”: a solution that turned out to be an experiment. It failed, and ${w.who} still came out knowing more than it did.`
      if (sols.length > 1) return `“${N[p].label}”. ${NUMBERS[sols.length] ?? sols.length} answers to one problem, each leaving different things behind.`
      return `“${N[p].label}”, and what its answer left behind.`
    },
    swapped: (sol: string) => N[sol].says ?? `${N[sol].label} instead. What it leaves behind: ${residue(sol)}.`,
    reveal: (o: string) => N[o].says ?? `Then the fog condensed: ${low(N[o].label)}. The question mark gave up one secret, and kept the rest.`,
    promote: (h: string) =>
      `“${N[h].label}” is now a known undesirable, joining ${w.who}’s outputs and becoming a problem of its own. The question mark stays, though. The fog shrinks; it never closes.`,
    why: (id: string) => {
      const n = N[id]
      const p = n.parent ? N[n.parent] : undefined
      return n.why ?? (p ? `${n.label}: ${n.relation} ${low(p.label)}.` : n.label)
    },
    /** Follows a node back to the system's purpose, in one breath. */
    chain: (id: string) => {
      if (w.chain) return w.chain
      const boxes = lineage(N, id).filter((c) => ['problem', 'solution'].includes(N[c].kind))
      const steps = boxes.slice(2).map((c) => (N[c].kind === 'solution' ? `which came from “${low(N[c].label)}”` : `chosen to answer “${low(N[c].label)}”`))
      return `Follow any box back and you reach the reason it exists. “${N[boxes[0]].label}” answers “${low(N[boxes[1]].label)}”, ${steps.join(', ')}: a problem only because ${w.who} exists to ${w.goal}.`
    },
  }
  /** The tour closes on the deepest box of the last experiment it tells. */
  const deepest = (() => {
    const p = [...w.tour].reverse().find((t) => N[t]?.kind === 'problem' && experiment(t))
    if (!p) return undefined
    let cur = p
    for (;;) {
      const next = condensing(solutionsOf(cur)[0]).flatMap(problemsOf)[0]
      if (!next) return solutionsOf(cur)[0]
      cur = next
    }
  })()

  function lines() {
    const all = [w.intro, w.inside, w.outro, OVERVIEW, FOG_ALL, FOG_SOME, FOG_NONE, WHICH, LOST]
    for (const n of nodes) {
      if (n.kind !== 'system' || n.why) all.push(say.why(n.id))
      if (n.kind === 'problem') all.push(say.opens(n.id), say.again(n.id))
      if (n.prelude) all.push(n.prelude)
      if (n.kind === 'solution' && solutionsOf(n.parent!).length > 1) all.push(say.swapped(n.id))
      if (n.condenses) all.push(say.reveal(n.id))
      if (n.kind === 'hypothesis') all.push(say.promote(n.id))
    }
    if (deepest) all.push(say.chain(deepest))
    return [...new Set(all)]
  }

  // ------------------------------------------------------------ the conversation

  function script({ scene, state, say: speak, settle }: Kit<DerivedState>): Script {
    let last: string | undefined = w.tour.find((t) => topProblems.includes(t))
    const open = (p: string) => !state.open.includes(p) && (state.open = [...state.open, p])
    const fogView = () => [fogSink!, ...state.promoted.map(named), ...hypotheses.filter((h) => !state.promoted.includes(h))]

    /** Opens whatever has to be open for a node to be on the canvas. */
    function ensure(id: string) {
      for (const c of lineage(N, id)) {
        const n = N[c]
        if (n.kind === 'problem') open(c)
        if (n.kind === 'solution') state.choice = { ...state.choice, [n.parent!]: c }
        if (n.condenses && !state.revealed.includes(c)) state.revealed = [...state.revealed, c]
        if (n.kind === 'hypothesis') state.fog = true
      }
      if (isNamed(id)) (state.fog = true), state.promoted.includes(id.replace(/Named$/, '')) || (state.promoted = [...state.promoted, id.replace(/Named$/, '')])
    }

    /** The next step in an experiment: an output surfaces, then becomes a problem. */
    function nextStep(p: string): (() => void) | undefined {
      const sol = chosenOf(state, p)
      const hidden = condensing(sol).find((o) => !state.revealed.includes(o))
      if (hidden) return () => actions.reveal(hidden)
      for (const o of condensing(sol)) {
        const c = problemsOf(o).find((c) => !state.open.includes(c))
        if (c) return () => actions.branch(c)
        const deeper = problemsOf(o).map(nextStep).find(Boolean)
        if (deeper) return deeper
      }
    }

    const actions = {
      overview() {
        state.zoom = 'root'
        state.focus = null
        settle('all', 40)
        speak(OVERVIEW)
      },

      open() {
        state.focus = null
        state.zoom = 'inside'
        settle([system], 6, 9)
        speak(w.inside)
      },

      branch(p: string) {
        last = topOf(p) ?? p
        state.zoom = 'root'
        state.focus = null
        const first = !state.open.includes(p)
        ensure(p)
        settle(branchView(state, last))
        speak(first ? say.opens(p) : say.again(p))
      },

      swap(p: string, to?: string) {
        last = topOf(p) ?? p
        state.focus = null
        ensure(p)
        const sols = solutionsOf(p)
        const sol = to ?? sols[(sols.indexOf(chosenOf(state, p)) + 1) % sols.length]
        state.choice = { ...state.choice, [p]: sol }
        settle(branchView(state, p))
        speak(say.swapped(sol))
      },

      reveal(o: string) {
        last = topOf(o)
        state.zoom = 'root'
        state.focus = null
        ensure(o)
        settle([...(N[o].tracedBy ? [N[o].tracedBy!] : []), ...branchView(state, last!)])
        speak(say.reveal(o))
      },

      fog() {
        state.zoom = 'root'
        state.focus = null
        state.fog = true
        settle(fogView(), 30)
        const left = hypotheses.filter((h) => !state.promoted.includes(h)).length
        speak(!left ? FOG_NONE : left < hypotheses.length ? FOG_SOME : FOG_ALL)
      },

      promote(h: string) {
        state.focus = null
        state.fog = true
        if (!state.promoted.includes(h)) state.promoted = [...state.promoted, h]
        settle(fogView(), 30)
        speak(say.promote(h))
      },

      why(id: string, text?: string) {
        const n = N[id]
        if (!n) return
        // Asking why an alternative exists brings it forward.
        if (n.kind === 'solution' && state.open.includes(n.parent!)) state.choice = { ...state.choice, [n.parent!]: id }
        state.focus = id
        const visible = scene.composition().nodes
        const chain = lineage(N, id).filter((c) => visible[c])
        // A lone node (a rule whose cause is off the map) is framed with what it touches, not by itself.
        if (chain.length === 1) for (const e of edges) if (e.from === id && visible[e.to]) chain.push(e.to)
        if (n.kind !== 'part' && state.zoom === 'inside') state.zoom = 'root'
        if (n.kind === 'part') settle([system], 6, 9)
        else settle(chain.length > 1 ? chain : [id], 40)
        speak(text ?? say.why(id))
      },

      /** Brings anything onto the canvas, opening what it hangs off, and says why it's there. */
      show(id: string) {
        const n = N[id]
        if (n.kind === 'problem') return actions.branch(id)
        if (prelude(id)) return actions.look(id)
        if (n.kind === 'part' && state.zoom !== 'inside') state.zoom = 'inside'
        ensure(id)
        scene.sync()
        actions.why(id)
      },

      /** An output's prelude: what it is before anything makes it a problem. */
      look(id: string) {
        state.zoom = 'root'
        state.focus = id
        settle([system, id], 40)
        speak(N[id].prelude!)
      },

      /** Asked about a problem: opens it, or moves its experiment on, or tells it again. */
      go(p: string) {
        const step = state.open.includes(p) && experiment(p) ? nextStep(p) : undefined
        if (step) return step()
        actions.branch(p)
      },

      clearFocus() {
        if (state.focus) state.focus = null
      },
    }
    /** Said before its problem opens, until the output has been looked at once. */
    const prelude = (id: string) => N[id].prelude && problemsOf(id).some((p) => !state.open.includes(p))

    function click(id: string) {
      const n = N[id]
      if (id === system) return state.zoom === 'root' ? actions.open() : actions.clearFocus()
      if (id === fogSink) return actions.fog()
      if (n.kind === 'hypothesis') return actions.promote(id)
      if (n.kind === 'solution' && id !== chosenOf(state, n.parent!)) return actions.swap(n.parent!, id)
      // An experiment's question mark, or what surfaced from it, moves the story on.
      const host = n.parent ? N[n.parent] : undefined
      if (host?.kind === 'solution' && (n.valence === 'unknown' || n.condenses)) {
        const step = nextStep(host.parent!)
        const hidden = condensing(host.id).some((o) => !state.revealed.includes(o))
        if (step && (n.valence === 'unknown' ? hidden : !hidden)) return step()
      }
      // An output that can become a problem opens it; once open, a first click explains, a second returns to the branch.
      const problems = n.kind === 'sink' || n.kind === 'source' ? problemsOf(id) : []
      if (problems.length) {
        const p = problems[0]
        if (prelude(id) && state.focus !== id) return actions.look(id)
        if (!state.open.includes(p) || state.focus === id) return actions.branch(p)
      }
      // A problem explains itself; looked at again, it's told again.
      if (n.kind === 'problem' && state.focus === id) return actions.branch(id)
      actions.why(id)
    }

    // ------------------------------------------------------------ language

    function mentioned(text: string): string | undefined {
      const words = (n: NodeDef) => [n.label, ...(n.aka ?? [])].map((x) => x.toLowerCase()).filter((x) => x.length > 1)
      const hits = nodes
        .filter((n) => !isNamed(n.id) || state.promoted.includes(n.id.replace(/Named$/, '')))
        .flatMap((n) => words(n).filter((x) => new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)).map((x) => ({ id: n.id, x })))
      return hits.sort((a, b) => b.x.length - a.x.length)[0]?.id
    }

    function ask(text: string) {
      const has = (re: RegExp) => re.test(text)
      // A suggestion typed out does what clicking it does.
      const bare = (x: string) => x.toLowerCase().replace(/[?“”"]/g, '').trim()
      const asked = nodes.find((n) => n.ask && bare(n.ask) === bare(text))
      if (asked) return asked.kind === 'solution' ? actions.swap(asked.parent!, asked.id) : actions.go(asked.id)
      if (has(/\bwhy\b|purpose|what does .* (solve|do)|exist|for\??$/)) {
        const id = mentioned(text)
        return id ? (actions.show(id), undefined) : speak(WHICH)
      }
      if (has(/instead|alternative|swap|other option|compare|trade.?off|cheaper/)) {
        // The branch we're in, or else the latest one with answers to choose between.
        const multi = (p: string) => solutionsOf(p).length > 1
        const p = [last, ...[...state.open].reverse(), ...w.tour].find((p) => p && N[p]?.kind === 'problem' && multi(p))
        if (p) return actions.swap(p)
      }
      if (has(/inside|open|zoom in|how does|look in|parts/)) return actions.open()
      if (has(/back|zoom out|overview|whole|everything|reset|start/)) return actions.overview()
      const intent = w.intents?.find(([re]) => has(re))?.[1]
      if (intent) return N[intent].kind === 'problem' ? actions.go(intent) : actions.show(intent)
      if (has(/next|then|happened|after/) && last && nextStep(last)) return nextStep(last)!()
      if (has(/unknown|fog|don.?t know|emerg|blind|surprise|side.?effect|\?/)) return actions.fog()
      if (has(/promote|confirm|it.?s real|known/)) {
        const h = hypotheses.find((h) => !state.promoted.includes(h))
        return state.fog && h ? actions.promote(h) : actions.fog()
      }
      const id = mentioned(text)
      if (id) return actions.show(id)
      speak(LOST)
    }

    function suggestions(): Suggestion[] {
      const s: Suggestion[] = []
      const add = (label: string, run: () => void) => s.push({ label, run })
      // Whatever was just clicked, the way on: trace it back to what it serves.
      const focus = state.focus ? N[state.focus] : undefined
      const up = focus?.parent ? N[focus.parent] : undefined
      if (up && up.label !== '?' && scene.composition().nodes[up.id]) {
        const name = `“${low(up.label)}”`
        add(
          up.kind === 'problem' ? `Why is ${name} a problem?` : up.kind === 'solution' || up.kind === 'system' ? `What is ${name} for?` : `Where does ${name} come from?`,
          () => actions.why(up.id),
        )
      }
      if (state.zoom === 'root') add('What’s inside?', actions.open)
      else add('Step back out', actions.overview)

      // First, the next step in whatever branch we're in.
      if (last && state.open.includes(last)) {
        const step = nextStep(last)
        const sols = solutionsOf(last)
        const sol = chosenOf(state, last)
        if (step) {
          const hidden = condensing(sol).some((o) => !state.revealed.includes(o))
          const undo = condensing(sol).flatMap(problemsOf).flatMap(solutionsOf)[0]
          add(hidden || !undo ? 'What happened next?' : `What did ${N[undo].by ?? 'they'} do?`, step)
        } else {
          // A question the chosen answer raised comes before trying another answer.
          const raised = [...inputsOf(sol), ...shownOutputs(state, sol)].flatMap(problemsOf).find((c) => !state.open.includes(c))
          if (raised) add(N[raised].ask ?? `What about “${low(N[raised].label)}”?`, () => actions.branch(raised))
          else if (sols.length > 1) {
            const alt = sol === sols[0] ? sols[1] : sols[0]
            add(N[alt].ask ?? (sol === sols[0] ? `Why not “${low(N[alt].label)}”?` : `Compare with “${low(N[alt].label)}”`), () => actions.swap(last!, alt))
          }
        }
      }
      // Then branches not yet opened, in the order the story tells them; what nobody knows comes last.
      for (const t of w.tour) if (topProblems.includes(t) && !state.open.includes(t)) add(N[t].ask ?? `What about “${low(N[t].label)}”?`, () => actions.branch(t))
      if (fogSink && !state.fog) add('What don’t we know yet?', actions.fog)
      const chosen = last && state.open.includes(last) ? chosenOf(state, last) : undefined
      if (chosen && state.focus !== chosen && up?.id !== chosen) add(`Why does “${low(N[chosen].label)}” exist?`, () => actions.why(chosen))
      if (state.zoom === 'root' && (state.open.length || state.fog)) add('Show the whole', actions.overview)
      return s.slice(0, 4)
    }

    // ------------------------------------------------------------ narrated tour

    // Each branch opens, tries its alternatives, and plays an experiment through to its end.
    const tour: (() => void)[] = [
      () => {
        actions.overview()
        speak(w.intro)
      },
      actions.open,
      actions.overview,
    ]
    for (const t of w.tour) {
      const n = N[t]
      if (t === 'fog') tour.push(actions.fog, () => actions.promote(hypotheses[0]))
      else if (n.kind === 'solution') tour.push(() => actions.swap(n.parent!, t))
      else if (n.prelude) tour.push(() => actions.look(t))
      else if (n.kind === 'problem') {
        tour.push(() => actions.branch(t))
        if (experiment(t)) {
          let steps = 0
          for (let p: string | undefined = t; p; p = condensing(solutionsOf(p)[0]).flatMap(problemsOf)[0]) steps += condensing(solutionsOf(p)[0]).length * 2
          for (let i = 0; i < steps; i++) tour.push(() => nextStep(last!)?.())
        } else if (!solutionsOf(t).some((sol) => w.tour.includes(sol))) for (const alt of solutionsOf(t).slice(1)) tour.push(() => actions.swap(t, alt))
      }
    }
    if (deepest) tour.push(() => actions.why(deepest, say.chain(deepest)))
    tour.push(() => {
      actions.overview()
      speak(w.outro)
    })

    return { intro: w.intro, actions, click, ask, suggestions, tour }
  }

  return {
    id: w.id,
    title: w.title,
    goal: w.goal,
    system,
    NODES: N,
    EDGES: edges,
    initialState: () => ({ zoom: 'root', focus: null, hover: null, open: [], choice: {}, revealed: [], fog: false, promoted: [] }),
    compose,
    script,
    lines,
  }
}
