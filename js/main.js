import * as THREE from 'three';
import { City, fetchData, fetchTerrain } from './data.js?v=20261127195519';
import { buildWorld } from './world.js?v=20261127195519';
import { loadModels } from './models.js?v=20261127195519';
import { Game } from './game.js?v=20261127195519';
import { Hud } from './hud.js?v=20261127195519';
import { Input } from './input.js?v=20261127195519';
import { PrisonFX } from './prisonfx.js?v=20261127195519';
import { Audio } from './audio.js?v=20261127195519';
import { clamp, lerp, nextFrame } from './util.js?v=20261127195519';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);

/**
 * Zvuk zabouchnutých vězeňských mříží (syntetizovaný): ostrý kovový úder, těžké žuchnutí, zvonění tyčí
 * se záznějemi (rozladěné dvojice parciál), cvaknutí zámku a ozvěna betonové chodby.
 */
let gateCtx = null;
function gateSlam() {
  try {
    gateCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const c = gateCtx;
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime + 0.01;
    const noiseBuf = (dur) => { const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
    // ozvěna betonové chodby (generovaná impulzní odezva)
    const ir = c.createBuffer(2, c.sampleRate * 2.2, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2) * (i < 900 ? 0.2 : 1); }
    const rev = c.createConvolver(); rev.buffer = ir;
    const dry = c.createGain(), wet = c.createGain(); dry.gain.value = 0.85; wet.gain.value = 0.38;
    dry.connect(c.destination); rev.connect(wet).connect(c.destination);
    const bus = c.createGain(); bus.gain.value = 0.95; bus.connect(dry); bus.connect(rev);
    const hit = (t, amp, bright) => {
      // ostrý kovový „cink“ (pásmový šum)
      const n = c.createBufferSource(); n.buffer = noiseBuf(0.12);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = bright; bp.Q.value = 1.2;
      const g = c.createGain(); g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      n.connect(bp).connect(g).connect(bus); n.start(t);
    };
    // 1) hlavní náraz: těžké žuchnutí + ostrý kov
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.25);
    og.gain.setValueAtTime(0.9, t0); og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    o.connect(og).connect(bus); o.start(t0); o.stop(t0 + 0.4);
    hit(t0, 1.0, 3200); hit(t0 + 0.004, 0.7, 1500);
    // 2) zvonění ocelových tyčí: rozladěné dvojice → chvějivé záznějě, dlouhý dozvuk
    for (const [f, a, dcy] of [[310, 0.16, 2.4], [523, 0.12, 2.0], [846, 0.1, 1.6], [1187, 0.07, 1.3], [1659, 0.05, 1.0], [2241, 0.035, 0.8], [3170, 0.02, 0.5]]) {
      for (const det of [-1, 1]) {
        const p2 = c.createOscillator(), pg = c.createGain();
        p2.type = 'sine'; p2.frequency.value = f + det * (1.5 + f * 0.003);
        pg.gain.setValueAtTime(0, t0); pg.gain.linearRampToValueAtTime(a, t0 + 0.004); pg.gain.exponentialRampToValueAtTime(0.0004, t0 + dcy);
        p2.connect(pg).connect(bus); p2.start(t0); p2.stop(t0 + dcy + 0.05);
      }
    }
    // 3) drnčení tyčí v rámu (rychlé opakované cinknutí)
    for (let k = 0; k < 7; k++) hit(t0 + 0.05 + k * 0.035 + Math.random() * 0.01, 0.25 * (1 - k / 7), 2400 + Math.random() * 1200);
    // 4) cvaknutí zámku
    hit(t0 + 0.42, 0.5, 4200); hit(t0 + 0.47, 0.35, 2600);
    const lo = c.createOscillator(), lg = c.createGain();
    lo.type = 'square'; lo.frequency.value = 180; lg.gain.setValueAtTime(0.08, t0 + 0.42); lg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    lo.connect(lg).connect(bus); lo.start(t0 + 0.42); lo.stop(t0 + 0.52);
  } catch { /* bez zvuku */ }
}
// mříž na úvodu: zvuk v okamžiku dopadu; kliknutím na nápis se celý efekt přehraje znovu (i se zvukem)
{
  const stage = document.querySelector('.logo-stage'), gate = stage?.querySelector('.gate');
  if (gate) {
    gate.addEventListener('animationstart', () => setTimeout(gateSlam, 520));
    stage.style.cursor = 'pointer';
    stage.addEventListener('click', () => {
      const logo = stage.querySelector('.logo');
      for (const el of [gate, logo]) { el.style.setProperty('animation', 'none', 'important'); void el.offsetWidth; el.style.removeProperty('animation'); }
    });
  }
}

