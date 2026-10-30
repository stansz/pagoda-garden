# Build log

How this got built, in order, including the dead ends. Dates are 2026.

## Oct 23 — the first pagoda

The starting point was the local model in [Strata](https://github.com/Niko1221/Strata) writing a
"small voxel pagoda garden" as a single `index.html`, no libraries. It looked good at a glance and
was broken in a way that only showed when you rotated: **one whole side of every cube was never
drawn**.

Root cause: the face-normal table had `NZ = [0,0,1,0,0]`, so the `-z` face's normal was
`(0,0,0)`. Its neighbour probe then tested the cube itself — always a hit — and the back-face test
read `0 <= 0`. The `-z` faces were culled at every angle. `NZ[3] = -1` fixed it.

The interesting part was the process: the model had spent ~2 hours and written eight debug scripts
building a raycast z-buffer ground truth to prove the *painter order* was wrong. It wasn't; the
face was never in the list. That was the seed of the "test the invariants, not the symptom" habit
behind `render-test.mjs`.

## Oct 24 — making it pleasant

- **Relaxation pass.** Day/night cycle (sky gradient, sun/moon halo, tint grade, stars, lanterns,
  fireflies), weather (rain streaks, snow, overcast flattening), drag-to-look, zoom, and a
  remember-the-look `localStorage` prefs.
- **Performance.** The scene was re-painting ~830 voxel faces every frame. Fixes: paint the static
  half (sky, faces, grade, stars, lanterns) into an offscreen layer and rebuild it only when the
  camera/clock/weather changes; sprite-based glows instead of per-frame radial gradients; snow as
  one path; skip frames entirely when nothing moves; cap DPR (1.5, Firefox 1.25). Measured frame
  time at 2560×1440 went 33.3 ms → 16.7 ms.
- **Audio, version 1.** A drone of five sines plus wind. Too loud (−22 dBFS) and not pleasant.
- **Audio, version 2.** Replaced wholesale: five-voice pad through a lowpass, sine sub, sparse
  music-box plucks, air and rain beds, a convolution reverb with a generated impulse response, a
  compressor and a soft high shelf. Default level dropped to ≈ −49 dBFS RMS; later trimmed again
  at the user's request.

## Oct 25 — location, cities, prototypes

- **Location mode.** `Intl` city clocks (DST-correct, no request) plus live conditions from
  Open-Meteo (no key, CORS-friendly). Five cities, then Sydney. The corner card shows place, real
  local time, condition, temperature, source (`Open-Meteo · 2m ago` / `offline · last known`), and
  a `↻` refresh. Hand-picked weather leaves location mode, because a city always shows its real
  sky.
- **Constant rotation.** The earlier idle drift only started 14 s after the last interaction and
  stopped on any touch, which read as inconsistent. Replaced with a constant 0.042 rad/s turn that
  eases out while dragging and back in after.
- **City scenes, voxel version (later reverted).** Five city-themed voxel scenes with palettes,
  landmarks and an auto camera fit — plus the lesson that at 22×22 cubes an orca is a blob, a
  volcano is a pile and six row houses are a wall.
- **Three style prototypes, on branches, built in parallel.**
  - `proto/silhouette` — layered parallax, hand-authored silhouettes, no library.
  - `proto/sketch` — Rough.js ink and hachure on paper (highest risk: never verified in a browser).
  - `proto/pixel` — a 480×270 framebuffer, Bayer dithering, window view. Clear winner on
    recognisability; the only one whose own framebuffer could be reviewed as images.
- **Pixel page grew up.** Window frame removed at the user's request (art now runs edge to edge,
  cover-cropped). Cities became records; hemisphere-aware seasons; a `DRIFT` table keyed by
  `(city, season)`; **Sydney** added as the southern-hemisphere proof.
- **Trees.** Drift was falling out of empty sky, so each city got a source tree with four seasonal
  crowns (blossom / green / amber / bare) and crown emitters, re-baked once per season. First pass
  put Toronto and Sydney in the near layer, which broke the "same garden everywhere" rule — fixed
  by standardising every tree to the mid layer at one shared slot.
- **Promotion.** The pixel page became the front page; the voxel garden moved to `/garden/` and
  kept a `← back to the city` pill. The two losing prototypes were archived under `/proto/`.
  Documentation was split into this log, a technical reference and the pixel page's own notes.

## Oct 25 — ambience reaches the city page

The pixel page had been silent since the prototype round (audio was out of scope for the three style
prototypes). Ported the garden's WebAudio engine into it and gave each city its own music profile —
chords, tempo, brightness, reverb, pluck pattern — with a glide when you switch cities rather than a
restart, plus rain/snow/season reactions and a `sound` + volume control in the bar. Verified in a real
headless engine that the context starts, the profiles differ and the analyser sees signal.

## Oct 25 — focus timer, on a branch

A pomodoro-ish session lives on `feature/focus-timer` (preview at `/focus/`, deleted before
merge). Design stance from the research pass: a timekeeper, not a productivity app — the corner
card carries a session row (`focus 50m`, click cycles 50/25), a `▷`/`⏸` in its header and `f`/`Esc`;
running shows `focus · 18m` and prefixes the tab title. At zero the session becomes a 10-minute
break (one idempotent advance, never re-fires), and if sound is on a slow tonic pluck marks the
boundary as a cadence rather than a bell. Deadlines are wall-clock and persisted, so a hidden tab
or a reload lands in the right state; breaks expire instead of haunting the card. The session's
half also tints the pad cutoff slightly (focus dimmer, break brighter). Deliberately absent: task
lists, stats, streaks, badges, notification prompts, countdown rings.

