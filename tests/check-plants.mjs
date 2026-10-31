// Headless checks for the garden's seeds and plants (voxel-garden/index.html).
// Launches headless Edge or Chrome, stubs the weather fetch so no check needs the
// network, seeds localStorage per check, prints PASS/FAIL per check, exits 0 only
// if all pass.
// No dependencies: Node >= 22 (global fetch + WebSocket).
//   node tests/check-plants.mjs
import { launch, until, check, report, pageUrl } from "./browser.mjs";

const H = 3600000;

// Every load uses a prelude: optionally a fresh localStorage, optionally the city
// page's session marks and a stored garden, and always a fetch that answers the
// Open-Meteo request with Overcast and 7 °C (or the requested weather code).
function prelude({ clear = false, marks, store, code = 3 } = {}) {
  return `
${clear ? "try{localStorage.clear()}catch(e){}" : ""}
${typeof marks === "number"
    ? `try{localStorage.setItem("pagoda-pixel-window.v1", JSON.stringify({ session: { marks: ${JSON.stringify(marks)} } }))}catch(e){}`
    : ""}
${store === undefined
    ? ""
    : `try{localStorage.setItem("pagoda-garden.plants.v1", ${JSON.stringify(JSON.stringify(store))})}catch(e){}`}
window.fetch = () => Promise.resolve(new Response(JSON.stringify(
  { current: { weather_code: ${JSON.stringify(code)}, temperature_2m: 7, cloud_cover: 80 } }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
`;
}

const storeWith = (plants, spent = 0) => ({ spent, plants });

