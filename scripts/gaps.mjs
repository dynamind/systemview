// Prints the routes and gaps that the engine finds in a model of function machines.
// Usage: node scripts/gaps.mjs [models/milk-machines.txt]
import { readFileSync } from 'node:fs'
import { parseMachines } from '../src/scene/machines.ts'

const file = process.argv[2] ?? 'models/milk-machines.txt'
const m = parseMachines(readFileSync(file, 'utf8'))
const by = (r) => `${r.from.name} → ${r.to.name} (${r.output.flow.label})`

for (const w of m.warnings) console.log(`warning: ${w}`)
console.log('\nroutes')
for (const r of m.routes) console.log(`  ${by(r)}`)
console.log('\ngaps')
for (const r of m.routes) {
  const gaps = m.gaps.filter((g) => g.input === r.input && g.output === r.output)
  if (!gaps.length) continue
  console.log(`  ${by(r)}`)
  for (const g of gaps)
    console.log(`    ${g.weight.padEnd(7)} ${g.dimension}: ${g.value ?? '(not named)'}${g.rank ? `  ${g.rank} of ${g.of} below the best` : ''}`)
}
console.log('\nfog: outputs that no input takes in')
for (const f of m.fog) console.log(`  ${f.from.name}: ${f.output.flow.label}`)
console.log('\nopen: inputs that no output gives')
for (const o of m.open) console.log(`  ${o.to.name}: ${o.input.label}`)
