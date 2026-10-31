// Story-data checks for city/stories/*.js.
// No browser: each story file is run in a vm with an empty STORY, then every
// reachable state is walked in every combination of time, weather, season and
// garden. Prints PASS/FAIL per check, exits 0 only if all pass.
//   node tests/check-story.mjs
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, report } from "./browser.mjs";

const STORIES_DIR = fileURLToPath(new URL("../city/stories/", import.meta.url));

// ---- the product of worlds the locks can see: 4 x 3 x 2 x 4 x 5 = 480 ----
const TIMES = [
  ["night+nine", 21.5],
  ["night", 23],
  ["dawn", 6.5],
  ["day", 12]
];
const WEATHERS = ["clear", "rain", "snow"];
const SEASONS = ["spring", "summer", "autumn", "winter"];
const GROWNS = [[], ["any"], ["any", "moonflower"], ["any", "lantern"], ["any", "moonflower", "lantern"]];

const ALL_WORLDS = [];
for (const [, hour] of TIMES)
  for (const wx of WEATHERS)
    for (const fog of [false, true])
      for (const season of SEASONS)
        for (const grown of GROWNS) ALL_WORLDS.push({ hour, wx, fog, season, grown });

const COND_KEYS = new Set(["night", "nine", "dawn", "rain", "snow", "fog", "season",
                            "has", "lacks", "flag", "noflag", "grown"]);

const label = world => JSON.stringify({ hour: world.hour, wx: world.wx, fog: world.fog,
                                        season: world.season, grown: world.grown });

/* ------------------------------------------------------------- cond engine */
function list(v) { return Array.isArray(v) ? v : [v]; }

function holds(story, state, cond, world) {
  if (!cond) return true;
  const night = world.hour >= 20 || world.hour < 5;
  const nine = world.hour >= 21 && world.hour < 22;
  const dawn = world.hour >= 5 && world.hour < 8;
  for (const key of Object.keys(cond)) {
    const v = cond[key];
    if (key === "night") { if (night !== !!v) return false; }
    else if (key === "nine") { if (nine !== !!v) return false; }
    else if (key === "dawn") { if (dawn !== !!v) return false; }
    else if (key === "rain") { if ((world.wx === "rain") !== !!v) return false; }
    else if (key === "snow") { if ((world.wx === "snow") !== !!v) return false; }
    else if (key === "fog") { if (!!world.fog !== !!v) return false; }
    else if (key === "season") { if (world.season !== v) return false; }
    else if (key === "has") { if (!list(v).every(id => state.items.includes(id))) return false; }
    else if (key === "lacks") { if (list(v).some(id => state.items.includes(id))) return false; }
    else if (key === "flag") { if (!list(v).every(f => state.flags.includes(f))) return false; }
    else if (key === "noflag") { if (list(v).some(f => state.flags.includes(f))) return false; }
    else if (key === "grown") { if (!world.grown.includes(v)) return false; }
    else return false;
  }
  return true;
}

function enabled(story, state, c, world) {
  return holds(story, state, c.show, world) && holds(story, state, c.if, world);
}

/* ------------------------------------------------------------ state graph */
function mkState(at, items, flags) {
  const i = items.slice().sort(), f = flags.slice().sort();
  return { at, items: i, flags: f, key: at + "|" + i.join(",") + "|" + f.join(",") };
}

function applyChoice(story, state, c) {
  const take = c.take || [], give = c.give || [], set = c.set || [];
  const items = state.items.filter(id => !take.includes(id));
  for (const id of give) if (!items.includes(id)) items.push(id);
  const flags = state.flags.slice();
  for (const f of set) if (!flags.includes(f)) flags.push(f);
  return mkState(c.end ? story.start : c.to, items, flags);
}

// breadth-first over union of all allowed worlds; records enabled transitions,
// the scenes reached, and any (state, world) with no way out
function explore(story, worlds) {
  const start = mkState(story.start, [], []);
  const nodes = new Map([[start.key, start]]);
  const queue = [start];
  const scenes = new Set([start.at]);
  const edges = new Map();
  const stuck = [];
  const finishKeys = new Set();
  while (queue.length) {
    const s = queue.shift();
    const scene = story.scenes[s.at];
    const outs = new Set();
    for (const world of worlds) {
      let any = false;
      for (const c of scene.choices) {
        if (!enabled(story, s, c, world)) continue;
        any = true;
        const next = applyChoice(story, s, c);
        outs.add(next.key);
        if (!nodes.has(next.key)) {
          nodes.set(next.key, next);
          queue.push(next);
          scenes.add(next.at);
        }
      }
      if (!any) stuck.push({ scene: s.at, state: s, world });
    }
    edges.set(s.key, outs);
    if (s.flags.includes(story.finish)) finishKeys.add(s.key);
  }
  return { nodes, edges, scenes, stuck, finishKeys };
}

