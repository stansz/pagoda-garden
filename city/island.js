"use strict";

/* =========================================================================
   The garden: the one thing every city shares.  A little island in the
   near-left corner with a three-tier pagoda, two trees, a stone lantern and a
   path.  It is painted into the near layer at a fixed screen position, so it
   reads as the anchor and the city stays the backdrop.  It is deliberately
   season-blind: the pagoda island is the constant, the city tree is the season.
   ========================================================================= */
const GARDEN = {
  wall: "#efe7d2", wallShade: "#b9ad94", roof: "#8e3328", roofDark: "#5d2119",
  gold: "#d8b24a", wood: "#3f2c26", leaf: "#2f4a33", leafHi: "#436548",
  leafDark: "#1d2c22", earth: "#3a2f28", stone: "#8b948f", stoneDark: "#4b5452",
  lit: "#ffcf8a"
};

function gardenConifer(g, x, baseY, h){
  const half = Math.max(3, Math.round(h * 0.30));
  for(let r = 0; r < h; r++){
    const t = r / h;
    const w = Math.max(1, Math.round(half * t * 2));
    R(g, x - w / 2, baseY - r, w, 1, (r & 3) === 0 ? GARDEN.leafHi : GARDEN.leaf);
  }
  R(g, x - 1, baseY, 2, 3, GARDEN.wood);
}

function gardenCanopy(g, x, baseY, r){
  R(g, x, baseY - 9, 1, 9, GARDEN.wood);
  blob(g, x, baseY - 9 - Math.round(r * 0.75), r, Math.round(r * 0.8), GARDEN.leaf, GARDEN.leafHi);
  blob(g, x + 4, baseY - 9 - Math.round(r * 0.35), Math.round(r * 0.6), Math.round(r * 0.5), GARDEN.leafDark, null);
}

function gardenTier(s, g, x, yBase, bodyW, bodyH, eaveW){
  R(g, x, yBase - bodyH, bodyW, bodyH, GARDEN.wall);
  R(g, x, yBase - bodyH, 2, bodyH, GARDEN.wallShade);
  R(g, x + bodyW - 1, yBase - bodyH, 1, bodyH, GARDEN.wood);
  R(g, x + bodyW - 2, yBase - 2, 1, 2, GARDEN.wood);
  // dark shoji panels; the warm pixels are live, drawn only at night
  const winW = Math.max(2, Math.round(bodyW * 0.24));
  for(let i = 0; i < 2; i++)
    R(g, x + 4 + i * (bodyW - winW - 8), yBase - bodyH + 4, winW, bodyH - 7, GARDEN.wood);
  const ex = x + Math.round((bodyW - eaveW) / 2);
  R(g, ex, yBase - bodyH - 3, eaveW, 3, GARDEN.roof);
  R(g, ex, yBase - bodyH - 3, eaveW, 1, lighten(GARDEN.roof, 0.18));
  R(g, ex - 1, yBase - bodyH - 4, 3, 1, GARDEN.roofDark);
  R(g, ex + eaveW - 2, yBase - bodyH - 4, 3, 1, GARDEN.roofDark);
  R(g, ex - 1, yBase - bodyH - 3, 1, 3, GARDEN.roofDark);
  R(g, ex + eaveW, yBase - bodyH - 3, 1, 3, GARDEN.roofDark);
  R(g, ex + Math.round(eaveW / 2) - 1, yBase - bodyH - 3, 2, 1, GARDEN.gold);
  for(let i = 0; i < 2; i++)
    addWin(s, "near", x + 4 + i * (bodyW - winW - 8), yBase - bodyH + 4, winW, bodyH - 7, GARDEN.lit, 1.25);
}

