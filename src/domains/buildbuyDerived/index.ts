// Build or buy again, written as statements and run on deriveLadder(). The golden
// version (../buildbuy) is laid out and scripted by hand; this one keeps its
// words, so the two can be held side by side. Where they differ, the engine decides.

import { deriveLadder } from '../../scene/ladder'

export const buildBuyDerived = deriveLadder({
  id: 'buildbuy-derived',
  title: 'Build or buy (derived)',
  intro: 'A team asks for a CRM licence. Everyone buys one; it’s just what you do.',
  want: 'back',
  leaves:
    'What does the package leave behind? It works on day one, and someone else keeps it running. It also costs a licence per seat, every year. And it was made for everyone, so it fits no one exactly: workarounds, and spreadsheets on the side. Plus a question mark: the vendor’s roadmap.',
  leavesAsk: 'What does the package leave behind?',
  another: 'Why not build our own?',
  top: 'The ladder as far as it matters here: customers who come back, kept track of the way this team sells. The licence answers that from below.',
  overview: 'The whole picture, as far as we’ve looked.',
  close: 'Generic software was a sound answer to a rule: crafting is expensive. When a rule changes, go back to the answers it shaped.',
  intents: [
    [/\bai\b|agent|llm|claude|cop[iy]lot|what.*chang/, 'rule'],
    [/build|own|custom|bespoke|craft/, 'custom'],
    [/rule|expensive/, 'another'],
  ],

  nodes: [
    // The ladder, bottom to top
    {
      id: 'package',
      kind: 'solution',
      label: 'CRM licence',
      tag: 'what they asked for',
      parent: 'track',
      relation: 'for',
      pressedBy: 'rule',
      aka: ['crm', 'package', 'licence', 'license', 'generic', 'vendor'],
      ask: 'Compare with the package',
      says: 'Back to the package. It works on day one and someone else runs it, and it costs a licence, a roadmap that isn’t ours, and a way of working bent to fit.',
      why: 'A CRM package is what teams ask for. It’s a solution, made for every team at once, and it exists for something else.',
    },
    {
      id: 'track',
      kind: 'need',
      label: 'Track customers',
      note: 'the way this team sells',
      tag: 'means',
      parent: 'back',
      relation: 'for',
      aka: ['track', 'record'],
      ask: 'What’s the CRM for?',
      says: 'What’s the CRM for? Keeping track of customers, the way this team sells.',
      why: 'Keeping track of customers, the way this team actually sells. The package knows customers; it doesn’t know this team.',
    },
    {
      id: 'back',
      kind: 'need',
      label: 'Customers who return',
      note: 'what they actually want',
      aka: ['come back', 'loyal', 'return'],
      ask: 'What’s keeping track for?',
      says: 'And that’s there for customers who come back. That’s what they actually want. The licence is one way of getting there.',
      why: 'This is what they want: customers who come back. Everything below it is one way of getting there.',
    },

    // What the package leaves behind
    { id: 'dayOne', kind: 'sink', label: 'Works on day one', valence: 'desired', parent: 'package', relation: 'left by', why: 'Install it, add users, go. Someone else wrote it, tested it and keeps it running. That’s the real strength of buying.' },
    {
      id: 'licence',
      kind: 'sink',
      label: 'Licence fees',
      note: 'per seat, every year',
      valence: 'undesired',
      parent: 'package',
      relation: 'left by',
      why: 'The bill comes every year, for every seat, whether the team uses half the features or all of them.',
    },
    {
      id: 'mismatch',
      kind: 'sink',
      label: 'Workarounds',
      note: 'spreadsheets on the side',
      valence: 'undesired',
      parent: 'package',
      relation: 'left by',
      why: 'Built for everyone, it fits no one exactly. The team bends its way of selling to the tool, and what doesn’t fit ends up in a spreadsheet.',
    },
    {
      id: 'pUnknown',
      kind: 'sink',
      label: '?',
      note: 'the vendor’s roadmap',
      valence: 'unknown',
      parent: 'package',
      relation: 'left by',
      why: 'Prices change, features go, the vendor gets bought. The roadmap is someone else’s, and so is the question mark.',
    },

    // The rule behind the choice
    {
      id: 'rule',
      kind: 'rule',
      label: 'Crafting is expensive',
      tag: 'rule · why we buy',
      note: 'agents make it cheap',
      ask: 'What does agentic AI change?',
      says: 'Agentic AI changes the rule. Crafting gets cheap: a working version in days, changed as often as the work changes. The rule that made buying sensible is weakening, and the answer it kept off the table is back on it.',
      blocked: 'Under the rule, building your own means a team and months of work before anything runs. That’s why the package won. Ask what has changed.',
      why: 'Software takes a team, months, and several tries to get right. Under that rule, buying something generic is the sensible answer.',
    },

    // The answer the rule kept off the table
    {
      id: 'custom',
      kind: 'solution',
      label: 'Our own software',
      tag: 'built to fit',
      parent: 'track',
      relation: 'for',
      ask: 'Build our own, then?',
      prelude: 'Why not build our own? Because of a rule: crafting software is expensive. It takes a team, months, and several tries to get right. Under that rule, buying generic is the sensible answer. The package is there because of the rule, not because it fits.',
      says: 'Built to fit. It follows the way this team sells, and there’s no licence. The workarounds go, and so does the vendor’s roadmap. It leaves its own: the upkeep is ours now, and a question mark. Who understands it in three years? Neither answer is clean. But the rule that decided between them has changed.',
      why: 'Software made for this team: its customers, its way of selling. Under the old rule, too slow and too dear. Under the new one, a real answer.',
    },
    { id: 'fits', kind: 'sink', label: 'Fits how we work', valence: 'desired', parent: 'custom', relation: 'left by', why: 'It follows the way the team sells, and it changes when the team does. No workarounds, no spreadsheet on the side.' },
    { id: 'noLicence', kind: 'sink', label: 'No licence fees', valence: 'desired', parent: 'custom', relation: 'left by', why: 'Nothing to pay per seat. The cost moves from a licence to the work of keeping it right.' },
    {
      id: 'upkeep',
      kind: 'sink',
      label: 'We own the upkeep',
      note: 'security, fixes, hosting',
      valence: 'undesired',
      parent: 'custom',
      relation: 'left by',
      why: 'Nobody else patches it, hosts it or answers when it breaks. Cheaper to make is not the same as free to keep.',
    },
    {
      id: 'cUnknown',
      kind: 'sink',
      label: '?',
      note: 'who understands it in three years?',
      valence: 'unknown',
      parent: 'custom',
      relation: 'left by',
      why: 'Code an agent wrote in a week still has to make sense to someone in three years. Whether it does is the new question mark.',
    },
  ],
})