## Oct 26 — small screens

The bottom bar had grown to six city buttons plus time, weather, sound and volume, and on narrow
windows it wrapped over the pagoda island. The cities became a dropdown, the weather collapsed to a
single cycling button under 560 px, the bar stacks into two rows there with a scrim behind it, and
the cover-crop now leans left on portrait windows so the island (the thing you click to enter the
garden) stays visible. Verified at 390, 430, 820 and 1280 px in a real engine.

## Oct 27 — the card is the interface

The bottom bar kept covering the pagoda island on shorter windows, so it is gone: all controls moved
into the corner card (city dropdown, time slider + cycle/own, sound + volume), which collapses to a
single header line. Manual weather went too — each city now always shows its real sky, so the card
and the art can never disagree. The art owns the whole lower screen.

## Oct 27 — the clock is real

Last of the manual controls to go. The time slider, `cycle` and `own` are gone; the scene now resyncs
`state.hour` from the selected city's real local time once a second, so the card and the light always
agree and the page can be left open without drifting. Stored time/cycle preferences are ignored.

## Oct 28 — one line of card

Collapsed, the card now reads like a weather station rather than a label: `Vancouver 01:22` with
`Overcast 7 °C Autumn` underneath, so with the card shut there is still one line of live information.
The same strings are computed once in `updateInfo` and painted into both the summary line and the
expanded body, so the two can never disagree.

## Oct 30 — the timer gets its own corner, and merges

The session row and `▷` made the card busy, so the timer moved out: a pill in the bottom-right
(clear of the island) reads `◷ focus`, `◷ 18m` or `break 7m`, and opens a small panel with the
countdown, `25m`/`50m` while idle, start / stop / end break and an end-time note. Click outside or
`Esc` closes it; `f` still toggles. The card is back to place, weather and sound. The branch merged
into `main` and the `/focus/` preview is gone.

## Oct 30 — pomodoro rounds and on-screen cues

The timer became a real round structure: four focus rounds per cycle, a short break (5 or 10 minutes,
matching the 25/50 length) after rounds 1–3 and a long one (15/20) after the fourth, with pause,
`+5m`, `skip break` and an optional auto-start for the next focus. The panel gained four round dots
and a live note (`ends 21:04, then a 5m break` / `back at 21:09`), and the pill reads `long break 12m`
when it matters. Because a timer you have to look at is a timer you forget, it also cues the scene: a
thin line along the bottom edge fills gold through a round and green through a break, and `grade()`
eases a slight cool tint over the pixel art in focus and a warm one in a break. All deadlines are
still wall-clock and persisted — a paused round now survives a reload for up to twelve hours.

## Oct 30 — one file became many

The two pages had grown to a few thousand lines of inline script each, and small pieces — `clamp`, the `MOOD` table, the WMO labels, the impulse-response and noise helpers — were copied in both. Cut the inline CSS and JavaScript out into plain files loaded with `<link rel="stylesheet">` and classic `<script src>`: `city/` for the pixel page (core, draw, build, one file per city, trees, island, frame, audio, ui, focus, menu, pixel), `voxel-garden/js/` for the garden, and `shared/` for the code the two pages genuinely share. The cuts are exact slices of the old script in its original order, so the files still share one global scope and only the load order matters. No `type="module"`, no `import`/`export`, no build step: both pages still work from `file://`. The render hashes did not move.

## Oct 30 — the garden tells the real time too

The garden was the last page with a clock of its own, so its bottom bar went the way of the city's: the
time slider, `cycle`, the clear/rain/snow buttons and the `Own time` entry are gone, and the card now
carries `city`, `sound` and `zoom` in their place. The scene always follows the selected city's real
local clock and live sky — resynced every second and fetched every 15 minutes or on `↻` — so the card and
the light cannot disagree, and stored manual time and weather are ignored. The garden also honours
`?city=<id>` on load, otherwise it reopens on the city you last chose, otherwise Vancouver, and it
remembers that choice in `pagoda-garden.v4` alongside volume, zoom and whether the card was open.

## Oct 30 — the garden starts to grow

The focus timer's lifetime `marks` had been counting finished rounds with nothing to spend them on, so
each one now earns a seed in the garden. A `seeds` pill in the bottom corner opens a panel that picks
the kind, and tapping grass plants it: the tile must be a bare grass cube, and the seed is spent from
the same `localStorage` the city page writes. A plant is a sprout for six hours, a stem with a sprout
for the next eighteen, then grown; rain in the garden's chosen city speeds that up, poppies bloom any
time, moonflowers only at night and snowdrops only in snow, and everything is remembered across
reloads so the garden you left is the garden you come back to. The seed checks also turned up an old
bug: `plot()` stored its tiles as pairs and looked them up as strings, so the pond and the path had
been drawing as grass since Oct 25. Both are back.

## Things deliberately not done

- **No bundler, no framework, no build step.** Each page is an HTML file plus plain stylesheet
  and classic script files, served exactly as written, so it works from `file://` as well as Pages.
- **No ES modules.** The pages are split into classic scripts — one per concern, with the
  code both pages use in `shared/` — which keeps `file://` working. ES modules remain
  deliberately unused.
- **No seasonal re-bake of the whole city art.** Only the tree and Sydney's grade change with the
  season; skylines and the garden island stay as baked.
- **No audio on the pixel page.** The garden kept the ambient engine; the city view is silent.
