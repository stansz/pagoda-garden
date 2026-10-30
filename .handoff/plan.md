# Garden follows real time and weather, with its controls in the corner card

## Goal

`voxel-garden/` stops having manual time and weather. Like the city page, the garden always shows a
real city's local clock and live weather, and its controls live in the corner card. The bottom bar is
removed. The checks in `tests/` are updated to cover this, and to cover the city page's saved-city
garden link.

Project facts: static site, no build step, no dependencies. `voxel-garden/index.html` loads classic
scripts `../shared/*.js` then `js/world.js`, `js/render.js`, `js/audio.js`, `js/ui.js`, `js/loop.js`,
which share one global scope. Checks are Node scripts in `tests/`.

## Files to touch

- Workstream A: `voxel-garden/index.html`, `voxel-garden/garden.css`, `voxel-garden/js/ui.js`,
  `voxel-garden/js/loop.js`, `voxel-garden/js/render.js`, `README.md`, `docs/BUILD-LOG.md`,
  `docs/REFERENCE.md`
- Workstream B: `tests/check-pages.mjs`
- Lead, integration only: `tests/golden/render.json`

## Steps

Follow the workstreams in **Parallel work**, then the integration step there.

## Acceptance

`CHECK_ATTACH=1` is already set in this environment and a browser is already running. Run from the
repository root. Only the lead runs commands 1–5, after both workstreams finish.

1. `node tests/check-focus.mjs` — exits 0, last line `all 20 checks passed`.
2. `node tests/check-pages.mjs` — exits 0, last line `all 18 checks passed`.
3. `node tests/check-render.mjs` — exits 0, last line `all 14 renders match`.
4. `node -e "const g=Object.values(require('./tests/golden/render.json'));console.log(g.length,new Set(g.map(x=>x.canvas)).size)"` — prints `14 14`.
5. `node -e "const {execSync:x}=require('child_process');const o=JSON.parse(x('git show HEAD:tests/golden/render.json')),n=require('./tests/golden/render.json');console.log(Object.keys(o).filter(k=>!k.startsWith('garden/')&&JSON.stringify(o[k])!==JSON.stringify(n[k])).length)"` — prints `0`.
6. `git grep --no-index -n -E "id=.(ui|hour|clock|cycle|infoScene).|data-wx|data-place=.local|cycleOn|manualWeather|hourInput|cycleBtn|wxBtns|showUI" -- voxel-garden` — prints nothing, exit 1.
7. `git diff --exit-code -- index.html city shared .github proto tests/browser.mjs tests/check-focus.mjs tests/check-render.mjs` — exits 0.

## Parallel work

Two workstreams. They share no files. Teammates must not run `tests/check-*.mjs` or start a browser:
one browser is shared, and only the lead uses it. Teammates validate with `node --check` only.

### Workstream A — garden behaviour (owns the Workstream A files)

Markup, `voxel-garden/index.html`:

1. Delete the whole `<div id="ui">...</div>`, and `<div class="row muted" id="infoScene" hidden></div>`.
2. Delete the `Own time` button (`data-place="local"`) from `#places`.
3. Inside `#infoBody`, after `#infoMeta`, add exactly:

```html
<div class="ctl"><span class="lbl">city</span>
  <button id="place" aria-haspopup="true" aria-expanded="false" title="Change city">Vancouver</button></div>
<div class="ctl"><span class="lbl">sound</span>
  <button id="snd" aria-pressed="false">sound</button>
  <input id="vol" type="range" min="0" max="1" step="0.01" value="0.18" aria-label="Volume"></div>
<div class="ctl"><span class="lbl">zoom</span>
  <button id="zout" aria-label="Zoom out" title="Zoom out (scroll)">&minus;</button>
  <button id="zin" aria-label="Zoom in" title="Zoom in (scroll)">+</button></div>
```

CSS, `voxel-garden/garden.css`:

4. Remove every `#ui`, `.grp`, `.lbl` and `#hour` rule, keeping `#vol{display:none}`'s phone behaviour
   by removing it too: the slider stays visible in the card. Keep `#hint{display:none}` under 620px.
