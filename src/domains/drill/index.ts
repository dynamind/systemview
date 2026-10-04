// Hanging a picture: a story without a boundary. It starts at the solution
// people ask for and climbs the ladder of “what is this for?” until other
// answers fit. Written out by hand, like the dairy farm.

import { finish, lineage, placer, type BaseState, type Composition, type Domain, type EdgeDef, type Kit, type NodeDef, type Script, type Suggestion } from '../../scene/model'

interface State extends BaseState {
  /** How far up the ladder we've climbed: 0 the drill alone, 4 the top. */
  rung: 0 | 1 | 2 | 3 | 4
  residue: boolean
  /** Adhesive nails have been brought up. */
  alt: boolean
  choice: 'drill' | 'nails'
  /** The other answers at the top rung. */
  more: boolean
}

const initialState = (): State => ({ zoom: 'root', focus: null, hover: null, rung: 0, residue: false, alt: false, choice: 'drill', more: false })

const nodes: NodeDef[] = [
  // The ladder, bottom to top
  {
    id: 'drill',
    kind: 'solution',
    label: 'Drill',
    tag: 'what they asked for',
    parent: 'hole',
    relation: 'makes',
    why: 'The drill is what people walk into the shop for. It’s a solution, and like every solution it exists for something else.',
  },
  {
    id: 'hole',
    kind: 'need',
    label: 'A hole in the wall',
    tag: 'means',
    parent: 'screw',
    relation: 'for',
    why: 'Nobody wants a hole in the wall. It’s a step on the way to something, and it stays behind long after the reason for it has gone.',
  },
  {
    id: 'screw',
    kind: 'need',
    label: 'Plug & screw',
    note: 'something to hang it on',
    tag: 'means',
    parent: 'picture',
    relation: 'to hold',
    why: 'The plug and screw give the picture something to hang on. They’re means too, chosen because of the drill as much as for the picture.',
  },
  {
    id: 'picture',
    kind: 'need',
    label: 'Picture on the wall',
    note: 'what they came in for',
    parent: 'home',
    relation: 'for',
    why: 'This is what they actually want: a picture on the wall. Everything below it is one way of getting there.',
  },
  {
    id: 'home',
    kind: 'need',
    label: 'Feeling at home',
    note: 'why the picture is there',
    why: 'The picture is there to make a room feel like theirs. You could keep climbing, but somewhere you stop: high enough that other answers fit, low enough to act on.',
  },

  // What each rung leaves behind, hung on the rung that causes it
  { id: 'dust', kind: 'sink', label: 'Dust & noise', valence: 'undesired', parent: 'drill', relation: 'left by', why: 'Drilling means dust on the floor and noise for the neighbours. Small, but nobody asked for it.' },
  {
    id: 'scars',
    kind: 'sink',
    label: 'Holes when you move',
    note: 'filled and painted over',
    valence: 'undesired',
    parent: 'hole',
    relation: 'left by',
    why: 'The picture comes down one day; the hole doesn’t. It gets filled, sanded and painted over, often by someone else.',
  },
  {
    id: 'dUnknown',
    kind: 'sink',
    label: '?',
    note: 'what’s behind the plaster',
    valence: 'unknown',
    parent: 'drill',
    relation: 'left by',
    why: 'A pipe, a cable, a hollow wall that won’t hold a plug. Nobody knows until the bit goes in.',
  },
  {
    id: 'holds',
    kind: 'sink',
    label: 'Holds anything',
    valence: 'desired',
    parent: 'screw',
    relation: 'left by',
    why: 'A screw in a plug holds a mirror, a shelf, a heavy frame. That’s the strength of this way, and it comes from the plug and screw, not the drill.',
  },

  // The answer one rung up
  {
    id: 'nails',
    kind: 'solution',
    label: 'Adhesive nails',
    tag: 'attaches higher',
    parent: 'picture',
    relation: 'to hang',
    why: 'Adhesive nails stick straight to the wall. They answer the picture, not the hole, so the hole, the plug and the screw are no longer needed, and neither is the drill.',
  },
  { id: 'clean', kind: 'sink', label: 'Clean wall', valence: 'desired', parent: 'nails', relation: 'left by', why: 'Peel the nail off and the wall is as it was. Nothing to fill, nothing to paint.' },
  {
    id: 'limit',
    kind: 'sink',
    label: 'Weight limit',
    note: 'a few kilos at most',
    valence: 'undesired',
    parent: 'nails',
    relation: 'left by',
    why: 'Glue holds a frame, not a mirror. Attaching higher costs something too: it only fits the needs it was made for.',
  },
  {
    id: 'nUnknown',
    kind: 'sink',
    label: '?',
    note: 'will it hold in three years?',
    valence: 'unknown',
    parent: 'nails',
    relation: 'left by',
    why: 'Heat, damp, old paint. Whether the glue still holds in three years is a question mark, and the picture finds out first.',
  },

  // Other answers at the top
  {
    id: 'plants',
    kind: 'solution',
    label: 'Plants',
    tag: 'another answer',
    parent: 'home',
    relation: 'for',
    why: 'Plants make a room feel lived in too. Up here, a picture is just one answer among many.',
  },
  {
    id: 'paint',
    kind: 'solution',
    label: 'Paint a wall',
    tag: 'another answer',
    parent: 'home',
    relation: 'for',
    why: 'A colour on the wall does it without hanging anything at all. The higher the rung, the less the answers look like a drill.',
  },
]

