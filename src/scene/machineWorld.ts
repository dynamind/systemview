// Shows a model of function machines (machines.ts) and the gaps the engine finds in it.
// The need stands on the right. Each system stands one column left of the systems it
// gives to, so what reaches the need directly stands next to it. Inputs come in at the
// left of a box and outputs leave at its right. Each output says its gaps at the inputs
// it reaches. A boundary opens on a click into a frame with its machines inside, laid out
// the same way. Systems outside the model's concern are not shown.

import { finish, lineage, placer, sizeOf, textWidth, type BaseState, type Composition, type Domain, type EdgeDef, type Kit, type NodeDef, type Script, type Suggestion, type Valence } from './model'
import { parseMachines, type Flow, type Gap, type Instance, type Out, type Route } from './machines'
import { LANE, STACKED } from './geometry'

export interface MachineState extends BaseState {
  /** Boundaries that show their machines. */
  open: string[]
}

const ROW = 40
const IN_ROW = 28
// How far the inputs and outputs stand from their box, the same on both sides.
const REACH = 64
const PAD = 26
const HEAD = 34
const COL = 80
const STACK = 40
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth']
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9›]+/g, '-').replace(/^-|-$/g, '')
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
const VALENCE: Record<string, Valence> = { '+': 'desired', '~': 'undesired', '?': 'unknown' }
// An output named "?" stands for what a machine gives out that nobody has named yet: fog.
const valenceOf = (o: Out): Valence => (o.flow.label === '?' ? 'unknown' : (o.flow.mark && VALENCE[o.flow.mark]) || 'neutral')
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** The gaps of one route, in short: "pain: treatment, price · refused: volume". */
function summary(gaps: Gap[]) {
  const of = (w: Gap['weight']) => gaps.filter((g) => g.weight === w).map((g) => g.dimension)
  return [of('refused').length && `refused: ${of('refused').join(', ')}`, of('pain').length && `pain: ${of('pain').join(', ')}`, of('unknown').length && `unknown: ${of('unknown').join(', ')}`]
    .filter(Boolean)
    .join(' · ')
}

/** One sentence on what a receiver makes of an output: "Dairy on the table ranks it last on treatment, and second on price." */
function verdict(to: string, gaps: Gap[]) {
  const refused = gaps.filter((g) => g.weight === 'refused').map((g) => g.dimension)
  if (refused.length) return `${to} refuses it on ${list(refused)}.`
  const place = (g: Gap) => (g.rank === g.of ? 'last' : (ORDINAL[g.rank!] ?? `number ${g.rank! + 1}`))
  const pains = gaps.filter((g) => g.weight === 'pain')
  const places = [...new Set(pains.map(place))]
  const parts = places.map((p) => `${p} on ${list(pains.filter((g) => place(g) === p).map((g) => g.dimension))}`)
  const unknown = gaps.filter((g) => g.weight === 'unknown').map((g) => g.dimension)
  return [parts.length && `${to} ranks it ${list(parts)}.`, unknown.length && `${to} cannot tell its ${list(unknown)}.`].filter(Boolean).join(' ')
}

