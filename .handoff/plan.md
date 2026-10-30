# Expand headless checks to all cities and the garden, and record a render baseline

## Goal

Add test coverage for `index.html` (six cities) and `voxel-garden/index.html`, plus a pixel-and-text
baseline of both pages taken from the current code. A later refactor must reproduce this baseline
exactly. This task changes tests only: no page changes.

Environment: Node 22+, no npm dependencies, no `package.json`. Browser driven over the Chrome
DevTools Protocol with Node's global `fetch` and `WebSocket`. Pages load from `file://`.

## Files to touch

- `tests/browser.mjs` (new)
- `tests/check-focus.mjs`
- `tests/check-pages.mjs` (new)
- `tests/check-render.mjs` (new)
- `tests/golden/render.json` (new, generated)
- `.github/workflows/check.yml`
- `README.md` (the `## Tests` section only)

## Steps

### 1. `tests/browser.mjs`

Move the browser plumbing out of `tests/check-focus.mjs` into this module, unchanged in behaviour:
the browser path list, the `BROWSER_PATH` override, the `--no-sandbox` flag when `process.env.CI` is
set, the port-in-use guard on port 9333, the temp profile, `sleep`, `until`, and the `closeEdge`
shutdown (`Browser.close`, then `edge.kill()`, then the Windows sweep by profile name), renamed
`close`.

Export `sleep`, `until`, and `async function launch()` returning:

- `send(method, params)` — raw CDP call.
- `evaluate(expr)` — `Runtime.evaluate` with `awaitPromise` and `returnByValue`; throws on exception.
- `load(url, { prelude } = {})` — if `prelude` is a string, install it with
  `Page.addScriptToEvaluateOnNewDocument` (removing any prelude from an earlier `load` first), then
  `Page.navigate`, then wait until `document.readyState === "complete"`.
- `exceptions` — array of uncaught page exception strings, collected from `Runtime.exceptionThrown`.
- `close()`.

Also export `pageUrl(relPath)` returning `new URL("../" + relPath, import.meta.url).href`.

### 2. `tests/check-focus.mjs`

Rewrite it to use `tests/browser.mjs`. Keep all 20 checks and their names, and the output format:
one `PASS name` / `FAIL name  detail` line per check, then `all N checks passed` or
`N check(s) failed`, exit 0 only when all pass.

### 3. `tests/check-pages.mjs`

Same output format and exit rule. Export nothing; put a shared `check(name, fn)` / results printer
in `tests/browser.mjs` and use it from both scripts.

Every load uses this prelude, so no check depends on the network:

```js
window.fetch = () => Promise.resolve(new Response(JSON.stringify(
  { current: { weather_code: 3, temperature_2m: 7, cloud_cover: 80 } }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
```

Use `until` (never fixed waits) for anything that needs a frame or the stubbed fetch. "Canvas lit"
means: read `#scene` with `getImageData`, sample every 97th pixel, and at least 20 samples have
R+G+B > 30.

City page checks, one named check per city (`vancouver`, `toronto`, `hawaii`, `hongkong`,
`amsterdam`, `sydney`), each loading `index.html?city=<id>` and asserting all of:

- `PIXEL.state.city === id`
- `#infoPlace` text equals `PIXEL.record(id).name`
- `#infoClock` text matches `/^\d\d:\d\d$/`
- `#infoCond` text is `Overcast` and `#infoTemp` text contains `7`
- canvas lit
- `PIXEL.audioProfile(id).chords.length > 0`
- `#gardenLink` `href` contains `city=<id>`

Further checks:

- `city menu`: on `index.html?city=vancouver`, click `#cityBtn`, then click
  `#cityMenu button[data-city="sydney"]`; `PIXEL.state.city` is `sydney` and `#infoPlace` is `Sydney`.
- `garden renders`: on `voxel-garden/index.html`, canvas lit and `#infoPlace` is `Own time`.
- `garden weather buttons`: click `[data-wx="rain"]`; its `aria-pressed` is `true` and
  `[data-wx="clear"]`'s is `false`.
- `garden time slider`: set `#hour` value to `12`, dispatch a bubbling `input` event; `#clock` is `12:00`.
- `garden zoom`: click `#zin` and `#zout`; no exception.
- `garden city`: click `[data-place="5"]`; `#infoPlace` is `Sydney` (use `until`).
- `garden back link`: load `voxel-garden/index.html?city=sydney`; `#backCity` has `hidden === false`.
- `no uncaught page exceptions`: last check; `exceptions` is empty across all loads.

