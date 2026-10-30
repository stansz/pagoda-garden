"use strict";

/* ---------------------------------------------------------------------- UI */
const sndBtn = document.getElementById("snd");
const volInput = document.getElementById("vol");
const hint = document.getElementById("hint");
const zinBtn = document.getElementById("zin");
const zoutBtn = document.getElementById("zout");
const placeBtn = document.getElementById("place");
const placesEl = document.getElementById("places");
const placeBtns = Array.from(document.querySelectorAll("[data-place]"));

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

function setWeather(which){
  currentWx = which;
  rainTarget = which === "rain" ? 1 : 0;
  snowTarget = which === "snow" ? 1 : 0;
}

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
let placeIx = 0, placeTemp = null, cloudAmt = 0, wxAuto = true;
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
  const L = PLACES[placeIx];
  placeBtn.textContent = L.name + " ▾";
  for(const b of placeBtns) b.setAttribute("aria-current", String(b.dataset.place === String(placeIx)));
}

async function refreshPlaceWeather(){
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
  placeIx = PLACES[ix] ? ix : 0;
  placeTemp = null;
  wxAuto = true;
  hour = localHour(PLACES[placeIx].tz);
  updatePlaceLabel();
  refreshPlaceWeather();
  updateInfo();
  savePrefs();
}

function openPlaces(open){
  placesEl.hidden = !open;
  placeBtn.setAttribute("aria-expanded", String(open));
  if(open){
    // beside the card it belongs to, or under it where the window is too narrow
    const card = info.getBoundingClientRect();
    const beside = card.right + 8 + placesEl.offsetWidth <= innerWidth - 10;
    placesEl.style.left = Math.round(beside ? card.right + 8 : card.left) + "px";
    placesEl.style.top = Math.round(beside ? card.top : card.bottom + 6) + "px";
  }
}
placeBtn.addEventListener("click", e => {
  e.stopPropagation();
  openPlaces(placesEl.hidden);
});
for(const b of placeBtns) b.addEventListener("click", () => {
  selectPlace(Number(b.dataset.place));
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

function fmtHour(h){
  const x = ((h % 24) + 24) % 24;
  const hh = Math.floor(x), mm = Math.min(59, Math.round((x - hh) * 60));
  return pad2(hh) + ":" + pad2(mm);
}

function updateInfo(){
  const place = PLACES[placeIx];
  const realH = localHour(place.tz);

  infoPlace.textContent = place.name;
  infoClock.textContent = fmtHour(realH);

  infoCond.textContent = fetchState === "loading" ? "Loading…"
    : placeCode === null ? "—" : condLabel(placeCode);
  infoTemp.textContent = placeTemp === null ? "" : Math.round(placeTemp) + "°C";

  const age = lastFetchAt ? Math.round((Date.now() - lastFetchAt) / 60000) : null;
  infoMeta.textContent = fetchState === "error" ? "Offline · last known"
    : fetchState !== "ok" ? "Fetching…"
    : "Open-Meteo" + (age === null ? "" : " · " + (age < 1 ? "just now" : age + "m ago"));

  infoRefresh.classList.toggle("spin", fetchState === "loading");
  infoRefresh.title = "Refresh this city now";
  infoHead.setAttribute("aria-expanded", String(!info.classList.contains("closed")));
}

function refreshNow(){
  if(fetchState === "loading") return;
  hour = localHour(PLACES[placeIx].tz);       // re-sync the sky to the city's real clock too
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
// the scene's clock is the chosen city's real clock, and its weather is refreshed now and then
setInterval(() => {
  hour = localHour(PLACES[placeIx].tz);
  updateInfo();
}, 1000);
setInterval(() => { if(wxAuto) refreshPlaceWeather(); }, 15 * 60 * 1000);


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
      vol, zoom: +zoomTarget.toFixed(3), place: placeIx,
      infoOpen: !info.classList.contains("closed")
    }));
  } catch(e){}
}
function loadPrefs(){
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); } catch(e){}
  if(!p) return null;
  if(typeof p.vol === "number"){ vol = p.vol; volInput.value = String(vol); }
  if(Number.isFinite(p.zoom)){ zoom = zoomTarget = clamp(p.zoom, ZOOM_MIN, ZOOM_MAX); }
  if(typeof p.infoOpen === "boolean"){ info.classList.toggle("closed", !p.infoOpen); }
  return p;
}

// the URL wins over remembered state; otherwise the last city, otherwise Vancouver
const savedPrefs = loadPrefs();
let startIx = savedPrefs && Number.isInteger(savedPrefs.place) && PLACES[savedPrefs.place] ? savedPrefs.place : 0;
const queryKey = cityFromQuery();
if(queryKey){
  const qix = PLACES.findIndex(p => p.id === queryKey);
  if(qix >= 0) startIx = qix;
}
selectPlace(startIx);
setTimeout(() => { hint.style.opacity = "0"; }, 14000);