const NODES: Record<string, NodeDef> = Object.fromEntries(nodes.map((n) => [n.id, n]))

const up = (id: string, from: string, to: string, extra: Partial<EdgeDef> = {}): EdgeDef => ({ id, from, to, kind: 'serves', fromSide: 'top', toSide: 'bottom', ...extra })
const out = (id: string, from: string, to: string, valence: EdgeDef['valence']): EdgeDef => ({ id, from, to, kind: 'flow', valence })

const EDGES: EdgeDef[] = [
  up('uDrill', 'drill', 'hole'),
  up('uHole', 'hole', 'screw'),
  up('uScrew', 'screw', 'picture'),
  up('uPicture', 'picture', 'home'),
  up('uNails', 'nails', 'picture', { fromSide: 'left', toSide: 'right' }),
  up('uPlants', 'plants', 'home', { fromSide: 'right', toSide: 'left' }),
  up('uPaint', 'paint', 'home', { fromSide: 'right', toSide: 'left' }),
  out('oDust', 'drill', 'dust', 'undesired'),
  out('oDUnknown', 'drill', 'dUnknown', 'unknown'),
  out('oScars', 'hole', 'scars', 'undesired'),
  out('oHolds', 'screw', 'holds', 'desired'),
  out('oClean', 'nails', 'clean', 'desired'),
  out('oLimit', 'nails', 'limit', 'undesired'),
  out('oNUnknown', 'nails', 'nUnknown', 'unknown'),
]

const RUNGS = ['drill', 'hole', 'screw', 'picture', 'home']
const STEP = 110
/** What each rung leaves behind; together, what the drill’s way costs. */
const LEFT: Record<string, string[]> = { drill: ['dust', 'dUnknown'], hole: ['scars'], screw: ['holds'] }
const DRILL_OUTS = Object.values(LEFT).flat()
const NAIL_OUTS = ['clean', 'limit', 'nUnknown']

