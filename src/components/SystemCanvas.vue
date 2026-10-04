<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { pathD, type Rect } from '../scene/geometry'
import type { Scene } from '../scene/useScene'
import FlowLayer from './FlowLayer.vue'
import { EDGES, FONT, NODES, residueOf, textWidth, type NodeDef } from '../scene/world'

const props = defineProps<{ scene: Scene }>()
const emit = defineEmits<{ select: [id: string]; background: [] }>()

const sc = props.scene

interface RNode extends Rect {
  id: string
  def: NodeDef
  o: number
  f: number
  g: number
  d: number
  r: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const frame = computed(() => {
  void sc.tick.value
  const nodes: RNode[] = []
  for (const [id, a] of sc.nodeAnims) {
    if (a.get('o') < 0.004) continue
    const r = sc.geometry.rects.get(id)!
    nodes.push({ id, def: NODES[id], ...r, o: a.get('o'), f: a.get('f'), g: a.get('g'), d: a.get('d'), r: a.get('r') })
  }

  const edges = []
  for (const e of EDGES) {
    const a = sc.edgeAnims.get(e.id)
    const c = sc.geometry.curves[e.id]
    if (!a || !c) continue
    const o = a.get('o')
    if (o < 0.004) continue
    const g = a.get('g')
    const p = Math.min(1, Math.max(0, a.get('p')))
    const drawn = e.kind === 'flow' || (e.kind === 'solves' && g < 0.5)
    edges.push({ id: e.id, def: e, d: pathD(c), p, g, drawn, op: o * (1 - 0.82 * a.get('d')) })
  }

  const systems = nodes.filter((n) => n.def.kind === 'system')
  const others = nodes.filter((n) => n.def.kind !== 'system')
  return { systems, others, edges }
})

// ------------------------------------------------------------ camera

// The camera never goes through Vue: the world transform and the hairline width
// (--px, one screen pixel in world units) are written straight to the DOM.
const svg = ref<SVGSVGElement>()
const world = ref<SVGGElement>()
let lastPx = 0
let off: (() => void) | undefined

function placeCamera() {
  const z = sc.zoom()
  const a = sc.screenArea()
  world.value?.setAttribute('transform', `translate(${a.cx} ${a.cy}) scale(${z}) translate(${-sc.camera.get('x')} ${-sc.camera.get('y')})`)
  const px = 1 / z
  if (Math.abs(px - lastPx) > lastPx * 0.004) {
    lastPx = px
    svg.value?.style.setProperty('--px', `${px}px`)
  }
}
onMounted(() => {
  placeCamera()
  off = sc.onFrame(placeCamera)
})
onBeforeUnmount(() => off?.())

const nodeOpacity = (n: RNode) => n.o * (1 - 0.8 * n.d) * (n.def.kind === 'solution' ? 1 - 0.5 * n.g : 1)

// ------------------------------------------------------------ input

const dragging = ref(false)
// The node a press started on: once the pointer is captured, pointerup targets the canvas itself.
let down: { x: number; y: number; moved: boolean; id: string | null } | null = null
// Fingers on the glass; two of them pinch.
const touches = new Map<number, { x: number; y: number }>()
let pinch: { d: number; x: number; y: number } | null = null

function twoFingers() {
  const [a, b] = [...touches.values()]
  return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function onPointerDown(ev: PointerEvent) {
  ;(ev.currentTarget as Element).setPointerCapture(ev.pointerId)
  if (ev.pointerType === 'touch') {
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (touches.size === 2) {
      // A pinch is never a click.
      pinch = twoFingers()
      down = null
      dragging.value = true
      return
    }
    if (touches.size > 2) return
  }
  down = { x: ev.clientX, y: ev.clientY, moved: false, id: (ev.target as Element).closest('[data-node]')?.getAttribute('data-node') ?? null }
}
function onPointerMove(ev: PointerEvent) {
  if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
  if (pinch) {
    if (touches.size < 2) return
    const now = twoFingers()
    sc.pan(now.x - pinch.x, now.y - pinch.y)
    if (pinch.d > 0 && now.d > 0) sc.wheel(now.x, now.y, -Math.log(now.d / pinch.d) / 0.0016)
    pinch = now
    return
  }
  if (!down) return
  const dx = ev.clientX - down.x
  const dy = ev.clientY - down.y
  if (!down.moved && Math.hypot(dx, dy) < 4) return
  down.moved = true
  dragging.value = true
  sc.pan(dx, dy)
  down.x = ev.clientX
  down.y = ev.clientY
}
function onPointerUp(ev: PointerEvent) {
  touches.delete(ev.pointerId)
  if (pinch) {
    // The pinch ends when the last finger lifts; a finger left behind doesn't start a pan.
    if (touches.size === 0) {
      pinch = null
      dragging.value = false
    }
    return
  }
  const press = down
  down = null
  dragging.value = false
  if (!press || press.moved || ev.type === 'pointercancel') return
  if (press.id) emit('select', press.id)
  else emit('background')
}
// Scroll pans, pinch (reported as ctrl+wheel) or ⌘/Ctrl+scroll zooms.
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? sc.viewport.h : 1
  const dx = ev.deltaX * unit
  const dy = ev.deltaY * unit
  if (ev.ctrlKey || ev.metaKey) sc.wheel(ev.clientX, ev.clientY, dy * (ev.ctrlKey && !ev.metaKey ? 6 : 1))
  else if (ev.shiftKey && !dx) sc.pan(-dy, 0)
  else sc.pan(-dx, -dy)
}

const hover = (id: string | null) => (sc.state.hover = id)

const strategyLabel: Record<string, string> = {
  eliminate: 'eliminate at source',
  transform: 'transform',
  contain: 'contain',
  shift: 'shift elsewhere',
  accept: 'accept',
  reverse: 'reverse',
}

function caption(n: RNode) {
  if (n.r > 0.5) return 'reversed'
  if (n.def.byRule) return 'rule · solution by design'
  const s = strategyLabel[n.def.strategy ?? '']
  return n.def.by ? `${s} · by ${n.def.by}` : s
}

// Inputs to the system just flow in; an input a solution needs raises a question of its own.
const clickable = (id: string) => NODES[id].kind !== 'source' || !!NODES[id].parent
</script>

<template>
  <FlowLayer :scene="scene" layer="back" />
  <svg
    ref="svg"
    class="canvas"
    :class="{ dragging }"
    :width="scene.viewport.w"
    :height="scene.viewport.h"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <g ref="world">
      <!-- Systems: the black boxes that can be opened -->
      <g
        v-for="n in frame.systems"
        :key="n.id"
        :data-node="n.id"
        class="node system"
        :class="{ open: n.f > 0.5 }"
        :opacity="nodeOpacity(n)"
        :transform="`translate(${n.x} ${n.y}) scale(${n.s})`"
        @pointerenter="hover(n.id)"
        @pointerleave="hover(null)"
      >
        <rect
          :x="-n.w / 2"
          :y="-n.h / 2"
          :width="n.w"
          :height="n.h"
          :rx="lerp(16, 5, n.f)"
          class="box"
          :style="{ strokeWidth: `calc(var(--px) * ${lerp(1.4, 1, n.f)})` }"
          :stroke-opacity="lerp(1, 0.4, n.f)"
        />
        <text
          :x="lerp(0, -n.w / 2 + 7 + textWidth(n.def.label, 5) / 2, n.f)"
          :y="lerp(-5, -n.h / 2 + 8.5, n.f)"
          :font-size="lerp(FONT.system, 5, n.f)"
          class="system-label"
          text-anchor="middle"
        >
          {{ n.def.label }}
        </text>
        <text y="15" class="note serif" font-size="12" text-anchor="middle" :opacity="1 - n.f">
          {{ n.def.note }}
        </text>
        <text
          :x="n.w / 2 - 7"
          :y="-n.h / 2 + 8.5"
          font-size="3.6"
          class="caps muted"
          text-anchor="end"
          :opacity="n.f"
        >
          boundary
        </text>
      </g>

