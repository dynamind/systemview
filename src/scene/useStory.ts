// The conversational shell every world shares: the narration line, the echo of
// what was asked, the narrated tour, and the purpose path. What a world says
// and does comes from its script.

import { computed, ref } from 'vue'
import type { Scene } from './useScene'
import * as voice from './voice'
import { domain, lineage, NODES } from './world'

export interface Line {
  key: number
  text: string
  voice: 'system' | 'user'
}

export function useStory(scene: Scene) {
  const { state } = scene
  const line = ref<Line>({ key: 0, text: '', voice: 'system' })
  const echo = ref<Line | null>(null)
  const touring = ref(false)
  let tourToken = 0

  const say = (text: string, spoken = true) => {
    line.value = { key: line.value.key + 1, text, voice: 'system' }
    if (spoken) voice.play(text)
    else voice.stop()
  }

  function settle(view: string[] | 'all', pad?: number, max?: number) {
    scene.sync()
    scene.frame(view, pad, max)
  }

  const script = domain.script({ scene, state, say, settle })
  const { actions } = script

  function click(id: string) {
    stopTour()
    script.click(id)
  }

  function ask(raw: string) {
    stopTour()
    const text = raw.toLowerCase().trim()
    if (!text) return
    echo.value = { key: line.value.key + 1, text: raw.trim(), voice: 'user' }
    script.ask(text)
  }

  const suggestions = computed(() => script.suggestions().map((s) => ({ label: s.label, run: () => (stopTour(), s.run()) })))

  // ------------------------------------------------------------ narrated tour

  const pause = (ms: number, token: number) => new Promise<boolean>((r) => setTimeout(() => r(token === tourToken), ms))
  // A spoken line holds for its own length plus a breath; an unspoken one for its reading time.
  const holdTime = () => {
    const spoken = voice.duration(line.value.text)
    return spoken ? spoken + 900 : 1600 + line.value.text.split(/\s+/).length * 245
  }

  async function tour() {
    if (touring.value) return stopTour()
    const token = ++tourToken
    touring.value = true
    await voice.ready
    Object.assign(state, domain.initialState())
    for (const step of script.tour) {
      if (token !== tourToken) return
      step()
      if (!(await pause(holdTime(), token))) return
    }
    touring.value = false
  }

  function stopTour() {
    if (!touring.value) return
    tourToken++
    touring.value = false
    voice.stop()
  }

  // Empty canvas: inside the system it's the way back out; elsewhere it just lets go of the focus.
  function background() {
    stopTour()
    if (state.zoom === 'inside') actions.overview()
    else actions.clearFocus()
  }

  // Silent: it greets on page load, before anyone asked for sound.
  function intro() {
    say(script.intro, false)
  }

  const purposePath = computed(() => {
    if (!state.focus) return []
    return lineage(state.focus).map((id) => ({ id, label: NODES[id].label, relation: NODES[id].relation, kind: NODES[id].kind }))
  })

  return { line, echo, ask, click, background, suggestions, tour, touring, stopTour, intro, actions, purposePath }
}

export type Story = ReturnType<typeof useStory>
