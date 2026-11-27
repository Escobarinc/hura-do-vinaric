/**
 * 3D modely ze sad Kenney Car Kit (CC0) a Quaternius Ultimate Animated Character Pack (CC0).
 * Když se nenačtou, hra použije procedurální auta a postavy z entities.js.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { pick } from './util.js?v=20261127150739';

export const KIT = { cars: {}, chars: [], ready: false };

// civilní auta (váha = četnost v provozu)
const CIVIL = { sedan: 5, 'hatchback-sports': 3, suv: 3, 'suv-luxury': 2, 'sedan-sports': 1, van: 2, delivery: 1, taxi: 1 };
const OTHER = ['police', 'ambulance', 'garbage-truck', 'firetruck'];
const PAINTED = new Set(['sedan', 'hatchback-sports', 'suv', 'suv-luxury', 'sedan-sports', 'van', 'delivery']);
// typické barvy aut na českých silnicích
const PAINTS = ['#e9eaea', '#e9eaea', '#b8bcc1', '#8a9097', '#4a4e54', '#1b1c1f', '#1b1c1f', '#1f3c72', '#8a1c1c', '#2c5a3c', '#a99f8c', '#56708c', '#6b2c2c', '#c49a2a', '#3d6e8f', '#d3561f'];

const CHARS_DESKTOP = ['Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual2_Female', 'Casual3_Male', 'Casual3_Female', 'Casual_Bald', 'Suit_Male', 'Suit_Female', 'OldClassy_Male', 'OldClassy_Female', 'Worker_Male', 'Worker_Female', 'Doctor_Male_Young', 'Doctor_Female_Young'];
const CHARS_MOBILE = ['Casual_Male', 'Casual_Female', 'Casual2_Male', 'Casual3_Female', 'Suit_Male', 'OldClassy_Female'];
export const PLAYER_CHAR = 'Casual_Male';

/* ---------------- načtení ---------------- */
export async function loadModels(mobile, onProgress) {
  const loader = new GLTFLoader();
  const carNames = [...Object.keys(CIVIL), ...OTHER];
  const charNames = mobile ? CHARS_MOBILE : CHARS_DESKTOP;
  const total = carNames.length + charNames.length;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  try {
    await Promise.all([
      ...carNames.map(async (n) => {
        const g = await loader.loadAsync(`assets/cars/${n}.glb`);
        KIT.cars[n] = prepCar(g.scene, n);
        tick();
      }),
      ...charNames.map(async (n) => {
        const g = await loader.loadAsync(`assets/chars/${n}.glb`);
        KIT.chars.push(prepChar(g, n));
        tick();
      }),
    ]);
    KIT.ready = true;
  } catch (e) {
    console.warn('Modely se nenačetly, používám náhradní:', e);
    KIT.ready = false;
  }
  return KIT.ready;
}

/* ---------------- auta ---------------- */
// rozměry: Kenney auto je ~1,5 × 2,5 jednotky → skutečné ~1,85 × 4,3 m
const SX = 1.22, SY = 1.32, SZ = 1.7;

function prepCar(scene, name) {
  let body = null;
  const wheels = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name.startsWith('wheel')) wheels.push(o);
    else if (o.name === 'body' || (!body && !o.name.startsWith('wheel'))) body = body || o;
  });
  // které políčko palety je lak (největší plocha karoserie mimo šedé/sklo)
  let paintCell = null;
  if (PAINTED.has(name)) paintCell = findPaintCell(scene);
  const box = new THREE.Box3().setFromObject(scene);
  const src = scene.traverse ? scene : null;
  const baseMat = body.material;
  baseMat.map.colorSpace = THREE.SRGBColorSpace;
  return { scene: src, name, paintCell, baseMat, L: (box.max.z - box.min.z) * SZ, W: (box.max.x - box.min.x) * SX, top: box.max.y * SY };
}

let paletteImg = null;
function findPaintCell(scene) {
  const area = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.name.startsWith('wheel')) return;
    paletteImg = paletteImg || o.material.map.image;
    const g = o.geometry, uv = g.attributes.uv, pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      const ar = b.sub(a).cross(c.sub(a)).length();
      const u = uv.getX(i0), v = uv.getY(i0);
      const key = Math.min(7, Math.floor(u * 8)) + ',' + Math.min(3, Math.floor(v * 4));
      area.set(key, (area.get(key) || 0) + ar);
    }
  });
  const ctx = paletteCtx();
  let best = null, bestA = 0;
  for (const [key, ar] of area) {
    const [cx, cy] = key.split(',').map(Number);
    const d = ctx.getImageData(cx * 64 + 16, cy * 128 + 60, 1, 1).data;
    const mx = Math.max(d[0], d[1], d[2]), mn = Math.min(d[0], d[1], d[2]);
    const sat = mx ? (mx - mn) / mx : 0;
    const glass = cy === 0 && cx <= 1; // světle modrá skla
    if (sat < 0.25 || glass) continue;
    if (ar > bestA) { bestA = ar; best = [cx, cy]; }
  }
  return best;
}

