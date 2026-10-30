"use strict";

/* ------------------------------------------ Amsterdam: gables, canal, bridge */
BUILD.amsterdam = function(s){
  const p = s.pal, Y = s.yW, LW = s.LW, H = s.BH;
  const F = (x,y,w,h,c) => R(s.far, x, y, w, h, c);
  const M = (x,y,w,h,c) => R(s.mid, x, y, w, h, c);
  const N = (x,y,w,h,c) => R(s.near, x, y, w, h, c);
  const SX = x => Math.round(x) + PAD;               // buffer x -> near layer x

  // distant rooftops and a church spire, faded
  for(let x = -12; x < LW; x += 10){
    const h = 10 + Math.round(s.rnd() * 13);
    F(x, Y - h, 8, h + 2, p.brickD);
    F(x + 1, Y - h - 3, 5, 3, p.roofLo);
    if(s.rnd() < 0.4) F(x + 2, Y - h + 4, 1, 2, p.door);
  }
  const spx = Math.round(s.cx + 96);
  F(spx, Y - 54, 2, 54, p.brickD);
  F(spx - 4, Y - 44, 10, 8, p.brickD);
  F(spx - 2, Y - 58, 6, 4, p.brickD);
  F(spx - 1, Y - 62, 4, 4, p.roofLo);
  const hz = ditherBand(LW, 50, (x, y) =>
    bay(x, y + 5) < Math.round((y / 50) * 12) ? rgbA(p.brickD, 255) : null);
  s.far.globalAlpha = 0.46;
  s.far.drawImage(hz, 0, Y - 50);
  s.far.globalAlpha = 1;

  // the gabled row: six narrow houses with real gaps between them
  const row = [
    [-126, 26, 40, 0, p.brickA], [-98, 30, 50, 1, p.brickB],
    [-64, 24, 36, 2, p.brickC], [-36, 32, 54, 0, p.brickB],
    [0, 26, 42, 1, p.brickA],   [30, 24, 34, 2, p.brickD],
    [58, 30, 48, 0, p.brickC],  [92, 26, 38, 1, p.brickA]
  ];
  for(let i = 0; i < row.length; i++){
    const r = row[i];
    gableHouse(s, s.mid, Math.round(s.cx + r[0]), Y, r[1], r[2], r[4], p.roof, p.trim, p.door, r[3]);
  }
  // the two elms in the gable gaps are drawn by the tree system (city.tree)
  // after this builder, so their crown follows the season

  // near: a low bridge across the far end of the canal, arches in shadow
  const by0 = Y + 3, bh = 9;
  const arches = [52, 136, 220, 304, 388, 472];
  for(let r = 0; r < bh; r++){
    const openings = [];
    if(r >= 1){
      const q = (bh - 1 - r) / (bh - 2);
      const hw = Math.round(16 * Math.sqrt(Math.max(0, 1 - q * q)));
      if(hw > 0) for(let a = 0; a < arches.length; a++) openings.push([arches[a] - hw, arches[a] + hw]);
    }
    openings.sort((a, b) => a[0] - b[0]);
    let x = 0;
    for(let a = 0; a < openings.length; a++){
      if(openings[a][0] > x) N(x, by0 + r, openings[a][0] - x, 1, r < 1 ? darken(p.brickB, 0.6) : darken(p.brickB, 0.84));
      N(openings[a][0], by0 + r, openings[a][1] - openings[a][0], 1, r === 1 ? p.trim : p.canalLo);
      x = Math.max(x, openings[a][1]);
    }
    if(x < LW) N(x, by0 + r, LW - x, 1, r < 1 ? darken(p.brickB, 0.6) : darken(p.brickB, 0.84));
  }
  N(0, by0, LW, 1, p.brickD);                        // coping
  N(0, by0 + 1, LW, 1, darken(p.brickB, 0.55));
  N(0, by0 + bh - 1, LW, 1, p.roofLo);               // wet foot
  for(let x = 4; x < LW; x += 16) N(x, by0 - 7, 1, 7, p.trim);
  N(0, by0 - 8, LW, 1, p.trim);
  N(0, by0 - 7, LW, 1, darken(p.brickB, 0.5));

  // a houseboat and a loaded barge in the canal in front of the bridge
  const bx = SX(s.BW * 0.60), by = Y + 36;
  N(bx, by, 36, 4, p.roofLo);
  N(bx + 1, by, 36, 1, p.canalHi);
  N(bx + 3, by - 6, 24, 7, p.brickD);
  N(bx + 3, by - 6, 24, 1, p.trim);
  N(bx + 7, by - 4, 4, 3, p.door);
  N(bx + 13, by - 4, 4, 3, p.door);
  N(bx + 19, by - 4, 4, 3, p.door);
  N(bx + 27, by - 3, 6, 4, p.brickA);
  s.props.push({ g: "near", x: bx - PAD, w: 36, h: 9, col: p.brickD });
  const gx = SX(s.BW * 0.79), gy = Y + 48;
  N(gx, gy, 42, 3, p.roofLo);
  N(gx, gy, 42, 1, p.canalHi);
  N(gx + 4, gy - 4, 8, 4, p.trim);
  N(gx + 16, gy - 5, 12, 5, p.brickC);
  N(gx + 30, gy - 3, 6, 3, p.door);
};
