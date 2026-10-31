# The Far Light: a choose-your-own-adventure in the Vancouver city view

## Goal

On the Vancouver city page, a small light blinks on the far shore. Clicking it opens a story panel over
the art: a choose-your-own-adventure with a satchel of items and a journal. Some choices lock to
Vancouver's real clock, weather and season, and some to plants grown in the garden. Finishing the story
gives a rare lantern seed, which is planted in the garden and unlocks an epilogue when grown. The story
data is already written and is copied in unchanged. The light hides during a focus round, so the game
never competes with the timer.

Project facts: static site, no build step, no dependencies, works from `file://`. Both pages load classic
scripts that share one global scope: top-level `let` and `const` values are readable from other scripts
and from a check's `evaluate`, but only after the declaring script has run. Files use LF line endings.
Checks are Node scripts in `tests/`. `tests/check-render.mjs` hashes the `#scene` canvas and
`document.body.innerText`, so text in a `hidden` element or a CSS `::after` does not change a hash, but
text in a visible element does.

## Files to touch

- `city/stories/vancouver.js` (new, a byte-for-byte copy of `.handoff/story-vancouver.js`)
- `city/walk.js` (new)
- `city/city.css`
- `city/ui.js` (one line in `measure()`)
- `index.html`
- `voxel-garden/js/plants.js`
- `voxel-garden/js/world.js`
- `voxel-garden/index.html`
- `voxel-garden/garden.css`
- `tests/check-story.mjs` (new)
- `tests/check-walk.mjs` (new)
- `tests/check-plants.mjs` (one selector, step 6)
- `.github/workflows/check.yml`
- `README.md`, `docs/REFERENCE.md`, `docs/BUILD-LOG.md`

## Steps

### 1. Copy the story

Copy `.handoff/story-vancouver.js` to `city/stories/vancouver.js` with
`node -e "require('fs').mkdirSync('city/stories',{recursive:true});require('fs').copyFileSync('.handoff/story-vancouver.js','city/stories/vancouver.js')"`.
Do not edit a single character of it, in either place.

Read it before writing the engine. Its shape:

```text
STORY.vancouver = { title, start, finish, items, goal, pages, scenes }
items[id]   = { name, note, plant? }
goal        = { title, show: flag, done: flag, items: [item ids] }
pages[id]   = { title, text, secret? }
scenes[id]  = { place, text: [line], choices: [choice] }
line        = string, or { if: cond, t: string }
choice      = { label, to, end?, show?: cond, if?: cond, hint?, now?, say?, give?: [], take?: [], set?: [], page? }
cond        = an object whose keys must all hold:
  night (hour >= 20 or < 5), nine (21 <= hour < 22), dawn (5 <= hour < 8), rain, snow, fog   true or false
  season    "spring" | "summer" | "autumn" | "winter"
  has       item id or array: all are held
  lacks     item id or array: none are held
  flag      flag or array: all are set
  noflag    flag or array: none are set
  grown     "any" or a plant kind: the garden has a grown plant of that kind
```

A choice with `end: true` has no `to`. A choice whose `show` fails is not displayed. A choice whose `show`
holds and whose `if` fails is displayed but disabled, with its `hint`. While its `if` holds, its `now` (if
any) is displayed beside it. `{time}`, `{cond}` and `{temp}` are tokens in text.

### 2. `index.html`

Add, directly after the `#gardenLink` element:

```html
<button id="walkLight" aria-label="Follow the light across the water" title="A light across the water" hidden></button>
```

Add, directly before `<div id="focusLine"`:

```html
<div id="walk" role="dialog" aria-modal="true" aria-labelledby="walkPlace" hidden>
  <div id="walkPanel">
    <div id="walkTop">
      <span id="walkPlace"></span>
      <button id="walkClose" aria-label="Close">&times;</button>
    </div>
    <div id="walkTabs" role="group" aria-label="Walk views">
      <button data-walk-tab="story" aria-pressed="true">story</button>
      <button data-walk-tab="satchel" aria-pressed="false">satchel</button>
      <button data-walk-tab="journal" aria-pressed="false">journal</button>
    </div>
    <div id="walkBody" aria-live="polite"></div>
    <div id="walkChoices"></div>
  </div>
</div>
```

