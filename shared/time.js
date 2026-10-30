"use strict";

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const pad2 = n => String(n).padStart(2, "0");

/* ------------------------------------------------------------ mood table */
// copied verbatim from relax.html: keyframes are sky top/bottom, a multiply
// tint, and a night amount.  h in 0..24.
const MOOD = [
  { h: 0.0,  top: [7, 11, 24],    bot: [17, 27, 45],    tint: [28, 40, 84],   ta: 0.76, night: 1.00 },
  { h: 4.6,  top: [24, 30, 54],   bot: [64, 52, 80],    tint: [64, 56, 104],  ta: 0.62, night: 0.85 },
  { h: 6.4,  top: [152, 172, 206],bot: [244, 208, 182], tint: [255, 190, 150],ta: 0.20, night: 0.18 },
  { h: 9.0,  top: [178, 210, 232],bot: [238, 244, 246], tint: [255, 250, 240],ta: 0.05, night: 0.00 },
  { h: 13.0, top: [188, 220, 240],bot: [240, 246, 244], tint: [255, 255, 255],ta: 0.00, night: 0.00 },
  { h: 16.8, top: [200, 214, 236],bot: [251, 236, 212], tint: [255, 226, 186],ta: 0.12, night: 0.00 },
  { h: 18.6, top: [112, 100, 138],bot: [240, 164, 122], tint: [255, 152, 104],ta: 0.34, night: 0.24 },
  { h: 20.4, top: [22, 32, 54],   bot: [34, 46, 70],    tint: [36, 50, 100],  ta: 0.72, night: 0.90 },
  { h: 24.0, top: [7, 11, 24],    bot: [17, 27, 45],    tint: [28, 40, 84],   ta: 0.76, night: 1.00 }
];

function moodAt(h){
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while(i < MOOD.length - 2 && h > MOOD[i + 1].h) i++;
  const a = MOOD[i], b = MOOD[i + 1];
  const t = (h - a.h) / Math.max(1e-6, b.h - a.h);
  const mix = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  return {
    top: mix(a.top, b.top), bot: mix(a.bot, b.bot), tint: mix(a.tint, b.tint),
    ta: lerp(a.ta, b.ta, t), night: lerp(a.night, b.night, t)
  };
}

function ownHour(){
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}
