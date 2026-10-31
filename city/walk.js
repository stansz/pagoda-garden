"use strict";

/* =========================================================================
   The Far Light — one engine for the choose-your-own-adventure that lives on
   the far shore of the city view.  The story itself is plain data in
   city/stories/<city>.js; this file only reads it, keeps the walk in
   localStorage, and paints the panel over the art.
   ========================================================================= */
const STORY = {};
const WALK_KEY = "pagoda-walk.v1";
const GARDEN_KEY = "pagoda-garden.plants.v1";
const GROWN_AFTER_MS = 24 * 3600000;          // the garden's GROWN_MS
let walk = null;                              // { at, items, flags, pages } of the current city
let walkTab = "story";
let walkFlash = [];                           // lines to show once, above the next scene
let walkFake = null;                          // test override of the world

function walkStory(){ return STORY[state.city] || null; }

/* one entry per city: { [cityId]: { at, items, flags, pages } } */
function loadWalk(){
  const story = walkStory();
  if(!story){ walk = null; return; }
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(WALK_KEY) || "null"); }catch(e){}
  const entry = saved && typeof saved === "object" ? saved[state.city] : null;
  const items = [], flags = [], pages = [];
  if(entry && typeof entry === "object"){
    if(Array.isArray(entry.items))
      for(const id of entry.items)
        if(Object.prototype.hasOwnProperty.call(story.items, id) && items.indexOf(id) < 0) items.push(id);
    if(Array.isArray(entry.pages))
      for(const id of entry.pages)
        if(Object.prototype.hasOwnProperty.call(story.pages, id) && pages.indexOf(id) < 0) pages.push(id);
    if(Array.isArray(entry.flags))
      for(const f of entry.flags)
        if(typeof f === "string" && flags.indexOf(f) < 0) flags.push(f);
  }
  const at = entry && typeof entry.at === "string" &&
             Object.prototype.hasOwnProperty.call(story.scenes, entry.at) ? entry.at : story.start;
  walk = { at, items, flags, pages };
}

function saveWalk(){
  if(!walk) return;
  try{
    let all = null;
    try{ all = JSON.parse(localStorage.getItem(WALK_KEY) || "null"); }catch(e){}
    if(!all || typeof all !== "object") all = {};
    all[state.city] = { at: walk.at, items: walk.items.slice(),
                        flags: walk.flags.slice(), pages: walk.pages.slice() };
    localStorage.setItem(WALK_KEY, JSON.stringify(all));
  }catch(e){}
}

/* the world the locks read: the city's real clock and sky, unless the harness
   has pinned one of them */
function walkWorld(){
  const w = { hour: cityNow(), wx: state.wx,
              fog: placeCode === 45 || placeCode === 48, season: state.season };
  if(walkFake)
    for(const k in w)
      if(Object.prototype.hasOwnProperty.call(walkFake, k) && walkFake[k] !== undefined) w[k] = walkFake[k];
  return w;
}

function gardenPlants(){
  try{
    const st = JSON.parse(localStorage.getItem(GARDEN_KEY) || "null");
    return st && Array.isArray(st.plants) ? st.plants : [];
  }catch(e){ return []; }
}

function gardenGrown(kind){
  for(const p of gardenPlants()){
    if(!p || !Number.isFinite(p.at) || !Number.isFinite(p.rain)) continue;
    if(Date.now() - p.at + p.rain < GROWN_AFTER_MS) continue;
    if(kind === "any" || p.kind === kind) return true;
  }
  return false;
}

function walkList(v){ return Array.isArray(v) ? v : [v]; }

function walkHolds(cond){
  if(!cond) return true;
  if(!walk) return false;
  const w = walkWorld();
  const night = w.hour >= 20 || w.hour < 5;
  const nine = w.hour >= 21 && w.hour < 22;
  const dawn = w.hour >= 5 && w.hour < 8;
  for(const key in cond){
    if(!Object.prototype.hasOwnProperty.call(cond, key)) continue;
    const v = cond[key];
    if(key === "night"){ if(night !== !!v) return false; }
    else if(key === "nine"){ if(nine !== !!v) return false; }
    else if(key === "dawn"){ if(dawn !== !!v) return false; }
    else if(key === "rain"){ if((w.wx === "rain") !== !!v) return false; }
    else if(key === "snow"){ if((w.wx === "snow") !== !!v) return false; }
    else if(key === "fog"){ if(!!w.fog !== !!v) return false; }
    else if(key === "season"){ if(w.season !== v) return false; }
    else if(key === "has"){ for(const id of walkList(v)) if(walk.items.indexOf(id) < 0) return false; }
    else if(key === "lacks"){ for(const id of walkList(v)) if(walk.items.indexOf(id) >= 0) return false; }
    else if(key === "flag"){ for(const f of walkList(v)) if(walk.flags.indexOf(f) < 0) return false; }
    else if(key === "noflag"){ for(const f of walkList(v)) if(walk.flags.indexOf(f) >= 0) return false; }
    else if(key === "grown"){ if(!gardenGrown(v)) return false; }
    else return false;
  }
  return true;
}