      <!-- Edges -->
      <g class="edges">
        <path
          v-for="e in frame.edges"
          :key="e.id"
          :d="e.d"
          class="edge"
          :class="[e.def.kind, e.def.valence, { ghost: e.g > 0.5, drawn: e.drawn }]"
          :opacity="e.op"
          :pathLength="e.drawn ? 1 : undefined"
          :stroke-dashoffset="e.drawn ? 1 - e.p : undefined"
        />
      </g>

      <!-- Everything else -->
      <g
        v-for="n in frame.others"
        :key="n.id"
        :data-node="clickable(n.id) ? n.id : undefined"
        class="node"
        :class="[n.def.kind, n.def.valence, { clickable: clickable(n.id), ghost: n.g > 0.5 }]"
        :opacity="nodeOpacity(n)"
        :transform="`translate(${n.x} ${n.y}) scale(${n.s})`"
        @pointerenter="clickable(n.id) && hover(n.id)"
        @pointerleave="hover(null)"
      >
        <template v-if="n.def.kind === 'source'">
          <circle r="2.6" class="dot neutral" />
          <text x="-10" class="label" :font-size="FONT.label" text-anchor="end" dominant-baseline="central">
            {{ n.def.label }}
          </text>
        </template>

        <template v-else-if="n.def.kind === 'sink'">
          <rect :x="-6" :y="-11" :width="n.w + 22" :height="n.def.note ? 30 : 22" class="hit" />
          <circle
            :r="n.def.valence === 'unknown' ? 4 : 3"
            class="dot"
            :class="n.def.valence"
          />
          <text
            x="11"
            class="label"
            :class="n.def.valence"
            :font-size="n.def.label === '?' ? 15 : FONT.label"
            dominant-baseline="central"
          >
            {{ n.def.label }}
          </text>
          <text v-if="n.def.note" x="11" y="14" class="note serif" font-size="9.5">{{ n.def.note }}</text>
        </template>

