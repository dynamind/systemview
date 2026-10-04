// Build or buy: a story about a rule that shaped an answer. Generic software is
// a sound answer to “crafting software is expensive”; agentic AI changes that
// rule, and the answer it shaped is open again. Written out by hand, like the drill.

import { finish, lineage, placer, type BaseState, type Composition, type Domain, type EdgeDef, type Kit, type NodeDef, type Script, type Suggestion } from '../../scene/model'

interface State extends BaseState {
  /** How far up the ladder we've climbed: 0 the package alone, 2 the top. */
  rung: 0 | 1 | 2
  residue: boolean
  /** Building our own has been asked about: the rule and the alternative are showing. */
  alt: boolean
  /** Agentic AI has changed the rule. */
  ai: boolean
  choice: 'package' | 'custom'
}

const initialState = (): State => ({ zoom: 'root', focus: null, hover: null, rung: 0, residue: false, alt: false, ai: false, choice: 'package' })

const nodes: NodeDef[] = [
  // The ladder, bottom to top
  {
    id: 'package',
    kind: 'solution',
    label: 'CRM licence',
    tag: 'what they asked for',
    parent: 'track',
    relation: 'for',
    why: 'A CRM package is what teams ask for. It’s a solution, made for every team at once, and it exists for something else.',
  },
  {
    id: 'track',
    kind: 'need',
    label: 'Track customers',
    note: 'the way this team sells',
    tag: 'means',
    parent: 'back',
    relation: 'for',
    why: 'Keeping track of customers, the way this team actually sells. The package knows customers; it doesn’t know this team.',
  },
  {
    id: 'back',
    kind: 'need',
    label: 'Customers who return',
    note: 'what they actually want',
    why: 'This is what they want: customers who come back. Everything below it is one way of getting there.',
  },

  // What the package leaves behind
  { id: 'dayOne', kind: 'sink', label: 'Works on day one', valence: 'desired', parent: 'package', relation: 'left by', why: 'Install it, add users, go. Someone else wrote it, tested it and keeps it running. That’s the real strength of buying.' },
  {
    id: 'licence',
    kind: 'sink',
    label: 'Licence fees',
    note: 'per seat, every year',
    valence: 'undesired',
    parent: 'package',
    relation: 'left by',
    why: 'The bill comes every year, for every seat, whether the team uses half the features or all of them.',
  },
  {
    id: 'mismatch',
    kind: 'sink',
    label: 'Workarounds',
    note: 'spreadsheets on the side',
    valence: 'undesired',
    parent: 'package',
    relation: 'left by',
    why: 'Built for everyone, it fits no one exactly. The team bends its way of selling to the tool, and what doesn’t fit ends up in a spreadsheet.',
  },
  {
    id: 'pUnknown',
    kind: 'sink',
    label: '?',
    note: 'the vendor’s roadmap',
    valence: 'unknown',
    parent: 'package',
    relation: 'left by',
    why: 'Prices change, features go, the vendor gets bought. The roadmap is someone else’s, and so is the question mark.',
  },

  // The rule behind the choice
  {
    id: 'rule',
    kind: 'rule',
    label: 'Crafting is expensive',
    tag: 'rule · why we buy',
    note: 'agents make it cheap',
    why: 'Software takes a team, months, and several tries to get right. Under that rule, buying something generic is the sensible answer.',
  },

  // The answer the rule kept off the table
  {
    id: 'custom',
    kind: 'solution',
    label: 'Our own software',
    tag: 'built to fit',
    parent: 'track',
    relation: 'for',
    why: 'Software made for this team: its customers, its way of selling. Under the old rule, too slow and too dear. Under the new one, a real answer.',
  },
  { id: 'fits', kind: 'sink', label: 'Fits how we work', valence: 'desired', parent: 'custom', relation: 'left by', why: 'It follows the way the team sells, and it changes when the team does. No workarounds, no spreadsheet on the side.' },
  { id: 'noLicence', kind: 'sink', label: 'No licence fees', valence: 'desired', parent: 'custom', relation: 'left by', why: 'Nothing to pay per seat. The cost moves from a licence to the work of keeping it right.' },
  {
    id: 'upkeep',
    kind: 'sink',
    label: 'We own the upkeep',
    note: 'security, fixes, hosting',
    valence: 'undesired',
    parent: 'custom',
    relation: 'left by',
    why: 'Nobody else patches it, hosts it or answers when it breaks. Cheaper to make is not the same as free to keep.',
  },
  {
    id: 'cUnknown',
    kind: 'sink',
    label: '?',
    note: 'who understands it in three years?',
    valence: 'unknown',
    parent: 'custom',
    relation: 'left by',
    why: 'Code an agent wrote in a week still has to make sense to someone in three years. Whether it does is the new question mark.',
  },
]

