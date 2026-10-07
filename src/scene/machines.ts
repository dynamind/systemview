// Reads a model of function machines and finds its gaps. The format is the one in
// models/milk-machines.txt; the comment at the top of that file explains it.
//
//   system Dairy plant
//     contains: Mixing, Pasteurizing        the machines inside its boundary
//     in: raw milk from many Dairy farm     inputs; "from" names a supplier across the boundary
//     in: packaging from somewhere          a source we do not expand; "to somewhere" is a sink
//     starts with: a cow, a bucket          inputs it needs only to start: stocks, not flows
//         treatment: raw                    under an input: the values it accepts, most desired first
//
//   system Pasteurizing
//     in: raw milk
//     out: + milk                           outputs; + wanted, ~ unwanted, ? unknown
//            treatment: pasteurized         under an output: a value it changes
//
// Blocks: system, outside, need, rule. Statements: for, in, starts with, out, contains, limits, how, why.
//
// A block is a class of machine. Each place it stands makes an instance, as an individual
// of a class in Ontology55: the pasteurizer on a farm and the one in a plant are two instances.
// A boundary routes the outputs of its instances to their inputs by name. An output takes
// the values of its input of the same name and changes only the ones it gives.
// Gaps are not written in the model. The engine compares each output's values with the
// rankings of the inputs it reaches.

export type Kind = 'system' | 'outside' | 'need' | 'rule'

export interface Flow {
  label: string
  /** The system whose output this input is. "somewhere" on an input or an output: a source or sink we do not expand. */
  from?: string
  /** The input adds up the outputs of many suppliers. */
  many?: boolean
  mark?: '+' | '~' | '?'
  /** The machine needs this input only to start ("starts with"). The others keep it running. */
  start?: boolean
  /** On an output: the values it changes. On an input: the accepted values, best first. */
  dims: Record<string, string[]>
}

export interface Machine {
  kind: Kind
  label: string
  line: number
  ins: Flow[]
  outs: Flow[]
  contains: string[]
  facts: Record<string, string>
}

/** A machine where it stands: inside one boundary, or in none. */
export interface Instance {
  machine: Machine
  up?: Instance
  kids: Instance[]
  /** The path of boundaries, such as "Dairy plant › Mixing". */
  name: string
  /** The input this instance stands for, when several inputs name its machine with "from". */
  for?: Flow
  /** The instance is the sum of many suppliers ("from many"). */
  many?: boolean
}

/** An output of an instance, with all its values: the ones it takes in and the ones it changes. */
export interface Out {
  flow: Flow
  values: Record<string, string>
}

/** One output that reaches one input. */
export interface Route {
  from: Instance
  output: Out
  to: Instance
  input: Flow
}

export interface Gap extends Route {
  dimension: string
  /** The value the output gives; undefined when the output does not name the dimension. */
  value?: string
  /** pain: accepted below the best value. refused: not accepted. unknown: the output is silent. */
  weight: 'pain' | 'refused' | 'unknown'
  /** For a pain point: how many places below the best value, and how many places there are. */
  rank?: number
  of?: number
}

export interface Machines {
  machines: Machine[]
  instances: Instance[]
  routes: Route[]
  gaps: Gap[]
  /** Outputs that leave the outer boundaries and that no input takes in. */
  /** What crosses the boundary of each instance. A boundary passes on the outputs of its machines as they are. */
  outputs: Map<Instance, Out[]>
  /** The inputs of a boundary that pass in to the inputs of its machines. */
  through: { to: Instance; input: Flow; outer: Flow }[]
  /** The outputs of machines that leave their boundary, and the output of the boundary they leave as. */
  leaves: { from: Instance; output: Out; outer: Out }[]
  /** What comes in through the boundary of each instance: its own inputs, and what its machines need that nothing inside gives. */
  inputs: Map<Instance, Flow[]>
  fog: { from: Instance; output: Out }[]
  /** Inputs that no output and no boundary gives. */
  open: { to: Instance; input: Flow }[]
  warnings: string[]
}

