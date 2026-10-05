# Instructions for agents

Read `README.md` first. It tells you how to run, voice, render, and deploy the app.

## Writing

- Write documentation, commit messages, and code comments in Simplified Technical English. Use short sentences, the active voice, and one instruction for each sentence.
- Use US spelling in documentation, commit messages, and code comments.
- Narration text in the worlds uses British spelling at the moment. Do not change it unless you are told to.
- Match the style of the code around your change. Comments say why, not what.

## Commits and deploys

- Commit and push only when you are told to.
- Write commit messages as one plain sentence that tells what changed and why.
- `./deploy` is permitted when you are told to deploy. After a deploy, compare the JavaScript file name in the live `index.html` with the file name in `dist/assets/`.
- Do not deploy while a trial voice folder (`public/voice-*/`) exists, unless you are told to.

## Narration and voice

- After you change narration text, run `npm run voice`. Commit the changed clips and `public/voice/manifest.json` with the text.
- Run only one voice process at a time.
- The voice script finds the dairy lines in `say()` and `why()` calls in its source. All other worlds give their lines with `lines()`. If `lines()` does not return a line, that line has no clip.

## Worlds

- A world is a `Domain` (refer to `src/scene/model.ts`). Add new worlds to `WORLDS` in `src/domains/index.ts`.
- Hand-written worlds place their nodes with `placer()` and call `finish()` to make the edges.
- Derived worlds give statements only. `derive()` makes the layout and the story.

## Checks

- Run `npm run typecheck` before you commit.
- To check visual changes, run the dev server on port 5199 (`.claude/launch.json`) and look at the result in a browser.
