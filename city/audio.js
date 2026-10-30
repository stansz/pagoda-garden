"use strict";

/* =========================================================================
   Sound: a port of relax.html's ambient engine.  A washed five-voice pad, a
   sub bass, sparse "music box" plucks through a convolution reverb generated
   in the page, an air bed and a rain bed, all under a compressor and a soft
   high shelf on the master.  The four chords, hold time, pad cutoff, pluck
   scale, reverb length/decay and air level are a per-city profile (MUSIC);
   a city change glides the running graph to the new profile instead of
   restarting it.  Nothing here runs until a real user gesture.
   ========================================================================= */
let ac = null, master = null, mixBus = null, revSend = null, conv = null, revGain = null;
let rainGain = null, airGain = null, padGain = null, padFilter = null, toneFilter = null;
let bassOsc = null, padVoices = [], analyser = null, rmsBuf = null;
let soundOn = false, vol = 0.18, soundWanted = false;
let chordIx = -1, nextChordAt = 0, nextPluckAt = 0, schedTimer = 0;
let gestureArmed = false, gestureHandler = null, resumeClickGuard = false, resumeClickAt = 0;
let sndBtn = null, volInput = null;

/* One profile per city.  `chords` are four consonant voicings (five pad
   frequencies each, 130-590 Hz; bass 40-100 Hz), `hold` is how long one chord
   rides (11-16 s), `cutoff` is the pad lowpass, `scale` the pluck pool,
   `reverb` the generated impulse length/decay (+ wet level), `air` the noise
   bed level, `pluckEvery` the min/max gap between plucks (the local tempo),
   `pluckLevel` the pluck amplitude and `level` the profile's master trim. */