Load the scripts between `city/focus.js` and `city/menu.js`, in this order:

```html
<script src="city/walk.js"></script>
<script src="city/stories/vancouver.js"></script>
```

### 3. `city/walk.js`

New file, starting with `"use strict";`, in the style of `city/focus.js`. It never calls `Math.random`. It
runs before `city/stories/vancouver.js`, `menu.js` and `pixel.js`, so at load time it may only declare
things, add event listeners and start the `setInterval` named below.

Constants and state:

```js
const STORY = {};
const WALK_KEY = "pagoda-walk.v1";
const GARDEN_KEY = "pagoda-garden.plants.v1";
const GROWN_AFTER_MS = 24 * 3600000;          // the garden's GROWN_MS
let walk = null;                              // { at, items, flags, pages } of the current city
let walkTab = "story";
let walkFlash = [];                           // lines to show once, above the next scene
let walkFake = null;                          // test override of the world
```

Functions:

- `walkStory()` returns `STORY[state.city] || null`.
- `loadWalk()` reads `WALK_KEY`, which holds `{ [cityId]: { at, items, flags, pages } }`, inside try/catch.
  For a city with no story, `walk = null`. Otherwise it keeps only known item ids, known page ids and
  strings in `flags`, and uses the story's `start` when `at` is not a scene.
- `saveWalk()` re-reads the whole object, replaces this city's entry, and writes it, inside try/catch.
- `walkWorld()` returns `{ hour, wx, fog, season }`: `cityNow()`, `state.wx`,
  `placeCode === 45 || placeCode === 48`, `state.season`, with each field of `walkFake` winning when set.
- `gardenPlants()` reads `GARDEN_KEY` inside try/catch and returns its `plants` array, or `[]`.
- `gardenGrown(kind)` is true when a plant with finite `at` and `rain` has
  `Date.now() - at + rain >= GROWN_AFTER_MS` and either `kind === "any"` or `p.kind === kind`.
- `walkHolds(cond)` implements the `cond` table in step 1. An absent `cond` holds.
- `walkTokens(s)` replaces `{time}` with `fmtHour(cityNow())`, `{cond}` with
  `condLabel(placeCode).toLowerCase()` (or `the sky not saying` when `placeCode === null`), and `{temp}`
  with `", " + placeTemp + " degrees"` (or nothing when `placeTemp === null`).
- `walkChoices()` returns the current scene's displayed choices, each as
  `{ c, enabled: walkHolds(c.if) }`.
- `walkPaint()` paints the panel:
  - `#walkPlace` is the scene's `place` on the story tab, otherwise the story's `title`.
  - The tabs read `story`, `satchel` and `satchel N`, `journal` and `journal N`, with N shown when above
    zero, and `aria-pressed` follows `walkTab`.
  - Story tab: `#walkBody` gets one `<p class="walk-say">` per `walkFlash` entry that came from a `say`,
    one `<p class="walk-got">` per gain, then one `<p>` per scene line whose `if` holds, through
    `walkTokens`. All text goes through `textContent`. `walkFlash` is cleared after painting.
    `#walkChoices` gets one button per displayed choice, numbered `1.`, `2.` and so on in a
    `<span class="walk-n">`, then the label. A disabled choice has `disabled` and a
    `<small class="walk-hint">` with its hint. An enabled choice with a `now` has
    `<small class="walk-now">` with it, but only when its `if` is present. Focus moves to the first
    enabled button with `{ preventScroll: true }`.
  - Satchel tab: one `<p>` per held item, `<strong>` name then the note. An item with a `plant` is left out
    when `gardenPlants()` holds a plant of that kind. With nothing to show, `<p>Nothing yet but pockets.</p>`.
    `#walkChoices` is emptied.
  - Journal tab: when flag `goal.show` is set and flag `goal.done` is not, a `<p>` with `goal.title`, then one
    `<p class="walk-check">` per goal item, `✓ name` when held and `○ name` when not. Then one `<p>` per held
    page in the order gained, `<strong>` title then text. Last, `<p class="walk-secrets">Secrets found n of m</p>`
    counting pages with `secret`. `#walkChoices` is emptied.