5. Change `#hint` to `bottom:18px`.
6. Copy the controls styling from `city/city.css`, under the same selectors: the
   `#infoBody .ctl`, `#infoBody .ctl .lbl`, `#infoBody .ctl button`, `#infoBody #vol` rules, and the
   `button`, `button:hover`, `button[aria-pressed="true"]` and `input[type=range]` rules if the garden
   lacks them. Do not edit `city/city.css`.
7. `#places`: replace its fixed `left`, `bottom` and `transform` with `left:14px;top:auto`, and remove
   the `@media (max-width:620px){ #places{bottom:132px} }` rule. Set its position in JS (step 12).

Script, `voxel-garden/js/ui.js`, `loop.js`, `render.js`:

8. In `render.js`, `cycleOn` is removed. `hour` stays.
9. Delete from `ui.js`: `ui`, `hourInput`, `clockEl`, `cycleBtn`, `wxBtns`, `updateClock` and its call,
   `hideTimer`, `showUI` and its listeners and `setTimeout`, the `hourInput` and `cycleBtn` listeners,
   `manualWeather` and the `wxBtns` listener, and `refreshNow`'s `cycleOn` condition.
10. `setWeather(which)` keeps `currentWx`, `rainTarget` and `snowTarget`, and drops the `wxBtns` loop.
11. `placeIx` starts at `0`, never `null`. `selectPlace(ix)`: if `ix` is not a valid `PLACES` index, use
    `0`. Always `wxAuto = true`, `hour = localHour(PLACES[placeIx].tz)`, `updatePlaceLabel()`,
    `refreshPlaceWeather()`, `updateInfo()`, `savePrefs()`. Remove the `placeIx === null` branches
    throughout `ui.js`, including in `refreshPlaceWeather`, `updatePlaceLabel`, `updateInfo`,
    `refreshNow`, and the intervals. `refreshNow` always sets `hour` from the city, then refreshes.
12. `openPlaces(open)`: when opening, set `placesEl.style.left` to `Math.round(info.getBoundingClientRect().left)` px
    and `placesEl.style.top` to `Math.round(placeBtn.getBoundingClientRect().bottom + 6)` px. `info`
    is declared later in the file, so it resolves at call time: leave the declaration where it is.
13. `updatePlaceLabel()` sets `placeBtn.textContent` to `L.name + " ▾"`, with no temperature.
14. `updateInfo()`: `place` is always `PLACES[placeIx]`; `infoPlace` is its name; `infoClock` is
    `fmtHour(localHour(place.tz))`; `infoCond` is `Loading…` while loading, `—` when `placeCode` is
    null, else `condLabel(placeCode)`; `infoTemp` as today; `infoMeta` drops `Weather set by hand`.
    Remove the `infoScene` code and const. `infoRefresh` is never disabled, and its title is
    `Refresh this city now`.
15. The clock interval sets `hour = localHour(...)` every 1000 ms, and fires for the first time after
    1000 ms.
16. Prefs: `savePrefs` stores only `vol`, `zoom`, `place`, `infoOpen`, under the same `PREF_KEY`.
    `loadPrefs` reads only those, and ignores old `hour`, `cycleOn` and `wx` keys.
17. Start-up order at the bottom of `ui.js`: `loadPrefs()` restores `vol`, `zoom` and `infoOpen` only. Then
    call `selectPlace(ix)` once, where `ix` is the `?city=` index if `cityFromQuery()` matches a `PLACES`
    id, else the saved `place` if valid, else `0`. Remove `adoptCityFromQuery`.
18. In `loop.js`, delete the `if(cycleOn){...}` block in `tick`.
19. Leave `#places` buttons, the back pill, zoom keys, drag, wheel, and the audio engine as they are.

Docs:

20. `README.md`: in the Garden controls table, replace the `Time` row with
    `| Time and weather | *not controls* — the garden always follows its city's real clock and sky |`,
    add `| City | the `city` row in the card; `?city=<id>` lands on one, otherwise the last one you chose, otherwise Vancouver |`,
    and in the sentence after the table remove `Time,` and `weather,` from what is remembered.
