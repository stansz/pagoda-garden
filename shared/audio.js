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