- `walkChoose(entry)` takes one entry of `walkChoices()`. It does nothing when not enabled. Otherwise it
  removes each `take`, adds each `give` not already held, adds each `set`, adds `page` if not held, pushes
  the `say` and the gains to `walkFlash` (`Added to your satchel: <name>.` for `give`, not for `take`, and
  `New page in your journal: <title>.`), and calls `playCadence()` when anything was gained. With `end`,
  it sets `at` to the story's `start`, clears `walkFlash`, saves and closes. Otherwise it sets `at` to `to`,
  saves and paints.
- `walkOpen()` returns whether the panel is showing.
- `openWalk()` returns false when `session.kind === "focus"` or there is no story. Otherwise it calls
  `loadWalk()`, sets `walkTab = "story"`, unhides `#walk`, paints, returns true.
- `closeWalk()` hides `#walk`, clears `walkFlash` and returns focus to `#walkLight`.
- `syncWalkLight()`, skipped while the panel is open, calls `loadWalk()`, then sets `#walkLight.hidden` to
  `!walkStory() || session.kind === "focus"`, class `new` when flag `began` is not set, and class `steady`
  when flag `lit` is set. It runs from a `setInterval` of 1000 ms and from `layoutWalkLight()`.
- `layoutWalkLight()` places the light. With `k = px / dprNow`, the art point is `ax = BW * 0.845`,
  `ay = yW - 4`. CSS `left` is `bx / dprNow + ax * k`, clamped to `24 .. innerWidth - 24`, and CSS `top` is
  `by / dprNow + ay * k`, clamped to `24 .. innerHeight - 24`. It sets the custom property `--walk-px` to
  `Math.max(2, Math.round(k * 2)) + "px"` on the element.

Wiring, added at load time:

- `#walkLight` click calls `openWalk()`. `#walkClose` click calls `closeWalk()`. A click on `#walk` whose
  `e.target` is `#walk` itself calls `closeWalk()`. `[data-walk-tab]` clicks set `walkTab` and paint.
- A `keydown` listener on `window` with capture `true`: when `walkOpen()` is false it returns at once.
  Otherwise it calls `e.stopPropagation()`, so `f`, `p` and `Esc` never reach `focus.js`. `Escape` closes.
  Keys `1` to `9`, on the story tab, call `walkChoose` on that displayed choice.
- Tag the buttons with `walkChoices()` entries through closures, not by parsing their text.

Test hook, at the end of the file:

```js
const WALK = {
  get: () => ({ open: walkOpen(), tab: walkTab, at: walk && walk.at, items: walk ? walk.items.slice() : [],
                flags: walk ? walk.flags.slice() : [], pages: walk ? walk.pages.slice() : [] }),
  choices: () => walkChoices().map(e => ({ label: e.c.label, enabled: e.enabled, hint: e.c.hint || "" })),
  choose(label){
    const e = walkChoices().find(x => x.c.label === label);
    if(!e || !e.enabled) return false;
    walkChoose(e);
    return true;
  },
  open: openWalk, close: closeWalk,
  world(f){ walkFake = f; if(walkOpen()) walkPaint(); }
};
```

### 4. `city/ui.js`

In `measure()`, directly after `layoutGardenLink();`, add `layoutWalkLight();`. Change nothing else.

### 5. `city/city.css`

Append this section, in the file's two-space style:

