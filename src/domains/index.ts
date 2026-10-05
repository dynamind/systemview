// Every world the app can show; the first is the default.

import type { BaseState, Domain } from '../scene/model'
import { buildBuy } from './buildbuy'
import { buildBuyDerived } from './buildbuyDerived'
import { dairy } from './dairy'
import { dairyDerived } from './dairyDerived'
import { drill } from './drill'
import { drillDerived } from './drillDerived'
import { software } from './software'

export const WORLDS = [dairy, software, dairyDerived, drill, drillDerived, buildBuy, buildBuyDerived] as unknown as Domain<BaseState>[]
