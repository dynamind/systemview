// Every world the app can show; the first is the default.

import type { BaseState, Domain } from '../scene/model'
import { dairy } from './dairy'
import { dairyDerived } from './dairyDerived'
import { software } from './software'

export const WORLDS = [dairy, software, dairyDerived] as unknown as Domain<BaseState>[]