let _pctx = null;
function paletteCtx() {
  if (_pctx) return _pctx;
  const cv = document.createElement('canvas');
  cv.width = paletteImg.width; cv.height = paletteImg.height;
  _pctx = cv.getContext('2d', { willReadFrequently: true });
  _pctx.drawImage(paletteImg, 0, 0);
  return _pctx;
}

const paintCache = new Map();
function paintedMaterial(base, cell, color) {
  const key = cell + '|' + color;
  if (paintCache.has(key)) return paintCache.get(key);
  const src = paletteCtx();
  const W = src.canvas.width, H = src.canvas.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(src.canvas, 0, 0);
  const cw = W / 8, ch = H / 4;
  const x0 = cell[0] * cw, y0 = cell[1] * ch;
  const img = ctx.getImageData(x0, y0, cw, ch);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  const mean = sum / (d.length / 4) || 1;
  const t = new THREE.Color(color);
  const tr = Math.round(t.r * 255), tg = Math.round(t.g * 255), tb = Math.round(t.b * 255);
  for (let i = 0; i < d.length; i += 4) {
    const k = Math.min(1.35, (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / mean);
    d[i] = Math.min(255, tr * k); d[i + 1] = Math.min(255, tg * k); d[i + 2] = Math.min(255, tb * k);
  }
  ctx.putImageData(img, x0, y0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = base.map.flipY;
  tex.magFilter = base.map.magFilter; tex.minFilter = base.map.minFilter;
  const m = carMaterial(base, tex);
  paintCache.set(key, m);
  return m;
}

const matCache = new Map();
function carMaterial(base, map) {
  const m = new THREE.MeshPhysicalMaterial({ map: map || base.map, roughness: 0.42, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  return m;
}
function baseMaterial(base) {
  if (!matCache.has(base)) matCache.set(base, carMaterial(base));
  return matCache.get(base);
}

export function pickCarType() {
  let tot = 0;
  for (const k in CIVIL) tot += CIVIL[k];
  let r = Math.random() * tot;
  for (const k in CIVIL) if ((r -= CIVIL[k]) < 0) return k;
  return 'sedan';
}

/** Auto z Kenney sady se stejným rozhraním jako procedurální (userData L, W, paint, wheels, front). */
export function kitCar(type = pickCarType(), color = pick(PAINTS)) {
  const t = KIT.cars[type] || KIT.cars.sedan;
  const mat = t.paintCell ? paintedMaterial(t.baseMat, t.paintCell, color) : baseMaterial(t.baseMat);
  const g = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.scale.set(SX, SY, SZ);
  g.add(bodyG);
  const wheels = [], front = [];
  const ws = SY; // kola stejnoměrně, aby zůstala kulatá
  t.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Mesh(o.geometry, mat);
    m.castShadow = true;
    // světová transformace uvnitř modelu
    o.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    o.matrixWorld.decompose(p, q, s);
    if (o.name.startsWith('wheel')) {
      const pivot = new THREE.Group();
      pivot.position.set(p.x * SX, p.y * SY, p.z * SZ);
      const spin = new THREE.Group();
      spin.scale.setScalar(ws);
      spin.userData.r = 0.3 * ws;
      m.quaternion.copy(q);
      spin.add(m);
      pivot.add(spin);
      g.add(pivot);
      wheels.push(spin);
      if (o.name.includes('front')) front.push(pivot);
    } else {
      m.position.copy(p); m.quaternion.copy(q); m.scale.copy(s);
      bodyG.add(m);
    }
  });
  g.userData = { L: t.L, W: t.W, paint: mat, wheels, front, type, top: t.top, kit: true };
  return g;
}

/* ---------------- postavy ---------------- */
const HEIGHT = 1.76;

function prepChar(gltf, name) {
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false; // skinned mesh má nepřesný bounding box
      const m = o.material;
      if (m) {
        m.roughness = Math.max(m.roughness ?? 0.8, 0.75); m.metalness = 0;
        m.side = THREE.FrontSide;
        // export z Blenderu má prohozené barvy: „Skin“ je černá, „Face“ (oči) bílá
        if (m.name === 'Face' && m.color.r > 0.5) m.color.set('#1b1716');
        if (m.name === 'Skin' && m.color.r < 0.05) m.color.set('#e8b996');
      }
    }
  });
  const box = new THREE.Box3().setFromObject(scene, true);
  const h = box.max.y - box.min.y || 1;
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  return { scene, name, scale: HEIGHT / h, clips, female: name.includes('Female') };
}

