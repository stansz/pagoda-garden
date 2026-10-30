"use strict";

/* ------------------------------------------------------------------ canvas */
const cv = document.getElementById("scene");
const ctx = cv.getContext("2d", { alpha: false });
let W = 0, H = 0, DPR = 1, vignette = null;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isFirefox = /firefox/i.test(navigator.userAgent);

// The expensive part of a frame is the ~830 voxel faces. They only change when the
// camera, the clock or the weather does, so they are painted into an offscreen layer
// and the animation loop just blits it and draws the moving bits on top.
const layer = document.createElement("canvas");
let lctx = layer.getContext("2d", { alpha: false });
let vignetteCv = null;
let cacheState = null;

function resize(){
  // Firefox's 2-D path filling is slower than Chromium's, so give it, and everyone
  // at high DPI, a slightly smaller backing store instead of 2x pixels.
  DPR = Math.min(window.devicePixelRatio || 1, isFirefox ? 1.25 : 1.5);
  W = cv.width  = Math.max(1, Math.floor(innerWidth  * DPR));
  H = cv.height = Math.max(1, Math.floor(innerHeight * DPR));
  cv.style.width  = innerWidth  + "px";
  cv.style.height = innerHeight + "px";
  layer.width = W; layer.height = H;
  lctx = layer.getContext("2d", { alpha: false });

  vignetteCv = document.createElement("canvas");
  vignetteCv.width = W; vignetteCv.height = H;
  const vg = vignetteCv.getContext("2d");
  const vgrad = vg.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22,
                                        W / 2, H / 2, Math.max(W, H) * 0.75);
  vgrad.addColorStop(0, "rgba(0,0,0,0)");
  vgrad.addColorStop(1, "rgba(5,9,13,0.45)");
  vg.fillStyle = vgrad;
  vg.fillRect(0, 0, W, H);

  cacheState = null;
  seedParticles();
}
addEventListener("resize", resize);

/* ------------------------------------------------------------------- world */
// The garden is voxels from one small vocabulary: a 22x22 plot, water, a path,
// trees and the pagoda. Its arrays and its camera fit are derived once, at load.
const COL = {
  grassA:"#68a84c", grassB:"#74b855",
  stone:"#969599", stoneTop:"#a5a4a9", path:"#a39c8d",
  water:"#2e6f9f", lily:"#3e8f4f", flower:"#e881a6",
  wall:"#efe6cf", roof:"#8a2f26", gold:"#d6b03c", door:"#46302a",
  trunk:"#6d4a2f", leaf:"#3d7b36", leaf2:"#4c9044"
};

// faces: 0 +x, 1 -x, 2 +z, 3 -z, 4 top; fixed light so both sides read from any angle
// (the -z normal used to be 0, which hid every -z face: the neighbour probe hit the
//  cube itself and the back-face test read 0 <= 0)
const NX = [1, -1, 0, 0, 0];
const NY = [0, 0, 0, 0, 1];
const NZ = [0, 0, 1, -1, 0];
const FB = [0.84, 0.60, 0.72, 0.52, 1.00];
const shadeCache = new Map();

function shade(col, f){
  const key = col + "|" + f;
  let str = shadeCache.get(key);
  if(str === undefined){
    const b = FB[f];
    str = "rgb(" + Math.round(Math.min(255, parseInt(col.slice(1, 3), 16) * b)) + "," +
                  Math.round(Math.min(255, parseInt(col.slice(3, 5), 16) * b)) + "," +
                  Math.round(Math.min(255, parseInt(col.slice(5, 7), 16) * b)) + ")";
    shadeCache.set(key, str);
  }
  return str;
}

