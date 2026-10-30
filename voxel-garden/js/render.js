"use strict";

/* -------------------------------------------------------------- time / mood */
let hour = 16.6;

const rgb = c => "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")";

/* --------------------------------------------------------------- particles */
let rain = [], snow = [], stars = [], flies = [];
let rainAmt = 0, snowAmt = 0, rainTarget = 0, snowTarget = 0;

function seedParticles(){
  const area = Math.max(1, innerWidth * innerHeight);
  const nRain = clamp(Math.round(area / 3400), 160, 520);
  const nSnow = clamp(Math.round(area / 5200), 120, 420);
  const nFlies = clamp(Math.round(area / 110000), 6, 16);

  rain = [];
  for(let i = 0; i < nRain; i++){
    rain.push({ x: Math.random(), y: Math.random(), v: 0.90 + Math.random() * 0.60,
                l: 0.020 + Math.random() * 0.030, k: 0.16 + Math.random() * 0.10 });
  }
  snow = [];
  for(let i = 0; i < nSnow; i++){
    snow.push({ x: Math.random(), y: Math.random(), v: 0.035 + Math.random() * 0.05,
                r: 1 + Math.random() * 2.2, amp: 0.02 + Math.random() * 0.05,
                ph: Math.random() * 6.283 });
  }
  stars = [];
  for(let i = 0; i < 150; i++){
    stars.push({ x: Math.random(), y: Math.random() * 0.58, r: 1 + Math.random() * 1.6,
                 a: 0.35 + Math.random() * 0.65, ph: Math.random() * 6.283 });
  }
  flies = [];
  for(let i = 0; i < nFlies; i++){
    flies.push({ x: 0.32 + Math.random() * 0.36, y: 0.52 + Math.random() * 0.30,
                 ph: Math.random() * 6.283, sp: 0.3 + Math.random() * 0.7 });
  }
}

/* -------------------------------------------------------------- projection */
function project(wx, wy, wz){
  const X = wx - S.cx, Y = wy - S.cy, Z = wz - S.cz;
  return [
    (X * cam.ca - Z * cam.sa) * cam.s + cam.ox,
    (X * cam.ssp - Y * cam.cp + Z * cam.csp) * cam.s + cam.oy
  ];
}

