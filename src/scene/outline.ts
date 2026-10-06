// Reads a model written as an indented outline: the plain-text form we edit
// while we talk. Each block starts with a kind and a name; the indented lines
// under it are statements about that thing.
//
//   need Dairy on the table
//     for consumers
//     cares about: safe, consistent, affordable, accessible
//     uses: milk                                   what the need takes in, from competing suppliers
//
//   system Cow and bucket
//     serves Dairy on the table with fresh milk    with names the output that the need takes in
//     how: a family milks its own cow
//     leaves: + fresh milk                         + marks a wanted residue
//             spoils in a day (hurts: accessible)  hurts names the quality attributes it costs
//             ? what the cow ate                   ? marks an unknown
//             ~ methane                            ~ marks a diffuse harm: undesired, though no need names it
//
//   system Market
//     serves Dairy on the table                    another way to meet the need
//     answers spoils in a day                      one answers line for each residue
//     needs: Milk collection, Dairy plant          parts: systems that serve no need themselves
//     uses: a driver, energy                       inputs: what goes in, not what it leaves
//     uses: raw milk from Dairy farm               an input that is another system's output
//
//   rule Milk quota
//     presses on Dairy farm
//
// Statements: for, cares about, serves, needs, uses, splits from, answers, how, why, leaves,
// presses on. The colon after a statement is optional. A line that starts
// with # is a comment. Names refer to other blocks and residues by their text,
// without regard to case.

import type { EdgeDef, NodeDef, Valence } from './model'

export interface Outline {
  nodes: NodeDef[]
  edges: EdgeDef[]
  /** The first need: where the pull starts. */
  root: string
  /** Who the root need is for. */
  who: string
  /** What the model can't resolve: unknown names and attributes. */
  warnings: string[]
}

const KEYS = ['cares about', 'splits from', 'presses on', 'for', 'serves', 'needs', 'uses', 'answers', 'how', 'why', 'leaves']
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

interface Block {
  kind: 'need' | 'system' | 'rule'
  label: string
  line: number
  facts: Record<string, string[]>
}

