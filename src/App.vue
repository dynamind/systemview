<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Narration from './components/Narration.vue'
import SystemCanvas from './components/SystemCanvas.vue'
import { SAFE, SAFE_BOTTOM_NARRATING, useScene } from './scene/useScene'
import { useStory } from './scene/useStory'
import { setSound, sound } from './scene/voice'
import { domain, WORLD_LINKS } from './scene/world'

const scene = useScene()
const story = useStory(scene)
const draft = ref('')

// ?render: a clean frame for recording the narrated tour (see scripts/render.mjs).
const render = new URLSearchParams(location.search).has('render')
const narrating = computed(() => render || story.touring.value)
watch(narrating, (on) => scene.setBottomInset(on ? SAFE_BOTTOM_NARRATING : SAFE.bottom), { immediate: true })
if (render) Object.assign(window, { systemview: { tour: story.tour, touring: () => story.touring.value, line: () => story.line.value } })

// Flattened so every chip, relation and goal animates as its own item.
const purposeItems = computed(() => {
  const items: { key: string; type: 'node' | 'rel' | 'goal'; text: string; id: string; kind?: string }[] = []
  const path = story.purposePath.value
  for (const c of path) {
    items.push({ key: c.id, type: 'node', text: c.label, id: c.id, kind: c.kind })
    if (c.relation) items.push({ key: c.id + '-rel', type: 'rel', text: c.relation, id: c.id })
  }
  if (path.at(-1)?.id === domain.system) items.push({ key: 'goal', type: 'goal', text: domain.goal, id: domain.system })
  return items
})
const input = ref<HTMLInputElement>()

function submit() {
  story.ask(draft.value)
  draft.value = ''
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    story.stopTour()
    if (scene.state.focus) scene.state.focus = null
    else story.actions.overview()
  } else if (ev.key === '/' && document.activeElement !== input.value) {
    ev.preventDefault()
    input.value?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (!render) setTimeout(story.intro, 500)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <SystemCanvas :scene="scene" @select="story.click" @background="story.background" />

  <header class="top" :class="{ render }">
    <div class="mark">
      <span class="glyph" aria-hidden="true">◫</span>
      SystemView
      <span class="crumb">/</span>
      <nav class="worlds" aria-label="Worlds">
        <a v-for="w in WORLD_LINKS" :key="w.id" :href="w.href" :class="{ active: w.id === domain.id }">{{ w.title }}</a>
      </nav>
      <Transition name="fade">
        <span v-if="scene.state.zoom === 'inside'" class="crumb">/ inside</span>
      </Transition>
    </div>
    <div class="controls">
      <button class="quiet" @click="story.actions.overview()">Overview</button>
      <button class="quiet" :class="{ active: story.touring.value }" @click="story.tour()">
        {{ story.touring.value ? 'Stop narration' : 'Narrate ▸' }}
      </button>
      <button class="quiet" :aria-pressed="sound" @click="setSound(!sound)">{{ sound ? 'Sound on' : 'Sound off' }}</button>
    </div>
  </header>

  <TransitionGroup tag="nav" name="chip" class="purpose" aria-label="Purpose path">
    <template v-for="(c, i) in purposeItems" :key="c.key">
      <button v-if="c.type === 'node'" class="pchip" :class="c.kind" :style="{ transitionDelay: `${i * 45}ms` }" @click="story.click(c.id)">
        {{ c.text }}
      </button>
      <span v-else :class="c.type" :style="{ transitionDelay: `${i * 45}ms` }">{{ c.text }}</span>
    </template>
  </TransitionGroup>

  <div class="scrim" :class="{ narrating }" aria-hidden="true" />
  <footer class="dock" :class="{ narrating }">
    <Narration :line="story.line.value" :echo="story.echo.value" />
    <div class="interact" :inert="narrating">
      <div class="inner">
        <form class="prompt" @submit.prevent="submit">
          <input ref="input" v-model="draft" placeholder="Ask about the system, or describe a change…" spellcheck="false" />
          <span class="tag">scripted</span>
        </form>
        <TransitionGroup tag="div" name="chip" class="suggestions">
          <button v-for="s in story.suggestions.value" :key="s.label" class="schip" @click="s.run">{{ s.label }}</button>
        </TransitionGroup>
      </div>
    </div>
  </footer>

  <aside class="legend" aria-label="Legend">
    <span><i class="d desired" />wanted</span>
    <span><i class="d undesired" />unwanted</span>
    <span><i class="d unknown" />unknown</span>
    <span><i class="d neutral" />resource</span>
    <span><i class="d rule" />rule</span>
  </aside>
</template>

<style scoped>
.top {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(var(--paper) 40%, color-mix(in srgb, var(--paper) 0%, transparent));
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  pointer-events: none;
}
.top > * {
  pointer-events: auto;
}
.top.render .controls {
  display: none;
}
.mark {
  font: 600 13px/1 var(--sans);
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
}
.glyph {
  font-size: 15px;
  opacity: 0.8;
}
.crumb {
  font-weight: 400;
  color: var(--muted);
}
.worlds {
  display: flex;
  gap: 2px;
}
.worlds a {
  font-weight: 400;
  color: var(--muted);
  text-decoration: none;
  padding: 4px 6px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
}
.worlds a:hover {
  color: var(--ink);
  background: var(--paper-hover);
}
.worlds a.active {
  color: var(--ink);
  font-weight: 600;
}
.controls {
  display: flex;
  gap: 4px;
}
.quiet {
  font: 500 12.5px/1 var(--sans);
  color: var(--muted);
  background: none;
  border: 0;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}
.quiet:hover,
.quiet.active {
  color: var(--ink);
  background: var(--paper-hover);
}

.purpose {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100vw - 48px);
}
.pchip {
  font: 500 12px/1 var(--sans);
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--hair-strong);
  border-radius: 999px;
  padding: 6px 11px;
  cursor: pointer;
}
.pchip.problem {
  border-color: var(--undesired);
  color: var(--undesired);
}
.pchip.rule,
.pchip.context {
  border-color: var(--rule);
  color: var(--rule);
}
.rel {
  font: italic 13px/1 var(--serif);
  color: var(--muted);
}
.goal {
  font: italic 14px/1 var(--serif);
  color: var(--ink);
}