function buildGarden(s){
  const g = s.near;
  const cx = Math.round(PAD + s.BW * 0.215);
  const base = s.BH + 6;                       // runs off the bottom of the frame
  const mound = 30;

  // a low, wet bank coming in from the left edge
  for(let x = -14; x < cx + 44; x++){
    const h = Math.round(9 + 3 * Math.sin(x * 0.055) + (x > cx ? 4 : 0));
    R(g, x, base - h, 1, h + 5, GARDEN.earth);
    R(g, x, base - h, 1, 1, GARDEN.leafDark);
    if((x & 7) === 0) R(g, x, base - h - 1, 1, 1, GARDEN.leaf);
  }
  // the island: rock at the waterline, moss above
  for(let r = 0; r < mound; r++){
    const t = r / (mound - 1);
    const halfW = Math.round(76 - 33 * Math.pow(t, 0.75));
    const col = r < 4 ? GARDEN.earth : (r % 9 === 3 ? GARDEN.leafHi : GARDEN.leaf);
    R(g, cx - halfW, base - r, halfW * 2, 1, col);
    if(r > 5 && r % 5 === 0) R(g, cx - halfW + 7, base - r, 3, 1, GARDEN.leafDark);
    if(r > 5 && r % 7 === 2) R(g, cx + halfW - 9, base - r, 2, 1, GARDEN.leafDark);
  }
  const topY = base - mound;

  gardenConifer(g, cx - 48, topY + 7, 34);
  gardenCanopy(g, cx + 44, topY + 6, 13);
  gardenCanopy(g, cx + 58, topY + 5, 9);

  // stone lantern
  R(g, cx - 27, topY - 4, 1, 5, GARDEN.stoneDark);
  R(g, cx - 29, topY - 7, 5, 3, GARDEN.stone);
  R(g, cx - 29, topY - 7, 5, 1, lighten(GARDEN.stone, 0.2));
  R(g, cx - 28, topY - 6, 3, 1, GARDEN.wood);
  addWin(s, "near", cx - 28, topY - 6, 3, 1, GARDEN.lit, 1.1);

  // path up from the left of the island
  for(let i = 0; i < 5; i++) R(g, cx - 54 + i * 5, topY + 12 - i * 2, 4, 1, GARDEN.stoneDark);

  // the pagoda itself: platform, three shrinking tiers, gold finial
  const px0 = cx - 13;
  R(g, px0 - 9, topY - 5, 44, 5, GARDEN.stone);
  R(g, px0 - 9, topY - 5, 44, 1, lighten(GARDEN.stone, 0.18));
  R(g, px0 - 9, topY - 1, 44, 1, GARDEN.stoneDark);
  gardenTier(s, g, px0, topY - 5, 26, 14, 40);
  gardenTier(s, g, px0 + 3, topY - 22, 20, 11, 32);
  gardenTier(s, g, px0 + 6, topY - 33, 14, 9, 24);
  R(g, px0 + 12, topY - 50, 2, 6, GARDEN.gold);
  R(g, px0 + 10, topY - 47, 6, 1, GARDEN.gold);
  R(g, px0 + 11, topY - 51, 4, 1, GARDEN.roofDark);
}
/* ------------------------------------------------------------ assemble one */
/* Baked once per (city, season, buffer size) and cached: the only things that
   are season-dependent are the tree crowns (near/mid layers) and the drift
   colours (a per-frame table lookup), so a season rollover is exactly one
   rebuild — the same cost as switching city. */
