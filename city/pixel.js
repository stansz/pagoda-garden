"use strict";

/* --------------------------------------------- headless hook for the harness */
const PIXEL = {
  state,
  cities(){ return CITY_IDS.slice(); },
  record(id){ return cityRecord(id); },
  setup(w, h){ allocate(w, h, 1); },
  render(city, hour, opts){
    opts = opts || {};
    if(city && CITY_BY_ID[city]) state.city = city;
    if(hour !== undefined) state.hour = hour;
    if(opts.season !== undefined) state.seasonOverride = opts.season || null;
    refreshSeason();
    if(opts.rain !== undefined){ state.rainAmt = state.rainTarget = opts.rain; }
    if(opts.snow !== undefined){ state.snowAmt = state.snowTarget = opts.snow; }
    if(!snowAllowed()){ state.snowAmt = state.snowTarget = 0; }   // e.g. Sydney summer
    if(opts.cloud !== undefined) state.cloudAmt = opts.cloud;
    buildScene(state.city);          // cached unless city/season/size changed
    buildSill(state.city);
    waterCv = null;
    paintWater();
    const m = moodAt(state.hour);
    paintSky(m);
    skyBucket = Math.round(state.hour * 20) / 20;
    drawFrame(1000, 0.016);
    return buf;
  },
  framebuffer(){ return buf; },
  frame(now){ drawFrame(now || 1000, 0.016); },
  moodAt,
  hemisphereOf,
  seasonOf,
  seasonNow,
  citySeason(id, month){
    const c = cityRecord(id);
    return seasonOf(month === undefined ? localParts(c.tz).month : month, c.lat);
  },
  drift(id, season){ return driftFor(id, season); },
  /* ---- season + tree + bake inspection (all read-only, for the harness) ---- */
  setSeason(season){                    // force a season and repaint once
    state.seasonOverride = season || null;
    return refreshSeason();
  },
  sceneSeason(){ return scene ? scene.season : null; },
  view(){ return { bw: BW, bh: BH, px, bx, by, pad: PAD }; },
  layers(){ return scene ? { far: scene.farC, mid: scene.midC, near: scene.nearC } : null; },
  treeInfo(){ return scene ? scene.treeInfo : null; },
  treeEmitters(){ return scene ? scene.treeEmitters.slice() : []; },
  bakes(){ return { scene: bakeStats.scene, near: bakeStats.near, hits: bakeStats.hits, byCity: Object.assign({}, bakeStats.byCity) }; },
  driftParticles(){ return drift.slice(0, 28); },
  driftSource(){ return scene ? scene.treeInfo : null; },

  /* ---- audio inspection (this is how the port is verified headlessly) ----
     `state` is the AudioContext state ("none" before the first gesture,
     "running" once started), `on` the sound toggle, `profile` the current
     city's music profile name, `rms` a short RMS off the master mix via an
     AnalyserNode, plus the current chord/cutoff/gains for the checks. */
  audio(){
    const prof = musicProfile();
    const ch = musicChord();
    return {
      state: ac ? ac.state : "none",
      ctx: ac ? ac.state : "none",
      on: soundOn,
      armed: gestureArmed,
      city: state.city,
      profile: prof.name,
      rms: audioRms(),
      chord: { bass: ch.bass, pad: ch.pad.slice() },
      chords: prof.chords.map(c => ({ bass: c.bass, pad: c.pad.slice() })),
      hold: prof.hold,
      cutoff: padFilter ? padFilter.frequency.value : prof.cutoff,
      tone: toneFilter ? toneFilter.frequency.value : 18000,
      scale: prof.scale.slice(),
      reverb: { seconds: prof.reverb.seconds, decay: prof.reverb.decay },
      air: prof.air,
      vol,
      gains: {
        master: master ? master.gain.value : 0,
        rain: rainGain ? rainGain.gain.value : 0,
        air: airGain ? airGain.gain.value : 0
      }
    };
  },
  audioProfile(id){
    const p = musicFor(id);
    return {
      id: MUSIC[id] ? id : MUSIC_FALLBACK,
      name: p.name, hold: p.hold, cutoff: p.cutoff, air: p.air, level: p.level,
      reverb: { seconds: p.reverb.seconds, decay: p.reverb.decay, wet: p.reverb.wet },
      pluckEvery: p.pluckEvery.slice(), pluckLevel: p.pluckLevel,
      chords: p.chords.map(c => ({ bass: c.bass, pad: c.pad.slice() })),
      scale: p.scale.slice()
    };
  },
  audioUpdate(){ updateAudio(); return PIXEL.audio(); },
  audioToggle(){ return setSoundOn(!soundOn); },
  session: {
    get(){ return { kind: session.kind, breakType: session.breakType, lenMin: session.lenMin,
                    leftMs: sessionLeftMs(), totalMs: session.totalMs,
                    progress: session.totalMs > 0 ? clamp(1 - sessionLeftMs() / session.totalMs, 0, 1) : 0,
                    paused: session.paused, completed: session.completed, round: sessionRound(),
                    rounds: ROUNDS, autoStart: session.autoStart, marks: session.marks, title: document.title }; },
    start(min){ return startSession(min); },
    stop(){ stopSession(); },
    tick(){ tickSession(); },
    endIn(ms){ session.endAt = Date.now() + Math.max(0, ms); if(session.paused) session.pausedLeft = Math.max(0, ms); },
    pause(){ pauseSession(); }, resume(){ resumeSession(); },
    extend(min){ extendSession(min); }, skip(){ skipBreak(); },
    setAutoStart(on){ setAutoStart(on); },
    tint(){ return { focus: sessionTint.focus, brk: sessionTint.brk }; },
    row(){ const r = document.getElementById("focusPillText"); return r ? r.textContent : null; }
  },
  selectCity(id){ if(CITY_BY_ID[id]) setCity(id, true); return state.city; }
};
if(typeof globalThis !== "undefined") globalThis.PIXEL = PIXEL;

if(hasDOM && typeof document.getElementById === "function") boot();
