"use strict";

/* =========================================================================
   Per-frame painting: sky, water, weather, lights, window frame.
   ========================================================================= */

function mixArr(a, b, t){
  const A = Array.isArray(a) ? a : rgbOf(a);
  const B = Array.isArray(b) ? b : rgbOf(b);
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
}

/* --------------------------------------------------------------- sun / moon */
function sunPos(){
  const hour = state.hour;
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  if(elev > 0.01){
    const f = clamp((hour - 6) / 12, 0, 1);
    return { day: true, x: (0.07 + f * 0.86) * BW, y: yW * (0.94 - elev * 0.72),
             r: Math.max(3, Math.round(BW * 0.0125)), elev, glow: 6.0 };
  }
  const nf = ((hour - 18 + 24) % 24) / 12;
  const me = Math.sin(clamp(nf, 0, 1) * Math.PI);
  return { day: false, x: (0.07 + clamp(nf, 0, 1) * 0.86) * BW, y: yW * (0.94 - me * 0.72),
           r: Math.max(2, Math.round(BW * 0.0105)), elev: -me, glow: 4.4 };
}

/* --------------------------------------------------------------------- sky */
function paintSky(m){
  const g = ctx2(skyCv);
  g.clearRect(0, 0, BW, BH);
  const img = g.createImageData(BW, BH), d = img.data;
  const K = 14;
  const ramp = [];
  for(let k = 0; k < K; k++){
    const t = k / (K - 1);
    const r0 = lerp(m.top[0], m.bot[0], t);
    const g0 = lerp(m.top[1], m.bot[1], t);
    const b0 = lerp(m.top[2], m.bot[2], t);
    const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
    const sat = 1.20, dim = 1 - 0.12 * (1 - t);      // push off the grey axis, deepen the zenith
    ramp.push([(lum + (r0 - lum) * sat) * dim, (lum + (g0 - lum) * sat) * dim, (lum + (b0 - lum) * sat) * dim]);
  }
  const hz = Math.max(1, yW);
  for(let y = 0; y < BH; y++){
    const t = Math.pow(clamp(y / hz, 0, 1), 1.1);
    let v = t * (K - 1);
    let i = Math.floor(v);
    let f = v - i;
    if(i >= K - 1){ i = K - 2; f = 1; }
    const rowOff = (y & 3) << 2;
    for(let x = 0; x < BW; x++){
      const idx = f > BAYER[rowOff | (x & 3)] / 16 ? i + 1 : i;
      const c = ramp[idx];
      const o = (y * BW + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }

  // sun or moon, stippled with the same Bayer matrix so the halo is dithered
  const sp = sunPos();
  const light = sp.day ? [255, 238, 196] : [226, 238, 255];
  const core = sp.day ? [255, 250, 226] : [242, 247, 255];
  const R2 = sp.glow * sp.r;
  const x0 = Math.max(0, Math.floor(sp.x - R2)), x1 = Math.min(BW - 1, Math.ceil(sp.x + R2));
  const y0 = Math.max(0, Math.floor(sp.y - R2)), y1 = Math.min(BH - 1, Math.ceil(sp.y + R2));
  for(let y = y0; y <= y1; y++){
    const dy = y - sp.y;
    const rowOff = (y & 3) << 2;
    for(let x = x0; x <= x1; x++){
      const dx = x - sp.x;
      const dd = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if(dd <= sp.r) a = 1;
      else {
        const q = 1 - (dd - sp.r) / (R2 - sp.r);
        a = q > 0 ? q * q * 0.55 : 0;
      }
      if(a < 0.03) continue;
      const o = (y * BW + x) * 4;
      if(a >= 0.999){
        d[o] = core[0]; d[o + 1] = core[1]; d[o + 2] = core[2];
      } else if(BAYER[rowOff | (x & 3)] / 16 < a){
        d[o]     = lerp(d[o], light[0], a * 0.8);
        d[o + 1] = lerp(d[o + 1], light[1], a * 0.8);
        d[o + 2] = lerp(d[o + 2], light[2], a * 0.8);
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------- water */
function paintWater(){
  const wc = scene.wcol;
  const h = Math.max(10, BH - yW);
  const c = makeCanvas(BW, h), g = ctx2(c);
  const img = g.createImageData(BW, h), d = img.data;
  const K = 9;
  const mid = mixArr(wc.mid, "#ffffff", 0.07);
  const ramp = [];
  for(let k = 0; k < K; k++){
    const t = k / (K - 1);
    ramp.push(t < 0.4 ? mixArr(wc.hi, mid, t / 0.4)
                      : mixArr(mid, wc.lo, (t - 0.4) / 0.6));
  }
  for(let y = 0; y < h; y++){
    const t = Math.pow(y / h, 1.15);
    let v = t * (K - 1);
    let i = Math.floor(v), f = v - i;
    if(i >= K - 1){ i = K - 2; f = 1; }
    const rowOff = (y & 3) << 2;
    for(let x = 0; x < BW; x++){
      const idx = f > BAYER[rowOff | (x & 3)] / 16 ? i + 1 : i;
      const col = ramp[idx];
      const o = (y * BW + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // sky reflection hugging the waterline
  const bh = Math.min(16, h);
  const wash = ditherBand(BW, bh, (x, y) =>
    BAYER[((y & 3) << 2) | (x & 3)] / 16 < (1 - y / bh) * 0.75 ? rgbA(wc.hi, 255) : null);
  g.globalAlpha = 0.42;
  g.drawImage(wash, 0, 0);
  g.globalAlpha = 1;
  R(g, 0, 0, BW, 1, wc.hi);
  waterCv = c;
  waterCity = state.city;
}

/* ----------------------------------------------------------- light dressing */
// No window frame, no mullions: the pixel art runs edge to edge. All that is baked
// on top is a soft bottom-weighted vignette so the UI bar has something to sit on.
function buildFrame(){
  const c = makeCanvas(BW, BH), g = ctx2(c);
  const img = g.createImageData(BW, BH), d = img.data;
  for(let y = 0; y < BH; y++){
    const ny = y / BH;
    const bottom = Math.pow(clamp((ny - 0.55) / 0.45, 0, 1), 1.9) * 0.30;
    for(let x = 0; x < BW; x++){
      const side = Math.pow(clamp((Math.abs(x / BW - 0.5) - 0.40) / 0.10, 0, 1), 2) *
                   clamp((ny - 0.30) / 0.70, 0, 1) * 0.10;
      const o = (y * BW + x) * 4;
      d[o] = 4; d[o + 1] = 6; d[o + 2] = 8;
      d[o + 3] = Math.round(clamp(bottom + side, 0, 1) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ clouds */
function buildClouds(){
  clouds = [];
  const rnd = mulberry32(777);
  const makers = [
    { w: Math.round(BW * 0.30), h: 20, y: 22, sp: 4.5, a: 0.50 },
    { w: Math.round(BW * 0.20), h: 14, y: 50, sp: 7.0, a: 0.40 },
    { w: Math.round(BW * 0.38), h: 26, y: 12, sp: 3.0, a: 0.36 },
    { w: Math.round(BW * 0.16), h: 11, y: 68, sp: 9.0, a: 0.30 }
  ];
  for(let i = 0; i < makers.length; i++){
    const mk = makers[i];
    const blobs = [];
    const nb = 3 + Math.floor(rnd() * 3);
    for(let k = 0; k < nb; k++){
      blobs.push({ x: mk.w * (0.18 + 0.64 * rnd()), y: mk.h * (0.42 + 0.3 * rnd()),
                   r: mk.h * (0.34 + 0.4 * rnd()) });
    }
    // one sprite for daylight, one for night: a multiply grade cannot lift a cloud
    // above the sky, so the pale version is swapped for a dark one
    const paint = col => {
      const c = makeCanvas(mk.w, mk.h), g = ctx2(c);
      for(let y = 0; y < mk.h; y++){
        let run = -1;
        for(let x = 0; x <= mk.w; x++){
          let inside = false;
          if(x < mk.w && y < mk.h * 0.86){
            for(let k = 0; k < blobs.length; k++){
              const bl = blobs[k];
              const dx = (x - bl.x) / (bl.r * 1.9), dy = (y - bl.y) / bl.r;
              if(dx * dx + dy * dy <= 1){ inside = true; break; }
            }
          }
          if(inside && run < 0) run = x;
          else if(!inside && run >= 0){
            R(g, run, y, x - run, 1, col);
            run = -1;
          }
        }
      }
      return c;
    };
    clouds.push({
      cv:  paint(i === 2 ? "#dfe6e9" : "#e9eef0"),
      cvN: paint(i === 2 ? "#28313f" : "#2f3a4a"),
      x0: rnd() * BW, y: mk.y, w: mk.w, sp: mk.sp, a: mk.a
    });
  }
}

/* ------------------------------------------------------------------- stars */
function buildStars(){
  stars = [];
  const rnd = mulberry32(4242);
  const n = Math.round(BW * BH / 2600);
  for(let i = 0; i < n; i++){
    stars.push({
      x: Math.floor(rnd() * BW),
      y: Math.floor(rnd() * yW * 0.92),
      a: 0.3 + rnd() * 0.7,
      ph: rnd() * 6.283,
      sp: 0.4 + rnd() * 1.6
    });
  }
}

/* --------------------------------------------------------------- particles */
function buildParticles(){
  rain = []; snow = []; drift = [];
  const rnd = mulberry32(99);
  const nRain = clamp(Math.round(BW * BH / 560), 150, 400);
  const nSnow = clamp(Math.round(BW * BH / 1500), 60, 160);
  for(let i = 0; i < nRain; i++){
    rain.push({ x: rnd() * BW, y: rnd() * BH, v: 200 + rnd() * 140,
                len: 2 + Math.round(rnd() * 2), k: 26 + rnd() * 26 });
  }
  for(let i = 0; i < nSnow; i++){
    snow.push({ x: rnd() * BW, y: rnd() * BH, v: 9 + rnd() * 14,
                r: rnd() < 0.35 ? 2 : 1, sw: 14 + rnd() * 16, ph: rnd() * 6.283 });
  }
  // one shared pool; DRIFT decides how many of these are in the air and how
  // they move, so switching city or season costs nothing and never leaks state.
  // Each particle remembers the tree emitter that released it (`ex/ey`) plus a
  // small lateral offset (`ox`), so a respawn always comes out of a crown.
  for(let i = 0; i < 28; i++){
    drift.push({ x: rnd() * BW, y: rnd() * BH, sp: 0.55 + rnd() * 0.9,
                 ph: rnd() * 6.283, c: i % 3,
                 amb: false, ex: 0, ey: 0, ox: 0, j: 0 });
  }
  buildRipples();
}

/* ------------------------------------------------------------------ sprites */
const WHALE = [
  "###.........###",
  "####.......####",
  "#####.....#####",
  ".#####...#####.",
  "..#####.#####..",
  "...#########...",
  "......###......",
  "......###......",
  "......###......",
  ".......#.......",
  ".......#......."
];
const BIRD = [
  [".#...#.", "..#.#..", "...#..."],
  ["...#...", "..#.#..", ".#...#."]
];

function drawWhale(now, p, splashCol){
  const spot = scene.extra && scene.extra.whale;
  if(!spot) return;
  const period = 27, t = (now * 0.001) % period;
  let k = 0;
  if(t < 2.0) k = t / 2.0;
  else if(t < 7.0) k = 1;
  else if(t < 9.4) k = 1 - (t - 7.0) / 2.4;
  const bob = reduceMotion ? 0 : Math.round(Math.sin(now * 0.0004) * 2);
  const baseY = yW + 19 + bob;
  if(k > 0.02){
    const spread = Math.round((1 - k) * 6 + 2);
    bctx.globalAlpha = 0.5 * (1 - Math.abs(k - 0.5) * 1.1);
    for(let i = -spread; i <= spread; i++){
      if(((i + spread) & 1) === 0) R(bctx, spot.x + i * 2, yW + 1, 2, 1, splashCol || p.waterHi);
    }
    bctx.globalAlpha = 1;
  }
  if(k <= 0.02) return;
  const gy = Math.round(baseY - 33 * k);
  const gx = spot.x - 22;
  drawBits(bctx, WHALE, { "#": splashCol || p.waterHi }, gx - 2, gy - 2, 3);
  drawBits(bctx, WHALE, { "#": p.whale }, gx, gy, 3);
}

function drawOutrigger(p){
  const bx = Math.round(BW * 0.80), by = yW + 34;
  R(bctx, bx - 22, by, 30, 3, p.lava);
  R(bctx, bx - 24, by - 2, 4, 3, p.lava);
  R(bctx, bx - 20, by + 3, 26, 1, p.lagoon);
  R(bctx, bx - 4, by - 22, 1, 22, p.palmLo);
  for(let r = 0; r < 16; r++){
    const w = Math.round((r / 16) * 13);
    R(bctx, bx - 3 - w, by - 22 + r, w, 1, r > 13 ? p.cream : p.sandHi);
  }
  R(bctx, bx - 2, by - 22, 2, 22, p.sand);
  R(bctx, bx + 6, by + 4, 14, 2, p.lava);
  R(bctx, bx + 18, by + 2, 2, 4, p.palmLo);
}

function drawJunk(p, now){
  const spot = scene.extra && scene.extra.junk;
  if(!spot) return;
  const bob = reduceMotion ? 0 : Math.round(Math.sin(now * 0.0011) * 1);
  const bx = spot.x - 16, by = spot.y + bob;
  R(bctx, bx, by + 6, 34, 4, p.t1);
  R(bctx, bx + 2, by + 9, 30, 1, p.water);
  R(bctx, bx + 6, by + 2, 22, 5, p.t2);
  R(bctx, bx + 8, by + 4, 3, 2, p.amber);
  R(bctx, bx + 16, by + 4, 3, 2, p.neon);
  for(let r = 0; r < 18; r++){
    const w = Math.round(2 + r * 0.85);
    R(bctx, bx + 22, by - 12 + r, w, 1, r % 3 === 2 ? p.sail : lighten(p.sail, 0.12));
  }
  R(bctx, bx + 21, by - 24, 1, 26, p.hill);
  R(bctx, bx + 12, by - 10, 1, 16, p.hill);
}

/* a harbour ferry, crossing and back, for Sydney */
function drawFerry(p, now){
  const spot = scene.extra && scene.extra.ferry;
  if(!spot) return;
  const bob = reduceMotion ? 0 : Math.round(Math.sin(now * 0.0009 + 1.2));
  const bx = spot.x - 20, by = yW + 29 + bob;
  R(bctx, bx, by, 46, 4, p.ferry);                   // hull
  R(bctx, bx, by, 46, 1, p.ferryGreen);              // green stripe
  R(bctx, bx + 1, by + 4, 44, 1, p.steelLo);
  R(bctx, bx + 10, by - 7, 24, 7, p.ferry);          // cabin
  R(bctx, bx + 10, by - 7, 24, 1, p.sailHi);
  R(bctx, bx + 13, by - 5, 5, 3, p.win);
  R(bctx, bx + 22, by - 5, 6, 3, p.win);
  R(bctx, bx + 8, by - 9, 28, 2, p.steelHi);         // upper deck
  R(bctx, bx - 9, by + 4, 12, 1, p.waterHi);         // wake
}

/* ------------------------------------------------------------- frame pieces */
function layerOff(gName, offs){
  if(gName === "far") return offs.far - PAD;
  if(gName === "mid") return offs.mid - PAD;
  return offs.near - PAD;
}

function drawStarsFx(now, m){
  const a0 = m.night * (1 - state.rainAmt * 0.85) * (1 - state.snowAmt * 0.5);
  if(a0 < 0.03) return;
  const t = now * 0.001;
  const b = bctx;
  for(let i = 0; i < stars.length; i++){
    const st = stars[i];
    const tw = 0.55 + 0.45 * Math.sin(t * st.sp + st.ph);
    b.globalAlpha = a0 * st.a * tw;
    R(b, st.x, st.y, 1, 1, "#e9f1ff");
  }
  b.globalAlpha = 1;
}

function drawCloudsFx(now, m){
  const b = bctx;
  const t = now * 0.001;
  const na = m.night;
  for(let i = 0; i < clouds.length; i++){
    const c = clouds[i];
    const span = BW + c.w + 60;
    let x = (c.x0 + t * c.sp) % span;
    if(x < 0) x += span;
    x -= c.w + 30;
    const base = Math.min(0.9, c.a * (0.85 + 0.5 * state.cloudAmt));
    if(na < 0.97 && base * (1 - na) > 0.01){
      b.globalAlpha = base * (1 - na);
      b.drawImage(c.cv, Math.round(x), c.y);
    }
    if(na > 0.02){
      b.globalAlpha = base * na * 0.9;
      b.drawImage(c.cvN, Math.round(x), c.y);
    }
  }
  b.globalAlpha = 1;
}

let flock = null, nextFlock = 9000;
function drawBirdsFx(now){
  const b = bctx;
  if(reduceMotion) return;
  if(!flock && now > nextFlock){
    flock = {
      x0: BW + 30, y0: 24 + Math.random() * yW * 0.42,
      vx: -(10 + Math.random() * 7), t0: now,
      n: 2 + Math.floor(Math.random() * 2),
      off: [0, 9 + Math.random() * 6, 18 + Math.random() * 10]
    };
  }
  if(!flock) return;
  const x = flock.x0 + (now - flock.t0) * 0.001 * flock.vx;
  if(x < -60){
    flock = null;
    nextFlock = now + 38000 + Math.random() * 50000;
    return;
  }
  const f = Math.round(now * 0.006) & 1;
  for(let i = 0; i < flock.n; i++){
    const bx = Math.round(x - flock.off[i]);
    const by = Math.round(flock.y0 + Math.sin(now * 0.0009 + i) * 4 + i * 5);
    b.globalAlpha = 0.62 - i * 0.12;
    drawBits(b, BIRD[f], { "#": "#232a2e" }, bx, by, 1);
  }
  b.globalAlpha = 1;
}

/* ------------------------------------------------------------- water effects */
let ripples = [];
function buildRipples(){
  ripples = [];
  const rnd = mulberry32(1234);
  const h = Math.max(10, BH - yW);
  for(let i = 0; i < 26; i++){
    ripples.push({
      x: rnd() * BW, y: 4 + rnd() * Math.max(4, h - 8),
      len: 5 + Math.round(rnd() * 16), sp: 3 + rnd() * 8,
      a: 0.10 + rnd() * 0.22, ph: rnd() * 6.283
    });
  }
}

function drawWaterFX(now, m, offs){
  const b = bctx;
  const p = scene.pal;
  const t = now * 0.001;
  const wh = Math.max(10, BH - yW);

  // reflections of the baked buildings, as dashed vertical smears
  const refl = scene.props;
  for(let i = 0; i < refl.length; i++){
    const pr = refl[i];
    const ox = layerOff(pr.g, offs);
    const x0 = pr.x + ox;
    if(pr.w < 4 || x0 + pr.w < -2 || x0 > BW + 2) continue;
    const len = Math.min(26, Math.round(wh * 0.42), Math.max(6, Math.round(pr.h * 0.42)));
    for(let r = 0; r < len; r += 2){
      const yy = yW + 2 + r;
      if(yy >= BH) break;
      const a = (1 - r / len) * 0.26;
      const wob = reduceMotion ? 0 : Math.sin(r * 0.55 + t * 1.6) * 1.6;
      const ww = pr.w * (1 - (r / len) * 0.4);
      b.globalAlpha = a;
      R(b, x0 + wob + (pr.w - ww) / 2, yy, ww, 1, pr.col);
    }
  }
  b.globalAlpha = 1;

  // drifting ripple dashes
  for(let i = 0; i < ripples.length; i++){
    const r = ripples[i];
    const yy = yW + Math.round(r.y);
    if(yy >= BH - 1) continue;
    const span = BW + r.len + 20;
    let x = (r.x + t * r.sp) % span;
    if(x < 0) x += span;
    x -= r.len + 10;
    b.globalAlpha = r.a * (0.7 + 0.3 * Math.sin(t * 1.3 + r.ph));
    R(b, x, yy, r.len, 1, scene.wcol.hi);
  }
  b.globalAlpha = 1;

  // sun / moon glint on the water
  const sp = sunPos();
  const gl = clamp(sp.elev, 0, 1);
  if(gl > 0.04){
    const rows = Math.round(6 + gl * 8);
    for(let r = 0; r < rows; r++){
      const yy = yW + 2 + r;
      if(yy >= BH) break;
      const spread = 6 + r * 5;
      const a = gl * (0.34 - r * 0.022);
      if(a <= 0.02) continue;
      for(let k = 0; k < 5; k++){
        const px0 = sp.x + Math.sin(k * 2.3 + r) * spread;
        const w = 2 + ((k + r) & 3);
        b.globalAlpha = a * (0.5 + 0.5 * Math.sin(t * 1.4 + k * 1.7 + r));
        R(b, px0, yy, w, 1, sp.day ? "#ffe3a8" : "#cfe0f2");
      }
    }
    b.globalAlpha = 1;
  }

  // the city's own bit of life in the water — one table keyed by record id
  const life = WATER_LIFE[scene.id];
  if(life) life(p, now, scene.wcol.hi);
}

/* landmark life on the water: keyed by city id, same table idea as BUILD */
const WATER_LIFE = {
  vancouver: (p, now, wcol) => drawWhale(now, p, wcol),
  hawaii:    p              => drawOutrigger(p),
  hongkong:  (p, now)       => drawJunk(p, now),
  sydney:    (p, now)       => drawFerry(p, now)
};

/* ------------------------------------------------------------------- lights */
function drawLights(now, m, offs){
  const b = bctx;
  const na = m.night;
  if(na < 0.06) return;
  const t = now * 0.001;
  for(let i = 0; i < scene.windows.length; i++){
    const w = scene.windows[i];
    const a = (0.5 + 0.5 * Math.sin(w.ph + t * (6.283 / w.per))) * na * (w.dim || 1);
    if(a < 0.05) continue;
    b.globalAlpha = Math.min(1, a);
    R(b, w.x + layerOff(w.g, offs), w.y, w.w, w.h, w.col);
  }
  b.globalAlpha = 1;

  for(let i = 0; i < scene.lights.length; i++){
    const L = scene.lights[i];
    if(L.kind === "neon"){
      const flick = 0.62 + 0.38 * Math.sin(t * 2.1 + L.ph) * Math.sin(t * 0.37 + L.ph);
      b.globalAlpha = clamp(na * flick, 0, 1);
      R(b, L.x + offs.mid - PAD, L.y, L.w, L.h, L.col);
      b.globalAlpha = 1;
    } else if(L.kind === "lantern"){
      const sway = reduceMotion ? 0 : Math.round(Math.sin(t * 0.7 + L.ph) * 2);
      const lx = L.x + sway, ly = L.y;
      R(b, lx + 2, 0, 1, ly, "#2b2320");
      b.globalAlpha = clamp(0.2 + na * 0.85, 0, 1);
      for(let yy = -3; yy <= 8; yy++){
        for(let xx = -3; xx <= 6; xx++){
          if((xx === 0 || xx === 5 || yy === -3 || yy === 6) && ((xx + yy) & 1) === 0)
            R(b, lx + xx + 1, ly + yy, 1, 1, L.col);
        }
      }
      b.globalAlpha = 1;
      R(b, lx + 1, ly, 5, 7, L.col);
      R(b, lx + 2, ly + 2, 3, 3, "#ffd08a");
      R(b, lx + 1, ly + 7, 5, 1, "#d8a552");
      R(b, lx + 1, ly - 1, 5, 1, "#2b2320");
    }
  }
}

/* --------------------------------------------------------- seasonal drift
   One renderer for every falling thing: petals, leaves, seeds, needles, motes.
   The DRIFT table supplies the sprite, the speed and the count; the pool is
   shared, so a city/season change just swaps what those particles look like.
   Every particle is released from a crown emitter of the baked tree (or, for
   the few ambient specs, from the top of the frame); heavy rain or snow winds
   the layer down to nothing — it must never fight the weather it sits on. */
function currentDrift(){
  return driftFor(scene ? scene.id : state.city, state.season);
}
function driftAmount(){
  if(!currentDrift()) return 0;
  return clamp(1 - state.rainAmt * 2.4 - state.snowAmt * 5, 0, 1);
}

/* Put the shared pool under the tree this bake painted.  Each particle takes a
   slice of one emitter's line of fall; the seeded phase decides where along it
   it starts, so a fresh city/season opens with a believable column rather than
   a burst at the crown.  `ambient` is the optional top-of-frame trickle. */
function seedDrift(emitters){
  const spec = currentDrift();
  const ems = (emitters && emitters.length) ? emitters : [];
  const n = spec ? Math.min(spec.n, drift.length) : 0;
  const nAmb = spec ? Math.round(clamp(spec.ambient || 0, 0, 1) * n) : 0;
  for(let i = 0; i < drift.length; i++){
    const l = drift[i];
    l.j = 0;
    if(!spec){ l.amb = true; continue; }      // a season with no drift: pool idle
    const ambient = nAmb > 0 && i >= n - nAmb;
    l.amb = ambient || !ems.length;
    if(l.amb){
      l.ex = Math.round((l.ph / 6.283) * BW);
      l.ey = -4; l.ox = 0;
      l.x = l.ex;
      l.y = Math.round((l.ph / 6.283) * BH);
    } else {
      const e = ems[i % ems.length];
      l.ex = e.x; l.ey = e.y;
      l.ox = Math.round(((l.ph / 6.283) * 2 - 1) * (e.spread || 3));
      l.y = l.ey + Math.round((l.ph / 6.283) * Math.max(2, BH - l.ey) * 0.9);
      // place it where the live motion would already have carried it: the same
      // wind+wobble equation integrated over the fall time, so a fresh bake
      // opens as a wind-blown fan under the crown instead of a vertical thread
      const speed = Math.max(1, spec.rate * (0.7 + l.sp * 0.55));
      const tt = (l.y - l.ey) / speed;
      const f = 0.55 + l.sp * 0.5;
      const sway = (spec.wobble / 0.5) * (Math.cos(l.ph) - Math.cos(0.5 * tt + l.ph));
      l.x = clamp(l.ex + l.ox + Math.round(f * (2 * tt + sway)), -4, BW + 4);
    }
  }
}

function drawDrift(now, m){
  const spec = currentDrift();
  const a0 = driftAmount();
  if(!spec || a0 < 0.02) return;
  const b = bctx;
  const cols = spec.cols;
  const night = 0.55 + 0.45 * (1 - m.night);
  const shape = spec.shape || "leaf";
  for(let i = 0; i < spec.n && i < drift.length; i++){
    const l = drift[i];
    const x = Math.round(l.x), y = Math.round(l.y);
    if(y < -4 || y > BH + 4 || x < -6 || x > BW + 6) continue;
    const c0 = cols[l.c % cols.length], c1 = cols[(l.c + 1) % cols.length];
    b.globalAlpha = a0 * night;
    if(shape === "leaf"){
      R(b, x, y, 2, 2, c0);
      R(b, x, y + 1, 1, 1, c0);
      R(b, x + 1, y + 2, 1, 1, c1);
    } else if(shape === "petal"){
      R(b, x, y, 2, 1, c0);
      R(b, x + 1, y + 1, 1, 1, c1);
    } else if(shape === "seed"){
      R(b, x, y, 1, 2, c0);
      R(b, x + 1, y + 1, 1, 1, c1);
    } else {                                    // "mote": a fleck of haze
      b.globalAlpha = a0 * night * 0.55;
      R(b, x, y, 1, 1, c0);
      if((i & 3) === 0) R(b, x + 1, y + 1, 1, 1, c1);
    }
  }
  b.globalAlpha = 1;
}

/* ------------------------------------------------------------------ weather */
function drawWeather(now, m){
  const b = bctx;
  if(state.rainAmt > 0.01){
    const bright = (m.top[0] + m.top[1] + m.top[2]) / 3;
    const col = bright > 140 ? "#7f95a9" : "#c3d3e7";
    b.globalAlpha = 0.72 * state.rainAmt;
    for(let i = 0; i < rain.length; i++){
      const r = rain[i];
      R(b, r.x, r.y, 1, r.len, col);
    }
    b.globalAlpha = 1;
  }
  if(state.snowAmt > 0.01){
    b.globalAlpha = 0.85 * state.snowAmt;
    for(let i = 0; i < snow.length; i++){
      const f = snow[i];
      R(b, f.x, f.y, f.r, f.r, "#ffffff");
    }
    b.globalAlpha = 1;
  }
  drawDrift(now, m);
}

/* --------------------------------------------------------------------- grade */
/* A few cities carry a per-season colour cast on top of the hour tint: Sydney
   in winter is the mild grey harbour light, in summer barely touched. */
const SEASON_CAST = {
  sydney: {
    winter: { tint: [152, 164, 176], a: 0.42 },   // the mild grey harbour light
    summer: { tint: [255, 249, 232], a: 0.05 }
  }
};
function seasonCast(){
  const byCity = SEASON_CAST[state.city];
  return (byCity && byCity[state.season]) || null;
}
function grade(m){
  const b = bctx;
  b.globalCompositeOperation = "multiply";
  if(m.ta > 0.002){
    b.fillStyle = "rgba(" + (m.tint[0] | 0) + "," + (m.tint[1] | 0) + "," + (m.tint[2] | 0) + "," + m.ta.toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  const cast = seasonCast();
  if(cast && cast.a > 0.002){
    b.fillStyle = "rgba(" + (cast.tint[0] | 0) + "," + (cast.tint[1] | 0) + "," + (cast.tint[2] | 0) + "," + cast.a.toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  if(state.cloudAmt > 0.01){
    b.fillStyle = "rgba(150,159,172," + (0.26 * state.cloudAmt).toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  if(state.rainAmt > 0.01){
    b.fillStyle = "rgba(96,116,138," + (0.30 * state.rainAmt).toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  b.globalCompositeOperation = "lighter";
  if(state.snowAmt > 0.01){
    b.fillStyle = "rgba(196,214,230," + (0.045 * state.snowAmt).toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  // the focus session colours the room: cooler in a round, warmer in a break,
  // eased per frame so starting or stopping never snaps
  const tintHalf = session.paused ? 0.5 : 1;
  const wantFocus = session.kind === "focus" ? 0.12 * tintHalf : 0;
  const wantBrk = session.kind === "break" ? 0.05 * tintHalf : 0;
  sessionTint.focus += (wantFocus - sessionTint.focus) * 0.03;
  sessionTint.brk += (wantBrk - sessionTint.brk) * 0.03;
  if(sessionTint.focus > 0.002){
    b.globalCompositeOperation = "multiply";
    b.fillStyle = "rgba(168,182,206," + sessionTint.focus.toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  if(sessionTint.brk > 0.002){
    b.globalCompositeOperation = "lighter";
    b.fillStyle = "rgba(255,224,170," + sessionTint.brk.toFixed(3) + ")";
    b.fillRect(0, 0, BW, BH);
  }
  b.globalCompositeOperation = "source-over";
}

/* ------------------------------------------------------------------- parallax */
function offsets(now){
  if(reduceMotion) return { far: 0, mid: 0, near: 0 };
  const t = now * 0.001;
  return {
    far:  Math.round(Math.sin(t * 0.020) * 6),
    mid:  Math.round(Math.sin(t * 0.014 + 1.7) * 4),
    near: Math.round(Math.sin(t * 0.009 + 3.1) * 2)
  };
}

/* -------------------------------------------------------------------- frame */
function drawFrame(now, dt){
  // keep the ambience in step with the weather (rain amount, snow dulling the
  // top end) and the season; a no-op until sound has been started once
  if(ac) updateAudio();
  // the season can roll over from the info-card interval; the guard means the
  // layers are rebuilt exactly once and every other frame is a pure blit
  if(!scene || scene.id !== state.city || scene.season !== state.season ||
     scene.BW !== BW || scene.BH !== BH) buildScene(state.city);
  const m = moodAt(state.hour);
  const b = bctx;
  b.globalCompositeOperation = "source-over";
  b.globalAlpha = 1;

  const bucket = Math.round(state.hour * 20) / 20;
  if(bucket !== skyBucket){ paintSky(m); skyBucket = bucket; }
  if(!waterCv || waterCity !== state.city) paintWater();

  b.drawImage(skyCv, 0, 0);
  drawStarsFx(now, m);
  drawCloudsFx(now, m);
  drawBirdsFx(now);

  const offs = offsets(now);
  b.drawImage(scene.farC, -PAD + offs.far, 0);
  b.drawImage(scene.midC, -PAD + offs.mid, 0);
  b.drawImage(waterCv, 0, yW);
  drawWaterFX(now, m, offs);
  b.drawImage(scene.nearC, -PAD + offs.near, 0);

  grade(m);
  drawLights(now, m, offs);
  // settled snow on a bare crown: baked once with the winter tree, faded in by
  // the live snow amount, so weather never triggers a re-bake
  if(scene.treeSnow && state.snowAmt > 0.01){
    const sn = scene.treeSnow;
    b.globalAlpha = clamp(state.snowAmt * 0.8, 0, 1);
    b.drawImage(sn.cv, sn.x + (sn.layer === "mid" ? offs.mid : offs.near), sn.y);
    b.globalAlpha = 1;
  }
  drawWeather(now, m);
  b.drawImage(frameCv, 0, 0);

  if(dctx){
    dctx.imageSmoothingEnabled = false;
    if(bx > 0 || by > 0){                          // only if a rounding gap ever appears
      dctx.fillStyle = "#070a0c";
      dctx.fillRect(0, 0, cv.width, cv.height);
    }
    dctx.drawImage(buf, 0, 0, BW, BH, bx, by, BW * px, BH * px);
  }
}
