// Headless checks for index.html (all six cities) and voxel-garden/index.html.
// Launches headless Edge or Chrome, stubs the weather fetch so no check needs the
// network, prints PASS/FAIL per check, exits 0 only if all pass.
// No dependencies: Node >= 22 (global fetch + WebSocket).
//   node tests/check-pages.mjs
import { launch, until, check, report, pageUrl } from "./browser.mjs";

const CITIES = ["vancouver", "toronto", "hawaii", "hongkong", "amsterdam", "sydney"];

// Every load uses this prelude: a fresh localStorage, and a fetch that answers the
// Open-Meteo request with Overcast and 7 °C, so no check depends on the network.
const PRELUDE = `
try{localStorage.clear()}catch(e){}
window.fetch = () => Promise.resolve(new Response(JSON.stringify(
  { current: { weather_code: 3, temperature_2m: 7, cloud_cover: 80 } }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
`;

// "Canvas lit": read #scene with getImageData, sample every 97th pixel, and count
// the samples with R+G+B > 30.
const LIT = `(() => {
  const c = document.getElementById("scene");
  if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i+1] + d[i+2] > 30) lit++;
  return lit;
})()`;

const cityState = id => `(() => {
  const byId = i => document.getElementById(i);
  const c = document.getElementById("scene");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i+1] + d[i+2] > 30) lit++;
  return {
    city: PIXEL.state.city,
    place: byId("infoPlace").textContent,
    name: PIXEL.record(${JSON.stringify(id)}).name,
    clock: byId("infoClock").textContent,
    cond: byId("infoCond").textContent,
    temp: byId("infoTemp").textContent,
    lit,
    chords: PIXEL.audioProfile(${JSON.stringify(id)}).chords.length,
    href: byId("gardenLink").getAttribute("href")
  };
})()`;

const cityGood = (r, id) =>
  r && r.city === id && r.place === r.name && /^\d\d:\d\d$/.test(r.clock) &&
  r.cond === "Overcast" && String(r.temp).includes("7") && r.lit >= 20 &&
  r.chords > 0 && String(r.href).includes("city=" + id);

const gardenState = `(() => {
  const c = document.getElementById("scene");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i+1] + d[i+2] > 30) lit++;
  return { lit, place: document.getElementById("infoPlace").textContent };
})()`;

let b = null;
try {
  b = await launch();
  const evaluate = b.evaluate;
  const exceptions = b.exceptions;
  const load = (relPath) => b.load(pageUrl(relPath), { prelude: PRELUDE });

  for (const id of CITIES) {
    await check(id, async () => {
      await load(`index.html?city=${id}`);
      const ok = await until(async () => cityGood(await evaluate(cityState(id)), id));
      return ok ? true : evaluate(cityState(id));
    });
  }

  await check("city menu", async () => {
    await load("index.html?city=vancouver");
    await until(() => evaluate(`typeof PIXEL === "object" && PIXEL.state.city === "vancouver"`));
    await evaluate(`document.getElementById("cityBtn").click()`);
    await evaluate(`document.querySelector('#cityMenu button[data-city="sydney"]').click()`);
    const ok = await until(() => evaluate(
      `PIXEL.state.city === "sydney" && document.getElementById("infoPlace").textContent === "Sydney"`));
    return ok ? true : evaluate(
      `({ city: PIXEL.state.city, place: document.getElementById("infoPlace").textContent })`);
  });

  await check("garden renders", async () => {
    await load("voxel-garden/index.html");
    const ok = await until(async () => {
      const r = await evaluate(gardenState);
      return r.lit >= 20 && r.place === "Own time";
    });
    return ok ? true : evaluate(gardenState);
  });

  await check("garden weather buttons", async () => {
    await load("voxel-garden/index.html");
    await evaluate(`document.querySelector('[data-wx="rain"]').click()`);
    const ok = await until(() => evaluate(
      `document.querySelector('[data-wx="rain"]').getAttribute("aria-pressed") === "true" && ` +
      `document.querySelector('[data-wx="clear"]').getAttribute("aria-pressed") === "false"`));
    return ok ? true : evaluate(`({
      rain: document.querySelector('[data-wx="rain"]').getAttribute("aria-pressed"),
      clear: document.querySelector('[data-wx="clear"]').getAttribute("aria-pressed")
    })`);
  });

  await check("garden time slider", async () => {
    await load("voxel-garden/index.html");
    await evaluate(`(() => {
      const h = document.getElementById("hour");
      h.value = "12";
      h.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    const ok = await until(() => evaluate(`document.getElementById("clock").textContent === "12:00"`));
    return ok ? true : evaluate(`({ clock: document.getElementById("clock").textContent })`);
  });

  await check("garden zoom", async () => {
    await load("voxel-garden/index.html");
    await evaluate(`(() => { document.getElementById("zin").click(); document.getElementById("zout").click(); return true; })()`);
    // wait for two real frames so a thrown exception would have been collected
    await until(() => evaluate(
      `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`));
    return exceptions.length === 0 || exceptions.slice(0, 3);
  });

  await check("garden city", async () => {
    await load("voxel-garden/index.html");
    await evaluate(`document.querySelector('[data-place="5"]').click()`);
    const ok = await until(() => evaluate(`document.getElementById("infoPlace").textContent === "Sydney"`));
    return ok ? true : evaluate(`({ place: document.getElementById("infoPlace").textContent })`);
  });

  await check("garden back link", async () => {
    await load("voxel-garden/index.html?city=sydney");
    const ok = await until(() => evaluate(`document.getElementById("backCity").hidden === false`));
    return ok ? true : evaluate(`({ hidden: document.getElementById("backCity").hidden })`);
  });

  await check("no uncaught page exceptions", async () => exceptions.length === 0 || exceptions.slice(0, 3));
} catch (e) {
  await check("harness", () => { throw e; });
} finally {
  try { b && await b.close(); } catch {}
}

process.exit(report() ? 1 : 0);