const SKINS = ['#f1c9a5', '#e8b996', '#f5d6bd', '#e3b08c', '#d9a37f', '#f0c4a0', '#c48a62', '#8d5a3b'];
const SHIRT_TINTS = ['#c8452c', '#2f5d8a', '#3c7a4a', '#e2c044', '#5b5b5b', '#efefef', '#7a3e8a', '#1f2a3a', '#b55d2a', '#4b8fa6', '#8e8e86', '#a33a4a'];

/** Animovaná postava. Vrací Group se stejným rozhraním pro animateHuman. */
export function kitHuman(opts = {}) {
  let t;
  if (opts.name) t = KIT.chars.find((c) => c.name === opts.name);
  if (!t) {
    const pool = opts.female == null ? KIT.chars : KIT.chars.filter((c) => c.female === opts.female);
    t = pick(pool.length ? pool : KIT.chars);
  }
  const model = SkeletonUtils.clone(t.scene);
  const s = t.scale * (opts.scale ?? 0.94 + Math.random() * 0.1);
  model.scale.setScalar(s);
  // odstín pleti
  const skin = new THREE.Color(opts.skin || pick(SKINS));
  model.traverse((o) => {
    if (o.isMesh && o.material?.name === 'Skin') { o.material = o.material.clone(); o.material.color.copy(skin); }
  });
  // jednotné oblečení (ústavní oděv, uniforma)
  if (opts.uniform) {
    const top = new THREE.Color(opts.uniform.shirt), bot = new THREE.Color(opts.uniform.pants);
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const n = o.material.name || '';
      if (/shirt|jacket|top|vest|black|details/i.test(n)) { o.material = o.material.clone(); o.material.color.copy(top); }
      else if (/pants|belt/i.test(n)) { o.material = o.material.clone(); o.material.color.copy(bot); }
      else if (/hat|hair/i.test(n) && opts.uniform.hat) { o.material = o.material.clone(); o.material.color.set(opts.uniform.hat); }
    });
  }
  // drobná pestrost oblečení
  if (!opts.uniform && opts.tint !== false && Math.random() < 0.6) {
    const col = new THREE.Color(pick(SHIRT_TINTS));
    model.traverse((o) => {
      if (o.isMesh && o.material && /shirt|jacket|top|dress/i.test(o.material.name)) {
        o.material = o.material.clone();
        o.material.color.lerp(col, 0.55);
      }
    });
  }
  const g = new THREE.Group();
  g.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const k in t.clips) actions[k] = mixer.clipAction(t.clips[k]);
  for (const k of ['Death', 'Jump', 'Punch']) if (actions[k]) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
  const cur = actions.Idle;
  cur?.play();
  cur && (cur.time = Math.random() * cur.getClip().duration);
  mixer.update(0);
  g.userData = { mixer, actions, cur, model, kit: true, skip: 0 };
  return g;
}

const FALLBACK = { Run: 'Walk', Jump: 'Idle', Death: 'Idle', Punch: 'Idle', Walk: 'Idle' };
function play(u, name, fade = 0.2, restart = false) {
  let a = u.actions[name];
  for (let n = name; !a && FALLBACK[n]; n = FALLBACK[n]) a = u.actions[FALLBACK[n]];
  if (!a || (u.cur === a && !restart)) return a;
  a.reset();
  a.play();
  if (u.cur) a.crossFadeFrom(u.cur, fade, false);
  u.cur = a;
  return a;
}

/** speed v m/s; dt; far = vzdálená postava (animace méně často) */
export function animateKitHuman(h, speed, dt, mode) {
  const u = h.userData;
  if (mode === 'down') {
    play(u, 'Death', 0.12);
  } else if (mode === 'punch') {
    if (u.punchNew) { u.punchNew = false; const a = play(u, 'Punch', 0.06, true); if (a) a.timeScale = 1.6; }
  } else if (mode === 'air') {
    play(u, 'Jump', 0.1);
  } else if (speed > 5.2) {
    const a = play(u, 'Run');
    if (a) a.timeScale = u.actions.Run ? speed / 6.2 : speed / 2.2;
  } else if (speed > 0.2) {
    const a = play(u, 'Walk');
    if (a) a.timeScale = Math.max(0.6, speed / 1.5);
  } else {
    const a = play(u, 'Idle', 0.3);
    if (a) a.timeScale = 1;
  }
  u.mixer.update(dt);
}
