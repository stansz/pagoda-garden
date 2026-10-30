"use strict";

/* =========================================================================
   Pixel garden — a low-resolution framebuffer drawn like pixel art, full bleed.
   Everything below paints into a ~480x270 art-pixel buffer using flat
   rectangles, per-pixel ordered dithering (4x4 Bayer) and image blits.
   No paths, no gradients: that keeps it honest pixel art and keeps the frame
   cheap enough to run at 60fps.
   ========================================================================= */

/* ------------------------------------------------------------------ utils */
const lerp  = (a, b, t) => a + (b - a) * t;

function mulberry32(a){
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ordered 4x4 Bayer matrix (values 0..15) — the whole dithering look comes from this
const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

const colCache = new Map();
function hex2rgb(h){
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbArrStr(c){ return "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"; }
function withA(h, a){
  const c = hex2rgb(h);
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")";
}
function mixCol(a, b, t){                    // hex + hex -> rgb string
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const key = a + b + (t * 64 | 0);
  let v = colCache.get(key);
  if(v) return v;
  const A = hex2rgb(a), B = hex2rgb(b);
  v = rgbArrStr([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
  colCache.set(key, v);
  return v;
}
function darken(h, f){
  const c = hex2rgb(h);
  return rgbArrStr([c[0] * f, c[1] * f, c[2] * f]);
}
function lighten(h, f){
  const c = hex2rgb(h);
  return rgbArrStr([lerp(c[0], 255, f), lerp(c[1], 255, f), lerp(c[2], 255, f)]);
}

/* ------------------------------------------------------------- DOM helpers */
const hasDOM = typeof document !== "undefined" && typeof document.createElement === "function";
function makeCanvas(w, h){
  const c = document.createElement("canvas");
  c.width  = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const ctx2 = c => c.getContext("2d");

/* a rectangle is the only drawing primitive we allow ourselves */
function R(g, x, y, w, h, col){
  if(w <= 0 || h <= 0) return;
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/* --------------------------------------------------------------- palettes */
// 14-16 colours per city.  Everything painted into the layers comes from here;
// the mood tint is applied once, on top of the whole frame, so the palette is
// simply multiplied towards the hour's colour and stays limited.
const PAL = {
  vancouver: {
    mtnFar:"#8ea5a8", mtnFarHi:"#aec0c1", snow:"#e6eeee", mist:"#c9d6d7",
    mtn:"#45625a", mtnHi:"#5b7d70", fir:"#22382e", firHi:"#31503f", firLo:"#152419",
    tower:"#3b4d56", towerHi:"#5a6f76", towerLo:"#24333a",
    win:"#e8b564", water:"#173440", waterHi:"#2c5d6c", waterLo:"#0c2029", whale:"#0f1e24",
    // the near tree's four seasonal colour sets (petals / foliage / amber / bark)
    tree: {
      trunk:"#3b2a20", branch:"#5a4433", snow:"#e9f1f2",
      spring:{ c:"#f2bfd0", hi:"#fbe3ec", lo:"#cf8fa6", dot:"#fff4f8" },
      summer:{ c:"#2f4a38", hi:"#466b4d", lo:"#22382e", dot:"#3c5b45" },
      autumn:{ c:"#c88a3a", hi:"#e0a94e", lo:"#96602c", dot:"#d89a34" },
      winter:{ c:"#6b4a35", hi:"#8a6648", lo:"#4a3325", dot:"#e9f1f2" }
    }
  },
  toronto: {
    haze:"#c6b192", shore:"#8b8372", shoreHi:"#a69d8a",
    twr1:"#4b4237", twr2:"#3a342c", twr3:"#5d5346", twrHi:"#7c705f",
    cn:"#6f6659", cnHi:"#928776",
    maple:"#c07a2c", maple2:"#d89a34", mapleR:"#a8452a", trunk:"#3b2a20",
    water:"#274a5e", waterHi:"#3f6e83", waterLo:"#152e3c", win:"#ffd08a",
    tree: {
      trunk:"#3b2a20", branch:"#5b4534", snow:"#eaf1f2",
      spring:{ c:"#f6dbe4", hi:"#fdf0f4", lo:"#e5b9ca", dot:"#ffffff" },
      summer:{ c:"#4d6b3f", hi:"#6d8a52", lo:"#374e2d", dot:"#5c7d48" },
      autumn:{ c:"#c07a2c", hi:"#d89a34", lo:"#a8452a", dot:"#e0a94e" },
      winter:{ c:"#6a5848", hi:"#84705c", lo:"#4b3d32", dot:"#eaf1f2" }
    }
  },
  hawaii: {
    ridge:"#3d353d", ridgeHi:"#5e5259", ridgeLo:"#282229", haze:"#c9b7b2",
    sand:"#d9c48c", sandLo:"#bda874", sandHi:"#efdfb2",
    lava:"#241f24", palm:"#2c4030", palmHi:"#47683f", palmLo:"#1b2a1e",
    lagoon:"#1f6f78", lagoonHi:"#3fa0a0", lagoonLo:"#124a55",
    pink:"#e0576f", cream:"#f2e6d0",
    // a hibiscus/plumeria shrub: evergreen in the tropics, so winter keeps a
    // crown (fewer, paler blooms) instead of going bare
    tree: {
      trunk:"#3f3026", branch:"#5a4636", snow:"#eef2f0",
      spring:{ c:"#e88fa0", hi:"#f6cfd8", lo:"#cf6a7e", dot:"#f6e8d4" },
      summer:{ c:"#47683f", hi:"#618a52", lo:"#2c4030", dot:"#f2e6d0" },
      autumn:{ c:"#6f7a3e", hi:"#93a052", lo:"#4c5528", dot:"#e8b3aa" },
      winter:{ c:"#3a5240", hi:"#4e6b50", lo:"#26382a", dot:"#f4cfc8" }
    }
  },
  hongkong: {
    hill:"#1b3b40", hillHi:"#2a545a",
    t1:"#17323a", t2:"#1e424b", t3:"#26525c", tHi:"#3c6c74",
    neon:"#e0303a", neon2:"#ff6a4a", amber:"#ffc25e", win:"#ffd08a",
    water:"#0f2a33", waterHi:"#245a66", waterLo:"#081a20",
    haze:"#7d99a2", sail:"#a83a30",
    // bauhinia: orchid-pink blossom in spring, dense green summer, a little
    // autumn colour, and a bare-ish subtropical winter
    tree: {
      trunk:"#2b2320", branch:"#453630", snow:"#e9f1f2",
      spring:{ c:"#d886b6", hi:"#efc2da", lo:"#a8558a", dot:"#f7dcea" },
      summer:{ c:"#3b5a44", hi:"#527a58", lo:"#283e2e", dot:"#6f944f" },
      autumn:{ c:"#a87a3a", hi:"#c99a4e", lo:"#7a5528", dot:"#d8a552" },
      winter:{ c:"#5a4636", hi:"#75604c", lo:"#3d3028", dot:"#e9f1f2" }
    }
  },
  amsterdam: {
    brickA:"#8f3f2e", brickB:"#a9563c", brickC:"#c07050", brickD:"#d9c6a8",
    roof:"#463630", roofLo:"#2b2320", trim:"#ece0c8", door:"#3f3026",
    canal:"#2c5142", canalHi:"#4b7f68", canalLo:"#19312a",
    gold:"#d8a552", tulipR:"#d24b6a", tulipY:"#e8b23c", leaf:"#3d5a3a", elm:"#4d6b46",
    // the canal-side elm: fresh samara green in spring, deep green summer,
    // amber autumn, bare winter
    tree: {
      trunk:"#3b3028", branch:"#55463a", snow:"#e9f1f2",
      spring:{ c:"#a8c47a", hi:"#c9e0a0", lo:"#7fa15c", dot:"#e8e2b0" },
      summer:{ c:"#3d5a3a", hi:"#587a4c", lo:"#2c4229", dot:"#4d6b46" },
      autumn:{ c:"#a8762e", hi:"#c99a44", lo:"#7c5522", dot:"#d8a552" },
      winter:{ c:"#5c4c3c", hi:"#77654f", lo:"#41352a", dot:"#e9f1f2" }
    }
  },
  sydney: {
    haze:"#b9c9cf", farHill:"#7d98a0", farHillHi:"#9ab2b8", farLo:"#5c7680",
    tower:"#5c7480", towerHi:"#7e96a0", towerLo:"#3b4f59", win:"#ffd79a",
    steel:"#5d6975", steelHi:"#8b98a3", steelLo:"#39434d",
    stone:"#a2967f", stoneHi:"#c2b69d", stoneLo:"#6d6455",
    sail:"#f2efe3", sailHi:"#ffffff", sailLo:"#cfc9b8", shellShadow:"#b7b0a0",
    podium:"#8a6a52", grass:"#4c6b45", grassHi:"#6b8b57",
    sand:"#d9c79c", sandHi:"#efdfb2",
    jac:"#8b7fbd", jacHi:"#a99dd6", jacLo:"#5f5686", bark:"#3a3129",
    ferry:"#e8e6dc", ferryGreen:"#2f6b52",
    water:"#1b4453", waterHi:"#2f6a7d", waterLo:"#0d2530",
    // southern hemisphere, so the crown runs inverted: purple blossom in
    // spring (Oct), green summer, thinned olive autumn, bare-ish winter
    tree: {
      trunk:"#3a3129", branch:"#54473c", snow:"#eef2f0",
      spring:{ c:"#8b7fbd", hi:"#a99dd6", lo:"#5f5686", dot:"#c8c0e8" },
      summer:{ c:"#4c6b45", hi:"#6b8b57", lo:"#375032", dot:"#7fa15c" },
      autumn:{ c:"#7e8450", hi:"#9aa066", lo:"#5f6538", dot:"#b0a060" },
      winter:{ c:"#6a5a48", hi:"#88765f", lo:"#4c4034", dot:"#eef2f0" }
    }
  }
};

/* ------------------------------------------------------------ city records
   One record per city.  Everything that differs between cities lives here:
   the palette, the landmark art key, the clock zone, the coordinates for the
   Open-Meteo fetch, the drift key, any per-city rules (Sydney has no snow in
   its summer), and the near/mid `tree` spec that is the source of the drift.
   The builders way below are just a table keyed by landmark.

   `tree`: one species per city, baked into a layer with four seasonal crowns:
     kind    species label (documentation + harness)
     layer   "near" or "mid" (which baked layer it belongs to)
     x       frame x as a fraction of BW; an array means a small group of
             trunks of the same species (Toronto's maples, Sydney's jacarandas)
     baseY   trunk foot as a fraction of BH (0.665 == the waterline)
     h       trunk height in art px at the 480x270 reference size (array ok)
     form    silhouette: w/h crown box, cluster count, trunk width, lean
     crowns  per season: { w,h } size multipliers, `dots` bloom count,
             `gap` for the sky holes in autumn, or `bare: true` for winter
   The crown colours themselves live in PAL[city].tree[season]. */
const CITIES = [
  {
    id: "vancouver", name: "Vancouver", seed: 11,
    lat: 49.2827, lon: -123.1207, tz: "America/Vancouver",
    palette: PAL.vancouver, landmark: "vancouver", drift: "vancouver",
    // a cherry on the far shore: blossom in spring, then a dark fir-green
    // canopy (its summer drift is fir needles), amber autumn, bare winter
    tree: {
      kind: "cherry", layer: "mid", x: 0.79, baseY: 0.665, h: 38,
      form: { w: 28, h: 26, clusters: 3, trunk: 2, lean: -2, shape: "broad" },
      crowns: {
        spring: { w: 1.00, h: 0.95, dots: 9, lift: 0.55 },
        summer: { w: 1.06, h: 1.05, dots: 0, lift: 0.55 },
        autumn: { w: 0.96, h: 0.90, dots: 3, gap: 0.55, lift: 0.55 },
        winter: { bare: true, twig: 0.85 }
      }
    }
  },
  {
    id: "toronto", name: "Toronto", seed: 23,
    lat: 43.6532, lon: -79.3832, tz: "America/Toronto",
    palette: PAL.toronto, landmark: "toronto", drift: "toronto",
    // the two maples on the near island bank, moved into the tree system
    tree: {
      kind: "maple", layer: "mid", x: [0.72, 0.84], baseY: 0.665, h: [38, 30],
      form: { w: 29, h: 27, clusters: 3, trunk: 2, lean: 1, shape: "broad" },
      crowns: {
        spring: { w: 1.00, h: 0.92, dots: 0, lift: 0.55 },
        summer: { w: 1.08, h: 1.06, dots: 0, lift: 0.55 },
        autumn: { w: 1.00, h: 0.95, dots: 0, gap: 0.50, lift: 0.55 },
        winter: { bare: true, twig: 0.90 }
      }
    }
  },
  {
    id: "hawaii", name: "Hawai'i", seed: 37,
    lat: 21.3069, lon: -157.8583, tz: "Pacific/Honolulu",
    palette: PAL.hawaii, landmark: "hawaii", drift: "hawaii",
    // a plumeria/hibiscus shrub on the beach; tropical, so it never goes bare
    tree: {
      kind: "plumeria", layer: "mid", x: 0.79, baseY: 0.665, h: 15,
      form: { w: 34, h: 24, clusters: 4, trunk: 2, lean: 1, shape: "shrub" },
      crowns: {
        spring: { w: 0.98, h: 0.92, dots: 10, lift: 0.60 },
        summer: { w: 1.06, h: 1.02, dots: 7, lift: 0.60 },
        autumn: { w: 0.98, h: 0.94, dots: 5, gap: 0.28, lift: 0.60 },
        winter: { w: 0.92, h: 0.88, dots: 4, lift: 0.60 }
      }
    }
  },
  {
    id: "hongkong", name: "Hong Kong", seed: 41,
    lat: 22.3193, lon: 114.1694, tz: "Asia/Hong_Kong",
    palette: PAL.hongkong, landmark: "hongkong", drift: "hongkong",
    // a bauhinia on the Kowloon promenade, in front of the tower wall
    tree: {
      kind: "bauhinia", layer: "mid", x: 0.79, baseY: 0.665, h: 34,
      form: { w: 27, h: 24, clusters: 3, trunk: 2, lean: -1, shape: "broad" },
      crowns: {
        spring: { w: 1.00, h: 0.94, dots: 7, lift: 0.55 },
        summer: { w: 1.08, h: 1.06, dots: 0, lift: 0.55 },
        autumn: { w: 0.96, h: 0.92, dots: 0, gap: 0.35, lift: 0.55 },
        winter: { bare: true, twig: 0.80 }
      }
    }
  },
  {
    id: "amsterdam", name: "Amsterdam", seed: 53,
    lat: 52.3676, lon: 4.9041, tz: "Europe/Amsterdam",
    palette: PAL.amsterdam, landmark: "amsterdam", drift: "amsterdam",
    // the canal-side elms, standing on the far bank in the gable gaps
    tree: {
      kind: "elm", layer: "mid", x: [0.72, 0.84], baseY: 0.665, h: [28, 36],
      form: { w: 24, h: 30, clusters: 3, trunk: 2, lean: 0, shape: "tall" },
      crowns: {
        spring: { w: 0.94, h: 1.00, dots: 6, lift: 0.50 },
        summer: { w: 1.04, h: 1.08, dots: 0, lift: 0.50 },
        autumn: { w: 0.94, h: 0.96, dots: 0, gap: 0.45, lift: 0.50 },
        winter: { bare: true, twig: 0.85 }
      }
    }
  },
  {
    id: "sydney", name: "Sydney", seed: 61,
    lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney",
    palette: PAL.sydney, landmark: "sydney", drift: "sydney",
    noSnow: ["summer"],      // December is high summer here: no snow, by construction
    // the two jacarandas on the sandstone quay, moved into the tree system;
    // the hemisphere inverts the calendar, not the crown colours
    tree: {
      kind: "jacaranda", layer: "mid", x: [0.72, 0.84], baseY: 0.665, h: [36, 29],
      form: { w: 28, h: 27, clusters: 3, trunk: 2, lean: -1, shape: "tall" },
      crowns: {
        spring: { w: 1.00, h: 1.00, dots: 8, lift: 0.52 },
        summer: { w: 1.06, h: 1.06, dots: 0, lift: 0.52 },
        autumn: { w: 0.86, h: 0.90, dots: 0, gap: 0.60, lift: 0.52 },
        winter: { bare: true, twig: 0.95, tuft: 2 }
      }
    }
  }
];

const CITY_BY_ID = {};
for(const c of CITIES) CITY_BY_ID[c.id] = c;
const CITY_IDS = CITIES.map(c => c.id);
const cityRecord = id => CITY_BY_ID[id] || CITIES[0];

/* --------------------------------------------------------------- seasons
   Hemisphere-aware: the same calendar month is a different season below the
   equator.  The month comes from the city's *local* date through Intl, so in
   October Toronto is in autumn and Sydney is in spring. */
const SEASONS = ["spring", "summer", "autumn", "winter"];   // March-first
function hemisphereOf(lat){ return lat < 0 ? "south" : "north"; }
function seasonOf(month, lat){
  // month 1..12: Mar-May spring, Jun-Aug summer, Sep-Nov autumn, Dec-Feb winter;
  // the southern hemisphere is that shifted by two seasons.
  if(!Number.isFinite(month)) month = 1;
  const m = (((Math.round(month) - 3) % 12) + 12) % 12;
  const idx = Math.floor(m / 3);
  const flip = hemisphereOf(lat) === "south" ? 2 : 0;
  return SEASONS[(idx + flip) % 4];
}
function localParts(tz){
  try{
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    const get = t => Number((parts.find(p => p.type === t) || {}).value);
    return { year: get("year"), month: get("month"), day: get("day"),
             hour: get("hour") % 24, minute: get("minute") };
  }catch(e){
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
             hour: d.getHours(), minute: d.getMinutes() };
  }
}
function localHour(tz){
  const p = localParts(tz);
  return p.hour + p.minute / 60;
}
function seasonNow(id){
  const c = cityRecord(id || state.city);
  return seasonOf(localParts(c.tz).month, c.lat);
}

/* ---------------------------------------------------------- seasonal drift
   One table keyed by (city id, season): sprite colours, fall rate, sideways
   wobble, how much of the shared particle pool to use, and the sprite shape.
   `cols` are palette values or hex.  The particles now leave from the emitters
   of the city's baked tree crowns (`scene.treeEmitters`); `ambient` is the
   optional fraction of the pool that still trickles in from the top of the
   frame (only Hong Kong's summer haze motes use it — haze has no canopy).
   A season mapped to null means no drift at all. */
const PLUMERIA = { cols: [PAL.hawaii.cream, "#f4cfc8", "#e8b3aa"],
                   rate: 6, wobble: 11, n: 14, shape: "petal" };
const DRIFT = {
  vancouver: {
    spring: { cols: ["#f7d9e0", "#f0bfcb", "#fbeef1"], rate: 9,  wobble: 14, n: 16, shape: "petal" },  // cherry
    summer: { cols: ["#2f4a38", "#3c5b45", "#22382e"], rate: 11, wobble: 6,  n: 12, shape: "seed"  },  // fir needles
    autumn: { cols: ["#b9743a", "#d39a4e", "#8f5a2e"], rate: 12, wobble: 15, n: 18, shape: "leaf"  },  // leaves
    winter: null
  },
  toronto: {
    spring: { cols: ["#f6dbe4", "#eec3d1", "#fdf0f4"], rate: 9,  wobble: 13, n: 18, shape: "petal" },  // blossom
    summer: { cols: ["#dfd6ad", "#c6b98a", "#f1ead0"], rate: 7,  wobble: 20, n: 12, shape: "seed"  },  // seeds
    autumn: { cols: [PAL.toronto.maple, PAL.toronto.maple2, PAL.toronto.mapleR],
                       rate: 13, wobble: 16, n: 24, shape: "leaf" },                                    // maple
    winter: null
  },
  hawaii: {                                  // plumeria, all year round
    spring: PLUMERIA, summer: PLUMERIA, autumn: PLUMERIA, winter: PLUMERIA
  },
  hongkong: {
    spring: { cols: ["#d886b6", "#c266a0", "#efc2da"], rate: 8, wobble: 13, n: 14, shape: "petal" },  // bauhinia
    summer: { cols: ["#dfe8ec", "#c9d6db", "#f2f6f7"], rate: 3, wobble: 5,  n: 16, shape: "mote",
              ambient: 1 },                                                                     // sea haze
    autumn: null,
    winter: null
  },
  amsterdam: {
    // the elm's spring drift is its pale samara/blossom, so it has a canopy to
    // fall from; the red/yellow tulip colours live on in the (dead) window box
    spring: { cols: ["#cfe0a8", "#b9cf8f", "#e6efc2"], rate: 9, wobble: 12, n: 14, shape: "petal" },  // elm blossom
    summer: { cols: ["#c8c39a", "#b0aa7c", "#e2ddb8"], rate: 8,  wobble: 18, n: 12, shape: "seed" },  // elm seeds
    autumn: { cols: ["#8f6b34", "#b08344", "#6f5228"], rate: 12, wobble: 15, n: 16, shape: "leaf" },  // leaves
    winter: null
  },
  sydney: {
    spring: { cols: [PAL.sydney.jac, PAL.sydney.jacHi, PAL.sydney.jacLo],
                       rate: 8, wobble: 13, n: 18, shape: "petal" },                                     // jacaranda
    summer: null,                             // clear beach light, nothing falling
    autumn: null,
    winter: null
  }
};
function driftFor(id, season){
  const c = cityRecord(id || state.city);
  const byCity = DRIFT[c.drift];
  return (byCity && byCity[season || state.season]) || null;
}

/* --------------------------------------------------------------- state */
const reduceMotion = (typeof matchMedia === "function")
  ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;
const isFirefox = (typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent));

const state = {
  city: "vancouver",
  hour: 17.2,
  cycleOn: !reduceMotion,
  own: false,            // "own time" mode: use the machine clock, manual weather
  wx: "clear",           // clear | rain | snow
  wxAuto: true,
  rainAmt: 0, snowAmt: 0,
  rainTarget: 0, snowTarget: 0,
  cloudAmt: 0,
  season: "autumn",      // refreshed from the city's local date in refreshSeason()
  seasonOverride: null   // harness-only: force a season for a capture
};

/* the season that city is actually in right now (local date + latitude).
   This is also the one place a season rollover is noticed: when state.season
   changes the baked scene is rebuilt once (the tree gets its new crown), and
   every later frame blits the cached layers.  Same one-off cost as a city
   switch, at most four times a session. */
function refreshSeason(){
  const c = cityRecord(state.city);
  const next = state.seasonOverride || seasonOf(localParts(c.tz).month, c.lat);
  const changed = next !== state.season;
  state.season = next;
  if(changed && scene && scene.id === state.city) buildScene(state.city);
  return state.season;
}
/* Some cities have a season in which snow simply cannot happen (Sydney in its
   December summer).  Everything that can set weather goes through this. */
function snowAllowed(season){
  const c = cityRecord(state.city);
  const s = season || state.season || "winter";
  return !c.noSnow || c.noSnow.indexOf(s) < 0;
}