// automatická aktualizace: když je na webu novější verze (jiné ?v= u main.js), stránka se sama obnoví
(async () => {
  try {
    const cur = (document.querySelector('script[type=module][src*="main.js"]')?.src.match(/v=(\d+)/) || [])[1];
    const html = await (await fetch(`index.html?ts=${Date.now()}`, { cache: 'no-store' })).text();
    const live = (html.match(/main\.js\?v=(\d+)/) || [])[1];
    if (cur && live && live !== cur && sessionStorage.getItem('vv-reload') !== live) {
      sessionStorage.setItem('vv-reload', live);
      location.replace(location.pathname + '?v=' + live);
    }
  } catch { /* offline */ }
})();
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;

if ($('btn-about')) $('btn-about').onclick = () => ($('about').hidden = !$('about').hidden);
$('btn-play').onclick = start;

const audio = new Audio();

/** Nápověda s klávesovými zkratkami: Tab, F1, ?, tlačítko vlevo nahoře nebo křížek. */
const tbUp = $('tb-up'), tbDown = $('tb-down');

// telefony (hlavně iPhone) pustí zvuk a hlášení rozhlasu až po dotyku: při každém dotyku probudíme zvuk,
// při prvním dotyku odemkneme hlasový výstup tichou větou
let speechUnlocked = false;
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* iPhone: zvuk i při ztlumení */ }
const unlockSound = () => {
  try { if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume(); } catch { /* bez zvuku */ }
  PrisonFX.unlockVoice();
  if (!speechUnlocked && window.speechSynthesis) {
    speechUnlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'cs-CZ'; speechSynthesis.speak(u); speechSynthesis.getVoices(); } catch { /* bez hlasu */ }
  }
};
for (const ev of ['touchend', 'pointerdown', 'keydown']) addEventListener(ev, unlockSound, { capture: true, passive: true });
function toggleHelp(show) {
  const el = $('controls');
  el.hidden = show === undefined ? !el.hidden : !show;
  if (!el.hidden && document.pointerLockElement) document.exitPointerLock();
}
$('help-btn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleHelp(); e.currentTarget.blur(); });
$('controls')?.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.closest('[data-close]')) toggleHelp(false); });
addEventListener('keydown', (e) => { if (e.key === '?') toggleHelp(); if (e.code === 'F1') e.preventDefault(); });
let started = false;

async function start() {
  if (started) return;
  started = true;
  audio.start();
  $('menu').hidden = true;
  $('loading').hidden = false;
  const bar = $('load-bar'), label = $('load-label'), pct = $('load-pct'), sub = $('load-sub');
  const progress = (p, text, s = '') => {
    bar.style.width = Math.round(p * 100) + '%';
    pct.textContent = Math.round(p * 100) + ' %';
    if (text) label.textContent = text;
    sub.textContent = s;
  };
  try {
    progress(0, 'Stahuji mapu Vinařic');
    const terrainP = fetchTerrain('data/terrain.bin');
    const raw = await fetchData('data/vinarice.json', (p, got) => progress(p * 0.3, 'Stahuji mapu Vinařic', `${(got / 1e6).toFixed(1)} MB · OpenStreetMap`));
    const terrain = await terrainP;
    progress(0.31, 'Skládám ulice do sítě');
    await nextFrame();
    const city = new City(raw, terrain);
    await run(city, (p, t) => progress(0.33 + p * 0.65, t, `${city.buildings.length.toLocaleString('cs-CZ')} budov · ${city.roads.length.toLocaleString('cs-CZ')} úseků ulic`));
  } catch (e) {
    console.error(e);
    label.textContent = 'Něco se pokazilo';
    sub.textContent = String(e.message || e);
  }
}

/** Ortofoto ČÚZK složené do 4 dílů (pokud chybí, hra jede bez něj). */
async function loadOrtho(renderer) {
  const q = mobile ? 'lo' : 'hi';
  const loader = new THREE.TextureLoader();
  try {
    const ts = await Promise.all(['00', '10', '01', '11'].map((k) => loader.loadAsync(`data/ortho/ortho_${q}_${k}.jpg`)));
    for (const t of ts) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    return ts;
  } catch {
    return null;
  }
}

