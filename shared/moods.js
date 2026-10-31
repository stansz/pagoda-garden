"use strict";

/* =========================================================================
   Six more moods for the shared engine: three with music and three ambient
   beds, all synthesized here out of oscillators, filters and generated noise.
   No samples, no audio worklets.

   The music moods read the selected city's MUSIC profile while they schedule
   each note, so a city change lands by itself on the next chord or bell.  The
   ambient moods are rain, waves and night, and play no chords at all.  Each
   mood builds its graph in start(), closes it in stop() and schedules ahead
   through tick(now, horizon), so a mood that is not playing holds no running
   nodes.

   All top-level names start with `mood` or `MOOD` so this file can share the
   pages' global scope.  It registers MOODS.rainpiano, MOODS.drive,
   MOODS.temple, MOODS.rain, MOODS.waves and MOODS.night; shared/audio.js owns
   the clock call, the mix bus and the master level.
   ========================================================================= */

let moodVoices = [];
let moodRun = null;
let moodNoiseBuffer = null;

/* --------------------------------------------------------------- helpers */
function moodRand(a, b){
  return a + Math.random() * (b - a);
}

function moodNoise(){
  if(!moodNoiseBuffer) moodNoiseBuffer = makeNoise(6);
  return moodNoiseBuffer;
}

function moodPan(){
  return (typeof ac.createStereoPanner === "function") ? ac.createStereoPanner() : null;
}

function moodOpen(t, sendLevel, fade){
  const out = ac.createGain();
  out.gain.setValueAtTime(0, t);
  out.connect(mixBus);
  const send = ac.createGain();
  send.gain.value = sendLevel;
  out.connect(send);
  send.connect(revSend);
  const voice = { out, send, sources: [], nodes: [] };
  try {
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + fade);
  } catch(e){}
  moodVoices.push(voice);
  return voice;
}

function moodLoop(voice, t){
  const src = ac.createBufferSource();
  src.buffer = moodNoise();
  src.loop = true;
  const offset = Math.random() * Math.max(0.001, src.buffer.duration - 0.05);
  src.start(t, offset);
  voice.sources.push(src);
  return src;
}

/* Disconnect one voice's graph and forget it.  Safe to call twice: a close
   schedules both an onended handler and a fallback timer for old sources. */
function moodForget(voice){
  if(moodVoices.indexOf(voice) < 0) return;
  for(let i = 0; i < voice.nodes.length; i++){
    try { voice.nodes[i].disconnect(); } catch(e){}
  }
  try { voice.out.disconnect(); } catch(e){}
  try { voice.send.disconnect(); } catch(e){}
  const ix = moodVoices.indexOf(voice);
  if(ix >= 0) moodVoices.splice(ix, 1);
}

function moodClose(voice, t){
  const g = voice.out.gain;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(0, t, 0.3);
  } catch(e){}
  for(let i = 0; i < voice.sources.length; i++){
    try { voice.sources[i].stop(t + 2.5); } catch(e){}
  }
  if(voice.sources.length){
    const first = voice.sources[0];
    try { first.onended = () => moodForget(voice); } catch(e){}
    setTimeout(() => moodForget(voice), 2600);
  } else {
    setTimeout(() => moodForget(voice), 2500);
  }
}

/* Close whatever the previous mood left open, before a new start() builds. */
function moodBegin(voiceT){
  if(moodRun){
    moodClose(moodRun.voice, voiceT);
    moodRun = null;
  }
}

