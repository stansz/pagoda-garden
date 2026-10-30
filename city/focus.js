"use strict";

/* =========================================================================
   Focus session — a timekeeper, not a productivity app.  It lives in its own
   pill in the bottom-right (the card stays about the place); the pill opens a
   small panel.  No rings, no notifications.  Deadlines only (wall clock), so
   a hidden tab or a reload lands in the right state.  A cycle is four focus
   rounds: a short break after rounds 1-3, a long break after the fourth.
   ========================================================================= */
const BASE_TITLE = (typeof document !== "undefined" && document.title) || "";
const FOCUS_LENGTHS = [25, 50];
const BREAKS = { 25: { short: 5, long: 15 }, 50: { short: 10, long: 20 } };
const ROUNDS = 4;
const CYCLE_IDLE_RESET = 60 * 60000;   // idle longer than this between rounds -> cycle starts over
const sessionTint = { focus: 0, brk: 0 };     // eased scene tint, applied in grade()
const session = { kind: "idle", breakType: "", lenMin: 50, endAt: 0, startedAt: 0, totalMs: 0,
                  paused: false, pausedLeft: 0, completed: 0, autoStart: false, marks: 0, endedAt: 0 };

function sessionLeftMs(){
  return session.paused ? session.pausedLeft : Math.max(0, session.endAt - Date.now());
}
function sessionMinLeft(){
  return Math.max(0, Math.ceil(sessionLeftMs() / 60000));
}
/* the round you are in: 1-based while idle or focusing, the one just finished in a break */
function sessionRound(){
  if(session.kind === "break") return Math.max(1, session.completed);
  return Math.min(session.completed + 1, ROUNDS);
}
function sessionBreakMin(type){
  const brk = BREAKS[session.lenMin] || { short: 5, long: 15 };
  return brk[type] || 5;
}
function sessionSave(){
  return { kind: session.kind, breakType: session.breakType, lenMin: session.lenMin, endAt: session.endAt,
           startedAt: session.startedAt, totalMs: session.totalMs, paused: session.paused,
           pausedLeft: session.pausedLeft, completed: session.completed, autoStart: session.autoStart,
           marks: session.marks, savedAt: Date.now() };
}
function restoreSession(pr){
  if(!pr || typeof pr !== "object") return;
  if(Number.isFinite(pr.lenMin) && pr.lenMin > 0) session.lenMin = pr.lenMin;
  if(Number.isInteger(pr.marks)) session.marks = pr.marks;
  if(Number.isInteger(pr.completed)) session.completed = clamp(pr.completed, 0, ROUNDS);
  if(typeof pr.autoStart === "boolean") session.autoStart = pr.autoStart;
  const kind = pr.kind === "focus" || pr.kind === "break" ? pr.kind : "idle";
  const endAt = Number(pr.endAt) || 0;
  if(kind === "idle" || !endAt) return;
  session.kind = kind;
  session.breakType = kind === "break" ? (pr.breakType === "long" ? "long" : "short") : "";
  session.startedAt = Number(pr.startedAt) || Date.now();
  session.totalMs = Number(pr.totalMs) > 0 ? Number(pr.totalMs) : Math.max(0, endAt - session.startedAt);
  // a paused session is worth keeping for half a day; a running one has 2 min of grace
  if(pr.paused === true && Number(pr.savedAt) > Date.now() - 12 * 3600000){
    session.paused = true;
    session.pausedLeft = Math.max(0, Number(pr.pausedLeft) || 0);
    session.endAt = Date.now() + session.pausedLeft;
    return;
  }
  session.paused = false;
  session.pausedLeft = 0;
  if(endAt < Date.now() - 120000){
    session.kind = "idle";
    session.breakType = "";
    session.endAt = 0;
    session.totalMs = 0;
    return;
  }
  session.endAt = endAt;
}

