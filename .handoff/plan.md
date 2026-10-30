# Focus garden: finished focus rounds become plants in the voxel garden

## Goal

Each finished focus round on the city page earns one seed. In `voxel-garden/`, a `seeds` pill opens a
panel where a seed kind is chosen, then a tap on a grass tile plants it. Plants grow in real time, rain
in the garden's chosen city speeds them up, and they are saved in `localStorage`. Poppies bloom any
time, moonflowers only at night, snowdrops only in snow. The garden's pond and path are restored.

Project facts: static site, no build step, no dependencies, works from `file://`.
`voxel-garden/index.html` loads classic scripts that share one global scope: `../shared/*.js`, then
`js/world.js`, `js/render.js`, `js/audio.js`, `js/ui.js`, `js/loop.js`. Top-level `let` and `const`
values are readable from other scripts and from a check's `evaluate`, but only after the declaring
script has run. Files use LF line endings. Checks are Node scripts in `tests/`.

## Files to touch

- `voxel-garden/js/plants.js` (new)
- `voxel-garden/js/world.js`
- `voxel-garden/js/ui.js`
- `voxel-garden/index.html`
- `voxel-garden/garden.css`
- `city/focus.js`
- `tests/check-plants.mjs` (new)
- `tests/golden/render.json` (only through `--update`, in step 9)
- `.github/workflows/check.yml`
- `README.md`, `docs/REFERENCE.md`, `docs/BUILD-LOG.md`

## Steps

### 1. `voxel-garden/js/world.js`

Replace `const S = makeScene("Garden", GARDEN_LAMPS, buildGarden);` with:

```js
function gardenScene(extra){
  return makeScene("Garden", GARDEN_LAMPS, P => { buildGarden(P); if(extra) extra(P); });
}
let S = gardenScene();
```

In `plot()`, key the water and path sets by `"x,z"` strings, so the pond and path draw again.

### 2. `voxel-garden/js/plants.js`

New file, starting with `"use strict";`, in the style of the other garden scripts. It must never call
`Math.random`. It runs before `ui.js`, so nothing at load time may read `currentWx`.

Constants:

```js
const PLANT_KEY = "pagoda-garden.plants.v1";
const CITY_KEY = "pagoda-pixel-window.v1";
const SPROUT_MS = 6 * 3600000, GROWN_MS = 24 * 3600000;
const PLANT_STEM = "#4c9044", PLANT_SPROUT = "#7fc25a", PLANT_BUD = "#8fb86a";
const PLANT_KINDS = {
  poppy:      { bloom: "#e0533d", opens: () => true },
  moonflower: { bloom: "#dfe6ff", opens: h => h >= 20 || h < 5 },
  snowdrop:   { bloom: "#f4f7fb", opens: (h, wx) => wx === "snow" }
};
```

State: `plants` (array of `{x, z, kind, at, rain}`, where `at` is the planted time in ms and `rain` is
watered ms), `spent` (seeds used), `plantingKind` (a kind name or `null`), `plantSig` (`""`),
`lastPlantTick` (`Date.now()`), `unsavedRain` (`0`).

Allowed tiles: at load, build `FREE`, a `Set` of `"x,z"` strings, from `S.vox`. A tile is free when its
column holds exactly one voxel, at `y === 0`, coloured `COL.grassA` or `COL.grassB`.

Functions:

- `cityMarks()`: parse `localStorage[CITY_KEY]` inside try/catch and return `session.marks` if it is a
  non-negative integer, else `0`.
- `seedCount()`: `Math.max(0, cityMarks() - spent)`.
- `loadPlants()` / `savePlants()`: read and write `PLANT_KEY` as `{ spent, plants }`, each in try/catch.
  On load, drop any plant whose kind is unknown, whose tile is not in `FREE`, or whose `at` or `rain` is
  not finite. Drop a second plant on the same tile. A missing or non-integer `spent` is `0`.