/* ------------------------------------------------------------ rain piano */
function moodPiano(voice, freq, when, vel){
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 2400;
  low.Q.value = 0.5;

  const partials = [
    { mul: 1, rel: 1, decay: 3.5 },
    { mul: 2.001, rel: 0.35, decay: 2 },
    { mul: 3.003, rel: 0.12, decay: 1 }
  ];
  const oscs = [];
  const peak = Math.max(0.0002, vel * 0.11);
  for(let i = 0; i < partials.length; i++){
    const p = partials[i];
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * p.mul;
    const g = ac.createGain();
    const amp = Math.max(0.0002, peak * p.rel);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + p.decay);
    o.connect(g);
    g.connect(low);
    o.start(when);
    o.stop(when + p.decay + 0.05);
    oscs.push(o);
  }

  let out = low;
  const pan = moodPan();
  if(pan){
    pan.pan.value = moodRand(-0.35, 0.35);
    low.connect(pan);
    out = pan;
  }
  out.connect(voice.out);
}

function moodStartRainPiano(t){
  if(!ac) return;
  moodBegin(t);
  const voice = moodOpen(t, 0.5, 1.5);

  const bed = moodLoop(voice, t);
  const high = ac.createBiquadFilter();
  high.type = "highpass"; high.frequency.value = 1200;
  const low = ac.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 5200;
  const gain = ac.createGain(); gain.gain.value = 0.05;
  bed.connect(high); high.connect(low); low.connect(gain); gain.connect(voice.out);
  voice.nodes.push(high, low, gain);

  moodRun = { voice, chord: 0, nextChord: t + 0.2, nextMelody: t + moodRand(2.5, 6) };
}

function moodTickRainPiano(now, horizon){
  if(!moodRun || !ac) return;
  const run = moodRun;
  let guard = 0;
  while(run.nextChord < horizon && guard++ < 64){
    const prof = musicProfile();
    const ch = prof.chords[run.chord % prof.chords.length];
    const when = Math.max(now, run.nextChord);
    moodPiano(run.voice, ch.bass * 2, when, 0.7);
    let at = when + moodRand(0.12, 0.30);
    moodPiano(run.voice, ch.pad[1] * 2, at, moodRand(0.45, 0.6));
    at += moodRand(0.12, 0.30);
    moodPiano(run.voice, ch.pad[2] * 2, at, moodRand(0.45, 0.6));
    at += moodRand(0.12, 0.30);
    moodPiano(run.voice, ch.pad[3] * 2, at, moodRand(0.45, 0.6));
    run.chord++;
    run.nextChord = when + prof.hold * 0.5;
  }
  while(run.nextMelody < horizon && guard++ < 64){
    const prof = musicProfile();
    const ch = prof.chords[run.chord % prof.chords.length];
    const when = Math.max(now, run.nextMelody);
    moodPiano(run.voice, pluckPick(ch, prof), when, moodRand(0.5, 0.8));
    run.nextMelody = when + moodRand(2.5, 6);
  }
}

function moodStopRainPiano(t){
  if(!moodRun) return;
  moodClose(moodRun.voice, t);
  moodRun = null;
}

/* ------------------------------------------------------------ night drive */
const moodDriveBpm = 84;
const moodDriveStep = 60 / moodDriveBpm / 2;

function moodDriveBass(voice, freq, when){
  const oscs = [];
  oscs.push(ac.createOscillator());
  oscs[0].type = "sawtooth";
  oscs[0].frequency.value = freq < 55 ? freq * 2 : freq;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.10, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  for(let i = 0; i < oscs.length; i++){
    oscs[i].connect(filter);
    oscs[i].start(when);
    oscs[i].stop(when + 0.25);
  }
  filter.connect(g);
  g.connect(voice.out);
}