function shortestToFinish(story, ex) {
  const start = mkState(story.start, [], []);
  const dist = new Map([[start.key, 0]]);
  const queue = [start.key];
  while (queue.length) {
    const k = queue.shift();
    if (ex.finishKeys.has(k)) return dist.get(k);
    for (const nk of ex.edges.get(k) || []) {
      if (dist.has(nk)) continue;
      dist.set(nk, dist.get(k) + 1);
      queue.push(nk);
    }
  }
  return Infinity;
}

function softlockStates(ex) {
  const rev = new Map();
  for (const [k, outs] of ex.edges)
    for (const nk of outs) {
      if (!rev.has(nk)) rev.set(nk, new Set());
      rev.get(nk).add(k);
    }
  const can = new Set(ex.finishKeys);
  const queue = [...ex.finishKeys];
  while (queue.length) {
    const k = queue.pop();
    for (const p of rev.get(k) || [])
      if (!can.has(p)) { can.add(p); queue.push(p); }
  }
  return [...ex.nodes.keys()].filter(k => !can.has(k)).map(k => ex.nodes.get(k).at);
}

/* --------------------------------------------------------------- inspectors */
function condsOf(story) {
  const out = [];
  for (const [sid, scene] of Object.entries(story.scenes)) {
    for (const line of scene.text)
      if (line && typeof line === "object" && line.if) out.push({ scene: sid, what: "text", cond: line.if });
    scene.choices.forEach((c, i) => {
      if (c.show) out.push({ scene: sid, what: "choice " + (i + 1) + " show", cond: c.show });
      if (c.if) out.push({ scene: sid, what: "choice " + (i + 1) + " if", cond: c.if });
    });
  }
  return out;
}

function choiceName(c, i) {
  return "choice " + (i + 1) + " " + JSON.stringify(c.label || (c.end ? "(end)" : "(no label)"));
}

function textsOf(story) {
  const out = [story.title];
  for (const it of Object.values(story.items)) out.push(it.name, it.note);
  if (story.goal) out.push(story.goal.title);
  for (const p of Object.values(story.pages)) out.push(p.title, p.text);
  for (const s of Object.values(story.scenes)) {
    out.push(s.place);
    for (const line of s.text) {
      if (typeof line === "string") out.push(line);
      else if (line && line.t) out.push(line.t);
    }
    for (const c of s.choices) {
      out.push(c.label);
      if (c.hint) out.push(c.hint);
      if (c.now) out.push(c.now);
      if (c.say) out.push(c.say);
    }
  }
  return out;
}

/* ------------------------------------------------------------------- load */
const STORY = {};
for (const file of readdirSync(STORIES_DIR).filter(f => f.endsWith(".js"))) {
  runInNewContext(readFileSync(join(STORIES_DIR, file), "utf8"), { STORY });
}
const IDs = Object.keys(STORY);
if (!IDs.length) {
  console.log("FAIL story: no story files in city/stories/");
  process.exit(1);
}