function walkTokens(s){
  let t = String(s);
  t = t.split("{time}").join(fmtHour(cityNow()));
  t = t.split("{cond}").join(placeCode === null ? "the sky not saying" : condLabel(placeCode).toLowerCase());
  t = t.split("{temp}").join(placeTemp === null ? "" : ", " + placeTemp + " degrees");
  return t;
}

function walkChoices(){
  const story = walkStory();
  if(!walk || !story) return [];
  const scene = story.scenes[walk.at];
  if(!scene || !Array.isArray(scene.choices)) return [];
  return scene.choices
    .filter(c => walkHolds(c.show))
    .map(c => ({ c, enabled: walkHolds(c.if) }));
}

function walkPara(body, cls, text){
  const p = document.createElement("p");
  if(cls) p.className = cls;
  p.textContent = text;
  body.appendChild(p);
  return p;
}

function paintStory(story, scene, body, choices){
  if(!body) return;
  for(const f of walkFlash) walkPara(body, f.kind === "say" ? "walk-say" : "walk-got", f.text);
  walkFlash = [];
  for(const line of scene.text){
    if(typeof line === "string") walkPara(body, "", walkTokens(line));
    else if(line && line.t !== undefined && walkHolds(line.if)) walkPara(body, "", walkTokens(line.t));
  }
  if(!choices) return;
  const list = walkChoices();
  for(let i = 0; i < list.length; i++){
    const e = list[i];
    const b = document.createElement("button");
    b.type = "button";
    const n = document.createElement("span");
    n.className = "walk-n";
    n.textContent = (i + 1) + ".";
    b.appendChild(n);
    b.appendChild(document.createTextNode(e.c.label));
    if(!e.enabled){
      b.disabled = true;
      const hint = document.createElement("small");
      hint.className = "walk-hint";
      hint.textContent = e.c.hint || "";
      b.appendChild(hint);
    } else if(e.c.if && e.c.now){
      const now = document.createElement("small");
      now.className = "walk-now";
      now.textContent = e.c.now;
      b.appendChild(now);
    }
    // the button carries its entry: the number and label are only decoration
    b.addEventListener("click", () => walkChoose(e));
    choices.appendChild(b);
  }
  const first = choices.querySelector("button:not(:disabled)");
  if(first) first.focus({ preventScroll: true });
}

function paintSatchel(body){
  const story = walkStory();
  if(!body || !story) return;
  const kinds = new Set(gardenPlants().map(p => p && p.kind));
  const shown = [];
  for(const id of walk.items){
    const it = story.items[id];
    if(!it) continue;
    if(it.plant && kinds.has(it.plant)) continue;
    shown.push(it);
  }
  if(!shown.length){ walkPara(body, "", "Nothing yet but pockets."); return; }
  for(const it of shown){
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = it.name;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(" " + it.note));
    body.appendChild(p);
  }
}

function paintJournal(body){
  const story = walkStory();
  if(!body || !story) return;
  const goal = story.goal;
  if(goal && walk.flags.indexOf(goal.show) >= 0 && walk.flags.indexOf(goal.done) < 0){
    walkPara(body, "", goal.title);
    for(const id of goal.items || []){
      const it = story.items[id] || { name: id };
      walkPara(body, "walk-check",
               (walk.items.indexOf(id) >= 0 ? "\u2713 " : "\u25cb ") + it.name);
    }
  }
  for(const id of walk.pages){
    const page = story.pages[id];
    if(!page) continue;
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = page.title;
    p.appendChild(strong);
    p.appendChild(document.createTextNode(" " + page.text));
    body.appendChild(p);
  }
  const pages = Object.keys(story.pages);
  const total = pages.filter(id => story.pages[id].secret).length;
  const found = walk.pages.filter(id => story.pages[id] && story.pages[id].secret).length;
  walkPara(body, "walk-secrets", "Secrets found " + found + " of " + total);
}

function walkPaint(){
  const el = document.getElementById("walk");
  const story = walkStory();
  if(!el || !story || !walk) return;
  const scene = story.scenes[walk.at] || story.scenes[story.start];
  const place = document.getElementById("walkPlace");
  if(place) place.textContent = walkTab === "story" ? scene.place : story.title;
  for(const tab of document.querySelectorAll("[data-walk-tab]")){
    const name = tab.dataset.walkTab;
    let label = name;
    if(name === "satchel" && walk.items.length) label += " " + walk.items.length;
    else if(name === "journal" && walk.pages.length) label += " " + walk.pages.length;
    tab.textContent = label;
    tab.setAttribute("aria-pressed", String(name === walkTab));
  }
  const body = document.getElementById("walkBody");
  const choices = document.getElementById("walkChoices");
  if(body) body.textContent = "";
  if(choices) choices.textContent = "";
  if(walkTab === "satchel") paintSatchel(body);
  else if(walkTab === "journal") paintJournal(body);
  else paintStory(story, scene, body, choices);
}

