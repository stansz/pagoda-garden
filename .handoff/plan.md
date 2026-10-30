# Focus timer: pomodoro rounds, pause/extend/skip, on-screen cues

## Goal

Extend the focus timer in `index.html` (a single self-contained HTML page: inline CSS + one inline
`<script>`, no build step, no dependencies) with:

1. Pomodoro rounds: 4 focus rounds per cycle, a short break after rounds 1–3, a long break after round 4.
2. Pause / resume, `+5m` extend, `skip break`, and an optional "auto-start next focus" toggle.
3. Two on-screen focus/break cues: a thin progress line along the bottom edge of the window, and a
   slight eased tint of the pixel scene (cooler/dimmer in focus, warmer in a break).

`node .handoff/check-focus.mjs` must exit 0 when done.

## Files to touch

- `index.html` — all code changes.
- `README.md` — update the `| Focus timer | ... |` row in the "City view" controls table.
- `docs/BUILD-LOG.md` — append one entry before `## Things deliberately not done`.

## Steps

All code below lives in `index.html`. The existing timer is the block starting with the comment
`Focus session — a timekeeper, not a productivity app.` and ending with the `wireSession` IIFE, plus
its CSS (`/* ---- focus timer: ...`), its markup (`<div id="focus">`), and `PIXEL.session` near the
end of the script. Keep the existing code style: 2-space indent, terse comments, `const`/`function`
declarations, no classes, no frameworks, no new external files.

### 1. Lengths and state

Replace `FOCUS_LENGTHS` / `BREAK_MIN` with:

```js
const FOCUS_LENGTHS = [25, 50];
const BREAKS = { 25: { short: 5, long: 15 }, 50: { short: 10, long: 20 } };
const ROUNDS = 4;
const CYCLE_IDLE_RESET = 60 * 60000;   // idle longer than this between rounds -> cycle starts over
```

Extend the `session` object to:

```js
const session = { kind: "idle", breakType: "", lenMin: 50, endAt: 0, startedAt: 0, totalMs: 0,
                  paused: false, pausedLeft: 0, completed: 0, autoStart: false, marks: 0, endedAt: 0 };
```

- `kind`: `"idle" | "focus" | "break"` (unchanged values).
- `breakType`: `"short" | "long"` while `kind === "break"`, else `""`.
- `totalMs`: full length of the current focus/break in ms (grows with extend).
- `completed`: focus rounds completed in the current cycle, `0..4`.
- Current round number (1-based) = `Math.min(completed + 1, ROUNDS)` while idle or in focus; during
  a break it is the round just finished (`completed`, min 1).
- `marks`: keep incrementing per completed focus (lifetime count, already persisted).

Add `sessionLeftMs()` returning `session.paused ? session.pausedLeft : Math.max(0, session.endAt - Date.now())`
and make `sessionMinLeft()` use it (`Math.ceil(sessionLeftMs() / 60000)`).

### 2. Transitions

Rewrite the transition functions with these exact behaviours:

- `startSession(min)`: only from idle. If `session.endedAt && Date.now() - session.endedAt > CYCLE_IDLE_RESET`,
  set `completed = 0`. Set `lenMin` (if `min` is in `FOCUS_LENGTHS`), `kind = "focus"`, `breakType = ""`,
  `paused = false`, `totalMs = lenMin * 60000`, `startedAt = now`, `endAt = now + totalMs`, `endedAt = 0`.
- `advanceSession()` (called when a deadline passes, never while paused):
  - focus → `completed++`, `marks++`; `breakType = completed >= ROUNDS ? "long" : "short"`;
    `kind = "break"`; `totalMs = BREAKS[lenMin][breakType] * 60000` (fallback `{short:5,long:15}` if
    `lenMin` has no entry); `startedAt = now`; `endAt = now + totalMs`; `playCadence()`.
  - break → if `breakType === "long"` set `completed = 0`. Then if `autoStart`: start the next focus
    directly (same as `startSession()` but without the idle-reset check). Otherwise `kind = "idle"`,
    `breakType = ""`, `endAt = 0`, `totalMs = 0`, `endedAt = now`.
  - Always `savePrefs()` at the end (wrapped in try/catch like today).