function moodDriveKick(voice, when){
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(100, when);
  o.frequency.exponentialRampToValueAtTime(46, when + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.22, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
  o.connect(g); g.connect(voice.out);
  o.start(when); o.stop(when + 0.24);
}

function moodDriveSnare(voice, when){
  const src = ac.createBufferSource();
  src.buffer = moodNoise();
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1500;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.03, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
  src.connect(band); band.connect(g); g.connect(voice.out);
  src.start(when, Math.random() * 5.5);
  src.stop(when + 0.20);
}

function moodDriveChord(voice, ch, when){
  const bar = moodDriveStep * 8;
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 900;
  low.Q.value = 0.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.018, when + 0.6);
  g.gain.setValueAtTime(0.018, when + bar * 2);
  g.gain.exponentialRampToValueAtTime(0.0001, when + bar * 2 + 0.8);
  low.connect(g); g.connect(voice.out);
  for(let i = 0; i < 5; i++){
    const f = ch.pad[i];
    if(!Number.isFinite(f)) continue;
    const a = ac.createOscillator();
    a.type = "sawtooth";
    a.frequency.value = f;
    const b = ac.createOscillator();
    b.type = "sawtooth";
    b.frequency.value = f * Math.pow(2, 4 / 1200);
    a.connect(low); b.connect(low);
    a.start(when); b.start(when);
    a.stop(when + bar * 2 + 0.85);
    b.stop(when + bar * 2 + 0.85);
  }
}

function moodDriveArp(voice, freq, when){
  const o = ac.createOscillator();
  o.type = "square";
  o.frequency.value = freq;
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 2200;
  low.Q.value = 0.5;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.02, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
  o.connect(low); low.connect(g);
  let out = g;
  const pan = moodPan();
  if(pan){
    pan.pan.value = moodRand(-0.4, 0.4);
    g.connect(pan);
    out = pan;
  }
  out.connect(voice.out);
  o.start(when); o.stop(when + 0.22);
}

function moodStartDrive(t){
  if(!ac) return;
  moodBegin(t);
  const voice = moodOpen(t, 0.35, 1.0);
  moodRun = { voice, step: 0, bar: 0, chord: 0, next: t + 0.2 };
}

function moodTickDrive(now, horizon){
  if(!moodRun || !ac) return;
  const run = moodRun;
  const barDur = moodDriveStep * 8;
  let guard = 0;
  while(run.next < horizon && guard++ < 64){
    const step = run.step, bar = run.bar;
    if(step === 0 && bar > 0 && bar % 2 === 0) run.chord++;
    const prof = musicProfile();
    const ch = prof.chords[run.chord % prof.chords.length];
    const when = Math.max(now, run.next);
    moodDriveBass(run.voice, ch.bass, when);
    if(step === 0 || step === 4) moodDriveKick(run.voice, when);
    if(step === 2 || step === 6) moodDriveSnare(run.voice, when);
    if(step === 0 && bar % 2 === 0) moodDriveChord(run.voice, ch, when);
    if(step % 2 === 1 && bar % 2 === 0)
      moodDriveArp(run.voice, ch.pad[step % 5] * 2, when);
    run.next += moodDriveStep;
    run.step++;
    if(run.step >= 8){
      run.step = 0;
      run.bar++;
    }
  }
}

function moodStopDrive(t){
  if(!moodRun) return;
  moodClose(moodRun.voice, t);
  moodRun = null;
}

/* ---------------------------------------------------------------- temple */
function moodTempleBuildDrone(voice, base, t){
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + 3);
  gain.connect(voice.out);

  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 700;
  low.Q.value = 0.3;
  low.connect(gain);

  const oscs = [];
  const freqs = [base * 2, base * 3];
  for(let i = 0; i < freqs.length; i++){
    for(let k = 0; k < 2; k++){
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = freqs[i] + (k ? 0.6 : 0);
      const amp = ac.createGain();
      amp.gain.value = 0.045;
      o.connect(amp); amp.connect(low);
      o.start(t);
      oscs.push(o);
      voice.sources.push(o);
      voice.nodes.push(amp);
    }
  }
  voice.nodes.push(gain, low);
  return { base, gain, low, oscs };
}

function moodTempleSwap(run, base, now){
  const old = run.drone;
  if(old){
    try {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 4);
    } catch(e){}
    for(let i = 0; i < old.oscs.length; i++){
      try { old.oscs[i].stop(now + 4.05); } catch(e){}
    }
  }
  run.drone = moodTempleBuildDrone(run.voice, base, now);
  run.base = base;
}