function walkChoose(entry){
  if(!entry || !entry.enabled || !walk) return;
  const story = walkStory();
  if(!story) return;
  const c = entry.c;
  for(const id of c.take || []) walk.items = walk.items.filter(x => x !== id);
  const gained = [];
  for(const id of c.give || []){
    if(walk.items.indexOf(id) < 0){ walk.items.push(id); gained.push(id); }
  }
  for(const f of c.set || []) if(walk.flags.indexOf(f) < 0) walk.flags.push(f);
  let pageGain = null;
  if(c.page && walk.pages.indexOf(c.page) < 0){ walk.pages.push(c.page); pageGain = c.page; }

  if(c.say) walkFlash.push({ kind: "say", text: c.say });
  for(const id of gained){
    const it = story.items[id];
    walkFlash.push({ kind: "got", text: "Added to your satchel: " + (it ? it.name : id) + "." });
  }
  if(pageGain){
    const page = story.pages[pageGain];
    walkFlash.push({ kind: "got", text: "New page in your journal: " + (page ? page.title : pageGain) + "." });
  }
  if(gained.length || pageGain) playCadence();

  if(c.end){
    walk.at = story.start;
    walkFlash = [];
    saveWalk();
    closeWalk();
    return;
  }
  walk.at = c.to;
  saveWalk();
  walkPaint();
}

function walkOpen(){
  const el = document.getElementById("walk");
  return !!(el && !el.hidden);
}

function openWalk(){
  if(session.kind === "focus") return false;
  if(!walkStory()) return false;
  const el = document.getElementById("walk");
  if(!el) return false;
  loadWalk();
  walkTab = "story";
  el.hidden = false;
  walkPaint();
  return true;
}

function closeWalk(){
  const el = document.getElementById("walk");
  if(el) el.hidden = true;
  walkFlash = [];
  const light = document.getElementById("walkLight");
  if(light) light.focus({ preventScroll: true });
}

/* the light is a harbour light: it hides while a focus round is running, and it
   changes once the walk has begun and again once the lamp is lit */
function syncWalkLight(){
  const light = document.getElementById("walkLight");
  if(!light) return;
  if(walkOpen()) return;
  loadWalk();
  light.hidden = !walkStory() || session.kind === "focus";
  const flags = walk ? walk.flags : [];
  light.classList.toggle("new", flags.indexOf("began") < 0);
  light.classList.toggle("steady", flags.indexOf("lit") >= 0);
}

/* place the light on the far shore, in CSS pixels, from the framebuffer
   geometry: the art is integer-scaled and centre-cropped, so this tracks it */
function layoutWalkLight(){
  const light = document.getElementById("walkLight");
  if(!light || !dprNow) return;
  const k = px / dprNow;
  const ax = BW * 0.845;
  const ay = yW - 4;
  const vw = Math.max(240, innerWidth), vh = Math.max(160, innerHeight);
  const left = clamp(bx / dprNow + ax * k, 24, vw - 24);
  const top = clamp(by / dprNow + ay * k, 24, vh - 24);
  light.style.left = Math.round(left) + "px";
  light.style.top = Math.round(top) + "px";
  light.style.setProperty("--walk-px", Math.max(2, Math.round(k * 2)) + "px");
  syncWalkLight();
}

(function wireWalk(){
  const light = document.getElementById("walkLight");
  const close = document.getElementById("walkClose");
  const overlay = document.getElementById("walk");
  if(light) light.addEventListener("click", () => openWalk());
  if(close) close.addEventListener("click", () => closeWalk());
  if(overlay) overlay.addEventListener("click", e => { if(e.target === overlay) closeWalk(); });
  for(const tab of document.querySelectorAll("[data-walk-tab]"))
    tab.addEventListener("click", () => {
      const name = tab.dataset.walkTab;
      if(name !== "story" && name !== "satchel" && name !== "journal") return;
      walkTab = name;
      walkPaint();
    });
  // capture phase: while the panel is up, the keys belong to the walk and never
  // reach the focus timer (f, p, Escape)
  addEventListener("keydown", e => {
    if(!walkOpen()) return;
    e.stopPropagation();
    if(e.key === "Escape"){ e.preventDefault(); closeWalk(); return; }
    if(walkTab !== "story" || !/^[1-9]$/.test(e.key)) return;
    const entry = walkChoices()[Number(e.key) - 1];
    if(entry) walkChoose(entry);
  }, true);
  setInterval(syncWalkLight, 1000);
})();

/* ------------------------------------------------- headless hook for checks */
const WALK = {
  get: () => ({ open: walkOpen(), tab: walkTab, at: walk && walk.at, items: walk ? walk.items.slice() : [],
                flags: walk ? walk.flags.slice() : [], pages: walk ? walk.pages.slice() : [] }),
  choices: () => walkChoices().map(e => ({ label: e.c.label, enabled: e.enabled, hint: e.c.hint || "" })),
  choose(label){
    const e = walkChoices().find(x => x.c.label === label);
    if(!e || !e.enabled) return false;
    walkChoose(e);
    return true;
  },
  open: openWalk, close: closeWalk,
  world(f){ walkFake = f; if(walkOpen()) walkPaint(); }
};
