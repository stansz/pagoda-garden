"use strict";

function makeImpulse(seconds, decay){
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for(let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    let lp = 0;
    for(let i = 0; i < len; i++){
      const t = i / len;
      const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      lp = lp * 0.72 + n * 0.28;            // darkened tail
      d[i] = lp;
    }
  }
  return buf;
}

function makeNoise(seconds){
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for(let i = 0; i < len; i++){
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.19;
  }
  return buf;
}

/* =========================================================================
   The shared sound engine for both pages.

   A washed five-voice pad and a sub bass that crossfade from chord to chord,
   sparse "music box" plucks through a convolution reverb generated in the page,
   an air bed and a rain bed, all under a compressor and a soft high shelf on
   the master.  The per-city MUSIC table (also the garden's music) supplies
   chords, hold time, pad cutoff, pluck scale/tempo, reverb and air level.
   A MOODS table lets a mood take over the mix; the city mood keeps the pad.
   Each page only tells the engine what its scene is, through audioScene(),
   which returns { city, season, rain, snow, phase }.  Nothing runs until a
   real user gesture.
   ========================================================================= */
let ac = null, master = null, mixBus = null, revSend = null, revGain = null;
let convs = [], convGains = [], revActive = 0, revSeconds = 0, revDecay = 0;
let rainGain = null, airGain = null, padGain = null, padFilter = null, toneFilter = null;
let analyser = null, rmsBuf = null, peak = 0;
let soundOn = false, vol = 0.18, soundWanted = false;
let chordIx = -1, nextChordAt = 0, nextPluckAt = 0, schedTimer = 0;
let gestureArmed = false, gestureHandler = null, resumeClickGuard = false, resumeClickAt = 0;
let sndBtn = null, volInput = null, moodSel = null;
let suspendTimer = 0, lastAudioUpdate = -1;
let padLfoOdd = null, padLfoEven = null;
let padLayers = [], lastPluckIx = 0;
let bgAudio = null, bgDest = null;
const CHORD_FADE = 4;
const PAD_PANS = [-0.5, 0.25, -0.15, 0.5, -0.3];

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
function musicProfile(){ return musicFor(audioScene().city); }
/* a season tint on the pad lowpass: brighter in spring, darker in winter */
const SEASON_CUT = { spring: 1.06, summer: 1.00, autumn: 0.94, winter: 0.88 };
function seasonCut(){ return SEASON_CUT[audioScene().season] || 1; }
function musicChord(){
  const prof = musicProfile();
  const n = prof.chords.length;
  const ix = ((chordIx % n) + n) % n;
  return prof.chords[ix];
}

/* ---------------------------------------------------------------- moods */
let moodId = "city";
const MOODS = { city: { label: "city", usesPad: true } };

/* the mood's master trim, or the city profile's when the mood has none */
function masterLevel(){
  const mood = MOODS[moodId];
  const trim = mood && Number.isFinite(mood.level) ? mood.level
    : (musicProfile().level || 1);
  return Math.pow(vol, 1.5) * 2.2 * trim;
}