const NODES: Record<string, NodeDef> = Object.fromEntries(nodes.map((n) => [n.id, n]))

const up = (id: string, from: string, to: string, extra: Partial<EdgeDef> = {}): EdgeDef => ({ id, from, to, kind: 'serves', fromSide: 'top', toSide: 'bottom', ...extra })
const out = (id: string, from: string, to: string, valence: EdgeDef['valence']): EdgeDef => ({ id, from, to, kind: 'flow', valence })

const EDGES: EdgeDef[] = [
  up('uPackage', 'package', 'track'),
  up('uTrack', 'track', 'back'),
  up('uCustom', 'custom', 'track', { fromSide: 'left', toSide: 'right' }),
  { id: 'press', from: 'rule', to: 'package', kind: 'pressure', fromSide: 'right', toSide: 'left' },
  out('oDayOne', 'package', 'dayOne', 'desired'),
  out('oLicence', 'package', 'licence', 'undesired'),
  out('oMismatch', 'package', 'mismatch', 'undesired'),
  out('oPUnknown', 'package', 'pUnknown', 'unknown'),
  out('oFits', 'custom', 'fits', 'desired'),
  out('oNoLicence', 'custom', 'noLicence', 'desired'),
  out('oUpkeep', 'custom', 'upkeep', 'undesired'),
  out('oCUnknown', 'custom', 'cUnknown', 'unknown'),
]

const RUNGS = ['package', 'track', 'back']
const STEP = 110
const PACKAGE_OUTS = ['dayOne', 'licence', 'mismatch', 'pUnknown']
const CUSTOM_OUTS = ['fits', 'noLicence', 'upkeep', 'cUnknown']

function compose(s: State): Composition {
  const c: Composition = { nodes: {}, edges: {} }
  const { put, column } = placer(NODES, c)
  const built = s.choice === 'custom'
  RUNGS.slice(0, s.rung + 1).forEach((id, i) =>
    put(id, 0, STEP - i * STEP, { delay: 120, from: i ? RUNGS[i - 1] : undefined, g: built && i === 0 ? 1 : 0, s: built && i === 0 ? 0.86 : 1 }),
  )
  if (s.residue) column(PACKAGE_OUTS, 115, STEP, 42, (i) => ({ delay: 260 + i * 70, from: 'package', g: built ? 1 : 0 }))
  if (s.alt) {
    // The rule presses on the package from the left; agents strike it through.
    put('rule', -300, STEP, { delay: 160, r: s.ai ? 1 : 0 })
    put('custom', 300, -70, { delay: 260, from: 'track', g: built ? 0 : 1, s: built ? 1 : 0.86 })
    if (built) column(CUSTOM_OUTS, 410, -70, 42, (i) => ({ delay: 420 + i * 70, from: 'custom' }))
  }
  return finish(c, s, NODES, EDGES)
}

// ------------------------------------------------------------ the conversation

const INTRO = 'A team asks for a CRM licence. Everyone buys one; it’s just what you do.'