function moodBell(voice, freq, when){
  const partials = [
    { mul: 1, rel: 1, decay: 9 },
    { mul: 2.76, rel: 0.5, decay: 5 },
    { mul: 5.4, rel: 0.25, decay: 3 },
    { mul: 8.93, rel: 0.12, decay: 1.5 }
  ];
  let out = null;
  const pan = moodPan();
  if(pan){
    pan.pan.value = moodRand(-0.5, 0.5);
    pan.connect(voice.out);
    out = pan;
  }
  for(let i = 0; i < partials.length; i++){
    const p = partials[i];
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * p.mul;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.07 * p.rel), when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + p.decay);
    o.connect(g);
    if(out) g.connect(out); else g.connect(voice.out);
    o.start(when);
    o.stop(when + p.decay + 0.05);
  }
}

function moodGong(voice, freq, when){
  const partials = [
    { mul: 1, rel: 1 },
    { mul: 1.48, rel: 0.5 },
    { mul: 2.1, rel: 0.25 }
  ];
  for(let i = 0; i < partials.length; i++){
    const p = partials[i];
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * p.mul;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.06 * p.rel), when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 12);
    o.connect(g); g.connect(voice.out);
    o.start(when); o.stop(when + 12.05);
  }
}

function moodStartTemple(t){
  if(!ac) return;
  moodBegin(t);
  const voice = moodOpen(t, 0.7, 3.0);
  const prof = musicProfile();
  const base = prof.chords[0].bass;
  moodRun = {
    voice, base,
    drone: moodTempleBuildDrone(voice, base, t),
    nextBell: t + moodRand(6, 14),
    nextGong: t + moodRand(30, 50)
  };
}

function moodTickTemple(now, horizon){
  if(!moodRun || !ac) return;
  const run = moodRun;
  let prof = musicProfile();
  if(prof.chords[0].bass !== run.base) moodTempleSwap(run, prof.chords[0].bass, now);
  let guard = 0;
  while(run.nextBell < horizon && guard++ < 64){
    prof = musicProfile();
    const when = Math.max(now, run.nextBell);
    moodBell(run.voice, prof.scale[Math.floor(Math.random() * prof.scale.length)], when);
    run.nextBell = when + moodRand(6, 14);
  }
  while(run.nextGong < horizon && guard++ < 64){
    prof = musicProfile();
    const when = Math.max(now, run.nextGong);
    moodGong(run.voice, prof.chords[0].bass * 4, when);
    run.nextGong = when + moodRand(30, 50);
  }
}

function moodStopTemple(t){
  if(!moodRun) return;
  moodClose(moodRun.voice, t);
  moodRun = null;
}

/* ------------------------------------------------------------------ rain */
function moodDrop(voice, when){
  const src = ac.createBufferSource();
  src.buffer = moodNoise();
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = moodRand(1500, 4000);
  band.Q.value = 1.2;
  const g = ac.createGain();
  const peak = moodRand(0.02, 0.06);
  const dur = moodRand(0.003, 0.008);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(band); band.connect(g);
  let out = g;
  const pan = moodPan();
  if(pan){
    pan.pan.value = moodRand(-0.7, 0.7);
    g.connect(pan);
    out = pan;
  }
  out.connect(voice.out);
  src.start(when, Math.random() * 5.5);
  src.stop(when + dur + 0.02);
}