- `#walkLight`: `position:fixed; z-index:4; width:44px; height:44px; margin:-22px 0 0 -22px; padding:0;
  border:0; background:transparent; cursor:pointer`. `#walkLight:hover` keeps a transparent background.
  `#walkLight[hidden]{display:none}`. `#walkLight:focus-visible` has the same outline as `#gardenLink`.
- `#walkLight::before` is the light: `content:""`, absolutely centred, width and height `var(--walk-px,3px)`,
  background `#ffd27a`, `box-shadow:0 0 6px 2px rgba(255,190,100,.7)`, and animation
  `walk-blink 6s steps(1,end) infinite`.
- `@keyframes walk-blink`: opacity 1 in 0–4%, 8–12%, 16–20% and 26–50%; opacity .12 in the gaps and in
  50–100%. That reads as three quick, one slow.
- `#walkLight.steady::before{animation:none}`.
- `#walkLight::after` is the hint: `content:"a light across the water"`, placed above the light, styled
  like `#gardenLink .hint`, `pointer-events:none`, opacity 0. It has opacity 1 on `:hover`, on
  `:focus-visible` and with class `new`.
- `@media (max-width:760px)`: `#walkLight::after` is right-aligned to the light, so it stays on screen.
- `@media (prefers-reduced-motion: reduce)`: `#walkLight::before{animation:none}`.
- `#walk`: `position:fixed; inset:0; z-index:8; background:rgba(5,8,10,.42)`. `#walk[hidden]{display:none}`.
- `#walkPanel`: `position:absolute; left:50%; bottom:6vh; transform:translateX(-50%);
  width:min(540px, calc(100vw - 20px)); max-height:80vh; box-sizing:border-box; display:flex;
  flex-direction:column; gap:10px; padding:14px 16px 16px`, with the same background, border, radius, blur
  and shadow as `#cityMenu`, colour `#e6edf1`, font `system-ui` as on `#focus`.
- `#walkTop`: flex row, space-between. `#walkPlace`: colour `#e8cb84`, 11.5px, uppercase, letter-spacing .08em.
  `#walkClose`: borderless, transparent.
- `#walkTabs`: flex row, gap 6px, buttons 11.5px.
- `#walkBody`: `flex:1 1 auto; min-height:0; overflow:auto; font:15.5px/1.6 Georgia,"Iowan Old Style",serif`.
  `#walkBody p{margin:0 0 .7em}`. `.walk-say{color:#cfdae1; font-style:italic}`.
  `.walk-got{color:#9fd0b8; font:12.5px/1.45 system-ui,sans-serif}`.
  `.walk-check,.walk-secrets{color:#93a6b3; font:12.5px/1.45 system-ui,sans-serif}`.
  A 180 ms opacity fade-in on `#walkBody p`, off under reduced motion.
- `#walkChoices`: `flex:0 0 auto; display:flex; flex-direction:column; gap:6px`. Its buttons are full width,
  left aligned, 14px, padding 8px 10px. `:disabled` has opacity .55 and `cursor:default`.
  `.walk-n{color:#e8cb84; margin-right:6px}`. `.walk-hint,.walk-now{display:block; font-size:11.5px;
  font-style:italic}`. `.walk-hint{color:#8fa0a9}`. `.walk-now{color:#e8cb84}`.

### 6. The garden: `voxel-garden/js/world.js`, `voxel-garden/js/plants.js`, `voxel-garden/index.html`, `voxel-garden/garden.css`, `tests/check-plants.mjs`

`world.js`: replace `gardenScene` with:

```js
function gardenScene(extra, lamps){
  return makeScene("Garden", lamps ? GARDEN_LAMPS.concat(lamps) : GARDEN_LAMPS, P => { buildGarden(P); if(extra) extra(P); });
}
```

`plants.js`:

