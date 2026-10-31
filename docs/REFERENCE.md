# Technical reference

Two pages, each an HTML file plus its own stylesheet and classic scripts, no build step, no
framework, no bundler. Everything below is what is actually in the repository, not a plan.

```
index.html            pixel city view — the front page (markup, stylesheet and script tags)
city/                 pixel city view code: city.css + one classic script per concern,
                      with one file per city under city/cities/
voxel-garden/index.html     voxel pagoda garden (markup, stylesheet and script tags)
voxel-garden/js/      the garden's classic scripts (world, render, audio, plants, ui, loop)
voxel-garden/garden.css     the garden's stylesheet
shared/               code both pages load: time.js, weather.js, audio.js
proto/index.html      archive index for the two losing prototypes
proto/silhouette/     flat parallax prototype (vanilla canvas)
proto/sketch/         Rough.js sketchbook prototype (CDN, degrades offline)
docs/                 this file, the build log, pixel notes, stills
```

Both pages load three shared scripts first, then their own files in order:

- `shared/time.js` — the time-of-day table (`MOOD` + `moodAt(hour)` — sky top/bottom, a tint
  and a night factor) plus `clamp`, `pad2` and `ownHour`;
- `shared/weather.js` — the WMO code mapping (`wxToCode`, `condLabel`);
- `shared/audio.js` — the generated impulse-response and noise helpers (`makeImpulse`,
  `makeNoise`).

The corner card and the `localStorage` prefs are still implemented separately in each page and
deliberately kept in sync by hand.

The pages share one WMO mapping for weather: `71/73/75/77/85/86` → snow,
`51-67 / 80-82 / 95+` → rain, everything else → clear. Cloud cover is kept as a separate
0..1 value that flattens the light.

---

## 1. Pixel city view (`/index.html`)

### Framebuffer

The scene is painted into an offscreen canvas of roughly 480×270 *art pixels*, then blitted
to the real canvas with `imageSmoothingEnabled = false` at an **integer** scale. Sizing
(`measure()`):

1. `DPR = min(devicePixelRatio, isFirefox ? 1.25 : 1.5)`.
2. Pick a scale `p = round(min(cssW/480, cssH/270) * DPR)`, then grow it while the buffer would
   exceed ~300k art pixels.
3. Buffer size follows the viewport aspect, clamped so it is never taller than 1/1.62 of its
   width (a landscape "pane").
4. **Cover, then crop:** `pc = ceil(max(cvW/BW, cvH/BH))`, buffer drawn at `pc` and centred with
   negative offsets. No letterbox, no frame — the art runs edge to edge. On a 16:9 window the
   buffer already matches the viewport, so there is effectively no crop.

### Dithering and painting

No paths and no gradients: everything is `fillRect`, `drawImage` and `putImageData`. Ordered
4×4 Bayer dithering (`BAYER`, `bay()`) blends sky, haze and water, which is what makes it read
as pixel art rather than a blurry low-res render.

Three baked layers per city — `far`, `mid`, `near` — each wider than the buffer by `PAD` art
pixels so they can be blitted at a drifting offset for parallax:

1. sky (repainted only when the hour crosses a 0.05 h bucket),
2. stars, clouds, birds,
3. `far` → `mid` → water (+ shimmer) → `near`,
4. the mood grade (one `multiply` pass), lights, weather particles,
5. a soft bottom-weighted vignette (a baked sprite — the only thing over the art).

### City records

One `CITIES` array; every lookup goes through a record:

```js
{ id, name, seed, lat, lon, tz,
  palette,        // key into PAL: colours for city, water, sky tint
  landmark,       // key into BUILD: the city's art function
  drift,          // seasonal particle spec (see below)
  tree,           // { kind, layer, x, baseY, h, form, crowns }
  noSnow }        // e.g. sydney: ["summer"]
```

`CITY_BY_ID` and `cityRecord(id)` (falls back to Vancouver) exist so `?city=`, prefs and the
corner card never index by position.

### Seasons

