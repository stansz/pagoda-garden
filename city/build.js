"use strict";

/* =========================================================================
   Baked city art.  Each city paints three transparent layer canvases that are
   wider than the framebuffer (PAD art px either side) so they can be blitted at
   a slowly drifting offset for parallax.  They are built once per city/resize:
   a frame only blits them, which is why 60fps is easy.
   ========================================================================= */

const rgbCache = new Map();
function rgbOf(h){
  let v = rgbCache.get(h);
  if(!v){ v = hex2rgb(h); rgbCache.set(h, v); }
  return v;
}
function rgbA(h, a){ const c = rgbOf(h); return [c[0], c[1], c[2], a]; }

/* cyclic smoothed noise, used for ridge lines and forest edges */
function smoothNoise(rnd, n, passes){
  let a = new Float32Array(n);
  for(let i = 0; i < n; i++) a[i] = rnd() * 2 - 1;
  for(let p = 0; p < passes; p++){
    const b = new Float32Array(n);
    for(let i = 0; i < n; i++) b[i] = (a[(i - 1 + n) % n] + a[i] * 2 + a[(i + 1) % n]) * 0.25;
    a = b;
  }
  return a;
}

/* A dithered alpha band, rendered per-pixel into a throwaway canvas: this is how
   haze, mist and glints stay in the same ordered-dither language as the sky. */
function ditherBand(w, h, fn){
  const c = makeCanvas(w, h), g = ctx2(c);
  const img = g.createImageData(w, h), d = img.data;
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const col = fn(x, y);
      if(!col) continue;
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i+1] = col[1]; d[i+2] = col[2]; d[i+3] = col[3];
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* --------------------------------------------------------------- buildings */
function drawTower(s, gName, g, x, baseY, w, h, body, hi, lo, glass, opt){
  opt = opt || {};
  const pal = s.pal;
  R(g, x, baseY - h, w, h, body);
  R(g, x, baseY - h, 1, h, hi);                       // lit left arris
  if(w > 2) R(g, x + w - 1, baseY - h + 1, 1, h - 1, lo);
  R(g, x, baseY - h, w, 1, hi);                       // top cap
  R(g, x - 1, baseY - h - 1, w + 2, 1, hi);

  const step = opt.winStep || 3;
  const litChance = opt.lit === undefined ? 0.5 : opt.lit;
  for(let yy = baseY - h + 3; yy < baseY - 2; yy += step){
    for(let xx = x + 2; xx <= x + w - 2; xx += 3){
      if((((xx * 5 + yy * 11) >> 1) & 3) === 0) continue;    // irregular mullions
      R(g, xx, yy, 1, 1, glass);                             // glass in daylight
      if(s.rnd() < litChance && s.windows.length < 520)
        addWin(s, gName, xx, yy, 1, 1, opt.litCol || pal.win, opt.dim || 1);
    }
  }
  if(opt.crown){                                   // stepped crown on the tall ones
    const cw = Math.max(3, Math.round(w * 0.62));
    R(g, x + Math.round((w - cw) / 2), baseY - h - 5, cw, 4, body);
    R(g, x + Math.round((w - cw) / 2), baseY - h - 5, cw, 1, hi);
    if(opt.crown > 1){
      const cw2 = Math.max(2, Math.round(w * 0.3));
      R(g, x + Math.round((w - cw2) / 2), baseY - h - 9, cw2, 4, body);
      R(g, x + Math.round((w - cw2) / 2), baseY - h - 9, cw2, 1, hi);
    }
  }
  if(opt.antenna) R(g, x + Math.floor(w / 2), baseY - h - 1 - opt.antenna, 1, opt.antenna, lo);
  s.props.push({ g: gName, x, w, h, col: body });
}

function addWin(s, g, x, y, w, h, col, dim){
  const r = s.rnd();
  s.windows.push({ g, x, y, w, h, col, dim: dim || 1,
                   ph: r * 6.283, per: 7 + s.rnd() * 24, bias: s.rnd() });
}

/* ------------------------------------------------------------------- trees */
function coniferFringe(s, g, yBase, base, amp, colA, colB, colC){
  const n = smoothNoise(s.rnd, s.LW, 2);
  for(let x = 0; x < s.LW; x++){
    const h = Math.round(base + n[x] * amp + Math.sin(x * 0.037) * amp * 0.5);
    if(h < 3) continue;
    R(g, x, yBase - h, 1, h + 3, colA);
    if((x & 3) === 0) R(g, x, yBase - h - 2, 1, 3, colB);   // tree spike
    if((x & 7) === 3) R(g, x, yBase - h - 1, 1, 2, colC);
  }
}