        <template v-else-if="n.def.kind === 'part'">
          <rect :x="-n.w / 2" :y="-n.h / 2" :width="n.w" :height="n.h" rx="3" class="box" />
          <text :font-size="FONT.part" class="label" text-anchor="middle" dominant-baseline="central">
            {{ n.def.label }}
          </text>
        </template>

        <template v-else-if="n.def.kind === 'problem'">
          <rect :x="-n.w / 2" :y="-n.h / 2" :width="n.w" :height="n.h" :rx="n.h / 2" class="box problem-box" />
          <text :y="-n.h / 2 - 7" font-size="7.5" class="caps undesired" text-anchor="middle">problem</text>
          <text y="-5" :font-size="FONT.box" class="label" text-anchor="middle" dominant-baseline="central">{{ n.def.label }}</text>
          <text y="13" font-size="9" class="note serif" text-anchor="middle">{{ n.def.note }}</text>
        </template>

        <template v-else-if="n.def.kind === 'solution'">
          <rect
            :x="-n.w / 2"
            :y="-n.h / 2"
            :width="n.w"
            :height="n.h"
            rx="8"
            class="box solution-box"
            :class="{ 'rule-box': n.def.byRule }"
          />
          <template v-if="n.def.byRule">
            <!-- The bar follows the box's rounded corners instead of poking out past them -->
            <clipPath :id="`bar-${n.id}`"><rect :x="-n.w / 2" :y="-n.h / 2" :width="n.w" :height="n.h" rx="8" /></clipPath>
            <rect :x="-n.w / 2" :y="-n.h / 2" :width="3.5" :height="n.h" class="rule-bar" :clip-path="`url(#bar-${n.id})`" />
          </template>
          <text :y="-n.h / 2 - 7" font-size="7.5" class="caps" :class="n.def.byRule ? 'rule' : n.r > 0.5 ? 'undesired' : 'muted'" text-anchor="middle">
            {{ caption(n) }}
          </text>
          <text
            :font-size="FONT.box"
            class="label"
            :class="{ rule: n.def.byRule }"
            :opacity="1 - 0.5 * n.r"
            text-anchor="middle"
            dominant-baseline="central"
          >
            {{ n.def.byRule ? '§ ' : '' }}{{ n.def.label }}
          </text>
          <!-- Reversed: the solution is struck through, left to right -->
          <line
            v-if="n.r > 0.01"
            :x1="-n.w / 2 + 10"
            :x2="-n.w / 2 + 10 + (n.w - 20) * Math.min(1, Math.max(0, n.r))"
            y1="0"
            y2="0"
            class="strike"
          />
          <g :transform="`translate(0 ${n.h / 2 + 11})`">
            <text x="-6" font-size="6.5" class="caps muted" text-anchor="end" dominant-baseline="central">residue</text>
            <g v-for="(r, i) in residueOf(n.id, sc.composition().nodes)" :key="i" :transform="`translate(${4 + i * 11} 0)`">
              <circle v-if="r.kind === 'diffuse'" r="5.5" class="ring undesired" />
              <circle r="2.8" class="dot residue" :class="r.kind === 'unknown' ? 'unknown' : 'undesired'" />
            </g>
          </g>
          <text v-if="n.g > 0.5" :y="n.h / 2 + 28" font-size="8" class="note serif" text-anchor="middle">alternative · click to swap</text>
        </template>

