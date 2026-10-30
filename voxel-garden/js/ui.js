"use strict";

/* ---------------------------------------------------------------------- UI */
const ui = document.getElementById("ui");
const hourInput = document.getElementById("hour");
const clockEl = document.getElementById("clock");
const cycleBtn = document.getElementById("cycle");
const sndBtn = document.getElementById("snd");
const volInput = document.getElementById("vol");
const hint = document.getElementById("hint");
const zinBtn = document.getElementById("zin");
const zoutBtn = document.getElementById("zout");
const placeBtn = document.getElementById("place");
const placesEl = document.getElementById("places");
const placeBtns = Array.from(document.querySelectorAll("[data-place]"));
const wxBtns = Array.from(document.querySelectorAll("[data-wx]"));

/* ------------------------------------------------------- back to the city */
// The city page (the site front page) sends people here with ?city=<id>; a browser
// coming straight from it sends a referrer instead. Either way, leave a way back.
// When the garden is opened on its own the pill never appears.
const CITY_NAMES = {
  vancouver: "Vancouver", toronto: "Toronto", hawaii: "Hawai'i",
  hongkong: "Hong Kong", amsterdam: "Amsterdam", sydney: "Sydney"
};

function cityFromQuery(){
  const search = (typeof location !== "undefined" && location.search) || "";
  const m = /[?&]city=([^&#]*)/.exec(search);
  if(!m) return null;                                  // no ?city= at all
  try { return decodeURIComponent(m[1]); } catch(e){ return m[1]; }
}

(function initBackPill(){
  const back = document.getElementById("backCity");
  if(!back) return;
  const key = cityFromQuery();
  const referrer = (typeof document !== "undefined" && document.referrer) || "";
  if(key === null && !/\/pagoda-garden\/?(index\.html)?([?#]|$)/i.test(referrer)) return;
  back.textContent = "\u2190 back to " + (CITY_NAMES[key] || "the city");
  back.href = "../" + (key ? "?city=" + encodeURIComponent(key) : "");
  back.hidden = false;
})();

// Entering from a city sets the garden to that place, so the light and the weather
// you were just looking at continue indoors. Called once the location list exists.
function adoptCityFromQuery(){
  const key = cityFromQuery();
  if(!key) return;
  const ix = PLACES.findIndex(p => p.id === key);
  if(ix >= 0) selectPlace(ix);
}

function updateClock(){
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  clockEl.textContent = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}
updateClock();

let hideTimer = 0;
function showUI(){
  ui.classList.add("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if(!ui.matches(":hover")) ui.classList.remove("show"); }, 4800);
}
addEventListener("pointermove", showUI, { passive: true });
addEventListener("pointerdown", showUI, { passive: true });
ui.addEventListener("mouseenter", () => clearTimeout(hideTimer));
ui.addEventListener("mouseleave", () => { hideTimer = setTimeout(() => ui.classList.remove("show"), 1600); });
setTimeout(showUI, 700);

hourInput.addEventListener("input", () => {
  hour = parseFloat(hourInput.value);
  cycleOn = false;
  cycleBtn.setAttribute("aria-pressed", "false");
  updateClock();
  savePrefs();
});

cycleBtn.addEventListener("click", () => {
  cycleOn = !cycleOn;
  cycleBtn.setAttribute("aria-pressed", String(cycleOn));
  savePrefs();
});

function setWeather(which){
  currentWx = which;
  rainTarget = which === "rain" ? 1 : 0;
  snowTarget = which === "snow" ? 1 : 0;
  for(const b of wxBtns) b.setAttribute("aria-pressed", String(b.dataset.wx === which));
}
// A hand-picked sky means you have left location mode: a location is always its real
// weather, so overriding one drops the city instead of quietly disagreeing with it.
function manualWeather(which){
  if(placeIx !== null) selectPlace(null);
  wxAuto = false;
  cloudAmt = 0;
  setWeather(which);
  updateInfo();
  savePrefs();
}
for(const b of wxBtns) b.addEventListener("click", () => manualWeather(b.dataset.wx));

/* ------------------------------------------------------------------ places */
// Real city clocks (Intl handles DST) plus live conditions from Open-Meteo, which
// needs no key and allows browser requests. Offline, the clock still works and the
// weather simply stays as it was. A city drives the clock and the weather only:
// the garden itself is always this one garden.
const PLACES = [
  { id: "vancouver", name: "Vancouver", lat: 49.2827, lon: -123.1207, tz: "America/Vancouver" },
  { id: "toronto",   name: "Toronto",   lat: 43.6532, lon: -79.3832,  tz: "America/Toronto" },
  { id: "hawaii",    name: "Hawai'i",   lat: 21.3069, lon: -157.8583, tz: "Pacific/Honolulu" },
  { id: "hongkong",  name: "Hong Kong", lat: 22.3193, lon: 114.1694,  tz: "Asia/Hong_Kong" },
  { id: "amsterdam", name: "Amsterdam", lat: 52.3676, lon: 4.9041,    tz: "Europe/Amsterdam" },
  { id: "sydney",    name: "Sydney",    lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" }
];
let placeIx = null, placeTemp = null, cloudAmt = 0, wxAuto = true;
let placeCode = null, fetchState = "idle", lastFetchAt = 0;

function localHour(tz){
  try{
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === "hour").value) % 24;
    const m = Number(parts.find(p => p.type === "minute").value);
    return h + m / 60;
  }catch(e){ return hour; }
}

function weatherKind(code){
  if([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return "clear";
}

function updatePlaceLabel(){
  if(placeIx === null){ placeBtn.textContent = "location"; return; }
  const L = PLACES[placeIx];
  placeBtn.textContent = L.name + (placeTemp === null ? "" : " " + placeTemp + "°");
  for(const b of placeBtns) b.setAttribute("aria-current", String(b.dataset.place === String(placeIx)));
}

async function refreshPlaceWeather(){
  if(placeIx === null) return;
  const L = PLACES[placeIx];
  fetchState = "loading";
  updateInfo();
  try{
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + L.lat + "&longitude=" + L.lon +
                "&current=weather_code,temperature_2m,cloud_cover&timezone=auto";
    const r = await fetch(url, { cache: "no-store" });
    if(!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const cur = (j && j.current) || {};
    wxAuto = true;
    placeCode = Number.isFinite(cur.weather_code) ? Number(cur.weather_code) : null;
    setWeather(weatherKind(placeCode));
    cloudAmt = Number.isFinite(cur.cloud_cover) ? clamp(cur.cloud_cover / 100, 0, 1) : 0;
    placeTemp = Number.isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null;
    fetchState = "ok";
    lastFetchAt = Date.now();
  }catch(e){
    fetchState = "error";
  }
  updatePlaceLabel();
  updateInfo();
}

function selectPlace(ix){
  placeIx = Number.isInteger(ix) ? ix : null;
  placeTemp = null;
  if(placeIx === null){
    wxAuto = true;
    cloudAmt = 0;
    placeCode = null;
    fetchState = "idle";
    updatePlaceLabel();
  }else{
    wxAuto = true;
    hour = localHour(PLACES[placeIx].tz);
    cycleOn = false;
    cycleBtn.setAttribute("aria-pressed", "false");
    hourInput.value = hour.toFixed(2);
    updateClock();
    updatePlaceLabel();
    refreshPlaceWeather();
  }
  updateInfo();
  savePrefs();
}

function openPlaces(open){
  placesEl.hidden = !open;
  placeBtn.setAttribute("aria-expanded", String(open));
  if(open){
    showUI();
    // sit just above the bar and centred on the button, whatever the bar wrapped to
    const bar = ui.getBoundingClientRect();
    const pb = placeBtn.getBoundingClientRect();
    placesEl.style.bottom = Math.max(10, Math.round(innerHeight - bar.top + 8)) + "px";
    placesEl.style.left = Math.round(clamp(pb.left + pb.width / 2, 90, innerWidth - 90)) + "px";
  }
}
placeBtn.addEventListener("click", e => {
  e.stopPropagation();
  openPlaces(placesEl.hidden);
});
for(const b of placeBtns) b.addEventListener("click", () => {
  selectPlace(b.dataset.place === "local" ? null : Number(b.dataset.place));
  openPlaces(false);
});
addEventListener("pointerdown", e => {
  if(!placesEl.hidden && !placesEl.contains(e.target) && e.target !== placeBtn) openPlaces(false);
}, { passive: true });

/* ------------------------------------------------------------- corner card */
const info = document.getElementById("info");
const infoHead = document.getElementById("infoHead");
const infoPlace = document.getElementById("infoPlace");
const infoClock = document.getElementById("infoClock");
const infoRefresh = document.getElementById("infoRefresh");
const infoCond = document.getElementById("infoCond");
const infoTemp = document.getElementById("infoTemp");
const infoMeta = document.getElementById("infoMeta");
const infoScene = document.getElementById("infoScene");

function fmtHour(h){
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x), mm = Math.min(59, Math.round((x - hh) * 60));
  return pad2(hh) + ":" + pad2(mm);
}

function updateInfo(){
  const place = placeIx === null ? null : PLACES[placeIx];
  const realH = place ? localHour(place.tz) : ownHour();

  infoPlace.textContent = place ? place.name : "Own time";
  infoClock.textContent = fmtHour(realH);

  if(place){
    infoCond.textContent = !wxAuto ? condLabel(wxToCode(currentWx))
      : fetchState === "loading" ? "Loading…"
      : placeCode === null ? "—" : condLabel(placeCode);
    infoTemp.textContent = placeTemp === null ? "" : Math.round(placeTemp) + "°C";
  }else{
    infoCond.textContent = condLabel(wxToCode(currentWx));
    infoTemp.textContent = "";
  }

  const age = lastFetchAt ? Math.round((Date.now() - lastFetchAt) / 60000) : null;
  infoMeta.textContent = (!place || !wxAuto) ? "Weather set by hand"
    : fetchState === "error" ? "Offline · last known"
    : fetchState !== "ok" ? "Fetching…"
    : "Open-Meteo" + (age === null ? "" : " · " + (age < 1 ? "just now" : age + "m ago"));

  const differs = Math.abs(hour - realH) > 0.12;
  infoScene.hidden = !differs;
  if(differs) infoScene.textContent = "Scene " + fmtHour(hour) + (cycleOn ? " · cycling" : "");

  const busy = fetchState === "loading" && !!place;
  infoRefresh.disabled = !place;
  infoRefresh.classList.toggle("spin", busy);
  infoRefresh.title = place ? "Refresh this city now" : "Pick a location to refresh its weather";
  infoHead.setAttribute("aria-expanded", String(!info.classList.contains("closed")));
}

function refreshNow(){
  if(placeIx === null || fetchState === "loading") return;
  if(!cycleOn){                                  // re-sync the sky to the city's real clock too
    hour = localHour(PLACES[placeIx].tz);
    hourInput.value = hour.toFixed(2);
    updateClock();
  }
  refreshPlaceWeather();
}

function setInfoOpen(open){
  info.classList.toggle("closed", !open);
  infoHead.setAttribute("aria-expanded", String(open));
  updateInfo();
  savePrefs();
}
infoHead.addEventListener("click", () => setInfoOpen(info.classList.contains("closed")));
infoHead.addEventListener("keydown", e => {
  if(e.target !== infoHead) return;          // let the refresh button handle its own keys
  if(e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  setInfoOpen(info.classList.contains("closed"));
});
infoRefresh.addEventListener("click", e => {
  e.stopPropagation();                 // don't also collapse the card
  refreshNow();
});
setInterval(updateInfo, 1000);

// keep the chosen city's clock honest, and refresh its weather now and then
setInterval(() => {
  if(placeIx === null) return;
  const t = localHour(PLACES[placeIx].tz);
  if(Math.abs(t - hour) > 0.02 && !cycleOn){
    hour = t;
    hourInput.value = hour.toFixed(2);
    updateClock();
  }
}, 30000);
setInterval(() => { if(placeIx !== null && wxAuto) refreshPlaceWeather(); }, 15 * 60 * 1000);


sndBtn.addEventListener("click", async () => {
  if(!audioInit()) return;
  try { await ac.resume(); } catch(e){}
  if(soundOn) stopSound(); else startSound();
  sndBtn.setAttribute("aria-pressed", String(soundOn));
  sndBtn.textContent = soundOn ? "sound on" : "sound";
});

volInput.addEventListener("input", () => {
  vol = parseFloat(volInput.value);
  if(ac && soundOn) master.gain.setTargetAtTime(vol * 0.5, ac.currentTime, 0.2);
  savePrefs();
});

function nudgeZoom(factor){
  zoomTarget = clamp(zoomTarget * factor, ZOOM_MIN, ZOOM_MAX);
  savePrefsSoon();
}
zinBtn.addEventListener("click", () => nudgeZoom(1.18));
zoutBtn.addEventListener("click", () => nudgeZoom(1 / 1.18));

/* remember the last look so the page opens the way it was left */
const PREF_KEY = "pagoda-garden.v4";
let currentWx = "clear";
let prefTimer = 0;
function savePrefsSoon(){ clearTimeout(prefTimer); prefTimer = setTimeout(savePrefs, 600); }
function savePrefs(){
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      hour, cycleOn, wx: currentWx, vol, zoom: +zoomTarget.toFixed(3), place: placeIx,
      infoOpen: !info.classList.contains("closed")
    }));
  } catch(e){}
}
function loadPrefs(){
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); } catch(e){}
  if(!p) return;
  if(Number.isFinite(p.hour)) hour = p.hour;
  if(typeof p.cycleOn === "boolean") cycleOn = p.cycleOn;
  if(typeof p.vol === "number"){ vol = p.vol; volInput.value = String(vol); }
  if(Number.isFinite(p.zoom)){ zoom = zoomTarget = clamp(p.zoom, ZOOM_MIN, ZOOM_MAX); }
  if(typeof p.infoOpen === "boolean"){ info.classList.toggle("closed", !p.infoOpen); }
  hourInput.value = hour.toFixed(2);
  cycleBtn.setAttribute("aria-pressed", String(cycleOn));
  updateClock();
  setWeather(typeof p.wx === "string" ? p.wx : "clear");
  if(Number.isInteger(p.place) && PLACES[p.place]) selectPlace(p.place);
  updateInfo();
}
loadPrefs();
if(cityFromQuery()) adoptCityFromQuery();      // the URL wins over remembered state
setTimeout(() => { hint.style.opacity = "0"; }, 14000);