- `stopSession()`: back to idle and **reset the cycle** (`completed = 0`), `paused = false`, `breakType = ""`,
  `endAt = 0`, `totalMs = 0`, `endedAt = 0`.
- `pauseSession()`: only when `kind !== "idle"` and not paused: `pausedLeft = max(0, endAt - now)`, `paused = true`.
- `resumeSession()`: only when paused: `endAt = now + pausedLeft`, `paused = false`, `pausedLeft = 0`.
- `extendSession(min = 5)`: only when `kind !== "idle"`: add `min * 60000` to `totalMs` and to
  `pausedLeft` (if paused) or `endAt` (if running).
- `skipBreak()`: only when `kind === "break"`: if `breakType === "long"` set `completed = 0`; then start the
  next focus directly (no idle-reset check), keeping `lenMin`.
- `setAutoStart(on)`: `session.autoStart = !!on`; repaint; save.
- `tickSession()`: advance only if `kind !== "idle" && !paused && endAt && now >= endAt`; then `paintSession()`.
- Every state-changing function calls `paintSession()` and `savePrefs()` (try/catch).

### 3. Persistence

- `sessionSave()` returns `{ kind, breakType, lenMin, endAt, startedAt, totalMs, paused, pausedLeft, completed, autoStart, marks }`.
- `restoreSession(pr)` restores all of those with type checks. `autoStart` and `lenMin` and `marks` and
  `completed` (integer 0..4) restore always. A running (not paused) session whose `endAt` is more than
  2 minutes in the past goes idle (existing rule). A paused session restores as paused if it was saved
  less than 12 hours ago — store `savedAt: Date.now()` in `sessionSave()` and check it; otherwise idle.
- `savePrefs()` / `loadPrefs()` already call these; leave that wiring as is.

### 4. Panel markup and CSS

Replace the inside of `<div id="focusPanel" ...>` with (keep the `role`/`aria-label`/`hidden` on the panel):

```html
<div class="fp-top"><span id="focusKind">focus</span><span id="focusRounds" aria-label="Round 1 of 4"></span></div>
<span id="focusLeft">50m</span>
<div id="focusLens" role="group" aria-label="Session length">
  <button data-len="25" aria-pressed="false">25m</button>
  <button data-len="50" aria-pressed="true">50m</button>
</div>
<div id="focusCtl">
  <button id="focusPause">pause</button>
  <button id="focusMore" title="Add 5 minutes">+5m</button>
</div>
<button id="focusGo">start</button>
<label id="focusAuto"><input type="checkbox" id="focusAutoBox"> auto-start next focus</label>
<span id="focusNote"></span>
```

`paintSession()` fills `#focusRounds` with exactly 4 `<span class="dot">` children (create them once,
then only toggle classes): class `done` for indexes `< completed`, class `now` for the current round
while `kind === "focus"`.

CSS (add next to the existing `#focus...` rules, same palette: gold `#e8cb84`, green `#9fd0b8`,
muted `#8798a2` / `#8fa0a9`):

- `.fp-top{display:flex;justify-content:space-between;align-items:center}`
- `#focusRounds{display:inline-flex;gap:4px}`; `#focusRounds .dot{width:6px;height:6px;border-radius:50%;border:1px solid rgba(255,255,255,.3)}`;
  `.dot.done{background:#e8cb84;border-color:#e8cb84}`; `.dot.now{border-color:#e8cb84;box-shadow:0 0 0 2px rgba(232,203,132,.18)}`.
- `#focusCtl{display:flex;gap:6px}`, `#focusCtl button{flex:1}`, `#focusCtl[hidden]{display:none}`.
- `#focusAuto{display:flex;align-items:center;gap:6px;color:#8fa0a9;font-size:11.5px;cursor:pointer}`, `#focusAuto[hidden]{display:none}`.
- `#focusLeft.paused{opacity:.55}`; `#focusPill[data-paused="true"]{opacity:.7}`.