function compose(s: State): Composition {
  const c: Composition = { nodes: {}, edges: {} }
  const { put, column } = placer(NODES, c)
  // Nails answer the picture: every rung below it is no longer needed.
  const skipped = s.choice === 'nails'
  RUNGS.slice(0, s.rung + 1).forEach((id, i) =>
    put(id, 0, STEP - i * STEP, {
      delay: 120,
      from: i ? RUNGS[i - 1] : undefined,
      g: skipped && i < 3 ? 1 : 0,
      s: skipped && i === 0 ? 0.86 : 1,
    }),
  )
  // Each rung's leftovers sit to its right; when the nails skip a rung, they go quiet with it.
  if (s.residue) {
    let k = 0
    RUNGS.slice(0, 3).forEach((rung, i) =>
      column(LEFT[rung], 115, STEP - i * STEP, 42, () => ({ delay: 260 + k++ * 90, from: rung, g: skipped ? 1 : 0 })),
    )
  }
  if (s.alt) {
    put('nails', 270, -2 * STEP, { delay: 200, from: 'picture', g: skipped ? 0 : 1, s: skipped ? 1 : 0.86 })
    if (skipped) column(NAIL_OUTS, 380, -2 * STEP, 42, (i) => ({ delay: 420 + i * 70, from: 'nails' }))
  }
  if (s.more) {
    put('plants', -270, -3 * STEP - 38, { delay: 300, from: 'home' })
    put('paint', -270, -3 * STEP + 38, { delay: 420, from: 'home' })
  }
  return finish(c, s, NODES, EDGES)
}

// ------------------------------------------------------------ the conversation

const INTRO = 'Someone walks into a hardware store. They want a drill. Or do they?'

const L = {
  climb: [
    '',
    'Nobody wants a drill. They want a hole in the wall. The drill is just how you get one.',
    'Nobody wants a hole either. It’s there for a plug and a screw: something to hang a thing on.',
    'And the screw is there to hold a picture. That’s what they came in for: a picture on the wall. Everything below it is means.',
    'Why a picture? To make a room feel like theirs. The ladder keeps going, as far as you care to climb.',
  ],
  top: 'The whole ladder: feeling at home, a picture, a screw, a hole, a drill. Each rung answers the one above it.',
  residue:
    'What does this way leave behind? The drill: dust and noise, and a gamble with what’s behind the plaster. The hole: it stays when you move out. The plug and screw: they hold anything. That’s the strength of this way.',
  alt: 'Up at the picture, other answers fit. Adhesive nails stick straight to the wall. They don’t need a hole, a plug or a screw, and so they don’t need a drill.',
  toNails:
    'Three rungs skipped, and what they left behind goes with them: the dust, the gamble, the holes. The strength goes too: glue won’t hold just anything. The nails leave their own: a clean wall, a weight limit, and a question mark. Will it still hold in three years? The higher you attach a solution, the more of the ladder it lets go of, good and bad.',
  toDrill: 'Back to the drill. The plug and screw hold anything, and the way there costs a hole, some dust, and a gamble with the plaster. Neither answer is clean; they leave different things behind.',
  more: 'Climb once more, and the picture is just one answer too. Plants would do, or a colour on the wall. The higher you climb, the more answers fit, and the less any of them looks like a drill.',
  overview: 'The whole ladder, as far as we’ve climbed it.',
  close: 'People don’t want a drill. Ask what each thing is for, climb until the answers start to multiply, and solve it there.',
  lost: 'This prototype follows a scripted story, so I only understand a little. Try a suggestion below, or click anything on the canvas.',
}