const KEYS = ['for', 'in', 'starts with', 'out', 'contains', 'limits', 'how', 'why']
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
// An output feeds an input of the same name, or of its last words: raw milk is milk.
const feeds = (output: string, input: string) => same(output, input) || output.toLowerCase().endsWith(' ' + input.trim().toLowerCase())
const related = (a: string, b: string) => feeds(a, b) || feeds(b, a)
const first = (dims: Record<string, string[]>) => Object.fromEntries(Object.entries(dims).map(([d, v]) => [d, v[0]]))
// "Somewhere" is a source or sink we do not expand: an input from somewhere needs no supplier
// and does not cross the boundary, and an output to somewhere needs no receiver.
const somewhere = (f: Flow) => f.from !== undefined && same(f.from, 'somewhere')
const within = (input: Flow) => Object.values(input.dims).flat().some((v) => /^within\b/i.test(v))

function flow(text: string): Flow {
  const [, mark, rest] = text.match(/^([+~?])?\s*(.+)$/)!
  const sink = rest.match(/^(.+?)\s+to\s+somewhere$/i)
  if (sink) return { label: sink[1], from: 'somewhere', mark: mark as Flow['mark'], dims: {} }
  const m = rest.match(/^(.+?)\s+from\s+(many\s+)?(.+)$/)
  return { label: m ? m[1] : rest, from: m?.[3], many: m?.[2] ? true : undefined, mark: mark as Flow['mark'], dims: {} }
}