### 5. Painting rules (`paintSession()`)

- `#focusKind` text: idle → `focus`; focus → `focus · round N of 4`; break → `short break` or `long break`;
  append ` · paused` when paused.
- `#focusLeft`: idle → `lenMin + "m"`; otherwise minutes left + `"m"`; classes `focus`/`break` as today plus `paused`.
- `#focusLens` visible only when idle. `#focusAuto` visible only when idle; checkbox reflects `autoStart`.
- `#focusCtl` visible only when not idle; `#focusPause` text `pause` / `resume`.
- `#focusGo` text: idle → `start`; focus → `stop`; break → `skip break`.
  Click: idle → start; focus → stop; break → `skipBreak()`.
- `#focusNote`:
  - focus running → `ends HH:MM, then a 5m break` (use the real next break type and length;
    for the 4th round say `long break`, e.g. `then a 15m long break`).
  - break running → `back at HH:MM` when auto-start is off, `next focus at HH:MM` when on.
  - paused → `paused · N min left`.
  - idle within 90 s of a break ending → existing `break ended …` text; otherwise idle →
    `round N of 4 · f to start` (N = next round).
  - `HH:MM` uses the existing `sessionClock(ms)`.
- Pill text (`#focusPillText`): idle → `focus`; focus → `Nm`; short break → `break Nm`; long break → `long break Nm`.
  Set `pill.dataset.kind` as today and `pill.dataset.paused = String(session.paused)`.
- Tab title (`paintTitle()`): unchanged format, plus prefix `‖ ` when paused.

### 6. Progress line

- Markup: add `<div id="focusLine" aria-hidden="true" hidden></div>` directly after `<div id="focus">…</div>`.
- CSS: `#focusLine{position:fixed;left:0;bottom:0;height:3px;width:0;z-index:5;pointer-events:none;background:#e8cb84;opacity:.75;transition:width 1s linear,background .6s,opacity .6s}`,
  `#focusLine[data-kind="break"]{background:#9fd0b8}`, `#focusLine.paused{opacity:.3}`, `#focusLine[hidden]{display:none}`.
- `paintSession()` sets: hidden when idle; otherwise `dataset.kind = session.kind`,
  `style.width = (progress * 100).toFixed(2) + "%"`, class `paused` when paused.
- `progress` = `totalMs > 0 ? clamp(1 - sessionLeftMs() / totalMs, 0, 1) : 0` (use the existing `clamp` helper).
- Add `@media (prefers-reduced-motion: reduce){ #focusLine{transition:none} }`.

### 7. Scene tint

- Add module-level `const sessionTint = { focus: 0, brk: 0 };` inside the focus-session block.
- In `grade(m)` (the `/* --- grade */` section), right before the final
  `b.globalCompositeOperation = "source-over";`, ease and apply:
  - targets: focus running → `{focus: 0.12, brk: 0}`; break running → `{focus: 0, brk: 0.05}`; idle → both 0;
    paused → half of the running targets.
  - ease each value per call: `v += (target - v) * 0.03`.
  - apply focus with `multiply`: `rgba(168,182,206,focus)` full-frame `fillRect(0,0,BW,BH)` when `focus > 0.002`.
  - apply break with `lighter`: `rgba(255,224,170,brk)` full-frame when `brk > 0.002`.
  - restore `b.globalCompositeOperation` correctly so the existing final `source-over` line still runs last.
- `grade()` runs from the frame loop after the script has fully evaluated, so referencing `session` /
  `sessionTint` there is safe; do **not** use `typeof session` guards (a `const` in TDZ throws on `typeof`).
- In `updateAudio()`, the existing `phase` expression must treat paused as neutral:
  `session.paused ? 1 : (existing expression)`.

### 8. Wiring