Load each page with a fresh `load` per check group, and clear `localStorage` before each load with
`try{localStorage.clear()}catch(e){}` in the prelude, so checks do not affect each other.

### 4. `tests/check-render.mjs`

Deterministic render comparison. Usage: `node tests/check-render.mjs` compares against
`tests/golden/render.json`; `node tests/check-render.mjs --update` rewrites that file.

Set the viewport with `Emulation.setDeviceMetricsOverride` to 1280×800, deviceScaleFactor 1, and the
zone with `Emulation.setTimezoneOverride` to `UTC`, before any load.

Prelude for every load, parameterised by epoch ms `T`:

- `Date` replaced by a subclass: no-argument construction gives `T`; `Date.now()` returns `T`;
  arguments pass through.
- `Math.random` replaced by a mulberry32 generator seeded with the constant `0x9e3779b9`.
- `performance.now()` returns a virtual clock `__t`, starting at 1000.
- `window.requestAnimationFrame` queues callbacks and never fires by itself.
  `window.__step(n)` repeats `n` times: `__t += 16`, take the queue, call each with `__t`.
- `window.fetch` is the stub from step 3.
- `localStorage` cleared in a try/catch.

For each entry: `load`, wait 1500 ms with `sleep` so timers and the stubbed fetch settle, call
`__step(60)`, then compute:

- `canvas`: FNV-1a 32-bit hash, as 8 hex digits, of all `getImageData` bytes of `#scene`.
- `text`: FNV-1a 32-bit hash of `document.body.innerText`.

Entries, keyed `<page>/<city>/<season>`, 14 in all:

- `T` for `jan`: `2026-01-15T20:00:00Z`. `T` for `jul`: `2026-07-15T04:00:00Z`.
- `index.html?city=<id>` for all six ids at both instants.
- `voxel-garden/index.html` at both instants, keyed `garden/-/jan` and `garden/-/jul`.

`render.json` is a JSON object of key → `{ canvas, text }`, pretty-printed with 2 spaces, keys in the
order above. On compare, print `PASS key` or `FAIL key  expected … got …` per entry, then
`all 14 renders match` or `N render(s) differ`, exit 0 only if all match. A missing golden file
exits 2 with a message naming `--update`.

Generate `tests/golden/render.json` with `--update` from the current pages, then run the compare.

### 5. CI

In `.github/workflows/check.yml`, keep the existing steps and add `- run: node tests/check-pages.mjs`
after the focus check. Do not add `check-render.mjs` to CI: its golden file is produced on Windows.

### 6. README

Rewrite the `## Tests` section to list the three scripts in one short paragraph each: what it covers,
how to run it, and that `check-render.mjs` is a local tool, not run in CI, whose baseline is refreshed
with `--update` only when a visual change is intended.

## Acceptance

Run from the repository root.

1. `node tests/check-focus.mjs` — exits 0, last line `all 20 checks passed`.
2. `node tests/check-pages.mjs` — exits 0, last line `all 14 checks passed`.
3. `node tests/check-render.mjs` — exits 0, last line `all 14 renders match`.
4. `node tests/check-render.mjs` — run a second time: exits 0, last line `all 14 renders match`.
5. `node -e "const g=Object.values(require('./tests/golden/render.json'));const c=new Set(g.map(x=>x.canvas));console.log(g.length,c.size)"` — prints `14 14`.
6. `git diff --exit-code -- index.html voxel-garden proto docs` — exits 0.
7. `git status --porcelain -- . ":(exclude).handoff"` — lists only `.github/workflows/check.yml`,
   `README.md`, `tests/check-focus.mjs`, and untracked `tests/browser.mjs`, `tests/check-pages.mjs`,
   `tests/check-render.mjs`, `tests/golden/`.

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- Do not change `index.html`, `voxel-garden/`, `proto/` or `docs/`, even to make a check pass.
- No npm dependencies, no `package.json`, no new tooling.
- Every script must work from any working directory, on Windows with Edge and on Linux with Chrome.
- Every script must leave no browser processes behind.
- Do not weaken a check to make it pass. Do not remove any of the 20 focus checks.

## Out of scope

- Splitting the pages into multiple files (a later handoff).
- Fixing any bug these checks reveal.
- Screenshot images or visual diff tooling.
- Testing audio output or the focus timer beyond the existing 20 checks.

## If blocked

If a check fails because a page behaves differently from this plan (a selector, text or URL parameter
is not as written), or two consecutive `check-render.mjs` runs disagree, stop. Leave the working tree
as it is and write in `.handoff/report.md`: which check, the expected and actual values, and which
part of the render differs if it is a render. Do not change the page, and do not loosen or skip the
check.