const L = {
  climb: [
    '',
    'What’s the CRM for? Keeping track of customers, the way this team sells.',
    'And that’s there for customers who come back. That’s what they actually want. The licence is one way of getting there.',
  ],
  top: 'The ladder as far as it matters here: customers who come back, kept track of the way this team sells. The licence answers that from below.',
  residue:
    'What does the package leave behind? It works on day one, and someone else keeps it running. It also costs a licence per seat, every year. And it was made for everyone, so it fits no one exactly: workarounds, and spreadsheets on the side. Plus a question mark: the vendor’s roadmap.',
  alt: 'Why not build our own? Because of a rule: crafting software is expensive. It takes a team, months, and several tries to get right. Under that rule, buying generic is the sensible answer. The package is there because of the rule, not because it fits.',
  blocked: 'Under the rule, building your own means a team and months of work before anything runs. That’s why the package won. Ask what has changed.',
  ai: 'Agentic AI changes the rule. Crafting gets cheap: a working version in days, changed as often as the work changes. The rule that made buying sensible is weakening, and the answer it kept off the table is back on it.',
  toCustom:
    'Built to fit. It follows the way this team sells, and there’s no licence. The workarounds go, and so does the vendor’s roadmap. It leaves its own: the upkeep is ours now, and a question mark. Who understands it in three years? Neither answer is clean. But the rule that decided between them has changed.',
  toPackage: 'Back to the package. It works on day one and someone else runs it, and it costs a licence, a roadmap that isn’t ours, and a way of working bent to fit.',
  overview: 'The whole picture, as far as we’ve looked.',
  close: 'Generic software was a sound answer to a rule: crafting is expensive. When a rule changes, go back to the answers it shaped.',
  lost: 'This prototype follows a scripted story, so I only understand a little. Try a suggestion below, or click anything on the canvas.',
}

