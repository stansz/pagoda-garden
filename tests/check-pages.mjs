// Headless checks for index.html (all six cities) and voxel-garden/index.html.
// Launches headless Edge or Chrome, stubs the weather fetch so no check needs the
// network, prints PASS/FAIL per check, exits 0 only if all pass.
// No dependencies: Node >= 22 (global fetch + WebSocket).
//   node tests/check-pages.mjs
import { launch, until, check, report, pageUrl } from "./browser.mjs";

const CITIES = ["vancouver", "toronto", "hawaii", "hongkong", "amsterdam", "sydney"];

// Every load uses a prelude: a fresh localStorage, and a fetch that answers the
// Open-Meteo request with Overcast and 7 °C, so no check depends on the network.
// PRELUDE_WITH can seed one localStorage entry (null seeds nothing) and pick the
// stubbed weather code; the weather is still Overcast at the default code 3.
function PRELUDE_WITH(storageKey, value, weatherCode = 3) {
  return `
try{localStorage.clear()}catch(e){}
${storageKey === null ? "" : `try{localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(value))})}catch(e){}`}
window.fetch = () => Promise.resolve(new Response(JSON.stringify(
  { current: { weather_code: ${JSON.stringify(weatherCode)}, temperature_2m: 7, cloud_cover: 80 } }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
`;
}

// The default prelude: fresh storage, nothing seeded, Overcast.
const PRELUDE = PRELUDE_WITH(null, null);

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

// The clock label must agree with Sydney's real time; allow one minute for the gap
// between computing that time and reading the label, and handle the midnight wrap.
const SYDNEY_CLOCK = `(() => {
  const want = new Date().toLocaleTimeString("en-GB",
    { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const got = document.getElementById("infoClock").textContent;
  const toMin = s => {
    const m = /^(\\d\\d):(\\d\\d)$/.exec(s);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(want), b = toMin(got);
  const diff = a === null || b === null ? null : Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));
  return { want, got, diff };
})()`;

// hour is a top-level `let` in render.js, so evaluate can read it straight off the
// page's global scope and compare the rendered scene's time with the city's clock.
const SYDNEY_SCENE = `(() => {
  const h = hour, want = localHour("Australia/Sydney");
  return { hour: h, want, diff: Math.abs(h - want) };
})()`;

const WEATHER_STATE = `(() => ({
  wx: currentWx,
  cond: document.getElementById("infoCond").textContent
}))()`;

// The manual time/weather UI is gone: returns the selectors that still match.
const MANUAL_CONTROLS = `(() => {
  const sels = ["#ui", "#hour", "#clock", "#cycle", "[data-wx]", "[data-place=\\"local\\"]", "#infoScene"];
  return sels.filter(s => document.querySelector(s) !== null);
})()`;

// The garden's controls live in the corner card: returns the ids not inside #info.
const CARD_CONTROLS = `(() => {
  const info = document.getElementById("info");
  const ids = ["place", "snd", "vol", "zin", "zout"];
  return ids.filter(id => {
    const el = document.getElementById(id);
    return !el || !info.contains(el);
  });
})()`;

let b = null;
try {
  b = await launch();
  const evaluate = b.evaluate;
  const exceptions = b.exceptions;
  const load = (relPath) => b.load(pageUrl(relPath), { prelude: PRELUDE });
  // a load that also seeds one localStorage entry and can pick the stubbed weather
  const loadWith = (relPath, storageKey, value, weatherCode) =>
    b.load(pageUrl(relPath), { prelude: PRELUDE_WITH(storageKey, value, weatherCode) });

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
      return r.lit >= 20 && r.place === "Vancouver";
    });
    return ok ? true : evaluate(gardenState);
  });

  await check("saved city garden link", async () => {
    await loadWith("index.html", "pagoda-pixel-window.v1", { city: "toronto" });
    const ok = await until(() => evaluate(
      `typeof PIXEL === "object" && PIXEL.state.city === "toronto" && ` +
      `String(document.getElementById("gardenLink").getAttribute("href")).includes("city=toronto")`));
    return ok ? true : evaluate(
      `({ city: PIXEL.state.city, href: document.getElementById("gardenLink").getAttribute("href") })`);
  });

  await check("garden manual controls gone", async () => {
    await load("voxel-garden/index.html");
    const ok = await until(async () => (await evaluate(MANUAL_CONTROLS)).length === 0);
    return ok ? true : evaluate(MANUAL_CONTROLS);
  });

  await check("garden card controls", async () => {
    await load("voxel-garden/index.html");
    const ok = await until(async () => (await evaluate(CARD_CONTROLS)).length === 0);
    return ok ? true : evaluate(CARD_CONTROLS);
  });

  await check("garden clock is the city's", async () => {
    await load("voxel-garden/index.html?city=sydney");
    const ok = await until(async () => {
      const r = await evaluate(SYDNEY_CLOCK);
      return r && r.diff !== null && r.diff <= 1;
    });
    return ok ? true : evaluate(SYDNEY_CLOCK);
  });

  await check("garden scene follows the clock", async () => {
    await load("voxel-garden/index.html?city=sydney");
    const ok = await until(async () => {
      const r = await evaluate(SYDNEY_SCENE);
      return r && r.diff < 0.05;
    });
    return ok ? true : evaluate(SYDNEY_SCENE);
  });

  await check("garden live weather", async () => {
    await loadWith("voxel-garden/index.html", null, null, 61);
    const ok = await until(async () => {
      const r = await evaluate(WEATHER_STATE);
      return r && r.wx === "rain" && r.cond.length > 0 && r.cond !== "Loading…";
    });
    return ok ? true : evaluate(WEATHER_STATE);
  });

  await check("garden remembers city", async () => {
    await loadWith("voxel-garden/index.html", "pagoda-garden.v4", { place: 5 });
    const ok = await until(() => evaluate(`document.getElementById("infoPlace").textContent === "Sydney"`));
    return ok ? true : evaluate(`({ place: document.getElementById("infoPlace").textContent })`);
  });

  // a click from code reaches a covered button, so ask what is really on top
  for (const [label, width, height] of [["desktop", 1280, 800], ["phone", 375, 812]]) {
    await check(`garden city menu on top (${label})`, async () => {
      await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await load("voxel-garden/index.html?city=sydney");
      await until(() => evaluate(`document.getElementById("infoPlace").textContent === "Sydney"`));
      const r = await evaluate(`(() => {
        document.getElementById("place").click();
        const covered = [...document.querySelectorAll("#places button")].filter(x => {
          const q = x.getBoundingClientRect();
          return !x.contains(document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2));
        }).map(x => x.textContent);
        const m = document.getElementById("places").getBoundingClientRect();
        return { covered, inside: m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight };
      })()`);
      await b.send("Emulation.clearDeviceMetricsOverride");
      return r.covered.length === 0 && r.inside || r;
    });
  }

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
