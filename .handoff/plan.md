## Goal

Make the `lo-fi hat is audible and sits under the snare` check in `tests/check-audio.mjs` immune to the background beds, so it fails on a quiet hat.

The working tree already holds uncommitted work. Keep all of it. Change only what is listed here.

## Files to touch

- `tests/check-audio.mjs`

## Steps

In the check named `lo-fi hat is audible and sits under the snare`, replace these lines:

```js
      setInterval(() => {
        const t = ac.currentTime;
        [airGain, rainGain].forEach(g => { g.gain.cancelScheduledValues(t); g.gain.value = 0; });
      }, 20);
```

with:

```js
      airGain.disconnect(); rainGain.disconnect();
```

## Acceptance

Run from the repo root. On this Mac, first run `export BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.

- `node tests/check-audio.mjs` exits 0 with 17 of 17 checks passing.
- `grep -c "setInterval" tests/check-audio.mjs` prints `0`.
- `grep -c "airGain.disconnect(); rainGain.disconnect();" tests/check-audio.mjs` prints `1`.

## Parallel work

None — do it sequentially.

## Constraints

- Do not commit, push, or switch branches.
- Do not touch files outside **Files to touch** except `.handoff/report.md`.
- Do not revert, reformat or rewrite any existing uncommitted change.
- Do not change any check's thresholds.

## Out of scope

- Every other check and every other file.

## If blocked

If the lines do not match, or an Acceptance command fails after one honest attempt, stop and write the failing step, the exact error and what was completed to `.handoff/report.md`. If the shell cannot start a browser, follow the end of the README's Tests section and use `CHECK_ATTACH=1`; if that also fails, say so in the report.
