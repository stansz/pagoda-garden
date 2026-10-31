// Headless checks for The Far Light (city/walk.js, city/stories/vancouver.js).
// Loads the real pages with a stubbed weather fetch, seeds localStorage per check,
// plays the story, and prints PASS/FAIL per check. Exits 0 only if all pass.
// No dependencies: Node >= 22 (global fetch + WebSocket).
//   CHECK_ATTACH=1 node tests/check-walk.mjs
import { launch, until, check, report, pageUrl } from "./browser.mjs";

const H = 3600000;
const WALK_KEY = "pagoda-walk.v1";
const PLANT_KEY = "pagoda-garden.plants.v1";

// Every load uses a prelude: optionally a fresh localStorage, optionally a stored
// walk (under Vancouver) and a stored garden, and always a fetch that answers the
// Open-Meteo request with the requested weather code and 7 °C.
function prelude({ clear = false, walk, store, code = 3 } = {}) {
  return `
${clear ? "try{localStorage.clear()}catch(e){}" : ""}
${walk === undefined
    ? ""
    : `try{localStorage.setItem(${JSON.stringify(WALK_KEY)}, ${JSON.stringify(JSON.stringify({ vancouver: walk }))})}catch(e){}`}
${store === undefined
    ? ""
    : `try{localStorage.setItem(${JSON.stringify(PLANT_KEY)}, ${JSON.stringify(JSON.stringify(store))})}catch(e){}`}
window.fetch = () => Promise.resolve(new Response(JSON.stringify(
  { current: { weather_code: ${JSON.stringify(code)}, temperature_2m: 7, cloud_cover: 80 } }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
`;
}

const walkSave = (at, { items = [], flags = [], pages = [] } = {}) => ({ at, items, flags, pages });
const storeWith = (plants, spent = 0) => ({ spent, plants });