- `plantStage(p)`: `age = Date.now() - p.at + p.rain`; returns `2` if `age >= GROWN_MS`, `1` if
  `age >= SPROUT_MS`, else `0`.
- `plantVoxels(P)`, for each plant:
  - stage 0: `P.put(x, 1, z, PLANT_SPROUT)`.
  - stage 1: `P.put(x, 1, z, PLANT_STEM)`, `P.put(x, 2, z, PLANT_SPROUT)`.
  - stage 2: `PLANT_STEM` at `y` 1 and 2, then at `y` 3 the kind's `bloom` if
    `PLANT_KINDS[kind].opens(hour, currentWx)`, else `PLANT_BUD`.
- `refreshPlants()`: `sig` joins, per plant, `x`, `z`, `kind`, stage and whether it is open. If `sig`
  differs from `plantSig`: store it, set `S = gardenScene(plants.length ? plantVoxels : null)` and
  `cacheState = null`. With no plants `sig` is `""`, so the scene is never rebuilt.
- `tickPlants(ms)`: when `ms` is undefined, the elapsed time is `clamp(Date.now() - lastPlantTick, 0, 300000)`;
  otherwise it is `ms`. Set `lastPlantTick = Date.now()`. If `currentWx === "rain"`, add the elapsed
  time to every plant's `rain` and to `unsavedRain`. Call `savePlants()` and reset `unsavedRain` when
  `unsavedRain >= 60000` or when `ms` was given. Then `refreshPlants()`.
- `pickTile(cx, cy)`, from CSS pixels to a tile on the grass plane, exactly:

```js
function pickTile(cx, cy){
  const a = (cx * DPR - cam.ox) / cam.s, b = (cy * DPR - cam.oy) / cam.s;
  const c = (b + (1 - S.cy) * cam.cp) / cam.sp;
  const X = a * cam.ca + c * cam.sa, Z = c * cam.ca - a * cam.sa;
  return [Math.floor(X + S.cx), Math.floor(Z + S.cz)];
}
```

- `plantSeed(x, z, kind)`: returns `false`, changing nothing, unless `kind` is in `PLANT_KINDS`,
  `seedCount() > 0`, `"x,z"` is in `FREE`, and no plant is on that tile. Otherwise push
  `{ x, z, kind, at: Date.now(), rain: 0 }`, `spent++`, `savePlants()`, `refreshPlants()`, set
  `plantingKind = null` if `seedCount()` is now 0, `paintBed()`, return `true`.
- `paintBed()`: `#bedPill` text is `"seeds " + seedCount()`, and its `aria-expanded` follows the panel.
  Each `[data-kind]` button: `aria-pressed` is whether it is `plantingKind`; `disabled` is
  `seedCount() === 0`. `#bedNote` text, first match wins:
  - `plantingKind` set: `"Tap a patch of grass to plant a " + plantingKind + "."`
  - seeds above 0: `"Pick a seed to plant."`
  - no plants: `"A finished focus round in the city earns a seed."`
  - otherwise: `"A finished focus round earns another seed."`
- `initPlants()`: `loadPlants()`, `refreshPlants()`, `paintBed()`.

Wiring, at load:

- `#bedPill` click toggles `#bedPanel.hidden`, then `paintBed()`. Closing the panel sets
  `plantingKind = null`.
- `[data-kind]` click toggles `plantingKind` between that kind and `null`, then `paintBed()`.
- Escape: when `plantingKind` is set, clear it and `paintBed()`.
- Tap: a `pointerdown` listener on `cv` stores `{ x: clientX, y: clientY, t: performance.now() }` when
  `e.isPrimary`, and clears it otherwise. A `pointerup` listener on `cv`: when `plantingKind` is set and
  there is a stored start, with movement at most 6 px and at most 500 ms, call
  `plantSeed(...pickTile(e.clientX, e.clientY), plantingKind)`. Always clear the stored start.
- `addEventListener("storage", paintBed)` and `addEventListener("pageshow", paintBed)`.