function moodStartRain(t){
  if(!ac) return;
  moodBegin(t);
  const voice = moodOpen(t, 0.25, 2.5);

  const body = moodLoop(voice, t);
  const high = ac.createBiquadFilter();
  high.type = "highpass"; high.frequency.value = 1000;
  const low = ac.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 6000;
  const bodyGain = ac.createGain();
  bodyGain.gain.value = 0.16;
  body.connect(high); high.connect(low); low.connect(bodyGain); bodyGain.connect(voice.out);

  const lfo = ac.createOscillator();
  lfo.type = "sine"; lfo.frequency.value = 0.07;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain); lfoGain.connect(bodyGain.gain);
  lfo.start(t);
  voice.sources.push(lfo);
  voice.nodes.push(high, low, bodyGain, lfoGain);

  const rumble = moodLoop(voice, t);
  const rumbleLow = ac.createBiquadFilter();
  rumbleLow.type = "lowpass"; rumbleLow.frequency.value = 400;
  const rumbleGain = ac.createGain();
  rumbleGain.gain.value = 0.05;
  rumble.connect(rumbleLow); rumbleLow.connect(rumbleGain); rumbleGain.connect(voice.out);
  voice.nodes.push(rumbleLow, rumbleGain);

  moodRun = { voice, nextDrop: t + 0.2 };
}

function moodTickRain(now, horizon){
  if(!moodRun || !ac) return;
  const run = moodRun;
  let guard = 0;
  while(run.nextDrop < horizon && guard++ < 64){
    const when = Math.max(now, run.nextDrop);
    moodDrop(run.voice, when);
    run.nextDrop = when + moodRand(0.15, 0.35);
  }
}

function moodStopRain(t){
  if(!moodRun) return;
  moodClose(moodRun.voice, t);
  moodRun = null;
}

/* ----------------------------------------------------------------- waves */
function moodWave(voice, when){
  const dur = moodRand(7, 11);
  const rise = dur * 0.4;
  const peak = moodRand(0.2, 0.26);

  const src = ac.createBufferSource();
  src.buffer = moodNoise();
  src.loop = true;
  const low = ac.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.setValueAtTime(300, when);
  low.frequency.linearRampToValueAtTime(1800, when + rise);
  low.frequency.linearRampToValueAtTime(250, when + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + rise);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(low); low.connect(g);

  const foamSrc = ac.createBufferSource();
  foamSrc.buffer = moodNoise();
  foamSrc.loop = true;
  const high = ac.createBiquadFilter();
  high.type = "highpass"; high.frequency.value = 2500;
  const foam = ac.createGain();
  foam.gain.setValueAtTime(0.0001, when);
  foam.gain.exponentialRampToValueAtTime(0.05, when + dur * 0.5);
  foam.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  foamSrc.connect(high); high.connect(foam);

  const pan = moodPan();
  let out = g;
  if(pan){
    pan.pan.value = moodRand(-0.4, 0.4);
    g.connect(pan);
    foam.connect(pan);
    out = pan;
  } else {
    foam.connect(voice.out);
  }
  out.connect(voice.out);

  src.onended = () => {
    try { src.disconnect(); } catch(e){}
    try { foamSrc.disconnect(); } catch(e){}
    try { low.disconnect(); } catch(e){}
    try { high.disconnect(); } catch(e){}
    try { g.disconnect(); } catch(e){}
    try { foam.disconnect(); } catch(e){}
    if(pan){ try { pan.disconnect(); } catch(e){} }
  };
  src.start(when, Math.random() * 5.5);
  foamSrc.start(when, Math.random() * 5.5);
  src.stop(when + dur + 0.05);
  foamSrc.stop(when + dur + 0.05);
}

function moodStartWaves(t){
  if(!ac) return;
  moodBegin(t);
  const voice = moodOpen(t, 0.3, 2.5);

  const wash = moodLoop(voice, t);
  const low = ac.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 350;
  const gain = ac.createGain();
  gain.gain.value = 0.05;
  wash.connect(low); low.connect(gain); gain.connect(voice.out);
  voice.nodes.push(low, gain);

  moodRun = { voice, nextWave: t + 0.2 };
}

function moodTickWaves(now, horizon){
  if(!moodRun || !ac) return;
  const run = moodRun;
  let guard = 0;
  while(run.nextWave < horizon && guard++ < 64){
    const when = Math.max(now, run.nextWave);
    moodWave(run.voice, when);
    run.nextWave = when + moodRand(7, 12);
  }
}