const MUSIC = {
  vancouver: {
    name: "vancouver · mellow low",
    chords: [                                   // Dmaj9 / Bm7 / Gmaj7 / Aadd9
      { bass: 73.42, pad: [146.83, 185.00, 220.00, 277.18, 329.63] },
      { bass: 61.74, pad: [146.83, 185.00, 246.94, 293.66, 329.63] },
      { bass: 49.00, pad: [146.83, 196.00, 246.94, 293.66, 392.00] },
      { bass: 55.00, pad: [164.81, 220.00, 246.94, 329.63, 392.00] }
    ],
    hold: 15.5, cutoff: 900,
    scale: [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99],
    reverb: { seconds: 3.2, decay: 2.6, wet: 0.36 },
    air: 0.040, pluckEvery: [5.0, 10.0], pluckLevel: 0.085, level: 0.75
  },
  toronto: {
    name: "toronto · warm mid",
    chords: [                                   // Cmaj7 / Am7 / Fmaj7 / G6
      { bass: 65.41, pad: [130.81, 164.81, 196.00, 246.94, 329.63] },
      { bass: 55.00, pad: [130.81, 164.81, 220.00, 261.63, 329.63] },
      { bass: 43.65, pad: [130.81, 174.61, 220.00, 261.63, 349.23] },
      { bass: 49.00, pad: [146.83, 196.00, 246.94, 293.66, 329.63] }
    ],
    hold: 12.5, cutoff: 1250,
    scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25],
    reverb: { seconds: 2.6, decay: 2.2, wet: 0.32 },
    air: 0.048, pluckEvery: [3.2, 7.0], pluckLevel: 0.100, level: 0.90
  },
  hawaii: {
    name: "hawaii · bright trades",
    chords: [                                   // Gmaj9 / Em7 / C6 / D6/9
      { bass: 98.00, pad: [246.94, 293.66, 369.99, 440.00, 493.88] },
      { bass: 82.41, pad: [196.00, 246.94, 293.66, 329.63, 392.00] },
      { bass: 65.41, pad: [261.63, 329.63, 392.00, 440.00, 523.25] },
      { bass: 73.42, pad: [293.66, 369.99, 440.00, 493.88, 587.33] }
    ],
    hold: 11.5, cutoff: 2600,
    scale: [392.00, 440.00, 493.88, 587.33, 659.25, 739.99, 880.00],
    reverb: { seconds: 2.2, decay: 2.0, wet: 0.30 },
    air: 0.060, pluckEvery: [1.8, 4.2], pluckLevel: 0.095, level: 1.00
  },
  hongkong: {
    name: "hongkong · harbour dark",
    chords: [                                   // Dm9 / Bbmaj7 / Gm7 / Aø7
      { bass: 73.42, pad: [146.83, 174.61, 220.00, 261.63, 329.63] },
      { bass: 58.27, pad: [174.61, 233.08, 293.66, 349.23, 440.00] },
      { bass: 49.00, pad: [146.83, 174.61, 196.00, 233.08, 293.66] },
      { bass: 55.00, pad: [130.81, 220.00, 261.63, 311.13, 392.00] }
    ],
    hold: 15.0, cutoff: 720,
    scale: [293.66, 349.23, 392.00, 440.00, 523.25, 587.33],
    reverb: { seconds: 4.2, decay: 3.2, wet: 0.46 },
    air: 0.038, pluckEvery: [6.0, 11.0], pluckLevel: 0.085, level: 0.80
  },
  amsterdam: {
    name: "amsterdam · canal hush",
    chords: [                                   // Fmaj9 / Dm7 / Bbmaj7 / Csus2
      { bass: 43.65, pad: [174.61, 220.00, 261.63, 329.63, 392.00] },
      { bass: 73.42, pad: [146.83, 174.61, 220.00, 261.63, 293.66] },
      { bass: 58.27, pad: [174.61, 233.08, 293.66, 349.23, 440.00] },
      { bass: 65.41, pad: [196.00, 261.63, 293.66, 392.00, 523.25] }
    ],
    hold: 16.0, cutoff: 780,
    scale: [349.23, 392.00, 440.00, 523.25, 587.33, 698.46],
    reverb: { seconds: 3.6, decay: 2.8, wet: 0.38 },
    air: 0.030, pluckEvery: [7.0, 12.0], pluckLevel: 0.070, level: 0.65
  },
  sydney: {
    name: "sydney · bright major",
    chords: [                                   // Amaj9 / F#m7 / Dmaj7 / E6/9
      { bass: 55.00, pad: [220.00, 277.18, 329.63, 369.99, 415.30] },
      { bass: 46.25, pad: [185.00, 220.00, 277.18, 329.63, 369.99] },
      { bass: 73.42, pad: [220.00, 293.66, 369.99, 440.00, 523.25] },
      { bass: 41.20, pad: [185.00, 277.18, 329.63, 415.30, 493.88] }
    ],
    hold: 12.0, cutoff: 2000,
    scale: [440.00, 493.88, 554.37, 659.25, 739.99, 880.00],
    reverb: { seconds: 2.8, decay: 2.3, wet: 0.33 },
    air: 0.055, pluckEvery: [2.6, 5.8], pluckLevel: 0.100, level: 0.95
  }
};
const MUSIC_FALLBACK = "vancouver";
function musicFor(id){ return MUSIC[id] || MUSIC[MUSIC_FALLBACK]; }
function musicProfile(){ return musicFor(state.city); }
/* a season tint on the pad lowpass: brighter in spring, darker in winter */
const SEASON_CUT = { spring: 1.06, summer: 1.00, autumn: 0.94, winter: 0.88 };
function seasonCut(){ return SEASON_CUT[state.season] || 1; }
function musicChord(){
  const prof = musicProfile();
  const n = prof.chords.length;
  const ix = ((chordIx % n) + n) % n;
  return prof.chords[ix];
}

/* the city's air bed + the weather on top of it (snow lifts it, rain a little) */
function airLevel(){
  const prof = musicProfile();
  return prof.air + state.snowAmt * 0.020 + state.rainAmt * 0.012;
}

