"use strict";

/* =========================================================================
   Lo-fi: the first non-city mood.  A synthesized beat clock (16 steps per bar)
   out of an FM electric piano, kick, snare, hat and bass, through a soft
   saturating chain with a little wow/flutter delay and a generated crackle
   bed.  Everything is synthesized here; no samples and no audio worklets.

   All top-level names start with `lofi` or `LOFI` so this file can share the
   pages' global scope.  It registers itself as MOODS.lofi; shared/audio.js
   owns the clock call, the mix bus and the master level.
   ========================================================================= */
const LOFI = {
  vancouver: { midi: 50, bpm: 78 },
  toronto:   { midi: 48, bpm: 82 },
  hawaii:    { midi: 43, bpm: 84 },
  hongkong:  { midi: 50, bpm: 72, minor: true },
  amsterdam: { midi: 41, bpm: 70 },
  sydney:    { midi: 45, bpm: 80 }
};
const LOFI_FALLBACK = "vancouver";
const LOFI_MAJOR = [
  { root: 2, tones: [3, 7, 10, 14] },
  { root: 7, tones: [4, 10, 14, 21] },
  { root: 0, tones: [4, 7, 11, 14] },
  { root: 9, tones: [3, 7, 10, 14] }
];
const LOFI_MINOR = [
  { root: 0, tones: [3, 7, 10, 14] },
  { root: 5, tones: [3, 7, 10, 14] },
  { root: 8, tones: [4, 7, 11, 14] },
  { root: 7, tones: [5, 7, 10, 14] }
];
const LOFI_PENTA_MAJOR = [0, 2, 4, 7, 9];
const LOFI_PENTA_MINOR = [0, 3, 5, 7, 10];
const LOFI_LEVEL = 0.46;

let lofiBus = null, lofiOut = null;
let lofiShaper = null, lofiLow = null, lofiHigh = null, lofiDelay = null;
let lofiNoise = null, lofiCrackle = null, lofiCrackleGain = null;
let lofiRunning = false;
let lofiStep = 0, lofiBar = 0, lofiBarStart = 0, lofiNextAt = 0;
let lofiBarBpm = 78, lofiBarMidi = 50, lofiBarMinor = false;
let lofiLastMelodyIx = 0;

function lofiHz(midi){ return 440 * Math.pow(2, (midi - 69) / 12); }
function lofiShift(midi, lo, hi){
  while(midi < lo) midi += 12;
  while(midi >= hi) midi -= 12;
  return midi;
}
function lofiClockStep(){ return 60 / lofiBarBpm / 4; }

/* The pure clock: a 16th grid with every odd step laid back by 0.30 of a 16th. */
function lofiStepTime(step, t0, bpm){
  const sixteenth = 60 / bpm / 4;
  return t0 + step * sixteenth + (step % 2 ? 0.30 * sixteenth : 0);
}

function lofiReadKey(){
  const id = audioScene().city;
  const d = LOFI[id] || LOFI[LOFI_FALLBACK];
  lofiBarBpm = d.bpm;
  lofiBarMidi = d.midi;
  lofiBarMinor = !!d.minor;
}

/* one chord of the progression, tones lifted into MIDI [52,72), bass into [36,48) */
function lofiChord(bar){
  const prog = lofiBarMinor ? LOFI_MINOR : LOFI_MAJOR;
  const c = prog[((bar % prog.length) + prog.length) % prog.length];
  const rootMidi = lofiBarMidi + c.root;
  return {
    root: lofiShift(rootMidi, 36, 48),
    fifth: lofiShift(rootMidi + 7, 36, 48),
    tones: c.tones.map(t => lofiShift(rootMidi + t, 52, 72))
  };
}

function lofiMelodyPool(){
  const pcs = lofiBarMinor ? LOFI_PENTA_MINOR : LOFI_PENTA_MAJOR;
  const out = [];
  for(let m = 67; m < 84; m++){
    const pc = ((m - lofiBarMidi) % 12 + 12) % 12;
    if(pcs.indexOf(pc) >= 0) out.push(m);
  }
  return out;
}

function lofiJitter(when){ return when + (Math.random() * 2 - 1) * 0.006; }
function lofiVel(v){ return v * (1 + (Math.random() * 2 - 1) * 0.15); }

function lofiPan(){
  return (typeof ac.createStereoPanner === "function") ? ac.createStereoPanner() : null;
}

