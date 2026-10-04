// The dairy-farm world: a hand-placed catalogue of boxes and flows, and a
// compose() that turns the scene state into layout targets for the animator.

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
  /** Who proposed this solution: every solution is someone’s hypothesis. */
  by?: string
  /** A rule designed as a solution, the mirror image of a rule that makes a problem. */
  byRule?: boolean
  /** A named output that condensed out of the fog: drawn as a cloud shrinking into a dot. */
  condenses?: boolean
}

export interface EdgeDef {
  id: string
  from: string
  to: string
  kind: 'flow' | 'becomes' | 'solves' | 'pressure' | 'speculates' | 'proposes'
  valence?: Valence
  fromSide?: Side
  toSide?: Side
  /** Anchor this end at the system-side port of another edge (boundary balance). */
  viaFrom?: string
  viaTo?: string
  inner?: boolean
}

export interface SceneState {
  zoom: 'root' | 'farm'
  manure: boolean
  manureChoice: 'digester' | 'spread'
  fog: boolean
  promoted: string[]
  cap: boolean
  capChoice: 'additive' | 'fewer'
  /** Does the digester pay for itself? */
  pays: boolean
  /** The water beds: 0 not yet, 1 adopted, 2 the fog condenses, 3 reversed. */
  beds: 0 | 1 | 2 | 3
  focus: string | null
  hover: string | null
}

export const initialState = (): SceneState => ({
  zoom: 'root',
  manure: false,
  manureChoice: 'digester',
  fog: false,
  promoted: [],
  cap: false,
  capChoice: 'additive',
  pays: false,
  beds: 0,
  focus: null,
  hover: null,
})

