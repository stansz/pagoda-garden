// Starts one headless browser on the checks' port and leaves it running, so a
// shell that cannot start a browser can still run the checks with CHECK_ATTACH=1.
//   node tests/start-browser.mjs          start it
//   node tests/start-browser.mjs --stop   stop it
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BROWSER, PORT, browserArgs, until } from "./browser.mjs";

const PREFIX = "pagoda-shared-";
const version = () => fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json(), () => null);

if (process.argv.includes("--stop")) {
  const v = await version();
  if (v) {
    const b = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { b.onopen = res; b.onerror = rej; });
    b.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    await until(async () => !(await version()), 5000);
    b.close();
  }
  if (process.platform === "win32") {
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*${PREFIX}*' } | ` +
      `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
  }
  for (const d of readdirSync(tmpdir()))
    if (d.startsWith(PREFIX)) try { rmSync(join(tmpdir(), d), { recursive: true, force: true }); } catch {}
  console.log("stopped");
  process.exit(0);
}

if (await version()) { console.error(`FAIL: port ${PORT} is already in use`); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), PREFIX));
spawn(BROWSER, browserArgs(profile), { stdio: "ignore", detached: true }).unref();
if (!await until(version, 15000)) { console.error("FAIL: browser did not start"); process.exit(1); }
console.log(`browser ready on port ${PORT}`);
process.exit(0);
