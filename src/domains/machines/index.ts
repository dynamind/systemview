// The milk model in function machine terms, read from models/milk-machines.txt. Edit the text, not this file.

import { deriveMachines } from '../../scene/machineWorld'
import text from '../../../models/milk-machines.txt?raw'

export const machines = deriveMachines({ id: 'machines', title: 'Milk machines', text })