export function parseOutline(text: string): Outline {
  const warnings: string[] = []
  const blocks: Block[] = []
  let block: Block | undefined
  let key: string | undefined
  let keyIndent = 0

  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '').trimEnd()
    if (!line.trim() || line.trim().startsWith('#')) return
    const indent = line.length - line.trimStart().length
    const body = line.trim()
    if (!indent) {
      const m = body.match(/^(need|system|rule)\s+(.+)$/)
      if (!m) return warnings.push(`Line ${i + 1}: “${body}” does not start with need, system or rule.`)
      blocks.push((block = { kind: m[1] as Block['kind'], label: m[2], line: i + 1, facts: {} }))
      key = undefined
      return
    }
    if (!block) return warnings.push(`Line ${i + 1}: “${body}” is not under a need, system or rule.`)
    // A deeper line goes on with the statement above it.
    if (key && indent > keyIndent) return block.facts[key].push(body)
    const k = KEYS.find((k) => body.toLowerCase().startsWith(k) && /^[\s:]|^$/.test(body.slice(k.length)))
    if (!k) return warnings.push(`Line ${i + 1}: “${body}” is not a statement I know.`)
    key = k
    keyIndent = indent
    const value = body.slice(k.length).replace(/^\s*:?\s*/, '')
    block.facts[k] = [...(block.facts[k] ?? []), ...(value ? [value] : [])]
  })

  // ------------------------------------------------------------ nodes

  const nodes: NodeDef[] = []
  const edges: EdgeDef[] = []
  const idOf = new Map<Block, string>()
  const attributes = new Set<string>()
  const fact = (b: Block, k: string) => b.facts[k]?.join(' ')

  for (const b of blocks) {
    const id = `${b.kind}-${slug(b.label)}`
    idOf.set(b, id)
    if (b.kind === 'need') {
      const cares = (fact(b, 'cares about') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      cares.forEach((a) => attributes.add(a.toLowerCase()))
      nodes.push({ id, kind: 'need', label: b.label, note: cares.join(' · ') || undefined, tag: fact(b, 'for') ? `need · ${fact(b, 'for')}` : 'need', why: fact(b, 'why') })
    }
    if (b.kind === 'system') nodes.push({ id, kind: 'solution', label: b.label, tag: 'system', note: fact(b, 'how'), why: fact(b, 'why') })
    if (b.kind === 'rule') nodes.push({ id, kind: 'rule', label: b.label, tag: 'rule', why: fact(b, 'why') ?? fact(b, 'how') })
  }

  // Residues hang on the system that leaves them.
  for (const b of blocks.filter((b) => b.kind === 'system')) {
    const sys = idOf.get(b)!
    for (const item of b.facts.leaves ?? []) {
      const m = item.match(/^([+?~])?\s*(.+?)\s*(?:\(hurts:?\s*([^)]*)\))?$/)!
      const [, mark, label, hurts] = m
      const costs = (hurts ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      for (const a of costs) if (!attributes.has(a.toLowerCase())) warnings.push(`“${label}” hurts “${a}”, which no need cares about.`)
      const valence: Valence = mark === '+' ? 'desired' : mark === '?' ? 'unknown' : costs.length || mark === '~' ? 'undesired' : 'neutral'
      const id = `${sys}~${slug(label)}`
      nodes.push({
        id,
        kind: 'sink',
        label: mark === '?' ? '?' : label,
        note: mark === '?' ? label : [mark === '~' && 'diffuse', costs.length && `hurts ${costs.join(', ')}`].filter(Boolean).join(' · ') || undefined,
        diffuse: mark === '~' || undefined,
        aka: mark === '?' ? [label] : undefined,
        valence,
        parent: sys,
        relation: 'left by',
      })
      edges.push({ id: `o-${id}`, from: sys, to: id, kind: 'flow', valence })
    }
  }

  // Inputs go into the system or need that uses them. Each one asks where it comes from, unless
  // the model says so: then it is the output of another system, and the flow runs from there.
  for (const b of blocks.filter((b) => b.kind !== 'rule')) {
    const sys = idOf.get(b)!
    for (const label of (b.facts.uses ?? []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)) {
      const m = label.match(/^(.+?)\s+from\s+(.+)$/)
      const maker = m && blocks.find((x) => x.kind === 'system' && same(x.label, m[2]))
      // It still stands with the other inputs, so it reads as one; the flow arrives there.
      const out = m && maker && nodes.find((n) => n.kind === 'sink' && n.parent === idOf.get(maker) && same(n.label, m[1]))
      if (m && maker && !out) warnings.push(`${b.label}: ${maker.label} leaves no “${m[1]}”.`)
      const id = `${sys}<${slug(out ? m![1] : label)}`
      const valence = out ? out.valence : 'neutral'
      nodes.push({ id, kind: 'source', label: out ? m![1] : label, note: out ? `from ${maker!.label}` : undefined, parent: sys, relation: 'input of' })
      if (out) edges.push({ id: `c-${out.id}-${id}`, from: out.id, to: id, kind: 'flow', valence })
      edges.push({ id: `i-${id}`, from: id, to: sys, kind: 'flow', valence })
    }
  }

  // ------------------------------------------------------------ references

  const N = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const find = (b: Block, name: string, kinds: Block['kind'][]) => {
    const hit = blocks.find((x) => kinds.includes(x.kind) && same(x.label, name))
    if (!hit) warnings.push(`${b.label}: no ${kinds.join(' or ')} called “${name}”.`)
    return hit && idOf.get(hit)
  }
  const residue = (b: Block, name: string) => {
    // An input can be answered too: whatever supplies it.
    const hit = nodes.find((n) => (n.kind === 'sink' || n.kind === 'source') && (same(n.label, name) || n.aka?.some((a) => same(a, name))))
    if (!hit) warnings.push(`${b.label}: no residue or input called “${name}”.`)
    return hit?.id
  }

  // A part belongs to the whole that needs it, before any residue it answers.
  for (const b of blocks.filter((b) => b.kind === 'system'))
    for (const name of (b.facts.needs ?? []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)) {
      const part = find(b, name, ['system'])
      if (!part) continue
      const whole = idOf.get(b)!
      edges.push({ id: `n-${part}-${whole}`, from: part, to: whole, kind: 'serves', fromSide: 'top', toSide: 'bottom' })
      if (!N[part].parent) (N[part].parent = whole), (N[part].relation = 'part of')
    }

  for (const b of blocks) {
    const id = idOf.get(b)!
    const n = N[id]
    if (b.kind === 'system') {
      for (const fact of b.facts.serves ?? []) {
        // "serves X with Y": the output Y is what the system delivers, into the need's input if it has one.
        const [, name, what] = fact.match(/^(.+?)(?:\s+with\s+(.+))?$/)!
        const need = find(b, name, ['need'])
        if (!need) continue
        edges.push({ id: `u-${id}-${need}`, from: id, to: need, kind: 'serves', fromSide: 'top', toSide: 'bottom' })
        if (what) {
          const out = nodes.find((x) => x.kind === 'sink' && x.parent === id && same(x.label, what))
          const port = nodes.find((x) => x.kind === 'source' && x.parent === need)?.id ?? need
          if (out) edges.push({ id: `d-${out.id}-${port}`, from: out.id, to: port, kind: 'flow', valence: out.valence })
          else warnings.push(`${b.label} leaves no “${what}”.`)
        }
        if (!n.parent || N[n.parent].kind === 'solution') (n.parent = need), (n.relation = 'serves')
      }
      for (const name of b.facts.answers ?? []) {
        const r = residue(b, name)
        if (!r) continue
        // A way to meet the need stands to the right of the residue; a part that exists for it hangs below.
        edges.push({ id: `a-${r}-${id}`, from: r, to: id, kind: 'solves', toSide: b.facts.serves?.length ? 'left' : 'top' })
        // A system that serves a need is another way to meet it, and answers the residue from the side.
        // Only a system that serves nothing exists for the residue alone.
        if (!n.parent) (n.parent = r), (n.relation = 'answers')
      }
      for (const name of b.facts['splits from'] ?? []) find(b, name, ['system'])
      if (!n.parent) warnings.push(`${b.label} serves no need, is needed by no system, and answers no residue.`)
    }
    if (b.kind === 'rule')
      for (const name of b.facts['presses on'] ?? []) {
        const sys = find(b, name, ['system'])
        if (sys) edges.push({ id: `p-${id}-${sys}`, from: id, to: sys, kind: 'pressure', fromSide: 'bottom', toSide: 'top' })
      }
  }

  const root = blocks.find((b) => b.kind === 'need')
  if (!root) warnings.push('The model has no need to start from.')
  return { nodes, edges, root: root ? idOf.get(root)! : '', who: (root && fact(root, 'for')) ?? 'people', warnings }
}