/* -------------------------------------------------------------- voices */
function lofiKeys(freq, when, dur, vel, pan){
  const car = ac.createOscillator(); car.type = "sine"; car.frequency.value = freq;
  const mod = ac.createOscillator(); mod.type = "sine"; mod.frequency.value = freq;
  const modGain = ac.createGain();
  modGain.gain.setValueAtTime(freq * 0.6, when);
  modGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
  mod.connect(modGain); modGain.connect(car.frequency);

  const g = ac.createGain();
  const amp = Math.max(0.0002, vel * 0.14);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(amp, when + 0.008);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * 0.30), when + Math.max(0.05, dur));
  car.connect(g);
  let out = g;
  if(Number.isFinite(pan)){
    const p = lofiPan();
    if(p){ p.pan.value = pan; g.connect(p); out = p; }
  }
  out.connect(lofiBus);
  car.start(when); mod.start(when);
  car.stop(when + Math.max(0.05, dur) + 0.05);
  mod.stop(when + Math.max(0.05, dur) + 0.05);
}

function lofiKick(when, vel){
  const o = ac.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(110, when);
  o.frequency.exponentialRampToValueAtTime(48, when + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * 0.04), when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  o.connect(g); g.connect(lofiBus);
  o.start(when); o.stop(when + 0.25);
}

function lofiSnare(when, vel){
  const src = ac.createBufferSource();
  src.buffer = lofiNoise;
  const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.7;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(Math.max(0.0002, vel * 0.12), when);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  src.connect(f); f.connect(ng); ng.connect(lofiBus);
  src.start(when); src.stop(when + 0.16);

  const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = 190;
  const og = ac.createGain();
  og.gain.setValueAtTime(Math.max(0.0002, vel * 0.16), when);
  og.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
  o.connect(og); og.connect(lofiBus);
  o.start(when); o.stop(when + 0.16);
}

function lofiHat(when, vel){
  // joins after the saturator and lowpass, which would dull it
  const src = ac.createBufferSource();
  src.buffer = lofiNoise;
  const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
  const g = ac.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, vel * 0.35), when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  src.connect(f); f.connect(g); g.connect(lofiHigh);
  src.start(when); src.stop(when + 0.06);
}

function lofiBass(freq, when, vel){
  const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const o2 = ac.createOscillator(); o2.type = "triangle"; o2.frequency.value = freq * 2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * 0.12), when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 60 / lofiBarBpm);
  const g2 = ac.createGain(); g2.gain.value = 0.3;
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lofiBus);
  o.start(when); o2.start(when);
  o.stop(when + 60 / lofiBarBpm + 0.05);
  o2.stop(when + 60 / lofiBarBpm + 0.05);
}

/* ------------------------------------------------------------- pattern */
function lofiPlayStep(step, bar, when){
  const sixteenth = lofiClockStep();
  const barDur = sixteenth * 16;
  const ch = lofiChord(bar);

  if(step === 0 || step === 10 || (step === 7 && Math.random() < 0.25))
    lofiKick(lofiJitter(when), lofiVel(1));
  if(step === 4 || step === 12)
    lofiSnare(lofiJitter(when), lofiVel(0.9));
  if(step % 2 === 0){
    const accent = step === 2 || step === 6 || step === 10 || step === 14;
    lofiHat(lofiJitter(when), lofiVel(accent ? 0.7 : 0.5));
  } else if(Math.random() < 0.2){
    lofiHat(lofiJitter(when), lofiVel(0.25));
  }

  if(step === 0){
    for(let i = 0; i < ch.tones.length; i++){
      const pan = ch.tones.length > 1 ? (i / (ch.tones.length - 1)) * 0.8 - 0.4 : 0;
      lofiKeys(lofiHz(ch.tones[i]), lofiJitter(when), Math.max(0.3, barDur - 0.5),
        lofiVel(0.55), pan);
    }
  }
  if(step === (bar % 2 ? 11 : 6) && Math.random() < 0.4){   // the stab moves on odd bars
    for(let i = 0; i < ch.tones.length; i++){
      const pan = ch.tones.length > 1 ? (i / (ch.tones.length - 1)) * 0.8 - 0.4 : 0;
      lofiKeys(lofiHz(ch.tones[i]), lofiJitter(when), 0.4, lofiVel(0.4), pan);
    }
  }
  if(step === 0) lofiBass(lofiHz(ch.root), lofiJitter(when), lofiVel(0.8));
  if(step === 10 && Math.random() < 0.5) lofiBass(lofiHz(ch.fifth), lofiJitter(when), lofiVel(0.7));

  if(bar % 2 === 1 && step % 2 === 0 && Math.random() < 0.18){
    const pool = lofiMelodyPool();
    if(pool.length){
      if(lofiLastMelodyIx >= pool.length) lofiLastMelodyIx = 0;
      let choices = pool.map((_, i) => i).filter(i => Math.abs(i - lofiLastMelodyIx) <= 2);
      if(!choices.length) choices = pool.map((_, i) => i);
      const ix = choices[Math.floor(Math.random() * choices.length)];
      lofiLastMelodyIx = ix;
      lofiKeys(lofiHz(pool[ix]), lofiJitter(when), 0.5, lofiVel(0.5),
        Math.random() * 0.8 - 0.4);
    }
  }
}