In the `wireSession` IIFE:
- `#focusPause` click → pause/resume toggle. `#focusMore` click → `extendSession(5)`.
- `#focusAutoBox` change → `setAutoStart(checkbox.checked)`.
- `#focusGo` click per step 5.
- Keys (same input/textarea/select guard as today): `f` start/stop (unchanged); `p` pause/resume when not idle;
  `Escape` unchanged (close panel if open, else stop).
- The existing outside-click close and `pagehide` save stay.

### 9. `PIXEL.session` test API

Replace the `session: { ... }` object inside `const PIXEL = { ... }` with:

```js
session: {
  get(){ return { kind: session.kind, breakType: session.breakType, lenMin: session.lenMin,
                  leftMs: sessionLeftMs(), totalMs: session.totalMs,
                  progress: session.totalMs > 0 ? clamp(1 - sessionLeftMs() / session.totalMs, 0, 1) : 0,
                  paused: session.paused, completed: session.completed, round: <current round per step 1>,
                  rounds: ROUNDS, autoStart: session.autoStart, marks: session.marks, title: document.title }; },
  start(min){ return startSession(min); },
  stop(){ stopSession(); },
  tick(){ tickSession(); },
  endIn(ms){ session.endAt = Date.now() + Math.max(0, ms); if(session.paused) session.pausedLeft = Math.max(0, ms); },
  pause(){ pauseSession(); }, resume(){ resumeSession(); },
  extend(min){ extendSession(min); }, skip(){ skipBreak(); },
  setAutoStart(on){ setAutoStart(on); },
  tint(){ return { focus: sessionTint.focus, brk: sessionTint.brk }; },
  row(){ const r = document.getElementById("focusPillText"); return r ? r.textContent : null; }
},
```

### 10. Docs

- `README.md`: replace the `| Focus timer | ... |` row with one row describing: the `◷ focus` pill opens the
  panel; 25 or 50 minute focus in rounds of 4 with short breaks (5/10) and a long break (15/20) after the
  4th; pause, `+5m`, skip break, optional auto-start; `f` start/stop, `p` pause, `Esc` closes the panel;
  a thin line along the bottom edge fills gold in focus and green in a break, and the scene tints slightly.
- `docs/BUILD-LOG.md`: add `## Oct 30 — pomodoro rounds and on-screen cues` with 3–5 sentences in the
  existing log voice, placed directly before `## Things deliberately not done`.

## Acceptance

Run from the repository root (`C:/Users/sz/Code/pagoda-garden`):

1. `node .handoff/check-focus.mjs` — exits 0 and its last line is `all 20 checks passed`.
2. `git status --porcelain` — lists only `M index.html`, `M README.md`, `M docs/BUILD-LOG.md`
   (plus `.handoff/` entries if untracked).
3. `git diff --stat -- . ":(exclude).handoff"` — touches exactly `index.html`, `README.md`, `docs/BUILD-LOG.md`.
4. `grep -c "focusLine" index.html` — prints a number ≥ 3.
5. `grep -n "typeof session" index.html` — prints nothing (exit 1).

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- Do not modify `.handoff/check-focus.mjs` or `.handoff/plan.md`.
- No new files, no external scripts/CDNs, no dependencies, no build step; the page must keep working from `file://`.
- Do not change any city art, weather, audio (other than the one `phase` line), or corner-card code.
- Keep all existing behaviour not mentioned here (outside-click close, `Esc`, title countdown, cadence pluck, wall-clock deadlines).

## Out of scope

- Custom/free-form durations or stepper settings (only the 25 and 50 presets).
- Notifications, sounds beyond the existing cadence pluck, stats/streaks/history.
- Changes to `voxel-garden/`, `proto/`, or the refactor into multiple files.

## If blocked

If a step cannot be done as written (an anchor named here is missing, a check in
`.handoff/check-focus.mjs` contradicts this plan, or Edge cannot launch), stop, leave the working
tree as it is, and write in `.handoff/report.md`: which step, the exact error or mismatch, and what
you would need to proceed. Do not improvise around it.