const nodes: NodeDef[] = [
  {
    id: 'farm',
    kind: 'system',
    label: 'Dairy farm',
    note: 'makes a living from milk',
    relation: 'exists to',
    why: 'The farm turns grass, feed and care into milk. Everything else on this canvas exists because of that.',
  },

  // Inputs
  { id: 'water', kind: 'source', label: 'Water' },
  { id: 'feed', kind: 'source', label: 'Feed' },
  { id: 'genetics', kind: 'source', label: 'Genetics' },
  { id: 'energy', kind: 'source', label: 'Energy' },
  { id: 'services', kind: 'source', label: 'Vet & contractors' },

  // Outputs
  { id: 'milk', kind: 'sink', label: 'Milk', valence: 'desired', parent: 'farm', relation: 'output of' },
  { id: 'beef', kind: 'sink', label: 'Beef & calves', valence: 'desired', parent: 'farm', relation: 'output of' },
  { id: 'manure', kind: 'sink', label: 'Manure', valence: 'undesired', parent: 'farm', relation: 'output of' },
  { id: 'methane', kind: 'sink', label: 'Methane', valence: 'undesired', parent: 'farm', relation: 'output of' },
  { id: 'runoff', kind: 'sink', label: 'Nitrogen runoff', valence: 'undesired', diffuse: true, parent: 'farm', relation: 'output of' },
  { id: 'unknown', kind: 'sink', label: '?', note: 'not yet known', valence: 'unknown', parent: 'farm', relation: 'output of' },

  // Inside the farm
  { id: 'feeding', kind: 'part', label: 'Feeding', parent: 'farm', relation: 'part of', why: 'Feeding mixes bought feed with the farm’s own grass, so the herd eats what the land can’t fully provide.' },
  { id: 'youngstock', kind: 'part', label: 'Young stock', parent: 'farm', relation: 'part of', why: 'Young stock replaces cows that leave the herd. Genetics come in here, and pay off years later.' },
  { id: 'herd', kind: 'part', label: 'Herd', parent: 'farm', relation: 'part of', why: 'The herd is the conversion engine: feed and water in, milk, calves, manure and methane out.' },
  { id: 'milking', kind: 'part', label: 'Milking', parent: 'farm', relation: 'part of', why: 'Milking turns a cow’s output into a product someone will buy. It is the narrowest gate of the farm.' },
  { id: 'storage', kind: 'part', label: 'Manure storage', parent: 'farm', relation: 'part of', why: 'Storage holds manure until the fields can take it. It’s a “contain” solution, and it’s been around so long nobody thinks of it as one.' },
  { id: 'fields', kind: 'part', label: 'Fields', parent: 'farm', relation: 'part of', why: 'The fields close the loop: manure in, grass out. They also leak whatever they can’t hold.' },

  // Manure branch
  {
    id: 'pManure',
    kind: 'problem',
    label: 'Manure surplus',
    note: 'more than the land can take',
    parent: 'manure',
    relation: 'arises from',
    why: 'Manure isn’t a problem by nature; the fields want it. It becomes one when there’s more of it than the land can absorb.',
  },
  {
    id: 'digester',
    kind: 'solution',
    label: 'Digester',
    strategy: 'transform',
    parent: 'pManure',
    relation: 'solves',
    why: 'The digester turns surplus manure into energy and a fertiliser that’s easier to handle. It costs capital to build and to keep tight.',
  },
  {
    id: 'spread',
    kind: 'solution',
    label: 'Spread on land',
    strategy: 'shift',
    parent: 'pManure',
    relation: 'solves',
    why: 'Spreading moves manure off the farm’s books and into the soil. What the soil can’t hold moves on, into groundwater and air.',
  },
  { id: 'biogas', kind: 'sink', label: 'Biogas', note: 'sold as energy', valence: 'desired', parent: 'digester', relation: 'output of' },
  {
    id: 'capital',
    kind: 'source',
    label: 'Capital & upkeep',
    parent: 'digester',
    relation: 'input of',
    why: 'Capital goes into the digester; it isn’t something the digester leaves behind. Every input a solution needs raises its own question: where does it come from?',
  },
  {
    id: 'pPays',
    kind: 'problem',
    label: 'Doesn’t pay for itself',
    note: 'gas revenue < capital & upkeep',
    parent: 'capital',
    relation: 'arises from',
    why: 'Whether the digester pays is the balance across its boundary: capital and upkeep in, gas revenue out. When the balance tips the wrong way, the input becomes a problem.',
  },
  {
    id: 'subsidy',
    kind: 'solution',
    label: 'Biogas subsidy',
    strategy: 'shift',
    byRule: true,
    parent: 'pPays',
    relation: 'solves',
    why: 'The subsidy is a rule designed as a solution: the state pays part of the bill because it wants the methane captured. It’s the mirror image of the cap.',
  },
  { id: 'paysOff', kind: 'sink', label: 'Digester pays off', valence: 'desired', parent: 'subsidy', relation: 'output of' },
  { id: 'policy', kind: 'sink', label: 'Depends on policy', note: 'until the next election', valence: 'undesired', parent: 'subsidy', relation: 'output of' },
  { id: 'subUnknown', kind: 'sink', label: '?', valence: 'unknown', parent: 'subsidy', relation: 'output of' },
  { id: 'digestate', kind: 'sink', label: 'Digestate', valence: 'desired', parent: 'digester', relation: 'output of' },
  { id: 'leaks', kind: 'sink', label: 'Methane leaks', valence: 'undesired', parent: 'digester', relation: 'output of' },
  { id: 'dUnknown', kind: 'sink', label: '?', valence: 'unknown', parent: 'digester', relation: 'output of' },
  { id: 'soil', kind: 'sink', label: 'Soil nutrients', valence: 'desired', parent: 'spread', relation: 'output of' },
  { id: 'nitrate', kind: 'sink', label: 'Nitrate to groundwater', note: 'diffuse', valence: 'undesired', diffuse: true, parent: 'spread', relation: 'output of' },
  { id: 'ammonia', kind: 'sink', label: 'Ammonia to air', note: 'diffuse', valence: 'undesired', diffuse: true, parent: 'spread', relation: 'output of' },
  { id: 'sUnknown', kind: 'sink', label: '?', valence: 'unknown', parent: 'spread', relation: 'output of' },

  // Methane cap branch
  { id: 'warming', kind: 'context', label: 'Climate warming' },
  {
    id: 'cap',
    kind: 'rule',
    label: 'Methane cap 2030',
    parent: 'warming',
    relation: 'the state’s answer to',
    why: 'The cap is someone else’s solution. For the state it answers warming; for the farm it is a new problem, created on purpose.',
  },
  {
    id: 'pCap',
    kind: 'problem',
    label: 'Methane over cap',
    note: 'made a problem by rule',
    parent: 'methane',
    relation: 'arises from',
    why: 'Methane was always leaving the farm. The cap is what makes it this farm’s problem.',
  },
  {
    id: 'additive',
    kind: 'solution',
    label: 'Feed additive',
    strategy: 'eliminate',
    parent: 'pCap',
    relation: 'solves',
    why: 'The additive suppresses methane in the rumen, at the source. It works today; what it does over a cow’s lifetime is still a question mark.',
  },
  {
    id: 'fewer',
    kind: 'solution',
    label: 'Fewer cows',
    strategy: 'eliminate',
    parent: 'pCap',
    relation: 'solves',
    why: 'Fewer cows meets the cap on paper. The milk is still drunk somewhere, so production and its methane move abroad.',
  },
  { id: 'lessCH4', kind: 'sink', label: 'Less methane', valence: 'desired', parent: 'additive', relation: 'output of' },
  { id: 'costL', kind: 'sink', label: 'Cost per litre', valence: 'undesired', parent: 'additive', relation: 'output of' },
  { id: 'aUnknown', kind: 'sink', label: '?', note: 'long-term effects', valence: 'unknown', parent: 'additive', relation: 'output of' },
  { id: 'lessCH4b', kind: 'sink', label: 'Less methane here', valence: 'desired', parent: 'fewer', relation: 'output of' },
  { id: 'income', kind: 'sink', label: 'Less milk & income', valence: 'undesired', parent: 'fewer', relation: 'output of' },
  { id: 'leakage', kind: 'sink', label: 'Production moves abroad', note: 'diffuse', valence: 'undesired', diffuse: true, parent: 'fewer', relation: 'output of' },
  { id: 'fUnknown', kind: 'sink', label: '?', valence: 'unknown', parent: 'fewer', relation: 'output of' },

  // Water beds: a solution that turned out to be an experiment
  {
    id: 'pLame',
    kind: 'problem',
    label: 'Lame cows',
    note: 'hard stalls, sore hocks',
    parent: 'farm',
    relation: 'arises in',
    why: 'Cows that lie badly stand too long, and their legs pay for it. Lameness costs milk and makes cows suffer.',
  },
  {
    id: 'beds',
    kind: 'solution',
    label: 'Heated water beds',
    strategy: 'eliminate',
    by: 'the vet',
    parent: 'pLame',
    relation: 'solves',
    why: 'The vet proposed heated water beds: soft and warm, so cows lie longer and their legs recover. A clear purpose, and an untested one.',
  },
  { id: 'rested', kind: 'sink', label: 'Rested cows', valence: 'desired', parent: 'beds', relation: 'output of' },
  {
    id: 'mastitis',
    kind: 'sink',
    label: 'Udder infections',
    valence: 'undesired',
    condenses: true,
    parent: 'beds',
    relation: 'output of',
    why: 'Warm and wet is exactly where bacteria thrive. Nobody named this output at design time; the herd named it.',
  },
  { id: 'bUnknown', kind: 'sink', label: '?', valence: 'unknown', parent: 'beds', relation: 'output of' },
  {
    id: 'pMastitis',
    kind: 'problem',
    label: 'Infected udders',
    note: 'caused by the cure',
    parent: 'mastitis',
    relation: 'arises from',
    why: 'An output nobody could name became one nobody could ignore.',
  },
  {
    id: 'cutOpen',
    kind: 'solution',
    label: 'Cut the beds open',
    strategy: 'reverse',
    by: 'the farmer',
    parent: 'pMastitis',
    relation: 'solves',
    why: 'Sometimes the best solution to a problem is to undo the solution that caused it. The farmer cut every bed open and took the loss.',
  },
  { id: 'losses', kind: 'sink', label: 'Losses accepted', valence: 'undesired', parent: 'cutOpen', relation: 'output of' },
  { id: 'lesson', kind: 'sink', label: 'Lesson learned', note: 'warm + wet breeds bacteria', valence: 'desired', parent: 'cutOpen', relation: 'output of' },
  { id: 'cUnknown', kind: 'sink', label: '?', valence: 'unknown', parent: 'cutOpen', relation: 'output of' },

  // Fog: hypotheses about unknown undesirables
  {
    id: 'h1',
    kind: 'hypothesis',
    label: 'Efficiency gains grow the herd',
    pattern: 'Rebound · Jevons',
    parent: 'unknown',
    relation: 'guessed from',
    why: 'If each cow gets cheaper to keep, the rational move is more cows. Total manure and methane rise even as each cow improves.',
  },
  {
    id: 'h2',
    kind: 'hypothesis',
    label: 'Bought feed replaces grassland',
    pattern: 'Shifting the burden',
    parent: 'unknown',
    relation: 'guessed from',
    why: 'Imported feed is easier than growing grass. Over time the land, and the skill of farming it, wither, and the farm depends on a supply chain it can’t see.',
  },
  {
    id: 'h3',
    kind: 'hypothesis',
    label: 'Routine antibiotics breed resistance',
    pattern: 'Fixes that fail',
    parent: 'unknown',
    relation: 'guessed from',
    why: 'Preventive treatment keeps the herd healthy this year and makes treatment weaker for everyone later.',
  },
]