- Add `const WALK_KEY = "pagoda-walk.v1";` beside the other keys.
- Add to `PLANT_KINDS`: `lantern: { bloom: "#ffc861", opens: h => h >= 17 || h < 6 }`.
- Add `lanternSeeds()`, returning 1 when `WALK_KEY`'s `vancouver.items` is an array holding `"lantern"` and
  `plants` holds no lantern, otherwise 0. It reads inside try/catch.
- Add `lanternLamps()`, returning `[p.x + 0.5, 3.5, p.z + 0.5, 0.8]` for each plant of kind `lantern` at
  stage 2 whose `opens(hour, currentWx)` is true, and `null` when there are none.
- In `refreshPlants`, build with `S = gardenScene(plants.length ? plantVoxels : null, lanternLamps());`.
- In `plantSeed`, with `const rare = kind === "lantern";`: refuse when `rare ? lanternSeeds() <= 0 : seedCount() <= 0`,
  do `spent++` only when not rare, and clear `plantingKind` when `rare || seedCount() === 0`.
- In `paintBed`, with `const rare = lanternSeeds();`: the pill reads `seeds N`, plus ` + lantern` when
  `rare > 0`. For `[data-kind]` buttons, the lantern button has `hidden = rare === 0` and
  `disabled = rare === 0`; the others keep `disabled = seeds === 0`. The note's `seeds > 0` test becomes
  `seeds > 0 || rare > 0`.

`voxel-garden/index.html`: after the snowdrop button add
`<button data-kind="lantern" aria-pressed="false" hidden>lantern &middot; at dusk</button>`.

`garden.css`: add `#bedPanel button[hidden]{display:none}` after the `#bedPanel[hidden]` rule.

`tests/check-plants.mjs`: in check `bed panel`, change `panel.querySelectorAll("[data-kind]")` to
`panel.querySelectorAll("[data-kind]:not([hidden])")`. Change nothing else in that file.

### 7. `tests/check-story.mjs`

New Node script, with no browser. Import `check` and `report` from `./browser.mjs`. Read every `.js` file in
`city/stories/` and run it with `vm.runInNewContext(source, { STORY })`. Run these named checks per story,
then exit 0 only if all pass. A check's failure detail names the scene and choice.

Enumerate the worlds as the product of: time `{night,nine}`, `{night}`, `{dawn}`, `{day}` (`nine` implies
`night`); weather clear, rain, snow; fog on, off; the four seasons; and grown sets `[]`, `["any"]`,
`["any","moonflower"]`, `["any","lantern"]`, `["any","moonflower","lantern"]`. That is 480 worlds.

A state is `(scene, sorted items, sorted flags)`. Explore breadth-first from `(start, [], [])`: from a state, in
each allowed world, follow each choice whose `show` and `if` both hold. Apply `take`, `give` and `set`. An
`end` choice goes to `start`.

Checks, each named with the story id:

1. `shape`: every scene has `place`, non-empty `text` and non-empty `choices`.
2. `references`: every `to` is a scene, every item, page and `goal` item exists, an `end` choice has no `to`,
   and every cond key is one of those in step 1.
3. `locks explain themselves`: every choice with `if` has a `hint`.
4. `flags`: every flag set is read somewhere, and every flag read is set somewhere.
5. `every scene reachable`, with all worlds allowed.
6. `never stuck`: in every reachable state, in every world, at least one choice has `show` and `if` holding.
7. `no softlock`: from every reachable state, a state with the `finish` flag can still be reached.
8. `ending needs no weather`: with only rain-free, snow-free, fog-free worlds allowed, a state with the
   `finish` flag is reached.
9. `everything obtainable`: every item appears in a `give`, every page in a `page`.
10. `no shortcut`: the shortest path to the `finish` flag is at least 20 moves. It is 30 today.
11. `tokens`: the only `{...}` in any text is `{time}`, `{cond}` or `{temp}`.

12. `detects a dead end`: run the `never stuck` logic on a deep copy of the story with `scenes.gun.choices` set to
    `[]`, and require it to report scene `gun`. This proves the check can fail.

