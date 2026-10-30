"use strict";

/* --------------------------------- Sydney: the sails and the arch over the harbour */
BUILD.sydney = function(s){
  const p = s.pal, Y = s.yW, LW = s.LW, H = s.BH;
  const F = (x,y,w,h,c) => R(s.far, x, y, w, h, c);
  const M = (x,y,w,h,c) => R(s.mid, x, y, w, h, c);
  const N = (x,y,w,h,c) => R(s.near, x, y, w, h, c);

  // ---- far: the north shore as a low blue-grey ridge under a sea haze
  const n1 = smoothNoise(s.rnd, LW, 3);
  for(let x = 0; x < LW; x++){
    const h = Math.round(10 + n1[x] * 6 + Math.sin(x * 0.019 + 2.2) * 4);
    if(h < 2) continue;
    F(x, Y - h, 1, h + 2, p.farHill);
    if((x & 3) === 0) F(x, Y - h, 1, 2, p.farHillHi);
    if((x & 31) === 7) F(x, Y - h - 4, 1, 4, p.farLo);      // the odd mast or roof
  }
  // a low far shore under the arch: roofs, and a window or two
  for(let x = -20; x < 356; x += 7){
    const h = 3 + Math.round(s.rnd() * 5);
    F(x, Y - h, 6, h + 2, p.farLo);
    if(s.rnd() < 0.4) F(x + 1, Y - h - 2, 4, 2, p.farHill);
    if(s.rnd() < 0.25) F(x + 2, Y - h + 1, 1, 1, p.win);
  }
  // the distant CBD behind the Opera House, pale and low so the sails read
  const cbd = [[296, 9, 20], [310, 12, 30], [326, 10, 24], [340, 14, 36],
               [358, 9, 20], [372, 12, 30], [390, 10, 24], [404, 13, 34],
               [420, 8, 18], [432, 11, 26], [450, 10, 22], [462, 12, 30]];
  for(let i = 0; i < cbd.length; i++){
    const t = cbd[i];
    // only the towers clear of the sails get lit windows: the window pass draws
    // after the grade, so a window behind an opaque sail would shine through it
    drawTower(s, "far", s.far, t[0], Y - 1, t[1], t[2],
              i % 3 === 0 ? p.tower : p.towerLo, p.towerHi, p.towerLo,
              darken(p.tower, 0.78), { winStep: 4, lit: t[0] >= 412 ? 0.24 : 0, litCol: p.win });
  }
  const hz = ditherBand(LW, 34, (x, y) =>
    bay(x, y + 4) < Math.round(Math.pow(y / 34, 1.3) * 11) ? rgbA(p.haze, 255) : null);
  s.far.globalAlpha = 0.44;
  s.far.drawImage(hz, 0, Y - 34);
  s.far.globalAlpha = 1;

  // ---- mid: the Harbour Bridge.  Deck runs off the left edge to a sandstone
  // abutment on the point; a steel arch and two granite pylons span the water.
  const deckY = Y - 36;
  const deckL = -24, deckR = 286;
  const archL = 36, archR = 262;
  const archMid = (archL + archR) / 2, archHalf = (archR - archL) / 2;
  const apexY = deckY - 50;
  const archYAt = x => {
    const d = (x - archMid) / archHalf;
    return Math.round(apexY + (deckY - apexY) * d * d);
  };
  M(deckL, deckY, deckR - deckL, 3, p.steel);               // deck
  M(deckL, deckY, deckR - deckL, 1, p.steelHi);
  for(let x = deckL + 2; x < deckR; x += 7) M(x, deckY + 3, 1, 2, p.steelLo);
  M(deckL, deckY + 5, deckR - deckL, 1, p.steelLo);
  for(let x = archL; x <= archR; x++){                      // arch + hangers
    const ay = archYAt(x);
    if(ay >= deckY) continue;
    M(x, ay, 1, 2, p.steel);
    M(x, ay, 1, 1, p.steelHi);
    if(((x - archL) % 12) === 0 && deckY - ay > 4)
      M(x, ay + 2, 1, deckY - ay - 2, p.steelLo);
  }
  const pylon = (x, topY) => {
    const w = 15, baseY = Y + 2;
    M(x, topY, w, baseY - topY, p.stone);
    M(x, topY, 2, baseY - topY, p.stoneHi);
    M(x + w - 2, topY, 2, baseY - topY, p.stoneLo);
    M(x - 2, topY - 3, w + 4, 3, p.stone);
    M(x - 2, topY - 3, w + 4, 1, p.stoneHi);
    M(x + 3, topY - 7, w - 6, 4, p.stone);
    M(x + 3, topY - 7, w - 6, 1, p.stoneHi);
    for(let yy = topY + 4; yy < baseY - 3; yy += 6) M(x + 3, yy, w - 6, 1, p.stoneLo);
    s.props.push({ g: "mid", x, w, h: 26, col: p.stone });
  };
  pylon(archL - 15, Y - 64);
  pylon(archR, Y - 64);
  // deck lamps and a beacon on each pylon: the bridge's own night life
  for(let x = deckL + 14; x < deckR - 8; x += 26)
    addWin(s, "mid", x, deckY - 1, 1, 1, "#ffe0a8", 1.15);
  addWin(s, "mid", archL - 8, Y - 70, 1, 1, "#ffd08a", 1.3);
  addWin(s, "mid", archR + 7, Y - 70, 1, 1, "#ffd08a", 1.3);

  // the abutment: sandstone rising out of the water where the deck lands
  for(let x = 268; x <= 306; x++){
    const t = (x - 268) / 38;
    const h = Math.round(30 - t * 7 + Math.sin(x * 0.17) * 1.2);
    M(x, Y - h, 1, h + 3, p.stone);
    M(x, Y - h, 1, 2, p.stoneHi);
    if(x % 7 === 0) M(x, Y - h + 3, 1, h, p.stoneLo);
  }

  // ---- the Opera House: sandstone podium, glazed foyer, four leaning shells
  const opX = 284, opBase = Y - 3;
  M(opX + 4, opBase - 5, 116, 5, p.stone);
  M(opX + 4, opBase - 5, 116, 1, p.stoneHi);
  M(opX, opBase - 2, 124, 2, p.stoneLo);
  M(opX + 8, opBase - 10, 104, 2, p.sailLo);
  M(opX + 8, opBase - 10, 104, 1, p.sail);
  s.props.push({ g: "mid", x: opX - 2, w: 126, h: 10, col: p.sailLo });
  const shell = (x, w, h, lean) => {
    for(let r = 0; r < h; r++){
      const t = r / (h - 1);
      const width = Math.max(2, Math.round(w * Math.pow(1 - t, 0.70)));
      const xo = Math.round(x + (w - width) * 0.5 + lean * Math.pow(t, 1.7) * 9);
      const yy = opBase - 10 - r;
      M(xo, yy, width, 1, t > 0.74 ? p.sailHi : p.sail);
      if(width > 3){
        M(xo, yy, 1, 1, p.sailHi);
        M(xo + width - 1, yy, 1, 1, p.shellShadow);
      }
    }
    s.props.push({ g: "mid", x, w, h, col: p.sail });
  };
  shell(opX + 4, 48, 36, 2);
  shell(opX + 30, 62, 50, 3);
  shell(opX + 66, 46, 38, 2);
  shell(opX + 94, 30, 26, 1);
  // the foyer glows through the glazed line at night
  for(let x = opX + 16; x < opX + 96; x += 13)
    addWin(s, "mid", x, opBase - 9, 3, 1, "#ffe0b0", 0.9);

  // ---- near: a sandstone quay on the right, jacarandas, a scrap of beach
  const bankX = Math.round(LW * 0.63), bankH = 19;
  for(let x = bankX - 36; x < LW; x++){
    const h = bankH + Math.round(Math.sin(x * 0.09 + 1.1) * 2);
    const top = H - h;
    N(x, top, 1, h, p.stone);
    N(x, top, 1, 2, p.stoneHi);
    if(x % 9 === 0) N(x, top + 3, 1, h - 3, p.stoneLo);
    if((x & 1) === 0) N(x, H - 3, 1, 3, p.sand);            // sand at the water
  }
  N(bankX - 36, H - 21, 3, 21, p.stoneLo);
  // the jacarandas on the quay are drawn by the tree system (city.tree) after
  // this builder, with a purple spring / green summer / thinned autumn crown
  // a beach umbrella and a towel on the quay: the summer corner of the season table
  const ux = bankX + 50, utop = H - bankH - 13;
  N(ux, utop, 1, 13, p.stoneLo);
  N(ux - 4, utop, 9, 2, "#d24b6a");
  N(ux - 3, utop - 2, 7, 2, p.sail);
  N(ux + 2, utop - 4, 1, 2, p.stoneLo);
  N(ux - 16, H - bankH + 2, 9, 2, "#e8b23c");

  s.extra.ferry = { x: Math.round(s.BW * 0.60) };
};


