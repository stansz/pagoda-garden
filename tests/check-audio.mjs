// Headless checks for the shared sound engine: the mood picker and all eight
// moods (city, lo-fi, rain piano, night drive, temple, rain, waves, night),
// chord crossfade, reverb swap, chord-aware plucks, the lo-fi beat clock and
// its loudness, the saved preferences on both pages, and the garden's music
// following its place.
//   node tests/check-audio.mjs
import { launch, until, check, report, pageUrl, sleep } from "./browser.mjs";

// Same prelude contract as check-pages.mjs: a fresh localStorage, an optional
// seeded entry, and a stubbed Open-Meteo answer so no check needs the network.
function PRELUDE_WITH(storageKey, value) {
  return `
try{localStorage.clear()}catch(e){}
${storageKey === null ? "" : `try{localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(value))})}catch(e){}`}
window.__lfoLinks = 0;
{
  const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
  const isLfo = n => typeof padLfoOdd !== "undefined" && (n === padLfoOdd || n === padLfoEven);
  AudioNode.prototype.connect = function (t, ...r) {
    if (t instanceof AudioParam && isLfo(this)) window.__lfoLinks++;
    return connect.call(this, t, ...r);
  };
  AudioNode.prototype.disconnect = function (t, ...r) {
    if (t instanceof AudioParam && isLfo(this)) window.__lfoLinks--;
    return disconnect.call(this, t, ...r);
  };
}
window.fetch = () => Promise.resolve(new Response(JSON.stringify(
  { current: { weather_code: 3, temperature_2m: 7, cloud_cover: 80 } }),
  { status: 200, headers: { "Content-Type": "application/json" } }));
`;
}
const PRELUDE = PRELUDE_WITH(null, null);

// Mean of 20 rms readings over two seconds, sampled every 100 ms.
async function meanRms(evaluate) {
  let sum = 0;
  for (let i = 0; i < 20; i++) {
    sum += await evaluate(`PIXEL.audio().rms`);
    await sleep(100);
  }
  return sum / 20;
}

const PITCH_CENTS = `f => { const x = Math.log2(f / 440) * 1200; return ((x % 1200) + 1200) % 1200; }`;
const MOOD_IDS = ["city", "lofi", "rainpiano", "drive", "temple", "rain", "waves", "night"];