export const NODES: Record<string, NodeDef> = Object.fromEntries(nodes.map((n) => [n.id, n]))

const f = (id: string, from: string, to: string, valence: Valence, extra: Partial<EdgeDef> = {}): EdgeDef => ({
  id,
  from,
  to,
  kind: 'flow',
  valence,
  ...extra,
})

export const EDGES: EdgeDef[] = [
  // Boundary flows
  f('eWater', 'water', 'farm', 'neutral'),
  f('eFeed', 'feed', 'farm', 'neutral'),
  f('eGenetics', 'genetics', 'farm', 'neutral'),
  f('eEnergy', 'energy', 'farm', 'neutral'),
  f('eServices', 'services', 'farm', 'neutral'),
  f('eMilk', 'farm', 'milk', 'desired'),
  f('eBeef', 'farm', 'beef', 'desired'),
  f('eManure', 'farm', 'manure', 'undesired'),
  f('eMethane', 'farm', 'methane', 'undesired'),
  f('eRunoff', 'farm', 'runoff', 'undesired'),
  f('eUnknown', 'farm', 'unknown', 'unknown'),

  // Inside: every boundary flow lands on a part
  f('iWater', 'farm', 'herd', 'neutral', { viaFrom: 'eWater', inner: true }),
  f('iFeed', 'farm', 'feeding', 'neutral', { viaFrom: 'eFeed', inner: true }),
  f('iGenetics', 'farm', 'youngstock', 'neutral', { viaFrom: 'eGenetics', inner: true }),
  f('iEnergy', 'farm', 'milking', 'neutral', { viaFrom: 'eEnergy', inner: true }),
  f('iServices', 'farm', 'herd', 'neutral', { viaFrom: 'eServices', inner: true, toSide: 'bottom' }),
  f('iFeeding', 'feeding', 'herd', 'neutral', { inner: true }),
  f('iYoung', 'youngstock', 'herd', 'neutral', { inner: true }),
  f('iHerdMilk', 'herd', 'milking', 'desired', { inner: true }),
  f('iMilk', 'milking', 'farm', 'desired', { viaTo: 'eMilk', inner: true }),
  f('iBeef', 'herd', 'farm', 'desired', { viaTo: 'eBeef', inner: true }),
  f('iHerdManure', 'herd', 'storage', 'neutral', { inner: true }),
  f('iManure', 'storage', 'farm', 'undesired', { viaTo: 'eManure', inner: true }),
  f('iMethaneHerd', 'herd', 'farm', 'undesired', { viaTo: 'eMethane', inner: true }),
  f('iMethaneStore', 'storage', 'farm', 'undesired', { viaTo: 'eMethane', inner: true }),
  f('iToFields', 'storage', 'fields', 'neutral', { inner: true, fromSide: 'bottom', toSide: 'right' }),
  f('iGrass', 'fields', 'feeding', 'desired', { inner: true, fromSide: 'left', toSide: 'bottom' }),
  f('iRunoff', 'fields', 'farm', 'undesired', { viaTo: 'eRunoff', inner: true }),

  // Manure branch
  { id: 'bManure', from: 'manure', to: 'pManure', kind: 'becomes', valence: 'undesired' },
  { id: 'sDigester', from: 'pManure', to: 'digester', kind: 'solves', valence: 'undesired' },
  { id: 'sSpread', from: 'pManure', to: 'spread', kind: 'solves', valence: 'undesired' },
  f('oBiogas', 'digester', 'biogas', 'desired'),
  f('oDigestate', 'digester', 'digestate', 'desired'),
  f('oLeaks', 'digester', 'leaks', 'undesired'),
  f('iCapital', 'capital', 'digester', 'neutral', { toSide: 'top' }),
  { id: 'bPays', from: 'capital', to: 'pPays', kind: 'becomes', valence: 'undesired', toSide: 'bottom' },
  { id: 'sSubsidy', from: 'pPays', to: 'subsidy', kind: 'solves', valence: 'undesired' },
  f('oPaysOff', 'subsidy', 'paysOff', 'desired'),
  f('oPolicy', 'subsidy', 'policy', 'undesired'),
  f('oSubUnknown', 'subsidy', 'subUnknown', 'unknown'),
  f('oDUnknown', 'digester', 'dUnknown', 'unknown'),
  f('oSoil', 'spread', 'soil', 'desired'),
  f('oNitrate', 'spread', 'nitrate', 'undesired'),
  f('oAmmonia', 'spread', 'ammonia', 'undesired'),
  f('oSUnknown', 'spread', 'sUnknown', 'unknown'),

  // Methane cap branch
  { id: 'pressCap', from: 'cap', to: 'pCap', kind: 'pressure', fromSide: 'bottom', toSide: 'top' },
  { id: 'bMethane', from: 'methane', to: 'pCap', kind: 'becomes', valence: 'undesired' },
  { id: 'sAdditive', from: 'pCap', to: 'additive', kind: 'solves', valence: 'undesired' },
  { id: 'sFewer', from: 'pCap', to: 'fewer', kind: 'solves', valence: 'undesired' },
  f('oLess', 'additive', 'lessCH4', 'desired'),
  f('oCost', 'additive', 'costL', 'undesired'),
  f('oAUnknown', 'additive', 'aUnknown', 'unknown'),
  f('oLessB', 'fewer', 'lessCH4b', 'desired'),
  f('oIncome', 'fewer', 'income', 'undesired'),
  f('oLeakage', 'fewer', 'leakage', 'undesired'),
  f('oFUnknown', 'fewer', 'fUnknown', 'unknown'),

  // Water beds
  { id: 'propBeds', from: 'services', to: 'beds', kind: 'proposes', toSide: 'top' },
  { id: 'sBeds', from: 'pLame', to: 'beds', kind: 'solves', valence: 'undesired' },
  f('oRested', 'beds', 'rested', 'desired'),
  f('oMastitis', 'beds', 'mastitis', 'undesired'),
  f('oBUnknown', 'beds', 'bUnknown', 'unknown'),
  { id: 'bMastitis', from: 'mastitis', to: 'pMastitis', kind: 'becomes', valence: 'undesired' },
  { id: 'sCut', from: 'pMastitis', to: 'cutOpen', kind: 'solves', valence: 'undesired' },
  f('oLosses', 'cutOpen', 'losses', 'undesired'),
  f('oLesson', 'cutOpen', 'lesson', 'desired'),
  f('oCUnknown', 'cutOpen', 'cUnknown', 'unknown'),

  // Fog
  { id: 'q1', from: 'unknown', to: 'h1', kind: 'speculates' },
  { id: 'q2', from: 'unknown', to: 'h2', kind: 'speculates' },
  { id: 'q3', from: 'unknown', to: 'h3', kind: 'speculates' },
]

