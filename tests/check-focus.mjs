// Headless acceptance check for the focus timer in index.html.
// Launches headless Edge or Chrome, drives window.PIXEL.session over the
// Chrome DevTools Protocol, prints PASS/FAIL per check, exits 0 only if all pass.
// No dependencies: Node >= 22 (global fetch + WebSocket).
//   node tests/check-focus.mjs
import { launch, sleep, until, check, report, pageUrl } from "./browser.mjs";

const MIN = 60000;
const near = (a, b, tol = 2000) => Math.abs(a - b) <= tol;
const S = "PIXEL.session";

let b = null;
try {
  b = await launch();
  const evaluate = b.evaluate;
  const load = () => b.load(pageUrl("index.html"));
  const exceptions = b.exceptions;

  await load();

  await check("page renders and exposes PIXEL.session", async () => {
    const lit = `(() => {
      if (typeof PIXEL !== "object" || !PIXEL.session) return "no PIXEL.session";
      const c = document.getElementById("scene");
      const w = c.width, h = c.height;
      const d = c.getContext("2d").getImageData(0, 0, w, h).data;
      let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i+1] + d[i+2] > 30) lit++;
      return lit > 20 ? true : "canvas looks blank";
    })()`;
    await until(async () => (await evaluate(lit)) === true);
    return evaluate(lit);
  });

  await check("API has pause/resume/extend/skip/setAutoStart/tint", async () =>
    evaluate(`["pause","resume","extend","skip","setAutoStart","tint","start","stop","tick","endIn","get"]
      .filter(k => typeof ${S}[k] !== "function").join(",") || true`));

  await check("start(25): focus, round 1 of 4, 25 min", async () => {
    const g = await evaluate(`${S}.stop(), ${S}.setAutoStart(false), ${S}.start(25), ${S}.get()`);
    return g.kind === "focus" && g.round === 1 && g.rounds === 4 && g.paused === false && near(g.leftMs, 25 * MIN) || g;
  });

  await check("focus ends -> short break of 5 min", async () => {
    const g = await evaluate(`${S}.endIn(0), ${S}.tick(), ${S}.get()`);
    return g.kind === "break" && g.breakType === "short" && near(g.leftMs, 5 * MIN) && g.completed === 1 || g;
  });

  await check("skip() during break -> focus round 2", async () => {
    const g = await evaluate(`${S}.skip(), ${S}.get()`);
    return g.kind === "focus" && g.round === 2 || g;
  });

  await check("4th completed focus -> long break of 15 min", async () => {
    const g = await evaluate(`(() => {
      for (let i = 0; i < 2; i++) { ${S}.endIn(0); ${S}.tick(); ${S}.skip(); }
      ${S}.endIn(0); ${S}.tick();
      return ${S}.get();
    })()`);
    return g.kind === "break" && g.breakType === "long" && near(g.leftMs, 15 * MIN) && g.completed === 4 || g;
  });

  await check("long break ends (auto-start off) -> idle, cycle reset to round 1", async () => {
    const g = await evaluate(`${S}.endIn(0), ${S}.tick(), ${S}.get()`);
    return g.kind === "idle" && g.round === 1 && g.completed === 0 || g;
  });

  await check("start(50): breaks are 10 short", async () => {
    const g = await evaluate(`${S}.start(50), ${S}.endIn(0), ${S}.tick(), ${S}.get()`);
    return g.kind === "break" && g.breakType === "short" && near(g.leftMs, 10 * MIN) || g;
  });

  await check("start(50): long break is 20", async () => {
    const g = await evaluate(`(() => {
      ${S}.skip();
      for (let i = 0; i < 2; i++) { ${S}.endIn(0); ${S}.tick(); ${S}.skip(); }
      ${S}.endIn(0); ${S}.tick();
      return ${S}.get();
    })()`);
    return g.kind === "break" && g.breakType === "long" && near(g.leftMs, 20 * MIN) || g;
  });

  await check("pause() freezes the countdown, resume() continues", async () => {
    const a = await evaluate(`${S}.stop(), ${S}.start(25), ${S}.pause(), ${S}.get()`);
    await sleep(1500);
    const bb = await evaluate(`${S}.tick(), ${S}.get()`);
    const c = await evaluate(`${S}.resume(), ${S}.get()`);
    return a.paused === true && bb.paused === true && bb.kind === "focus" && near(a.leftMs, bb.leftMs, 100)
      && c.paused === false && near(c.leftMs, a.leftMs, 500) || { a, b: bb, c };
  });

  await check("a paused session does not advance even past its old deadline", async () => {
    const g = await evaluate(`${S}.pause(), ${S}.tick(), ${S}.get()`);
    const r = await evaluate(`${S}.resume(), ${S}.get()`);
    return g.kind === "focus" && g.paused === true && r.paused === false || { g, r };
  });

  await check("extend(5) adds 5 minutes (running and paused)", async () => {
    const a = await evaluate(`${S}.get()`);
    const bb = await evaluate(`${S}.extend(5), ${S}.get()`);
    const c = await evaluate(`${S}.pause(), ${S}.extend(5), ${S}.get()`);
    await evaluate(`${S}.resume()`);
    return near(bb.leftMs - a.leftMs, 5 * MIN) && near(c.leftMs - bb.leftMs, 5 * MIN) || { a, b: bb, c };
  });

  await check("auto-start on: break end starts the next focus", async () => {
    const g = await evaluate(`(() => {
      ${S}.stop(); ${S}.setAutoStart(true); ${S}.start(25);
      ${S}.endIn(0); ${S}.tick();     // -> short break
      ${S}.endIn(0); ${S}.tick();     // -> focus round 2
      const g = ${S}.get(); ${S}.setAutoStart(false); return g;
    })()`);
    return g.kind === "focus" && g.round === 2 && g.autoStart === true || g;
  });

  await check("progress is elapsed/total and drives #focusLine", async () => {
    await evaluate(`${S}.stop(), ${S}.start(25), ${S}.endIn(12.5 * 60000), ${S}.tick()`);
    await until(() => evaluate(`Math.abs(document.getElementById("focusLine").getBoundingClientRect().width / innerWidth - 0.5) < 0.05`));
    const g = await evaluate(`(() => {
      const line = document.getElementById("focusLine");
      if (!line) return "no #focusLine";
      const cs = getComputedStyle(line);
      return { p: ${S}.get().progress, kind: line.dataset.kind, display: cs.display,
               w: line.getBoundingClientRect().width, vw: innerWidth };
    })()`);
    return typeof g === "object" && Math.abs(g.p - 0.5) < 0.02 && g.kind === "focus" && g.display !== "none"
      && Math.abs(g.w / g.vw - 0.5) < 0.05 || g;
  });

  await check("#focusLine switches to break and hides when idle", async () => {
    const g = await evaluate(`(() => {
      ${S}.endIn(0); ${S}.tick();
      const line = document.getElementById("focusLine");
      const brk = line.dataset.kind;
      ${S}.stop();
      const idleHidden = getComputedStyle(line).display === "none" || line.hidden || line.getBoundingClientRect().width === 0;
      return { brk, idleHidden };
    })()`);
    return g.brk === "break" && g.idleHidden === true || g;
  });

  await check("panel shows 4 round dots in #focusRounds", async () =>
    evaluate(`(() => { const r = document.getElementById("focusRounds");
      return r && r.querySelectorAll(".dot").length === 4 ? true : (r ? r.innerHTML : "no #focusRounds"); })()`));

  await check("scene tint eases in during focus", async () => {
    await evaluate(`${S}.start(25)`);
    await until(() => evaluate(`${S}.tint().focus > 0.05`));
    const t = await evaluate(`${S}.tint()`);
    return t && t.focus > 0.05 && t.brk < 0.02 || t;
  });

  await check("scene tint eases toward break during a break", async () => {
    await evaluate(`${S}.endIn(0), ${S}.tick()`);
    await until(() => evaluate(`(t => t.brk > 0.01 && t.focus < 0.05)(${S}.tint())`));
    const t = await evaluate(`${S}.tint()`);
    return t && t.brk > 0.01 && t.focus < 0.05 || t;
  });

  await check("a paused focus survives a reload", async () => {
    await evaluate(`${S}.stop(), ${S}.start(25), ${S}.pause(), PIXEL.session.get()`);
    await evaluate(`dispatchEvent(new Event("pagehide"))`);
    await load();
    const g = await evaluate(`${S}.get()`);
    await evaluate(`${S}.stop()`);
    return g.kind === "focus" && g.paused === true && near(g.leftMs, 25 * MIN, 10000) || g;
  });

  await check("no uncaught page exceptions", async () => exceptions.length === 0 || exceptions.slice(0, 3));
} catch (e) {
  await check("harness", () => { throw e; });
} finally {
  try { b && await b.close(); } catch {}
}

process.exit(report() ? 1 : 0);