/* a short RMS measurement tapped off master with an AnalyserNode */
function audioRms(){
  if(!analyser || !rmsBuf) return 0;
  try{
    analyser.getFloatTimeDomainData(rmsBuf);
    let s = 0;
    for(let i = 0; i < rmsBuf.length; i++){ const v = rmsBuf[i]; s += v * v; }
    return Math.sqrt(s / Math.max(1, rmsBuf.length));
  }catch(e){ return 0; }
}

function audioInit(){
  if(ac) return true;
  const AC = (typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext)) || null;
  if(!AC) return false;
  try { ac = new AC(); } catch(e){ ac = null; return false; }
  const prof = musicProfile();

  master = ac.createGain();
  master.gain.value = 0;

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3;
  comp.attack.value = 0.02; comp.release.value = 0.4;
  comp.connect(master);

  const shelf = ac.createBiquadFilter();
  shelf.type = "highshelf"; shelf.frequency.value = 5200; shelf.gain.value = -2.5;
  shelf.connect(comp);

  // snow takes a little top end off the whole mix, cheaply
  toneFilter = ac.createBiquadFilter();
  toneFilter.type = "lowpass"; toneFilter.frequency.value = 18000; toneFilter.Q.value = 0.4;
  toneFilter.connect(shelf);

  mixBus = ac.createGain();
  mixBus.gain.value = 1;
  mixBus.connect(toneFilter);

  // reverb: a generated stereo impulse, retuned per city
  conv = ac.createConvolver();
  conv.buffer = makeImpulse(prof.reverb.seconds, prof.reverb.decay);
  revGain = ac.createGain();
  revGain.gain.value = prof.reverb.wet;
  conv.connect(revGain); revGain.connect(mixBus);
  revSend = ac.createGain();
  revSend.gain.value = 1;
  revSend.connect(conv);

  // pad: five voices, triangle plus a slightly detuned sine
  padFilter = ac.createBiquadFilter();
  padFilter.type = "lowpass"; padFilter.frequency.value = prof.cutoff; padFilter.Q.value = 0.3;
  padGain = ac.createGain();
  padGain.gain.value = 0.17;
  padFilter.connect(padGain);
  padGain.connect(mixBus);
  const padSend = ac.createGain(); padSend.gain.value = 0.5;
  padGain.connect(padSend); padSend.connect(revSend);

  padVoices = [];
  for(let i = 0; i < 5; i++){
    const a = ac.createOscillator(); a.type = "triangle";
    const b = ac.createOscillator(); b.type = "sine";
    a.frequency.value = b.frequency.value = prof.chords[0].pad[i];
    const g = ac.createGain();
    g.gain.value = 0.05;
    a.connect(g); b.connect(g); g.connect(padFilter);
    a.start(); b.start();
    padVoices.push({ a, b, g });
  }

  // sub bass
  bassOsc = ac.createOscillator();
  bassOsc.type = "sine";
  bassOsc.frequency.value = prof.chords[0].bass;
  const bassGain = ac.createGain();
  bassGain.gain.value = 0.055;
  bassOsc.connect(bassGain); bassGain.connect(mixBus); bassGain.connect(revSend);
  bassOsc.start();

  // air
  const airSrc = ac.createBufferSource(); airSrc.buffer = makeNoise(4); airSrc.loop = true;
  const airF = ac.createBiquadFilter();
  airF.type = "bandpass"; airF.frequency.value = 620; airF.Q.value = 0.6;
  airGain = ac.createGain();
  airGain.gain.value = prof.air;
  airSrc.connect(airF); airF.connect(airGain); airGain.connect(mixBus);
  airSrc.start();
  const airLfo = ac.createOscillator(); airLfo.frequency.value = 0.05;
  const airLfoG = ac.createGain(); airLfoG.gain.value = 220;
  airLfo.connect(airLfoG); airLfoG.connect(airF.frequency); airLfo.start();

  // rain bed
  const rs = ac.createBufferSource(); rs.buffer = makeNoise(4); rs.loop = true;
  const rh = ac.createBiquadFilter(); rh.type = "highpass"; rh.frequency.value = 1200;
  const rl = ac.createBiquadFilter(); rl.type = "lowpass"; rl.frequency.value = 5200;
  rainGain = ac.createGain();
  rainGain.gain.value = 0;
  rs.connect(rh); rh.connect(rl); rl.connect(rainGain); rainGain.connect(mixBus);
  const rainSend = ac.createGain(); rainSend.gain.value = 0.25;
  rainGain.connect(rainSend); rainSend.connect(revSend);
  rs.start();

  // RMS tap off the master mix (after the volume fade, so it reads what is
  // heard).  The analyser is inline in the output path: WebAudio only pulls a
  // branch that reaches the destination, so master -> analyser -> destination.
  analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.2;
  rmsBuf = new Float32Array(analyser.fftSize);
  master.connect(analyser);
  analyser.connect(ac.destination);

  return true;
}

