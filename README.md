# SystemView

SystemView is a prototype for conversational systems thinking. You talk to a system map. The map grows, changes, and explains itself. A narrator can give a tour of each world.

Live version: https://play.crv4all.dev/systemview/

## Worlds

Each world is one system and one story. Select a world with the `world` URL parameter.

| URL parameter | World | How it is made |
| --- | --- | --- |
| (none) | Dairy farm | Written by hand |
| `?world=software` | Enterprise product team | Written as statements, laid out by `derive()` |
| `?world=dairy-derived` | Dairy farm | Written as statements, laid out by `derive()` |
| `?world=drill` | Hanging a picture | Written by hand |
| `?world=drill-derived` | Hanging a picture | Written as statements, laid out by `deriveLadder()` |
| `?world=buildbuy` | Build or buy | Written by hand |
| `?world=buildbuy-derived` | Build or buy | Written as statements, laid out by `deriveLadder()` |
| `?world=milk` | Milk (explore) | Written as an outline in `models/milk.txt`, laid out by `deriveExplore()` |

Other URL parameters:

- `?voice=<name>`: Play a trial voice from `public/voice-<name>/`. Refer to [Try a different voice](#try-a-different-voice).
- `?render`: Make the page silent. The render script uses this parameter.

## Prerequisites

- Node.js 24 or later
- For `npm run voice`: a Mac with Apple Silicon, [uv](https://docs.astral.sh/uv/), and ffmpeg
- For `npm run render`: Google Chrome and ffmpeg

Install ffmpeg and uv with Homebrew:

```bash
brew install ffmpeg uv
```

## Run the app

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open http://localhost:5199/ in a browser.

To do a check of the types, run `npm run typecheck`.

## Give the narration a voice

The narration uses one prerecorded audio clip for each line. The clips and a manifest are in `public/voice/`. The app uses the manifest to play the clips. The tour also uses the clip durations to set its pace. A line without a clip is silent, and the tour uses a reading time.

After you change narration text, speak the changed lines again:

```bash
npm run voice
```

The script does these steps:

1. It finds all narration lines in the source.
2. It speaks only new or changed lines. The name of each clip comes from its text and the voice.
3. It writes `public/voice/manifest.json` again.
4. It deletes clips that no line uses.

The speech comes from [Chatterbox Turbo](https://huggingface.co/mlx-community/chatterbox-turbo-fp16) on MLX. The model copies the voice in `scripts/voice-reference.flac`. The script transcribes each take with Parakeet. If a take skips or adds a word, the script tries again with a different seed and keeps the best take.

The first run downloads the models. This takes some minutes.

Do not run two voice processes at the same time.

Options:

| Option | Effect |
| --- | --- |
| `--force` | Speak all lines again. |
| `--world <id>` | Speak only the lines of one world, for example `drill`. |
| `--reference <file>` | Copy the voice in this file, not `scripts/voice-reference.flac`. |
| `--voice <name>` | Write the clips to `public/voice-<name>/`, not `public/voice/`. |

### Try a different voice

You can listen to a different voice without a change to the committed clips.

1. Record a reference clip of 15 to 20 seconds. Speak continuously, with short pauses only. The model uses the first 10 to 15 seconds most.
2. Put the file in `renders/voices/`. Git ignores this folder.
3. Speak the lines of one world in the new voice:

   ```bash
   npm run voice -- --voice roy --reference renders/voices/roy.m4a --world drill
   ```

4. Open http://localhost:5199/?world=drill&voice=roy.

Git ignores `public/voice-*/`. But `./deploy` copies all of `public/`, so a trial voice goes live if the folder exists. Delete the folder before you deploy if you do not want this.

To make a trial voice the default, replace `scripts/voice-reference.flac` and run `npm run voice -- --force`.

## Render a video

The render script records the narrated tour of the default world to an MP4 file. The page runs on a virtual clock, so each frame is exact. The script mixes in the voice clips after it records the frames.

```bash
npm run render
```

The default output is 4K, 60 fps, dark mode, in `renders/systemview-dark.mp4`.

Options:

| Option | Default | Effect |
| --- | --- | --- |
| `--res <height>` | `2160` | Output height in pixels. The aspect ratio is 16:9. |
| `--fps <n>` | `60` | Frames per second. |
| `--width <px>` | `1536` | Layout width in CSS pixels. The script scales the page up to the output size. |
| `--light` | off | Use light mode. |
| `--seconds <n>` | (full tour) | Stop early, for a quick check. |
| `--out <file>` | `renders/systemview-<scheme>.mp4` | Output file. At a height other than 2160, the default name ends in `-<height>p`. |
| `--crf <n>` | `14` | Video quality for ffmpeg. A lower value gives better quality and a larger file. |

Example of a quick check of the opening:

```bash
npm run render -- --res 1080 --seconds 20
```

## Deploy

The `deploy` script builds the app and copies `dist/` to the server with rsync. You must have SSH access to the server.

```bash
./deploy
```

To make sure the deploy worked, compare the JavaScript file name in the live `index.html` with the file name in `dist/assets/`.

## Project structure

| Path | Contents |
| --- | --- |
| `src/scene/` | The shared engine: the model, layout, animation state, story runner, and voice playback |
| `src/scene/derive.ts` | Makes a layout and a story from statements about a system |
| `src/scene/ladder.ts` | Makes a layout and a story from statements about a ladder of needs and a rule |
| `src/scene/outline.ts` | Reads a model written as an indented outline. The comment at the top gives the format. |
| `src/scene/explore.ts` | Makes a canvas to explore an outline: no script and no voice, it grows where you click |
| `models/` | Models written as outlines |
| `src/components/` | The canvas, the particle layer, and the narration panel |
| `src/domains/` | One folder for each world. `index.ts` lists the worlds. |
| `scripts/voice.mjs`, `scripts/voice.py` | The voice script |
| `scripts/render.mjs` | The video render script |
| `public/voice/` | The voice clips and their manifest |
| `renders/` | Video output and voice samples. Git ignores this folder. |
