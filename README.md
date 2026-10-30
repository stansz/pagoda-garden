# Pagoda garden

A quiet, no-build ambient web toy: six cities you can look out at, and one small voxel
garden you can step into. Everything is time-of-day and weather aware, and it all runs
from static files.

**Live:** https://stansz.github.io/pagoda-garden/

| Page | What it is |
| --- | --- |
| [`/`](https://stansz.github.io/pagoda-garden/) | **Pixel city view** — the main page. Six cities, real local clocks, live weather, seasonal trees. Click the pagoda island to enter the garden. |
| [`/voxel-garden/`](https://stansz.github.io/pagoda-garden/voxel-garden/) | **The garden** — the 3D voxel pagoda scene, with day/night, weather, ambient audio, and zoom. Opens from the city view and remembers which city sent you. |
| [`/proto/`](https://stansz.github.io/pagoda-garden/proto/) | Archive of the two losing style prototypes (silhouette parallax, sketchbook). |

## Controls

**City view**

| What | How |
| --- | --- |
| City | the `city ▾` row inside the top-left card opens the city list (Vancouver, Toronto, Hawai'i, Hong Kong, Amsterdam, Sydney) |
| Time | *not a control* — the scene always runs on the selected city's real local clock, so the light is whatever it is there right now |
| Weather | *not a control* — every city always shows its own real sky, which is why the card and the scene agree |
| Ambience | the `sound` row in the card, with a volume slider — each city has its own chord set, tempo, brightness and reverb |
| Corner card | collapsed it reads `Vancouver 01:22` / `Overcast 7 °C Autumn`; expanded it adds the hemisphere, the weather source and the controls. `↻` refetches that city now; click the header to collapse |
| Focus timer | the `◷ focus` pill in the bottom-right opens a small panel: 25 or 50 minutes of focus in rounds of 4, a short break after rounds 1–3 (5 or 10 min) and a long one after the 4th (15 or 20 min). `pause`, `+5m` and `skip break` while it runs, plus an optional `auto-start next focus`; `f` starts/stops, `p` pauses, `Esc` closes the panel. A thin line along the bottom edge fills gold through a round and green through a break, and the scene tints slightly cool in focus and warm in a break |
| The garden | click the pagoda island |

The city page also reads `?city=<id>`, so links can land on a specific city.

**Garden**

| What | How |
| --- | --- |
| Look around | drag; it also turns slowly on its own (~150 s per revolution) |
| Zoom | wheel, pinch, `+` / `-` buttons, `+` / `-` keys, double-click to reset |
| Time and weather | *not controls* — the garden always follows its city's real clock and sky |
| City | the `city` row in the card; `?city=<id>` lands on one, otherwise the last one you chose, otherwise Vancouver |
| Ambience | `sound` (browsers need one click), volume slider |
| Back | a `← back to the city` pill appears when you arrive from the city view |

Location, volume, sound preference, zoom and card state are remembered in `localStorage`;
a remembered `sound on` waits for the first click before starting, because browsers require a gesture.

## How it is built

- **Pixel city view** — a ~480×270 pixel framebuffer scaled up with nearest-neighbour and
  cropped edge to edge; ordered Bayer dithering does the gradients. Cities are records
  (`CITIES`) with coordinates, time zone, palette, landmark builder and a seasonal tree;
  seasons come from the city's real local date and hemisphere. Drifting petals, seeds and
  leaves are emitted from the tree crowns. The page's CSS and JavaScript live beside it:
  `city/city.css` and classic scripts under `city/` (core, draw, build, one file per city,
  trees, island, frame, audio, ui, focus, menu, pixel), with the pieces both pages share in
  `shared/`.
- **Garden** — 874 voxels in one canvas 2D scene, painter-sorted by face-centre depth, with
  a fixed light, a time-of-day grade, rain/snow particles, pre-rendered glow sprites and a
  small WebAudio ambient engine (pad, sub, plucks, convolution reverb, compressor).
- **Both** — the same time-of-day table and the same corner card with `Intl` city clocks and
  [Open-Meteo](https://open-meteo.com/) conditions (no API key, no account).

## Repository layout

```
index.html            pixel city view (main page): markup, stylesheet and script tags
city/                 pixel city view code: city.css + one classic script per concern,
                      with one file per city under city/cities/
voxel-garden/index.html     voxel garden: markup, stylesheet and script tags
voxel-garden/js/      the garden's classic scripts (world, render, audio, ui, loop)
voxel-garden/garden.css     the garden's stylesheet
shared/               code both pages load: time.js, weather.js, audio.js
proto/                archived style prototypes + their index
docs/REFERENCE.md     technical reference
docs/BUILD-LOG.md     how this got built, decision by decision
docs/pixel-notes.md   the pixel page's own design notes
docs/shots/           stills from headless renders
```

## Running it locally

There is no build step and no dependency. The pages work from `file://` directly: each one is
an HTML file plus the stylesheet and classic `<script src>` files that sit next to it (the
city page in `city/`, the garden in `voxel-garden/`, and the code both pages share in
`shared/`), so keep the directories together and open `index.html` or
`voxel-garden/index.html` as before. There are no ES modules and no bundler. The pixel
archive's sketch prototype loads Rough.js from a CDN and degrades gracefully offline.

## Tests

All three scripts drive a headless browser (Edge or Chrome, or set `BROWSER_PATH`) over the Chrome
DevTools Protocol and need only Node 22+, no install and no network. Run them from the repository
root.

`node tests/check-focus.mjs` checks the focus timer's behaviour in `index.html` — rounds, breaks,
pause, extend, skip, auto-start, the progress line, the scene tint and a reload — and is run by
GitHub Actions on every push to `main` and on pull requests.

`node tests/check-pages.mjs` loads all six cities of `index.html` and `voxel-garden/index.html` with
a stubbed weather fetch, and checks the place, clock, conditions, canvas pixels, audio profile,
garden link, city menu, weather buttons, time slider, zoom, garden city picker and back link. It
also runs in GitHub Actions.

`node tests/check-render.mjs` is a local tool, not run in CI: it loads the same pages with a frozen
clock, seeded randomness, a virtual animation clock and the stubbed fetch, steps a fixed number of
frames, and compares a pixel and text hash against `tests/golden/render.json`. Its baseline was
recorded on Windows, so it only makes sense on Windows; refresh the baseline with
`node tests/check-render.mjs --update` only when a visual change is intended, and review the
resulting diff like any other change.

A shell that cannot start a browser, such as a sandboxed agent, can run `node tests/start-browser.mjs`
from a normal shell first, then run the checks with `CHECK_ATTACH=1`. `--stop` shuts that browser down.

## Credits

- Conditions by [Open-Meteo](https://open-meteo.com/).
- The sketch prototype uses [Rough.js](https://roughjs.com/).
- Started life as a one-shot "voxel pagoda garden" generated by the local model in
  [Strata](https://github.com/Niko1221/Strata) — see the build log for how it went.