function palm(s, g, x, baseY, h, lean, trunk, frond, frondHi, shadow){
  let tipX = x, tipY = baseY - h;
  for(let r = 0; r < h; r++){
    const t = r / h;
    const dx = Math.round(lean * t * t * 11);
    const w = r > h * 0.7 ? 1 : 2;
    R(g, x + dx, baseY - r, w, 1, trunk);
    if(w === 2 && (r & 1) === 0) R(g, x + dx + 1, baseY - r, 1, 1, shadow);
    tipX = x + dx + 1; tipY = baseY - r;
  }
  R(g, x - 1, baseY - 1, 4, 1, shadow);
  const cx = tipX, cy = tipY - 1;
  for(let i = 0; i < 8; i++){
    const a = -2.72 + i * 0.40 + (s.rnd() - 0.5) * 0.14;
    const len = 7 + Math.round(s.rnd() * 5);
    for(let k = 1; k <= len; k++){
      const fx = cx + Math.cos(a) * k * 1.45;
      const fy = cy + Math.sin(a) * k * 0.8 + k * k * 0.11;
      const thick = k < len * 0.35 ? 2 : 1;
      R(g, fx, fy, thick, 1, k < len * 0.55 ? frondHi : frond);
    }
  }
  R(g, cx - 1, cy, 3, 2, frond);
  R(g, cx - 1, cy + 2, 2, 1, frond);
  R(g, cx, cy + 2, 1, 1, shadow);
}

/* --------------------------------------------------------------- houses (AMS) */
function gableHouse(s, g, x, baseY, w, h, body, roof, trim, door, type){
  const shadeL = lighten(body, 0.12), shadeR = darken(body, 0.74);
  R(g, x, baseY - h, w, h, body);
  R(g, x, baseY - h, 1, h, shadeL);
  R(g, x + w - 1, baseY - h, 1, h, shadeR);
  R(g, x, baseY - 2, w, 2, darken(body, 0.6));         // plinth
  R(g, x, baseY - h - 1, w, 1, trim);                  // white cornice
  let topY = baseY - h - 1;

  if(type === 0){                                       // stepped gable
    let sw = w;
    for(let i = 0; i < 4; i++){
      sw = Math.max(4, sw - 4);
      topY -= 3;
      const sx = x + Math.round((w - sw) / 2);
      R(g, sx, topY, sw, 3, i === 3 ? roof : body);
      R(g, sx, topY, sw, 1, i === 3 ? trim : shadeL);
      if(i === 3) R(g, sx, topY + 3, sw, 1, trim);
    }
    R(g, x + Math.round(w / 2) - 1, topY - 2, 2, 2, trim);
  } else if(type === 1){                                // bell gable
    for(let i = 1; i <= 4; i++){
      const ww = Math.max(4, Math.round(w * (0.98 - i * 0.19)));
      topY -= 2;
      const sx = x + Math.round((w - ww) / 2);
      R(g, sx, topY, ww, 2, i === 4 ? roof : body);
      R(g, sx, topY, ww, 1, i === 4 ? roof : trim);
      R(g, sx, topY, 1, 2, shadeL);
    }
  } else {                                              // neck gable with a spout
    R(g, x - 1, topY - 2, w + 2, 2, roof);
    R(g, x - 1, topY - 2, w + 2, 1, trim);
    R(g, x + Math.round(w / 2) - 2, topY - 7, 5, 5, body);
    R(g, x + Math.round(w / 2) - 2, topY - 7, 5, 1, trim);
    R(g, x + Math.round(w / 2) - 1, topY - 9, 3, 2, roof);
  }
  // windows: 1-2 columns of 4x6 glass in a 1px white frame
  const cols = w >= 30 ? 2 : 1;
  for(let yy = topY + 11; yy < baseY - 11; yy += 11){
    for(let c = 0; c < cols; c++){
      const wx = x + (cols === 1 ? Math.round(w / 2) - 3 : 5 + c * (w - 14));
      if(wx + 6 > x + w - 2) continue;
      R(g, wx, yy, 6, 8, trim);
      R(g, wx + 1, yy + 1, 4, 6, door);
      R(g, wx + 1, yy + 4, 4, 1, trim);
      if(s.rnd() < 0.5 && s.windows.length < 520)
        addWin(s, "mid", wx + 1, yy + 1, 4, 6, s.gold || s.pal.gold, 1);
    }
  }
  // door with a step
  const dx = x + Math.round(w / 2) - 2;
  R(g, dx, baseY - 8, 5, 8, door);
  R(g, dx, baseY - 8, 5, 1, trim);
  R(g, dx + 3, baseY - 5, 1, 1, trim);
  R(g, dx - 1, baseY - 1, 7, 1, trim);
  s.props.push({ g: "mid", x, w, h: Math.min(h, 40), col: body });
}

/* =========================================================== city builders */
const BUILD = {};

/* a rounded canopy, drawn as spans so it does not read as a stack of boxes */
function blob(g, cx, cy, rx, ry, col, hi){
  for(let y = -ry; y <= ry; y++){
    const t = y / (ry + 0.5);
    const halfW = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if(halfW <= 0) continue;
    R(g, cx - halfW, cy + y, halfW * 2, 1, col);
  }
  if(!hi) return;
  for(let y = -ry; y <= -Math.round(ry * 0.15); y++){
    const t = y / (ry + 0.5);
    const halfW = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if(halfW > 3) R(g, cx - halfW + 1, cy + y, halfW - 2, 1, hi);
  }
}