function pluck(freq, when, prof){
  if(!ac) return;
  prof = prof || musicProfile();
  const amp = prof.pluckLevel || 0.10;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(amp, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 3.6);

  const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const o2 = ac.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.005;
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(0.0001, when);
  g2.gain.exponentialRampToValueAtTime(amp * 0.2, when + 0.012);
  g2.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);

  o.connect(g); o2.connect(g2);
  g.connect(mixBus); g2.connect(mixBus);
  g.connect(revSend); g2.connect(revSend);
  o.start(when); o2.start(when);
  o.stop(when + 3.8); o2.stop(when + 1.4);
}

/* glide the five pad voices and the sub to the current profile's current
   chord; also ease the pad cutoff.  Used both by the scheduler and by a city
   change, so a switch is a glide rather than a restart. */
function applyChord(when){
  if(!ac) return;
  const prof = musicProfile();
  const ch = musicChord();
  for(let i = 0; i < padVoices.length; i++){
    const v = padVoices[i];
    const f = ch.pad[i];
    if(!Number.isFinite(f)) continue;
    v.a.frequency.setTargetAtTime(f, when, 2.5);
    v.b.frequency.setTargetAtTime(f * 1.0035, when, 2.5);
  }
  if(bassOsc) bassOsc.frequency.setTargetAtTime(ch.bass, when, 2.4);
  if(padFilter) padFilter.frequency.setTargetAtTime(prof.cutoff * seasonCut(), when, 1.3);
}

/* A city change while sound is on: glide to the new pads/bass, swap the
   reverb tail to the new profile, ease the cutoff/air and the master trim.
   No oscillator is rebuilt and nothing restarts. */
function applyProfile(when){
  if(!ac) return;
  const t = when === undefined ? ac.currentTime : when;
  const prof = musicProfile();
  applyChord(t);
  if(airGain) airGain.gain.setTargetAtTime(airLevel(), t, 1.6);
  if(revGain) revGain.gain.setTargetAtTime(prof.reverb.wet, t, 1.0);
  if(conv){
    try { conv.buffer = makeImpulse(prof.reverb.seconds, prof.reverb.decay); } catch(e){}
  }
  if(master) master.gain.setTargetAtTime(vol * 0.5 * (prof.level || 1), t, 1.1);
}

function scheduler(){
  if(!ac || !soundOn) return;
  const prof = musicProfile();
  const now = ac.currentTime;
  const horizon = now + 2.0;
  if(nextChordAt < horizon){
    const when = Math.max(now, nextChordAt);
    chordIx = (chordIx + 1) % prof.chords.length;
    applyChord(when);
    nextChordAt = when + prof.hold + Math.random() * 1.5;
  }
  if(nextPluckAt < horizon){
    const when = Math.max(now, nextPluckAt);
    const scale = prof.scale;
    pluck(scale[Math.floor(Math.random() * scale.length)], when, prof);
    const gap = prof.pluckEvery || [3.0, 8.0];
    nextPluckAt = when + gap[0] + Math.random() * (gap[1] - gap[0]);
  }
}

