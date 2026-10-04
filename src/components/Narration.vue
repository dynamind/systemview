<script setup lang="ts">
import { computed } from 'vue'
import type { Line } from '../scene/useStory'

const props = defineProps<{ line: Line; echo: Line | null }>()
const words = computed(() => props.line.text.split(' '))
</script>

<template>
  <div class="narration" aria-live="polite">
    <Transition name="echo" mode="out-in">
      <p v-if="echo && echo.key === line.key" :key="'e' + echo.key" class="echo">{{ echo.text }}</p>
    </Transition>
    <Transition name="line" mode="out-in">
      <p :key="line.key" class="line">
        <span v-for="(w, i) in words" :key="i" class="word" :style="{ animationDelay: `${i * 26}ms` }">{{ w + '\u00a0' }}</span>
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.narration {
  min-height: 3.2em;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}
.echo {
  margin: 0;
  font: 500 12px/1.4 var(--sans);
  color: var(--muted);
  letter-spacing: 0.01em;
}
.echo::before {
  content: '→ ';
  opacity: 0.6;
}
.line {
  margin: 0;
  font: 400 19px/1.5 var(--serif);
  color: var(--ink);
  text-wrap: pretty;
}
.word {
  display: inline-block;
  opacity: 0;
  filter: blur(3px);
  transform: translateY(5px);
  animation: word-in 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}
@keyframes word-in {
  to {
    opacity: 1;
    filter: blur(0);
    transform: none;
  }
}
.line-leave-active,
.echo-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.line-leave-to,
.echo-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.echo-enter-active {
  transition: opacity 0.3s ease;
}
.echo-enter-from {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .word {
    animation: none;
    opacity: 1;
    filter: none;
    transform: none;
  }
}
</style>
