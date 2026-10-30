"use strict";

/* ------------------------------------------------------------ city dropdown */
const cityBtnEl = document.getElementById("cityBtn");
const cityMenuEl = document.getElementById("cityMenu");
function syncCityLabel(){
  if(!cityBtnEl) return;
  const rec = CITY_BY_ID[state.city];
  cityBtnEl.textContent = (rec ? rec.name : "City") + " \u25BE";
}
function cityMenuOpen(){ return !!(cityMenuEl && !cityMenuEl.hidden); }
function openCityMenu(){
  if(!cityMenuEl || !cityBtnEl) return;
  const b = cityBtnEl.getBoundingClientRect();
  cityMenuEl.hidden = false;
  const mw = cityMenuEl.offsetWidth || 140;
  const mh = cityMenuEl.offsetHeight || 200;
  cityMenuEl.style.left = Math.round(Math.max(8, Math.min(b.left, innerWidth - mw - 8))) + "px";
  const below = b.bottom + 6;
  cityMenuEl.style.top = Math.round(Math.min(below, Math.max(8, innerHeight - mh - 8))) + "px";
  cityMenuEl.style.bottom = "auto";
  cityBtnEl.setAttribute("aria-expanded", "true");
}
function closeCityMenu(){
  if(!cityMenuEl) return;
  cityMenuEl.hidden = true;
  if(cityBtnEl) cityBtnEl.setAttribute("aria-expanded", "false");
}
function toggleCityMenu(){ cityMenuOpen() ? closeCityMenu() : openCityMenu(); }
if(cityBtnEl) cityBtnEl.addEventListener("click", e => { e.stopPropagation(); toggleCityMenu(); });
addEventListener("pointerdown", e => {
  if(!cityMenuOpen()) return;
  if(cityMenuEl.contains(e.target) || e.target === cityBtnEl) return;
  closeCityMenu();
}, { passive: true });
addEventListener("keydown", e => { if(e.key === "Escape" && cityMenuOpen()) closeCityMenu(); });

function boot(){
  cv = document.getElementById("scene");
  if(!cv) return;
  dctx = cv.getContext("2d", { alpha: false });
  uiEl = document.getElementById("ui");
  hourInput = document.getElementById("hour");
  clockEl = document.getElementById("clock");
  cycleBtn = document.getElementById("cycle");
  ownBtn = document.getElementById("own");
  cityBtns = Array.prototype.slice.call(document.querySelectorAll("[data-city]"));
  wxBtns = Array.prototype.slice.call(document.querySelectorAll("[data-wx]"));
  infoEl = document.getElementById("info");
  infoHead = document.getElementById("infoHead");
  infoPlace = document.getElementById("infoPlace");
  infoClock = document.getElementById("infoClock");
  infoRefresh = document.getElementById("infoRefresh");
  infoCond = document.getElementById("infoCond");
  infoTemp = document.getElementById("infoTemp");
  infoCondS = document.getElementById("infoCondS");
  infoTempS = document.getElementById("infoTempS");
  infoSeasonS = document.getElementById("infoSeasonS");
  infoMeta = document.getElementById("infoMeta");
  infoSceneEl = document.getElementById("infoScene");
  infoSeasonEl = document.getElementById("infoSeason");
  gardenLink = document.getElementById("gardenLink");
  sndBtn = document.getElementById("snd");
  volInput = document.getElementById("vol");
  for(let i = 0; i < wxBtns.length; i++)
    if(wxBtns[i].dataset.wx === "snow") snowBtn = wxBtns[i];

  measure();
  let rzT = 0;
  addEventListener("resize", () => {
    clearTimeout(rzT);
    rzT = setTimeout(measure, 140);
  });

  for(let i = 0; i < cityBtns.length; i++){
    cityBtns[i].addEventListener("click", () => { setCity(cityBtns[i].dataset.city, false); closeCityMenu(); });
  }
  const wxCycleBtn = document.getElementById("wxCycle");
  if(wxCycleBtn) wxCycleBtn.addEventListener("click", cycleWeather);
  for(let i = 0; i < wxBtns.length; i++){
    wxBtns[i].addEventListener("click", () => manualWeather(wxBtns[i].dataset.wx));
  }

  if(sndBtn) sndBtn.addEventListener("click", () => {
    // when the saved preference is "on", the first gesture's pointerdown has
    // already started the sound — don't let the click that follows toggle it off
    if(resumeClickGuard){
      resumeClickGuard = false;
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if(now - resumeClickAt < 900) return;
    }
    setSoundOn(!soundOn);
  });
  if(volInput) volInput.addEventListener("input", () => {
    const v = parseFloat(volInput.value);
    vol = Number.isFinite(v) ? clamp(v, 0, 1) : 0.18;
    if(ac && soundOn) master.gain.setTargetAtTime(vol * 0.5 * (musicProfile().level || 1), ac.currentTime, 0.2);
    savePrefsSoon();
  });

  infoHead.addEventListener("click", () => {
    const open = infoEl.classList.contains("closed");
    infoEl.classList.toggle("closed", !open);
    infoHead.setAttribute("aria-expanded", String(open));
    updateInfo();
    savePrefs();
  });
  infoHead.addEventListener("keydown", e => {
    if(e.target !== infoHead) return;
    if(e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    infoHead.click();
  });
  infoRefresh.addEventListener("click", e => {
    e.stopPropagation();
    refreshNow();
  });

  loadPrefs();
  if(gardenLink) gardenLink.href = "./voxel-garden/?city=" + encodeURIComponent(state.city);
  if(volInput) volInput.value = String(vol);
  paintSoundButton();
  if(soundWanted) armGestureStart();   // never autoplay: wait for the first gesture
  setInterval(updateInfo, 1000);
  setInterval(() => { if(!state.own && state.wxAuto) refreshWeather(); }, 15 * 60 * 1000);
  requestAnimationFrame(tick);
}
