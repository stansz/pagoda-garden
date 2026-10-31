"use strict";

/* ------------------------------------------------------------------ plants */
// A finished focus round in the city page earns a seed; the garden reads those
// from the same localStorage the city writes. A planted seed is at most three
// voxels: a sprout, a stem with a sprout, then a stem with a bloom or a bud on
// top. Growth is real time (rain adds to it), and the plants are remembered.
const PLANT_KEY = "pagoda-garden.plants.v1";
const CITY_KEY = "pagoda-pixel-window.v1";
const WALK_KEY = "pagoda-walk.v1";
const SPROUT_MS = 6 * 3600000, GROWN_MS = 24 * 3600000;
const PLANT_STEM = "#4c9044", PLANT_SPROUT = "#7fc25a", PLANT_BUD = "#8fb86a";
const PLANT_KINDS = {
  poppy:      { bloom: "#e0533d", opens: () => true },
  moonflower: { bloom: "#dfe6ff", opens: h => h >= 20 || h < 5 },
  snowdrop:   { bloom: "#f4f7fb", opens: (h, wx) => wx === "snow" },
  lantern:    { bloom: "#ffc861", opens: h => h >= 17 || h < 6 }
};

// A tile can hold a plant when the bare scene has exactly one voxel in its
// column: a grass cube at y 0. Built once, before any plants join the scene.
const FREE = new Set();
(function buildFree(){
  const columns = new Map();
  for(const v of S.vox){
    const k = v[0] + "," + v[2];
    const c = columns.get(k);
    if(c) c.n++; else columns.set(k, { n: 1, y: v[1], col: v[3] });
  }
  for(const [k, c] of columns)
    if(c.n === 1 && c.y === 0 && (c.col === COL.grassA || c.col === COL.grassB)) FREE.add(k);
})();

let plants = [];
let spent = 0;
let plantingKind = null;
let plantSig = "";
let lastPlantTick = Date.now();
let unsavedRain = 0;

function cityMarks(){
  try{
    const pr = JSON.parse(localStorage.getItem(CITY_KEY) || "null");
    const m = pr && pr.session ? pr.session.marks : undefined;
    return Number.isInteger(m) && m >= 0 ? m : 0;
  }catch(e){ return 0; }
}
function seedCount(){ return Math.max(0, cityMarks() - spent); }

// The Far Light's reward: a rare seed that lives in the walk's save rather than
// in `spent`, and only while the garden has not grown one yet.
function lanternSeeds(){
  try{
    const w = JSON.parse(localStorage.getItem(WALK_KEY) || "null");
    const v = w && w.vancouver;
    if(!v || !Array.isArray(v.items) || v.items.indexOf("lantern") < 0) return 0;
    return plants.some(p => p.kind === "lantern") ? 0 : 1;
  }catch(e){ return 0; }
}

// A grown lantern adds its own lamp to the scene while it is open.
function lanternLamps(){
  const out = [];
  for(const p of plants){
    if(p.kind !== "lantern") continue;
    if(plantStage(p) !== 2) continue;
    if(!PLANT_KINDS.lantern.opens(hour, currentWx)) continue;
    out.push([p.x + 0.5, 3.5, p.z + 0.5, 0.8]);
  }
  return out.length ? out : null;
}

function loadPlants(){
  plants = [];
  spent = 0;
  let st = null;
  try { st = JSON.parse(localStorage.getItem(PLANT_KEY) || "null"); } catch(e){}
  if(!st || typeof st !== "object") return;
  spent = Number.isInteger(st.spent) ? st.spent : 0;
  if(!Array.isArray(st.plants)) return;
  const seen = new Set();
  for(const p of st.plants){
    if(!p || typeof p !== "object") continue;
    if(!Object.prototype.hasOwnProperty.call(PLANT_KINDS, p.kind)) continue;
    const k = p.x + "," + p.z;
    if(!FREE.has(k) || seen.has(k)) continue;
    if(!Number.isFinite(p.at) || !Number.isFinite(p.rain)) continue;
    seen.add(k);
    plants.push({ x: p.x, z: p.z, kind: p.kind, at: p.at, rain: p.rain });
  }
}
function savePlants(){
  try { localStorage.setItem(PLANT_KEY, JSON.stringify({ spent, plants })); } catch(e){}
}

function plantStage(p){
  const age = Date.now() - p.at + p.rain;
  if(age >= GROWN_MS) return 2;
  if(age >= SPROUT_MS) return 1;
  return 0;
}

function plantVoxels(P){
  for(const p of plants){
    const stage = plantStage(p);
    if(stage === 0){ P.put(p.x, 1, p.z, PLANT_SPROUT); continue; }
    P.put(p.x, 1, p.z, PLANT_STEM);
    if(stage === 1){ P.put(p.x, 2, p.z, PLANT_SPROUT); continue; }
    P.put(p.x, 2, p.z, PLANT_STEM);
    P.put(p.x, 3, p.z, PLANT_KINDS[p.kind].opens(hour, currentWx) ? PLANT_KINDS[p.kind].bloom : PLANT_BUD);
  }
}