let b = null;
try {
  b = await launch();
  const evaluate = b.evaluate;
  const load = (relPath) => b.load(pageUrl(relPath), { prelude: PRELUDE });
  const loadWith = (relPath, key, value) =>
    b.load(pageUrl(relPath), { prelude: PRELUDE_WITH(key, value) });

  await check("city mood control and silent boot", async () => {
    await load("index.html?city=vancouver");
    const r = await evaluate(`(() => ({
      options: [...document.querySelectorAll("#mood option")].map(o => o.value),
      mood: PIXEL.audio().mood,
      ac: ac === null,
      value: document.getElementById("mood").value
    }))()`);
    return (JSON.stringify(r.options) === JSON.stringify(MOOD_IDS) &&
      r.mood === "city" && r.ac === true && r.value === "city") || r;
  });

  await check("city sound starts and is audible", async () => {
    await evaluate(`PIXEL.audioToggle()`);
    const running = await until(() => evaluate(`PIXEL.audio().state === "running"`), 6000);
    if (!running) return { state: await evaluate(`PIXEL.audio().state`) };
    await sleep(4000);                       // let the layer fade-in settle
    const mean = await meanRms(evaluate);
    return (mean > 0.0065) || { mean };
  });

  await check("chord crossfade uses discrete layers", async () => {
    await evaluate(`nextChordAt = 0`);
    const match = await until(() => evaluate(`(() => {
      const L = padLayers[padLayers.length - 1];
      if (!L || L.retired) return false;
      const ch = musicChord();
      return L.voices.length === 5 &&
        L.voices.every((v, i) => Math.abs(v.freq - ch.pad[i]) < 0.01);
    })()`), 3000);
    if (!match) return { matched: false, layers: await evaluate(`padLayers.length`) };
    const count = await evaluate(`padLayers.length`);
    if (count > 2) return { tooMany: count };
    await sleep(5000);                       // CHORD_FADE + 1
    const one = await evaluate(`padLayers.length`);
    return one === 1 || { after: one };
  });

  await check("pad drift has signal and leaves with its layer", async () => {
    const links = await evaluate(`(() => ({
      links: window.__lfoLinks,
      voices: padLayers.reduce((n, L) => n + L.voices.length, 0)
    }))()`);
    if (links.voices === 0 || links.links !== links.voices) return links;
    await evaluate(`window.__drift = [padLfoOdd, padLfoEven].map(n => {
      const a = ac.createAnalyser(); a.fftSize = 512; n.connect(a); return a;
    })`);
    let max = 0;
    for (let i = 0; i < 20; i++) {
      max = Math.max(max, await evaluate(`Math.max(...window.__drift.map(a => {
        const d = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(d);
        return Math.max(...d.map(Math.abs));
      }))`));
      await sleep(100);
    }
    return max > 0.004 || { max };
  });

  await check("city change swaps chords and reverb", async () => {
    const before = await evaluate(`revActive`);
    const beforeExceptions = b.exceptions.length;
    await evaluate(`PIXEL.selectCity("hongkong")`);
    const ok = await until(() => evaluate(`(() => {
      const r = PIXEL.audio(), p = PIXEL.audioProfile("hongkong");
      return JSON.stringify(r.chords) === JSON.stringify(p.chords);
    })()`), 3000);
    const after = await evaluate(`revActive`);
    const exceptions = b.exceptions.length === beforeExceptions;
    return (ok && after !== before && exceptions) || { ok, before, after, exceptions };
  });

  await check("plucks follow the chord", async () => {
    const ratio = await evaluate(`(() => {
      const cents = ${PITCH_CENTS};
      const ch = musicChord(), prof = musicProfile();
      const cps = ch.pad.map(cents);
      let hit = 0;
      for (let i = 0; i < 300; i++) {
        const f = pluckPick(ch, prof), p = cents(f);
        if (cps.some(c => Math.min(Math.abs(p - c), 1200 - Math.abs(p - c)) <= 30)) hit++;
      }
      return hit / 300;
    })()`);
    return ratio >= 0.6 || { ratio };
  });

  await check("lofiStepTime lays odd steps back", async () => {
    const worst = await evaluate(`(() => {
      const t0 = 10, bpm = 78, sixteenth = 60 / bpm / 4;
      let worst = 0;
      for (let step = 0; step < 16; step++) {
        const want = t0 + step * sixteenth + (step % 2 ? 0.30 * sixteenth : 0);
        worst = Math.max(worst, Math.abs(lofiStepTime(step, t0, bpm) - want));
      }
      return worst;
    })()`);
    return worst <= 0.001 || { worst };
  });

  await check("lo-fi mood runs and empties the pad", async () => {
    const before = await evaluate(`lofiStep`);
    await evaluate(`PIXEL.audioMood("lofi")`);
    const advanced = await until(() => evaluate(`lofiStep !== ${before}`), 3000);
    await sleep(5000);                       // CHORD_FADE + 1
    const layers = await evaluate(`padLayers.length`);
    const mean = await meanRms(evaluate);
    return (advanced && layers === 0 && mean > 0.0065) || { advanced, layers, mean };
  });

  await check("loudest master setting stays below full scale", async () => {
    await evaluate(`(() => {
      vol = 1;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.value = masterLevel();
    })()`);
    // every sample of the master for 20 s, so a short hit cannot slip between reads
    await evaluate(`(() => {
      window.__ceiling = 0;
      const sp = ac.createScriptProcessor(1024, 2, 1);
      const zero = ac.createGain(); zero.gain.value = 0;
      master.connect(sp); sp.connect(zero); zero.connect(ac.destination);
      sp.onaudioprocess = e => {
        for (let c = 0; c < 2; c++) {
          const d = e.inputBuffer.getChannelData(c);
          for (let i = 0; i < d.length; i++) window.__ceiling = Math.max(window.__ceiling, Math.abs(d[i]));
        }
      };
      window.__ceilingTap = sp;
    })()`);
    await sleep(20000);
    const max = await evaluate(`(() => {
      master.disconnect(window.__ceilingTap);
      window.__ceilingTap.disconnect();
      return window.__ceiling;
    })()`);
    return (max > 0.1 && max <= 0.98) || { max };
  });

  await check("sound off suspends and back on keeps the mood", async () => {
    await evaluate(`PIXEL.audioToggle()`);
    const suspended = await until(() => evaluate(`ac && ac.state === "suspended"`), 4000);
    await evaluate(`PIXEL.audioToggle()`);
    const running = await until(() => evaluate(`PIXEL.audio().state === "running"`), 6000);
    const mood = await evaluate(`PIXEL.audio().mood`);
    return (suspended && running && mood === "lofi") || { suspended, running, mood };
  });

  await check("city remembers a sound-on lo-fi preference", async () => {
    await loadWith("index.html", "pagoda-pixel-window.v1",
      { city: "sydney", vol: 0.3, soundOn: true, mood: "lofi" });
    const r = await evaluate(`(() => ({
      mood: PIXEL.audio().mood,
      armed: gestureArmed,
      ac: ac === null,
      value: document.getElementById("mood").value
    }))()`);
    return (r.mood === "lofi" && r.armed === true && r.ac === true && r.value === "lofi") || r;
  });

  await check("missing or unknown city mood falls back to city", async () => {
    await loadWith("index.html", "pagoda-pixel-window.v1", { city: "sydney", vol: 0.3 });
    const plain = await evaluate(`PIXEL.audio().mood`);
    await loadWith("index.html", "pagoda-pixel-window.v1",
      { city: "sydney", vol: 0.3, mood: "nope" });
    const unknown = await evaluate(`PIXEL.audio().mood`);
    return (plain === "city" && unknown === "city") || { plain, unknown };
  });

  await check("garden follows its place", async () => {
    await load("voxel-garden/index.html?city=hongkong");
    const r = await evaluate(`(() => ({
      name: musicProfile().name,
      options: [...document.querySelectorAll("#mood option")].map(o => o.value)
    }))()`);
    return (r.name.startsWith("hongkong") &&
      JSON.stringify(r.options) === JSON.stringify(MOOD_IDS)) || r;
  });

  await check("garden sound, place change and saved mood", async () => {
    await evaluate(`setSoundOn(true)`);
    const running = await until(() => evaluate(`ac && ac.state === "running"`), 6000);
    await evaluate(`selectPlace(5)`);
    const name = await evaluate(`musicProfile().name`);
    await evaluate(`setMood("lofi")`);
    const saved = JSON.parse(await evaluate(`localStorage.getItem("pagoda-garden.v4")`));
    return (running && name === "sydney · bright major" &&
      saved.mood === "lofi" && saved.soundOn === true) || { running, name, saved };
  });

  await check("garden remembers a sound-on lo-fi preference", async () => {
    const stored = { vol: 0.3, zoom: 1, place: 5, infoOpen: true, soundOn: true, mood: "lofi" };
    await loadWith("voxel-garden/index.html", "pagoda-garden.v4", stored);
    const r = await evaluate(`(() => ({
      mood: moodId,
      armed: gestureArmed,
      ac: ac === null,
      value: document.getElementById("mood").value
    }))()`);
    return (r.mood === "lofi" && r.armed === true && r.ac === true && r.value === "lofi") || r;
  });

  await check("lo-fi hat is audible and sits under the snare", async () => {
    await load("index.html?city=vancouver");
    await evaluate(`PIXEL.audioMood("lofi"); PIXEL.audioToggle()`);
    const running = await until(() => evaluate(`PIXEL.audio().state === "running"`), 6000);
    if (!running) return { state: await evaluate(`PIXEL.audio().state`) };
    await sleep(2500);
    // stop the beat, mute the beds and capture the true peak of the master
    await evaluate(`(() => {
      lofiRunning = false;
      lofiCrackleGain.gain.value = 0;
      vol = 1;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.value = masterLevel();
      airGain.disconnect(); rainGain.disconnect();
      window.__peak = 0;
      const sp = ac.createScriptProcessor(1024, 2, 1);
      const zero = ac.createGain(); zero.gain.value = 0;
      master.connect(sp); sp.connect(zero); zero.connect(ac.destination);
      sp.onaudioprocess = e => {
        for (let c = 0; c < 2; c++) {
          const d = e.inputBuffer.getChannelData(c);
          for (let i = 0; i < d.length; i++) window.__peak = Math.max(window.__peak, Math.abs(d[i]));
        }
      };
      window.__tap = sp;
    })()`);
    await sleep(5500);                       // let the queued beat and its tail finish
    const hit = async (call) => {
      let sum = 0;
      for (let i = 0; i < 3; i++) {
        await evaluate(`window.__peak = 0; ${call}(ac.currentTime + 0.05, ${call === "lofiHat" ? 0.7 : 0.9})`);
        await sleep(1400);
        sum += await evaluate(`window.__peak`);
      }
      return sum / 3;
    };
    const hat = await hit("lofiHat");
    const snare = await hit("lofiSnare");
    return (hat >= snare * 0.09 && hat <= snare / 3) || { hat, snare };
  });

  await load("index.html?city=vancouver");
  await evaluate(`PIXEL.audioToggle()`);
  await until(() => evaluate(`PIXEL.audio().state === "running"`), 6000);

  for (const id of MOOD_IDS.slice(2)) {
    await check(`${id} mood is audible and stays below full scale`, async () => {
      await evaluate(`PIXEL.audioMood(${JSON.stringify(id)})`);
      await sleep(3000);
      await evaluate(`(() => {
        vol = 1;
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.value = masterLevel();
      })()`);
      await evaluate(`(() => {
        window.__moodMax = 0;
        window.__moodSum = 0;
        window.__moodCount = 0;
        const sp = ac.createScriptProcessor(1024, 2, 1);
        const zero = ac.createGain(); zero.gain.value = 0;
        master.connect(sp); sp.connect(zero); zero.connect(ac.destination);
        sp.onaudioprocess = e => {
          for (let c = 0; c < 2; c++) {
            const d = e.inputBuffer.getChannelData(c);
            for (let i = 0; i < d.length; i++) {
              const v = d[i];
              window.__moodMax = Math.max(window.__moodMax, Math.abs(v));
              window.__moodSum += v * v;
              window.__moodCount++;
            }
          }
        };
        window.__moodTap = sp;
      })()`);
      await sleep(12000);
      const r = await evaluate(`(() => {
        master.disconnect(window.__moodTap);
        window.__moodTap.disconnect();
        return { max: window.__moodMax,
                 rms: Math.sqrt(window.__moodSum / Math.max(1, window.__moodCount)) };
      })()`);
      const layers = await evaluate(`padLayers.length`);
      const usesPad = await evaluate(`MOODS[${JSON.stringify(id)}].usesPad`);
      return (r.max > 0.1 && r.max <= 0.98 && r.rms >= 0.06 && r.rms <= 0.40 &&
        layers === 0 && usesPad === false) || { max: r.max, rms: r.rms, layers };
    });
  }

  await check("moods leave nothing running", async () => {
    await evaluate(`PIXEL.audioMood("city")`);
    await sleep(4000);
    const count = await evaluate(`moodVoices.length`);
    return count === 0 || count;
  });

  await check("every mood restarts after sound off and on", async () => {
    await evaluate(`PIXEL.audioMood("waves")`);
    await evaluate(`PIXEL.audioToggle()`);
    const suspended = await until(() => evaluate(`ac && ac.state === "suspended"`), 4000);
    await evaluate(`PIXEL.audioToggle()`);
    const running = await until(() => evaluate(`PIXEL.audio().state === "running"`), 6000);
    await sleep(1000);
    const r = await evaluate(`(() => ({ mood: PIXEL.audio().mood, voices: moodVoices.length }))()`);
    return (suspended && running && r.mood === "waves" && r.voices >= 1) ||
      { suspended, running, mood: r.mood, voices: r.voices };
  });

  await check("no uncaught page exceptions", async () => b.exceptions.length === 0 || b.exceptions.slice(0, 3));
} catch (e) {
  await check("harness", () => { throw e; });
} finally {
  try { b && await b.close(); } catch {}
}

process.exit(report() ? 1 : 0);