// `build` fills the voxel list; the plot is then centred and fitted to the screen.
function makeScene(name, lamps, build){
  const vox = [], seen = new Set();
  const put = (x, y, z, c) => {
    const k = x + "," + y + "," + z;
    if(!seen.has(k)){ seen.add(k); vox.push([x, y, z, c]); }
  };
  const rep = (x, y, z, c) => {
    for(let i = 0; i < vox.length; i++){
      const v = vox[i];
      if(v[0] === x && v[1] === y && v[2] === z){ v[3] = c; return; }
    }
  };
  build({ put, rep });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for(const v of vox){
    if(v[0] < minX) minX = v[0];
    if(v[0] > maxX) maxX = v[0];
    if(v[1] < minY) minY = v[1];
    if(v[1] > maxY) maxY = v[1];
    if(v[2] < minZ) minZ = v[2];
    if(v[2] > maxZ) maxZ = v[2];
  }
  const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2, cz = (minZ + maxZ + 1) / 2;
  const extX = maxX + 1 - minX, extY = maxY + 1 - minY, extZ = maxZ + 1 - minZ;
  const fit = Math.max(extX, extZ, extY * 1.35) + 6;

  const n = vox.length;
  const pos = new Float64Array(n * 6);
  const occ = new Uint8Array(n);
  const cols = new Array(n);
  for(let i = 0; i < n; i++){
    const v = vox[i], j = i * 6;
    pos[j]     = v[0] - cx;  pos[j + 1] = v[0] + 1 - cx;
    pos[j + 2] = v[1] - cy;  pos[j + 3] = v[1] + 1 - cy;
    pos[j + 4] = v[2] - cz;  pos[j + 5] = v[2] + 1 - cz;

    const cl = [];
    for(let f = 0; f < 5; f++) cl.push(shade(v[3], f));
    cols[i] = cl;

    let m = 0;
    for(let f = 0; f < 5; f++){
      if(seen.has((v[0] + NX[f]) + "," + (v[1] + NY[f]) + "," + (v[2] + NZ[f]))) m |= (1 << f);
    }
    occ[i] = m;
  }

  const FC = new Float64Array(n * 15);
  for(let i = 0; i < n; i++){
    const j = i * 6, b = i * 15;
    const X0 = pos[j], X1 = pos[j + 1], Y0 = pos[j + 2], Y1 = pos[j + 3], Z0 = pos[j + 4], Z1 = pos[j + 5];
    const xm = (X0 + X1) * 0.5, ym = (Y0 + Y1) * 0.5, zm = (Z0 + Z1) * 0.5;
    FC[b]      = X1; FC[b + 1]  = ym; FC[b + 2]  = zm;
    FC[b + 3]  = X0; FC[b + 4]  = ym; FC[b + 5]  = zm;
    FC[b + 6]  = xm; FC[b + 7]  = ym; FC[b + 8]  = Z1;
    FC[b + 9]  = xm; FC[b + 10] = ym; FC[b + 11] = Z0;
    FC[b + 12] = xm; FC[b + 13] = Y1; FC[b + 14] = zm;
  }

  const pts = new Float64Array(n * 12);
  const faceIdx = new Int32Array(n * 5);
  const faceDepth = new Float64Array(n * 5);
  const faceOrder = new Array(n * 5);
  for(let k = 0; k < n * 5; k++) faceOrder[k] = k;

  return {
    name, lamps: lamps || [], vox, n, pos, occ, cols, FC, pts, faceIdx, faceDepth, faceOrder,
    cx, cy, cz, fit, byFaceDepth: (a, b) => faceDepth[a] - faceDepth[b]
  };
}

/* ------------------------------------------------------------ garden pieces */
function plot(P, opts){
  const { water, path, g1, g2, edge } = opts;
  const tileKey = p => p[0] + "," + p[1];
  const waterSet = new Set(water.map(tileKey)), pathSet = new Set(path.map(tileKey));
  for(let x = 0; x < 22; x++){
    for(let z = 0; z < 22; z++){
      const k = x + "," + z;
      if(waterSet.has(k)){ P.put(x, 0, z, COL.water); continue; }
      if(pathSet.has(k)){ P.put(x, 0, z, edge || COL.path); continue; }
      P.put(x, 0, z, ((x + z) & 1) ? g1 : g2);
    }
  }
}
const box = (x0, z0, x1, z1) => {
  const out = [];
  for(let x = x0; x <= x1; x++) for(let z = z0; z <= z1; z++) out.push([x, z]);
  return out;
};

