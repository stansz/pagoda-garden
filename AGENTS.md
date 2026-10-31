# Pagoda garden

A static ambient web toy, live at https://stansz.github.io/pagoda-garden/. `index.html` is the
pixel city view and `voxel-garden/` is the garden.

Read `README.md` for features, layout and what each check proves, and `docs/REFERENCE.md` for
internals, including how to write a story. `docs/BUILD-LOG.md` and `docs/pixel-notes.md` are
history, so trust the code over them.

## Rules

- No build, dependencies, framework or ES modules. Both pages must keep working from `file://`.
- Classic scripts share one global scope per page, so search before adding a top-level name. A
  new script needs a tag in its page, and `city/pixel.js` stays last because it boots the page.
- Time and weather are never controls: scenes follow the city's real clock and sky.
- `localStorage` keys (`pagoda-*.v1`) hold real players' saves and the pages read each other's,
  so a format change must still read what is stored.
- The corner card and its preferences exist separately in each page, so change both.
- Keep files UTF-8 with LF endings, and never write them with PowerShell `Set-Content`.
- Pushing to `main` publishes the site, so commit or push only when asked.
- A user-visible change also updates `README.md` and `docs/REFERENCE.md`.

## Checks

Run from the repo root, with Node 22+ and nothing to install. CI runs the first line.

```bash
node tests/check-story.mjs && node tests/check-focus.mjs && node tests/check-pages.mjs && node tests/check-plants.mjs && node tests/check-walk.mjs
```

Run this too after changing what a page draws. It is Windows-only:

```bash
node tests/check-render.mjs
```

If the shell cannot start a browser, follow the end of the README's Tests section.