function buildScene(id, season){
  const city = cityRecord(id);
  const sea = season || state.season;
  if(scene && scene.id === city.id && scene.season === sea && scene.BW === BW && scene.BH === BH){
    bakeStats.hits++;
    return scene;
  }
  const rnd = mulberry32(city.seed);
  const LW = BW + PAD * 2;
  const farC = makeCanvas(LW, BH), midC = makeCanvas(LW, BH), nearC = makeCanvas(LW, BH);
  const pal = city.palette;
  const s = {
    id: city.id, city, pal, rnd, LW, BH, BW, PAD,
    season: sea,                                  // which crown this bake holds
    wcol: {
      hi: pal.waterHi || pal.canalHi || pal.lagoonHi,
      mid: pal.water || pal.canal || pal.lagoon,
      lo: pal.waterLo || pal.canalLo || pal.lagoonLo || pal.water
    },
    yW, cx: PAD + BW / 2,
    farC, midC, nearC,
    far: ctx2(farC), mid: ctx2(midC), near: ctx2(nearC),
    windows: [], props: [], lights: [], extra: {},
    treeInfo: null, treeEmitters: [], treeSnow: null
  };
  (BUILD[city.landmark] || BUILD.vancouver)(s);
  buildTree(s, sea);            // the seasonal source tree, on top of the landmark
  buildGarden(s);               // the constant island, drawn last so it anchors
  scene = s;
  bakeStats.scene++;
  bakeStats.near++;
  bakeStats.byCity[city.id] = (bakeStats.byCity[city.id] || 0) + 1;
  seedDrift(s.treeEmitters);    // put the pool under the new crown, not mid-air
  return s;
}

/* ----------------------------------------------------- sill dressing per city */
function buildSill(key){
  sillCv = null;
  const c = makeCanvas(BW, BH), g = ctx2(c);
  if(key === "amsterdam"){
    // a window box of tulips on the sill
    const bx = BW - 150, by = BH - 15;
    R(g, bx, by, 74, 11, "#3a2a22");
    R(g, bx, by, 74, 2, "#57402f");
    R(g, bx, by + 11, 74, 1, "#241812");
    const cols = ["#d24b6a", "#e8b23c", "#c85a9a", "#e2603f", "#d24b6a", "#e8b23c", "#c85a9a"];
    for(let i = 0; i < 11; i++){
      const tx = bx + 4 + i * 6.4;
      R(g, tx + 1, by - 7, 1, 7, "#3f5a35");
      R(g, tx, by - 11, 3, 3, "#4d6b46");
      R(g, tx + 1, by - 10, 1, 1, cols[i % cols.length]);
      R(g, tx, by - 9, 1, 1, cols[i % cols.length]);
      R(g, tx + 2, by - 9, 1, 1, "#e9ddc6");
    }
  } else if(key === "toronto"){
    // a couple of maple leaves blown onto the sill
    const bits = ["..#..", ".###.", "#####", ".###.", "..#.."];
    drawBits(g, bits, { "#": "#c07a2c" }, BW - 118, BH - 9);
    drawBits(g, bits, { "#": "#a8452a" }, BW - 104, BH - 7);
    drawBits(g, bits, { "#": "#d89a34" }, BW - 111, BH - 5);
  } else if(key === "hawaii"){
    const bits = [".###.", "#####", "#####", ".###."];
    drawBits(g, bits, { "#": "#e0576f" }, BW - 126, BH - 12);
    R(g, BW - 124, BH - 9, 1, 1, "#f2e6d0");
  } else if(key === "hongkong"){
    R(g, BW - 132, BH - 12, 8, 7, "#e0303a");
    R(g, BW - 132, BH - 12, 8, 1, "#ff6a4a");
    R(g, BW - 133, BH - 13, 10, 1, "#2b2320");
    R(g, BW - 129, BH - 5, 2, 2, "#d8a552");
  } else if(key === "vancouver"){
    // rain beads on the sill
    for(let i = 0; i < 7; i++) R(g, BW - 146 + i * 9, BH - 8 + (i % 2) * 2, 1, 1, "#9fc2c8");
  } else if(key === "sydney"){
    // a few jacaranda petals and a scrap of white sail
    drawBits(g, ["..#..", ".###.", "#####", ".###."], { "#": "#8b7fbd" }, BW - 138, BH - 13);
    drawBits(g, ["..#..", ".##..", "###..", "####."], { "#": "#f2efe3" }, BW - 124, BH - 12);
    R(g, BW - 121, BH - 8, 1, 1, "#cfc9b8");
  }
  sillCv = c;
}