`hemisphereOf(lat)` → `"N" | "S"`; `seasonOf(month, lat)` maps `Mar-May` spring, `Jun-Aug`
summer, `Sep-Nov` autumn, `Dec-Feb` winter, flipped in the south. The month comes from the
city's *own* local date through one `Intl.DateTimeFormat(...).formatToParts` call
(`localParts(tz)`), refreshed once a second by the card updater; `state.season` drives both the
tree crown and the drift table.

### Trees, crowns and drift

Each city has a source tree baked into its **mid** layer at a shared slot: single trunks at
`x: 0.79`, pairs at `0.72` / `0.84`, `baseY: 0.665`, so the composition is stable across cities
and the near band stays the garden's. Four crowns per city live in `PAL[city].tree[season]`:
blossom, full green, amber-with-gaps, bare branches (plus a settled-snow sprite faded in only
while it snows). Sydney is inverted — jacaranda purple in spring.

The bake returns `scene.treeEmitters` (3 points per trunk: crown top, left lobe, right lobe).
Drift particles are seeded *under a crown* and respawn at their own emitter, so petals visibly
come off the tree; only Hong Kong's summer sea-haze `mote` spec stays ambient. Rain and snow
suppress drift (`1 − 2.4·rain − 5·snow`, clamped).

**Re-bake policy:** `buildScene(id, season)` caches by `(city, season, BW, BH)`. A season change
re-bakes once; frames never re-bake.

### Audio (city page)

Same engine as the garden (pad + sub + plucks + generated convolution reverb + compressor), but the
city owns the music through a `MUSIC` table keyed by city id: four chords (`{bass, pad:[5]}`), a
chord-hold of 11–16 s, a pad cutoff, a pluck scale/tempo, a reverb length/decay/wet, an air level and
a master trim. Vancouver is mellow/low/slow, Toronto warm mid-tempo, Hawai'i bright and high with
frequent plucks, Hong Kong dark and reverberant, Amsterdam the slowest and softest, Sydney bright
major. Changing city while playing glides the existing oscillators (`setTargetAtTime` ~2.5 s) and
eases cutoff and wet — no restart. Rain follows `state.rainAmt`, snow lifts the air bed and eases a
master lowpass from 18 kHz to 9 kHz, and the season tints the pad cutoff (±6–12 %). Default volume is
18 %; the inline analyser (`master → analyser → destination`) feeds `PIXEL.audio().rms` for the
headless checks.

### Controls live in the card

There is no bottom bar. The corner card is the whole interface: its header is the collapsed state
(city, real local clock, `↻`, chevron), a summary line under it shows the live condition, temperature
and season (`#infoSum`, hidden once the card is open), and the expanded body holds the hemisphere,
the weather source and two control rows — `city ▾` (dropdown, opens under the button, closes on outside click/Escape) and
`sound` (toggle + volume). The art keeps the entire lower screen, so the pagoda island is never
covered; because the scene is cover-cropped, portrait windows (`height > 0.95 × width`) bias the crop
toward the left so the island stays on screen and clickable.

Time and weather are not controls any more. `state.hour` is resynced from the city's real local time
once a second inside the render loop (`hourSyncAt`), so the light always matches the clock in the card;
stored manual time and weather preferences are ignored on load, and `state.own`/`state.cycleOn` are
forced `false`. That also removed the old "Scene … cycling" mismatch row in practice.

### Time, weather, card, `?city=`