function script({ scene, state, say, settle }: Kit<State>): Script {
  const ladder = () => RUNGS.slice(0, state.rung + 1)
  const shownOuts = () => [...(state.residue ? PACKAGE_OUTS : []), ...(state.choice === 'custom' ? CUSTOM_OUTS : [])]

  const actions = {
    overview() {
      state.focus = null
      settle('all', 40)
      say(L.overview)
    },
    open() {
      actions.overview()
    },

    climb() {
      if (state.rung === 2) {
        state.focus = 'package'
        settle('all', 40)
        return say(L.top)
      }
      state.rung = (state.rung + 1) as State['rung']
      state.focus = 'package'
      settle(ladder(), 60)
      say(L.climb[state.rung])
    },

    residue() {
      state.rung = 2
      state.residue = true
      state.choice = 'package'
      state.focus = null
      settle([...ladder(), ...PACKAGE_OUTS], 50)
      say(L.residue)
    },

    alt() {
      state.rung = 2
      state.alt = true
      state.focus = null
      settle([...ladder(), 'rule', 'custom', ...shownOuts()], 50)
      say(L.alt)
    },

    ai() {
      state.rung = 2
      state.alt = true
      state.ai = true
      state.focus = null
      settle([...ladder(), 'rule', 'custom', ...shownOuts()], 50)
      say(L.ai)
    },

    swap() {
      if (!state.alt) return actions.alt()
      if (!state.ai && state.choice === 'package') {
        state.focus = 'rule'
        settle([...ladder(), 'rule', 'custom'], 50)
        return say(L.blocked)
      }
      state.focus = null
      state.choice = state.choice === 'package' ? 'custom' : 'package'
      if (state.choice === 'package') state.residue = true
      settle([...ladder(), 'rule', 'custom', ...shownOuts()], 50)
      say(state.choice === 'custom' ? L.toCustom : L.toPackage)
    },

    why(id: string, text?: string) {
      const n = NODES[id]
      if (!n) return
      state.focus = id
      const shown = scene.composition().nodes
      const chain = lineage(NODES, id).filter((c) => shown[c])
      settle(chain.length > 1 ? chain : [id], 50)
      say(text ?? n.why ?? n.label)
    },

    clearFocus() {
      state.focus = null
    },
  }

  const top = () => RUNGS[state.rung]

  function click(id: string) {
    if (id === top() && state.rung < 2) return actions.climb()
    if (id === 'rule' && !state.ai) return actions.ai()
    if (id === 'custom' && state.choice === 'package') return actions.swap()
    if (id === 'package' && state.choice === 'custom') return actions.swap()
    if (id === 'package' && !state.residue && state.rung === 2) return actions.residue()
    actions.why(id)
  }

  function findMentioned(text: string) {
    const shown = Object.keys(scene.composition().nodes)
    const words: Record<string, RegExp> = {
      package: /crm|package|licen[cs]e|generic|vendor/,
      track: /track|records?/,
      back: /come back|loyal|return/,
      rule: /rule|expensive/,
      custom: /own|custom|bespoke/,
    }
    return shown.find((id) => words[id]?.test(text)) ?? shown.find((id) => NODES[id].label.length > 1 && text.includes(NODES[id].label.toLowerCase()))
  }

  function ask(text: string) {
    const has = (re: RegExp) => re.test(text)
    if (has(/back to|overview|whole|everything|reset/)) return actions.overview()
    if (has(/\bai\b|agent|llm|claude|cop[iy]lot|what.*chang/)) return actions.ai()
    if (has(/build|own|custom|bespoke|craft|instead|alternative|another way|other way/)) return state.alt && state.choice === 'package' ? actions.swap() : state.alt ? actions.why('custom') : actions.alt()
    if (has(/compare|package|buy/) && state.choice === 'custom') return actions.swap()
    if (has(/behind|leave|left|residue|side.?effect|downside|cost|risk/)) return state.choice === 'custom' ? actions.why('custom') : actions.residue()
    if (has(/rule|expensive/)) return state.alt ? actions.why('rule') : actions.alt()
    if (has(/\bwhy\b|what.* for|purpose|need|want|really|point/)) {
      const id = findMentioned(text)
      if (!id || id === top()) return actions.climb()
      return actions.why(id)
    }
    const id = findMentioned(text)
    if (id) return actions.why(id)
    say(L.lost)
  }

  function suggestions(): Suggestion[] {
    const s: Suggestion[] = []
    const add = (label: string, run: () => void) => s.push({ label, run })
    const asks = ['What’s the CRM for?', 'What’s keeping track for?']
    if (state.rung < 2) add(asks[state.rung], actions.climb)
    if (state.rung === 2 && !state.residue && state.choice === 'package') add('What does the package leave behind?', actions.residue)
    if (state.rung === 2 && !state.alt) add('Why not build our own?', actions.alt)
    if (state.alt && !state.ai) add('What does agentic AI change?', actions.ai)
    if (state.ai) add(state.choice === 'package' ? 'Build our own, then?' : 'Compare with the package', actions.swap)
    if (state.rung === 2) add('Show the whole picture', actions.overview)
    return s.slice(0, 4)
  }

  const tour: (() => void)[] = [
    () => {
      Object.assign(state, initialState())
      settle('all', 60)
      say(INTRO)
    },
    actions.climb,
    actions.climb,
    actions.residue,
    actions.alt,
    actions.ai,
    actions.swap,
    () => {
      state.focus = null
      settle('all', 40)
      say(L.close)
    },
  ]

  return { intro: INTRO, actions, click, ask, suggestions, tour }
}

export const buildBuy: Domain<State> = {
  id: 'buildbuy',
  title: 'Build or buy',
  goal: '',
  system: 'team',
  NODES,
  EDGES,
  initialState,
  compose,
  script,
  visiblePath: true,
  maxZoom: 1.5,
  lines: () => [INTRO, ...Object.values(L).flat().filter(Boolean), ...nodes.flatMap((n) => (n.why ? [n.why] : []))],
}
