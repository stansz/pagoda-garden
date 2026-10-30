"use strict";

/* =========================================================================
   The source trees.  One species per city is specified on the city record
   (city.tree) and baked into the near or mid layer with four seasonal crowns;
   the same bake returns the crown emitter points the drift layer falls from.
   Silhouette first: a trunk and a crown mass have to read at 480x270, colour
   comes second from PAL[city].tree[season].

   The winter crown is bare branches.  Its settled-snow pass is baked into a
   small sprite canvas (`scene.treeSnow`) so a live snowfall can fade it in
   with one drawImage, without a re-bake when the weather changes.
   ========================================================================= */
const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
const TREE_REF_W = 480;                // tree specs are authored at this buffer width

function treeRnd(seed, season){
  return mulberry32(seed * 131 + SEASON_ORDER.indexOf(season) * 977 + 7);
}
function unionBox(a, b){
  if(!a) return b; if(!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/* a 1px line primitive: the only way to draw a branch, and cheap */
function branchSeg(g, x0, y0, x1, y1, thick, col){
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for(let i = 0; i <= steps; i++){
    const t = i / steps;
    R(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick, 1, col);
  }
}

/* one crown cluster: base colour, lit top-left, shaded foot, a few flecks —
   enough shading to read as a canopy instead of a flat disc */
function crownCluster(g, cx, cy, rx, ry, cols){
  const spans = [];
  for(let y = -ry; y <= ry; y++){
    const t = y / (ry + 0.5);
    const halfW = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if(halfW <= 0) continue;
    spans.push([y, halfW]);
    R(g, cx - halfW, cy + y, halfW * 2, 1, cols.c);
  }
  for(let i = 0; i < spans.length; i++){
    const y = spans[i][0], halfW = spans[i][1];
    if(y > -ry * 0.18) break;
    if(halfW > 2) R(g, cx - halfW + 1, cy + y, Math.max(1, Math.round(halfW * 1.4)), 1, cols.hi);
  }
  for(let i = 0; i < spans.length; i++){
    const y = spans[i][0], halfW = spans[i][1];
    if(y < ry * 0.42) continue;
    if(halfW > 1) R(g, cx - halfW + 1, cy + y, Math.max(1, halfW), 1, cols.lo);
  }
  for(let k = 0; k < 5; k++){                    // deterministic leaf flecks
    const a = k * 2.399, rr = Math.sqrt((k + 0.5) / 5);
    R(g, cx + Math.round(Math.cos(a) * rx * rr * 0.8),
         cy + Math.round(Math.sin(a) * ry * rr * 0.8), 1, 1, (k & 1) ? cols.hi : cols.lo);
  }
}

/* the crown's cluster layout, per silhouette.  Returns float boxes so the
   caller can derive both the art and the emitter/crown bounds from one list.
   `form` here is already scaled to the current buffer width.  Five clusters
   stacked around a taller main lobe, so the mass reads round-ish instead of as
   a flat mushroom. */
function crownClusters(form, crown){
  const rx = Math.max(4, (form.w || 24) * (crown.w == null ? 1 : crown.w) * 0.5);
  const ry = Math.max(4, (form.h || 15) * (crown.h == null ? 1 : crown.h) * 0.5);
  const shape = form.shape || "broad";
  const list = [];
  if(shape === "tall"){
    list.push([0, ry * 0.20, rx * 0.80, ry * 0.95]);
    list.push([-rx * 0.38, ry * 0.52, rx * 0.62, ry * 0.66]);
    list.push([rx * 0.36, ry * 0.42, rx * 0.60, ry * 0.62]);
    list.push([0, -ry * 0.55, rx * 0.72, ry * 0.78]);
    list.push([-rx * 0.20, -ry * 0.05, rx * 0.55, ry * 0.55]);
  } else if(shape === "shrub"){
    list.push([0, ry * 0.10, rx * 0.95, ry * 0.90]);
    list.push([-rx * 0.68, ry * 0.30, rx * 0.62, ry * 0.70]);
    list.push([rx * 0.68, ry * 0.26, rx * 0.62, ry * 0.68]);
    list.push([-rx * 0.20, -ry * 0.55, rx * 0.66, ry * 0.62]);
    list.push([rx * 0.24, -ry * 0.50, rx * 0.60, ry * 0.60]);
  } else {
    list.push([0, ry * 0.12, rx * 0.85, ry * 0.92]);
    list.push([-rx * 0.62, ry * 0.26, rx * 0.62, ry * 0.70]);
    list.push([rx * 0.62, ry * 0.20, rx * 0.60, ry * 0.68]);
    list.push([-rx * 0.30, -ry * 0.55, rx * 0.60, ry * 0.66]);
    list.push([rx * 0.32, -ry * 0.58, rx * 0.58, ry * 0.62]);
  }
  return { list, rx, ry };
}

/* blossom / flower dots scattered inside the crown ellipse */
function crownDots(g, cx, cy, rx, ry, dot, n, rnd){
  for(let k = 0; k < n; k++){
    const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * 0.86;
    const x = Math.round(cx + Math.cos(a) * rx * rr);
    const y = Math.round(cy + Math.sin(a) * ry * rr);
    R(g, x, y, rnd() < 0.35 ? 2 : 1, 1, dot);
  }
}

/* one trunk (+ crown or bare limbs).  bx/baseY are buffer coords; the layer
   canvases are PAD px wider, so drawing happens at bx + PAD. */
function drawOneTree(s, g, bx, by, h, scale, form, crown, cols, treeCol, rnd){
  const X = bx + PAD;
  const lean = form.lean || 0;
  const fw = (form.w || 24) * scale, fh = (form.h || 15) * scale;
  const { list, rx, ry } = crownClusters({ shape: form.shape, w: fw, h: fh }, crown);
  const lift = crown.lift == null ? 0.5 : crown.lift;
  const cx = X, cy = by - h - Math.round(ry * lift);
  const emitters = [], snowPts = [], tips = [];
  let box, crownBox = null;

  // root flare
  R(g, X - 3, by - 2, 7, 2, treeCol.trunk);
  R(g, X - 2, by - 4, 5, 2, treeCol.trunk);
  R(g, X - 1, by - 6, 3, 2, treeCol.trunk);

  if(form.shape === "shrub"){
    // a shrub is multi-stemmed: three stems fan out of the same root
    branchSeg(g, X, by - 2, X - Math.round(rx * 0.55), cy + Math.round(ry * 0.42), 1, treeCol.trunk);
    branchSeg(g, X, by - 2, X + Math.round(rx * 0.55), cy + Math.round(ry * 0.36), 1, treeCol.trunk);
    branchSeg(g, X, by - 2, X + Math.round(lean), cy + Math.round(ry * 0.10), 2, treeCol.trunk);
  } else {
    // trunk: 3px at the foot tapering to 1px at the fork, lit right arris
    for(let r = 0; r <= h; r++){
      const t = r / Math.max(1, h);
      const dx = Math.round(lean * t * t);
      const w = t < 0.48 ? 3 : t < 0.84 ? 2 : 1;
      R(g, X + dx, by - r, w, 1, treeCol.trunk);
      if(w > 1) R(g, X + dx + w - 1, by - r, 1, 1, treeCol.branch);
    }
  }
  const forkX = X + Math.round(lean), forkY = by - h;

  if(crown.bare){
    // ---- bare winter: five main limbs, each forking three times into 1px twigs
    const bry = Math.max(10, Math.round(fh * 1.55));
    let minX = X - 3, maxX = X + 3, minY = forkY;
    const grow = (x0, y0, ang, len, thick, depth) => {
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 - Math.sin(ang) * len;
      branchSeg(g, x0, y0, x1, y1, thick, depth > 0 ? treeCol.branch : treeCol.trunk);
      minX = Math.min(minX, x1); maxX = Math.max(maxX, x1); minY = Math.min(minY, y1);
      snowPts.push([x1, y1]);
      if(depth <= 0){ tips.push([x1, y1]); return; }
      grow(x1, y1, ang + 0.38 + rnd() * 0.24, len * 0.62, 1, depth - 1);
      grow(x1, y1, ang - 0.36 - rnd() * 0.24, len * 0.62, 1, depth - 1);
    };
    for(let i = 0; i < 5; i++){
      const ang = Math.PI / 2 + (i - 2) * 0.44 + (rnd() - 0.5) * 0.16;
      grow(forkX, forkY + 1, ang, bry * (i === 2 ? 0.52 : 0.44), i === 2 ? 2 : 1, 3);
    }
    // a bare-ish species may keep a couple of tufts (Sydney's jacaranda)
    if(crown.tuft){
      for(let k = 0; k < crown.tuft && tips.length; k++){
        const tp = tips[(k * 7 + 1) % tips.length];
        R(g, tp[0] - 1, tp[1] - 1, 3, 2, cols.c);
        R(g, tp[0] - 1, tp[1] - 1, 2, 1, cols.hi);
      }
    }
    // 2-3 branch tips are the winter emitters (unused today: every winter
    // drift spec is null, but the tree stays a legal source)
    const sorted = tips.slice().sort((a, b) => a[0] - b[0]);
    const picks = sorted.length > 2 ? [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]] : sorted;
    for(let i = 0; i < picks.length; i++)
      emitters.push({ x: Math.round(picks[i][0] - PAD), y: Math.round(picks[i][1]), spread: 2 });
    box = { x: Math.round(minX - PAD) - 2, y: Math.round(minY) - 2,
            w: Math.round(maxX - minX) + 5, h: Math.round(by - minY) + 4 };
    crownBox = box;
  } else {
    // ---- crowned seasons: a cluster mass sitting on the fork
    if(form.shape !== "shrub"){
      // two limbs up into the crown, and two lower side limbs whose tips peek
      // out below the skirt (a tree, not a lollipop)
      branchSeg(g, forkX, forkY, cx - rx * 0.30, cy + ry * 0.55, 2, treeCol.branch);
      branchSeg(g, forkX, forkY, cx + rx * 0.28, cy + ry * 0.50, 2, treeCol.branch);
      branchSeg(g, forkX, forkY + 1, cx - rx * 1.02, cy + ry * 1.00, 1, treeCol.trunk);
      branchSeg(g, forkX, forkY + 1, cx + rx * 1.00, cy + ry * 0.94, 1, treeCol.trunk);
      branchSeg(g, forkX, forkY + 1, cx - rx * 0.55, cy + ry * 1.10, 1, treeCol.trunk);
    }
    let minX = X - 4, maxX = X + 4, minY = cy;
    // the two side lobes are painted in a half-shade so the mass has internal
    // edges without reading as separate grapes
    const sideCols = { c: mixCol(cols.c, cols.lo, 0.45), hi: cols.c, lo: cols.lo, dot: cols.dot };
    for(let i = 0; i < list.length; i++){
      const k = list[i];
      const bxc = cx + k[0], byc = cy + k[1];
      crownCluster(g, bxc, byc, k[2], k[3], (i === 1 || i === 2) ? sideCols : cols);
      minX = Math.min(minX, bxc - k[2]); maxX = Math.max(maxX, bxc + k[2]);
      minY = Math.min(minY, byc - k[3]);
    }
    // a few leaf clumps outside the ellipse so the silhouette is not a disc
    for(let k = 0; k < 9; k++){
      const a = k * 0.79 + rnd() * 0.5;
      const rr = 0.92 + rnd() * 0.18;
      const bx2 = cx + Math.cos(a) * rx * rr, by2 = cy + Math.sin(a) * ry * rr;
      R(g, bx2, by2, 1 + (k & 1), 1, (k & 1) ? cols.c : cols.lo);
      minX = Math.min(minX, bx2 - 1); maxX = Math.max(maxX, bx2 + 1);
      minY = Math.min(minY, by2); 
    }
    // sky holes: punch a few gaps so autumn reads as thinned-out
    if(crown.gap){
      const n = Math.round(4 + crown.gap * 12);
      for(let k = 0; k < n; k++){
        const gx = Math.round(cx + (rnd() * 2 - 1) * rx * 0.92);
        const gy = Math.round(cy + (rnd() * 2 - 1) * ry * 0.80);
        g.clearRect(gx, gy, 1 + Math.round(rnd() * 2), 1 + Math.round(rnd()));
      }
    }
    if(crown.dots && cols.dot) crownDots(g, cx, cy, rx * 0.96, ry * 0.94, cols.dot, crown.dots, rnd);
    // emitters: three points inside the crown mass (2-3 per tree as specified)
    const sp = Math.max(4, Math.round(rx * 0.50));
    emitters.push({ x: bx, y: Math.round(cy - ry * 0.45), spread: sp });
    emitters.push({ x: bx - Math.round(rx * 0.60), y: Math.round(cy + ry * 0.18), spread: sp });
    emitters.push({ x: bx + Math.round(rx * 0.56), y: Math.round(cy + ry * 0.12), spread: sp });
    box = { x: Math.round(minX - PAD) - 2, y: Math.round(minY) - 3,
            w: Math.round(maxX - minX) + 5, h: Math.round(by - minY) + 5 };
    crownBox = { x: Math.round(cx - rx * 1.45 - PAD), y: Math.round(cy - ry * 1.45),
                 w: Math.round(rx * 2.9), h: Math.round(ry * 2.9) };
  }
  return { box, crownBox, emitters, snowPts };
}

/* draw every trunk of the city's tree species for one season */
function buildTree(s, season){
  const spec = s.city.tree;
  const info = { kind: spec ? spec.kind : null, layer: spec ? spec.layer : null,
                 season, drawn: false, bare: false, trunks: [], emitters: [], box: null, crownBox: null };
  s.treeInfo = info;
  s.treeEmitters = [];
  s.treeSnow = null;
  if(!spec) return info;
  const scale = s.BW / TREE_REF_W;
  const xs = Array.isArray(spec.x) ? spec.x : [spec.x];
  const hs = Array.isArray(spec.h) ? spec.h : [spec.h];
  const crown = spec.crowns[season] || spec.crowns.summer;
  const treeCol = s.pal.tree || { trunk: "#3b2a20", branch: "#5b4534", snow: "#e9f1f2" };
  const cols = treeCol[season] || treeCol.summer || treeCol.spring;
  const g = spec.layer === "mid" ? s.mid : s.near;
  const rnd = treeRnd(s.city.seed, season);
  const snowPts = [];
  const boxes = [], crownBoxes = [];
  for(let i = 0; i < xs.length; i++){
    const bx = Math.round(xs[i] * s.BW);
    const by = Math.round(spec.baseY * s.BH);
    const h = Math.round((hs[i] == null ? hs[0] : hs[i]) * scale);
    const one = drawOneTree(s, g, bx, by, h, scale, spec.form || {}, crown, cols, treeCol, rnd);
    boxes.push(one.box);
    if(one.crownBox) crownBoxes.push(one.crownBox);
    info.trunks.push({ x: bx, baseY: by, h, box: one.box });
    for(let k = 0; k < one.emitters.length; k++) info.emitters.push(one.emitters[k]);
    for(let k = 0; k < one.snowPts.length; k++) snowPts.push(one.snowPts[k]);
    // a tree standing at the waterline gets a reflection in the water pass
    if(spec.baseY <= 0.70 && one.box)
      s.props.push({ g: spec.layer, x: one.box.x + PAD, w: one.box.w,
                     h: Math.min(30, Math.round(one.box.h * 0.45)), col: cols.lo });
  }
  let ub = null, cb = null;
  for(let i = 0; i < boxes.length; i++) ub = unionBox(ub, boxes[i]);
  for(let i = 0; i < crownBoxes.length; i++) cb = unionBox(cb, crownBoxes[i]);
  info.box = ub;
  info.crownBox = cb || ub;
  info.bare = !!crown.bare;
  info.drawn = info.trunks.length > 0;
  info.emitters = info.emitters.slice();
  s.treeEmitters = info.emitters.slice();

  // baked settled snow for the bare crown, kept as its own small sprite
  if(crown.bare && snowPts.length && ub){
    const sn = makeCanvas(Math.max(4, Math.round(ub.w)), Math.max(4, Math.round(ub.h)));
    const sg = ctx2(sn);
    for(let i = 0; i < snowPts.length; i++){
      if(i % 3) continue;                 // a hint of snow, not blossom
      R(sg, snowPts[i][0] - (ub.x + PAD), snowPts[i][1] - ub.y,
        1 + ((i % 6) === 0 ? 1 : 0), 1, treeCol.snow);
    }
    s.treeSnow = { cv: sn, x: ub.x, y: ub.y, layer: spec.layer };
  }
  return info;
}
