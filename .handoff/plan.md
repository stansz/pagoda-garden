# Split the two big pages into plain script files, with no behaviour change

## Goal

Move the inline CSS and JavaScript of `index.html` and `voxel-garden/index.html` into separate files
loaded with classic `<script src>` and `<link rel="stylesheet">` tags, and move the code that is
byte-identical in both pages into `shared/`. Every render must stay pixel-identical to
`tests/golden/render.json`. The pages must keep working from `file://`, so no `type="module"`, no
`import`/`export`, no build step.

## Files to touch

- `index.html`, `voxel-garden/index.html`
- New: `city/`, `city/cities/`, `voxel-garden/js/`, `shared/`, and the files listed in Steps
- `README.md`, `docs/BUILD-LOG.md`, `docs/REFERENCE.md`

## Steps

Facts about how this works: all classic scripts on a page share one global scope, so top-level
`const`, `let` and functions in one file are visible to later files. Keep the existing evaluation
order: every file below is a contiguous slice of the original inline script, in original order.
A function is only hoisted within its own file, so a top-level statement that *calls* a function
from a later file will throw at load (see step 5).

Move code by cutting exact text. Do not reformat, rename, reorder or reword anything. A throwaway
script outside the repository is the recommended way to cut slices; do not commit or leave it in the
repository. Each new `.js` file starts with `"use strict";` then a blank line.

### 1. City page script

Boundaries are comment markers in `index.html`, matched by their text. Each slice runs from its
marker up to the next slice's marker. The script's opening `"use strict";` line is dropped from the
slice because every file gets its own.

| File | Starts at marker |
| --- | --- |
| `city/core.js` | the comment `Pixel garden — a low-resolution framebuffer` (start of script) |
| `city/draw.js` | `framebuffer setup` |
| `city/build.js` | the comment `Baked city art.  Each city paints three` |
| `city/cities/vancouver.js` | `Vancouver: ridge + firs` |
| `city/cities/toronto.js` | `Toronto: the tower` |
| `city/cities/hawaii.js` | `Hawai'i: Diamond Head + palms` |
| `city/cities/hongkong.js` | `Hong Kong: dense tower wall` |
| `city/cities/amsterdam.js` | `Amsterdam: gables, canal, bridge` |
| `city/cities/sydney.js` | `Sydney: the sails and the arch` |
| `city/trees.js` | the comment `The source trees.  One species per city` |
| `city/island.js` | the comment `The garden: the one thing every city shares` |
| `city/frame.js` | the comment `Per-frame painting: sky, water, weather` |
| `city/audio.js` | the comment `Sound: a port of relax.html's ambient engine` |
| `city/ui.js` | the comment `UI: bottom bar, corner card, city clocks` |
| `city/focus.js` | the comment `Focus session — a timekeeper` |
| `city/menu.js` | `city dropdown` |
| `city/pixel.js` | `headless hook for the harness`, through the final `boot();` line |

For a marker inside a multi-line `/* === ... === */` banner, the slice starts at the banner's first
line. If a marker comment's text differs slightly from this table, use the closest matching section
heading and note it in the report.

Replace the inline `<script>` in `index.html` with one `<script src="...">` per file, in table order,
after the `shared/` scripts from step 4. Use relative paths with no leading `./`, for example
`city/core.js`.

### 2. Garden page script

Same method, in `voxel-garden/index.html`, with `/* --- name --- */` section markers:

| File | Starts at marker |
| --- | --- |
| `voxel-garden/js/world.js` | start of the script, through the `camera` section |
| `voxel-garden/js/render.js` | `time / mood` |
| `voxel-garden/js/audio.js` | `audio` |
| `voxel-garden/js/ui.js` | `UI` |
| `voxel-garden/js/loop.js` | `loop`, through the end of the script |

Replace the inline `<script>` with one `<script src>` per file in table order, after the `shared/`
scripts, for example `js/world.js`.

### 3. CSS

Move the contents of the inline `<style>` of `index.html` to `city/city.css`, and of
`voxel-garden/index.html` to `voxel-garden/garden.css`, unchanged. Replace each `<style>` block with
`<link rel="stylesheet" href="city/city.css">` or `<link rel="stylesheet" href="garden.css">`.