function script({ scene, state, say, settle }: Kit<State>): Script {
  const ladder = () => RUNGS.slice(0, state.rung + 1)

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
      if (state.rung === 4) {
        state.focus = 'drill'
        settle('all', 40)
        return say(L.top)
      }
      if (state.rung === 3) return actions.more()
      state.rung = (state.rung + 1) as State['rung']
      state.focus = 'drill'
      settle(ladder(), 60)
      say(L.climb[state.rung])
    },

    residue() {
      // Climb first: what a way leaves behind only reads once you see what it's for.
      if (state.rung < 3) state.rung = 3
      state.residue = true
      state.choice = 'drill'
      state.focus = null
      settle([...ladder().slice(0, 4), ...DRILL_OUTS], 50)
      say(L.residue)
    },

    alt() {
      if (state.rung < 3) state.rung = 3
      state.alt = true
      state.focus = null
      settle([...ladder().slice(0, 4), 'nails'], 50)
      say(L.alt)
    },

    swap() {
      if (state.rung < 3) state.rung = 3
      state.alt = true
      state.focus = null
      state.choice = state.choice === 'drill' ? 'nails' : 'drill'
      if (state.choice === 'drill') state.residue = true
      settle([...ladder().slice(0, 4), 'nails', ...(state.residue ? DRILL_OUTS : []), ...(state.choice === 'nails' ? NAIL_OUTS : [])], 50)
      say(state.choice === 'nails' ? L.toNails : L.toDrill)
    },

    more() {
      state.rung = 4
      state.more = true
      state.focus = null
      settle(['picture', 'home', 'plants', 'paint', ...(state.alt ? ['nails'] : []), ...(state.choice === 'nails' ? NAIL_OUTS : [])], 50)
      say(L.more)
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
    if (id === top() && state.rung < 4) return actions.climb()
    if (id === 'drill' && state.choice === 'nails') return actions.swap()
    if (id === 'nails' && state.choice === 'drill') return actions.swap()
    if (id === 'drill' && !state.residue && state.rung >= 3) return actions.residue()
    actions.why(id)
  }

  function findMentioned(text: string) {
    const shown = Object.keys(scene.composition().nodes)
    const words: Record<string, RegExp> = { drill: /drill/, hole: /hole/, screw: /screw|plug/, picture: /picture|frame|painting/, home: /home|room/, nails: /nail|adhesive|glue|stick/ }
    return shown.find((id) => words[id]?.test(text)) ?? shown.find((id) => NODES[id].label.length > 1 && text.includes(NODES[id].label.toLowerCase()))
  }

  function ask(text: string) {
    const has = (re: RegExp) => re.test(text)
    if (has(/back|overview|whole|everything|reset/)) return actions.overview()
    if (has(/instead|alternative|another way|other way|without|other option|different/)) {
      if (!state.alt) return actions.alt()
      return actions.swap()
    }
    if (has(/nail|adhesive|glue|stick/)) return state.choice === 'nails' && state.alt ? actions.why('nails') : state.alt ? actions.swap() : actions.alt()
    if (has(/behind|leave|left|residue|side.?effect|downside|cost|mess|dust|risk/)) return state.choice === 'nails' ? actions.why('nails') : actions.residue()
    if (has(/plant|paint|colou?r|higher|further|keep going|feel|home|room/)) return actions.more()
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
    const asks = ['What’s the drill for?', 'What’s the hole for?', 'What’s the screw for?']
    if (state.rung < 3) add(asks[state.rung], actions.climb)
    if (state.rung >= 3 && !state.residue && state.choice === 'drill') add('What does this way leave behind?', actions.residue)
    if (state.rung >= 3 && !state.alt) add('Is there another way?', actions.alt)
    if (state.alt) add(state.choice === 'drill' ? 'What about adhesive nails?' : 'Compare with the drill', actions.swap)
    if (state.rung >= 3 && !state.more) add('Why a picture?', actions.more)
    if (state.rung >= 3) add('Show the whole ladder', actions.overview)
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
    actions.climb,
    actions.residue,
    actions.alt,
    actions.swap,
    actions.more,
    () => {
      state.focus = null
      settle('all', 40)
      say(L.close)
    },
  ]

  return { intro: INTRO, actions, click, ask, suggestions, tour }
}

export const drill: Domain<State> = {
  id: 'drill',
  title: 'Hanging a picture',
  goal: '',
  system: 'home',
  NODES,
  EDGES,
  initialState,
  compose,
  script,
  visiblePath: true,
  maxZoom: 1.5,
  lines: () => [INTRO, ...Object.values(L).flat().filter(Boolean), ...nodes.flatMap((n) => (n.why ? [n.why] : []))],
}
