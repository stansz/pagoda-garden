"use strict";

/* ------------------------------------------------------- framebuffer setup */
let cv = null, dctx = null;
let BW = 480, BH = 270, px = 3;            // art-pixel buffer + integer scale
let bx = 0, by = 0;                        // where the buffer sits on the canvas
let buf = null, bctx = null;               // the framebuffer we draw into
let frameCv = null, sillCv = null;         // window frame + sill dressing
let stars = [], rain = [], snow = [], drift = [], clouds = [], birds = [];
let scene = null;                          // current city's baked layers
// bake bookkeeping: the harness asserts a season change rebuilds the scene
// exactly once.  `scene` counts successful (non-cached) bakes, `hits` the
// cached calls, `byCity` splits them per city.
const bakeStats = { scene: 0, near: 0, hits: 0, byCity: {} };
let skyCv = null, skyBucket = -999;
let waterCv = null, waterCity = "";
let yW = 181;                              // waterline in art pixels
const PAD = 16;                            // extra art px each side of layers (parallax)

function allocate(bw, bh, pixel){
  BW = Math.max(160, Math.round(bw));
  BH = Math.max(120, Math.round(bh));
  px = Math.max(1, Math.round(pixel));
  yW = Math.round(BH * 0.665);

  buf  = makeCanvas(BW, BH);
  bctx = ctx2(buf);
  bctx.imageSmoothingEnabled = false;

  skyCv = makeCanvas(BW, BH);
  skyBucket = -999;
  waterCv = null; waterCity = "";

  frameCv = buildFrame();
  buildClouds();
  buildStars();
  buildParticles();
  buildScene(state.city);
  buildSill(state.city);
}

/* ------------------------------------------------------------------ sprites */
/* a tiny bitmap font of pixels: rows of characters, a colour map */
function drawBits(g, bits, map, x, y, scale){
  scale = scale || 1;
  for(let r = 0; r < bits.length; r++){
    const row = bits[r];
    for(let c = 0; c < row.length; c++){
      const ch = row[c];
      if(ch === "." || ch === " ") continue;
      const col = map[ch];
      if(!col) continue;
      R(g, x + c * scale, y + r * scale, scale, scale, col);
    }
  }
}