async function run(city, progress) {
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 2600);
  scene.fog = new THREE.Fog('#c8d6e2', 300, 1500);

  const hemi = new THREE.HemisphereLight('#dfeaf5', '#6b6455', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -150; sc.right = sc.top = 150; sc.near = 10; sc.far = 800;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // obloha – fyzikální model (Preetham)
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
  scene.add(sky);
  // odrazy prostředí (lak aut, sklo)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  // hvězdy
  const starG = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI * 0.45;
    sp.push(Math.cos(a) * Math.cos(b) * 2200, Math.sin(b) * 2200 + 50, Math.sin(a) * Math.cos(b) * 2200);
  }
  starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  const stars = new THREE.Points(starG, starMat);
  scene.add(stars);

  // déšť
  const RN = mobile ? 1500 : 4000;
  const rainG = new THREE.BufferGeometry();
  const rp = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) {
    const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80;
    rp.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
  }
  rainG.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: '#aabbcc', transparent: true, opacity: 0.45 }));
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  progress(0.02, 'Načítám letecké snímky ČÚZK, auta a lidi');
  const [ortho] = await Promise.all([loadOrtho(renderer), loadModels(mobile)]);
  const world = await buildWorld(city, scene, progress, mobile, ortho);
  progress(0.88, 'Vypouštím autobusy na linky');
  await nextFrame();
  const input = new Input(canvas);
  const hud = new Hud(city);
  const game = new Game({ city, world, scene, camera, input, hud, audio, mobile });
  progress(0.97, 'Světla a stíny');
  await nextFrame();
  renderer.compile(scene, camera);
  // postprocessing: ambientní okluze (jen desktop)
  let composer = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.2 });
    ao.blendIntensity = 0.9;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  }
  progress(1, 'Hotovo');
  await nextFrame();

  $('loading').hidden = true;
  $('hud').hidden = false;
  if (input.touch) $('touch').hidden = false;
  input.enabled = true;
  hud.toast(input.touch
    ? 'Vítej ve věznici Vinařice! U budovy C stojí auto, motorka a vrtulník – ťukni na E. Akce najdeš v menu ☰ Věznice.'
    : 'Vítej ve věznici Vinařice! U budovy C stojí auto, motorka a vrtulník – stiskni E. Akce spustíš tlačítky vlevo nahoře.');
  game.msgT = 9;

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    composer?.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------- čas a počasí ----------
  let hour = 15;
  const WEATHER = [
    { n: 'jasno', fog: 1, light: 1, rain: false, cloud: 0 },
    { n: 'polojasno', fog: 0.85, light: 0.85, rain: false, cloud: 0.3 },
    { n: 'zataženo', fog: 0.6, light: 0.6, rain: false, cloud: 0.7 },
    { n: 'déšť', fog: 0.4, light: 0.45, rain: true, cloud: 1 },
  ];
  let weather = WEATHER[0], weatherNext = 18 * 60;
  const dayTop = new THREE.Color('#4f8fd0'), dayBot = new THREE.Color('#d8e6f0');
  const nightTop = new THREE.Color('#050912'), nightBot = new THREE.Color('#1a2234');
  const duskBot = new THREE.Color('#f0a46a');
  const grey = new THREE.Color('#9aa3ab');
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();

  // zrychlené přetáčení času: 1× → 5× → 20× → 60× → 1×
  const SPEEDS = [1, 5, 20, 60];
  function cycleTime() {
    const i = SPEEDS.indexOf(game.timeFast || 1);
    game.timeFast = SPEEDS[(i + 1) % SPEEDS.length];
    game.toast(game.timeFast > 1 ? `⏩ Čas běží ${game.timeFast}× rychleji (P = další rychlost)` : 'Čas běží normálně');
  }
  $('clock').addEventListener('click', cycleTime);
  $('clock').title = 'Přetáčení času (P)';

  function environment(dt) {
    if (game.setHour != null) { hour = game.setHour; game.setHour = null; game.hourJumped = true; } // přeskok času
    // 1 herní hodina = 1 minuta; u věznice se při výdeji jídla zpomalí; P = zrychlené přetáčení (pak se zpomalení vypne)
    const fast = game.timeFast || 1;
    hour = (hour + (dt / 60) * (fast > 1 ? fast : 1 / (game.timeSlow || 1))) % 24;
    game.hour = hour;
    weatherNext -= dt;
    if (weatherNext <= 0) {
      const r = Math.random();
      weather = r < 0.45 ? WEATHER[0] : r < 0.7 ? WEATHER[1] : r < 0.87 ? WEATHER[2] : WEATHER[3];
      weatherNext = 240 + Math.random() * 300;
    }
    const ang = ((hour - 6) / 24) * Math.PI * 2; // 6:00 východ, 18:00 západ
    const elev = Math.sin(ang);
    const day = clamp(elev * 3 + 0.25, 0, 1);
    const dusk = clamp(1 - Math.abs(elev) * 5, 0, 1) * (elev > -0.2 ? 1 : 0);
    const F = game.focus();
    const sd = new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.08, elev), 0.45).normalize();
    const fy = F.y || 0;
    sun.position.set(F.x + sd.x * 300, fy + sd.y * 300, F.z + sd.z * 300);
    sun.target.position.set(F.x, fy, F.z);
    sun.intensity = 2.4 * day * weather.light;
    sun.color.set(dusk > 0.3 ? '#ffc690' : '#fff3e0');
    hemi.intensity = 0.25 + 0.75 * day * (0.6 + weather.light * 0.4);
    tmpA.copy(nightTop).lerp(dayTop, day).lerp(grey, weather.cloud * 0.6 * day);
    tmpB.copy(nightBot).lerp(dayBot, day).lerp(duskBot, dusk * 0.7).lerp(grey, weather.cloud * 0.5 * day);
    su.sunPosition.value.set(Math.cos(ang) * 0.8, elev, 0.45);
    su.turbidity.value = 2 + weather.cloud * 10;
    su.rayleigh.value = 2 + weather.cloud * 1.5;
    scene.environmentIntensity = 0.12 + 0.45 * day;
    scene.fog.color.copy(tmpB);
    renderer.toneMappingExposure = 0.55 + 0.45 * day;
    scene.fog.near = 200 * weather.fog;
    scene.fog.far = (mobile ? 1000 : 1500) * weather.fog;
    sky.position.copy(camera.position);
    stars.position.copy(sky.position);
    starMat.opacity = clamp(1 - day * 2, 0, 1) * (1 - weather.cloud);
    const night = clamp(1 - day * 1.6, 0, 1);
    world.update(dt, game.time, night);
    rain.visible = weather.rain;
    if (rain.visible) {
      rain.position.set(camera.position.x, camera.position.y - 20, camera.position.z);
      const a = rainG.attributes.position.array;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= dt * 28; a[i + 4] -= dt * 28;
        if (a[i + 1] < 0) { a[i + 1] += 40; a[i + 4] += 40; }
      }
      rainG.attributes.position.needsUpdate = true;
    }
    const hh = Math.floor(hour), mm = Math.floor((hour % 1) * 60);
    return `${hh}:${String(mm).padStart(2, '0')} · ${weather.n}${fast > 1 ? ` · ⏩ ${fast}×` : ''}`;
  }

  // ---------- smyčka ----------
  let last = performance.now();
  let paused = false;
  const perf = { t: 0, n: 0 };
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    const dt = Math.min(0.05, rawDt);
    last = now;
    // menu klávesy
    if (input.hit('Tab') || input.hit('F1')) toggleHelp();
    if (input.touch) {
      // dotyková tlačítka: popisky podle toho, co právě dělají
      const air = game.mode === 'heli' || game.mode === 'jet' || (game.mode === 'foot' && game.jetpack);
      const st = game.mode === 'car' ? ['🛑', ''] : air ? ['▲', '▼'] : ['⤒', '🏃'];
      if (tbUp.textContent !== st[0]) tbUp.textContent = st[0];
      if (tbDown.textContent !== (st[1] || '🏃')) tbDown.textContent = st[1] || '🏃';
      tbDown.style.visibility = st[1] ? '' : 'hidden';
    }
    // M: se zbraní v ruce (pěšky) střílí, jinak velká mapa
    const armed = game.mode === 'foot' && game.weapons?.slot > 0;
    if (input.hit('KeyM') && (!armed || hud.bigMapOpen)) { if (hud.bigMapOpen) hud.closeBigMap(); else hud.openBigMap(game); }
    if (input.hit('KeyT')) { if (hud.teleportOpen) hud.closeTeleport(); else hud.openTeleport(game); }
    if (input.hit('KeyN')) { if (hud.teleportOpen) hud.closeTeleport(); else hud.openNav(game); }
    if (input.hit('KeyR')) game.restart();
    if (input.hit('KeyP') && !game.handleP()) cycleTime(); // P: katapultáž / padák, jinak denní doba
    if (input.hit('KeyJ')) game.toggleJetpack();
    if (input.hit('Escape')) { hud.closeBigMap(); hud.closeTeleport(); $('controls').hidden = true; }
    paused = hud.bigMapOpen || hud.teleportOpen;
    if (!paused) {
      game.update(dt);
      game.updateGps(dt);
    }
    const clock = environment(paused ? 0 : dt);
    hud.update(game, dt, clock);
    input.endFrame();
    // automatická kvalita: když hra trhá, vypne se okluze a zmenší stíny
    if (!document.hidden && rawDt > 0 && rawDt < 0.25) {
      perf.t += rawDt; perf.n++;
      if (perf.t > 4) {
        const fps = perf.n / perf.t;
        if (fps < 40 && composer) { composer = null; }
        else if (fps < 40 && sun.shadow.mapSize.x > 2048) { sun.shadow.mapSize.set(2048, 2048); sun.shadow.map?.dispose(); sun.shadow.map = null; }
        perf.t = 0; perf.n = 0;
      }
    }
    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__game = game; // ladění
}