function moodStopWaves(t){
  if(!moodRun) return;
  moodClose(moodRun.voice, t);
  moodRun = null;
}

/* ----------------------------------------------------------------- night */
function moodChirp(voice, freq, panValue, when){
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.value = 0.0001;
  for(let i = 0; i < 3; i++){
    const at = when + i * 0.04;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.02, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.018);
  }
  o.connect(g);
  let out = g;
  const pan = moodPan();
  if(pan){
    pan.pan.value = panValue;
    g.connect(pan);
    out = pan;
  }
  out.connect(voice.out);
  o.start(when);
  o.stop(when + 0.13);
}

function moodStartNight(t){
  if(!ac) return;
  moodBegin(t);
  const voice = moodOpen(t, 0.4, 2.5);

  const wind = moodLoop(voice, t);
  const band = ac.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 420; band.Q.value = 0.8;
  const windGain = ac.createGain();
  windGain.gain.value = 0.06;
  wind.connect(band); band.connect(windGain); windGain.connect(voice.out);

  const freqLfo = ac.createOscillator();
  freqLfo.type = "sine"; freqLfo.frequency.value = 0.04;
  const freqDepth = ac.createGain();
  freqDepth.gain.value = 180;
  freqLfo.connect(freqDepth); freqDepth.connect(band.frequency);
  freqLfo.start(t);

  const gainLfo = ac.createOscillator();
  gainLfo.type = "sine"; gainLfo.frequency.value = 0.06;
  const gainDepth = ac.createGain();
  gainDepth.gain.value = 0.025;
  gainLfo.connect(gainDepth); gainDepth.connect(windGain.gain);
  gainLfo.start(t);

  voice.sources.push(freqLfo, gainLfo);
  voice.nodes.push(band, windGain, freqDepth, gainDepth);

  moodRun = { voice, crickets: [
    { freq: 4300, pan: -0.4, left: 6 + Math.floor(Math.random() * 9), next: t + moodRand(0.2, 1.2) },
    { freq: 4700, pan: 0.4, left: 6 + Math.floor(Math.random() * 9), next: t + moodRand(0.2, 1.2) }
  ] };
}

function moodTickNight(now, horizon){
  if(!moodRun || !ac) return;
  const run = moodRun;
  let guard = 0;
  for(let i = 0; i < run.crickets.length; i++){
    const c = run.crickets[i];
    while(c.next < horizon && guard++ < 64){
      const when = Math.max(now, c.next);
      moodChirp(run.voice, c.freq, c.pan, when);
      c.left--;
      if(c.left <= 0){
        c.left = 6 + Math.floor(Math.random() * 9);
        c.next = when + moodRand(2, 5);
      } else {
        c.next = when + moodRand(0.8, 1.1);
      }
    }
  }
}

function moodStopNight(t){
  if(!moodRun) return;
  moodClose(moodRun.voice, t);
  moodRun = null;
}

/* ------------------------------------------------------------- registry */
MOODS.rainpiano = { label: "rain piano", usesPad: false, level: 1.4,
                    start: moodStartRainPiano, stop: moodStopRainPiano, tick: moodTickRainPiano };
MOODS.drive = { label: "night drive", usesPad: false, level: 0.72,
                start: moodStartDrive, stop: moodStopDrive, tick: moodTickDrive };
MOODS.temple = { label: "temple", usesPad: false, level: 0.8,
                 start: moodStartTemple, stop: moodStopTemple, tick: moodTickTemple };
MOODS.rain = { label: "rain", usesPad: false, level: 1.1,
               start: moodStartRain, stop: moodStopRain, tick: moodTickRain };
MOODS.waves = { label: "waves", usesPad: false, level: 1.15,
                start: moodStartWaves, stop: moodStopWaves, tick: moodTickWaves };
MOODS.night = { label: "night", usesPad: false, level: 2.5,
                start: moodStartNight, stop: moodStopNight, tick: moodTickNight };
