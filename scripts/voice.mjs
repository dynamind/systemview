// Gives the narration a voice: one audio clip per line, plus a manifest the app
// uses to play them and to pace the tour by how long each line actually takes.
//
//   npm run voice              speak new or changed lines, drop clips no line uses
//   npm run voice -- --force   speak every line again
//
// Lines are found in the source: every string literal passed to say() or as the
// text of why() in useStory.ts, and every `why` in world.ts. A clip is named
// after its text and the voice, so editing a line only re-speaks that line.
//
// Speech comes from scripts/voice.py (Chatterbox Turbo on MLX, cloning
// scripts/voice-reference.flac). Needs uv and ffmpeg; Apple Silicon only.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import ts from 'typescript'

const { values: opt } = parseArgs({ options: { force: { type: 'boolean', default: false } } })
const DIR = 'public/voice'
const MANIFEST = join(DIR, 'manifest.json')
const REFERENCE = 'scripts/voice-reference.flac'
const MODEL = 'chatterbox-turbo-fp16' // keep in step with voice.py; part of every clip's name

// ------------------------------------------------------------ find the lines

const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
const prop = (obj, name) => obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === name)?.initializer

/** Every object literal in world.ts that has an id, as { id: { key: text } }. */
function nodesIn(src) {
  const nodes = []
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node) && prop(node, 'id') && ts.isStringLiteral(prop(node, 'id'))) {
      const fields = {}
      for (const p of node.properties) if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) fields[p.name.getText()] = p.initializer.text
      nodes.push(fields)
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return nodes
}

/**
 * All texts an expression can produce: string literals, constants, both arms of
 * a ternary or ??, and templates over `NODES[id].label`, which only ever name a
 * hypothesis (promote() is the one place that does this).
 */
function texts(node, consts, nodes) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text]
  if (ts.isIdentifier(node)) return consts.has(node.text) ? [consts.get(node.text)] : []
  if (ts.isParenthesizedExpression(node)) return texts(node.expression, consts, nodes)
  if (ts.isConditionalExpression(node)) return [...texts(node.whenTrue, consts, nodes), ...texts(node.whenFalse, consts, nodes)]
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    return [...texts(node.left, consts, nodes), ...texts(node.right, consts, nodes)]
  if (ts.isTemplateExpression(node) && node.templateSpans.every((s) => /^NODES\[\w+\]\.label$/.test(s.expression.getText())))
    return nodes
      .filter((n) => n.kind === 'hypothesis')
      .map((n) => node.head.text + node.templateSpans.map((s) => n.label + s.literal.text).join(''))
  return []
}

const story = parse('src/scene/useStory.ts')
const world = parse('src/scene/world.ts')
const nodes = nodesIn(world)
const consts = new Map()
for (const s of story.statements)
  if (ts.isVariableStatement(s))
    for (const d of s.declarationList.declarations)
      if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteral(d.initializer)) consts.set(d.name.text, d.initializer.text)

const found = []
const visit = (node) => {
  if (ts.isCallExpression(node)) {
    const callee = node.expression
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
    const arg = name === 'say' ? node.arguments[0] : name === 'why' ? node.arguments[1] : undefined
    if (arg) found.push(...texts(arg, consts, nodes))
  }
  ts.forEachChild(node, visit)
}
visit(story)
for (const n of nodes) if (n.why) found.push(n.why)
const lines = [...new Set(found)]

// ------------------------------------------------------------ what needs speaking

const voiceId = createHash('sha1').update(readFileSync(REFERENCE)).update(MODEL).digest('hex')
const fileFor = (text) => createHash('sha1').update(voiceId).update(text).digest('hex').slice(0, 12) + '.m4a'

mkdirSync(DIR, { recursive: true })
const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')).lines : {}
const todo = lines.filter((t) => opt.force || old[t]?.file !== fileFor(t) || !existsSync(join(DIR, fileFor(t))))
console.log(`${lines.length} lines, ${todo.length} to speak`)

const run = (cmd, args, input) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'inherit'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}`))))
    if (input) p.stdin.end(input)
  })

if (todo.length) {
  const tmp = join(tmpdir(), `systemview-voice-${process.pid}`)
  mkdirSync(tmp, { recursive: true })
  const items = todo.map((text, i) => ({ text, out: join(tmp, `${i}.wav`) }))
  await run('uv', ['run', '--quiet', 'scripts/voice.py'], JSON.stringify({ reference: REFERENCE, items }))
  for (const { text, out } of items)
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-ac', '1', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', join(DIR, fileFor(text))])
  rmSync(tmp, { recursive: true, force: true })
}

// ------------------------------------------------------------ manifest

const duration = async (file) =>
  Number(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(DIR, file)]))

const manifest = {}
for (const text of lines) {
  const file = fileFor(text)
  manifest[text] = { file, duration: old[text]?.file === file && !todo.includes(text) ? old[text].duration : Math.round((await duration(file)) * 1000) }
}
writeFileSync(MANIFEST, JSON.stringify({ lines: manifest }, null, 1) + '\n')

const used = new Set(Object.values(manifest).map((m) => m.file))
for (const f of readdirSync(DIR)) if (f.endsWith('.m4a') && !used.has(f)) rmSync(join(DIR, f))
console.log(`→ ${MANIFEST}`)