Last line of the file:

```js
const PLANTS = {
  get: () => ({ seeds: seedCount(), planting: plantingKind,
                plants: plants.map(p => ({ ...p, stage: plantStage(p) })) }),
  plant: plantSeed, pick: pickTile, tick: tickPlants,
  open: (kind, h, wx) => PLANT_KINDS[kind].opens(h, wx)
};
```

### 3. `voxel-garden/js/ui.js`

- In the 1000 ms interval, after `updateInfo();`, add `tickPlants();`.
- After `selectPlace(startIx);` at the bottom, add `initPlants();`.

### 4. `voxel-garden/index.html`

Add `<script src="js/plants.js"></script>` between `js/audio.js` and `js/ui.js`. Directly before the
`backCity` link, add:

```html
<div id="bed">
  <div id="bedPanel" hidden>
    <div id="bedNote"></div>
    <button data-kind="poppy" aria-pressed="false">poppy &middot; any time</button>
    <button data-kind="moonflower" aria-pressed="false">moonflower &middot; at night</button>
    <button data-kind="snowdrop" aria-pressed="false">snowdrop &middot; in snow</button>
  </div>
  <button id="bedPill" aria-expanded="false" title="Seeds from your focus rounds">seeds 0</button>
</div>
```

### 5. `voxel-garden/garden.css`

Add, using the glass of `#backCity`:

- `#bed`: fixed, `right:14px;bottom:14px;z-index:6`, flex column, `align-items:flex-end`, `gap:6px`,
  same font as `#backCity`.
- `#bedPill`: the `#backCity` background, border, blur, shadow, `border-radius:999px`, `padding:6px 11px`.
- `#bedPanel`: the same glass, `width:190px;box-sizing:border-box;padding:10px;border-radius:12px`, flex
  column, `gap:5px`; `#bedPanel[hidden]{display:none}`; its buttons are `text-align:left`.
- `#bedNote`: `color:#93a6b3;font-size:11.5px;line-height:1.35`.
- `#bed button:disabled{opacity:.4;cursor:default}`.
- Under `@media (max-width:620px)`: `#bed{right:10px;bottom:10px}`.

### 6. `city/focus.js`

In `paintSession`, change only this line:

```js
else if(kind === "break") note = "a seed for the garden · " + (session.autoStart ? "next focus at " : "back at ") + sessionClock(session.endAt);
```

### 7. `tests/check-plants.mjs`

New file, in the style of `tests/check-pages.mjs`: `import { launch, until, check, report, pageUrl } from "./browser.mjs";`,
the same try/catch/finally shape, ending `process.exit(report() ? 1 : 0);`.

Prelude helper `prelude({ clear, marks, store, code = 3 })`, as a string run on every new document:

- `clear` true: `localStorage.clear()`.
- `marks` a number: sets `pagoda-pixel-window.v1` to `JSON.stringify({ session: { marks } })`.
- `store` set: sets `pagoda-garden.plants.v1` to `JSON.stringify(store)`.
- Always stubs `fetch` to answer `{ current: { weather_code: code, temperature_2m: 7, cloud_cover: 80 } }`,
  as `PRELUDE_WITH` in `tests/check-pages.mjs` does.

Times in a `store` are computed in Node with `Date.now()`. `H = 3600000`. Each check loads fresh with
`clear: true` unless stated. After a load, wait with `until` for `typeof PLANTS === "object"`. Exactly
these 15 checks, in order:

1. `no seeds yet`: load the garden with no marks. `#bedPill` text is `seeds 0`, and `PLANTS.get().plants`
   is empty.
2. `a finished round earns a seed`: load `index.html` with `clear: true`. Evaluate
   `PIXEL.session.start(25); PIXEL.session.endIn(0); PIXEL.session.tick();`, then `#focusNote` text
   contains `seed`. Load the garden with `clear: false`. `#bedPill` text becomes `seeds 1`.