### 8. `tests/check-walk.mjs`

New browser check in the style of `tests/check-plants.mjs`, using `launch, until, check, report, pageUrl` from
`./browser.mjs`. A prelude takes `{ clear, walk, store, code }`: optionally a fresh `localStorage`, optionally
`pagoda-walk.v1` set to `{ vancouver: walk }`, optionally `pagoda-garden.plants.v1` set to `store`, and always a
fetch stub answering Open-Meteo with `weather_code: code` (default 3), `temperature_2m: 7`, `cloud_cover: 80`.
A `loadCity(opts, city = "vancouver")` loads `index.html?city=<city>`, waits for `typeof WALK === "object"` and
for `document.getElementById("infoCond").textContent` to be neither `Loading…` nor `—`.

Checks:

1. `the light shows in Vancouver`, and `#walkLight` is not hidden within 3 seconds.
2. `no light in Toronto`.
3. `the light hides during focus`: `PIXEL.session.start(25)`, within 3 seconds it is hidden; then
   `PIXEL.session.endIn(0); PIXEL.session.tick();` puts it in a break, and within 3 seconds it is shown.
4. `the light is clickable` at 1280×800 and 375×812, with `Emulation.setDeviceMetricsOverride` as in
   `tests/check-pages.mjs`: the rectangle's centre is inside the viewport, and `document.elementFromPoint` at
   its centre is `#walkLight`.
5. `the panel opens`: a real click on `#walkLight` shows `#walk`, `#walkBody` contains `Vancouver`, no `{`, and
   the `#walkChoices` buttons match `WALK.choices()`.
6. `the panel fits` at 1280×800 and 375×812: `#walkPanel` is inside the viewport, and `elementFromPoint` at
   the centre of each choice button lands on that button.
7. `the fare is locked until you have one`: with `{ at: "dock", items: [], flags: ["began"], pages: [] }`,
   `Show him the bottle cap` is disabled with hint `the fare is one shiny thing`.
8. `the walk survives a reload`: from an empty save, choose `Put on your coat and go down to the water`, then
   `Climb down to the beach`, then `Dig out whatever is winking`, reload without clearing, and `WALK.get()` has
   `at: "beach"` and items `["cap"]`, and `flags` holds `began`.
9. `gains are announced`: after that dig, `#walkBody .walk-got` contains `bottle cap`.
10. `Esc closes the walk and spares the timer`: start a round and force a break as in check 3, open the panel,
    dispatch `new KeyboardEvent("keydown", { key: "Escape", bubbles: true })` on `document.body`: the panel is
    closed and `PIXEL.session.get().kind` is `break`.
11. `f does nothing while the walk is open`: from idle, open, dispatch `f`: kind is `idle`.
12. `a number key chooses`: open on `window` from an empty save, dispatch `1`: `WALK.get().at` is `seawall`.
13. `rain opens the spider`, with save `{ at: "lagoon", items: [], flags: ["began", "quest"], pages: [] }`: at
    code 3 the thread choice is disabled; at code 61 it is enabled.
14. `the gun keeps time`, with `at: "gun"` and those flags: `WALK.world({ hour: 12 })` disables the spark
    choice, `WALK.world({ hour: 21.5 })` enables it.
15. `fog opens the long way`, with `at: "dock"`, flags `["began", "crossed"]`: absent at code 3, present at code 45.
16. `a grown plant unlocks the oil`, with `at: "stiltoil"`, flags `["began", "quest"]`: with no store the cutting
    choice is disabled; with a poppy planted 25 hours ago it is enabled.
17. `a young plant does not`: with a poppy planted 1 hour ago it is disabled.
18. `journal and satchel`: with items `["cap"]`, pages `["fare"]`, flags `["began", "quest"]`, the satchel tab shows
    `bottle cap`, the journal shows `The fare`, `○ rain-thread` and `Secrets found 0 of 3`, and the tab buttons read
    `satchel 1` and `journal 1`.