// soft light blobs are pre-rendered once per colour and blitted, which is far
// cheaper than building a radial gradient every frame (the Firefox case)
const glowSprites = new Map();
function glowSprite(col){
  const key = col.join(",");
  let c = glowSprites.get(key);
  if(c) return c;
  const SIZE = 96;
  c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  rg.addColorStop(0, "rgba(" + key + ",1)");
  rg.addColorStop(0.40, "rgba(" + key + ",0.32)");
  rg.addColorStop(1, "rgba(" + key + ",0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, SIZE, SIZE);
  glowSprites.set(key, c);
  return c;
}
function glow(g, x, y, r, col, a){
  if(a <= 0.004 || r <= 0.5) return;
  g.globalAlpha = Math.min(1, a);
  g.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

/* ------------------------------------------------------------------ render */
// the expensive static half of a frame: sky, voxels, grades, stars, sun/moon, lanterns
function drawSceneLayer(now){
  const ctx = lctx;
  const m = moodAt(hour);

  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const scp = sa * cp, ccp = ca * cp;
  const ssp = sa * sp, csp = ca * sp;
  const s = Math.min(W, H) / S.fit * zoom, ox = W / 2, oy = H / 2;
  const pts = S.pts;
  cam.ca = ca; cam.sa = sa; cam.cp = cp; cam.sp = sp;
  cam.ssp = ssp; cam.csp = csp; cam.s = s; cam.ox = ox; cam.oy = oy;

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, rgb(m.top));
  sky.addColorStop(1, rgb(m.bot));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // project the 8 corners of every cube
  for(let i = 0; i < S.n; i++){
    const j = i * 6, b = i * 12;
    const X0 = S.pos[j], X1 = S.pos[j + 1], Y0 = S.pos[j + 2], Y1 = S.pos[j + 3],
          Z0 = S.pos[j + 4], Z1 = S.pos[j + 5];
    const xc0 = X0 * ca, xc1 = X1 * ca, zs0 = Z0 * sa, zs1 = Z1 * sa;
    pts[b]     = xc0 - zs0; pts[b + 1] = xc1 - zs0;
    pts[b + 2] = xc1 - zs1; pts[b + 3] = xc0 - zs1;
    const xsp0 = X0 * ssp, xsp1 = X1 * ssp, ycp0 = -Y0 * cp, ycp1 = -Y1 * cp,
          zsp0 = Z0 * csp, zsp1 = Z1 * csp;
    pts[b + 4]  = xsp0 + ycp0 + zsp0; pts[b + 5]  = xsp1 + ycp0 + zsp0;
    pts[b + 6]  = xsp1 + ycp0 + zsp1; pts[b + 7]  = xsp0 + ycp0 + zsp1;
    pts[b + 8]  = xsp0 + ycp1 + zsp0; pts[b + 9]  = xsp1 + ycp1 + zsp0;
    pts[b + 10] = xsp1 + ycp1 + zsp1; pts[b + 11] = xsp0 + ycp1 + zsp1;
  }

  // collect uncovered, camera-facing faces with a painter depth key
  let fc = 0;
  for(let i = 0; i < S.n; i++){
    const mask = S.occ[i], cb = i * 15;
    for(let f = 0; f < 5; f++){
      if(mask & (1 << f)) continue;
      if(NX[f] * scp + NY[f] * sp + NZ[f] * ccp <= 0) continue;
      S.faceDepth[fc] = S.FC[cb + f * 3] * scp + S.FC[cb + f * 3 + 1] * sp + S.FC[cb + f * 3 + 2] * ccp;
      S.faceIdx[fc] = i * 5 + f;
      S.faceOrder[fc] = fc;
      fc++;
    }
  }
  S.faceOrder.length = fc;
  S.faceOrder.sort(S.byFaceDepth);

  for(let k = 0; k < fc; k++){
    const q = S.faceIdx[S.faceOrder[k]], i = (q / 5) | 0, f = q % 5;
    const b = i * 12;
    const x0 = pts[b] * s + ox, x1 = pts[b + 1] * s + ox,
          x2 = pts[b + 2] * s + ox, x3 = pts[b + 3] * s + ox;
    const y0 = pts[b + 4] * s + oy, y1 = pts[b + 5] * s + oy,
          y2 = pts[b + 6] * s + oy, y3 = pts[b + 7] * s + oy,
          y4 = pts[b + 8] * s + oy, y5 = pts[b + 9] * s + oy,
          y6 = pts[b + 10] * s + oy, y7 = pts[b + 11] * s + oy;
    ctx.fillStyle = S.cols[i][f];
    ctx.beginPath();
    switch(f){
      case 0: ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y6); ctx.lineTo(x1, y5); break;
      case 1: ctx.moveTo(x0, y0); ctx.lineTo(x3, y3); ctx.lineTo(x3, y7); ctx.lineTo(x0, y4); break;
      case 2: ctx.moveTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x3, y7); ctx.lineTo(x2, y6); break;
      case 3: ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, y5); ctx.lineTo(x0, y4); break;
      default: ctx.moveTo(x0, y4); ctx.lineTo(x1, y5); ctx.lineTo(x2, y6); ctx.lineTo(x3, y7);
    }
    ctx.closePath();
    ctx.fill();
  }

  // time-of-day grade
  if(m.ta > 0.002){
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(" + (m.tint[0] | 0) + "," + (m.tint[1] | 0) + "," + (m.tint[2] | 0) + "," + m.ta.toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  // overcast: a real city's cloud cover flattens the light a little
  if(cloudAmt > 0.01){
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(150,159,172," + (0.20 * cloudAmt).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  // weather grade: rain darkens and cools, snow lifts and softens
  if(rainAmt > 0.01){
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(96,116,138," + (0.22 * rainAmt).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  if(snowAmt > 0.01){
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(196,214,230," + (0.045 * snowAmt).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  // stars (night, thinning out in rain and snow)
  const starA = m.night * (1 - rainAmt * 0.85) * (1 - snowAmt * 0.55);
  if(starA > 0.02){
    ctx.globalCompositeOperation = "lighter";
    for(let i = 0; i < stars.length; i++){
      const st = stars[i];
      const tw = 0.55 + 0.45 * Math.sin(now * 0.0011 + st.ph);
      ctx.globalAlpha = starA * st.a * tw;
      ctx.fillStyle = "#e8f0ff";
      ctx.fillRect(st.x * W, st.y * H, st.r * DPR, st.r * DPR);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // sun or moon halo
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);   // 6h 0, 12h 1, 18h 0
  const glowR = Math.min(W, H) * 0.42;
  ctx.globalCompositeOperation = "lighter";
  if(elev > 0){
    const sx = (0.06 + ((hour - 6) / 12) * 0.88) * W;
    const sy = H * (0.66 - elev * 0.46);
    const warm = clamp(1 - Math.abs(hour - 12) / 7, 0, 1);
    glow(ctx, sx, sy, glowR * 0.8, [255, 232, 178], 0.09 + 0.13 * warm);
    glow(ctx, sx, sy, Math.min(W, H) * 0.045, [255, 250, 232], 0.40);
  } else {
    const nightFrac = ((hour - 18 + 24) % 24) / 12;          // 0 at 18h, 1 at 6h
    const me = Math.sin(clamp(nightFrac, 0, 1) * Math.PI);
    if(me > 0.02){
      const sx = (0.06 + clamp(nightFrac, 0, 1) * 0.88) * W;
      const sy = H * (0.66 - me * 0.46);
      glow(ctx, sx, sy, glowR * 0.7, [180, 200, 235], 0.10 + 0.14 * me);
      glow(ctx, sx, sy, Math.min(W, H) * 0.030, [235, 242, 255], 0.42 * me);
    }
  }

  // lanterns
  const nightA = m.night;
  if(nightA > 0.10){
    for(let i = 0; i < S.lamps.length; i++){
      const L2 = S.lamps[i];
      const p = project(L2[0], L2[1], L2[2]);
      glow(ctx, p[0], p[1], s * 2.3 * L2[3], [255, 190, 112], 0.20 * nightA * L2[3]);
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function render(now, dt, active){
  const m = moodAt(hour);
  const s = Math.min(W, H) / S.fit * zoom;

  // rebuild the voxel layer only when something it depends on moved
  const moved = !cacheState || W !== cacheState.w || H !== cacheState.h ||
    Math.abs(yaw - cacheState.yaw) > 0.0006 || Math.abs(pitch - cacheState.pitch) > 0.0006 ||
    Math.abs(zoom - cacheState.zoom) > 0.002 || Math.abs(hour - cacheState.hour) > 0.02 ||
    Math.abs(rainAmt - cacheState.rain) > 0.02 || Math.abs(snowAmt - cacheState.snow) > 0.02 ||
    Math.abs(cloudAmt - cacheState.cloud) > 0.02;
  if(moved){
    drawSceneLayer(now);
    cacheState = { yaw, pitch, zoom, hour, rain: rainAmt, snow: snowAmt, cloud: cloudAmt, w: W, h: H };
  }

  // nothing on screen is moving (no weather, no fireflies, no zoom easing): keep the
  // last frame instead of blitting two full-screen images sixty times a second
  if(!moved && !active) return;

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(layer, 0, 0);

  // fireflies drift, so they stay out of the cached layer
  const nightA = m.night;
  if(nightA > 0.10){
    ctx.globalCompositeOperation = "lighter";
    for(let i = 0; i < flies.length; i++){
      const f = flies[i];
      const fx = (f.x + Math.sin(now * 0.00021 * f.sp + f.ph) * 0.045) * W;
      const fy = (f.y + Math.cos(now * 0.00017 * f.sp + f.ph * 1.7) * 0.03) * H;
      const a = nightA * (0.16 + 0.20 * Math.sin(now * 0.0013 * f.sp + f.ph));
      glow(ctx, fx, fy, s * 0.34, [255, 226, 150], a);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // weather particles
  if(rainAmt > 0.01){
    const bright = (m.top[0] + m.top[1] + m.top[2]) / 3;
    const col = bright > 140 ? "122,142,168" : "196,212,232";
    ctx.strokeStyle = "rgba(" + col + "," + (0.40 * rainAmt).toFixed(3) + ")";
    ctx.lineWidth = Math.max(1, DPR * 0.8);
    ctx.beginPath();
    for(let i = 0; i < rain.length; i++){
      const r = rain[i];
      const x = r.x * W, y = r.y * H, len = r.l * H, k = r.k * 0.1 * W;
      ctx.moveTo(x, y);
      ctx.lineTo(x - k, y + len);
    }
    ctx.stroke();
  }
  if(snowAmt > 0.01){
    ctx.fillStyle = "rgba(255,255,255," + (0.72 * snowAmt).toFixed(3) + ")";
    ctx.beginPath();
    for(let i = 0; i < snow.length; i++){
      const f = snow[i];
      const x = f.x * W, y = f.y * H, r = f.r * DPR;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 6.2832);
    }
    ctx.fill();
  }

  // vignette
  if(vignetteCv) ctx.drawImage(vignetteCv, 0, 0);
}

/* ------------------------------------------------------------------ update */
function updateWeather(dt){
  rainAmt += (rainTarget - rainAmt) * Math.min(1, dt * 1.4);
  snowAmt += (snowTarget - snowAmt) * Math.min(1, dt * 1.4);
  if(rainAmt < 0.002) rainAmt = rainTarget === 0 ? 0 : rainAmt;
  if(snowAmt < 0.002) snowAmt = snowTarget === 0 ? 0 : snowAmt;

  for(let i = 0; i < rain.length; i++){
    const r = rain[i];
    r.y += r.v * dt * 1.35;
    r.x -= r.k * dt * 0.55;
    if(r.y > 1.05){ r.y = -0.05; r.x = Math.random(); }
    if(r.x < -0.05) r.x = 1.05;
  }
  for(let i = 0; i < snow.length; i++){
    const f = snow[i];
    f.y += f.v * dt;
    f.x += Math.sin(f.ph + performance.now() * 0.0004) * f.amp * dt;
    if(f.y > 1.05){ f.y = -0.05; f.x = Math.random(); }
    if(f.x < -0.05) f.x = 1.05; else if(f.x > 1.05) f.x = -0.05;
  }
}

