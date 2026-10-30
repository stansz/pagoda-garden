"use strict";

/* ------------------------------------------------ Vancouver: ridge + firs */
BUILD.vancouver = function(s){
  const p = s.pal, Y = s.yW, LW = s.LW, H = s.BH;
  const F = (x,y,w,h,c) => R(s.far, x, y, w, h, c);
  const M = (x,y,w,h,c) => R(s.mid, x, y, w, h, c);
  const N = (x,y,w,h,c) => R(s.near, x, y, w, h, c);

  // ---- distant coastal range: angular peaks under snow, paling with distance
  const n1 = smoothNoise(s.rnd, LW, 3);
  const farPeaks = [
    { c: 4,   h: 66,  w: 92 }, { c: 112, h: 104, w: 96 }, { c: 224, h: 84, w: 88 },
    { c: 330, h: 114, w: 98 }, { c: 444, h: 82, w: 90 },  { c: 528, h: 72, w: 82 }
  ];
  const ridgeA = x => {
    let h = 0;
    for(let i = 0; i < farPeaks.length; i++){
      const pk = farPeaks[i], d = Math.abs(x - pk.c) / pk.w;
      if(d < 1) h = Math.max(h, pk.h * (1 - d));
    }
    return h + n1[x] * 3;
  };
  for(let x = 0; x < LW; x++){
    const h = Math.round(ridgeA(x));
    if(h < 3) continue;
    const y = Y - h;
    F(x, y, 1, h + 3, p.mtnFar);
    if(h > Math.round(ridgeA(x - 2)) + 1) F(x, y, 1, Math.min(3, h), p.mtnFarHi);
    if(h > 76){
      const cap = Math.round(3 + (h - 76) * 0.5);
      for(let r = 0; r < cap; r++) if(bay(x, y + r) < 16 - r * 3) F(x, y + r, 1, 1, p.snow);
    }
  }

  // ---- nearer ridge, greener, with conifer tips on the skyline
  const n2 = smoothNoise(s.rnd, LW, 2);
  const nearPeaks = [{ c: 52, h: 48, w: 132 }, { c: 196, h: 62, w: 140 },
                     { c: 358, h: 54, w: 150 }, { c: 506, h: 44, w: 120 }];
  const ridgeB = x => {
    let h = 0;
    for(let i = 0; i < nearPeaks.length; i++){
      const pk = nearPeaks[i], d = Math.abs(x - pk.c) / pk.w;
      if(d < 1) h = Math.max(h, pk.h * (1 - d));
    }
    return h + n2[x] * 5;
  };
  for(let x = 0; x < LW; x++){
    const h = Math.round(ridgeB(x));
    if(h < 3) continue;
    const y = Y - h;
    F(x, y, 1, h + 3, p.mtn);
    if(h > Math.round(ridgeB(x - 2)) + 1) F(x, y, 1, Math.min(2, h), p.mtnHi);
    if((x & 3) === 0) F(x, y - 2, 1, 3, p.fir);
    if((x & 7) === 3) F(x, y - 1, 1, 2, p.firLo);
  }

  // ---- mist pooled along the waterline
  const mist = ditherBand(LW, 44, (x, y) =>
    bay(x, y + 6) < Math.round((y / 44) * 11) ? rgbA(p.mist, 255) : null);
  s.far.globalAlpha = 0.4;
  s.far.drawImage(mist, 0, Y - 44);
  s.far.globalAlpha = 1;

  // ---- forest fringe and a slim downtown behind it
  coniferFringe(s, s.mid, Y, 20, 12, p.firLo, p.fir, p.firHi);
  const towers = [[-80, 10, 26], [-64, 12, 40], [-46, 10, 32], [-26, 13, 50], [-7, 9, 28], [8, 8, 20]];
  for(let i = 0; i < towers.length; i++){
    const t = towers[i];
    drawTower(s, "mid", s.mid, Math.round(s.cx + t[0]), Y, t[1], t[2],
              i % 2 ? p.tower : p.towerLo, p.towerHi, p.towerLo,
              darken(p.towerHi, 0.88), { winStep: 3, lit: 0.38, litCol: p.win });
  }
  // ---- wet rocks, kept to the right so the garden owns the left corner
  const rocks = [[LW - 96, 30, 9], [LW - 62, 22, 7], [LW - 34, 28, 11], [LW - 12, 36, 9]];
  for(let i = 0; i < rocks.length; i++){
    const r = rocks[i];
    N(r[0], H - r[2], r[1], r[2], p.firLo);
    N(r[0], H - r[2], r[1], 2, p.fir);
    N(r[0] + 2, H - r[2] - 2, Math.round(r[1] * 0.4), 2, p.fir);
  }
  s.extra.whale = { x: Math.round(s.BW * 0.62) };
};