21. `docs/REFERENCE.md`: update statements that are now wrong about the garden's controls.
22. `docs/BUILD-LOG.md`: add `## Oct 30 — the garden tells the real time too`, 3–5 sentences in the log's
    voice, directly before `## Things deliberately not done`.

Workstream A acceptance: `node --check` exits 0 for each of `voxel-garden/js/ui.js`, `loop.js`, `render.js`.

### Workstream B — checks (owns `tests/check-pages.mjs`)

In `tests/check-pages.mjs`:

1. Add `PRELUDE_WITH(storageKey, value, weatherCode = 3)`, returning a prelude that clears
   `localStorage`, sets `storageKey` to `JSON.stringify(value)`, and stubs `fetch` as `PRELUDE` does
   but with `weatherCode`. Pass `null` as `storageKey` to seed nothing.
2. `garden renders`: `#infoPlace` is now `Vancouver`.
3. Delete `garden weather buttons` and `garden time slider`.
4. Add these checks, each on a fresh load, using `until` rather than fixed waits. Top-level `let`
   variables of the page, such as `hour` and `currentWx`, are readable by `evaluate`:
   - `saved city garden link`: load `index.html` with key `pagoda-pixel-window.v1` and value
     `{ city: "toronto" }`. `PIXEL.state.city` is `toronto` and `#gardenLink` `href` contains `city=toronto`.
   - `garden manual controls gone`: on `voxel-garden/index.html`, `document.querySelector` returns null
     for each of `#ui`, `#hour`, `#clock`, `#cycle`, `[data-wx]`, `[data-place="local"]`, `#infoScene`.
   - `garden card controls`: `#place`, `#snd`, `#vol`, `#zin` and `#zout` are all descendants of `#info`.
   - `garden clock is the city's`: on `voxel-garden/index.html?city=sydney`, `#infoClock` matches
     `new Date().toLocaleTimeString("en-GB",{timeZone:"Australia/Sydney",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})`
     computed in the page, allowing one minute's difference.
   - `garden scene follows the clock`: same load; `Math.abs(hour - localHour("Australia/Sydney")) < 0.05`.
   - `garden live weather`: on `voxel-garden/index.html` with weather code `61`, `currentWx` is `rain`
     and `#infoCond` is not empty and not `Loading…`.
   - `garden remembers city`: load `voxel-garden/index.html` with key `pagoda-garden.v4` and value
     `{ place: 5 }`. `#infoPlace` is `Sydney`.
5. Keep `no uncaught page exceptions` as the last check. The total becomes 18.
6. Do not change `garden city`, `garden zoom` or `garden back link`.

Workstream B acceptance: `node --check tests/check-pages.mjs` exits 0.

### Integration, lead only

1. Run Acceptance 1 and 2. Fix failures only inside the workstreams' files, without weakening a check.
2. Run `node tests/check-render.mjs` and confirm that only `garden/-/jan` and `garden/-/jul` differ.
   If a city entry differs, stop: see **If blocked**.
3. Run `node tests/check-render.mjs --update` once.
4. Run Acceptance 3–7.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- Do not change `index.html`, `city/`, `shared/`, `proto/`, `.github/`, or any other file in `tests/`.
- `--update` may be run once, only by the lead, only at integration step 3.
- Do not run `tests/start-browser.mjs`, and do not start or stop any browser.
- Do not use full-access or wider sandbox permissions.
- No new dependencies, no build step, no ES modules.
- The report must say which workstreams were delegated, and to what.

## Out of scope

- Merging the garden's and the city's corner card or weather code.
- A collapsed-card summary line in the garden, or seasons in the garden.
- Updating the back pill when the city is changed inside the garden.
- Any visual redesign beyond what is listed.

## If blocked

If a city render differs from the baseline, a check fails after one attempt to fix it, or a named
identifier or line is not found, stop. Leave the working tree as it is and write in
`.handoff/report.md`: the step, the expected and actual values, and what you tried. If a teammate
cannot be started, say so in the report and do both workstreams yourself, in order.
