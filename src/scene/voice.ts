// The narrator's voice: pre-spoken clips for narration lines (see scripts/voice.mjs).
// Lines without a clip stay silent, and the tour falls back to reading time.

import { ref } from 'vue'

interface Clip {
  file: string
  /** ms */
  duration: number
}

// ?voice=name plays a trial voice from public/voice-name (see scripts/voice.mjs).
const TRIAL = new URLSearchParams(location.search).get('voice')
const BASE = `${import.meta.env.BASE_URL}${TRIAL ? `voice-${TRIAL}` : 'voice'}/`
let clips: Record<string, Clip> = {}
let current: HTMLAudioElement | null = null
// Recording a video (?render): the clips are mixed in afterwards, so the page stays quiet.
const RENDER = new URLSearchParams(location.search).has('render')

const stored = (() => {
  try {
    return localStorage.getItem('systemview.sound')
  } catch {
    return null
  }
})()

/** Whether clips play out loud. Timing follows the clips either way. */
export const sound = ref(stored !== 'off')

export function setSound(on: boolean) {
  sound.value = on
  if (!on) stop()
  try {
    localStorage.setItem('systemview.sound', on ? 'on' : 'off')
  } catch {
    /* private window: just don't remember */
  }
}

export const ready: Promise<void> = fetch(`${BASE}manifest.json`)
  .then((r) => (r.ok ? r.json() : { lines: {} }))
  .then((m) => void (clips = m.lines ?? {}))
  .catch(() => {})

/** How long the line takes to speak, in ms, if it has a clip. */
export const duration = (text: string) => clips[text]?.duration

export function play(text: string) {
  stop()
  const clip = clips[text]
  if (!clip || !sound.value || RENDER) return
  current = new Audio(BASE + clip.file)
  // Autoplay can be refused; the tour keeps its pace regardless.
  current.play().catch(() => {})
}

export function stop() {
  current?.pause()
  current = null
}