/* --------------------------------------------------------------- clock */
function lofiTick(now, horizon){
  if(!lofiRunning || !ac) return;
  if(!lofiNextAt) lofiNextAt = lofiBarStart;
  let guard = 0;
  while(lofiNextAt < horizon && guard++ < 256){
    const step = lofiStep, bar = lofiBar, when = lofiNextAt;
    lofiPlayStep(step, bar, when);
    const sixteenth = lofiClockStep();
    lofiStep++;
    if(lofiStep >= 16){
      lofiStep = 0;
      lofiBar++;
      lofiBarStart += sixteenth * 16;
      lofiNextAt = lofiBarStart;
      lofiReadKey();                  // a city change lands on the next bar
    } else {
      lofiNextAt = lofiStepTime(lofiStep, lofiBarStart, lofiBarBpm);
    }
  }
}

/* --------------------------------------------------------------- chain */
function lofiCrackleBuffer(){
  const len = Math.max(1, Math.floor(ac.sampleRate * 6));
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  const clicks = Math.round(9 * 6);
  for(let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.015;
    for(let c = 0; c < clicks; c++){
      const at = Math.floor(Math.random() * (len - ac.sampleRate * 0.003 - 1));
      const n = Math.max(2, Math.floor(ac.sampleRate * (0.001 + Math.random() * 0.002)));
      const amp = (Math.random() * 2 - 1) * (0.15 + Math.random() * 0.2);
      for(let i = 0; i < n; i++) d[at + i] += amp * (1 - i / n);
    }
  }
  return buf;
}

function lofiBuild(){
  if(lofiBus) return;
  lofiBus = ac.createGain();
  lofiBus.gain.value = 1;

  const shaper = ac.createWaveShaper();
  const points = 1024;
  const curve = new Float32Array(points);
  for(let i = 0; i < points; i++){
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  lofiShaper = shaper;

  lofiLow = ac.createBiquadFilter();
  lofiLow.type = "lowpass"; lofiLow.frequency.value = 3200; lofiLow.Q.value = 0.4;
  lofiHigh = ac.createBiquadFilter();
  lofiHigh.type = "highpass"; lofiHigh.frequency.value = 90;

  lofiDelay = ac.createDelay(1);
  lofiDelay.delayTime.value = 0.012;
  const wow = ac.createOscillator(); wow.frequency.value = 0.6;
  const wowGain = ac.createGain(); wowGain.gain.value = 0.0012;
  wow.connect(wowGain); wowGain.connect(lofiDelay.delayTime); wow.start();
  const flutter = ac.createOscillator(); flutter.frequency.value = 0.13;
  const flutterGain = ac.createGain(); flutterGain.gain.value = 0.0022;
  flutter.connect(flutterGain); flutterGain.connect(lofiDelay.delayTime); flutter.start();

  lofiOut = ac.createGain();
  lofiOut.gain.value = 0;

  lofiBus.connect(shaper);
  shaper.connect(lofiLow);
  lofiLow.connect(lofiHigh);
  lofiHigh.connect(lofiDelay);
  lofiDelay.connect(lofiOut);
  lofiOut.connect(mixBus);
  const send = ac.createGain(); send.gain.value = 0.18;
  lofiOut.connect(send); send.connect(revSend);

  lofiNoise = makeNoise(2);
  lofiCrackle = ac.createBufferSource();
  lofiCrackle.buffer = lofiCrackleBuffer();
  lofiCrackle.loop = true;
  lofiCrackleGain = ac.createGain();
  lofiCrackleGain.gain.value = 0.02;
  lofiCrackle.connect(lofiCrackleGain);
  lofiCrackleGain.connect(lofiOut);
  lofiCrackle.start();
}

/* ------------------------------------------------------------- lifecycle */
function lofiStart(t){
  if(!ac) return;
  lofiBuild();
  const g = lofiOut.gain;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1, t + 1.5);
  } catch(e){}
  lofiStep = 0;
  lofiBar = 0;
  lofiBarStart = t + 0.2;
  lofiNextAt = lofiBarStart;
  lofiLastMelodyIx = 0;
  lofiReadKey();
  lofiRunning = true;
}

function lofiStop(t){
  lofiRunning = false;
  if(!lofiOut) return;
  const g = lofiOut.gain;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(0, t, 0.3);
  } catch(e){}
}

MOODS.lofi = { label: "lo-fi", usesPad: false, level: LOFI_LEVEL,
               start: lofiStart, stop: lofiStop, tick: lofiTick };