### 4. Shared code

These top-level definitions are byte-identical in both pages. Remove them from the city and garden
files and put one copy, unchanged, in the `shared/` file named here:

- `shared/time.js`: `clamp`, `pad2`, `MOOD`, `moodAt`, `ownHour`
- `shared/weather.js`: `wxToCode`, `condLabel`
- `shared/audio.js`: `makeImpulse`, `makeNoise`

Keep any comment directly above a moved definition with it. Load order on both pages: `shared/time.js`,
`shared/weather.js`, `shared/audio.js`, then the page's own files. The city page uses `shared/...`; the
garden page uses `../shared/...`.

Any dependency these definitions need (for example `lerp`) stays where it is, provided it resolves at
call time. If one is called at load time, apply step 5.

Do not merge anything else. Functions with the same name but different bodies stay separate in each
page: `localHour`, `fmtHour`, `weatherKind`, `updateInfo`, `updateAudio`, `audioInit`, `pluck`,
`savePrefs`, `loadPrefs`, and the rest.

### 5. Load-order failures

If a page throws at load because a top-level statement uses a function or value from a later file,
move only that function or value to the earlier file, unchanged, at the end of the file that needs it.
Do not change the file order, wrap anything in a function, add `typeof` guards, or use `defer`.
List each such move in the report.

### 6. Docs

- `README.md`: update the "Pixel city view" and "Repository layout" text, and the "Running it locally"
  sentence that calls the pages single self-contained HTML files, to describe the new layout. Keep:
  no build step, no dependency, works from `file://`.
- `docs/REFERENCE.md`: update only statements that are now wrong about where code lives.
- `docs/BUILD-LOG.md`: add `## Oct 30 — one file became many` with 3–5 sentences in the log's voice,
  directly before `## Things deliberately not done`, and in that list change the
  `**No modular split yet.**` item to say the pages are split into classic scripts, which keeps
  `file://`, and that ES modules remain deliberately unused.

## Acceptance

`CHECK_ATTACH=1` is already set in this environment and a browser is already running for the checks.
Run from the repository root.

1. `node tests/check-focus.mjs` — exits 0, last line `all 20 checks passed`.
2. `node tests/check-pages.mjs` — exits 0, last line `all 14 checks passed`.
3. `node tests/check-render.mjs` — exits 0, last line `all 14 renders match`.
4. `git diff --exit-code -- tests .github proto` — exits 0.
5. `grep -c "function " index.html voxel-garden/index.html` — prints `index.html:0` and `voxel-garden/index.html:0`.
6. `grep -c "<script src=" index.html` — prints `20`.
7. `grep -c "<script src=" voxel-garden/index.html` — prints `8`.
8. `grep -rlE "^(function clamp|function moodAt|function makeNoise|function condLabel)\b" city voxel-garden shared` — prints only files under `shared/`.
9. `grep -rlE "type=.module|^(import|export) " city shared voxel-garden` — prints nothing.

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- Never run `tests/check-render.mjs --update`, and never change `tests/`. A render mismatch means the
  refactor changed something: find it and fix the refactor.
- Do not run `tests/start-browser.mjs` or start or stop any browser. Use the running one through the
  checks.
- No behaviour, text, styling or logic changes. Do not fix bugs you notice; list them in the report.
- Keep the HTML body markup of both pages unchanged.
- No new dependencies, no build step, no ES modules.
- Do not use full-access or wider sandbox permissions.

## Out of scope

- Merging code that differs between the pages (corner card, weather fetch, prefs, audio engine).
- Bringing the garden's controls in line with the city view.
- Changes to `proto/`, shrinking images, or new tests.

## If blocked

If a check still fails after step 5, or a slice boundary cannot be found, stop. Leave the working tree
as it is and write in `.handoff/report.md`: the failing check, its expected and actual values, the file
and line of any exception, and what you tried. If `node tests/check-focus.mjs` reports it cannot reach
the browser, stop and report that; do not try to start one.
