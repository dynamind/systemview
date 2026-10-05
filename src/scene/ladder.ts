// A ladder derived from statements: a story without a boundary. It starts at the
// solution people ask for and climbs "what is this for?" until other answers fit.
// The author writes the rungs, what each one leaves behind, the answers that
// attach higher, and the rule that kept an answer off the table. The layout,
// the clicks, the suggestions and the tour come from here.
//
// The reading of each statement:
//   solution, listed first           what they asked for: the bottom rung
//   need, parent = need              the next rung up; the top need has no parent
//   sink, parent = rung              what that rung leaves behind
//   solution, parent = need          an answer that attaches higher; the rungs below it go
//   solution, parent = top need      another answer at the top: shown, not swapped in
//   sink, parent = that solution     what the higher answer leaves behind
//   rule, on a solution's pressedBy  the rule that made that solution the sensible answer;
//                                    the answers beside it stay blocked until the rule changes
//
// The lines each statement carries:
//   need       ask: the question that climbs to it; says: said on arrival
//   solution   ask: the question that swaps it in; says: said when swapped in;
//              prelude (the first alternative): said when the alternatives come up
//   rule       ask: the question that changes it; says: said when it changes;
//              blocked: said when someone reaches past it; note: what changed it

import { finish, lineage, placer, type BaseState, type Composition, type Domain, type EdgeDef, type Kit, type NodeDef, type Script, type Suggestion } from './model'

export interface Ladder {
  id: string
  title: string
  intro: string
  /** The need people actually want. The residue and the alternatives are told from there. */
  want: string
  nodes: NodeDef[]
  close: string

  // Lines with a fallback: each one optional.
  /** Said when the residue shows. */
  leaves?: string
  /** The question that shows the residue. */
  leavesAsk?: string
  /** The question that brings the alternatives up. */
  another?: string
  /** Said on climbing when the top is already reached. */
  top?: string
  overview?: string
  /** Words that lead straight to a node, or to 'leaves' or 'another', checked before anything else. */
  intents?: [RegExp, string][]
}

export interface LadderState extends BaseState {
  /** How far up the ladder we've climbed: 0 the solution alone. */
  rung: number
  residue: boolean
  /** The alternatives (and the rule, if any) are showing. */
  alt: boolean
  /** The rule has changed. */
  changed: boolean
  /** The answer in front: what they asked for, or an alternative. */
  choice: string
}