3. `planting spends a seed`: `marks: 2`. `PLANTS.plant(1, 1, "poppy")` is `true`, `PLANTS.get().seeds` is
   `1`, and `S.vox` has a voxel at `[1, 1, 1]`.
4. `planting refused on water, path, pagoda and used ground`: `marks: 5`. Plant `(1, 1)` succeeds. Then
   `PLANTS.plant(x, z, "poppy")` is `false` for `(5, 5)`, `(9, 1)`, `(15, 15)`, `(1, 1)`, and seeds is `4`.
5. `no seed, no planting`: no marks. `PLANTS.plant(1, 1, "poppy")` is `false`.
6. `a plant survives a reload`: `marks: 1`, plant `(2, 1, "snowdrop")`, load the garden with
   `clear: false` and `marks: 1`. One plant with kind `snowdrop`, seeds is `0`.
7. `a tap plants on the tile under it`: `b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })`
   before the load, so the view holds still. `marks: 1`, load, wait for two frames. Evaluate
   `document.getElementById("bedPill").click(); document.querySelector('[data-kind="poppy"]').click();`.
   Compute the tile's centre in the page: `project(10.5, 1, 18.5)`, each coordinate divided by `DPR`.
   Send real input with `b.send("Input.dispatchMouseEvent", ...)`: `mouseMoved`, `mousePressed` and
   `mouseReleased` at that point, `button: "left"`, `clickCount: 1`. Then `until` one plant exists at
   `x === 10, z === 18`, `seeds` is `0` and `planting` is `null`.
8. `a drag plants nothing`: same set-up, `marks: 1`. `mousePressed` at that point, `mouseMoved` 60 px to
   the right with `buttons: 1`, `mouseReleased` there. No plants, `seeds` is `1`, and `planting` is
   `poppy`. Afterwards `b.send("Emulation.setEmulatedMedia", { features: [] })`.
9. `plants grow with time`: `store` with `spent: 0` and three poppies at `(1, 1)`, `(2, 1)`, `(3, 1)`,
   `rain: 0`, `at` of now minus `1 * H`, `7 * H`, `25 * H`. The stages are `0, 1, 2`. In `S.vox`, each
   column's highest `y` is `1, 2, 3`.
10. `rain waters plants`: weather `code: 61`, `store` with one poppy, `at` now minus `5.5 * H`, `rain: 0`.
    Wait for `currentWx === "rain"`. Stage is `0`. Evaluate `PLANTS.tick(H)`. Stage is `1`, and the
    plant's `rain` is at least `H`.
11. `dry weather does not`: default code, same `store`. Wait for `#infoCond` to stop being `Loading…`.
    Evaluate `PLANTS.tick(H)`. Stage is `0`, and `rain` is `0`.
12. `bloom rules`: on the garden, evaluate `PLANTS.open` and require: `poppy` at `(12, "clear")` true;
    `moonflower` at `(23, "clear")` true, `(3, "clear")` true, `(12, "clear")` false; `snowdrop` at
    `(12, "snow")` true, `(12, "clear")` false.
13. `a bloom shows in the scene`: `store` with one snowdrop at `(1, 1)`, `at` now minus `25 * H`. In one
    `evaluate`: `setWeather("snow"); PLANTS.tick(0);` then read the colour of the voxel at `[1, 3, 1]`;
    `setWeather("clear"); PLANTS.tick(0);` then read it again. The readings are
    `PLANT_KINDS.snowdrop.bloom` and `PLANT_BUD`.
14. `bed panel`: `marks: 1`. `#bedPanel` is hidden. After clicking `#bedPill` it is not hidden, and
    `#bedPanel [data-kind]` matches 3 buttons, none disabled. With `elementFromPoint` at the pill's
    centre, the element is the pill or inside it.
15. `no uncaught page exceptions`: `exceptions.length === 0`, or show the first three.

### 8. CI and docs