19. `the whole story plays`: from an empty save, with a poppy planted 25 hours ago, open the panel and use
    `WALK.world` and `WALK.choose`, with each `choose` returning true, along this route:
    world `{ hour: 12, wx: "clear", fog: false, season: "autumn" }`, then `Put on your coat and go down to the water`,
    `Climb down to the beach`, `Dig out whatever is winking`, `Climb back up to the seawall`,
    `Walk along to the ferry dock`, `Show him the bottle cap`, `Go up to the lighthouse door`,
    `Knock three quick, one slow`, `Ask her who she is`, `Say you will find them`, `Go back down`, `Go back across`,
    `Ask about the tin of oil under the seat`, `Give him a cutting from your garden`, `Back to the seawall`,
    `Cut through the park to Lost Lagoon`; world `{ hour: 12, wx: "rain", fog: false, season: "autumn" }`, then
    `Ask the spider for a length of thread`, `Back to the seawall`, `Follow the path out to the old gun`;
    world `{ hour: 21.5, wx: "clear", fog: false, season: "autumn" }`, then `Catch the spark in your cupped hands`,
    `Back to the seawall`, `Walk along to the ferry dock`, `Show him the bottle cap again`,
    `Go up to the lighthouse door`, `Go in`, `Put the thread, the oil and the spark on the table`,
    `Help her down the stairs`, `Walk home`.
    At the end the panel is closed, `at` is `window`, items are `cap` and `lantern`, and `flags` holds `lit`.
20. `the light goes steady`: with flags `["began", "lit"]`, `#walkLight` has class `steady` within 3 seconds.
21. `the lantern seed reaches the garden`: load `voxel-garden/index.html` with save items `["lantern"]`. `#bedPill`
    reads `seeds 0 + lantern`, the `[data-kind="lantern"]` button is not hidden, `PLANTS.plant(1, 1, "lantern")`
    is true, `PLANTS.plant(2, 1, "lantern")` is false, the pill then reads `seeds 0`, and the stored `spent` is 0.
22. `no lantern seed, no lantern`: with no save the button is hidden and `PLANTS.plant(1, 1, "lantern")` is false.
23. `a lantern glows`: a garden with a lantern planted 25 hours ago and save items `["lantern"]`: `PLANTS.open("lantern", 22, "clear")` is true, `PLANTS.open("lantern", 12, "clear")` is false, and in one
    single `evaluate`, `hour = 22; PLANTS.tick(0); S.lamps.length` equals `GARDEN_LAMPS.length + 1`. It must be one
    `evaluate` because the page resets `hour` every second.
24. `the epilogue opens`, with `at: "window"`, flags `["began", "lit"]`, items `["cap", "lantern"]`: with a lantern
    planted 1 hour ago, `Go out and look at the lantern plant` is absent; planted 25 hours ago, it is present.
    Choosing it, then `Stay out a while longer`, closes the panel with flag `done` and page `ending`.
25. `the satchel forgets a planted seed`: with the lantern item and a lantern plant, the satchel tab does not
    show `lantern seed`.
26. `no uncaught page exceptions`.

### 9. `.github/workflows/check.yml`

After the `check-plants` line add, at the same indent:

```yaml
      - run: node tests/check-story.mjs
      - run: node tests/check-walk.mjs
```

### 10. Docs

`README.md`:

- In the city page's controls table, after the `The garden` row, add:
  `| The Far Light | in Vancouver, click the small light blinking on the far shore. A choose-your-own-adventure with a satchel and a journal: some choices wait for the real clock, the real weather or something you grew in the garden. The light hides during a focus round. `Esc` leaves, and the walk is remembered |`
