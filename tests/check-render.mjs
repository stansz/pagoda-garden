// Deterministic render comparison for index.html (six cities) and voxel-garden.
//
//   node tests/check-render.mjs            compares against tests/golden/render.json
//   node tests/check-render.mjs --update   rewrites that file from the current pages
//
// Each page is loaded with a frozen clock, a seeded Math.random, a virtual
// requestAnimationFrame clock and a stubbed weather fetch, stepped a fixed number
// of frames, then hashed: canvas = FNV-1a of every #scene pixel byte, text =
// FNV-1a of document.body.innerText. Nothing here is run in CI: the golden file
// is produced on Windows.
// No dependencies: Node >= 22 (global fetch + WebSocket).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep, pageUrl } from "./browser.mjs";

const UPDATE = process.argv.includes("--update");
const GOLDEN = fileURLToPath(new URL("./golden/render.json", import.meta.url));

const CITIES = ["vancouver", "toronto", "hawaii", "hongkong", "amsterdam", "sydney"];
const INSTANTS = [
  ["jan", Date.parse("2026-01-15T20:00:00Z")],
  ["jul", Date.parse("2026-07-15T04:00:00Z")],
];

const ENTRIES = [];
for (const [season, t] of INSTANTS)
  for (const id of CITIES) ENTRIES.push({ key: `index/${id}/${season}`, url: pageUrl(`index.html?city=${id}`), t });
for (const [season, t] of INSTANTS)
  ENTRIES.push({ key: `garden/-/${season}`, url: pageUrl("voxel-garden/index.html"), t });

// Prelude for one instant: freeze Date at t, seed Math.random with mulberry32, put
// performance.now() on a virtual clock, queue requestAnimationFrame callbacks for
// window.__step, answer the weather fetch and start with a fresh localStorage.
const preludeFor = t => `(() => {
  try{localStorage.clear()}catch(e){}
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args){ if (args.length === 0) super(${t}); else super(...args); }
    static now(){ return ${t}; }
  }
  window.Date = FakeDate;
  let seed = 0x9e3779b9 >>> 0;
  Math.random = function(){
    seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  let __t = 1000;
  Object.defineProperty(window.performance, "now", { configurable: true, value: () => __t });
  let frameQueue = [];
  window.requestAnimationFrame = cb => { frameQueue.push(cb); return frameQueue.length; };
  window.__step = n => {
    for (let i = 0; i < n; i++){
      __t += 16;
      const batch = frameQueue;
      frameQueue = [];
      for (const cb of batch) cb(__t);
    }
  };
  window.fetch = () => Promise.resolve(new Response(JSON.stringify(
    { current: { weather_code: 3, temperature_2m: 7, cloud_cover: 80 } }),
    { status: 200, headers: { "Content-Type": "application/json" } }));
})();
`;

// FNV-1a 32-bit, 8 lowercase hex digits, of the #scene pixel bytes and of the
// UTF-8 bytes of the rendered text.
const HASHES = `(() => {
  const fnv = bytes => {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  const c = document.getElementById("scene");
  const px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  return { canvas: fnv(px), text: fnv(new TextEncoder().encode(document.body.innerText)) };
})()`;

let golden = null;
if (!UPDATE) {
  if (!existsSync(GOLDEN)) {
    console.error(`FAIL golden: ${GOLDEN} not found; run node tests/check-render.mjs --update to create it`);
    process.exit(2);
  }
  try {
    golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  } catch (e) {
    console.error(`FAIL golden: ${GOLDEN} is not valid JSON (${e.message}); regenerate it with --update`);
    process.exit(2);
  }
}

let b = null;
let exitCode = 1;
try {
  b = await launch();
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await b.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });

  const rendered = {};
  for (const entry of ENTRIES) {
    await b.load(entry.url, { prelude: preludeFor(entry.t) });
    await sleep(1500);                       // let timers and the stubbed fetch settle
    await b.evaluate(`window.__step(60)`);   // then run a fixed number of frames
    rendered[entry.key] = await b.evaluate(HASHES);
  }

  if (UPDATE) {
    mkdirSync(dirname(GOLDEN), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(rendered, null, 2) + "\n");
    console.log(`wrote ${ENTRIES.length} renders to tests/golden/render.json`);
    exitCode = 0;
  } else {
    let failed = 0;
    for (const entry of ENTRIES) {
      const exp = golden[entry.key];
      const got = rendered[entry.key];
      const ok = !!exp && exp.canvas === got.canvas && exp.text === got.text;
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"} ${entry.key}${ok ? "" :
        `  expected ${exp ? `${exp.canvas} / ${exp.text}` : "missing"} got ${got.canvas} / ${got.text}`}`);
    }
    console.log(failed ? `${failed} render(s) differ` : `all ${ENTRIES.length} renders match`);
    exitCode = failed ? 1 : 0;
  }
} catch (e) {
  console.error(`FAIL harness: ${e.message || e}`);
  exitCode = 1;
} finally {
  try { b && await b.close(); } catch {}
}

process.exit(exitCode);