- `.github/workflows/check.yml`: add `- run: node tests/check-plants.mjs` after the `check-pages.mjs` line.
- `README.md`:
  - In the Garden controls table, after the `City` row, add
    `| Seeds | each finished focus round in the city earns one; the \`seeds\` pill picks what to plant, then tap the grass |`.
  - Add `Plants and seeds spent` to the list of remembered things in the sentence after the table.
  - Change the `voxel-garden/js/` line in the layout listing to name `world, render, audio, plants, ui, loop`.
  - Add a short paragraph after the `check-pages.mjs` paragraph describing `node tests/check-plants.mjs`.
- `docs/REFERENCE.md`: change the `voxel-garden/js/` line to the same list. Under `## 2. Garden`, add a
  `### Plants` subsection, 4–6 lines: seeds are `session.marks` minus `spent`, storage key, growth
  thresholds, rain, bloom rules, and that the scene is rebuilt only when `refreshPlants` sees a change.
- `docs/BUILD-LOG.md`: add `## Oct 30 — the garden starts to grow`, 3–5 sentences in the log's voice,
  directly before `## Things deliberately not done`.

### 9. Baseline

1. Run Acceptance 1–3.
2. Run `node tests/check-render.mjs`. Confirm that all 12 `index/...` entries pass, and that only
   `garden/-/jan` and `garden/-/jul` differ: their text because of the `seeds 0` pill, their canvas
   because the pond and path are back. Anything else: see **If blocked**.
3. Run `node tests/check-render.mjs --update` once.
4. Run Acceptance 4–9.

## Acceptance

`CHECK_ATTACH=1` is already set in this environment and a browser is already running. Run from the
repository root.

1. `node tests/check-focus.mjs` — exits 0, last line `all 20 checks passed`.
2. `node tests/check-pages.mjs` — exits 0, last line `all 21 checks passed`.
3. `node tests/check-plants.mjs` — exits 0, last line `all 15 checks passed`.
4. `node tests/check-render.mjs` — exits 0, last line `all 14 renders match`.
5. `node -e "const {execSync:x}=require('child_process');const o=JSON.parse(x('git show HEAD:tests/golden/render.json')),n=require('./tests/golden/render.json');console.log(Object.keys(o).filter(k=>k.startsWith('index/')&&o[k].canvas!==n[k].canvas).length,Object.keys(o).filter(k=>k.startsWith('index/')&&o[k].text!==n[k].text).length)"` — prints `0 0`.
6. `node --check voxel-garden/js/plants.js && node --check voxel-garden/js/world.js && node --check voxel-garden/js/ui.js && node --check tests/check-plants.mjs` — exits 0.
7. `git diff --numstat -- city/focus.js` — prints `1`, `1` and the path.
8. `git diff --exit-code -- index.html shared proto city/ui.js city/core.js tests/browser.mjs tests/start-browser.mjs tests/check-focus.mjs tests/check-pages.mjs tests/check-render.mjs voxel-garden/js/render.js voxel-garden/js/loop.js voxel-garden/js/audio.js` — exits 0.
9. `grep -c "Math.random" voxel-garden/js/plants.js` — prints `0`.

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- `--update` may be run once, only at step 9.3.
- Do not run `tests/start-browser.mjs`, and do not start or stop any browser.
- Do not use full-access or wider sandbox permissions.
- No new dependencies, no build step, no ES modules.
- New files use LF line endings. Do not change the line endings of existing files.

## Out of scope

- Removing, moving or harvesting plants.
- Showing the seed count on the city page, other than the one note in step 6.
- Rain that fell while the garden page was closed.
- Visitors, characters, walking or dialogue.
- Plants in the city page's pixel view.
- Audio for planting or blooming.
- Fixing the stale `weather buttons, time slider` wording in `README.md`.

## If blocked

If a city render or a garden canvas hash differs from the baseline, a check fails after one attempt to
fix it, or a named identifier or line is not found, stop. Leave the working tree as it is and write in
`.handoff/report.md`: the step, the expected and actual values, and what you tried.
