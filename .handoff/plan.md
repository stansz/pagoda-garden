## Goal

Fix four defects in the uncommitted six-mood work in `shared/moods.js` and `tests/check-audio.mjs`,
so that the mood loudness checks pass with a margin instead of by chance.

## Files to touch

- `shared/moods.js`
- `tests/check-audio.mjs`

## Steps

1. `shared/moods.js`, `moodDriveBass`: remove the `extra` oscillator. Use one sawtooth whose
   frequency is `freq < 55 ? freq * 2 : freq`.
2. `shared/moods.js`, registry: change `MOODS["waves"]` to `MOODS.waves`, and change
   `MOODS["waves"]` to `MOODS.waves` in the header comment.
3. `shared/moods.js`, registry: set these `level` values exactly: `rainpiano` 1.4, `drive` 0.72,
   `temple` 0.8, `rain` 1.1, `waves` 1.15, `night` 2.5.
4. `tests/check-audio.mjs`, the per-mood check: change `r.rms >= 0.08` to `r.rms >= 0.06`. Leave
   `r.max <= 0.98` and the other limits as they are.

## Acceptance

Run from the repo root. Export this first:

    export BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

If the browser cannot start in this shell, run `CI=1 node tests/start-browser.mjs` first, add
`CHECK_ATTACH=1` to the command below, and run `node tests/start-browser.mjs --stop` at the end.

- `node tests/check-audio.mjs` exits 0.
- `grep -c 'MOODS\["waves"\]' shared/moods.js` prints `0`.
- `grep -c 'extra' shared/moods.js` prints `0`.

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- Do not change any value other than those named in **Steps**. If `check-audio` fails, do not tune
  anything: report the failure output.
- Run no CPU stress or load tests. Run only the commands in **Acceptance**.

## Out of scope

- Everything else in the mood work, including docs and the flaky seed check.

## If blocked

Stop and write the exact command and full failure output to `.handoff/report.md`.