export function deriveMachines(m: { id: string; title: string; text: string }): Domain<MachineState> {
  const model = parseMachines(m.text)
  for (const w of model.warnings) console.warn(`${m.id}: ${w}`)

  // What lies outside the concern of the model stays off the canvas, and so do the gaps it finds there.
  const shown = (u: Instance): boolean => u.machine.kind !== 'outside' && (!u.up || shown(u.up))
  const routes = model.routes.filter((r) => shown(r.from) && shown(r.to))
  const gaps = model.gaps.filter((g) => shown(g.from) && shown(g.to))
  const instances = model.instances.filter(shown)

  // ------------------------------------------------------------ nodes and edges

  const nodes: NodeDef[] = []
  const edges: EdgeDef[] = []
  const idOf = new Map<Instance, string>()
  const outId = (u: Instance, o: Out) => `${idOf.get(u)}>${slug(o.flow.label) || 'unknown'}`
  const inId = (u: Instance, label: string) => `${idOf.get(u)}<${slug(label)}`
  const gapsOf = (r: Route) => gaps.filter((g) => g.output === r.output && g.input === r.input && g.to === r.to)
  const outsOf = (u: Instance) => model.outputs.get(u) ?? []
  const insOf = (u: Instance) => model.inputs.get(u) ?? u.machine.ins

  const outerOf = (k: Instance, input: Flow) => model.through.find((t) => t.to === k && t.input === input)?.outer
  // What flows in keeps its color as it passes in through each boundary.
  const inflow = (u: Instance, input: Flow): Valence => {
    const r = routes.find((r) => r.to === u && r.input === input)
    const outer = outerOf(u, input)
    return r ? valenceOf(r.output) : outer ? inflow(u.up!, outer) : 'neutral'
  }
  // A boundary that makes an input inside as well needs less of it from outside as it runs: Rearing replaces the cows and bulls the farm buys.
  const insideToo = (u: Instance, input: Flow) => [
    ...new Set(model.through.filter((t) => t.outer === input && t.to.up === u).flatMap((t) => routes.filter((r) => r.to === t.to && r.input === t.input).map((r) => r.from.machine.label))),
  ]
  // A flow that is the only output of one machine and the only input of the next shows one label, not two.
  // A machine with more inputs or outputs keeps all of them in its lists, so the lists stay whole.
  const joined = new Set(
    routes.filter((r) => {
      const sole = (xs: unknown[]) => xs.length === 1
      return (
        sole(outsOf(r.from)) &&
        sole(routes.filter((x) => x.from === r.from)) &&
        !model.leaves.some((l) => l.from === r.from) &&
        sole(insOf(r.to)) &&
        sole(routes.filter((x) => x.to === r.to)) &&
        !r.to.kids.length &&
        !r.input.start &&
        !outerOf(r.to, r.input) &&
        !insideToo(r.to, r.input).length &&
        r.input.label.toLowerCase() === r.output.flow.label.toLowerCase() &&
        !gapsOf(r).length
      )
    }),
  )
  const isJoined = (u: Instance, input: Flow) => [...joined].some((r) => r.to === u && r.input === input)
  const routeId = (r: Route) => `r-${outId(r.from, r.output)}-${joined.has(r) ? idOf.get(r.to) : inId(r.to, r.input.label)}`
  for (const u of instances) idOf.set(u, `${u.machine.kind}:${slug(u.name)}`)
  for (const u of instances) {
    const id = idOf.get(u)!
    const { machine } = u
    if (machine.kind === 'need') nodes.push({ id, kind: 'need', label: machine.label, tag: machine.facts.for ? `need · ${machine.facts.for}` : 'need', why: machine.facts.why })
    else nodes.push({ id, kind: 'solution', label: machine.label, tag: u.kids.length ? (u.many ? 'many · boundary' : 'boundary') : u.many ? 'many' : '', many: u.many, why: machine.facts.how, parent: u.up && idOf.get(u.up), relation: 'inside' })
    for (const input of insOf(u)) {
      if (isJoined(u, input)) continue
      const iid = inId(u, input.label)
      const too = insideToo(u, input)
      const note = input.start ? 'to start' : too.length ? `also from ${list(too)}` : undefined
      nodes.push({ id: iid, kind: 'source', label: input.label, note, parent: id, relation: 'input of' })
      edges.push({ id: `i-${iid}`, from: iid, to: id, kind: 'flow', valence: inflow(u, input) })
    }
    for (const o of outsOf(u)) {
      const oid = outId(u, o)
      const found = routes.filter((r) => r.output === o && r.from === u).flatMap(gapsOf)
      const refused = found.some((g) => g.weight === 'refused')
      const valence = refused ? 'undesired' : valenceOf(o)
      nodes.push({ id: oid, kind: 'sink', label: o.flow.label, note: summary(found) || undefined, valence, gap: refused ? 'refused' : found.some((g) => g.weight === 'pain') ? 'pain' : undefined, parent: id, relation: 'output of' })
      edges.push({ id: `o-${oid}`, from: id, to: oid, kind: 'flow', valence })
    }
  }
  for (const r of routes) {
    const from = outId(r.from, r.output)
    const to = joined.has(r) ? idOf.get(r.to)! : inId(r.to, r.input.label)
    edges.push({ id: routeId(r), from, to, kind: 'flow', valence: gapsOf(r).some((g) => g.weight === 'refused') ? 'undesired' : valenceOf(r.output) })
  }
  // A loop gives back to a machine upstream: fields grow feed for the herd that manures them.
  // The walk starts at the machines that take the most in from outside, so the herd comes
  // first, and a flow back to a machine on the walk is a loop.
  function loopsIn(members: Instance[], receivers: (u: Instance) => Instance[], intake: (u: Instance) => number) {
    const back = new Set<string>()
    const loops = new Set<Instance>()
    const done = new Set<Instance>()
    const walk = (u: Instance, path: Instance[]) => {
      done.add(u)
      for (const r of receivers(u).filter((r) => members.includes(r) && r !== u)) {
        if (path.includes(r)) {
          back.add(`${idOf.get(u)}>${idOf.get(r)}`)
          loops.add(u)
        } else if (!done.has(r)) walk(r, [...path, r])
      }
    }
    for (const u of [...members].sort((a, b) => intake(b) - intake(a))) if (!done.has(u)) walk(u, [u])
    const ahead = (u: Instance) => receivers(u).filter((r) => r !== u && members.includes(r) && !back.has(`${idOf.get(u)}>${idOf.get(r)}`))
    return { back, loops, ahead }
  }
  const roots = instances.filter((u) => !u.up)
  // Trade between two instances of one machine, like cattle between farms, does not set the columns: they stand side by side.
  const rootReceivers = (u: Instance) => routes.filter((r) => r.from === u && !r.to.up && r.to.machine !== u.machine).map((r) => r.to)
  const looped = new Map<Instance | undefined, ReturnType<typeof loopsIn>>([[undefined, loopsIn(roots, rootReceivers, () => 0)]])
  for (const u of instances.filter((u) => u.kids.length))
    looped.set(
      u,
      loopsIn(
        u.kids,
        (k) => routes.filter((x) => x.from === k && x.to.up === u).map((x) => x.to),
        (k) => model.through.filter((t) => t.to === k).length,
      ),
    )
  // A loop back runs under the machines of its frame, not across them.
  for (const r of routes) {
    if (!r.from.up || r.from.up !== r.to.up || !looped.get(r.from.up)!.back.has(`${idOf.get(r.from)}>${idOf.get(r.to)}`)) continue
    edges.find((e) => e.id === routeId(r))!.under = idOf.get(r.from.up)
  }

  // Where flows cross the edge of an open frame: from its inputs in to its machines, and from its machines out.
  const crossing = new Set<string>()
  for (const u of instances.filter((u) => u.kids.length)) {
    for (const k of u.kids) {
      for (const input of insOf(k)) {
        const outer = outerOf(k, input)
        if (outer) edges.push({ id: `b-${inId(u, outer.label)}-${inId(k, input.label)}`, from: inId(u, outer.label), to: inId(k, input.label), kind: 'flow', valence: inflow(u, outer) })
      }
    }
    for (const l of model.leaves.filter((l) => l.from.up === u && shown(l.from)))
      edges.push({ id: `x-${outId(l.from, l.output)}`, from: outId(l.from, l.output), to: outId(u, l.outer), kind: 'flow', valence: valenceOf(l.output), late: true })
    // What no machine inside makes, but comes in under the same name, passes straight through.
    for (const o of outsOf(u)) {
      if (edges.some((e) => e.to === outId(u, o) && e.id.startsWith('x-'))) continue
      const input = insOf(u).find((p) => p.label.toLowerCase() === o.flow.label.toLowerCase())
      if (input) edges.push({ id: `t-${outId(u, o)}`, from: inId(u, input.label), to: outId(u, o), kind: 'flow', valence: valenceOf(o) })
    }
    for (const input of insOf(u)) crossing.add(`i-${inId(u, input.label)}`)
    for (const o of outsOf(u)) crossing.add(`o-${outId(u, o)}`)
  }
  // A rule stands over each system whose flow it limits.
  for (const rule of model.machines.filter((x) => x.kind === 'rule')) {
    const target = rule.facts.limits?.match(/\b(?:into|out of)\s+(.+)$/)?.[1]?.trim().toLowerCase()
    for (const at of instances.filter((u) => u.machine.label.toLowerCase() === target)) {
      const id = `rule:${slug(rule.label)}@${idOf.get(at)}`
      nodes.push({ id, kind: 'rule', label: rule.label, tag: 'rule', why: [rule.facts.limits && `It limits ${rule.facts.limits}.`, rule.facts.why].filter(Boolean).join(' '), parent: idOf.get(at) })
      edges.push({ id: `p-${id}`, from: id, to: idOf.get(at)!, kind: 'pressure', fromSide: 'bottom', toSide: 'top' })
    }
  }

  const N = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const need = instances.find((u) => u.machine.kind === 'need')
  const root = need ? idOf.get(need)! : ''
  const instanceOf = new Map([...idOf].map(([u, id]) => [id, u]))
  const boundaries = instances.filter((u) => u.kids.length).map((u) => idOf.get(u)!)

  // ------------------------------------------------------------ the layout

  interface Block {
    w: number
    h: number
    /** The center of the box, down from the top of the block. */
    cy: number
    /** The room left of the box, and the width of the box. */
    inset: number
    box: number
    place(left: number, top: number, delay: number): void
  }

  function compose(s: MachineState): Composition {
    const c: Composition = { nodes: {}, edges: {} }
    const { put } = placer(N, c)
    const open = new Set(s.open)
    const ins = (u: Instance) => insOf(u).filter((i) => !isJoined(u, i)).map((i) => inId(u, i.label))
    const outs = (u: Instance) => outsOf(u).map((o) => outId(u, o))
    const rules = (u: Instance) => nodes.filter((n) => n.kind === 'rule' && n.parent === idOf.get(u)).map((n) => n.id)
    const labelW = (id: string) => Math.max(sizeOf(N[id]).w, N[id].note ? textWidth(N[id].note!, 9.5) : 0)

    // In a frame, an output that goes to a machine beside it and out of the frame too runs over that machine.
    // The machine stands a row below it, clear of its rules, so the next output leaves a row lower again to pass under the machine.
    const forked = (u: Instance, o: Out) =>
      routes.some((r) => r.from === u && r.output === o) && edges.some((e) => e.id.startsWith('x-') && e.from === outId(u, o))
    const lane = (u: Instance, o: Out) =>
      forked(u, o) ? ROW + Math.max(0, ...routes.filter((r) => r.from === u && r.output === o).map((r) => ruleRoom(r.to))) : 0
    /** The rows of the outputs of u, down from the center of its box. */
    const rowsOf = (u: Instance) => {
      const o = outsOf(u)
      let y = 0
      const ys = o.map((x) => {
        const at = y
        y += ROW + lane(u, x)
        return at
      })
      return ys.map((v) => v - (ys[0] + ys[ys.length - 1]) / 2)
    }

    // A rule stands just over the box it limits, clear of the caption over the box when it has one.
    const ruleRoom = (u: Instance) => {
      const r = rules(u)
      return r.length ? (N[idOf.get(u)!].tag ? 19 : 0) + 26 + r.length * 40 : 0
    }

    function block(u: Instance): Block {
      const id = idOf.get(u)!
      const from = N[id].parent
      const i = ins(u)
      // Inputs with a note under them need the room of a row of outputs.
      const inRow = i.some((k) => N[k].note) ? ROW : IN_ROW
      const o = outs(u)
      const r = rules(u)
      const inset = i.length ? REACH + Math.max(...i.map(labelW)) + 20 : 0
      const tail = o.length ? REACH + Math.max(...o.map(labelW)) + 20 : 0
      const cap = N[id].tag ? 19 : 0
      const above = ruleRoom(u)
      const putRules = (cx: number, boxTop: number, delay: number) =>
        r.forEach((k, j) => put(k, cx, boxTop - cap - 37 - (r.length - 1 - j) * 40, { delay, from: id }))

      if (open.has(id) && u.kids.length) {
        const inner = group(u.kids, looped.get(u)!, true)
        const lanes = edges.filter((e) => e.under === id).length
        const fw = inner.w + PAD * 2
        const fh = inner.h + HEAD + PAD + (lanes ? lanes * LANE + 8 : 0)
        return {
          w: inset + fw + tail,
          h: above + fh,
          cy: above + fh / 2,
          inset,
          box: fw,
          place(left, top, delay) {
            const fl = left + inset
            const ft = top + above
            put(id, fl + fw / 2, ft + fh / 2, { w: fw, h: fh, f: 1, delay, from })
            inner.place(fl + PAD, ft + HEAD, delay + 150)
            // The heights come later, once the machines inside and the flows outside stand: refer to arrange().
            i.forEach((k, j) => put(k, fl - 44, ft + fh / 2, { delay: delay + 80 + j * 50, from: id }))
            o.forEach((k, j) => put(k, fl + fw + 44, ft + fh / 2, { delay: delay + 300 + j * 60, from: id }))
            putRules(fl + fw / 2, ft, delay + 80)
          },
        }
      }

      const { w: bw, h: bh } = sizeOf(N[id])
      // The outputs of a stack leave from its back box.
      const back = u.many ? STACKED : 0
      const rows = rowsOf(u)
      const body = Math.max(bh + 28, i.length * inRow, o.length ? rows[rows.length - 1] - rows[0] + ROW : 0)
      const ruleH = Math.max(0, above - (body - bh) / 2)
      return {
        w: inset + bw + back + tail,
        h: ruleH + body,
        cy: ruleH + body / 2,
        inset,
        box: bw + back,
        place(left, top, delay) {
          const x0 = left + inset
          const y = top + ruleH + body / 2
          put(id, x0 + bw / 2, y, { delay, from })
          i.forEach((k, j) => put(k, x0 - REACH, y + (j - (i.length - 1) / 2) * inRow, { delay: delay + 80 + j * 50, from: id }))
          o.forEach((k, j) => put(k, x0 + bw + back + REACH, y + back + rows[j], { delay: delay + 100 + j * 60, from: id }))
          putRules(x0 + bw / 2, y - bh / 2, delay + 80)
        },
      }
    }

    /** Lays out systems that stand side by side: each one a column left of what it gives to. */
    function group(members: Instance[], { loops, ahead }: ReturnType<typeof loopsIn>, frame = false): Block {

      const depth = new Map<Instance, number>()
      const depthOf = (u: Instance): number => {
        if (depth.has(u)) return depth.get(u)!
        const next = ahead(u)
        const v = next.length ? 1 + Math.max(...next.map(depthOf)) : 0
        depth.set(u, v)
        return v
      }
      members.forEach((u) => depthOf(u))
      const deepest = Math.max(...members.map((u) => depth.get(u)!))
      const feeders = (u: Instance) => members.filter((r) => ahead(r).includes(u))
      const columns = Array.from({ length: deepest + 1 }, (_, j) => members.filter((u) => depth.get(u) === deepest - j))
      const blocks = new Map(members.map((u) => [u, block(u)]))
      // The boxes of a column stand on one center line. The labels left and right of them take the room they need.
      const most = (col: Instance[], f: (b: Block) => number) => Math.max(0, ...col.map((u) => f(blocks.get(u)!)))
      const insets = columns.map((col) => most(col, (b) => b.inset))
      const boxes = columns.map((col) => most(col, (b) => b.box))
      const widths = columns.map((col, j) => insets[j] + boxes[j] + most(col, (b) => b.w - b.inset - b.box))

      // From the right: each system stands level with what it gives to, as near as the others in its column allow.
      // The main flow stands level with the main flow; loops stand below it, so they stay short.
      // In a frame, it is the row of the output that stands level with the machine it goes in to, not the box.
      const top = new Map<Instance, number>()
      const center = new Map<Instance, number>()
      // Where the output that feeds u leaves its feeder, from the center of the feeder's box.
      const row = (from: Instance, u: Instance) => {
        const r = routes.find((r) => r.from === from && r.to === u)!
        return rowsOf(from)[outsOf(from).indexOf(r.output)] + lane(from, r.output)
      }
      // A second pass places a machine that gives to nothing in its frame level with the output that feeds it,
      // now that the first pass has placed its feeders.
      for (const pass of frame ? [0, 1] : [0]) {
        const before = new Map(center)
        for (let j = columns.length - 1; j >= 0; j--) {
          // A machine that a forked output feeds stands a row below that output, even in a loop.
          const fed = (u: Instance) => (frame ? feeders(u).filter((r) => center.has(r) && forked(r, routes.find((x) => x.from === r && x.to === u)!.output)) : [])
          const want = (u: Instance) => {
            const lane = fed(u)
            if (lane.length) return mean(lane.map((r) => center.get(r)! + row(r, u)))
            const next = ahead(u).filter((r) => center.has(r))
            const main = next.filter((r) => !loops.has(r))
            const ys = (main.length && !loops.has(u) ? main : next).map((r) => center.get(r)! - (frame ? row(u, r) : 0))
            if (ys.length) return mean(ys)
            const from = pass && !ahead(u).length ? feeders(u).filter((r) => before.has(r)) : []
            return from.length ? mean(from.map((r) => before.get(r)! + row(r, u))) : undefined
          }
          const order = [...columns[j]].sort((a, b) => Number(loops.has(a) && !fed(a).length) - Number(loops.has(b) && !fed(b).length) || (want(a) ?? 1e9) - (want(b) ?? 1e9))
          // Each one stands at the height it wants, but never closer than STACK to the one above it. In a frame,
          // the boxes stand a row apart, so that a flow can pass between them.
          const gap = frame ? ROW - 28 : STACK
          let y = 0
          const tops = order.map((u, k) => {
            const w = want(u)
            const t = w === undefined ? y : k ? Math.max(w - blocks.get(u)!.cy, y) : w - blocks.get(u)!.cy
            y = t + blocks.get(u)!.h + gap
            return t
          })
          const placed = order.filter((u) => want(u) !== undefined)
          // At the top level, a column centers on what its systems give to. In a frame, the first machine keeps its
          // height and the others make room below it: cooling stays level with the raw milk of the herd.
          const shift = !placed.length ? -(y - gap) / 2 : frame ? 0 : mean(placed.map((u) => want(u)! - tops[order.indexOf(u)] - blocks.get(u)!.cy))
          order.forEach((u, k) => {
            top.set(u, tops[k] + shift)
            center.set(u, tops[k] + shift + blocks.get(u)!.cy)
          })
        }
      }
      const y0 = Math.min(...members.map((u) => top.get(u)!))
      const y1 = Math.max(...members.map((u) => top.get(u)! + blocks.get(u)!.h))
      return {
        w: widths.reduce((a, b) => a + b, 0) + COL * (columns.length - 1),
        h: y1 - y0,
        cy: (y1 - y0) / 2,
        inset: 0,
        box: widths.reduce((a, b) => a + b, 0) + COL * (columns.length - 1),
        place(left, top0, delay) {
          let x = left
          columns.forEach((col, j) => {
            for (const u of col) {
              const b = blocks.get(u)!
              b.place(x + insets[j] + (boxes[j] - b.box) / 2 - b.inset, top0 + top.get(u)! - y0, delay + (columns.length - 1 - j) * 140)
            }
            x += widths[j] + COL
          })
        },
      }
    }

    group(roots, looped.get(undefined)!).place(0, 0, 100)
    // A box keeps the order the model lists its flows in, but the flows that go somewhere on the canvas
    // swap rows with each other to take the row nearest to where they go, so they don't cross.
    const toward = (k: string, inward: boolean) => {
      const ys = edges
        .filter((e) => !/^[iobx]-/.test(e.id) && (inward ? e.to === k : e.from === k))
        .map((e) => c.nodes[inward ? e.from : e.to]?.y)
        .filter((y): y is number => y !== undefined)
      return ys.length ? mean(ys) : undefined
    }
    function arrange(stubs: string[], inward: boolean) {
      const linked = stubs.filter((k) => toward(k, inward) !== undefined).sort((a, b) => toward(a, inward)! - toward(b, inward)!)
      return stubs.map((k) => (toward(k, inward) === undefined ? k : linked.shift()!))
    }
    // In an open frame, each flow stands as level with the machines it goes in to or comes from as the
    // order allows.
    const level = (k: string, inward: boolean) => {
      const ys = edges
        .filter((e) => /^[bx]-/.test(e.id) && (inward ? e.from === k : e.to === k))
        .map((e) => c.nodes[inward ? e.to : e.from]?.y)
        .filter((y): y is number => y !== undefined)
      return ys.length ? mean(ys) : undefined
    }
    for (const u of instances) {
      const id = idOf.get(u)!
      if (!c.nodes[id]) continue
      for (const [stubs, inward] of [[ins(u), true], [outs(u), false]] as const) {
        const here = stubs.filter((k) => c.nodes[k])
        if (!here.length) continue
        const order = arrange(here, inward)
        if (!open.has(id)) {
          const rows = here.map((k) => c.nodes[k].y).sort((a, b) => a - b)
          order.forEach((k, j) => (c.nodes[k].y = rows[j]))
          continue
        }
        const gap = inward && here.some((k) => N[k].note) ? ROW : inward ? IN_ROW : ROW
        // A flow with no machine to stand level with stands a row from its nearest neighbor that has one.
        const at = order.map((k) => level(k, inward))
        const want = at.map((y, j) => {
          if (y !== undefined) return y
          const near = at.flatMap((y, n) => (y === undefined ? [] : [{ y, n }])).sort((a, b) => Math.abs(a.n - j) - Math.abs(b.n - j))[0]
          return near ? near.y + (j - near.n) * gap : c.nodes[id].y + (j - (order.length - 1) / 2) * gap
        })
        const ys: number[] = []
        // A flow that would stand less than two rows below the one above it takes the next row, so the rows stay even.
        want.forEach((w, j) => ys.push(!j ? w : w < ys[j - 1] + 2 * gap ? ys[j - 1] + gap : w))
        order.forEach((k, j) => (c.nodes[k].y = ys[j]))
      }
    }
    finish(c, s, N, edges)
    // A joined flow belongs to the machine it goes in to as much as to the one that makes it: both stay lit.
    for (const r of joined) {
      if (s.focus !== outId(r.from, r.output)) continue
      for (const k of [idOf.get(r.to)!, routeId(r)]) {
        const t = c.nodes[k] ?? c.edges[k]
        if (t) t.d = 0
      }
    }
    // An open frame shows its crossings instead of the short edges to its own box.
    for (const b of open) {
      const u = instanceOf.get(b)!
      for (const k of [...ins(u).map((x) => `i-${x}`), ...outs(u).map((x) => `o-${x}`)]) if (crossing.has(k)) delete c.edges[k]
    }
    for (const b of boundaries) if (!open.has(b)) for (const x of outs(instanceOf.get(b)!)) delete c.edges[`t-${x}`]
    return c
  }

  // ------------------------------------------------------------ the conversation

  const intro = [need?.machine.facts.why ?? m.title, 'An amber note is a pain point, and a red one is a refusal.'].join(' ')

  const told = (id: string) => {
    const n = N[id]
    const u = instanceOf.get(id)
    if (u) return n.why ? `${n.label}: ${n.why}${/[.!?]$/.test(n.why) ? '' : '.'}` : n.label
    if (n.kind === 'sink') {
      const from = instanceOf.get(n.parent!)!
      if (n.label === '?') return `What else ${from.machine.label} gives out, nobody has named yet.`
      const reached = routes.filter((r) => r.from === from && outId(from, r.output) === id)
      const leaves = model.leaves.filter((l) => l.from === from && outId(from, l.output) === id)
      // Where it goes: to the machines that take it in, and out through the boundary it stands in.
      const to = [...new Set(reached.map((r) => r.to.machine.label))]
      const out = leaves.map((l) => `out of ${from.up!.machine.label}${l.outer.flow.label.toLowerCase() === n.label.toLowerCase() ? '' : `, as ${l.outer.flow.label}`}`)
      // An output that nothing takes in goes to somewhere, as if the model said so.
      if (!to.length && !out.length) return `${from.machine.label} sends ${n.label} to somewhere. The model does not go into where.`
      const goes = `${from.machine.label} sends ${n.label} ${list([...(to.length ? [`to ${list(to)}`] : []), ...out])}.`
      return [goes, ...reached.map((r) => verdict(r.to.machine.label, gapsOf(r)))].filter(Boolean).join(' ')
    }
    if (n.kind === 'source') {
      const to = instanceOf.get(n.parent!)!
      const input = insOf(to).find((i) => inId(to, i.label) === id)!
      const from = [...new Set(routes.filter((r) => r.to === to && r.input === input).map((r) => r.from.machine.label))]
      const outer = outerOf(to, input)
      // An input that nothing gives comes from somewhere, as if the model said so.
      const away = !from.length && !outer
      const where = [...(from.length ? [`from ${list(from)}`] : []), ...(outer ? [`through the boundary of ${to.up!.machine.label}`] : []), ...(away ? ['from somewhere'] : [])]
      const told = [`${to.machine.label} takes in ${n.label} ${list(where)}.`]
      const too = insideToo(to, input)
      if (away && !too.length) told.push('The model does not go into where.')
      if (input.start) {
        const running = insOf(to).filter((i) => !i.start).map((i) => i.label)
        told.push(`It needs ${n.label} only to start.${running.length ? ` After that, it runs on ${list(running)}.` : ''}`)
      }
      if (from.length && outer) told.push(`The more ${list(from)} gives, the less ${to.up!.machine.label} needs from outside.`)
      else if (too.length) told.push(`${list(too)} inside it gives ${n.label} too, so the more ${list(too)} gives, the less it needs from outside.`)
      return told.join(' ')
    }
    return n.why ?? n.label
  }

  function script({ state, say, settle }: Kit<MachineState>): Script {
    const speak = (t: string) => say(t, false)
    const inside = (id: string) => [id, ...nodes.filter((n) => n.parent === id).map((n) => n.id)]

    const actions = {
      overview() {
        state.focus = null
        settle('all', 40)
      },
      open() {
        state.focus = null
        state.open = [...boundaries]
        settle('all', 40)
        speak(intro)
      },
      grow(id: string) {
        state.open = [...new Set([...state.open, ...lineage(N, id).filter((k) => boundaries.includes(k))])]
        state.focus = null
        settle(inside(id), 50)
        speak(told(id))
      },
      close(id: string) {
        const shut = new Set([id, ...boundaries.filter((b) => lineage(N, b).includes(id))])
        state.open = state.open.filter((k) => !shut.has(k))
        state.focus = null
        settle('all', 40)
      },
      why(id: string, text?: string) {
        if (!N[id]) return
        // Open only what it needs to show: an input or output shows on the closed box it belongs to.
        const above = lineage(N, id).slice(instanceOf.has(id) ? 1 : 2)
        state.open = [...new Set([...state.open, ...above.filter((k) => boundaries.includes(k))])]
        // A system keeps all its flows lit; a flow lights the path to its system.
        state.focus = instanceOf.has(id) ? null : id
        settle(instanceOf.has(id) ? inside(id) : [id, N[id].parent!].filter(Boolean), 50)
        speak(text ?? told(id))
      },
      clearFocus() {
        state.focus = null
      },
    }

    // A click inside an open frame closes the frames within it, and a click outside closes them all.
    function click(id: string) {
      if (boundaries.includes(id) && !state.open.includes(id)) return actions.grow(id)
      if (boundaries.includes(id)) {
        const within = state.open.filter((b) => b !== id && lineage(N, b).includes(id))
        return within.length ? within.forEach(actions.close) : actions.clearFocus()
      }
      if (state.focus === id) return actions.clearFocus()
      actions.why(id)
    }

    function ask(text: string) {
      if (/every|whole|all of it|show all/.test(text)) return actions.open()
      if (/overview|zoom out|back/.test(text)) return actions.overview()
      const hit = nodes.filter((n) => n.kind !== 'source' && n.kind !== 'sink' && text.includes(n.label.toLowerCase())).sort((a, b) => b.label.length - a.label.length)[0]
      if (!hit) return speak('Name something in the model, or click it.')
      click(hit.id)
    }

    function suggestions(): Suggestion[] {
      const s: Suggestion[] = []
      for (const id of boundaries) if (!state.open.includes(id) && !instanceOf.get(id)!.up) s.push({ label: `What is inside ${instanceOf.get(id)!.name}?`, run: () => actions.grow(id) })
      if (state.open.length < boundaries.length) s.push({ label: 'Show everything', run: actions.open })
      return s.slice(0, 4)
    }

    const tour = [
      () => {
        Object.assign(state, initialState())
        settle('all', 60)
        speak(intro)
      },
      ...boundaries.filter((id) => !instanceOf.get(id)!.up).map((id) => () => actions.grow(id)),
      actions.overview,
    ]
    function background() {
      state.focus = null
      if (!state.open.length) return
      state.open = []
      settle('all', 40)
    }

    return { intro, actions, click, background, ask, suggestions, tour }
  }

  const initialState = (): MachineState => ({ zoom: 'root', focus: null, hover: null, open: [] })

  return { id: m.id, title: m.title, goal: '', system: root, NODES: N, EDGES: edges, initialState, compose, script, visiblePath: true, maxZoom: 1.5 }
}