.scrim {
  /* Keeps the narration legible over whatever the canvas has under it. */
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 300px;
  pointer-events: none;
  transition: height 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--paper) 0%, transparent),
    color-mix(in srgb, var(--paper) 88%, transparent) 38%,
    var(--paper) 70%
  );
}
.scrim.narrating {
  height: 190px;
}
.dock {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: min(680px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* While narrating, the prompt and suggestions fold away and the narration settles to the bottom. */
.interact {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition: grid-template-rows 0.6s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.3s ease 0.1s;
}
.interact > .inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Room for the prompt's shadow inside the clipping box. */
  padding: 0 0 6px;
  margin: 0 0 -6px;
}
.dock.narrating .interact {
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.6s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.2s ease;
}
.prompt {
  position: relative;
}
.prompt input {
  width: 100%;
  box-sizing: border-box;
  font: 400 15px/1 var(--sans);
  color: var(--ink);
  background: var(--paper-raised);
  border: 1px solid var(--hair-strong);
  border-radius: 14px;
  padding: 15px 90px 15px 18px;
  outline: none;
  box-shadow: var(--shadow);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.prompt input:focus {
  border-color: var(--ink);
}
.prompt input::placeholder {
  color: var(--muted);
}
.tag {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font: 500 9.5px/1 var(--sans);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  opacity: 0.7;
}
.suggestions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 30px;
}
.schip {
  font: 450 12.5px/1 var(--sans);
  color: var(--ink);
  background: none;
  border: 1px solid var(--hair-strong);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.schip:hover {
  background: var(--paper-hover);
  border-color: var(--ink);
}

.legend {
  position: fixed;
  left: 24px;
  bottom: 28px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font: 500 10px/1 var(--sans);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.legend span {
  display: flex;
  align-items: center;
  gap: 8px;
}
.d {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.d.desired { background: var(--desired); }
.d.undesired { background: var(--undesired); }
.d.unknown { border: 1px dashed var(--unknown); width: 5px; height: 5px; }
.d.neutral { background: var(--neutral); }
.d.rule { background: var(--rule); border-radius: 1px; }

@media (max-width: 900px) {
  .legend { display: none; }
}

.chip-enter-active {
  transition: opacity 0.45s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.chip-leave-active {
  transition: opacity 0.15s ease;
  transition-delay: 0s !important;
  position: absolute;
}
.chip-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.chip-leave-to {
  opacity: 0;
}
.chip-move {
  transition: transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