// The scene is rebuilt only when a plant's stage or bloom state actually
// changed; an empty garden keeps the scene it was built with.
function refreshPlants(){
  let sig = "";
  if(plants.length){
    sig = plants.map(p => {
      const stage = plantStage(p);
      const open = stage === 2 && PLANT_KINDS[p.kind].opens(hour, currentWx);
      return p.x + "," + p.z + ":" + p.kind + ":" + stage + ":" + (open ? 1 : 0);
    }).join("|");
  }
  if(sig === plantSig) return;
  plantSig = sig;
  S = gardenScene(plants.length ? plantVoxels : null, lanternLamps());
  cacheState = null;
}

function tickPlants(ms){
  const elapsed = ms === undefined ? clamp(Date.now() - lastPlantTick, 0, 300000) : ms;
  lastPlantTick = Date.now();
  if(currentWx === "rain"){
    for(const p of plants) p.rain += elapsed;
    unsavedRain += elapsed;
  }
  if(unsavedRain >= 60000 || ms !== undefined){
    savePlants();
    unsavedRain = 0;
  }
  refreshPlants();
}

// CSS pixels -> the grass tile under them, on the y = 1 plane (the top of the
// ground cube), using the same orthographic camera the layer is drawn with.
function pickTile(cx, cy){
  const a = (cx * DPR - cam.ox) / cam.s, b = (cy * DPR - cam.oy) / cam.s;
  const c = (b + (1 - S.cy) * cam.cp) / cam.sp;
  const X = a * cam.ca + c * cam.sa, Z = c * cam.ca - a * cam.sa;
  return [Math.floor(X + S.cx), Math.floor(Z + S.cz)];
}

function plantSeed(x, z, kind){
  if(!Object.prototype.hasOwnProperty.call(PLANT_KINDS, kind)) return false;
  const rare = kind === "lantern";
  if(rare ? lanternSeeds() <= 0 : seedCount() <= 0) return false;
  const k = x + "," + z;
  if(!FREE.has(k)) return false;
  if(plants.some(p => p.x === x && p.z === z)) return false;
  plants.push({ x, z, kind, at: Date.now(), rain: 0 });
  if(!rare) spent++;
  savePlants();
  refreshPlants();
  if(rare || seedCount() === 0) plantingKind = null;
  paintBed();
  return true;
}

function paintBed(){
  const pill = document.getElementById("bedPill");
  const panel = document.getElementById("bedPanel");
  const note = document.getElementById("bedNote");
  const seeds = seedCount();
  const rare = lanternSeeds();
  if(pill){
    pill.textContent = "seeds " + seeds + (rare > 0 ? " + lantern" : "");
    if(panel) pill.setAttribute("aria-expanded", String(!panel.hidden));
  }
  for(const b of document.querySelectorAll("[data-kind]")){
    b.setAttribute("aria-pressed", String(b.dataset.kind === plantingKind));
    if(b.dataset.kind === "lantern"){
      b.hidden = rare === 0;
      b.disabled = rare === 0;
    }else b.disabled = seeds === 0;
  }
  if(note){
    if(plantingKind) note.textContent = "Tap a patch of grass to plant a " + plantingKind + ".";
    else if(seeds > 0 || rare > 0) note.textContent = "Pick a seed to plant.";
    else if(plants.length === 0) note.textContent = "A finished focus round in the city earns a seed.";
    else note.textContent = "A finished focus round earns another seed.";
  }
}

function initPlants(){
  loadPlants();
  refreshPlants();
  paintBed();
}

(function wireBed(){
  const pill = document.getElementById("bedPill");
  const panel = document.getElementById("bedPanel");
  if(pill && panel) pill.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if(panel.hidden) plantingKind = null;
    paintBed();
  });
  for(const b of document.querySelectorAll("[data-kind]")) b.addEventListener("click", () => {
    plantingKind = plantingKind === b.dataset.kind ? null : b.dataset.kind;
    paintBed();
  });
  addEventListener("keydown", e => {
    if(e.key !== "Escape" || !plantingKind) return;
    plantingKind = null;
    paintBed();
  });
  let start = null;
  cv.addEventListener("pointerdown", e => {
    start = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  cv.addEventListener("pointerup", e => {
    const tap = start;
    start = null;
    if(!plantingKind || !tap) return;
    if(Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 6) return;
    if(performance.now() - tap.t > 500) return;
    plantSeed(...pickTile(e.clientX, e.clientY), plantingKind);
  });
  addEventListener("storage", paintBed);
  addEventListener("pageshow", paintBed);
})();

const PLANTS = {
  get: () => ({ seeds: seedCount(), planting: plantingKind,
                plants: plants.map(p => ({ ...p, stage: plantStage(p) })) }),
  plant: plantSeed, pick: pickTile, tick: tickPlants,
  open: (kind, h, wx) => PLANT_KINDS[kind].opens(h, wx)
};