/* ------------------------------------------------------------------ checks */
for (const id of IDs) {
  const story = STORY[id];
  const all = explore(story, ALL_WORLDS);

  await check(`${id}: shape`, () => {
    for (const [sid, scene] of Object.entries(story.scenes)) {
      if (!scene || typeof scene.place !== "string" || !scene.place)
        return `${sid}: missing place`;
      if (!Array.isArray(scene.text) || !scene.text.length)
        return `${sid}: empty text`;
      if (!Array.isArray(scene.choices) || !scene.choices.length)
        return `${sid}: empty choices`;
    }
    return true;
  });

  await check(`${id}: references`, () => {
    const scenes = story.scenes;
    for (const [sid, scene] of Object.entries(scenes)) {
      for (let i = 0; i < scene.choices.length; i++) {
        const c = scene.choices[i];
        const where = `${sid} ${choiceName(c, i)}`;
        if (c.end) {
          if (c.to !== undefined) return `${where}: end choice has a to`;
        } else if (!Object.prototype.hasOwnProperty.call(scenes, c.to)) {
          return `${where}: to "${c.to}" is not a scene`;
        }
        for (const key of ["take", "give"])
          for (const item of c[key] || [])
            if (!Object.prototype.hasOwnProperty.call(story.items, item))
              return `${where}: ${key} item "${item}" does not exist`;
        if (c.page && !Object.prototype.hasOwnProperty.call(story.pages, c.page))
          return `${where}: page "${c.page}" does not exist`;
        for (const cond of [c.show, c.if])
          for (const key of Object.keys(cond || {})) {
            if (!COND_KEYS.has(key)) return `${where}: unknown cond key "${key}"`;
            if (key === "has" || key === "lacks")
              for (const item of list(cond[key]))
                if (!Object.prototype.hasOwnProperty.call(story.items, item))
                  return `${where}: ${key} item "${item}" does not exist`;
          }
      }
      for (const line of scene.text)
        for (const key of Object.keys((line && line.if) || {}))
          if (!COND_KEYS.has(key)) return `${sid} text: unknown cond key "${key}"`;
    }
    for (const item of story.goal.items || [])
      if (!Object.prototype.hasOwnProperty.call(story.items, item))
        return `goal item "${item}" does not exist`;
    return true;
  });

  await check(`${id}: locks explain themselves`, () => {
    for (const [sid, scene] of Object.entries(story.scenes)) {
      for (let i = 0; i < scene.choices.length; i++) {
        const c = scene.choices[i];
        if (c.if && (typeof c.hint !== "string" || !c.hint))
          return `${sid} ${choiceName(c, i)}: locked with no hint`;
      }
    }
    return true;
  });

  await check(`${id}: flags`, () => {
    const set = new Set(), read = new Set();
    for (const scene of Object.values(story.scenes))
      for (const c of scene.choices) for (const f of c.set || []) set.add(f);
    for (const { cond } of condsOf(story))
      for (const key of ["flag", "noflag"])
        for (const f of list(cond[key] || [])) read.add(f);
    read.add(story.goal.show);
    read.add(story.goal.done);
    for (const f of set) if (!read.has(f)) return `flag "${f}" is set but never read`;
    for (const f of read) if (!set.has(f)) return `flag "${f}" is read but never set`;
    return true;
  });

  await check(`${id}: every scene reachable`, () => {
    const missing = Object.keys(story.scenes).filter(sid => !all.scenes.has(sid));
    return missing.length ? missing : true;
  });

  await check(`${id}: never stuck`, () => {
    if (!all.stuck.length) return true;
    const s = all.stuck[0];
    return `${s.scene} in ${label(s.world)}: no choice holds`;
  });

  await check(`${id}: no softlock`, () => {
    const bad = softlockStates(all);
    return bad.length ? `cannot finish from: ${[...new Set(bad)].join(", ")}` : true;
  });

  await check(`${id}: ending needs no weather`, () => {
    const dry = ALL_WORLDS.filter(w => w.wx === "clear" && !w.fog);
    const ex = explore(story, dry);
    return ex.finishKeys.size > 0 || `no ending in ${dry.length} rain-free, snow-free, fog-free worlds`;
  });

  await check(`${id}: everything obtainable`, () => {
    const gives = new Set(), pages = new Set();
    for (const scene of Object.values(story.scenes))
      for (const c of scene.choices) {
        for (const item of c.give || []) gives.add(item);
        if (c.page) pages.add(c.page);
      }
    const bad = [];
    for (const item of Object.keys(story.items)) if (!gives.has(item)) bad.push(`item "${item}" is never given`);
    for (const page of Object.keys(story.pages)) if (!pages.has(page)) bad.push(`page "${page}" is never gained`);
    return bad.length ? bad : true;
  });

  await check(`${id}: no shortcut`, () => {
    const n = shortestToFinish(story, all);
    return n >= 20 || `shortest path to "${story.finish}" is ${n} moves`;
  });

  await check(`${id}: tokens`, () => {
    const allowed = new Set(["{time}", "{cond}", "{temp}"]);
    const bad = [];
    for (const text of textsOf(story))
      for (const m of String(text).matchAll(/\{[^}]*\}/g))
        if (!allowed.has(m[0])) bad.push(m[0]);
    return bad.length ? [...new Set(bad)] : true;
  });

  await check(`${id}: detects a dead end`, () => {
    const copy = JSON.parse(JSON.stringify(story));
    if (!copy.scenes.gun) return "story has no scene named gun";
    copy.scenes.gun.choices = [];
    const ex = explore(copy, ALL_WORLDS);
    return ex.stuck.some(s => s.scene === "gun") ||
      "the never-stuck pass did not report the emptied gun scene";
  });
}

process.exit(report() ? 1 : 0);
