// Every world the app can show; the first is the default.

import type { BaseState, Domain } from '../scene/model'
import { buildBuy } from './buildbuy'
import { dairy } from './dairy'
import { dairyDerived } from './dairyDerived'
import { drill } from './drill'
import { software } from './software'

export const WORLDS = [dairy, software, dairyDerived, drill, buildBuy] as unknown as Domain<BaseState>[]
