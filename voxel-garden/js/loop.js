"use strict";

/* -------------------------------------------------------------------- loop */
const pointers = new Map();
let pinchStart = 0, pinchZoom = 1;

function pinchDistance(){
  const p = Array.from(pointers.values());
  return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 0;
}

cv.addEventListener("pointerdown", e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cv.setPointerCapture(e.pointerId);
  lastTouch = performance.now();
  hint.style.opacity = "0";
  if(pointers.size === 2){
    pinchStart = pinchDistance();
    pinchZoom = zoomTarget;
    dragging = false;
    return;
  }
  dragging = true; lx = e.clientX; ly = e.clientY; vel = 0;
  cv.style.cursor = "grabbing";
});
cv.addEventListener("pointermove", e => {
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if(pointers.size >= 2){
    if(pinchStart > 0) zoomTarget = clamp(pinchZoom * (pinchDistance() / pinchStart), ZOOM_MIN, ZOOM_MAX);
    lastTouch = performance.now();
    return;
  }
  if(!dragging) return;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  lx = e.clientX; ly = e.clientY;
  yaw += dx * 0.010;
  vel = clamp(dx * 0.030, -1.6, 1.6);
  pitch = clamp(pitch - dy * 0.006, 0.20, 1.15);
  lastTouch = performance.now();
});
function endDrag(e){
  savePrefsSoon();
  if(e && e.pointerId !== undefined){
    pointers.delete(e.pointerId);
    if(pointers.size < 2) pinchStart = 0;
    if(pointers.size === 1){                       // back to a single finger: resume panning
      const p = Array.from(pointers.values())[0];
      lx = p.x; ly = p.y; dragging = true; vel = 0;
      return;
    }
  }
  dragging = false; cv.style.cursor = "grab"; lastTouch = performance.now();
}
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", endDrag);

cv.addEventListener("wheel", e => {
  e.preventDefault();
  zoomTarget = clamp(zoomTarget * Math.exp(-e.deltaY * 0.0016), ZOOM_MIN, ZOOM_MAX);
  lastTouch = performance.now();
  hint.style.opacity = "0";
  savePrefsSoon();
}, { passive: false });

cv.addEventListener("dblclick", () => { zoomTarget = 1; savePrefsSoon(); });
addEventListener("keydown", e => {
  if(e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  if(e.key === "+" || e.key === "="){ zoomTarget = clamp(zoomTarget * 1.15, ZOOM_MIN, ZOOM_MAX); }
  else if(e.key === "-" || e.key === "_"){ zoomTarget = clamp(zoomTarget / 1.15, ZOOM_MIN, ZOOM_MAX); }
  else if(e.key === "0"){ zoomTarget = 1; }
  else return;
  e.preventDefault();
  savePrefsSoon();
});

let last = performance.now();

// A constant, very slow turn: it is always on, eases out while you drag and eases
// back in afterwards, so the scene never sits still and never fights your hand.
const DRIFT_RATE = 0.042;          // rad/s -> a full turn every ~150 s
let drift = 1;                     // 0..1 blend of that turn

function tick(now){
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;

  // fling after a drag, then the ambient turn
  if(!dragging && Math.abs(vel) > 0.001){
    yaw += vel * dt;
    vel *= Math.exp(-3.2 * dt);
  }
  drift += ((dragging ? 0 : 1) - drift) * Math.min(1, dt * (dragging ? 14 : 0.7));
  if(!reduceMotion && drift > 0.002) yaw += DRIFT_RATE * drift * dt;

  if(Math.abs(zoomTarget - zoom) > 0.0008) zoom += (zoomTarget - zoom) * Math.min(1, dt * 9);

  updateWeather(dt);
  updateAudio();
  const active = !reduceMotion || rainAmt > 0.01 || snowAmt > 0.01 || moodAt(hour).night > 0.10 ||
                 Math.abs(zoomTarget - zoom) > 0.0008 || dragging || Math.abs(vel) > 0.001;
  render(now, dt, active);
  requestAnimationFrame(tick);
}

resize();
requestAnimationFrame(tick);
