// The milk system of systems, read from models/milk.txt. Edit the text, not this file.

import { deriveExplore } from '../../scene/explore'
import text from '../../../models/milk.txt?raw'

export const milk = deriveExplore({ id: 'milk', title: 'Milk (explore)', text })