`?city=<id>` on load beats `localStorage`; unknown ids fall back. Selecting a city sets the
clock to its local hour and fetches Open-Meteo (`current=weather_code,temperature_2m,cloud_cover`,
`timezone=auto`); the clock re-syncs every 30 s, weather every 15 min or on `↻`. (A hand-picked
weather leaves location mode. Offline, the clock still works and the weather stays put.

### Performance notes

Budget: 60 fps at 2560×1440. Ski frames only repaint the sky when the hour bucket changes; the
water only on city/resize; layers only when the city, season, size or weather grade changes.
Firefox gets a smaller backing store because its 2-D path/blit path is slower. `prefers-reduced-motion`
disables parallax, clouds, birds and the auto day cycle.

### Headless hook

The page exposes `PIXEL` for the capture harness: `render(city, hour, {rain, snow})`,
`frame(now)`, `framebuffer()`, `setSeason()`, `layers()`, `treeInfo()`, `treeEmitters()`,
`bakes()`, `driftParticles()`, `view()`. It exists so the art can be reviewed without a browser.

### The Far Light (`city/walk.js`)

A story per city is plain data in `city/stories/<city>.js`, written into one shared `STORY`
object; `walkStory()` reads `STORY[state.city]`, so a page with no story has no light and no
panel. A story is

```
{ title, start, finish, items, goal, pages, scenes }
items[id]  = { name, note, plant? }
goal       = { title, show: flag, done: flag, items: [item ids] }
pages[id]  = { title, text, secret? }
scenes[id] = { place, text: [line], choices: [choice] }
line       = string, or { if: cond, t: string }
choice     = { label, to, end?, show?: cond, if?: cond, hint?, now?, say?, give?: [], take?: [], set?: [], page? }
```

`show` hides a choice outright; `if` leaves it visible but disabled with its `hint`, and `now`
is the small note it wears while a time or weather lock is open. A condition is an object whose
keys must all hold: `night` (20:00–05:00), `nine` (the 21:00 hour), `dawn` (05:00–08:00),
`rain`, `snow`, `fog` (Open-Meteo codes 45/48), `season` (`spring|summer|autumn|winter`),
`has` / `lacks` (item id or list), `flag` / `noflag` (flag or list), and `grown` (`"any"` or a
plant kind, read from the garden's saved plants). `{time}`, `{cond}` and `{temp}` are replaced
from the city's real clock and weather. The walk is remembered per city in
`pagoda-walk.v1` as `{ [cityId]: { at, items, flags, pages } }`; the panel paints story,
satchel and journal views, all text through `textContent`. The engine starts its 1 s
`setInterval` at load so the light follows the clock, and `syncWalkLight()` hides the light
whenever `session.kind === "focus"`, so the game never competes with the timer. `WALK` is the
headless hook the checks use (`get`, `choices`, `choose`, `open`, `close`, `world`).

---

## 2. Garden (`/voxel-garden/index.html`)

### Scene data

One scene built from `put(x, y, z, colour)` calls into a `vox` array, then `makeScene()` derives
everything else at load: positions relative to the scene centre, a neighbour bitmask (`occ`),
pre-shaded colour strings per cube per face, face centres, projected corners, and a camera fit
from the bounding box (874 voxels, fit 28).

### Drawing

- Faces are painter-sorted by **face-centre depth** (a per-face key, not a per-cube one).
- Face normals: `+x`, `-x`, `+z`, `-z`, `top`. **The `-z` normal must be `(0,0,-1)`.** When it
  was `(0,0,0)` the neighbour probe tested the cube itself, so every `-z` face was culled — the
  original "missing side / see-through" bug. `render-test.mjs` pins this.
- Fixed light, then a full-screen `multiply` grade from `MOOD`, a rain/snow wash, pre-rendered
  glow sprites (sun/moon halo, lanterns, fireflies), weather particles, vignette.
- The expensive scene half is cached in an offscreen layer and only rebuilt when the camera,
  clock, weather or cloud cover changes; the loop blits it and draws the moving parts.

### Camera

Orthographic. Drag to yaw/pitch, wheel or pinch to zoom (0.55–2.6), double-click or `0` to
reset. A constant slow turn (0.042 rad/s, ≈150 s per revolution) eases out while dragging and
back in after; `prefers-reduced-motion` turns it off.

### Audio

WebAudio, all synthesized: a five-voice pad (triangle + detuned sine) through a 1.5 kHz
lowpass moving through Dmaj9 → Bm7 → Gmaj7 → Aadd9 every 11–14 s; a sine sub; sparse
"music box" plucks in D pentatonic; air and a rain bed; a `ConvolverNode` whose impulse
response is generated in the page; a compressor and a soft high shelf on the master, default
volume 18 % (≈ −49 dBFS RMS).

### Controls live in the card

There is no bottom bar. The corner card is the whole interface: its header is the collapsed state (city,
real local clock, `↻`, chevron), and the expanded body holds the condition and temperature, a meta line
with the weather source, and three control rows — `city` (a dropdown that opens under the button and
picks whose real clock and live sky the scene follows), `sound` (toggle + volume) and `zoom` (`−` / `+`).
Time and weather are not controls any more: `hour` is resynced from the chosen city's real local clock
once a second, and its weather is fetched from Open-Meteo every 15 minutes or on `↻`. Start-up uses
`?city=<id>` if it names a city, otherwise the last city chosen, otherwise Vancouver. Drag, wheel,
pinch, `+` / `-` keys and double-click still work over the canvas.

### Back pill

`?city=<id>` (from the city page) or a referrer matching the site root shows a top-right
`← back to the city` pill linking `../?city=<id>`; opened on its own, the pill is never
rendered or focusable.

### Plants

Seeds are the city page's lifetime `session.marks` minus the garden's `spent`, both read from
`localStorage` (`pagoda-garden.plants.v1` holds `{ spent, plants }`, `pagoda-pixel-window.v1` holds
the marks). A plant is a sprout for 6 h, a stem with a sprout for 18 h more, then grown at 24 h; rain
adds its elapsed time to the plant's `rain` (saved too) and so grows it faster. Poppies bloom any time,
moonflowers only at night (20:00–05:00) and snowdrops only in snow; a grown plant otherwise shows a
bud. The voxel scene is rebuilt only when `refreshPlants` sees a plant's stage or open/closed state
change. The lantern is the exception: its seed comes from The Far Light's save
(`pagoda-walk.v1`) rather than from `spent`, only one can be planted at a time, it opens from
17:00 to 06:00, and while it is open it adds a lamp to the scene.

---

## 3. Tests

No framework, just node scripts in the authoring workspace (not shipped):

| Script | What it proves |
| --- | --- |
| `scripts/check-inline.mjs <file>` | every inline `<script>` block parses (`new vm.Script`) |
| `render-test.mjs` | garden geometry: normals are unit axis vectors, `occ` matches a rebuild from the voxel set, no probe hits its own cube, drawn face count equals the formula at four camera angles |
| `info-test.mjs` | card + location logic against a stubbed DOM and a faked Open-Meteo reply: own-time, city clock/condition/temp, manual weather leaving location mode, offline fallback, refresh states, prefs |
| `scripts/render-pixel.mjs` | renders the pixel page's real framebuffer through a canvas shim and writes contact sheets; asserts city records, the season table (north vs south), drift rules, Sydney's snow refusal, tree crowns differing per season, emitters matching crowns, and one re-bake per season/city change |

Run them from the `pagoda` authoring folder with `node <script>`.

## 4. Deployment

GitHub Pages serves `main` from the repository root (`https://stansz.github.io/pagoda-garden/`).
Publishing is: commit the changed files, push, then wait for
`gh api repos/stansz/pagoda-garden/pages/builds/latest` to report `built` for that commit.
Feature work from the prototype phase is kept on `proto/silhouette`, `proto/sketch` and
`proto/pixel` branches.

## 5. Gotchas

- Keep these pages dependency-free and build-free; they are split into classic scripts loaded
  with `<script src>` and stylesheets loaded with `<link>`, so `file://` must keep working (no
  ES modules, no bundler).
- Do not write these files with Windows PowerShell `Set-Content`: it re-encodes non-ASCII
  (`·`, `…`, `°`) and mangles them. Use the editing tools or a UTF-8 writer.
- The pixel view crops on unusual aspect ratios (very tall/wide windows); extreme cases crop
  into the composition rather than letterboxing.
- `sillCv` in the pixel page is dead code left from the removed window frame.
- Seasonal art is only the tree and the Sydney grade: no snow accumulates on skylines or the
  garden island.