function startSound(){
  if(!audioInit()) return false;
  try { ac.resume(); } catch(e){}
  soundOn = true;
  soundWanted = true;
  const prof = musicProfile();
  chordIx = Math.floor(Math.random() * prof.chords.length);
  const t = ac.currentTime;
  applyProfile(t);
  nextChordAt = t + prof.hold;
  nextPluckAt = t + 3 + Math.random() * 4;
  clearInterval(schedTimer);
  schedTimer = setInterval(scheduler, 250);
  return true;
}

function stopSound(){
  soundOn = false;
  soundWanted = false;
  if(!ac) return;
  clearInterval(schedTimer);
  if(master) master.gain.setTargetAtTime(0, ac.currentTime, 0.6);
}

function setSoundOn(on){
  disarmGestureStart();
  if(on){
    if(!startSound()){ soundWanted = false; paintSoundButton(); return false; }
    soundWanted = true;
  } else {
    stopSound();
    soundWanted = false;
  }
  paintSoundButton();
  savePrefs();
  return soundOn;
}

function disarmGestureStart(){
  gestureArmed = false;
  if(gestureHandler && typeof removeEventListener === "function"){
    try { removeEventListener("pointerdown", gestureHandler, true); } catch(e){}
  }
  gestureHandler = null;
}

/* Browsers only allow the audio context to start from a gesture.  If the
   stored preference is "on", arm a one-shot pointerdown listener instead of
   autoplaying; the first click/tap anywhere starts the sound. */
function armGestureStart(){
  if(gestureArmed || soundOn) return false;
  if(typeof addEventListener !== "function") return false;
  gestureArmed = true;
  const onFirst = e => {
    disarmGestureStart();
    resumeClickGuard = !!(sndBtn && e && (e.target === sndBtn ||
      (typeof sndBtn.contains === "function" && sndBtn.contains(e.target))));
    resumeClickAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if(startSound()){
      soundWanted = true;
      paintSoundButton();
      savePrefs();
    } else {
      soundWanted = false;
      resumeClickGuard = false;
      paintSoundButton();
    }
  };
  gestureHandler = onFirst;
  addEventListener("pointerdown", onFirst, true);
  return true;
}

function paintSoundButton(){
  if(!sndBtn) return;
  sndBtn.setAttribute("aria-pressed", String(soundOn || (gestureArmed && soundWanted)));
  sndBtn.textContent = soundOn ? "sound on" : "sound";
  sndBtn.title = soundOn ? "Turn ambient sound off"
    : (gestureArmed && soundWanted) ? "Sound is on · click anywhere to start it"
    : "Turn ambient sound on";
}

/* once per frame (from drawFrame, so every render path keeps it in sync):
   rain follows state.rainAmt, snow lifts the air bed and dulls the top end,
   and the season can tint the pad cutoff a little. */
function updateAudio(){
  if(!ac || !soundOn) return;
  const t = ac.currentTime;
  const prof = musicProfile();
  if(rainGain) rainGain.gain.setTargetAtTime(state.rainAmt * 0.085, t, 0.8);
  if(airGain) airGain.gain.setTargetAtTime(airLevel(), t, 1.0);
  if(toneFilter)
    toneFilter.frequency.setTargetAtTime(lerp(18000, 9000, clamp(state.snowAmt, 0, 1)), t, 1.2);
  if(padFilter){
    // the session's half colours the room slightly: focus dimmer, break brighter
    const phase = session.paused ? 1 : (session.kind === "focus" ? 0.90 : session.kind === "break" ? 1.14 : 1);
    const want = prof.cutoff * seasonCut() * phase;
    if(Math.abs(padFilter.frequency.value - want) > want * 0.03)
      padFilter.frequency.setTargetAtTime(want, t, 1.2);
  }
}