- In the garden's controls table, extend the `Seeds` row with: `; finishing The Far Light adds a lantern seed`.
- In the repository layout, under `city/`, add that `city/stories/` holds one story per city.
- After the `check-plants` paragraph, add one paragraph on `node tests/check-story.mjs` (walks every state of
  every story in every combination of time, weather, season and garden, and proves no scene is unreachable and
  nobody can get stuck; needs no browser) and one on `node tests/check-walk.mjs` (plays the story in a real page);
  both run in GitHub Actions.

`docs/REFERENCE.md`:

- In section 1, after `### Headless hook`, add `### The Far Light (city/walk.js)`, describing: `STORY[cityId]`, the
  story shape and cond table from step 1 of this plan, `pagoda-walk.v1`, and that the light hides during focus.
- In `### Plants`, add one sentence on the lantern: it comes from the walk's save rather than from `spent`, one at
  a time, opens from 17:00 to 06:00, and adds a lamp to the scene while open.

`docs/BUILD-LOG.md`: add this before `## Things deliberately not done`, exactly:

```markdown
## Oct 31 — a light on the far shore

The city had a clock, a sky and a seed economy, and nothing to do at them, so Vancouver got a story. A small light
blinks by the cherry tree; clicking it opens a choose-your-own-adventure over the art, with a satchel and a journal.
The story is plain data in `city/stories/`, read by one engine, `city/walk.js`, so the other cities can follow
without new code. Choices can wait for the real hour, the real weather, the season or a plant grown in the garden,
and a locked choice stays visible with a reason, because "only while it is raining" is the best reason to come back.
There is no combat, no failure and no timer, and the light hides during a focus round so the game can never compete
with the thing it is a reward for. Finishing it gives a lantern seed, which closes the loop back to the garden.
`check-story` walks every state in every combination of time, weather, season and garden, so a story cannot strand
anyone, and no ending can demand a snowfall.
```

## Acceptance

Run from the repository root. The shared browser is already running on port 9333, so browser checks use
`CHECK_ATTACH=1`.

1. `cmp .handoff/story-vancouver.js city/stories/vancouver.js` exits 0.
2. `node tests/check-story.mjs` exits 0, and its last line starts with `all ` and ends with ` checks passed`.
3. `CHECK_ATTACH=1 node tests/check-walk.mjs` exits 0, last line `all 26 checks passed`. If a check is split per
   viewport, the number may be higher, but none may be left out.
4. `CHECK_ATTACH=1 node tests/check-plants.mjs` exits 0, last line `all 15 checks passed`.
5. `CHECK_ATTACH=1 node tests/check-focus.mjs` exits 0.
6. `CHECK_ATTACH=1 node tests/check-pages.mjs` exits 0.
7. `CHECK_ATTACH=1 node tests/check-render.mjs` exits 0, last line `all 14 renders match`.
8. `git diff --quiet -- tests/golden/render.json` exits 0.

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch**, except `.handoff/report.md`.
- Do not edit `.handoff/story-vancouver.js` or `city/stories/vancouver.js`. If the story seems wrong, stop and report.
- Do not change `tests/golden/render.json`, and do not run `tests/check-render.mjs --update`. The canvas and the
  text hash of every page must stay exactly as they are.
- No new dependencies, no `type="module"`, no `import`/`export` in page scripts, no `Math.random` in new page code.
- Keep LF line endings.
- All story text goes into the DOM through `textContent`, never `innerHTML`.
- This sandbox cannot start a browser. The shared browser is already running; always set `CHECK_ATTACH=1` for
  checks that need one. Do not run `tests/start-browser.mjs` yourself, and do not pass `--stop`.

## Out of scope

- Stories for other cities.
- A walkable character, sprites, or any change to the canvas art.
- Combat, stats, failure states, timers inside the story, a start-over button.
- Sound beyond the one `playCadence()` call.
- Trapping `Tab` inside the panel.

## If blocked

Stop, leave the working tree as it is, and write in `.handoff/report.md` which step and which Acceptance command
blocked you, the exact output, and what you think the fix is. Do not change the story, the golden file or an
Acceptance command to get past it.