/* the city's air bed + the weather on top of it (snow lifts it, rain a little) */
function airLevel(){
  const scene = audioScene();
  const prof = musicProfile();
  return prof.air + scene.snow * 0.020 + scene.rain * 0.012;
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
/* the largest absolute sample in that same analyser buffer */
function audioPeak(){
  if(!analyser || !rmsBuf) return 0;
  try{
    analyser.getFloatTimeDomainData(rmsBuf);
    let p = 0;
    for(let i = 0; i < rmsBuf.length; i++) p = Math.max(p, Math.abs(rmsBuf[i]));
    peak = p;
    return p;
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

  // reverb: two generated stereo impulses, crossfaded when the profile changes
  revGain = ac.createGain();
  revGain.gain.value = prof.reverb.wet;
  revGain.connect(mixBus);
  revSend = ac.createGain();
  revSend.gain.value = 1;
  convs = []; convGains = [];
  for(let i = 0; i < 2; i++){
    const c = ac.createConvolver();
    c.buffer = makeImpulse(prof.reverb.seconds, prof.reverb.decay);
    const g = ac.createGain();
    g.gain.value = i === 0 ? 1 : 0;
    revSend.connect(c); c.connect(g); g.connect(revGain);
    convs.push(c); convGains.push(g);
  }
  revActive = 0;
  revSeconds = prof.reverb.seconds;
  revDecay = prof.reverb.decay;

  // pad bus: chord layers feed the lowpass, then the mix and the reverb
  padFilter = ac.createBiquadFilter();
  padFilter.type = "lowpass"; padFilter.frequency.value = prof.cutoff; padFilter.Q.value = 0.3;
  padGain = ac.createGain();
  padGain.gain.value = 0.17;
  padFilter.connect(padGain);
  padGain.connect(mixBus);
  const padSend = ac.createGain(); padSend.gain.value = 0.5;
  padGain.connect(padSend); padSend.connect(revSend);

  // two permanent slow LFOs breathe the voices, a third drifts the cutoff
  padLfoOdd = ac.createGain(); padLfoOdd.gain.value = 0.012;
  padLfoEven = ac.createGain(); padLfoEven.gain.value = 0.012;
  const lfoOdd = ac.createOscillator(); lfoOdd.frequency.value = 0.07;
  const lfoEven = ac.createOscillator(); lfoEven.frequency.value = 0.11;
  lfoOdd.connect(padLfoOdd); lfoEven.connect(padLfoEven);
  lfoOdd.start(); lfoEven.start();
  const lfoFilter = ac.createOscillator(); lfoFilter.frequency.value = 0.03;
  const filterAmt = ac.createGain(); filterAmt.gain.value = 120;
  lfoFilter.connect(filterAmt); filterAmt.connect(padFilter.detune);
  lfoFilter.start();

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

  ac.onstatechange = () => {
    if(soundOn && ac && ac.state !== "running"){ try { ac.resume(); } catch(e){} }
  };
  if(typeof document !== "undefined" && typeof document.addEventListener === "function")
    document.addEventListener("visibilitychange", () => {
      if(soundOn && ac && ac.state !== "running" && document.visibilityState === "visible"){
        try { ac.resume(); } catch(e){}
      }
    });

  return true;
}

/* Android freezes a page's WebAudio when the browser is minimized unless a real
   media element is playing, so there the mix goes out through an <audio> element.
   Call from a gesture; if play() is refused the mix stays on ac.destination. */
function audioBackground(){
  if(!ac || typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return;
  if(!bgAudio){
    try {
      bgDest = ac.createMediaStreamDestination();
      analyser.connect(bgDest);
      bgAudio = new Audio();
      bgAudio.srcObject = bgDest.stream;
    } catch(e){ bgAudio = null; return; }
    if("mediaSession" in navigator){
      try {
        if(typeof MediaMetadata === "function")
          navigator.mediaSession.metadata = new MediaMetadata({ title: "Pagoda garden" });
        navigator.mediaSession.setActionHandler("play", () => setSoundOn(true));
        navigator.mediaSession.setActionHandler("pause", () => setSoundOn(false));
      } catch(e){}
    }
  }
  const played = bgAudio.play();
  if(played) played.then(() => {
    try { analyser.disconnect(ac.destination); } catch(e){}
    if("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  }, () => {
    try { analyser.connect(ac.destination); } catch(e){}
  });
}

/* ------------------------------------------------------------------ plucks */
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

  let out = null;
  if(typeof ac.createStereoPanner === "function"){
    out = ac.createStereoPanner();
    out.pan.value = Math.random() * 1.2 - 0.6;
    g.connect(out); g2.connect(out);
    out.connect(mixBus); out.connect(revSend);
  }
  o.connect(g); o2.connect(g2);
  if(!out){ g.connect(mixBus); g2.connect(mixBus); g.connect(revSend); g2.connect(revSend); }
  o.start(when); o2.start(when);
  o.stop(when + 3.8); o2.stop(when + 1.4);
}

/* pitch class in cents, 0..1200 */
function pitchCents(f){
  const x = Math.log2(f / 440) * 1200;
  return ((x % 1200) + 1200) % 1200;
}
/* the scale index pool whose pitch class is within 30 cents of a chord tone */
function chordScaleIndices(scale, ch){
  const cps = ch.pad.map(pitchCents);
  const out = [];
  for(let i = 0; i < scale.length; i++){
    const p = pitchCents(scale[i]);
    for(let k = 0; k < cps.length; k++){
      let d = Math.abs(p - cps[k]);
      d = Math.min(d, 1200 - d);
      if(d <= 30){ out.push(i); break; }
    }
  }
  return out;
}
/* pick a pluck frequency that follows the current chord, and remember where
   in the sorted scale it landed so the next pick can stay nearby */
function pluckPick(ch, prof){
  const scale = prof.scale.slice().sort((a, b) => a - b);
  if(!scale.length) return 440;
  const chordIxPool = chordScaleIndices(scale, ch);
  let pool = (Math.random() < 0.7 && chordIxPool.length) ? chordIxPool
    : scale.map((_, i) => i);
  if(lastPluckIx >= scale.length) lastPluckIx = 0;
  const near = pool.filter(i => Math.abs(i - lastPluckIx) <= 2);
  if(near.length) pool = near;
  const ix = pool[Math.floor(Math.random() * pool.length)];
  lastPluckIx = ix;
  return scale[ix];
}

/* ------------------------------------------------------------ chord layers */
function padLayerLevel(layer, t){
  if(layer.fadeOutAt !== null && t > layer.fadeOutAt){
    const p = clamp((t - layer.fadeOutAt) / CHORD_FADE, 0, 1);
    return layer.fadeOutLevel * Math.cos(p * Math.PI * 0.5);
  }
  const p = clamp((t - layer.startAt) / CHORD_FADE, 0, 1);
  return Math.sin(p * Math.PI * 0.5);
}
function curve(points, fn){
  const c = new Float32Array(points);
  for(let i = 0; i < points; i++) c[i] = fn(i / (points - 1));
  return c;
}
function retirePadLayer(layer, when){
  if(layer.retired) return;
  layer.retired = true;
  const stopAt = when + CHORD_FADE + 0.1;
  for(let i = 0; i < layer.oscs.length; i++){
    try { layer.oscs[i].stop(stopAt); } catch(e){}
  }
  const first = layer.oscs[0];
  if(first) first.onended = () => {
    const ix = padLayers.indexOf(layer);
    if(ix >= 0) padLayers.splice(ix, 1);
    for(let i = 0; i < layer.voices.length; i++){
      const v = layer.voices[i];
      try { v.lfo.disconnect(v.g.gain); } catch(e){}
    }
    for(let i = 0; i < layer.nodes.length; i++){
      try { layer.nodes[i].disconnect(); } catch(e){}
    }
  };
}
function fadePadLayers(when){
  for(let i = 0; i < padLayers.length; i++) retireLayerFade(padLayers[i], when);
}

/* Build one crossfading layer for the current chord and fade every older
   layer out underneath it.  No oscillator frequency is ever automated. */
function applyChord(when){
  if(!ac || !soundOn) return;
  when = when === undefined ? ac.currentTime : when;
  const prof = musicProfile();
  const ch = musicChord();
  const layer = { gain: null, voices: [], oscs: [], nodes: [], startAt: when, fadeOutAt: null,
                  fadeOutLevel: 1, retired: false };
  const layerGain = ac.createGain();
  layerGain.gain.value = 0;
  layerGain.connect(padFilter);
  layer.gain = layerGain;
  layer.nodes.push(layerGain);

  for(let i = 0; i < 5; i++){
    const f = ch.pad[i];
    if(!Number.isFinite(f)) continue;
    const a = ac.createOscillator(); a.type = "triangle"; a.frequency.value = f;
    const b = ac.createOscillator(); b.type = "sine"; b.frequency.value = f * 1.0035;
    const vg = ac.createGain(); vg.gain.value = 0.05;
    a.connect(vg); b.connect(vg);
    const lfo = i % 2 ? padLfoOdd : padLfoEven;
    lfo.connect(vg.gain);
    let out = vg;
    if(typeof ac.createStereoPanner === "function"){
      out = ac.createStereoPanner();
      out.pan.value = PAD_PANS[i] || 0;
      vg.connect(out);
      layer.nodes.push(out);
    }
    out.connect(layerGain);
    a.start(when); b.start(when);
    layer.oscs.push(a, b);
    layer.nodes.push(a, b, vg);
    layer.voices.push({ a, b, g: vg, lfo, freq: f });
  }

  // bass: a sine plus the octave as a triangle, on its own fading layer
  const bassGain = ac.createGain();
  bassGain.gain.value = 0;
  bassGain.connect(mixBus); bassGain.connect(revSend);
  const bs = ac.createOscillator(); bs.type = "sine"; bs.frequency.value = ch.bass;
  const bt = ac.createOscillator(); bt.type = "triangle"; bt.frequency.value = ch.bass * 2;
  const bg1 = ac.createGain(); bg1.gain.value = 0.055;
  const bg2 = ac.createGain(); bg2.gain.value = 0.022;
  bs.connect(bg1); bg1.connect(bassGain);
  bt.connect(bg2); bg2.connect(bassGain);
  bs.start(when); bt.start(when);
  layer.bass = { gain: bassGain, oscs: [bs, bt] };
  layer.oscs.push(bs, bt);
  layer.nodes.push(bassGain, bg1, bg2);

  // equal-power fade in the new layer
  layerGain.gain.setValueCurveAtTime(curve(32, p => Math.sin(p * Math.PI * 0.5)), when, CHORD_FADE);
  bassGain.gain.setValueCurveAtTime(curve(32, p => Math.sin(p * Math.PI * 0.5)), when, CHORD_FADE);

  // fade every older layer out over the same window
  for(let i = 0; i < padLayers.length; i++) retireLayerFade(padLayers[i], when);

  padLayers.push(layer);
  if(padFilter) padFilter.frequency.setTargetAtTime(prof.cutoff * seasonCut(), when, 1.3);
}

/* fade one already-running layer out and remember its end */
function retireLayerFade(layer, when){
  if(layer.retired) return;
  const at = Math.max(when, ac.currentTime);
  const cur = Math.max(0.0001, padLayerLevel(layer, at));
  layer.fadeOutAt = when;
  layer.fadeOutLevel = cur;
  const g = layer.gain.gain;
  try {
    g.cancelScheduledValues(when);
    g.setValueAtTime(cur, when);
    g.setValueCurveAtTime(curve(32, p => cur * Math.cos(p * Math.PI * 0.5)), when + 0.001, CHORD_FADE);
  } catch(e){}
  if(layer.bass){
    const bg = layer.bass.gain.gain;
    try {
      bg.cancelScheduledValues(when);
      bg.setValueAtTime(cur, when);
      bg.setValueCurveAtTime(curve(32, p => cur * Math.cos(p * Math.PI * 0.5)), when + 0.001, CHORD_FADE);
    } catch(e){}
  }
  retirePadLayer(layer, when);
}

/* A city change (or a new mood) while sound is on: crossfade to the new pads,
   swap the reverb tail, ease the cutoff/air and the master trim. */
function applyProfile(when){
  if(!ac) return;
  const t = when === undefined ? ac.currentTime : when;
  const prof = musicProfile();
  if(MOODS[moodId].usesPad) applyChord(t);
  if(airGain) airGain.gain.setTargetAtTime(airLevel(), t, 1.6);
  if(revGain) revGain.gain.setTargetAtTime(prof.reverb.wet, t, 1.0);
  if(convs.length === 2 && (prof.reverb.seconds !== revSeconds || prof.reverb.decay !== revDecay)){
    const next = 1 - revActive;
    try { convs[next].buffer = makeImpulse(prof.reverb.seconds, prof.reverb.decay); } catch(e){}
    const oldG = convGains[revActive], newG = convGains[next];
    try {
      oldG.gain.cancelScheduledValues(t);
      oldG.gain.setValueAtTime(oldG.gain.value, t);
      oldG.gain.linearRampToValueAtTime(0, t + 1.5);
      newG.gain.cancelScheduledValues(t);
      newG.gain.setValueAtTime(newG.gain.value, t);
      newG.gain.linearRampToValueAtTime(1, t + 1.5);
    } catch(e){}
    revActive = next;
    revSeconds = prof.reverb.seconds;
    revDecay = prof.reverb.decay;
  }
  if(master) master.gain.setTargetAtTime(masterLevel(), t, 1.1);
}

/* ------------------------------------------------------------- scheduler */
function scheduler(){
  if(!ac || !soundOn) return;
  const prof = musicProfile();
  const now = ac.currentTime;
  const horizon = now + 2.0;
  const mood = MOODS[moodId];
  if(mood.usesPad){
    if(nextChordAt < horizon){
      const when = Math.max(now, nextChordAt);
      const n = prof.chords.length;
      if(n > 1 && Math.random() >= 0.75){
        let r = chordIx;
        while(r === chordIx) r = Math.floor(Math.random() * n);
        chordIx = r;
      } else {
        chordIx = (chordIx + 1) % n;
      }
      applyChord(when);
      nextChordAt = when + prof.hold + Math.random() * 1.5;
    }
    if(nextPluckAt < horizon){
      const when = Math.max(now, nextPluckAt);
      pluck(pluckPick(musicChord(), prof), when, prof);
      const gap = prof.pluckEvery || [3.0, 8.0];
      nextPluckAt = when + gap[0] + Math.random() * (gap[1] - gap[0]);
    }
  }
  if(typeof mood.tick === "function") mood.tick(now, horizon);
  updateAudio();
}

function startSound(){
  if(!audioInit()) return false;
  clearTimeout(suspendTimer); suspendTimer = 0;
  try { ac.resume(); } catch(e){}
  soundOn = true;
  soundWanted = true;
  audioBackground();
  const prof = musicProfile();
  const mood = MOODS[moodId];
  chordIx = Math.floor(Math.random() * prof.chords.length);
  lastPluckIx = 0;
  const t = ac.currentTime;
  if(typeof mood.start === "function") mood.start(t);
  if(mood.usesPad) applyProfile(t); else { fadePadLayers(t); applyProfile(t); }
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
  if(bgAudio){
    bgAudio.pause();
    if("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  }
  if(typeof MOODS[moodId].stop === "function") MOODS[moodId].stop(ac.currentTime);
  if(master) master.gain.setTargetAtTime(0, ac.currentTime, 0.6);
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    if(!soundOn && ac){ try { ac.suspend(); } catch(e){} }
  }, 2000);
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

function setMood(id){
  if(!MOODS[id] || id === moodId) return moodId;
  if(soundOn && ac){
    const t = ac.currentTime;
    const oldMood = MOODS[moodId], newMood = MOODS[id];
    if(typeof oldMood.stop === "function") oldMood.stop(t);
    if(typeof newMood.start === "function") newMood.start(t);
    moodId = id;
    if(newMood.usesPad){
      const prof = musicProfile();
      nextChordAt = t + prof.hold;
      nextPluckAt = t + 3;
      applyChord(t);
    } else {
      fadePadLayers(t);
    }
    if(master) master.gain.setTargetAtTime(masterLevel(), t, 0.3);
  } else {
    moodId = id;
  }
  if(moodSel) moodSel.value = moodId;
  savePrefs();
  return moodId;
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

/* Bind the shared controls: the sound toggle, the volume slider and the mood
   picker.  The pages call this after their own preferences are loaded. */
function audioBindUi(){
  sndBtn = document.getElementById("snd");
  volInput = document.getElementById("vol");
  moodSel = document.getElementById("mood");

  if(moodSel){
    while(moodSel.firstChild) moodSel.removeChild(moodSel.firstChild);
    for(const id in MOODS){
      if(!Object.prototype.hasOwnProperty.call(MOODS, id)) continue;
      const o = document.createElement("option");
      o.value = id;
      o.textContent = MOODS[id].label;
      moodSel.appendChild(o);
    }
    moodSel.value = moodId;
  }
  if(volInput) volInput.value = String(vol);

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
    if(ac && soundOn) master.gain.setTargetAtTime(masterLevel(), ac.currentTime, 0.2);
    savePrefsSoon();
  });
  if(moodSel) moodSel.addEventListener("change", () => setMood(moodSel.value));

  paintSoundButton();
  if(soundWanted) armGestureStart();
}

/* called from the scheduler, and directly by the city page's inspection hook;
   rain and air follow the scene even while the tab is hidden */
function updateAudio(force){
  if(!ac || !soundOn) return;
  const t = ac.currentTime;
  if(!force && lastAudioUpdate >= 0 && t - lastAudioUpdate < 0.25) return;
  lastAudioUpdate = t;
  const scene = audioScene();
  const prof = musicProfile();
  if(rainGain) rainGain.gain.setTargetAtTime(scene.rain * 0.085, t, 0.8);
  if(airGain) airGain.gain.setTargetAtTime(airLevel(), t, 1.0);
  if(toneFilter)
    toneFilter.frequency.setTargetAtTime(lerp(18000, 9000, clamp(scene.snow, 0, 1)), t, 1.2);
  if(padFilter){
    // the session's half colours the room slightly: focus dimmer, break brighter
    const phase = scene.phase === "focus" ? 0.90 : scene.phase === "break" ? 1.14 : 1;
    const want = prof.cutoff * seasonCut() * phase;
    if(Math.abs(padFilter.frequency.value - want) > want * 0.03)
      padFilter.frequency.setTargetAtTime(want, t, 1.2);
  }
}
