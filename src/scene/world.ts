// The world on show, picked once per page load (?world=software), and the
// shared vocabulary bound to it. Components read the world from here.

import { WORLDS } from '../domains'
import { lineage as chain, type EdgeDef, type NodeDef } from './model'

export * from './model'

const wanted = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('world')
export const domain = WORLDS.find((w) => w.id === wanted) ?? WORLDS[0]
export const NODES = domain.NODES
export const EDGES = domain.EDGES

export const lineage = (id: string) => chain(NODES, id)

/** Residue left behind by a solution: undesired outputs (diffuse ones weigh more) and fog. */
export function residueOf(solutionId: string, visible: Record<string, unknown>): { kind: 'undesired' | 'diffuse' | 'unknown' }[] {
  return EDGES.filter((e: EdgeDef) => e.from === solutionId && e.kind === 'flow' && visible[e.to])
    .map((e) => NODES[e.to] as NodeDef)
    .filter((n) => n.valence === 'undesired' || n.valence === 'unknown')
    .map((n) => ({ kind: n.valence === 'unknown' ? 'unknown' : n.diffuse ? 'diffuse' : 'undesired' }))
}

/** Links to every world, keeping the rest of the query (?render and the like). */
export const WORLD_LINKS = WORLDS.map((w, i) => {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  if (i === 0) q.delete('world')
  else q.set('world', w.id)
  const qs = q.toString()
  return { id: w.id, title: w.title, href: qs ? `?${qs}` : '.' }
})