export const EDGE_BY_ID: Record<string, EdgeDef> = Object.fromEntries(EDGES.map((e) => [e.id, e]))

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

/** Residue left behind by a solution: undesired outputs (diffuse ones weigh more) and fog. */
export function residueOf(solutionId: string, visible: Record<string, unknown>): { kind: 'undesired' | 'diffuse' | 'unknown' }[] {
  return EDGES.filter((e) => e.from === solutionId && e.kind === 'flow' && visible[e.to])
    .map((e) => NODES[e.to])
    .filter((n) => n.valence === 'undesired' || n.valence === 'unknown')
    .map((n) => ({ kind: n.valence === 'unknown' ? 'unknown' : n.diffuse ? 'diffuse' : 'undesired' }))
}

// ---------------------------------------------------------------- compose

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

export function lineage(id: string): string[] {
  const chain: string[] = []
  let cur: string | undefined = id
  while (cur && !chain.includes(cur)) {
    chain.push(cur)
    cur = NODES[cur]?.parent
  }
  return chain
}

export function compose(s: SceneState): Composition {
  const out: Composition = { nodes: {}, edges: {} }

  const put = (id: string, x: number, y: number, extra: Partial<NodeTarget> = {}) => {
    const { w, h } = sizeOf(NODES[id])
    out.nodes[id] = { x, y, w, h, o: 1, s: 1, f: 0, g: 0, d: 0, r: 0, delay: 0, ...extra }
  }
  const column = (ids: string[], x: number, cy: number, gap: number, extra: (i: number) => Partial<NodeTarget>) =>
    ids.forEach((id, i) => put(id, x, cy + (i - (ids.length - 1) / 2) * gap, extra(i)))

  // The farm and its boundary
  put('farm', 0, 0, { f: s.zoom === 'farm' ? 1 : 0 })
  column(['energy', 'genetics', 'water', 'feed', 'services'], -420, 0, 50, (i) => ({ delay: 120 + i * 60, from: 'farm' }))
  column(['milk', 'beef', 'manure', 'methane', 'runoff', 'unknown'], 420, 0, 50, (i) => ({ delay: 120 + i * 60, from: 'farm' }))

  // Inside
  if (s.zoom === 'farm') {
    const inner: [string, number, number][] = [
      ['youngstock', -82, -36],
      ['feeding', -82, 28],
      ['herd', -8, -4],
      ['milking', 80, -62],
      ['storage', 78, 34],
      ['fields', -4, 60],
    ]
    inner.forEach(([id, x, y], i) => put(id, x, y, { delay: 320 + i * 70, from: 'farm', s: 1 }))
  }

  // Manure becomes a problem and grows solutions
  if (s.manure) {
    put('pManure', 690, -230, { delay: 0, from: 'manure' })
    const chosen = s.manureChoice
    const alt = chosen === 'digester' ? 'spread' : 'digester'
    put(chosen, 930, -230, { delay: 260, from: 'pManure' })
    put(alt, 930, -95, { delay: 380, from: 'pManure', g: 1, s: 0.86 })
    const outs = chosen === 'digester' ? ['biogas', 'digestate', 'leaks', 'dUnknown'] : ['soil', 'nitrate', 'ammonia', 'sUnknown']
    column(outs, 1080, -230, 42, (i) => ({ delay: 520 + i * 70, from: chosen }))
    if (chosen === 'digester') {
      put('capital', 800, -330, { delay: 420, from: 'digester' })
      // Whether it pays is the balance across the digester's boundary; when it doesn't, that's a problem.
      if (s.pays) {
        put('pPays', 930, -440, { delay: 0, from: 'capital' })
        put('subsidy', 1170, -440, { delay: 300, from: 'pPays' })
        column(['paysOff', 'policy', 'subUnknown'], 1320, -440, 42, (i) => ({ delay: 520 + i * 70, from: 'subsidy' }))
      }
    }
  }

  // Water beds: proposed, revealed, reversed
  if (s.beds > 0) {
    put('pLame', -710, 300, { delay: 0, from: 'farm' })
    put('beds', -470, 300, { delay: 260, from: 'pLame', r: s.beds === 3 ? 1 : 0 })
    const outs = s.beds === 1 ? ['rested', 'bUnknown'] : ['rested', 'mastitis', 'bUnknown']
    // Once reversed, what the beds produced stops flowing; only the lesson of the infections remains.
    column(outs, -320, 300, 42, (i) => ({
      delay: outs[i] === 'mastitis' ? 700 : 520 + i * 70,
      from: outs[i] === 'mastitis' ? 'bUnknown' : 'beds',
      d: s.beds === 3 && outs[i] !== 'mastitis' ? 0.7 : 0,
    }))
    if (s.beds === 3) {
      put('pMastitis', -60, 300, { delay: 0, from: 'mastitis' })
      put('cutOpen', 180, 300, { delay: 300, from: 'pMastitis' })
      column(['losses', 'lesson', 'cUnknown'], 330, 300, 42, (i) => ({ delay: 520 + i * 70, from: 'cutOpen' }))
    }
  }

  // A rule makes methane a problem
  if (s.cap) {
    put('cap', 690, 100, { delay: 0 })
    put('pCap', 690, 178, { delay: 280, from: 'methane' })
    const chosen = s.capChoice
    const alt = chosen === 'additive' ? 'fewer' : 'additive'
    put(chosen, 930, 178, { delay: 520, from: 'pCap' })
    put(alt, 930, 300, { delay: 640, from: 'pCap', g: 1, s: 0.86 })
    const outs = chosen === 'additive' ? ['lessCH4', 'costL', 'aUnknown'] : ['lessCH4b', 'income', 'leakage', 'fUnknown']
    column(outs, 1080, 178, 38, (i) => ({ delay: 760 + i * 70, from: chosen }))
  }

  // The fog: guesses, not facts
  if (s.fog) {
    ;['h1', 'h2', 'h3'].forEach((id, i) =>
      put(id, 720, 400 + i * 74, { delay: 200 + i * 160, from: 'unknown', g: s.promoted.includes(id) ? 0 : 1 }),
    )
  }

  // Edges: visible when both ends are
  for (const e of EDGES) {
    const a = out.nodes[e.from]
    const b = out.nodes[e.to]
    if (!a || !b) continue
    if (e.inner && s.zoom !== 'farm') continue
    out.edges[e.id] = {
      o: 1,
      p: 1,
      // A reversed solution stops being fed by its problem, and stops producing.
      g: e.kind === 'solves' || e.kind === 'speculates' ? Math.max(b.g, b.r) : 0,
      d: Math.max(a.r, b.r) > 0 && e.to !== 'mastitis' ? 0.6 : 0,
      delay: Math.max(a.delay, b.delay) + (e.inner ? 120 : 60),
    }
  }

  // Hover lifts, focus dims everything off the purpose path
  if (s.hover && out.nodes[s.hover] && NODES[s.hover].kind !== 'system') out.nodes[s.hover].s *= 1.045
  if (s.focus) {
    const path = new Set(lineage(s.focus))
    for (const [id, t] of Object.entries(out.nodes)) if (!path.has(id)) t.d = 1
    for (const e of EDGES) {
      const t = out.edges[e.id]
      if (!t) continue
      if (!(path.has(e.from) && path.has(e.to))) t.d = 1
    }
  }

  return out
}