// the pagoda, on its two-layer stone platform
function pagoda(P, roof, wall, gold){
  for(let x = 12; x <= 18; x++) for(let z = 12; z <= 18; z++){
    P.put(x, 1, z, COL.stone);
    P.put(x, 2, z, COL.stoneTop);
  }
  P.put(15, 1, 11, COL.stoneTop);
  for(let y = 3; y <= 4; y++) for(let x = 13; x <= 17; x++) for(let z = 13; z <= 17; z++) P.put(x, y, z, wall);
  for(let x = 12; x <= 18; x++) for(let z = 12; z <= 18; z++) P.put(x, 5, z, roof);
  for(let y = 6; y <= 7; y++) for(let x = 14; x <= 17; x++) for(let z = 14; z <= 17; z++) P.put(x, y, z, wall);
  for(let x = 13; x <= 18; x++) for(let z = 13; z <= 18; z++) P.put(x, 8, z, roof);
  for(let y = 9; y <= 10; y++) for(let x = 14; x <= 16; x++) for(let z = 14; z <= 16; z++) P.put(x, y, z, wall);
  for(let x = 13; x <= 17; x++) for(let z = 13; z <= 17; z++) P.put(x, 11, z, roof);
  P.put(15, 12, 15, gold); P.put(15, 13, 15, gold);
  P.rep(13, 3, 15, COL.door); P.rep(13, 4, 15, COL.door);
}

function leafyTree(P, x, z, c1, c2){
  P.put(x, 1, z, COL.trunk); P.put(x, 2, z, COL.trunk); P.put(x, 3, z, COL.trunk);
  for(let dx = -1; dx <= 1; dx++) for(let dz = -1; dz <= 1; dz++){
    P.put(x + dx, 4, z + dz, c1);
    if(!(dx && dz)) P.put(x + dx, 5, z + dz, c2);
  }
  P.put(x, 6, z, c1);
}
/* ----------------------------------------------------------------- garden */
const GARDEN_LAMPS = [[12.55, 3.6, 15.0, 1.30], [12.9, 1.4, 11.2, 0.70], [10.4, 0.9, 5.0, 0.55], [9.4, 0.9, 8.0, 0.55]];

function buildGarden(P){
  const path = [[9,1],[9,2],[10,3],[10,4],[10,5],[9,6],[9,7],[9,8],[10,9],[11,10],[12,11],[13,11],[14,11],[15,11],[16,11]];
  plot(P, { water: box(3, 4, 7, 8), path, g1: COL.grassA, g2: COL.grassB });
  [[4,5],[6,6],[6,4],[4,8],[7,7]].forEach(p => P.put(p[0], 1, p[1], COL.lily));
  [[4,5],[6,6]].forEach(p => P.put(p[0], 2, p[1], COL.flower));
  leafyTree(P, 2, 13, COL.leaf, COL.leaf2);
  leafyTree(P, 6, 17, COL.leaf, COL.leaf2);
  leafyTree(P, 19, 5, COL.leaf, COL.leaf2);
  leafyTree(P, 17, 2, COL.leaf, COL.leaf2);
  pagoda(P, COL.roof, COL.wall, COL.gold);
}

function gardenScene(extra){
  return makeScene("Garden", GARDEN_LAMPS, P => { buildGarden(P); if(extra) extra(P); });
}
let S = gardenScene();

/* ------------------------------------------------------------------ camera */
let yaw = 3.86, pitch = 0.52;
let zoom = 1, zoomTarget = 1;
const ZOOM_MIN = 0.55, ZOOM_MAX = 2.6;
let dragging = false, lx = 0, ly = 0, vel = 0, lastTouch = 0;
const cam = { ca: 1, sa: 0, cp: 1, sp: 0, ssp: 0, csp: 0, s: 1, ox: 0, oy: 0 };

const lerp = (a, b, t) => a + (b - a) * t;