let b = null;
try {
  b = await launch();
  const evaluate = b.evaluate;
  const exceptions = b.exceptions;

  async function loadCity(opts = {}, city = "vancouver") {
    await b.load(pageUrl(`index.html?city=${city}`), { prelude: prelude(opts) });
    await until(() => evaluate(`typeof WALK === "object"`));
    await until(() => evaluate(`(() => { const t = document.getElementById("infoCond").textContent;
      return t !== "Loading…" && t !== "—"; })()`));
  }

  async function loadGarden(opts = {}) {
    await b.load(pageUrl("voxel-garden/index.html"), { prelude: prelude(opts) });
    await until(() => evaluate(`typeof PLANTS === "object"`));
  }

  // a real click, at the centre of the light's rectangle
  async function clickLight() {
    const r = await evaluate(`(() => {
      const q = document.getElementById("walkLight").getBoundingClientRect();
      return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
    })()`);
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
    return r;
  }

  const choices = () => evaluate("WALK.choices()");
  const findChoice = async label => (await choices()).find(c => c.label === label);
  const key = k => evaluate(
    `document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true }))`);

  await check("the light shows in Vancouver", async () => {
    await loadCity({ clear: true });
    const ok = await until(() => evaluate(`document.getElementById("walkLight").hidden === false`), 3000);
    return ok || evaluate(`({ hidden: document.getElementById("walkLight").hidden })`);
  });

  await check("no light in Toronto", async () => {
    await loadCity({ clear: true }, "toronto");
    const ok = await until(() => evaluate(
      `PIXEL.state.city === "toronto" && document.getElementById("walkLight").hidden === true`), 3000);
    return ok || evaluate(`({ city: PIXEL.state.city, hidden: document.getElementById("walkLight").hidden })`);
  });

  await check("the light hides during focus", async () => {
    await loadCity({ clear: true });
    await evaluate(`PIXEL.session.start(25)`);
    const hid = await until(() => evaluate(`document.getElementById("walkLight").hidden === true`), 3000);
    if (!hid) return evaluate(`({ focus: PIXEL.session.get().kind, hidden: document.getElementById("walkLight").hidden })`);
    await evaluate(`PIXEL.session.endIn(0); PIXEL.session.tick();`);
    const showed = await until(() => evaluate(`document.getElementById("walkLight").hidden === false`), 3000);
    return showed || evaluate(`({ kind: PIXEL.session.get().kind, hidden: document.getElementById("walkLight").hidden })`);
  });

  await check("the light is clickable", async () => {
    const out = [];
    try {
      for (const [width, height] of [[1280, 800], [375, 812]]) {
        await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await loadCity({ clear: true });
        const r = await evaluate(`(() => {
          const light = document.getElementById("walkLight");
          const q = light.getBoundingClientRect();
          const x = q.left + q.width / 2, y = q.top + q.height / 2;
          const el = document.elementFromPoint(x, y);
          return { x, y, inside: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
                   onTop: el === light || light.contains(el) };
        })()`);
        out.push({ width, height, ...r });
      }
    } finally {
      await b.send("Emulation.clearDeviceMetricsOverride");
    }
    return out.every(r => r.inside && r.onTop) || out;
  });

  await check("the panel opens", async () => {
    await loadCity({ clear: true });
    await clickLight();
    const opened = await until(() => evaluate(`document.getElementById("walk").hidden === false`), 3000);
    if (!opened) return evaluate(`({ hidden: document.getElementById("walk").hidden })`);
    const r = await evaluate(`(() => {
      const body = document.getElementById("walkBody");
      const buttons = [...document.querySelectorAll("#walkChoices button")];
      return { text: body.textContent, hasBrace: body.textContent.indexOf("{") >= 0,
               buttons: buttons.map(x => x.textContent) };
    })()`);
    const want = (await choices()).map((c, i) => (i + 1) + "." + c.label);
    const same = r.buttons.length === want.length && r.buttons.every((t, i) => t === want[i]);
    return (!r.hasBrace && r.text.includes("Vancouver") && same) || { r, want };
  });

  await check("the panel fits", async () => {
    const out = [];
    try {
      for (const [width, height] of [[1280, 800], [375, 812]]) {
        await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await loadCity({ clear: true });
        await clickLight();
        await until(() => evaluate(`document.getElementById("walk").hidden === false`), 3000);
        const r = await evaluate(`(() => {
          const p = document.getElementById("walkPanel").getBoundingClientRect();
          const inside = p.left >= 0 && p.top >= 0 && p.right <= innerWidth && p.bottom <= innerHeight;
          const bad = [...document.querySelectorAll("#walkChoices button")].filter(x => {
            const q = x.getBoundingClientRect();
            const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
            return !(el === x || x.contains(el));
          }).map(x => x.textContent);
          return { inside, rect: { l: p.left, t: p.top, r: p.right, b: p.bottom }, bad };
        })()`);
        out.push({ width, height, ...r });
      }
    } finally {
      await b.send("Emulation.clearDeviceMetricsOverride");
    }
    return out.every(r => r.inside && r.bad.length === 0) || out;
  });

  await check("the fare is locked until you have one", async () => {
    await loadCity({ clear: true, walk: walkSave("dock", { flags: ["began"] }) });
    const c = await findChoice("Show him the bottle cap");
    return (c && c.enabled === false && c.hint === "the fare is one shiny thing") || c;
  });

  await check("the walk survives a reload", async () => {
    await loadCity({ clear: true });
    await evaluate("WALK.open()");
    for (const want of ["Put on your coat and go down to the water",
                        "Climb down to the beach",
                        "Dig out whatever is winking"]) {
      const ok = await evaluate(`WALK.choose(${JSON.stringify(want)})`);
      if (ok !== true) return { choose: want, ok };
    }
    await loadCity({ clear: false });
    const r = await evaluate("WALK.get()");
    return (r.at === "beach" && r.items.length === 1 && r.items[0] === "cap" &&
            r.flags.includes("began")) || r;
  });

  await check("gains are announced", async () => {
    await loadCity({ clear: true });
    await evaluate("WALK.open()");
    for (const want of ["Put on your coat and go down to the water",
                        "Climb down to the beach",
                        "Dig out whatever is winking"])
      await evaluate(`WALK.choose(${JSON.stringify(want)})`);
    const text = await evaluate(
      `[...document.querySelectorAll("#walkBody .walk-got")].map(p => p.textContent).join(" ")`);
    return text.includes("bottle cap") || text;
  });

  await check("Esc closes the walk and spares the timer", async () => {
    await loadCity({ clear: true });
    await evaluate(`PIXEL.session.start(25); PIXEL.session.endIn(0); PIXEL.session.tick();`);
    const opened = await evaluate("WALK.open()");
    await key("Escape");
    const r = await evaluate(
      `({ open: !document.getElementById("walk").hidden, kind: PIXEL.session.get().kind })`);
    return (opened === true && r.open === false && r.kind === "break") || r;
  });

  await check("f does nothing while the walk is open", async () => {
    await loadCity({ clear: true });
    await evaluate("WALK.open()");
    await key("f");
    const kind = await evaluate("PIXEL.session.get().kind");
    return kind === "idle" || { kind };
  });

  await check("a number key chooses", async () => {
    await loadCity({ clear: true });
    await evaluate("WALK.open()");
    await key("1");
    const at = await evaluate("WALK.get().at");
    return at === "seawall" || { at };
  });

  await check("rain opens the spider", async () => {
    const walk = walkSave("lagoon", { flags: ["began", "quest"] });
    await loadCity({ clear: true, walk, code: 3 });
    const dry = await findChoice("Ask the spider for a length of thread");
    if (!dry || dry.enabled !== false) return { dry };
    await loadCity({ clear: true, walk, code: 61 });
    const wet = await findChoice("Ask the spider for a length of thread");
    return (wet && wet.enabled === true) || { wet };
  });

  await check("the gun keeps time", async () => {
    await loadCity({ clear: true, walk: walkSave("gun", { flags: ["began", "quest"] }) });
    await evaluate(`WALK.world({ hour: 12 })`);
    const day = await findChoice("Catch the spark in your cupped hands");
    await evaluate(`WALK.world({ hour: 21.5 })`);
    const night = await findChoice("Catch the spark in your cupped hands");
    return (day && day.enabled === false && night && night.enabled === true) || { day, night };
  });

  await check("fog opens the long way", async () => {
    const walk = walkSave("dock", { flags: ["began", "crossed"] });
    const want = "Ask to take the long way, through the fog";
    await loadCity({ clear: true, walk, code: 3 });
    const absent = (await choices()).every(c => c.label !== want);
    await loadCity({ clear: true, walk, code: 45 });
    const present = (await choices()).some(c => c.label === want);
    return (absent && present) || { absent, present };
  });

  await check("a grown plant unlocks the oil", async () => {
    const walk = walkSave("stiltoil", { flags: ["began", "quest"] });
    await loadCity({ clear: true, walk });
    const bare = await findChoice("Give him a cutting from your garden");
    if (!bare || bare.enabled !== false) return { bare };
    await loadCity({ clear: true, walk, store: storeWith([
      { x: 1, z: 1, kind: "poppy", at: Date.now() - 25 * H, rain: 0 }
    ]) });
    const grown = await findChoice("Give him a cutting from your garden");
    return (grown && grown.enabled === true) || { grown };
  });

  await check("a young plant does not", async () => {
    await loadCity({ clear: true, walk: walkSave("stiltoil", { flags: ["began", "quest"] }),
      store: storeWith([{ x: 1, z: 1, kind: "poppy", at: Date.now() - 1 * H, rain: 0 }]) });
    const c = await findChoice("Give him a cutting from your garden");
    return (c && c.enabled === false) || c;
  });

  await check("journal and satchel", async () => {
    await loadCity({ clear: true, walk: walkSave("window", {
      items: ["cap"], pages: ["fare"], flags: ["began", "quest"]
    }) });
    await evaluate("WALK.open()");
    const tabs = await evaluate(`[...document.querySelectorAll("[data-walk-tab]")].map(b => b.textContent)`);
    await evaluate(`document.querySelector('[data-walk-tab="satchel"]').click()`);
    const satchel = await evaluate(`document.getElementById("walkBody").textContent`);
    await evaluate(`document.querySelector('[data-walk-tab="journal"]').click()`);
    const journal = await evaluate(`document.getElementById("walkBody").textContent`);
    const ok = tabs[1] === "satchel 1" && tabs[2] === "journal 1" &&
               satchel.includes("bottle cap") && journal.includes("The fare") &&
               journal.includes("\u25cb rain-thread") && journal.includes("Secrets found 0 of 3");
    return ok || { tabs, satchel, journal };
  });

  await check("the whole story plays", async () => {
    await loadCity({ clear: true, store: storeWith([
      { x: 1, z: 1, kind: "poppy", at: Date.now() - 25 * H, rain: 0 }
    ]) });
    await evaluate("WALK.open()");
    const route = [
      { world: { hour: 12, wx: "clear", fog: false, season: "autumn" } },
      "Put on your coat and go down to the water",
      "Climb down to the beach",
      "Dig out whatever is winking",
      "Climb back up to the seawall",
      "Walk along to the ferry dock",
      "Show him the bottle cap",
      "Go up to the lighthouse door",
      "Knock three quick, one slow",
      "Ask her who she is",
      "Say you will find them",
      "Go back down",
      "Go back across",
      "Ask about the tin of oil under the seat",
      "Give him a cutting from your garden",
      "Back to the seawall",
      "Cut through the park to Lost Lagoon",
      { world: { hour: 12, wx: "rain", fog: false, season: "autumn" } },
      "Ask the spider for a length of thread",
      "Back to the seawall",
      "Follow the path out to the old gun",
      { world: { hour: 21.5, wx: "clear", fog: false, season: "autumn" } },
      "Catch the spark in your cupped hands",
      "Back to the seawall",
      "Walk along to the ferry dock",
      "Show him the bottle cap again",
      "Go up to the lighthouse door",
      "Go in",
      "Put the thread, the oil and the spark on the table",
      "Help her down the stairs",
      "Walk home"
    ];
    for (const step of route) {
      if (step && typeof step === "object") {
        await evaluate(`WALK.world(${JSON.stringify(step.world)})`);
        continue;
      }
      const ok = await evaluate(`WALK.choose(${JSON.stringify(step)})`);
      if (ok !== true) return { choose: step, ok, at: await evaluate("WALK.get()") };
    }
    const r = await evaluate(
      `({ open: !document.getElementById("walk").hidden, walk: WALK.get() })`);
    const items = r.walk.items.slice().sort();
    const ok = r.open === false && r.walk.at === "window" &&
               items.length === 2 && items[0] === "cap" && items[1] === "lantern" &&
               r.walk.flags.includes("lit");
    return ok || r;
  });

  await check("the light goes steady", async () => {
    await loadCity({ clear: true, walk: walkSave("window", { flags: ["began", "lit"] }) });
    const ok = await until(() => evaluate(
      `document.getElementById("walkLight").classList.contains("steady")`), 3000);
    return ok || evaluate(`document.getElementById("walkLight").className`);
  });

  await check("the lantern seed reaches the garden", async () => {
    await loadGarden({ clear: true, walk: walkSave("window", { items: ["lantern"] }) });
    const before = await evaluate(`({
      pill: document.getElementById("bedPill").textContent,
      hidden: document.querySelector('[data-kind="lantern"]').hidden
    })`);
    const one = await evaluate(`PLANTS.plant(1, 1, "lantern")`);
    const two = await evaluate(`PLANTS.plant(2, 1, "lantern")`);
    const after = await evaluate(`({
      pill: document.getElementById("bedPill").textContent,
      spent: JSON.parse(localStorage.getItem(${JSON.stringify(PLANT_KEY)})).spent
    })`);
    const ok = before.pill === "seeds 0 + lantern" && before.hidden === false &&
               one === true && two === false && after.pill === "seeds 0" && after.spent === 0;
    return ok || { before, one, two, after };
  });

  await check("no lantern seed, no lantern", async () => {
    await loadGarden({ clear: true });
    const r = await evaluate(`({ hidden: document.querySelector('[data-kind="lantern"]').hidden })`);
    const planted = await evaluate(`PLANTS.plant(1, 1, "lantern")`);
    return (r.hidden === true && planted === false) || { r, planted };
  });

  await check("a lantern glows", async () => {
    await loadGarden({ clear: true, walk: walkSave("window", { items: ["lantern"] }),
      store: storeWith([{ x: 1, z: 1, kind: "lantern", at: Date.now() - 25 * H, rain: 0 }]) });
    const open = await evaluate(
      `({ night: PLANTS.open("lantern", 22, "clear"), day: PLANTS.open("lantern", 12, "clear") })`);
    // one evaluate: the page resyncs `hour` from the city's clock every second
    const r = await evaluate(`(() => { hour = 22; PLANTS.tick(0);
      return { lamps: S.lamps.length, base: GARDEN_LAMPS.length }; })()`);
    const ok = open.night === true && open.day === false && r.lamps === r.base + 1;
    return ok || { open, r };
  });

  await check("the epilogue opens", async () => {
    const walk = walkSave("window", { flags: ["began", "lit"], items: ["cap", "lantern"] });
    const young = storeWith([{ x: 1, z: 1, kind: "lantern", at: Date.now() - 1 * H, rain: 0 }]);
    const grown = storeWith([{ x: 1, z: 1, kind: "lantern", at: Date.now() - 25 * H, rain: 0 }]);
    const want = "Go out and look at the lantern plant";
    await loadCity({ clear: true, walk, store: young });
    const absent = (await choices()).every(c => c.label !== want);
    await loadCity({ clear: true, walk, store: grown });
    const present = (await choices()).some(c => c.label === want);
    if (!absent || !present) return { absent, present };
    await evaluate("WALK.open()");
    const one = await evaluate(`WALK.choose(${JSON.stringify(want)})`);
    const two = await evaluate(`WALK.choose("Stay out a while longer")`);
    const r = await evaluate(
      `({ open: !document.getElementById("walk").hidden, walk: WALK.get() })`);
    const ok = one === true && two === true && r.open === false &&
               r.walk.flags.includes("done") && r.walk.pages.includes("ending");
    return ok || { absent, present, one, two, r };
  });

  await check("the satchel forgets a planted seed", async () => {
    await loadCity({ clear: true, walk: walkSave("window", { items: ["lantern"] }),
      store: storeWith([{ x: 1, z: 1, kind: "lantern", at: Date.now() - 1 * H, rain: 0 }]) });
    await evaluate("WALK.open()");
    await evaluate(`document.querySelector('[data-walk-tab="satchel"]').click()`);
    const text = await evaluate(`document.getElementById("walkBody").textContent`);
    return !text.includes("lantern seed") || text;
  });

  await check("no uncaught page exceptions", async () => exceptions.length === 0 || exceptions.slice(0, 3));
} catch (e) {
  await check("harness", () => { throw e; });
} finally {
  try { b && await b.close(); } catch {}
}

process.exit(report() ? 1 : 0);
