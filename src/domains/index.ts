// Every world the app can show; the first is the default.

import type { BaseState, Domain } from '../scene/model'
import { dairy } from './dairy'
import { software } from './software'

export const WORLDS = [dairy, software] as unknown as Domain<BaseState>[]