export function parseMachines(text: string): Machines {
  const warnings: string[] = []
  const machines: Machine[] = []
  let machine: Machine | undefined
  let key: string | undefined

  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '').trimEnd()
    if (!line.trim() || line.trim().startsWith('#')) return
    const indent = line.length - line.trimStart().length
    const body = line.trim()
    if (!indent) {
      const m = body.match(/^(system|outside|need|rule)\s+(.+)$/)
      if (!m) return warnings.push(`Line ${i + 1}: “${body}” does not start with system, outside, need or rule.`)
      machines.push((machine = { kind: m[1] as Kind, label: m[2], line: i + 1, ins: [], outs: [], contains: [], facts: {} }))
      key = undefined
      return
    }
    if (!machine) return warnings.push(`Line ${i + 1}: “${body}” is not under a block.`)
    const k = KEYS.find((k) => body.toLowerCase().startsWith(k) && /^[\s:]|^$/.test(body.slice(k.length)))
    const flows = key === 'in' || key === 'starts with' ? machine.ins : key === 'out' ? machine.outs : undefined
    // Under an input or output, "d: a > b" gives its values on dimension d.
    const dim = !k && flows?.length ? body.match(/^([a-z][a-z ]*?)\s*:\s*(.+)$/i) : null
    if (dim) return (flows!.at(-1)!.dims[dim[1].toLowerCase()] = dim[2].split('>').map((v) => v.trim()))
    // A line with no statement of its own goes on with the statement above it.
    if (!k && !key) return warnings.push(`Line ${i + 1}: “${body}” is not a statement I know.`)
    if (k) key = k
    const value = k ? body.slice(k.length).replace(/^\s*:?\s*/, '') : body
    if (!value) return
    if (key === 'in') machine.ins.push(...value.split(',').map((x) => flow(x.trim())))
    else if (key === 'starts with') machine.ins.push(...value.split(',').map((x) => ({ ...flow(x.trim()), start: true })))
    else if (key === 'out') machine.outs.push(flow(value))
    else if (key === 'contains') machine.contains.push(...value.split(',').map((x) => x.trim()))
    else machine.facts[key!] = [machine.facts[key!], value].filter(Boolean).join(' ')
  })

  const named = (name: string) => machines.find((m) => same(m.label, name))
  for (const m of machines) {
    for (const c of m.contains) if (!named(c)) warnings.push(`${m.label} contains “${c}”, which the model does not have.`)
    for (const f of m.ins) if (f.from && !somewhere(f) && !named(f.from)) warnings.push(`${m.label} takes “${f.label}” from “${f.from}”, which the model does not have.`)
  }
  // ------------------------------------------------------------ instances

  const contained = (m: Machine) => machines.some((p) => p.contains.some((c) => same(c, m.label)))
  const instances: Instance[] = []
  const build = (machine: Machine, up?: Instance, made?: { input: Flow; by: Machine }): Instance => {
    const name = up ? `${up.name} › ${machine.label}` : made ? `${machine.label} (for ${made.by.label})` : machine.label
    const inst: Instance = { machine, up, kids: [], name, for: made?.input, many: made?.input.many }
    instances.push(inst)
    for (const f of machine.ins)
      if (up && f.from && !somewhere(f)) warnings.push(`${inst.name} takes “${f.label}” from “${f.from}”, but ${up.machine.label} routes the inputs of its machines; only a boundary says “from”.`)
    for (const c of machine.contains) {
      const child = named(c)
      let at: Instance | undefined = inst
      while (at && at.machine !== child) at = at.up
      if (at) warnings.push(`${inst.name} contains ${c}, which contains it.`)
      else if (child) inst.kids.push(build(child, inst))
    }
    return inst
  }
  // A supplier that several inputs name stands once for each of them: one farm for the farm
  // shop, and the many farms that the dairy plant adds up.
  const outer = machines.filter((m) => m.kind !== 'rule' && !contained(m))
  const namers = (m: Machine) => outer.flatMap((by) => by.ins.filter((input) => input.from && same(input.from, m.label)).map((input) => ({ input, by })))
  const roots = outer.flatMap((m) => (namers(m).length > 1 ? namers(m).map((made) => build(m, undefined, made)) : [build(m)]))
  const serves = (from: Instance, input: Flow) => same(input.from!, from.machine.label) && (!from.for || from.for === input)

  // ------------------------------------------------------------ routing

  // An input that names a supplier claims that supplier's output: no other input takes it by name.
  const claimed = (from: Instance, out: Out) =>
    roots.some((t) => t.machine.ins.some((i) => i.from && serves(from, i) && feeds(out.flow.label, i.label)))

  // Who gives an input. Inside a boundary: the machines beside it, the same name first, so that
  // milk goes to packing and raw milk to pasteurizing. Outside: the supplier it names, or else
  // every output of its name, which then compete.
  const supplies = (u: Instance, input: Flow): { from: Instance; output: Out }[] => {
    if (somewhere(input)) return []
    if (u.up) {
      const all = u.up.kids.filter((k) => k !== u).flatMap((from) => outputs(from).filter((o) => feeds(o.flow.label, input.label)).map((output) => ({ from, output })))
      const exact = all.filter((s) => same(s.output.flow.label, input.label))
      return exact.length ? exact : all
    }
    if (input.from) {
      const from = roots.find((r) => serves(r, input))
      return from ? outputs(from).filter((o) => feeds(o.flow.label, input.label)).map((output) => ({ from, output })) : []
    }
    return roots.filter((r) => r !== u).flatMap((from) => outputs(from).filter((o) => feeds(o.flow.label, input.label) && !claimed(from, o)).map((output) => ({ from, output })))
  }
  // An input the boundary names itself passes in, even when a machine beside it gives the
  // same: feed comes in from outside and grows on the fields. Any other input of the
  // boundary passes in only when nothing beside it gives it.
  const match = (flows: Flow[], input: Flow) => flows.find((p) => same(p.label, input.label)) ?? flows.find((p) => feeds(p.label, input.label))
  // But a machine beside it that takes the same flow in is a step on that flow: raw milk goes
  // in to mixing, and pasteurizing takes it from mixing, not from the boundary.
  const step = (u: Instance, input: Flow) => supplies(u, input).some((s) => s.from.machine.ins.some((i) => related(i.label, input.label)))
  const boundary = (u: Instance, input: Flow) =>
    u.up && !somewhere(input) && !step(u, input) ? (match(u.up.machine.ins, input) ?? (supplies(u, input).length ? undefined : match(inputs(u.up), input))) : undefined
  const needs = new Map<Instance, Flow[]>()
  function inputs(u: Instance): Flow[] {
    if (needs.has(u)) return needs.get(u)!
    const own = [...u.machine.ins]
    needs.set(u, own)
    for (const k of u.kids)
      for (const i of inputs(k))
        if (!somewhere(i) && !supplies(k, i).length && !match(own, i)) own.push({ label: i.label, dims: {} })
    return own
  }

  // First the structure, by name only. What crosses the boundary of an instance: its own
  // outputs, and what its machines give out that no machine beside them takes in. Above a
  // limit, the rest crosses too.
  const made = new Map<Instance, Out[]>()
  const base = new Map<Out, Out>()
  const maker = new Map<Out, Instance>()
  const leaves: Machines['leaves'] = []
  function outputs(u: Instance): Out[] {
    if (made.has(u)) return made.get(u)!
    const taken = (k: Instance, o: Out) =>
      u.kids.some((s) => s !== k && inputs(s).some((i) => !within(i) && supplies(s, i).some((x) => x.output === o)))
    const left = u.kids.flatMap((k) => outputs(k).filter((o) => !somewhere(o.flow) && !taken(k, o)))
    const own = u.machine.outs.map((flow): Out => ({ flow, values: {} }))
    for (const o of own) maker.set(o, u)
    // An output the boundary names itself gathers the inner outputs of that name that are left
    // over. Only when none is left over does it gather those that a machine beside them takes in
    // too: then part of it leaves. So the farm's raw milk is the cold milk from cooling, not the
    // warm milk of the herd, but the farm sells some of the calves that rearing takes in. It also
    // gathers what is left over under a related name: culled cows and bulls leave as cows and bulls.
    const gathered = new Set<Out>()
    const spare = (p: Out) => left.some((o) => same(p.flow.label, o.flow.label))
    for (const k of u.kids)
      for (const o of outputs(k)) {
        const outer =
          own.find((p) => same(p.flow.label, o.flow.label) && (left.includes(o) || !spare(p))) ??
          (left.includes(o) ? own.find((p) => feeds(o.flow.label, p.flow.label)) : undefined)
        if (outer) {
          gathered.add(o)
          if (!base.has(outer)) base.set(outer, o)
        }
        if (outer || left.includes(o)) leaves.push({ from: k, output: o, outer: outer ?? o })
      }
    const out = [...own, ...left.filter((l) => !gathered.has(l))]
    made.set(u, out)
    return out
  }
  roots.forEach(outputs)

  // Then the values. An output carries the values of the inner output it stands for, or of its
  // input of the same name or a related name, and changes the ones it gives.
  const done = new Map<Out, Record<string, string>>()
  const busy = new Set<Out>()
  const incoming = (u: Instance, input: Flow): Record<string, string> => {
    const s = supplies(u, input)
    if (s.length) return values(s[0].output)
    const b = boundary(u, input)
    return b ? incoming(u.up!, b) : {}
  }
  function values(o: Out): Record<string, string> {
    if (done.has(o)) return done.get(o)!
    if (busy.has(o)) return {}
    busy.add(o)
    const u = maker.get(o)!
    const input = u.machine.ins.find((i) => same(i.label, o.flow.label)) ?? u.machine.ins.find((i) => related(i.label, o.flow.label))
    const v = { ...(base.has(o) ? values(base.get(o)!) : input ? incoming(u, input) : {}), ...first(o.flow.dims) }
    busy.delete(o)
    done.set(o, v)
    return v
  }
  for (const o of maker.keys()) o.values = values(o)

  const routes: Route[] = []
  const open: Machines['open'] = []
  const through: Machines['through'] = []
  for (const to of instances)
    for (const input of inputs(to)) {
      const s = supplies(to, input)
      const outer = boundary(to, input)
      if (outer) through.push({ to, input, outer })
      routes.push(...s.map(({ from, output }) => ({ from, output, to, input })))
      if (!to.up && input.from && named(input.from) && !s.length) warnings.push(`${to.name}: ${input.from} gives no “${input.label}”.`)
      if (!s.length && !outer && !somewhere(input)) open.push({ to, input })
    }
  const fog = roots.flatMap((from) => outputs(from).filter((output) => !somewhere(output.flow) && !routes.some((r) => r.output === output)).map((output) => ({ from, output })))

  // ------------------------------------------------------------ gaps

  const gaps: Gap[] = []
  for (const r of routes)
    for (const [dimension, accepted] of Object.entries(r.input.dims)) {
      const value = r.output.values[dimension]
      const rank = value === undefined ? -1 : accepted.findIndex((a) => same(a, value))
      if (value === undefined) gaps.push({ ...r, dimension, weight: 'unknown' })
      else if (rank < 0) gaps.push({ ...r, dimension, value, weight: 'refused' })
      else if (rank > 0) gaps.push({ ...r, dimension, value, weight: 'pain', rank, of: accepted.length - 1 })
    }

  return { machines, instances, routes, gaps, outputs: made, inputs: needs, through, leaves, fog, open, warnings }
}