function sessionClock(ms){                     // the city's clock, same format as the card
  const tz = state.own ? undefined : cityRecord(state.city).tz;
  return new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function paintSession(){
  const $ = id => document.getElementById(id);
  const pill = $("focusPill"), panel = $("focusPanel");
  const now = Date.now();
  const kind = session.kind;
  const paused = session.paused && kind !== "idle";
  const left = sessionMinLeft();
  const round = sessionRound();
  let note = "";
  if(paused) note = "paused · " + left + " min left";
  else if(kind === "focus"){
    const nextType = round >= ROUNDS ? "long" : "short";
    note = "ends " + sessionClock(session.endAt) + ", then a " +
           sessionBreakMin(nextType) + "m " + (nextType === "long" ? "long break" : "break");
  }
  else if(kind === "break") note = (session.autoStart ? "next focus at " : "back at ") + sessionClock(session.endAt);
  else if(session.endedAt && now - session.endedAt < 90000){
    const m = Math.round((now - session.endedAt) / 60000);
    note = "break ended " + (m < 1 ? "just now" : m + "m ago");
  }else note = "round " + round + " of " + ROUNDS + " · f to start";
  if(pill){
    pill.dataset.kind = kind;
    pill.dataset.paused = String(session.paused);
    $("focusPillText").textContent =
      kind === "idle" ? "focus"
      : kind === "focus" ? left + "m"
      : session.breakType === "long" ? "long break " + left + "m"
      : "break " + left + "m";
    pill.title = kind === "idle" ? "Focus timer" : kind + " · " + left + " min left";
    pill.setAttribute("aria-expanded", String(!!panel && !panel.hidden));
  }
  if(panel){
    const kindEl = $("focusKind");
    kindEl.textContent =
      kind === "idle" ? "focus"
      : kind === "break" ? (session.breakType === "long" ? "long break" : "short break")
      : "focus · " + round + " of " + ROUNDS;
    const big = $("focusLeft");
    big.textContent = (kind === "idle" ? session.lenMin : left) + "m";
    big.className = kind === "idle" ? "" : kind + (paused ? " paused" : "");
    const lens = $("focusLens");
    lens.hidden = kind !== "idle";
    for(const b of lens.querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(+b.dataset.len === session.lenMin));
    const ctl = $("focusCtl");
    if(ctl) ctl.hidden = kind === "idle";
    const pauseBtn = $("focusPause");
    if(pauseBtn) pauseBtn.textContent = paused ? "resume" : "pause";
    const go = $("focusGo");
    if(go) go.textContent = kind === "idle" ? "start" : kind === "focus" ? "stop" : "skip break";
    const auto = $("focusAuto"), autoBox = $("focusAutoBox");
    if(auto) auto.hidden = kind !== "idle";
    if(autoBox) autoBox.checked = session.autoStart;
    $("focusNote").textContent = note;
  }
  const roundsEl = $("focusRounds");
  if(roundsEl){
    while(roundsEl.children.length < ROUNDS){
      const d = document.createElement("span");
      d.className = "dot";
      roundsEl.appendChild(d);
    }
    while(roundsEl.children.length > ROUNDS) roundsEl.removeChild(roundsEl.lastChild);
    for(let i = 0; i < roundsEl.children.length; i++)
      roundsEl.children[i].className = "dot" +
        (i < session.completed ? " done" : "") +
        (kind === "focus" && i === round - 1 ? " now" : "");
    roundsEl.setAttribute("aria-label", "Round " + round + " of " + ROUNDS);
  }
  const line = $("focusLine");
  if(line){
    const running = kind !== "idle";
    line.hidden = !running;
    if(running){
      const progress = session.totalMs > 0 ? clamp(1 - sessionLeftMs() / session.totalMs, 0, 1) : 0;
      line.dataset.kind = kind;
      line.style.width = (progress * 100).toFixed(2) + "%";
      line.classList.toggle("paused", paused);
    }else line.classList.remove("paused");
  }
  paintTitle();
}
function paintTitle(){
  if(typeof document === "undefined") return;
  let prefix = "";
  if(session.kind === "focus") prefix = sessionMinLeft() + "m · ";
  else if(session.kind === "break") prefix = "break " + sessionMinLeft() + "m · ";
  if(session.paused) prefix = "‖ " + prefix;
  document.title = prefix + BASE_TITLE;
}
function playCadence(){
  if(!soundOn || !ac || typeof pluck !== "function") return;
  try{
    const prof = musicProfile();
    const root = prof.chords[0].bass * 2;      // a slow tonic, an octave up
    pluck(root, ac.currentTime + 0.06, prof);
  }catch(e){}
  try{ savePrefs(); }catch(e){}
}
/* start a focus round from a clean state: used by startSession and by the
   automatic hand-off out of a break, which skips the idle-reset check */
function beginFocus(){
  const now = Date.now();
  session.kind = "focus";
  session.breakType = "";
  session.paused = false;
  session.pausedLeft = 0;
  session.totalMs = session.lenMin * 60000;
  session.startedAt = now;
  session.endAt = now + session.totalMs;
  session.endedAt = 0;
}
function advanceSession(){
  const now = Date.now();
  if(session.kind === "focus"){
    session.completed++;                       // one round done
    session.marks++;                           // one lifetime mark per completed focus
    session.breakType = session.completed >= ROUNDS ? "long" : "short";
    session.kind = "break";
    session.totalMs = sessionBreakMin(session.breakType) * 60000;
    session.startedAt = now;
    session.endAt = now + session.totalMs;
    playCadence();
  }else if(session.kind === "break"){
    if(session.breakType === "long") session.completed = 0;   // the cycle is done
    if(session.autoStart) beginFocus();
    else{
      session.kind = "idle";
      session.breakType = "";
      session.endAt = 0;
      session.totalMs = 0;
      session.endedAt = now;
    }
  }
  paintSession();
  try{ savePrefs(); }catch(e){}
}
function tickSession(){
  if(session.kind !== "idle" && !session.paused && session.endAt && Date.now() >= session.endAt) advanceSession();
  paintSession();
}
function startSession(min){
  if(session.kind !== "idle") return false;
  if(session.endedAt && Date.now() - session.endedAt > CYCLE_IDLE_RESET) session.completed = 0;
  if(FOCUS_LENGTHS.includes(min)) session.lenMin = min;
  beginFocus();
  paintSession();
  try{ savePrefs(); }catch(e){}
  return true;
}
function stopSession(){
  session.kind = "idle";
  session.breakType = "";
  session.paused = false;
  session.pausedLeft = 0;
  session.completed = 0;                       // stopping ends the cycle
  session.endAt = 0;
  session.totalMs = 0;
  session.endedAt = 0;
  paintSession();
  try{ savePrefs(); }catch(e){}
}
function toggleSession(){
  if(session.kind === "idle") return startSession();
  stopSession();
  return false;
}
function pauseSession(){
  if(session.kind === "idle" || session.paused) return false;
  session.pausedLeft = Math.max(0, session.endAt - Date.now());
  session.paused = true;
  paintSession();
  try{ savePrefs(); }catch(e){}
  return true;
}
function resumeSession(){
  if(!session.paused) return false;
  session.endAt = Date.now() + session.pausedLeft;
  session.paused = false;
  session.pausedLeft = 0;
  paintSession();
  try{ savePrefs(); }catch(e){}
  return true;
}
function extendSession(min = 5){
  if(session.kind === "idle") return false;
  const add = (Number.isFinite(min) ? min : 5) * 60000;
  session.totalMs += add;
  if(session.paused) session.pausedLeft += add;
  else session.endAt += add;
  paintSession();
  try{ savePrefs(); }catch(e){}
  return true;
}
function skipBreak(){
  if(session.kind !== "break") return false;
  if(session.breakType === "long") session.completed = 0;
  beginFocus();
  paintSession();
  try{ savePrefs(); }catch(e){}
  return true;
}
function setAutoStart(on){
  session.autoStart = !!on;
  paintSession();
  try{ savePrefs(); }catch(e){}
}
function setSessionLength(min){
  if(session.kind !== "idle" || !FOCUS_LENGTHS.includes(min)) return;
  session.lenMin = min;
  session.endedAt = 0;                         // the new length is what you should see
  paintSession();
  try{ savePrefs(); }catch(e){}
}
(function wireSession(){
  const wrap = document.getElementById("focus");
  const pill = document.getElementById("focusPill");
  const panel = document.getElementById("focusPanel");
  const setOpen = open => { if(panel){ panel.hidden = !open; paintSession(); } };
  if(pill) pill.addEventListener("click", () => setOpen(panel.hidden));
  const go = document.getElementById("focusGo");
  if(go) go.addEventListener("click", () => {
    if(session.kind === "idle") startSession();
    else if(session.kind === "focus") stopSession();
    else skipBreak();
    paintSession();
  });
  const pauseBtn = document.getElementById("focusPause");
  if(pauseBtn) pauseBtn.addEventListener("click", () => {
    if(session.paused) resumeSession(); else pauseSession();
  });
  const more = document.getElementById("focusMore");
  if(more) more.addEventListener("click", () => extendSession(5));
  const autoBox = document.getElementById("focusAutoBox");
  if(autoBox) autoBox.addEventListener("change", () => setAutoStart(autoBox.checked));
  const lens = document.getElementById("focusLens");
  if(lens) lens.addEventListener("click", e => {
    const b = e.target.closest("button[data-len]");
    if(b) setSessionLength(+b.dataset.len);
  });
  // a click anywhere else puts the panel away
  addEventListener("pointerdown", e => { if(wrap && !wrap.contains(e.target)) setOpen(false); });
  addEventListener("keydown", e => {
    const t = e.target;
    if(t && /input|textarea|select/i.test(t.tagName || "")) return;
    if(e.key === "f" || e.key === "F"){ e.preventDefault(); toggleSession(); }
    else if(e.key === "p" || e.key === "P"){
      if(session.kind !== "idle"){
        e.preventDefault();
        if(session.paused) resumeSession(); else pauseSession();
      }
    }
    else if(e.key === "Escape"){
      if(panel && !panel.hidden){ e.preventDefault(); setOpen(false); }
      else if(session.kind !== "idle"){ e.preventDefault(); stopSession(); }
    }
  });
  addEventListener("pagehide", () => { try{ savePrefs(); }catch(e){} });
  paintSession();
})();