let b = null;
try {
  b = await launch();
  const evaluate = b.evaluate;
  const exceptions = b.exceptions;

  // Load the garden and wait for its script to expose PLANTS.
  async function loadGarden(opts) {
    await b.load(pageUrl("voxel-garden/index.html"), { prelude: prelude(opts) });
    await until(() => evaluate(`typeof PLANTS === "object"`));
  }

  await check("no seeds yet", async () => {
    await loadGarden({ clear: true });
    const r = await evaluate(`({ pill: document.getElementById("bedPill").textContent,
                                 plants: PLANTS.get().plants.length })`);
    return r.pill === "seeds 0" && r.plants === 0 || r;
  });

  await check("a finished round earns a seed", async () => {
    await b.load(pageUrl("index.html"), { prelude: prelude({ clear: true }) });
    await until(() => evaluate(`typeof PIXEL === "object"`));
    const note = await evaluate(`(() => {
      PIXEL.session.start(25); PIXEL.session.endIn(0); PIXEL.session.tick();
      return document.getElementById("focusNote").textContent;
    })()`);
    if (!String(note).includes("seed")) return { note };
    await loadGarden({ clear: false });
    const ok = await until(() => evaluate(`document.getElementById("bedPill").textContent === "seeds 1"`));
    return ok || evaluate(`({ pill: document.getElementById("bedPill").textContent })`);
  });

  await check("planting spends a seed", async () => {
    await loadGarden({ clear: true, marks: 2 });
    const r = await evaluate(`(() => {
      const planted = PLANTS.plant(1, 1, "poppy");
      return { planted, seeds: PLANTS.get().seeds,
               vox: S.vox.some(v => v[0] === 1 && v[1] === 1 && v[2] === 1) };
    })()`);
    return r.planted === true && r.seeds === 1 && r.vox === true || r;
  });

  await check("planting refused on water, path, pagoda and used ground", async () => {
    await loadGarden({ clear: true, marks: 5 });
    const r = await evaluate(`(() => {
      const planted = PLANTS.plant(1, 1, "poppy");
      const refused = [[5, 5], [9, 1], [15, 15], [1, 1]]
        .map(([x, z]) => PLANTS.plant(x, z, "poppy"));
      return { planted, refused, seeds: PLANTS.get().seeds };
    })()`);
    return r.planted === true && r.refused.every(v => v === false) && r.seeds === 4 || r;
  });

  await check("no seed, no planting", async () => {
    await loadGarden({ clear: true });
    const planted = await evaluate(`PLANTS.plant(1, 1, "poppy")`);
    return planted === false || { planted };
  });

  await check("a plant survives a reload", async () => {
    await loadGarden({ clear: true, marks: 1 });
    const planted = await evaluate(`PLANTS.plant(2, 1, "snowdrop")`);
    await loadGarden({ clear: false, marks: 1 });
    const r = await evaluate(`(() => { const g = PLANTS.get();
      return { seeds: g.seeds, plants: g.plants }; })()`);
    return planted === true && r.plants.length === 1 && r.plants[0].kind === "snowdrop" &&
           r.seeds === 0 || { planted, r };
  });

  await check("a tap plants on the tile under it", async () => {
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await loadGarden({ clear: true, marks: 1 });
    // a still view: two real frames with the ambient turn off
    await until(() => evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`));
    await evaluate(`document.getElementById("bedPill").click();
                    document.querySelector('[data-kind="poppy"]').click();`);
    const pt = await evaluate(`(() => { const p = project(10.5, 1, 18.5);
      return [p[0] / DPR, p[1] / DPR]; })()`);
    const [x, y] = pt;
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    const ok = await until(() => evaluate(`(() => {
      const g = PLANTS.get();
      return g.plants.length === 1 && g.plants[0].x === 10 && g.plants[0].z === 18 &&
             g.seeds === 0 && g.planting === null;
    })()`));
    return ok || evaluate(`PLANTS.get()`);
  });

  await check("a drag plants nothing", async () => {
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await loadGarden({ clear: true, marks: 1 });
    await until(() => evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`));
    await evaluate(`document.getElementById("bedPill").click();
                    document.querySelector('[data-kind="poppy"]').click();`);
    const pt = await evaluate(`(() => { const p = project(10.5, 1, 18.5);
      return [p[0] / DPR, p[1] / DPR]; })()`);
    const [x, y] = pt;
    await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 60, y, button: "left", buttons: 1 });
    await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + 60, y, button: "left", clickCount: 1 });
    const r = await evaluate(`PLANTS.get()`);
    await b.send("Emulation.setEmulatedMedia", { features: [] });
    return r.plants.length === 0 && r.seeds === 1 && r.planting === "poppy" || r;
  });

  await check("plants grow with time", async () => {
    const now = Date.now();
    await loadGarden({ clear: true, store: storeWith([
      { x: 1, z: 1, kind: "poppy", at: now - 1 * H, rain: 0 },
      { x: 2, z: 1, kind: "poppy", at: now - 7 * H, rain: 0 },
      { x: 3, z: 1, kind: "poppy", at: now - 25 * H, rain: 0 }
    ]) });
    const r = await evaluate(`(() => {
      const top = x => { let m = -1;
        for (const v of S.vox) if (v[0] === x && v[2] === 1 && v[1] > m) m = v[1];
        return m; };
      return { stages: PLANTS.get().plants.map(p => p.stage), tops: [top(1), top(2), top(3)] };
    })()`);
    return r.stages.join(",") === "0,1,2" && r.tops.join(",") === "1,2,3" || r;
  });

  await check("rain waters plants", async () => {
    const now = Date.now();
    await loadGarden({ clear: true, code: 61, store: storeWith([
      { x: 1, z: 1, kind: "poppy", at: now - 5.5 * H, rain: 0 }
    ]) });
    if (!await until(() => evaluate(`currentWx === "rain"`))) return evaluate(`({ wx: currentWx })`);
    const before = await evaluate(`PLANTS.get().plants[0]`);
    await evaluate(`PLANTS.tick(${H})`);
    const after = await evaluate(`PLANTS.get().plants[0]`);
    return before.stage === 0 && after.stage === 1 && after.rain >= H || { before, after };
  });

  await check("dry weather does not", async () => {
    const now = Date.now();
    await loadGarden({ clear: true, store: storeWith([
      { x: 1, z: 1, kind: "poppy", at: now - 5.5 * H, rain: 0 }
    ]) });
    await until(() => evaluate(`document.getElementById("infoCond").textContent !== "Loading…"`));
    const before = await evaluate(`PLANTS.get().plants[0]`);
    await evaluate(`PLANTS.tick(${H})`);
    const after = await evaluate(`PLANTS.get().plants[0]`);
    return before.stage === 0 && after.stage === 0 && after.rain === 0 || { before, after };
  });

  await check("bloom rules", async () => {
    await loadGarden({ clear: true });
    const r = await evaluate(`({
      poppy: PLANTS.open("poppy", 12, "clear"),
      moonNight: PLANTS.open("moonflower", 23, "clear"),
      moonEarly: PLANTS.open("moonflower", 3, "clear"),
      moonDay: PLANTS.open("moonflower", 12, "clear"),
      snowSnow: PLANTS.open("snowdrop", 12, "snow"),
      snowClear: PLANTS.open("snowdrop", 12, "clear")
    })`);
    return r.poppy === true && r.moonNight === true && r.moonEarly === true &&
           r.moonDay === false && r.snowSnow === true && r.snowClear === false || r;
  });

  await check("a bloom shows in the scene", async () => {
    const now = Date.now();
    await loadGarden({ clear: true, store: storeWith([
      { x: 1, z: 1, kind: "snowdrop", at: now - 25 * H, rain: 0 }
    ]) });
    const r = await evaluate(`(() => {
      const top = () => { const v = S.vox.find(v => v[0] === 1 && v[1] === 3 && v[2] === 1);
                          return v ? v[3] : null; };
      setWeather("snow"); PLANTS.tick(0);
      const snow = top();
      setWeather("clear"); PLANTS.tick(0);
      const clear = top();
      return { snow, clear, wantSnow: PLANT_KINDS.snowdrop.bloom, wantClear: PLANT_BUD };
    })()`);
    return r.snow === r.wantSnow && r.clear === r.wantClear || r;
  });

  await check("bed panel", async () => {
    await loadGarden({ clear: true, marks: 1 });
    const r = await evaluate(`(() => {
      const panel = document.getElementById("bedPanel");
      const pill = document.getElementById("bedPill");
      const hiddenBefore = panel.hidden;
      pill.click();
      const hiddenAfter = panel.hidden;
      const buttons = [...panel.querySelectorAll("[data-kind]:not([hidden])")];
      const q = pill.getBoundingClientRect();
      const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return { hiddenBefore, hiddenAfter, count: buttons.length,
               disabled: buttons.filter(x => x.disabled).length,
               onTop: top === pill || pill.contains(top) };
    })()`);
    return r.hiddenBefore === true && r.hiddenAfter === false && r.count === 3 &&
           r.disabled === 0 && r.onTop === true || r;
  });

  await check("no uncaught page exceptions", async () => exceptions.length === 0 || exceptions.slice(0, 3));
} catch (e) {
  await check("harness", () => { throw e; });
} finally {
  try { b && await b.close(); } catch {}
}

process.exit(report() ? 1 : 0);
