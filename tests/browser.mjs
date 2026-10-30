// Shared browser plumbing for the headless checks.
// Launches headless Edge or Chrome, drives the page over the Chrome DevTools
// Protocol, and provides the tiny PASS/FAIL harness the check scripts print.
// No dependencies: Node >= 22 (global fetch + WebSocket). Pages load from file://.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter(Boolean).find(p => existsSync(p));
if (!BROWSER) { console.error("FAIL browser: no Edge or Chrome found (set BROWSER_PATH)"); process.exit(2); }

const PORT = 9333;

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// poll instead of fixed waits: a CI machine can be several times slower than a desktop
export async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch {}
    await sleep(250);
  }
  return false;
}

// resolve a repo-relative path against this file, so any working directory works
export function pageUrl(relPath) {
  return new URL("../" + relPath, import.meta.url).href;
}

export async function launch() {
  // a browser still on this port would be tested instead of the one launched here
  if (await fetch(`http://127.0.0.1:${PORT}/json/version`).then(() => true, () => false)) {
    console.error(`FAIL harness: port ${PORT} is already in use by another browser`);
    process.exit(2);
  }
  const profile = mkdtempSync(join(tmpdir(), "pagoda-check-"));
  const edge = spawn(BROWSER, [
    ...(process.env.CI ? ["--no-sandbox"] : []),   // CI containers have no user namespaces
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,800",
    "--autoplay-policy=no-user-gesture-required", "about:blank",
  ], { stdio: "ignore" });

  let ws, nextId = 1;
  const pending = new Map();
  const exceptions = [];

  async function connect() {
    for (let i = 0; i < 50; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const page = list.find(t => t.type === "page");
        if (page) return page.webSocketDebuggerUrl;
      } catch {}
      await sleep(200);
    }
    throw new Error("could not reach Edge DevTools");
  }

  function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => pending.set(id, { res, rej }));
  }

  async function evaluate(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  let preludeId = null;

  async function load(url, { prelude } = {}) {
    if (preludeId) {
      try { await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: preludeId }); } catch {}
      preludeId = null;
    }
    if (typeof prelude === "string") {
      const r = await send("Page.addScriptToEvaluateOnNewDocument", { source: prelude });
      preludeId = r.identifier;
    }
    await send("Page.navigate", { url });
    // let the old document go before polling it: until the new one commits,
    // readyState would still answer for the page being replaced
    await sleep(300);
    if (!await until(() => evaluate(`document.readyState === "complete"`)))
      throw new Error("page did not finish loading: " + url);
  }

  // msedge.exe hands off to child processes, so killing the launcher is not enough:
  // ask the browser to quit, then sweep anything still using this run's profile.
  async function close() {
    try { ws && ws.close(); } catch {}
    try {
      const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      const b = new WebSocket(webSocketDebuggerUrl);
      await new Promise((res, rej) => { b.onopen = res; b.onerror = rej; });
      b.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    } catch {}
    await sleep(1000);
    edge.kill();
    if (process.platform === "win32") {
      const leaf = profile.split(/[\\/]/).pop();
      spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ` +
        `Where-Object { $_.CommandLine -like '*${leaf}*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
    }
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }

  try {
    ws = new WebSocket(await connect());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      }
    };
    await send("Runtime.enable");
    await send("Page.enable");
  } catch (e) {
    // never leave the browser we spelled up behind when start-up fails
    try { await close(); } catch {}
    throw e;
  }

  return { send, evaluate, load, exceptions, close };
}

/* ------------------------------------------------- shared PASS/FAIL harness */
const results = [];

// run one named check; a check returns true to pass, or a value to show as detail
export async function check(name, fn) {
  try {
    const ok = await fn();
    results.push([ok === true, name, ok === true ? "" : JSON.stringify(ok)]);
  } catch (e) { results.push([false, name, String(e.message || e)]); }
}

// print one line per check, then the summary; returns the number of failures
export function report() {
  let failed = 0;
  for (const [ok, name, info] of results) {
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`);
  }
  console.log(failed ? `${failed} check(s) failed` : `all ${results.length} checks passed`);
  return failed;
}
