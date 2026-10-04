import type { Domain } from '../../scene/model'
import { dairyScript } from './story'
import { compose, EDGES, initialState, NODES, type SceneState } from './world'

export const dairy: Domain<SceneState> = {
  id: 'dairy',
  title: 'Dairy farm',
  goal: 'make a living from milk',
  system: 'farm',
  NODES,
  EDGES,
  initialState,
  compose,
  script: dairyScript,
}
