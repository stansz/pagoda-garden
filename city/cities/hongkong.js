"use strict";

/* --------------------------------------------- Hong Kong: dense tower wall */
BUILD.hongkong = function(s){
  const p = s.pal, Y = s.yW, LW = s.LW, H = s.BH;
  const F = (x,y,w,h,c) => R(s.far, x, y, w, h, c);
  const M = (x,y,w,h,c) => R(s.mid, x, y, w, h, c);
  const N = (x,y,w,h,c) => R(s.near, x, y, w, h, c);

  // the Peak, and a stipple of towers on it
  for(let x = 0; x < LW; x++){
    const h = Math.round(50 + Math.sin(x * 0.0125) * 20 + Math.sin(x * 0.031 + 1.6) * 8);
    if(h > 2) F(x, Y - h, 1, h + 3, p.hill);
  }
  for(let i = 0; i < 40; i++){
    const x = Math.round(s.rnd() * LW);
    const w = 3 + Math.round(s.rnd() * 6);
    const hillH = 50 + Math.sin(x * 0.0125) * 20 + Math.sin(x * 0.031 + 1.6) * 8;
    const h = 6 + Math.round(s.rnd() * 20);
    F(x, Y - hillH - h + 5, w, h, p.hill);
    if(s.rnd() < 0.4) F(x, Y - hillH - h + 5, w, 1, p.hillHi);
    if(s.rnd() < 0.45) F(x + 1, Y - hillH - 4, 1, 1, p.amber);
  }
  const haze = ditherBand(LW, 44, (x, y) =>
    bay(x, y + 9) < Math.round((y / 44) * 9) ? rgbA(p.haze, 255) : null);
  s.far.globalAlpha = 0.34;
  s.far.drawImage(haze, 0, Y - 44);
  s.far.globalAlpha = 1;

  // the wall: stepped crowns, antennas, vertical neon
  const towers = [
    [-120, 20, 70, 0, 0], [-98, 13, 94, 2, 1], [-78, 21, 60, 0, 0], [-54, 15, 108, 2, 2],
    [-32, 19, 82, 1, 1], [-10, 13, 54, 0, 0], [9, 21, 122, 2, 2], [35, 15, 72, 1, 1],
    [55, 18, 96, 2, 0], [80, 13, 64, 0, 0], [98, 21, 106, 1, 1], [124, 15, 78, 0, 2]
  ];
  for(let i = 0; i < towers.length; i++){
    const t = towers[i];
    const x = Math.round(s.cx + t[0]), w = t[1], h = t[2], crown = t[3], style = t[4];
    const body = i % 3 === 0 ? p.t1 : i % 3 === 1 ? p.t2 : p.t3;
    drawTower(s, "mid", s.mid, x, Y, w, h, body, p.tHi, darken(p.t1, 0.7), darken(p.t2, 0.52),
              { winStep: 3, lit: 0.5, litCol: i % 2 ? p.win : p.amber,
                crown: crown, antenna: style === 1 ? 12 : 0 });
    if(style === 2){                                   // stepped shoulder, set back
      drawTower(s, "mid", s.mid, x + Math.round(w * 0.22), Y, Math.round(w * 0.56), Math.round(h * 0.9),
                body, p.tHi, darken(p.t1, 0.7), darken(p.t2, 0.52),
                { winStep: 4, lit: 0.35, litCol: p.amber });
    }
    if(style === 0){                                   // neon sign slab
      M(x + 2, Y - h + 13, 2, 15, p.neon);
      M(x + 2, Y - h + 13, 2, 2, p.neon2);
      M(x + 2, Y - h + 32, 2, 8, p.amber);
      s.lights.push({ kind: "neon", x: x + 2, y: Y - h + 13, w: 2, h: 15, col: p.neon, ph: s.rnd() * 6.3 });
    } else if(style === 1){
      M(x + w - 4, Y - h + 22, 2, 11, p.neon2);
      s.lights.push({ kind: "neon", x: x + w - 4, y: Y - h + 22, w: 2, h: 11, col: p.neon2, ph: s.rnd() * 6.3 });
    }
  }
  for(let i = 0; i < 30; i++) M(Math.round(s.rnd() * LW), Y - 1, 1, 1, p.amber);

  s.extra.junk = { x: Math.round(s.BW * 0.72), y: Y + 26 };
  s.lights.push({ kind: "lantern", x: 44, y: 20, col: p.neon, ph: 0 });
  s.lights.push({ kind: "lantern", x: s.BW - 58, y: 28, col: p.neon, ph: 2.1 });
};
