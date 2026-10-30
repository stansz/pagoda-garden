"use strict";

/* ------------------------------------------------------------------- audio */
// A small ambient engine: washed pad, sub bass, sparse "music box" plucks through a
// real convolution reverb, plus air and a rain bed. Everything runs under a compressor
// and a soft high shelf, and the default level is deliberately low so it can play all day.
let ac = null, master = null, mix = null, send = null;
let rainGain = null, airGain = null, padGain = null, bassOsc = null;
let padVoices = [], soundOn = false, vol = 0.18;
let chordIx = -1, nextChordAt = 0, nextPluckAt = 0, schedTimer = 0;

const PROG = [
  { bass: 73.42, pad: [146.83, 185.00, 220.00, 277.18, 329.63] },   // Dmaj9
  { bass: 61.74, pad: [146.83, 185.00, 246.94, 293.66, 329.63] },   // Bm7
  { bass: 49.00, pad: [146.83, 196.00, 246.94, 293.66, 392.00] },   // Gmaj7
  { bass: 55.00, pad: [164.81, 220.00, 246.94, 329.63, 392.00] }    // Aadd9
];
const SCALE = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99];

function audioInit(){
  if(ac) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return false;
  ac = new AC();

  master = ac.createGain();
  master.gain.value = 0;
  master.connect(ac.destination);

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3;
  comp.attack.value = 0.02; comp.release.value = 0.4;
  comp.connect(master);

  const shelf = ac.createBiquadFilter();
  shelf.type = "highshelf"; shelf.frequency.value = 5200; shelf.gain.value = -2.5;
  shelf.connect(comp);

  mix = ac.createGain();
  mix.gain.value = 1;
  mix.connect(shelf);

  const conv = ac.createConvolver();
  conv.buffer = makeImpulse(3.0, 2.6);
  const revGain = ac.createGain();
  revGain.gain.value = 0.36;
  conv.connect(revGain); revGain.connect(mix);
  send = ac.createGain();
  send.gain.value = 1;
  send.connect(conv);

  // pad: five voices, triangle plus a slightly detuned sine
  const padFilter = ac.createBiquadFilter();
  padFilter.type = "lowpass"; padFilter.frequency.value = 1500; padFilter.Q.value = 0.3;
  padGain = ac.createGain();
  padGain.gain.value = 0.17;
  padFilter.connect(padGain);
  padGain.connect(mix);
  const padSend = ac.createGain(); padSend.gain.value = 0.5;
  padGain.connect(padSend); padSend.connect(send);

  padVoices = [];
  for(let i = 0; i < 5; i++){
    const a = ac.createOscillator(); a.type = "triangle";
    const b = ac.createOscillator(); b.type = "sine";
    a.frequency.value = b.frequency.value = PROG[0].pad[i];
    const g = ac.createGain();
    g.gain.value = 0.05;
    a.connect(g); b.connect(g); g.connect(padFilter);
    a.start(); b.start();
    padVoices.push({ a, b, g });
  }

  // sub bass
  bassOsc = ac.createOscillator();
  bassOsc.type = "sine";
  bassOsc.frequency.value = PROG[0].bass;
  const bassGain = ac.createGain();
  bassGain.gain.value = 0.055;
  bassOsc.connect(bassGain); bassGain.connect(mix); bassGain.connect(send);
  bassOsc.start();

  // air
  const airSrc = ac.createBufferSource(); airSrc.buffer = makeNoise(4); airSrc.loop = true;
  const airF = ac.createBiquadFilter();
  airF.type = "bandpass"; airF.frequency.value = 620; airF.Q.value = 0.6;
  airGain = ac.createGain();
  airGain.gain.value = 0.04;
  airSrc.connect(airF); airF.connect(airGain); airGain.connect(mix);
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
  rs.connect(rh); rh.connect(rl); rl.connect(rainGain); rainGain.connect(mix);
  const rainSend = ac.createGain(); rainSend.gain.value = 0.25;
  rainGain.connect(rainSend); rainSend.connect(send);
  rs.start();

  return true;
}

function pluck(freq, when){
  if(!ac) return;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.10, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 3.6);

  const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const o2 = ac.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.005;
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(0.0001, when);
  g2.gain.exponentialRampToValueAtTime(0.02, when + 0.012);
  g2.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);

  o.connect(g); o2.connect(g2);
  g.connect(mix); g2.connect(mix);
  g.connect(send); g2.connect(send);
  o.start(when); o2.start(when);
  o.stop(when + 3.8); o2.stop(when + 1.4);
}

function applyChord(when){
  const ch = PROG[chordIx];
  for(let i = 0; i < padVoices.length; i++){
    const v = padVoices[i];
    const f = ch.pad[i];
    v.a.frequency.setTargetAtTime(f, when, 2.6);
    v.b.frequency.setTargetAtTime(f * 1.0035, when, 2.6);
  }
  bassOsc.frequency.setTargetAtTime(ch.bass, when, 2.4);
}

function scheduler(){
  if(!ac || !soundOn) return;
  const now = ac.currentTime;
  const horizon = now + 2.0;
  if(nextChordAt < horizon){
    const when = Math.max(now, nextChordAt);
    chordIx = (chordIx + 1) % PROG.length;
    applyChord(when);
    nextChordAt = when + 11 + Math.random() * 3;
  }
  if(nextPluckAt < horizon){
    const when = Math.max(now, nextPluckAt);
    pluck(SCALE[Math.floor(Math.random() * SCALE.length)], when);
    nextPluckAt = when + 2.8 + Math.random() * 5.5;
  }
}

function startSound(){
  if(!audioInit()) return;
  ac.resume();
  soundOn = true;
  chordIx = Math.floor(Math.random() * PROG.length);
  const t = ac.currentTime;
  applyChord(t);
  nextChordAt = t + 11;
  nextPluckAt = t + 4 + Math.random() * 4;
  clearInterval(schedTimer);
  schedTimer = setInterval(scheduler, 250);
  master.gain.setTargetAtTime(vol * 0.5, t, 0.9);
}

function stopSound(){
  soundOn = false;
  if(!ac) return;
  clearInterval(schedTimer);
  master.gain.setTargetAtTime(0, ac.currentTime, 0.6);
}

function updateAudio(){
  if(!ac) return;
  const t = ac.currentTime;
  rainGain.gain.setTargetAtTime(rainAmt * 0.08, t, 0.8);
  airGain.gain.setTargetAtTime(0.035 + snowAmt * 0.025 + rainAmt * 0.015, t, 1.0);
}

