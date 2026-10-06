// A model to think with, not a story to tell. It starts at a need and pulls:
// how do people get it? The ways to get it stand side by side, oldest first.
// Each way shows what it leaves behind, and each residue points at the later
// way that answers it. There is no script and no voice. The canvas grows where
// you click, and says what the model says about each thing.

import { finish, lineage, placer, sizeOf, type BaseState, type Composition, type Domain, type Kit, type Script, type Suggestion } from './model'
import { parseOutline } from './outline'

export interface ExploreState extends BaseState {
  /** Nodes whose children show. */
  open: string[]
}

const ROW = 42
const low = (s: string) => (/^[A-Z][a-z’']/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export function deriveExplore(m: { id: string; title: string; text: string }): Domain<ExploreState> {
  const o = parseOutline(m.text)
  for (const w of o.warnings) console.warn(`${m.id}: ${w}`)
  const N = Object.fromEntries(o.nodes.map((n) => [n.id, n]))
  const root = o.root

  /** What opening a node shows: the systems that serve a need, what a system leaves and what presses on it, the systems that answer a residue. */
  const children = (id: string): string[] => {
    const n = N[id]
    if (n.kind === 'need') return [...o.edges.filter((e) => e.kind === 'serves' && e.to === id).map((e) => e.from), ...o.nodes.filter((k) => k.kind === 'source' && k.parent === id).map((k) => k.id)]
    if (n.kind === 'solution')
      return o.edges
        .filter((e) => (e.kind === 'flow' && (e.from === id || (e.to === id && N[e.from].kind === 'source'))) || (e.kind === 'pressure' && e.to === id) || (e.kind === 'serves' && e.to === id))
        .map((e) => (e.from === id ? e.to : e.from))
    if (n.kind === 'sink' || n.kind === 'source') return o.edges.filter((e) => e.kind === 'solves' && e.from === id).map((e) => e.to)
    return []
  }
  /** Breadth first from the root: the order the pull goes in. */
  const order = (() => {
    const seen = [root]
    for (let i = 0; i < seen.length; i++) for (const c of children(seen[i])) if (!seen.includes(c)) seen.push(c)
    return seen
  })()
  const opens = (id: string) => children(id).length > 0

  // ------------------------------------------------------------ the layout

  function compose(s: ExploreState): Composition {
    const c: Composition = { nodes: {}, edges: {} }
    const { put } = placer(N, c)
    const open = new Set(s.open)
    if (!root) return c

    // Each system works like a machine: inputs come in from the left and what it leaves goes
    // out to the right, so lines run one way and do not cross. A system that serves no need exists
    // for a residue alone, and hangs below the column it came from.
    const showing = new Set([root, ...s.open.flatMap(children)])
    const row = o.nodes.filter((n) => n.kind === 'solution' && showing.has(n.id) && N[n.parent!]?.kind === 'need')
    const residues = (sys: string) => (open.has(sys) ? children(sys).filter((k) => N[k].kind === 'sink') : [])
    const inputs = (sys: string) => (open.has(sys) ? children(sys).filter((k) => N[k].kind === 'source') : [])
    const rules = (sys: string) => (open.has(sys) ? children(sys).filter((k) => N[k].kind === 'rule') : [])
    /** Room to the left of a system for the labels of its inputs. */
    const inset = (sys: string) => (inputs(sys).length ? Math.max(...inputs(sys).map((k) => sizeOf(N[k]).w)) + 40 : 0)
    const answers = (r: string) => (open.has(r) ? children(r).filter((k) => N[k].parent === r) : [])
    const parts = (sys: string) => (open.has(sys) ? children(sys).filter((k) => N[k].kind === 'solution' && N[k].parent === sys) : [])
    const GAP = 50
    /** From the right edge of a system to the dots of what it leaves. */
    const OUT = 70
    /** How far a system's column reaches above its center: the residues and the rules over it. */
    const above = (sys: string) => Math.max(30, ((residues(sys).length - 1) / 2) * ROW + 20, rules(sys).length ? 78 + (rules(sys).length - 1) * 40 + 20 : 0)

    /** The width a system's column needs, with what hangs below it. */
    const width = (sys: string): number =>
      inset(sys) +
      sizeOf(N[sys]).w +
      Math.max(
        0,
        ...residues(sys).map((r) => OUT + sizeOf(N[r]).w + 24),
        ...residues(sys).flatMap(answers).map((k) => OUT + width(k)),
      )

    /** Places a system with its left edge at x and its center at y, and returns the bottom of its column. */
    function column(sys: string, left: number, y: number, delay: number): number {
      // Inputs come in from the left, and their labels stand to the left of their dots.
      inputs(sys).forEach((k, j, all) => put(k, left + inset(sys) - 28, y + (j - (all.length - 1) / 2) * 30, { delay: delay + 80 + j * 60, from: sys }))
      const x0 = left + inset(sys)
      const w = sizeOf(N[sys]).w
      const x = x0 + w / 2
      put(sys, x, y, { delay, from: N[sys].parent })
      const outs = residues(sys)
      outs.forEach((r, j) => put(r, x0 + w + OUT, y + (j - (outs.length - 1) / 2) * ROW, { delay: delay + 100 + j * 70, from: sys }))
      let bottom = Math.max(y + 30, y + ((outs.length - 1) / 2) * ROW + 20, y + ((inputs(sys).length - 1) / 2) * 30 + 10)
      rules(sys).forEach((r, j) => put(r, x, y - 78 - j * 40, { delay: delay + 80, from: sys }))
      for (const k of outs.flatMap(answers)) bottom = column(k, x0 + w + OUT, bottom + 40 + above(k), delay + 300)
      return bottom
    }

    // The need stands on the right, and the ways that compete to supply it stack to its left, in
    // the order of the file. The parts a way needs stand in a line to its left, so what one part
    // makes flows to the right into the next, and the way's own output flows on into the need.
    const line = (sys: string) => parts(sys).reduce((a, k) => a + width(k) + GAP, 0)
    const right = Math.max(0, ...row.map((n) => line(n.id) + width(n.id)))
    let y = 0
    const centers = row.map((n, i) => {
      const cy = y + Math.max(above(n.id), ...parts(n.id).map(above))
      let px = right - width(n.id) - line(n.id)
      let bottom = column(n.id, right - width(n.id), cy, 120 + i * 60)
      for (const k of parts(n.id)) {
        bottom = Math.max(bottom, column(k, px, cy, 400 + i * 60))
        px += width(k) + GAP
      }
      y = bottom + 60
      return cy
    })
    column(root, right + 120, centers.length ? (centers[0] + centers.at(-1)!) / 2 : 0, 0)
    // A way that delivers into the need, and a part, are joined by what flows; a line from the box would only cross the others.
    const delivers = new Set(o.edges.filter((e) => e.kind === 'flow' && N[e.from].kind === 'sink' && (e.to === root || N[e.to].parent === root)).map((e) => N[e.from].parent))
    return finish(c, s, N, o.edges.filter((e) => !(e.kind === 'serves' && (N[e.to].kind === 'solution' || delivers.has(e.from)))))
  }

  // ------------------------------------------------------------ the conversation

  const intro = [N[root]?.why ?? m.title, ...(o.warnings.length ? [`The model has ${o.warnings.length} loose end${o.warnings.length > 1 ? 's' : ''}; the console lists them.`] : [])].join(' ')

  const told = (id: string) => {
    const n = N[id]
    const kids = children(id)
    if (n.kind === 'need') return `How do ${o.who} get ${low(n.label)}? ${list(kids.filter((k) => N[k].kind === 'solution').map((k) => N[k].label))}.`
    if (n.kind === 'solution') {
      const left = kids.filter((k) => N[k].kind === 'sink').map((k) => (N[k].label === '?' ? `a question: ${N[k].note}` : low(N[k].label)))
      const rules = kids.filter((k) => N[k].kind === 'rule').map((k) => N[k].label)
      const parts = kids.filter((k) => N[k].kind === 'solution').map((k) => low(N[k].label))
      const uses = kids.filter((k) => N[k].kind === 'source').map((k) => [N[k].label, N[k].note && low(N[k].note!)].filter(Boolean).join(' '))
      return `${n.label} leaves ${list(left)}.${parts.length ? ` It needs ${list(parts)}.` : ''}${uses.length ? ` It uses ${list(uses)}.` : ''}${rules.length ? ` ${list(rules)} presses on it.` : ''}`
    }
    if (n.kind === 'sink') return kids.map((k) => `${N[k].label}${N[k].note ? `: ${N[k].note}` : ''}.`).join(' ')
    return n.why ?? n.label
  }
  const about = (id: string) => {
    const n = N[id]
    return n.why ?? [n.label === '?' ? n.note : n.label, n.label !== '?' && n.note].filter(Boolean).join(': ')
  }

  function script({ state, say, settle }: Kit<ExploreState>): Script {
    const speak = (t: string) => say(t, false)
    // From the state, not the composition: suggestions are computed from the state and must follow it.
    const shown = () => Object.fromEntries([root, ...state.open.flatMap(children)].map((id) => [id, true]))

    const actions = {
      overview() {
        state.focus = null
        settle('all', 40)
      },

      /** Opens everything: the whole model at once. */
      open() {
        state.focus = null
        state.open = order.filter(opens)
        settle('all', 40)
        speak(`The whole model: ${order.filter((id) => N[id].kind === 'solution').length} systems pulled by ${low(N[root].label)}.`)
      },

      grow(id: string) {
        // Opening something off the canvas opens the way to it first.
        const way = lineage(N, id).filter((c) => c !== id && opens(c))
        // A system that answers this residue may hang under another one: open the way to it as well.
        if (N[id].kind === 'sink') for (const k of children(id)) way.push(...lineage(N, k).slice(1))
        state.open = [...new Set([...state.open, ...way, id])]
        state.focus = null
        const s = shown()
        settle([id, ...children(id)].filter((k) => s[k]), 50)
        speak(told(id))
      },

      why(id: string, text?: string) {
        if (!N[id]) return
        state.open = [...new Set([...state.open, ...lineage(N, id).slice(1)])]
        state.focus = id
        const s = shown()
        const chain = lineage(N, id).filter((c) => s[c])
        settle(chain.length > 1 ? chain : [id], 50)
        speak(text ?? about(id))
      },

      clearFocus() {
        state.focus = null
      },
    }

    function click(id: string) {
      if (opens(id) && !state.open.includes(id)) return actions.grow(id)
      // Taps on an open thing toggle between what it shows and the thing itself, where the rest goes quiet.
      if (state.focus === id && opens(id)) return actions.grow(id)
      if (state.focus === id) return actions.clearFocus()
      actions.why(id)
    }

    function mentioned(text: string) {
      const words = (id: string) => [N[id].label, ...(N[id].aka ?? [])].map((x) => x.toLowerCase()).filter((x) => x.length > 1)
      return o.nodes
        .flatMap((n) => words(n.id).filter((x) => text.includes(x)).map((x) => ({ id: n.id, x })))
        .sort((a, b) => b.x.length - a.x.length)[0]?.id
    }

    function ask(text: string) {
      if (/every|whole|all of it|show all/.test(text)) return actions.open()
      if (/overview|zoom out|back/.test(text)) return actions.overview()
      const id = mentioned(text)
      if (!id) return speak('Name something in the model, or click it.')
      if (/\bwhy\b|what.* for|purpose/.test(text)) return actions.why(id)
      if (/how|leave|behind|answer|split/.test(text) && opens(id)) return actions.grow(id)
      click(id)
    }

    function suggestions(): Suggestion[] {
      const s: Suggestion[] = []
      const add = (label: string, run: () => void) => s.push({ label, run })
      const on = shown()
      // The frontier of the pull, nearest the need first.
      for (const id of order) {
        if (!on[id] || !opens(id) || state.open.includes(id)) continue
        const n = N[id]
        const name = low(n.label === '?' ? n.note! : n.label)
        add(n.kind === 'need' ? `How do ${o.who} get ${name}?` : n.kind === 'solution' ? `What does ${name} leave behind?` : `What answers “${name}”?`, () => actions.grow(id))
        if (s.length === 3) break
      }
      if (state.focus && N[state.focus].parent && on[N[state.focus].parent!]) add(`Why ${low(N[N[state.focus].parent!].label)}?`, () => actions.why(N[state.focus!].parent!))
      if (state.open.length < order.filter(opens).length) add('Show everything', actions.open)
      return s.slice(0, 4)
    }

    const tour: (() => void)[] = [
      () => {
        Object.assign(state, initialState())
        settle('all', 60)
        speak(intro)
      },
      ...order.filter(opens).map((id) => () => actions.grow(id)),
      actions.overview,
    ]

    return { intro, actions, click, ask, suggestions, tour }
  }

  const initialState = (): ExploreState => ({ zoom: 'root', focus: null, hover: null, open: [] })

  return {
    id: m.id,
    title: m.title,
    goal: '',
    system: root,
    NODES: N,
    EDGES: o.edges,
    initialState,
    compose,
    script,
    visiblePath: true,
    maxZoom: 1.5,
  }
}
