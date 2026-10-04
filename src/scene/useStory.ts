// The conversational layer. Scripted for now: intents are matched by keyword,
// but every response goes through the same actions a real model would call.

import { computed, ref } from 'vue'
import type { Scene } from './useScene'
import { lineage, NODES } from './world'

export interface Line {
  key: number
  text: string
  voice: 'system' | 'user'
}

const BRANCH_OUTPUTS = {
  digester: ['capital', 'biogas', 'digestate', 'leaks', 'dUnknown'],
  spread: ['soil', 'nitrate', 'ammonia', 'sUnknown'],
  additive: ['lessCH4', 'costL', 'aUnknown'],
  fewer: ['lessCH4b', 'income', 'leakage', 'fUnknown'],
}

const BEDS_VIEW = {
  1: ['services', 'pLame', 'beds', 'rested', 'bUnknown'],
  2: ['pLame', 'beds', 'rested', 'mastitis', 'bUnknown'],
  3: ['pLame', 'beds', 'rested', 'mastitis', 'bUnknown', 'pMastitis', 'cutOpen', 'losses', 'lesson', 'cUnknown'],
}

export function useStory(scene: Scene) {
  const { state } = scene
  const line = ref<Line>({ key: 0, text: '', voice: 'system' })
  const echo = ref<Line | null>(null)
  const touring = ref(false)
  let lastBranch: 'manure' | 'cap' | 'beds' = 'manure'
  let tourToken = 0

  const say = (text: string) => (line.value = { key: line.value.key + 1, text, voice: 'system' })

  function settle(view: string[] | 'all', pad?: number, max?: number) {
    scene.sync()
    scene.frame(view, pad, max)
  }

  // ------------------------------------------------------------ actions

  const actions = {
    overview() {
      state.zoom = 'root'
      state.focus = null
      settle('all', 40)
      say('The whole machine, as far as we’ve drawn it. Every box here exists because of something to its left.')
    },

    open() {
      state.focus = null
      state.zoom = 'farm'
      settle(['farm'], 6, 9)
      say(
        'Inside, the box is just more boxes. Every flow that crossed the boundary still lands somewhere; nothing appears or vanishes at the edge. And look at the loop: manure feeds the fields, the fields feed the herd. Inside the boundary it’s a resource. At the gate it’s a problem.',
      )
    },

    manure() {
      lastBranch = 'manure'
      state.zoom = 'root'
      state.focus = null
      const first = !state.manure
      state.manure = true
      settle(['manure', 'pManure', 'digester', 'spread', ...BRANCH_OUTPUTS[state.manureChoice]])
      say(
        first
          ? 'Name an undesirable and it becomes a problem. A problem invites solutions, and each one is a new box with outputs of its own. The digester transforms manure into energy, and it runs on capital. What it leaves behind: leaks, and a question mark.'
          : 'The manure branch. Two answers to one problem, each leaving different things behind.',
      )
    },

    swapManure() {
      lastBranch = 'manure'
      state.manure = true
      state.focus = null
      state.manureChoice = state.manureChoice === 'digester' ? 'spread' : 'digester'
      settle(['manure', 'pManure', 'digester', 'spread', ...BRANCH_OUTPUTS[state.manureChoice]])
      say(
        state.manureChoice === 'spread'
          ? 'Spreading on land is cheaper. But look at what it leaves: nitrate seeps into groundwater, ammonia drifts off. Both are diffuse. It doesn’t solve the problem so much as move it past the boundary.'
          : 'Back to the digester. Neither option is clean. The question isn’t which one has no residue, but which residue you can live with, or solve next.',
      )
    },

    pays() {
      lastBranch = 'manure'
      state.zoom = 'root'
      state.focus = null
      state.manure = true
      state.manureChoice = 'digester'
      const first = !state.pays
      state.pays = true
      settle(['pManure', 'digester', 'capital', 'pPays', 'subsidy', 'paysOff', 'policy', 'subUnknown', 'leaks'])
      say(
        first
          ? 'Capital goes into the digester, to build it and to keep it tight. Whether it pays is the balance across its boundary: gas revenue out, capital in. When the balance tips, the input becomes a problem. The state can answer it with a subsidy, a rule designed as a solution: the mirror image of the cap.'
          : 'The digester’s balance. Capital in, gas out, and a subsidy holding up one side of the scale.',
      )
    },

    beds() {
      lastBranch = 'beds'
      state.zoom = 'root'
      state.focus = null
      const replay = state.beds === 3
      if (state.beds < 3) state.beds = (state.beds + 1) as 1 | 2 | 3
      settle(BEDS_VIEW[state.beds as 1 | 2 | 3])
      say(
        replay
          ? 'The water beds: a solution that turned out to be an experiment. It failed, and the farm still came out knowing more than it did.'
          : state.beds === 1
            ? 'The vet had an answer for lame cows: heated water beds. Soft, warm, a clear purpose. But every solution is a hypothesis, and this one comes with an output nobody can name yet.'
            : state.beds === 2
              ? 'Then the fog condensed. Warm and wet is exactly where bacteria thrive: udder infections. The question mark gave up one secret, and kept the rest.'
              : 'The infections became a problem, and the cheapest solution was to undo the first one. The farmer cut the beds open and took the loss. Lame cows are back on the table, but the farm now knows something it didn’t.',
      )
    },

    fog() {
      state.zoom = 'root'
      state.focus = null
      state.fog = true
      settle(['unknown', 'h1', 'h2', 'h3'], 30)
      say(
        'Every box has an output nobody can name at design time. These are guesses, not facts, each matched to a pattern that has caught systems out before. Click one to make it a known undesirable.',
      )
    },

    promote(id: string) {
      state.focus = null
      if (state.promoted.includes(id)) {
        state.promoted = state.promoted.filter((p) => p !== id)
        say('Back to a guess. Unconfirmed, but not forgotten.')
        return
      }
      state.promoted = [...state.promoted, id]
      say(
        `“${NODES[id].label}” is now a known undesirable, ready to become a problem of its own. The question mark stays, though. The fog shrinks; it never closes.`,
      )
    },

    methane() {
      if (state.cap) return actions.cap()
      state.focus = 'methane'
      settle(['farm', 'methane'], 40)
      say(
        'Methane leaves the farm unpriced. Nothing inside this boundary makes it the farm’s problem. Something outside would have to: a rule, a price, a norm.',
      )
    },

    cap() {
      lastBranch = 'cap'
      state.zoom = 'root'
      state.focus = null
      const first = !state.cap
      state.cap = true
      settle(['methane', 'cap', 'pCap', 'additive', 'fewer', ...BRANCH_OUTPUTS[state.capChoice]])
      say(
        first
          ? 'A rule arrives. It’s someone else’s solution, the state’s answer to warming, and here it lands as a problem, on purpose. A feed additive cuts methane at the source. It costs money per litre, and what it does long-term is still a question mark.'
          : 'The methane cap, and what it set in motion.',
      )
    },

    swapCap() {
      lastBranch = 'cap'
      state.cap = true
      state.focus = null
      state.capChoice = state.capChoice === 'additive' ? 'fewer' : 'additive'
      settle(['methane', 'cap', 'pCap', 'additive', 'fewer', ...BRANCH_OUTPUTS[state.capChoice]])
      say(
        state.capChoice === 'fewer'
          ? 'Fewer cows meets the cap on paper. But the milk still gets drunk, so production moves abroad, and the methane goes with it. That’s leakage: the problem didn’t go away, it left the boundary. Draw the boundary wider and this solution could be worse than the problem.'
          : 'The additive again. It keeps the problem here, where it can at least be seen and measured.',
      )
    },

    runoff() {
      state.focus = 'runoff'
      say(
        'Runoff is diffuse. It leaves through every field at once, a little at a time. Diffuse outputs are the hardest to solve, and the easiest to leave off the map.',
      )
    },

    why(id: string) {
      const n = NODES[id]
      if (!n) return
      // Asking why an alternative exists brings it forward.
      if (id === 'digester' || id === 'spread') state.manureChoice = id
      if (id === 'additive' || id === 'fewer') state.capChoice = id
      state.focus = id
      const chain = lineage(id).filter((c) => scene.composition().nodes[c])
      if (n.kind !== 'part' && state.zoom === 'farm') state.zoom = 'root'
      if (n.kind === 'part') settle(['farm'], 6, 9)
      else settle(chain.length > 1 ? chain : [id], 40)
      const parent = n.parent ? NODES[n.parent] : undefined
      say(n.why ?? (parent ? `${n.label}: ${n.relation} ${parent.label.toLowerCase()}.` : n.label))
    },

    clearFocus() {
      if (!state.focus) return
      state.focus = null
    },
  }

  function click(id: string) {
    stopTour()
    const n = NODES[id]
    switch (id) {
      case 'farm':
        return state.zoom === 'root' ? actions.open() : actions.clearFocus()
      case 'manure':
      case 'pManure':
        return state.manure && state.focus !== id ? actions.why(id) : actions.manure()
      case 'methane':
        return actions.methane()
      case 'unknown':
        return actions.fog()
      case 'runoff':
        return actions.runoff()
      case 'cap':
        return actions.why('cap')
      case 'capital':
        return state.pays ? actions.why('capital') : actions.pays()
      case 'bUnknown':
        if (state.beds === 1) return actions.beds()
        break
      case 'mastitis':
        if (state.beds === 2) return actions.beds()
        break
    }
    if (n.kind === 'hypothesis') return actions.promote(id)
    if (n.kind === 'solution') {
      const chosen = id === state.manureChoice || id === state.capChoice
      if (!chosen) return id === 'digester' || id === 'spread' ? actions.swapManure() : actions.swapCap()
    }
    actions.why(id)
  }

  // ------------------------------------------------------------ language

  function findMentioned(text: string): string | undefined {
    const visible = Object.keys(scene.composition().nodes)
    return visible
      .filter((id) => NODES[id].label.length > 1 && text.includes(NODES[id].label.toLowerCase()))
      .sort((a, b) => NODES[b].label.length - NODES[a].label.length)[0]
  }

  function ask(raw: string) {
    stopTour()
    const text = raw.toLowerCase().trim()
    if (!text) return
    echo.value = { key: line.value.key + 1, text: raw.trim(), voice: 'user' }
    const has = (re: RegExp) => re.test(text)

    if (has(/\bwhy\b|purpose|what does .* (solve|do)|exist|for\??$/)) {
      const id = findMentioned(text)
      return id ? actions.why(id) : say('Which part? Name it, or click it, and I’ll trace what it’s there for.')
    }
    if (has(/instead|alternative|swap|other option|compare|trade.?off|cheaper/)) return lastBranch === 'cap' ? actions.swapCap() : actions.swapManure()
    if (has(/inside|open|zoom in|how does|look in|parts/)) return actions.open()
    if (has(/back|zoom out|overview|whole|everything|reset|start/)) return actions.overview()
    if (has(/\bbeds?\b|water ?bed|\bvet\b|lame|udder|mastitis|infect|experiment|farmer|what happened/)) return actions.beds()
    if (has(/\bpay|profit|capital|money|subsid|revenue|afford|invest/)) return actions.pays()
    if (has(/cap|rule|regulat|law|constraint|limit|policy/)) return actions.cap()
    if (has(/manure|dung|slurry/)) return actions.manure()
    if (has(/unknown|fog|don.?t know|emerg|blind|surprise|side.?effect|\?/)) return actions.fog()
    if (has(/promote|confirm|it.?s real|known/)) {
      const next = ['h1', 'h2', 'h3'].find((h) => !state.promoted.includes(h))
      if (state.fog && next) return actions.promote(next)
      return actions.fog()
    }
    if (has(/methane|emission|climate/)) return actions.methane()
    if (has(/runoff|nitrogen|nitrate|water quality/)) return actions.runoff()
    const id = findMentioned(text)
    if (id) return actions.why(id)
    say('This prototype follows a scripted story, so I only understand a little. Try a suggestion below, or click anything on the canvas.')
  }

  const suggestions = computed(() => {
    const s: { label: string; run: () => void }[] = []
    const add = (label: string, run: () => void) => s.push({ label, run: () => (stopTour(), run()) })
    if (state.zoom === 'root') add('What’s inside?', actions.open)
    else add('Step back out', actions.overview)

    // First, the next step in whatever branch we're in.
    if (lastBranch === 'manure' && state.manure) {
      if (state.manureChoice === 'digester' && !state.pays) add('Does the digester pay?', actions.pays)
      else add(state.manureChoice === 'digester' ? 'Why not spread it on land?' : 'Compare with the digester', actions.swapManure)
    }
    if (lastBranch === 'cap' && state.cap) add(state.capChoice === 'additive' ? 'Why not keep fewer cows?' : 'Compare with the additive', actions.swapCap)
    if (lastBranch === 'beds' && state.beds > 0 && state.beds < 3)
      add(state.beds === 1 ? 'What happened next?' : 'What did the farmer do?', actions.beds)

    // Then branches not yet opened.
    if (!state.manure) add('What happens to the manure?', actions.manure)
    if (!state.cap) add('What if methane is capped?', actions.cap)
    if (!state.beds) add('What did the vet propose?', actions.beds)
    if (!state.fog) add('What don’t we know yet?', actions.fog)

    const chosen =
      lastBranch === 'cap' && state.cap ? state.capChoice : lastBranch === 'manure' && state.manure ? state.manureChoice : lastBranch === 'beds' && state.beds ? 'beds' : null
    if (chosen && state.focus !== chosen) add(`Why does “${NODES[chosen].label.toLowerCase()}” exist?`, () => actions.why(chosen))
    if (state.zoom === 'root' && (state.manure || state.cap || state.fog || state.beds)) add('Show the whole', actions.overview)
    return s.slice(0, 4)
  })

  // ------------------------------------------------------------ narrated tour

  const pause = (ms: number, token: number) =>
    new Promise<boolean>((r) => setTimeout(() => r(token === tourToken), ms))
  const readingTime = () => 1600 + line.value.text.split(/\s+/).length * 245

  async function tour() {
    if (touring.value) return stopTour()
    const token = ++tourToken
    touring.value = true
    Object.assign(state, { manure: false, cap: false, fog: false, promoted: [], manureChoice: 'digester', capChoice: 'additive', pays: false, beds: 0 })
    const steps: (() => void)[] = [
      () => {
        actions.overview()
        say('A dairy farm, as a black box. Things go in, things come out. Some are wanted, some aren’t, and one of them we can’t name yet.')
      },
      actions.open,
      actions.overview,
      actions.manure,
      actions.swapManure,
      actions.swapManure,
      actions.pays,
      actions.methane,
      actions.cap,
      actions.swapCap,
      actions.fog,
      () => actions.promote('h1'),
      actions.beds,
      actions.beds,
      actions.beds,
      () => actions.why('digester'),
      () => {
        actions.overview()
        say('Each part of this machine can answer one question: what are you here for? And each answer leaves something behind. That residue is the next problem.')
      },
    ]
    for (const step of steps) {
      if (token !== tourToken) return
      step()
      if (!(await pause(readingTime(), token))) return
    }
    touring.value = false
  }

  function stopTour() {
    tourToken++
    touring.value = false
  }

  function intro() {
    say('A dairy farm, as a black box. Things go in, things come out. Some are wanted, some aren’t, and one of them we can’t name yet.')
  }

  const purposePath = computed(() => {
    if (!state.focus) return []
    return lineage(state.focus).map((id) => ({ id, label: NODES[id].label, relation: NODES[id].relation, kind: NODES[id].kind }))
  })

  return { line, echo, ask, click, suggestions, tour, touring, stopTour, intro, actions, purposePath }
}

export type Story = ReturnType<typeof useStory>