        <template v-else-if="n.def.kind === 'rule'">
          <rect :x="-n.w / 2" :y="-n.h / 2" :width="n.w" :height="n.h" rx="3" class="box rule-box" />
          <clipPath :id="`bar-${n.id}`"><rect :x="-n.w / 2" :y="-n.h / 2" :width="n.w" :height="n.h" rx="3" /></clipPath>
          <rect :x="-n.w / 2" :y="-n.h / 2" :width="3" :height="n.h" class="rule-bar" :clip-path="`url(#bar-${n.id})`" />
          <text :y="-n.h / 2 - 7" font-size="7.5" class="caps rule" text-anchor="middle">rule · problem by design</text>
          <text :font-size="FONT.box" class="label rule" text-anchor="middle" dominant-baseline="central">§ {{ n.def.label }}</text>
        </template>

        <template v-else-if="n.def.kind === 'hypothesis'">
          <rect
            :x="-n.w / 2"
            :y="-n.h / 2"
            :width="n.w"
            :height="n.h"
            rx="12"
            class="box hypo-box"
            :class="{ promoted: n.g < 0.5 }"
          />
          <text :x="-n.w / 2 + 14" y="-6" font-size="12" class="label" dominant-baseline="central">{{ n.def.label }}</text>
          <text :x="-n.w / 2 + 14" y="11" font-size="7.2" class="caps muted" dominant-baseline="central">{{ n.def.pattern }}</text>
          <text
            :x="n.w / 2 - 14"
            y="11"
            font-size="7.2"
            class="caps"
            :class="n.g < 0.5 ? 'undesired' : 'muted'"
            text-anchor="end"
            dominant-baseline="central"
          >
            {{ n.g < 0.5 ? 'known undesirable' : 'guess' }}
          </text>
        </template>
      </g>
    </g>
  </svg>
  <FlowLayer :scene="scene" layer="front" />
</template>

<style scoped>
.canvas {
  --px: 1px;
  position: fixed;
  inset: 0;
  display: block;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.canvas.dragging {
  cursor: grabbing;
}
text {
  font-family: var(--sans);
  fill: var(--ink);
}
.serif {
  font-family: var(--serif);
  font-style: italic;
}
.caps {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 500;
}
.muted,
.note {
  fill: var(--muted);
}
.label {
  font-weight: 450;
}
.system-label {
  font-weight: 550;
  letter-spacing: -0.01em;
}
.box {
  fill: var(--paper);
  stroke: var(--ink);
  stroke-width: var(--px);
  transition: fill 0.3s;
}
.solution-box {
  stroke-width: calc(var(--px) * 1.2);
}
.node.ghost .solution-box {
  stroke-dasharray: calc(var(--px) * 3) calc(var(--px) * 3);
}
.node.clickable,
.node.system {
  cursor: pointer;
}
.node.system.open {
  cursor: inherit;
}
.node.system.open .box {
  fill: var(--paper-inset);
}
.node.clickable:hover .box {
  fill: var(--paper-hover);
}
.hit {
  fill: transparent;
}
.problem-box {
  stroke: var(--undesired);
  stroke-width: calc(var(--px) * 1.3);
}
.rule-box {
  stroke: var(--rule);
  stroke-width: calc(var(--px) * 1.2);
  fill: var(--rule-tint);
}
.rule-bar {
  fill: var(--rule);
}
.hypo-box {
  stroke: var(--unknown);
  stroke-width: calc(var(--px) * 1.15);
  stroke-dasharray: calc(var(--px) * 3) calc(var(--px) * 3.5);
}
.hypo-box.promoted {
  stroke: var(--undesired);
  stroke-dasharray: none;
}
.node.ghost .label {
  fill: var(--muted);
}
.dot {
  stroke: none;
}
.dot.desired {
  fill: var(--desired);
}
.dot.undesired {
  fill: var(--undesired);
}
.dot.neutral {
  fill: var(--neutral);
}
.dot.unknown {
  fill: none;
  stroke: var(--unknown);
  stroke-width: calc(var(--px) * 1.1);
  stroke-dasharray: calc(var(--px) * 1.6) calc(var(--px) * 1.6);
}
.dot.residue.unknown {
  stroke-width: var(--px);
  stroke-dasharray: calc(var(--px) * 1.4) calc(var(--px) * 1.4);
}
.ring {
  fill: none;
  stroke-width: var(--px);
  stroke: var(--undesired);
  opacity: 0.45;
}
.label.undesired,
.caps.undesired {
  fill: var(--undesired);
}
.label.unknown {
  fill: var(--unknown);
}
.label.rule,
.caps.rule {
  fill: var(--rule);
}

.edge {
  fill: none;
  stroke-linecap: round;
  stroke-width: calc(var(--px) * 1.15);
  stroke-dasharray: calc(var(--px) * 3) calc(var(--px) * 4);
}
.edge.drawn {
  stroke-dasharray: 1 1;
}
.edge.flow.neutral {
  stroke: var(--neutral);
  stroke-opacity: 0.38;
}
.edge.flow.desired {
  stroke: var(--desired);
  stroke-opacity: 0.55;
}
.edge.flow.undesired {
  stroke: var(--undesired);
  stroke-opacity: 0.5;
}
.edge.flow.unknown {
  stroke: var(--unknown);
  stroke-opacity: 0.5;
}
.edge.becomes {
  stroke: var(--undesired);
  stroke-opacity: 0.7;
}
.edge.solves {
  stroke: var(--undesired);
  stroke-opacity: 0.5;
}
.edge.solves.ghost {
  stroke: var(--muted);
  stroke-opacity: 0.6;
}
.edge.pressure {
  stroke: var(--rule);
  stroke-width: calc(var(--px) * 1.5);
  stroke-dasharray: calc(var(--px) * 1.5) calc(var(--px) * 4);
}
.edge.speculates {
  stroke: var(--unknown);
}
.edge.involves {
  stroke: var(--muted);
  stroke-opacity: 0.7;
  stroke-dasharray: calc(var(--px) * 1) calc(var(--px) * 3);
}
.strike {
  stroke: var(--undesired);
  stroke-width: calc(var(--px) * 1.6);
  stroke-linecap: round;
}

</style>
