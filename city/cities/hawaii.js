"use strict";

/* -------------------------------------------- Hawai'i: Diamond Head + palms */
BUILD.hawaii = function(s){
  const p = s.pal, Y = s.yW, LW = s.LW, H = s.BH;
  const F = (x,y,w,h,c) => R(s.far, x, y, w, h, c);
  const M = (x,y,w,h,c) => R(s.mid, x, y, w, h, c);
  const N = (x,y,w,h,c) => R(s.near, x, y, w, h, c);

  // haze first, so it does not wash the ridge out
  const hz = ditherBand(LW, 34, (x, y) =>
    bay(x, y + 3) < Math.round(Math.pow(y / 34, 1.3) * 12) ? rgbA(p.haze, 255) : null);
  s.far.globalAlpha = 0.45;
  s.far.drawImage(hz, 0, Y - 34);
  s.far.globalAlpha = 1;

  // Diamond Head: long west slope, flat top, a notch, seaward cliffs on the east
  // Diamond Head: long west slope, dead-flat crown, a notch, a steep seaward cliff
  const dh = x => {
    if(x < -60 || x > 300) return 0;
    if(x < 44) return Math.round(68 * Math.pow((x + 60) / 104, 0.9));
    if(x < 96) return 68;
    if(x < 110) return 68 - Math.round((x - 96) * 1.15);
    if(x < 124) return 52 + Math.round((x - 110) * 0.85);
    if(x < 194) return 64;
    if(x < 238) return Math.round(64 * Math.pow((238 - x) / 44, 1.6));
    return 0;
  };
  for(let x = 0; x < LW; x++){
    const h = Math.max(0, Math.round(dh(x)));
    if(h < 2) continue;
    const y = Y - h;
    F(x, y, 1, h + 3, p.ridge);
    if(dh(x) - dh(x - 2) < 1.5) F(x, y, 1, 2, p.ridgeHi);
  }
  // facet the cone: lit west slopes, shaded seaward cliff, bright crown
  for(let x = 0; x < LW; x++){
    const h = Math.max(0, Math.round(dh(x)));
    if(h < 3) continue;
    const slope = dh(x) - dh(x - 3);
    const y = Y - h;
    if(slope > 1.2){
      for(let yy = y + 2; yy < Y; yy += 3) if(bay(x, yy) < 9) F(x, yy, 1, 1, p.ridgeHi);
    } else if(slope < -1.2){
      for(let yy = y + 2; yy < Y; yy += 2) if(bay(x, yy) < 8) F(x, yy, 1, 1, p.ridgeLo);
    } else {
      F(x, y, 1, 2, p.ridgeHi);
    }
  }
  // shadow pooled at the foot, plus a haze wash so the cone sits in the sea air
  for(let x = 0; x < LW; x++){
    const h = Math.max(0, Math.round(dh(x)));
    if(h > 20) F(x, Y - 9, 1, 10, p.ridgeLo);
  }
  const basemist = ditherBand(LW, 18, (x, y) =>
    bay(x, y + 4) < Math.round(Math.pow(y / 18, 1.4) * 11) ? rgbA(p.haze, 255) : null);
  s.far.globalAlpha = 0.34;
  s.far.drawImage(basemist, 0, Y - 18);
  s.far.globalAlpha = 1;
  // a low headland far right
  for(let x = 336; x < LW; x++){
    const h = Math.round(13 + Math.sin((x - 336) * 0.05) * 6);
    if(h > 2) F(x, Y - h, 1, h + 2, p.ridgeLo);
  }

  // beach: a wider band of sand with a dithered soft edge above it
  const beach = ditherBand(LW, 9, (x, y) =>
    BAYER[((y & 3) << 2) | (x & 3)] / 16 < Math.pow(y / 9, 1.6) * 0.8 ? rgbA(p.sandHi, 255) : null);
  s.mid.drawImage(beach, 0, Y - 9);
  M(0, Y - 5, LW, 8, p.sand);
  M(0, Y - 6, LW, 1, p.sandHi);
  for(let i = 0; i < 18; i++){
    const x = Math.round(s.rnd() * LW), w = 2 + Math.round(s.rnd() * 4);
    M(x, Y - 1 - Math.round(s.rnd() * 2), w, 2, p.lava);
  }
  for(let i = 0; i < 14; i++){
    const x = Math.round(s.rnd() * LW), y = Y - 3 - Math.round(s.rnd() * 2);
    M(x, y, 2, 2, p.pink);
    M(x, y, 1, 1, p.cream);
  }
  // hale: dark walls under a steep thatch roof
  const hx = Math.round(s.cx + 62);
  M(hx, Y - 9, 18, 9, p.lava);
  M(hx + 7, Y - 6, 4, 6, p.palmLo);
  M(hx - 3, Y - 12, 24, 3, p.palmHi);
  M(hx - 1, Y - 15, 20, 3, p.palm);
  M(hx + 4, Y - 17, 10, 2, p.palmHi);
  M(hx + 8, Y - 18, 3, 1, p.palmLo);

  const palms = [[64, 30, -1], [96, 44, -1], [132, 28, -1], [176, 38, -1],
                 [338, 34, 1], [382, 46, 1], [430, 30, 1], [478, 40, 1], [516, 32, 1]];
  for(let i = 0; i < palms.length; i++){
    const pl = palms[i];
    palm(s, s.mid, pl[0], Y - 1, pl[1], pl[2], p.palmLo, p.palm, p.palmHi, p.lava);
  }

  // near: the shallow lagoon shelf along the bottom edge
  N(0, H - 6, LW, 6, p.lagoonLo);
  N(0, H - 6, LW, 1, p.lagoon);
};
