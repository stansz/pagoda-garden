"use strict";

/* ------------------------------------------------------- Toronto: the tower */
BUILD.toronto = function(s){
  const p = s.pal, Y = s.yW, LW = s.LW, H = s.BH;
  const F = (x,y,w,h,c) => R(s.far, x, y, w, h, c);
  const M = (x,y,w,h,c) => R(s.mid, x, y, w, h, c);
  const N = (x,y,w,h,c) => R(s.near, x, y, w, h, c);

  // ---- hazy far shore, low skyline, warm
  const haze = ditherBand(LW, 40, (x, y) =>
    bay(x, y + 12) < Math.round(Math.pow(y / 40, 1.25) * 12) ? rgbA(p.haze, 255) : null);
  s.far.globalAlpha = 0.5;
  s.far.drawImage(haze, 0, Y - 40);
  s.far.globalAlpha = 1;
  F(0, Y - 2, LW, 4, p.shore);
  for(let i = 0; i < 34; i++){
    const x = Math.round(i * 15.6 + s.rnd() * 5);
    const w = 3 + Math.round(s.rnd() * 5), h = 4 + Math.round(s.rnd() * 14);
    F(x, Y - 2 - h, w, h + 3, p.shore);
    if(s.rnd() < 0.5) F(x, Y - 2 - h, w, 1, p.shoreHi);
    if(s.rnd() < 0.35) F(x + 1, Y - 4 - Math.round(s.rnd() * h * 0.6), 1, 1, p.win);
  }

  // ---- skyline: warm greys with one stepped crown, kept below the tower
  const sky = [
    [-112, 15, 40], [-92, 12, 54], [-70, 18, 46], [-36, 13, 60],
    [4, 16, 50], [26, 14, 64], [92, 16, 44], [114, 12, 56], [136, 17, 38]
  ];
  for(let i = 0; i < sky.length; i++){
    const t = sky[i];
    drawTower(s, "mid", s.mid, Math.round(s.cx + t[0]), Y, t[1], t[2],
              i % 3 === 0 ? p.twr1 : i % 3 === 1 ? p.twr2 : p.twr3,
              p.twrHi, darken(p.twr2, 0.8), darken(p.twr3, 0.6),
              { winStep: 3, lit: 0.42, litCol: p.win, crown: i === 5 ? 1 : 0 });
  }
  // Rogers Centre dome, squat and pale
  const dx0 = Math.round(s.cx + 48);
  for(let r = 0; r < 12; r++){
    const w = Math.round(34 * Math.sqrt(1 - r / 12.5));
    M(dx0 - w / 2, Y - r - 1, w, 1, r > 8 ? p.shoreHi : p.shore);
  }
  // CN Tower: shaft, pod, antenna
  const cx = Math.round(s.cx - 28);
  M(cx, Y - 118, 3, 118, p.cn);
  M(cx, Y - 118, 1, 118, p.cnHi);
  M(cx - 5, Y - 123, 13, 5, p.cn);
  M(cx - 5, Y - 123, 13, 1, p.cnHi);
  M(cx - 6, Y - 126, 15, 3, p.cn);
  M(cx - 6, Y - 126, 15, 1, p.cnHi);
  M(cx + 1, Y - 134, 1, 11, p.cn);
  M(cx - 1, Y - 142, 5, 8, p.cnHi);
  M(cx + 1, Y - 150, 1, 8, p.cn);
  addWin(s, "mid", cx + 1, Y - 122, 1, 2, p.win, 1.4);
  addWin(s, "mid", cx + 2, Y - 125, 1, 1, p.win, 1.4);

  // ---- near: island bank on the right; the maples on it are drawn by the
  // tree system (city.tree) after the landmark art, with seasonal crowns
  const bankTop = H - 15;
  const bankX = Math.round(LW * 0.68);
  N(bankX, bankTop, LW - bankX + 12, 15, p.trunk);
  N(bankX, bankTop, LW - bankX + 12, 1, p.shore);
  N(bankX + 10, bankTop + 4, 40, 1, p.shoreHi);
  N(bankX + 62, bankTop + 5, 34, 1, p.shoreHi);
};
