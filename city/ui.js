"use strict";

/* =========================================================================
   UI: bottom bar, corner card, city clocks, live weather.
   ========================================================================= */

let uiEl, hourInput, clockEl, cycleBtn, ownBtn, cityBtns = [], wxBtns = [], snowBtn = null;
let infoEl, infoHead, infoPlace, infoClock, infoRefresh, infoCond, infoTemp, infoMeta, infoSceneEl, infoSeasonEl;
let infoCondS = null, infoTempS = null, infoSeasonS = null;
let gardenLink = null, dprNow = 1;

let fetchState = "idle", lastFetchAt = 0, placeCode = null, placeTemp = null;

function fmtHour(h){
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x);
  const mm = Math.min(59, Math.round((x - hh) * 60));
  return pad2(hh) + ":" + pad2(mm);
}
function cityNow(){ return localHour(cityRecord(state.city).tz); }

/* ?city=<id> on boot preselects that city (file:// included: no URL API needed) */
function urlCity(){
  try{
    if(typeof location === "undefined" || !location.search) return null;
    const m = /[?&]city=([^&#]+)/.exec(location.search);
    if(!m) return null;
    const id = decodeURIComponent(m[1]).toLowerCase();
    return CITY_BY_ID[id] ? id : null;
  }catch(e){ return null; }
}

function weatherKind(code){
  if([71, 73, 75, 77, 85, 86].indexOf(code) >= 0) return "snow";
  if((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return "clear";
}

/* live conditions from Open-Meteo (no key, browser-callable).  Offline the clock
   still works and the card says so. */
async function refreshWeather(){
  if(state.own || typeof fetch !== "function"){ updateInfo(); return; }
  const c = cityRecord(state.city);
  fetchState = "loading";
  updateInfo();
  try{
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + c.lat + "&longitude=" + c.lon +
                "&current=weather_code,temperature_2m,cloud_cover&timezone=auto";
    const r = await fetch(url, { cache: "no-store" });
    if(!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const cur = (j && j.current) || {};
    state.wxAuto = true;
    placeCode = Number.isFinite(cur.weather_code) ? Number(cur.weather_code) : null;
    setWeather(weatherKind(placeCode));
    state.cloudAmt = Number.isFinite(cur.cloud_cover) ? clamp(cur.cloud_cover / 100, 0, 1) : 0;
    placeTemp = Number.isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null;
    fetchState = "ok";
    lastFetchAt = Date.now();
  }catch(e){
    fetchState = "error";
  }
  updateInfo();
}

function updateInfo(){
  if(!infoPlace) return;
  const c = cityRecord(state.city);
  const realH = state.own ? ownHour() : localHour(c.tz);
  refreshSeason();
  syncSnowButton();

  infoPlace.textContent = state.own ? "Own time" : c.name;
  infoClock.textContent = fmtHour(realH);
  if(infoSeasonEl){
    const s = state.season;
    infoSeasonEl.textContent = s.charAt(0).toUpperCase() + s.slice(1) + " · " +
      (hemisphereOf(c.lat) === "south" ? "southern" : "northern") + " hemisphere";
  }
  const condText = !state.own
    ? (!state.wxAuto ? condLabel(wxToCode(state.wx))
      : fetchState === "loading" ? "Loading…"
      : placeCode === null ? "—" : condLabel(placeCode))
    : condLabel(wxToCode(state.wx));
  const tempText = (state.own || placeTemp === null) ? "" : Math.round(placeTemp) + "°C";
  infoCond.textContent = condText;
  infoTemp.textContent = tempText;
  if(infoCondS) infoCondS.textContent = condText;
  if(infoTempS) infoTempS.textContent = tempText;
  if(infoSeasonS) infoSeasonS.textContent = state.season.charAt(0).toUpperCase() + state.season.slice(1);

  const age = lastFetchAt ? Math.round((Date.now() - lastFetchAt) / 60000) : null;
  infoMeta.textContent = (state.own || !state.wxAuto) ? "Weather set by hand"
    : fetchState === "error" ? "Offline · last known"
    : fetchState !== "ok" ? "Fetching…"
    : "Open-Meteo" + (age === null ? "" : " · " + (age < 1 ? "just now" : age + "m ago"));

  const differs = Math.abs(state.hour - realH) > 0.12;
  infoSceneEl.hidden = !differs;
  if(differs) infoSceneEl.textContent = "Scene " + fmtHour(state.hour) + (state.cycleOn ? " · cycling" : "");

  const busy = fetchState === "loading" && !state.own;
  infoRefresh.disabled = state.own;
  infoRefresh.classList.toggle("spin", busy);
  infoRefresh.title = state.own ? "Pick a city to see its live weather" : "Refresh this city now";
  infoHead.setAttribute("aria-expanded", String(!infoEl.classList.contains("closed")));
  tickSession();
}

function updateClockLabel(){
  if(clockEl) clockEl.textContent = fmtHour(state.hour);
}

function paintWeatherCycle(){
  const b = document.getElementById("wxCycle");
  if(b) b.textContent = state.wx + " \u25BE";
}
function cycleWeather(){
  const order = ["clear", "rain", "snow"];
  let i = order.indexOf(state.wx);
  for(let k = 1; k <= order.length; k++){
    const nx = order[(i + k) % order.length];
    if(nx === "snow" && typeof snowAllowed === "function" && !snowAllowed()) continue;
    setWeather(nx);
    return;
  }
}
function paintWeatherButtons(){
  for(let i = 0; i < wxBtns.length; i++)
    wxBtns[i].setAttribute("aria-pressed", String(wxBtns[i].dataset.wx === state.wx));
}

/* keeps the snow button honest: in a Sydney summer there is no snow to pick */
function syncSnowButton(){
  const ok = snowAllowed(state.season);
  if(snowBtn){
    snowBtn.disabled = !ok;
    snowBtn.title = ok ? "Snow" : "No snow in " + cityRecord(state.city).name + " in " + state.season;
  }
  if(!ok && state.wx === "snow"){
    state.wx = "clear";
    state.snowTarget = 0;
    paintWeatherButtons();
  }
}

function setWeather(which){
  if(which === "snow" && !snowAllowed()) which = "clear";
  state.wx = (which === "rain" || which === "snow") ? which : "clear";
  state.rainTarget = state.wx === "rain" ? 1 : 0;
  state.snowTarget = state.wx === "snow" ? 1 : 0;
  paintWeatherButtons();
}

function manualWeather(which){
  state.wxAuto = false;
  state.cloudAmt = 0;
  setWeather(which);
  updateInfo();
  savePrefs();
}

function setCity(id, skipTime){
  if(!CITY_BY_ID[id]) id = CITIES[0].id;
  state.city = id;
  if(gardenLink) gardenLink.href = "./voxel-garden/?city=" + encodeURIComponent(state.city);
  refreshSeason();
  buildScene(id);
  buildSill(id);
  waterCv = null;
  skyBucket = -999;
  fetchState = "idle";
  placeCode = null;
  for(let i = 0; i < cityBtns.length; i++)
    cityBtns[i].setAttribute("aria-pressed", String(cityBtns[i].dataset.city === id));
  syncCityLabel();
  syncSnowButton();

  if(!skipTime){
    state.own = false;
    if(ownBtn) ownBtn.setAttribute("aria-pressed", "false");
    state.hour = cityNow();
    state.cycleOn = false;
    if(cycleBtn) cycleBtn.setAttribute("aria-pressed", "false");
    if(hourInput) hourInput.value = state.hour.toFixed(2);
    state.wxAuto = true;
    placeTemp = null;
    refreshWeather();
  }
  updateClockLabel();
  updateInfo();
  // music follows the place: a city change glides the running pad to the new
  // profile's chords instead of restarting the engine
  if(ac && soundOn) applyProfile(ac.currentTime);
  savePrefs();
}

function selectOwn(on){
  state.own = !!on;
  if(ownBtn) ownBtn.setAttribute("aria-pressed", String(state.own));
  if(state.own){
    state.hour = ownHour();
    state.cycleOn = false;
    if(cycleBtn) cycleBtn.setAttribute("aria-pressed", "false");
    if(hourInput) hourInput.value = state.hour.toFixed(2);
    state.wxAuto = false;
    placeTemp = null;
  } else {
    state.hour = cityNow();
    state.wxAuto = true;
    refreshWeather();
  }
  updateClockLabel();
  updateInfo();
  savePrefs();
}

function refreshNow(){
  if(state.own || fetchState === "loading") return;
  if(!state.cycleOn){
    state.hour = cityNow();
    if(hourInput) hourInput.value = state.hour.toFixed(2);
    updateClockLabel();
  }
  refreshWeather();
}

/* ------------------------------------------------------------------- prefs */
const PREF_KEY = "pagoda-pixel-window.v1";
let prefTimer = 0;
function savePrefsSoon(){ clearTimeout(prefTimer); prefTimer = setTimeout(savePrefs, 500); }
function savePrefs(){
  if(!infoEl) return;
  try{
    localStorage.setItem(PREF_KEY, JSON.stringify({
      city: state.city, hour: +state.hour.toFixed(3), cycleOn: state.cycleOn,
      own: state.own, wx: state.wx, vol: +vol.toFixed(3),
      soundOn: soundWanted || soundOn,
      infoOpen: !infoEl.classList.contains("closed"),
      session: sessionSave()
    }));
  }catch(e){}
}
function loadPrefs(){
  let pr = null;
  try{ pr = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); }catch(e){}
  const fromUrl = urlCity();
  const saved = (pr && CITY_BY_ID[pr.city]) ? pr.city : null;
  const id = fromUrl || saved || CITIES[0].id;
  const freshCity = !!fromUrl && fromUrl !== saved;   // ?city= arrived with a different city

  state.city = id;
  state.cycleOn = false;                       // there is no fake clock any more
  state.own = false;
  if(pr && typeof pr.infoOpen === "boolean") infoEl.classList.toggle("closed", !pr.infoOpen);
  if(pr) restoreSession(pr.session);
  // sound: the level is remembered, and "on" is remembered as an intent that
  // is only honoured on the first gesture (never autoplay)
  if(pr && Number.isFinite(pr.vol)) vol = clamp(pr.vol, 0, 1);
  soundWanted = !!(pr && pr.soundOn === true);
  if(freshCity){
    state.own = false;
    state.wxAuto = true;
    state.cycleOn = false;
    state.hour = localHour(cityRecord(id).tz);       // start on the requested city's time
  }
  state.hour = localHour(cityRecord(id).tz);    // the real clock, always
  refreshSeason();
  setWeather("clear");                       // the sky is always the city's real weather

  buildScene(id);
  buildSill(id);
  waterCv = null;
  skyBucket = -999;
  if(hourInput) hourInput.value = state.hour.toFixed(2);
  for(let i = 0; i < cityBtns.length; i++)
    cityBtns[i].setAttribute("aria-pressed", String(cityBtns[i].dataset.city === id));
  if(ownBtn) ownBtn.setAttribute("aria-pressed", String(state.own));
  if(cycleBtn) cycleBtn.setAttribute("aria-pressed", String(state.cycleOn));
  syncSnowButton();
  updateClockLabel();
  updateInfo();
  syncCityLabel();
  if(state.own) state.wxAuto = false;
  else refreshWeather();
}

/* ------------------------------------------------------------- weather tick */
function updateWeather(dt){
  state.rainAmt += (state.rainTarget - state.rainAmt) * Math.min(1, dt * 1.4);
  state.snowAmt += (state.snowTarget - state.snowAmt) * Math.min(1, dt * 1.4);
  if(state.rainAmt < 0.002 && state.rainTarget === 0) state.rainAmt = 0;
  if(state.snowAmt < 0.002 && state.snowTarget === 0) state.snowAmt = 0;

  const t = performance.now() * 0.001;
  for(let i = 0; i < rain.length; i++){
    const r = rain[i];
    r.y += r.v * dt;
    r.x -= r.k * dt;
    if(r.y > BH){ r.y = -4; r.x = Math.random() * BW; }
    if(r.x < -2) r.x = BW + 2;
  }
  for(let i = 0; i < snow.length; i++){
    const f = snow[i];
    f.y += f.v * dt;
    f.x += Math.sin(t * 0.7 + f.ph) * f.sw * dt;
    if(f.y > BH){ f.y = -3; f.x = Math.random() * BW; }
    if(f.x < -2) f.x = BW + 2; else if(f.x > BW + 2) f.x = -2;
  }
  const spec = currentDrift();
  if(spec){
    for(let i = 0; i < drift.length; i++){
      const l = drift[i];
      const speed = spec.rate * (0.7 + l.sp * 0.55);
      l.y += speed * dt;
      l.x += (Math.sin(t * 0.5 + l.ph) * spec.wobble + 2) * (0.55 + l.sp * 0.5) * dt;
      if(l.amb){
        // the ambient trickle enters across the top and never claims a crown
        if(l.y > BH){ l.y = -4; l.x = Math.round((l.ph / 6.283) * BW); }
        if(l.x > BW + 4) l.x = -4;
      } else if(l.y > BH || l.x > BW + 6){
        // released again from the same crown emitter: the drift keeps a source
        l.j = (l.j + 1) & 3;
        l.y = l.ey - 2;
        l.x = l.ex + l.ox + ((l.j & 1) ? 2 : -2);
        l.ph += 0.9;
      }
    }
  }
}

/* --------------------------------------------------------------- main loop */
let lastFrame = 0, hourSyncAt = 0;
function tick(now){
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  // the scene is always the city's real local time: resync once a second
  if(now - hourSyncAt > 1000){
    hourSyncAt = now;
    const real = cityNow();
    if(real !== state.hour){ state.hour = real; updateClockLabel(); }
  }
  updateWeather(dt);
  drawFrame(now, dt);
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------- boot */
function measure(){
  const cssW = Math.max(240, innerWidth), cssH = Math.max(160, innerHeight);
  const dpr = Math.min(isFirefox ? 1.25 : 2, window.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  cv.style.width = cssW + "px";
  cv.style.height = cssH + "px";
  // an art pixel is an integer number of device pixels, sized so the buffer is ~480 wide
  const AR = 1.62;                                  // a window has a landscape shape
  const fit = () => {
    let w = Math.ceil(cv.width / p), h = Math.ceil(cv.height / p);
    if(h / w > 1 / AR) h = Math.max(120, Math.round(w / AR));
    return [w, h];
  };
  let p = Math.max(1, Math.round(Math.min(cssW / 480, cssH / 270) * dpr));
  let size = fit();
  while(size[0] * size[1] > 300000 && p < 32){ p++; size = fit(); }
  // fill the viewport: pick the integer art-pixel scale that covers it, then centre-crop.
  // (No letterbox, no window frame — the art runs edge to edge.)
  const pc = Math.max(1, Math.ceil(cv.width / size[0]), Math.ceil(cv.height / size[1]));
  allocate(size[0], size[1], pc);
  bx = Math.round((cv.width - size[0] * pc) / 2);
  by = Math.round((cv.height - size[1] * pc) / 2);
  // portrait windows crop the sides hard; keep the pagoda island (at ~0.215 of the
  // art width, bottom-left) on screen by shifting the crop toward it
  if(cv.height > cv.width * 0.95){
    const want = Math.round(cv.width * 0.30 - size[0] * pc * 0.215);
    const lowB = cv.width - size[0] * pc;          // most-negative allowed
    bx = Math.max(lowB, Math.min(0, want));
  }
  dprNow = dpr;
  layoutGardenLink();
  layoutWalkLight();
}

/* The pagoda island is a link into the voxel garden.  Place a real <a> over it,
   computed from the framebuffer geometry (the canvas is integer-scaled and
   centre-cropped, so a static CSS box would drift), then clamp it on screen. */
function layoutGardenLink(){
  if(!gardenLink || !cv || !dprNow) return;
  const k = px / dprNow;                        // art px -> CSS px
  const ax = BW * 0.215 - 52;                   // island + pagoda, art px
  const ay = BH - 82;                           // above the finial, down off-frame
  let left = bx / dprNow + ax * k;
  let top  = by / dprNow + ay * k;
  let w = 104 * k;
  let h = (BH - ay) * k;
  const vw = Math.max(240, innerWidth), vh = Math.max(160, innerHeight);
  if(left < 0){ w += left; left = 0; }
  if(top < 0){ h += top; top = 0; }
  if(left + w > vw) w = vw - left;
  if(top + h > vh) h = vh - top;
  // on a heavily cropped portrait window the island is off-screen anyway: no
  // invisible click target, the link is simply not there
  if(w < 28 || h < 28){ gardenLink.style.display = "none"; return; }
  gardenLink.style.display = "block";
  gardenLink.style.left = Math.round(left) + "px";
  gardenLink.style.top = Math.round(top) + "px";
  gardenLink.style.width = Math.round(w) + "px";
  gardenLink.style.height = Math.round(h) + "px";
}