const STEP = 110
const OVERVIEW = 'The whole ladder, as far as we’ve climbed it.'
const LOST = 'This prototype follows a scripted story, so I only understand a little. Try a suggestion below, or click anything on the canvas.'
const low = (s: string) => (/^[A-Z][a-z’']/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export function deriveLadder(l: Ladder): Domain<LadderState> {
  // ------------------------------------------------------------ the model

  const nodes = l.nodes
  const N: Record<string, NodeDef> = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const asked = nodes.find((n) => n.kind === 'solution')!.id
  const rungs = lineage(N, asked)
  const top = rungs.length - 1
  const want = rungs.indexOf(l.want)
  const sinksOf = (id: string) => nodes.filter((n) => n.kind === 'sink' && n.parent === id).map((n) => n.id)
  /** Answers that attach higher, and the answers beside them at the top. */
  const alts = nodes.filter((n) => n.kind === 'solution' && n.id !== asked && n.parent !== rungs[top]).map((n) => n.id)
  const others = nodes.filter((n) => n.kind === 'solution' && n.id !== asked && n.parent === rungs[top]).map((n) => n.id)
  const attach = (sol: string) => rungs.indexOf(N[sol].parent!)
  const residue = rungs.flatMap(sinksOf)
  const rule = N[asked].pressedBy
  /** The rule keeps off the table every answer that would replace the one it shaped. */
  const blocks = (sol: string) => !!rule && alts.includes(sol) && attach(sol) > 0
  const choices = [asked, ...alts]

  const up = (from: string, to: string, extra: Partial<EdgeDef> = {}): EdgeDef => ({ id: `u-${from}`, from, to, kind: 'serves', fromSide: 'top', toSide: 'bottom', ...extra })
  const edges: EdgeDef[] = [
    ...rungs.slice(1).map((id, i) => up(rungs[i], id)),
    ...alts.map((id) => up(id, N[id].parent!, { fromSide: 'left', toSide: 'right' })),
    ...others.map((id) => up(id, N[id].parent!, { fromSide: 'right', toSide: 'left' })),
    ...(rule ? [{ id: `p-${rule}`, from: rule, to: asked, kind: 'pressure', fromSide: 'right', toSide: 'left' } as EdgeDef] : []),
    ...nodes.filter((n) => n.kind === 'sink').map((n): EdgeDef => ({ id: `o-${n.id}`, from: n.parent!, to: n.id, kind: 'flow', valence: n.valence })),
  ]

  // ------------------------------------------------------------ the layout

  const y = (i: number) => STEP - i * STEP
  /** Alternatives that attach to the same rung stack below each other. */
  const altY = (sol: string) => y(attach(sol)) + alts.filter((a) => attach(a) === attach(sol)).indexOf(sol) * 90

  function compose(s: LadderState): Composition {
    const c: Composition = { nodes: {}, edges: {} }
    const { put, column } = placer(N, c)
    // An answer that attaches higher leaves every rung below it, and what they left behind, ghosted.
    const skip = s.choice === asked ? 0 : attach(s.choice)
    rungs.slice(0, s.rung + 1).forEach((id, i) =>
      put(id, 0, y(i), { delay: 120, from: i ? rungs[i - 1] : undefined, g: i < skip ? 1 : 0, s: skip && i === 0 ? 0.86 : 1 }),
    )
    if (s.residue) {
      let k = 0
      rungs.forEach((rung, i) => column(sinksOf(rung), 115, y(i), 42, () => ({ delay: 260 + k++ * 80, from: rung, g: i < skip ? 1 : 0 })))
    }
    if (s.alt) {
      // The rule presses on the answer it shaped from the left; a change strikes it through.
      if (rule) put(rule, -300, y(0), { delay: 160, r: s.changed ? 1 : 0 })
      for (const a of alts) {
        const chosen = s.choice === a
        put(a, 270, altY(a), { delay: 220, from: N[a].parent, g: chosen ? 0 : 1, s: chosen ? 1 : 0.86 })
        if (chosen) column(sinksOf(a), 380, altY(a), 42, (i) => ({ delay: 420 + i * 70, from: a }))
      }
    }
    if (s.rung === top) others.forEach((id, i) => put(id, -270, y(top) + (i - (others.length - 1) / 2) * 76, { delay: 300 + i * 120, from: rungs[top] }))
    return finish(c, s, N, edges)
  }

  // ------------------------------------------------------------ lines nobody wrote

  const say = {
    climb: (i: number) => N[rungs[i]].says ?? `What is ${low(N[rungs[i - 1]].label)} for? ${N[rungs[i]].label}.`,
    climbAsk: (i: number) => N[rungs[i]].ask ?? `What is “${low(N[rungs[i - 1]].label)}” for?`,
    top: () => l.top ?? `The whole ladder: ${list([...rungs].reverse().map((id) => low(N[id].label)))}. Each rung answers the one above it.`,
    leaves: () =>
      l.leaves ??
      `What does this way leave behind? ${rungs
        .filter((r) => sinksOf(r).length)
        .map((r) => `${N[r].label}: ${list(sinksOf(r).map((o) => (N[o].label === '?' ? (N[o].note ?? 'a question mark') : low(N[o].label))))}.`)
        .join(' ')}`,
    leavesAsk: () => l.leavesAsk ?? 'What does this way leave behind?',
    another: () => N[alts[0]].prelude ?? `Up at ${low(N[N[alts[0]].parent!].label)}, other answers fit: ${list(alts.map((a) => low(N[a].label)))}.`,
    swapped: (sol: string) => N[sol].says ?? `${N[sol].label}. It leaves ${list(sinksOf(sol).map((o) => low(N[o].label)))}.`,
    swapAsk: (sol: string) => N[sol].ask ?? (sol === asked ? `Compare with “${low(N[sol].label)}”` : `What about “${low(N[sol].label)}”?`),
    changed: () => N[rule!].says ?? `The rule changes: ${low(N[rule!].note ?? N[rule!].label)}.`,
    blocked: () => N[rule!].blocked ?? `The rule still holds: ${low(N[rule!].label)}. Ask what has changed.`,
  }

  function lines() {
    const all = [l.intro, l.close, l.overview ?? OVERVIEW, LOST, say.top(), say.leaves()]
    for (let i = 1; i <= top; i++) all.push(say.climb(i))
    if (alts.length) all.push(say.another(), ...choices.map(say.swapped))
    if (rule) all.push(say.changed(), say.blocked())
    for (const n of nodes) if (n.why) all.push(n.why)
    return [...new Set(all)]
  }

  // ------------------------------------------------------------ the conversation

  function script({ scene, state, say: speak, settle }: Kit<LadderState>): Script {
    const ladder = () => rungs.slice(0, state.rung + 1)
    const reach = (i: number) => (state.rung = Math.max(state.rung, i))
    const shownOuts = () => [...(state.residue ? residue : []), ...(state.choice !== asked ? sinksOf(state.choice) : [])]
    const altView = () => [...ladder().slice(0, want + 1), ...(rule ? [rule] : []), ...alts, ...shownOuts()]

    const actions = {
      overview() {
        state.focus = null
        settle('all', 40)
        speak(l.overview ?? OVERVIEW)
      },
      open() {
        actions.overview()
      },

      climb() {
        if (state.rung === top) {
          state.focus = asked
          settle('all', 40)
          return speak(say.top())
        }
        state.rung++
        state.focus = asked
        // Arriving at the top brings the other answers there with it.
        if (state.rung === top && others.length) {
          state.focus = null
          settle([rungs[top - 1], rungs[top], ...others, ...(state.alt ? alts : []), ...(state.choice !== asked ? sinksOf(state.choice) : [])], 50)
        } else settle(ladder(), 60)
        speak(say.climb(state.rung))
      },

      leaves() {
        // Climb first: what a way leaves behind only reads once you see what it's for.
        reach(want)
        state.residue = true
        state.choice = asked
        state.focus = null
        settle([...ladder().slice(0, want + 1), ...residue], 50)
        speak(say.leaves())
      },

      another() {
        if (!alts.length) return speak(LOST)
        reach(want)
        state.alt = true
        state.focus = null
        settle(altView(), 50)
        speak(say.another())
      },

      change() {
        if (!rule) return speak(LOST)
        reach(want)
        state.alt = true
        state.changed = true
        state.focus = null
        settle(altView(), 50)
        speak(say.changed())
      },

      swap(to?: string) {
        if (!alts.length) return speak(LOST)
        if (!state.alt) return actions.another()
        reach(want)
        const next = to ?? choices[(choices.indexOf(state.choice) + 1) % choices.length]
        if (blocks(next) && !state.changed) {
          state.focus = rule!
          settle(altView(), 50)
          return speak(say.blocked())
        }
        state.focus = null
        state.choice = next
        if (next === asked) state.residue = true
        settle(altView(), 50)
        speak(say.swapped(next))
      },

      why(id: string, text?: string) {
        const n = N[id]
        if (!n) return
        state.focus = id
        const shown = scene.composition().nodes
        const chain = lineage(N, id).filter((c) => shown[c])
        // A rule has no lineage: it's framed with the answer it presses on.
        if (chain.length === 1) for (const e of edges) if (e.from === id && shown[e.to]) chain.push(e.to)
        settle(chain.length > 1 ? chain : [id], 50)
        speak(text ?? n.why ?? n.label)
      },

      /** Brings anything onto the canvas, climbing to it or bringing up what it hangs off, and says why it's there. */
      show(id: string) {
        const n = N[id]
        const host = n.kind === 'sink' ? n.parent! : id
        if (rungs.includes(host)) reach(rungs.indexOf(host))
        if (n.kind === 'sink' && rungs.includes(host)) (state.residue = true), reach(want)
        if (alts.includes(host)) {
          reach(want)
          state.alt = true
          if (n.kind === 'sink') {
            if (blocks(host) && !state.changed) return actions.swap(host)
            state.choice = host
          }
        }
        if (others.includes(id)) state.rung = top
        if (id === rule) (state.alt = true), reach(want)
        scene.sync()
        actions.why(id)
      },

      clearFocus() {
        state.focus = null
      },
    }

    function click(id: string) {
      if (id === rungs[state.rung] && state.rung < top) return actions.climb()
      if (id === rule && !state.changed) return actions.change()
      if (choices.includes(id) && id !== state.choice) return actions.swap(id)
      if (id === asked && !state.residue && state.rung >= want) return actions.leaves()
      actions.why(id)
    }

    // ------------------------------------------------------------ language

    function mentioned(text: string): string | undefined {
      const words = (n: NodeDef) => [n.label, ...(n.aka ?? [])].map((x) => x.toLowerCase()).filter((x) => x.length > 1)
      const hits = nodes.flatMap((n) => words(n).filter((x) => new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)).map((x) => ({ id: n.id, x })))
      return hits.sort((a, b) => b.x.length - a.x.length)[0]?.id
    }

    /** Asked about something by name: the step that brings it forward. */
    function go(id: string) {
      if (id === 'leaves') return actions.leaves()
      if (id === 'another') return actions.another()
      const n = N[id]
      if (rungs.includes(id) && rungs.indexOf(id) === state.rung + 1) return actions.climb()
      if (id === rule) return state.changed ? actions.why(id) : actions.change()
      if (choices.includes(id) && id !== state.choice) return state.alt ? actions.swap(id) : actions.another()
      if (n.kind === 'sink' && state.choice === asked && residue.includes(id) && !state.residue) return actions.leaves()
      actions.show(id)
    }

    function ask(text: string) {
      const has = (re: RegExp) => re.test(text)
      // A suggestion typed out does what clicking it does.
      const bare = (x: string) => x.toLowerCase().replace(/[?“”"]/g, '').trim()
      if (bare(say.leavesAsk()) === bare(text)) return actions.leaves()
      if (bare(l.another ?? 'Is there another way?') === bare(text)) return actions.another()
      const asked_ = nodes.find((n) => n.ask && bare(n.ask) === bare(text))
      if (asked_) return rungs.includes(asked_.id) ? actions.climb() : go(asked_.id)
      if (has(/back to|overview|whole|everything|reset/)) return actions.overview()
      const intent = l.intents?.find(([re]) => has(re))?.[1]
      if (intent) return go(intent)
      if (has(/instead|alternative|another way|other way|without|other option|different|compare/)) return state.alt ? actions.swap() : actions.another()
      if (has(/behind|leave|left|residue|side.?effect|downside|cost|risk/)) return state.choice === asked ? actions.leaves() : actions.why(state.choice)
      if (has(/\bwhy\b|what.* for|purpose|need|want|really|point/)) {
        const id = mentioned(text)
        if (!id || id === rungs[state.rung]) return actions.climb()
        return actions.show(id)
      }
      const id = mentioned(text)
      if (id) return go(id)
      speak(LOST)
    }

    function suggestions(): Suggestion[] {
      const s: Suggestion[] = []
      const add = (label: string, run: () => void) => s.push({ label, run })
      // Climb to what they want first; the rest of the story is told from there.
      if (state.rung < want) add(say.climbAsk(state.rung + 1), actions.climb)
      if (state.rung >= want && !state.residue && state.choice === asked) add(say.leavesAsk(), actions.leaves)
      if (state.rung >= want && alts.length && !state.alt) add(l.another ?? 'Is there another way?', actions.another)
      if (rule && state.alt && !state.changed) add(N[rule].ask ?? 'What has changed?', actions.change)
      if (state.alt && (!rule || state.changed)) {
        const next = choices[(choices.indexOf(state.choice) + 1) % choices.length]
        add(say.swapAsk(next), () => actions.swap(next))
      }
      if (state.rung >= want && state.rung < top) add(say.climbAsk(state.rung + 1), actions.climb)
      if (state.rung >= want) add('Show the whole ladder', actions.overview)
      return s.slice(0, 4)
    }

    // ------------------------------------------------------------ narrated tour

    // Climb to what they want, see what this way leaves behind, bring up the other
    // answers, change the rule, swap, climb the rest of the way, and close.
    const tour: (() => void)[] = [
      () => {
        Object.assign(state, initial())
        settle('all', 60)
        speak(l.intro)
      },
    ]
    for (let i = 1; i <= want; i++) tour.push(actions.climb)
    if (residue.length) tour.push(actions.leaves)
    if (alts.length) {
      tour.push(actions.another)
      if (rule) tour.push(actions.change)
      tour.push(() => actions.swap(alts[0]))
    }
    for (let i = want + 1; i <= top; i++) tour.push(actions.climb)
    tour.push(() => {
      state.focus = null
      settle('all', 40)
      speak(l.close)
    })

    return { intro: l.intro, actions, click, ask, suggestions, tour }
  }

  const initial = (): LadderState => ({ zoom: 'root', focus: null, hover: null, rung: 0, residue: false, alt: false, changed: false, choice: asked })

  return {
    id: l.id,
    title: l.title,
    goal: '',
    system: rungs[top],
    NODES: N,
    EDGES: edges,
    initialState: initial,
    compose,
    script,
    visiblePath: true,
    maxZoom: 1.5,
    lines,
  }
}
