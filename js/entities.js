import * as THREE from 'three';
import { clamp, pick, wrapAngle } from './util.js?v=20261127134447';
import { labelTexture } from './textures.js?v=20261127134447';
import { KIT, kitCar, kitHuman, animateKitHuman } from './models.js?v=20261127134447';

/* =========================================================
 *  MATERIÁLY
 * ========================================================= */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const paintMat = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 });
const glassM = new THREE.MeshPhysicalMaterial({ color: '#0f161d', roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 });
const tyreM = std('#161616', { roughness: 0.92 });
const rimM = std('#b9bec4', { metalness: 0.85, roughness: 0.28 });
const darkM = std('#1c1d1f', { roughness: 0.75 });
const chromeM = std('#d8dadd', { metalness: 1, roughness: 0.15 });
const lightM = std('#fffaf0', { emissive: '#fff1c8', emissiveIntensity: 0.8, roughness: 0.1 });
const tailM = std('#5a0606', { emissive: '#ff2216', emissiveIntensity: 0.6, roughness: 0.2 });
const plateM = new THREE.MeshStandardMaterial({ map: labelTexture('S  2K7 3185', '#f4f4f0', '#111', 256, 56), roughness: 0.5 });

const CAR_COLORS = ['#f4f4f1', '#f4f4f1', '#c3c7cc', '#8a9097', '#3a3e44', '#121315', '#121315', '#1f3c72', '#7d1416', '#2c5a3c', '#b9b1a1', '#56708c', '#d7d9db', '#5c2424', '#c49a2a', '#3d6e8f'];

/* =========================================================
 *  KOLA
 * ========================================================= */
const wheelCache = {};
function wheelGeo(r, w) {
  const k = r + '_' + w;
  if (wheelCache[k]) return wheelCache[k];
  // zaoblená pneumatika (soustružený profil)
  const pts = [];
  const rr = r * 0.62;
  pts.push(new THREE.Vector2(rr, -w / 2));
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(r - w * 0.22 + Math.cos(a) * w * 0.22, Math.sin(a) * w * 0.5));
  }
  pts.push(new THREE.Vector2(rr, w / 2));
  const tyre = new THREE.LatheGeometry(pts, 28);
  tyre.rotateZ(Math.PI / 2);
  // disk s paprsky
  const rim = new THREE.CylinderGeometry(rr, rr * 0.96, w * 0.7, 24);
  rim.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(rr * 0.22, rr * 0.22, w * 0.82, 10);
  hub.rotateZ(Math.PI / 2);
  return (wheelCache[k] = { tyre, rim, hub });
}

function wheel(x, z, r, w, front) {
  const steer = new THREE.Group();
  steer.position.set(x, r, z);
  const spin = new THREE.Group();
  spin.userData.r = r;
  const g = wheelGeo(r, w);
  spin.add(new THREE.Mesh(g.tyre, tyreM), new THREE.Mesh(g.rim, rimM), new THREE.Mesh(g.hub, chromeM));
  // paprsky
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.74, r * 0.09, r * 0.5), darkM);
    s.rotation.x = (i / 5) * Math.PI * 2;
    s.position.set(0, Math.cos(s.rotation.x) * r * 0.26, -Math.sin(s.rotation.x) * r * 0.26);
    spin.add(s);
  }
  steer.add(spin);
  return { steer, spin, front };
}

/* =========================================================
 *  KAROSERIE – boční profil vytažený do šířky se zaoblením
 * ========================================================= */
const BODY = {
  // L délka, W šířka, r kolo, belt výška linie oken, roof výška střechy,
  // body: profil spodní části [z, y] od zadku dopředu; cabin: profil kabiny
  hatch: { L: 4.05, W: 1.76, r: 0.32, wb: 2.5,
    body: [[-2.02, 0.3], [-2.05, 0.62], [-2.0, 0.95], [-1.75, 1.0], [1.05, 0.98], [1.85, 0.84], [2.03, 0.66], [2.0, 0.3]],
    cabin: [[-1.9, 0.98], [-1.72, 1.44], [0.1, 1.48], [1.05, 0.98]] },
  combi: { L: 4.68, W: 1.82, r: 0.33, wb: 2.68,
    body: [[-2.33, 0.3], [-2.36, 0.64], [-2.3, 0.98], [-2.05, 1.02], [1.25, 1.0], [2.1, 0.86], [2.34, 0.66], [2.3, 0.3]],
    cabin: [[-2.25, 1.0], [-2.15, 1.47], [0.3, 1.5], [1.25, 1.0]] },
  sedan: { L: 4.7, W: 1.82, r: 0.33, wb: 2.7,
    body: [[-2.33, 0.32], [-2.36, 0.66], [-2.28, 1.0], [-1.55, 1.04], [1.25, 1.0], [2.1, 0.86], [2.34, 0.66], [2.3, 0.3]],
    cabin: [[-1.6, 1.03], [-0.95, 1.45], [0.35, 1.47], [1.25, 1.0]] },
  suv: { L: 4.55, W: 1.9, r: 0.38, wb: 2.65,
    body: [[-2.26, 0.4], [-2.29, 0.75], [-2.25, 1.12], [-2.0, 1.16], [1.2, 1.14], [2.05, 1.0], [2.27, 0.8], [2.24, 0.4]],
    cabin: [[-2.18, 1.14], [-2.08, 1.68], [0.4, 1.72], [1.2, 1.14]] },
  mini: { L: 3.6, W: 1.65, r: 0.3, wb: 2.4,
    body: [[-1.79, 0.3], [-1.82, 0.62], [-1.78, 0.96], [-1.55, 1.0], [0.85, 0.98], [1.6, 0.84], [1.8, 0.64], [1.77, 0.3]],
    cabin: [[-1.7, 0.98], [-1.55, 1.46], [0.1, 1.5], [0.85, 0.98]] },
  van: { L: 5.0, W: 2.0, r: 0.36, wb: 3.1,
    body: [[-2.48, 0.38], [-2.5, 1.0], [-2.48, 1.15], [1.6, 1.15], [2.2, 1.0], [2.5, 0.8], [2.46, 0.38]],
    cabin: [[-2.45, 1.14], [-2.45, 2.2], [1.15, 2.2], [1.6, 1.15]] },
};

function roundedShape(pts, smooth = 0.35) {
  const s = new THREE.Shape();
  const n = pts.length;
  // zaoblené rohy pomocí kvadratických křivek
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const start = mid(pts[0], pts[1], 0.5);
  s.moveTo(start[0], start[1]);
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], prev = pts[i - 1], next = pts[(i + 1) % n];
    const a = mid(prev, p, 1 - smooth * 0.5 > 0.5 ? 1 - smooth * 0.5 : 0.5);
    const b = mid(p, next, smooth * 0.5);
    s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p[0], p[1], b[0], b[1]);
    const m = mid(p, next, 0.5);
    s.lineTo(m[0], m[1]);
  }
  return s;
}

const bodyCache = {};
function carGeos(type) {
  if (bodyCache[type]) return bodyCache[type];
  const d = BODY[type];
  const ext = (pts, width, bevel, smooth) => {
    const g = new THREE.ExtrudeGeometry(roundedShape(pts, smooth), {
      depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: 6,
    });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(-Math.PI / 2); // délka → osa z
    g.computeVertexNormals();
    return g;
  };
  // spodní část karoserie s vykrojenými podběhy kol
  const bodyShape = () => {
    const pts = d.body;
    const sh = new THREE.Shape();
    const n = pts.length;
    const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const a = mid(pts[i - 1], pts[i], 0.6), b = mid(pts[i], pts[i + 1], 0.4);
      sh.lineTo(a[0], a[1]);
      sh.quadraticCurveTo(pts[i][0], pts[i][1], b[0], b[1]);
    }
    sh.lineTo(pts[n - 1][0], pts[n - 1][1]);
    const R = d.r + 0.07, wz = d.wb / 2, y0 = pts[n - 1][1];
    for (const cz of [wz, -wz]) {
      sh.lineTo(cz + R, y0);
      sh.absarc(cz, Math.max(y0, d.r), R, 0, Math.PI, false);
      sh.lineTo(cz - R, y0);
    }
    sh.lineTo(pts[0][0], pts[0][1]);
    return sh;
  };
  const body = new THREE.ExtrudeGeometry(bodyShape(), { depth: d.W - 0.24, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 10 });
  body.translate(0, 0, -(d.W - 0.24) / 2);
  body.rotateY(-Math.PI / 2);
  body.computeVertexNormals();
  const cabin = ext(d.cabin, d.W * 0.86, 0.1, 0.45);
  // střecha – tenká lakovaná deska na kabině
  const top = d.cabin[1][1];
  const roofPts = [[d.cabin[1][0] + 0.12, top - 0.05], [d.cabin[1][0] + 0.06, top + 0.02], [d.cabin[2][0], d.cabin[2][1] + 0.02], [d.cabin[2][0] + 0.08, d.cabin[2][1] - 0.05]];
  const roof = ext(roofPts, d.W * 0.88, 0.04, 0.6);
  return (bodyCache[type] = { body, cabin, roof });
}

/** Osobní auto. */
/** Konkrétní model (sportovní auto, dodávka, hasiči…) – pro výběr na startu. */
export function makeKitCar(type, color) {
  if (KIT.ready && KIT.cars[type]) return kitCar(type, color);
  return procCarMesh(color, type === 'van' ? 'van' : 'sedan');
}

export function makeCarMesh(color, type) {
  if (KIT.ready) {
    const r = Math.random();
    return kitCar(r < 0.02 ? 'ambulance' : r < 0.035 ? 'garbage-truck' : undefined);
  }
  return procCarMesh(color, type);
}

function procCarMesh(color = pick(CAR_COLORS), type = pick(['hatch', 'combi', 'combi', 'sedan', 'suv', 'hatch', 'mini', 'combi', 'van'])) {
  const d = BODY[type];
  const g = new THREE.Group();
  const paint = paintMat(color);
  const geo = carGeos(type);
  const body = new THREE.Mesh(geo.body, paint);
  const cabin = new THREE.Mesh(geo.cabin, type === 'van' ? paint : glassM);
  const roof = new THREE.Mesh(geo.roof, paint);
  g.add(body, cabin, roof);
  if (type === 'van') {
    // okna dodávky jen vpředu
    const ws = new THREE.Mesh(new THREE.BoxGeometry(d.W * 0.8, 0.75, 0.05), glassM);
    ws.position.set(0, 1.62, 1.33); ws.rotation.x = -0.35;
    g.add(ws);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.9), glassM);
      sw.position.set(s * d.W * 0.435, 1.65, 0.6);
      g.add(sw);
    }
  }
  // nárazníky, světla, SPZ
  const bump = (z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(d.W * 0.98, 0.2, 0.18), darkM);
    b.position.set(0, d.r * 0.95, z);
    return b;
  };
  g.add(bump(d.L / 2 - 0.05), bump(-d.L / 2 + 0.05));
  const fy = d.body[d.body.length - 2][1] - 0.08;
  const ry = d.body[1][1] + 0.12;
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.08), lightM);
    hl.position.set(s * (d.W / 2 - 0.3), fy, d.L / 2 - 0.02);
    hl.rotation.x = 0.3;
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.06), tailM);
    tl.position.set(s * (d.W / 2 - 0.27), ry, -d.L / 2 - 0.0);
    // zrcátka
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), paint);
    mir.position.set(s * (d.W / 2 + 0.05), d.cabin[0][1] + 0.12, d.cabin[3][0] - 0.25);
    g.add(hl, tl, mir);
  }
  for (const z of [d.L / 2 + 0.06, -d.L / 2 - 0.06]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.11), plateM);
    pl.position.set(0, d.r * 0.95 + 0.17, z);
    if (z < 0) pl.rotation.y = Math.PI;
    g.add(pl);
  }
  // kola
  const wheels = [], front = [];
  const wz = d.wb / 2;
  for (const [x, z, f] of [[-1, wz, 1], [1, wz, 1], [-1, -wz, 0], [1, -wz, 0]]) {
    const w = wheel(x * (d.W / 2 - 0.13), z, d.r, 0.24, f);
    g.add(w.steer);
    wheels.push(w.spin);
    if (f) front.push(w.steer);
  }
  // tmavé podběhy pod karoserií
  // vnitřek podběhů
  for (const z of [d.wb / 2, -d.wb / 2]) {
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(d.r + 0.06, d.r + 0.06, d.W - 0.1, 16, 1, false, -Math.PI / 2, Math.PI), darkM);
    arch.rotation.z = Math.PI / 2;
    arch.position.set(0, d.r + 0.02, z);
    g.add(arch);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  g.userData = { L: d.L, W: d.W, paint, wheels, front, type };
  return g;
}

export function makePoliceMesh() {
  if (KIT.ready) return kitPolice();
  const g = procCarMesh('#f5f5f3', 'combi');
  const d = BODY.combi;
  // modro-žlutý pruh po boku
  for (const s of [-1, 1]) {
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, d.L * 0.82), std('#1a4aa8', { roughness: 0.4 }));
    blue.position.set(s * (d.W / 2 + 0.005), 0.72, 0);
    const yel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, d.L * 0.82), std('#f3c514', { roughness: 0.4 }));
    yel.position.set(s * (d.W / 2 + 0.006), 0.58, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.22), new THREE.MeshBasicMaterial({ map: labelTexture('POLICIE', '#1a4aa8', '#fff', 256, 48), transparent: true }));
    sign.position.set(s * (d.W / 2 + 0.02), 0.72, 0.1);
    sign.rotation.y = s * Math.PI / 2;
    g.add(blue, yel, sign);
  }
  const bar = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), darkM);
  const blueA = std('#1a3cff', { emissive: '#2a5cff', emissiveIntensity: 2, transparent: true, opacity: 0.9 });
  const blueB = blueA.clone();
  const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.38, 4, 8), blueA);
  const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.38, 4, 8), blueB);
  l.rotation.z = r.rotation.z = Math.PI / 2;
  l.position.set(-0.3, 0.1, 0); r.position.set(0.3, 0.1, 0);
  bar.add(base, l, r);
  bar.position.set(0, d.cabin[1][1] + 0.08, -0.35);
  g.add(bar);
  g.userData.lights = [blueA, blueB];
  return g;
}

/** Policie ČR: bílý vůz s modro-žlutým pruhem a majákem (model Kenney). */
function kitPolice() {
  const g = kitCar('sedan', '#eef0f2');
  const { L, W, top } = g.userData;
  const stripeB = std('#1a4aa8', { roughness: 0.4 });
  const stripeY = std('#f3c514', { roughness: 0.4 });
  const signM = new THREE.MeshBasicMaterial({ map: labelTexture('POLICIE', '#1a4aa8', '#fff', 256, 48), transparent: true });
  for (const s of [-1, 1]) {
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, L * 0.8), stripeB);
    blue.position.set(s * (W / 2 - 0.02), 0.78, 0);
    const yel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, L * 0.8), stripeY);
    yel.position.set(s * (W / 2 - 0.02), 0.64, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.2), signM);
    sign.position.set(s * (W / 2 + 0.005), 0.78, 0.1);
    sign.rotation.y = s * Math.PI / 2;
    g.add(blue, yel, sign);
  }
  const blueA = std('#1a3cff', { emissive: '#2a5cff', emissiveIntensity: 2, transparent: true, opacity: 0.9 });
  const blueB = blueA.clone();
  const bar = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.28), darkM);
  const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 8), blueA);
  const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 8), blueB);
  l.rotation.z = r.rotation.z = Math.PI / 2;
  l.position.set(-0.28, 0.1, 0); r.position.set(0.28, 0.1, 0);
  bar.add(base, l, r);
  bar.position.set(0, top - 0.02, -0.25);
  g.add(bar);
  g.userData.lights = [blueA, blueB];
  return g;
}

/** Příměstský autobus PID (12 m) – zaoblená skříň, klimatizace na střeše, číslo linky. */
export function makeBusMesh(ref) {
  const g = new THREE.Group();
  const L = 12, W = 2.55, H = 3.05;
  const shape = roundedShape([[-L / 2, 0.35], [-L / 2, H], [L / 2 - 0.25, H], [L / 2, H - 0.5], [L / 2, 0.35]], 0.25);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W - 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.14, bevelSegments: 4, curveSegments: 6 });
  geo.translate(0, 0, -(W - 0.3) / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  const white = new THREE.MeshPhysicalMaterial({ color: '#f2f2ee', roughness: 0.35, clearcoat: 0.6 });
  g.add(new THREE.Mesh(geo, white));
  // pás oken
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.15, L - 1.6), glassM);
    win.position.set(s * (W / 2 + 0.005), 2.05, -0.3);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, L - 0.4), std('#c8262b', { roughness: 0.4 }));
    stripe.position.set(s * (W / 2 + 0.006), 0.75, 0);
    g.add(win, stripe);
    // dveře
    for (const z of [3.6, 0.4, -3.2]) {
      if (s < 0) continue;
      const dr = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.1, 1.2), glassM);
      dr.position.set(W / 2 + 0.008, 1.45, z);
      g.add(dr);
    }
  }
  const front = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 1.6, 0.04), glassM);
  front.position.set(0, 1.95, L / 2 + 0.12);
  g.add(front);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.3, 2.6), std('#cfd0cc'));
  roof.position.set(0, H + 0.22, 1.2);
  g.add(roof);
  // výfuk a zadní maska motoru
  const grill = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.5, 0.04), darkM);
  grill.position.set(0, 0.95, -L / 2 - 0.12);
  g.add(grill);
  const wheels = [], fr = [];
  for (const [x, z, f] of [[-1, L / 2 - 2.5, 1], [1, L / 2 - 2.5, 1], [-1, -L / 2 + 3.2, 0], [1, -L / 2 + 3.2, 0]]) {
    const w = wheel(x * (W / 2 - 0.25), z, 0.5, 0.32, f);
    g.add(w.steer);
    wheels.push(w.spin);
    if (f) fr.push(w.steer);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.36), new THREE.MeshBasicMaterial({ map: labelTexture(ref, '#111', '#ffb020', 256, 52) }));
  sign.position.set(0, H - 0.25, L / 2 + 0.16);
  g.add(sign);
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), lightM);
    hl.position.set(s * 0.9, 0.75, L / 2 + 0.14);
    g.add(hl);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { L, W, wheels, front: fr };
  return g;
}

export function makeHeliMesh() {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: '#d4231f', roughness: 0.3, metalness: 0.2, clearcoat: 1 });
  const white = new THREE.MeshPhysicalMaterial({ color: '#f2f2ef', roughness: 0.3, clearcoat: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), red);
  body.scale.set(1, 0.95, 2.0);
  body.position.y = 1.6;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.42, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
  belly.scale.set(1, 0.8, 2.0);
  belly.position.y = 1.6;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassM);
  canopy.scale.set(1.1, 0.9, 1.3);
  canopy.position.set(0, 1.85, 1.3);
  canopy.rotation.x = 0.5;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 5.5, 12), red);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 2.0, -4.6);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.8), red);
  fin.position.set(0, 2.6, -7.1);
  for (const x of [-0.9, 0.9]) {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 3.4, 4, 8), darkM);
    s.rotation.x = Math.PI / 2;
    s.position.set(x, 0.1, 0.2);
    g.add(s);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), darkM);
  mast.position.y = 3.1;
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 10.5), darkM);
    b.rotation.y = (i * Math.PI) / 2;
    rotor.add(b);
  }
  rotor.position.y = 3.4;
  const tail = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.14), darkM);
    b.rotation.x = (i * Math.PI) / 2;
    tail.add(b);
  }
  tail.position.set(0.25, 2.7, -7.1);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: labelTexture('+', '#ffffff', '#d4231f', 128, 128), side: THREE.DoubleSide }));
  cross.position.set(1.42, 1.7, -0.6); cross.rotation.y = Math.PI / 2;
  g.add(body, belly, canopy, boom, fin, mast, rotor, tail, cross);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { rotor, tail };
  return g;
}

/* =========================================================
 *  POSTAVY – kloubová figura (kyčel, koleno, rameno, loket)
 * ========================================================= */
const SKIN = ['#f1c9a5', '#e8b996', '#d9a37f', '#c48a62', '#8d5a3b', '#f5d6bd'];
const TOP = ['#c8452c', '#2f5d8a', '#3c7a4a', '#e2c044', '#5b5b5b', '#efefef', '#7a3e8a', '#1f2a3a', '#b55d2a', '#4b8fa6', '#2b2b2b', '#8e8e86', '#6b8f3a', '#a33a4a'];
const BOTTOM = ['#2a3242', '#3c3c3c', '#4d5a6e', '#6b5a43', '#1d1d1d', '#5a6b7a', '#283a5c', '#7b6f5c'];
const HAIR = ['#2a1d14', '#5a3a22', '#c9a35b', '#1a1a1a', '#8a8a8a', '#7a3b1a', '#d8c08a'];
const SHOE = ['#1a1a1a', '#f2f2f2', '#5a3a22', '#2a3242', '#8a8a8a'];
const capG = {};
const cap = (r, l) => capG[r + '_' + l] || (capG[r + '_' + l] = new THREE.CapsuleGeometry(r, l, 4, 10));

export function makeHuman(opts = {}) {
  if (KIT.chars.length) return kitHuman(opts);
  const female = opts.female ?? Math.random() < 0.5;
  const s = opts.scale ?? (female ? 0.94 : 1) * (0.95 + Math.random() * 0.1);
  const skin = std(opts.skin || pick(SKIN), { roughness: 0.7 });
  const top = std(opts.shirt || pick(TOP), { roughness: 0.85 });
  const bottom = std(opts.pants || pick(BOTTOM), { roughness: 0.85 });
  const hairM = std(opts.hair || pick(HAIR), { roughness: 0.9 });
  const shoeM = std(pick(SHOE), { roughness: 0.6 });
  const g = new THREE.Group();
  const root = new THREE.Group();
  root.scale.setScalar(s);
  g.add(root);
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

  // pánev a trup
  const hips = mesh(cap(0.13, 0.12), bottom, 0, 0.98, 0);
  hips.rotation.z = Math.PI / 2;
  hips.scale.set(1, female ? 1.1 : 1, 0.75);
  const torso = new THREE.Group();
  torso.position.y = 1.02;
  const chest = mesh(cap(female ? 0.15 : 0.165, 0.3), top, 0, 0.27, 0);
  chest.scale.set(female ? 1.15 : 1.3, 1, 0.72);
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skin, 0, 0.56, 0);
  const head = mesh(new THREE.SphereGeometry(0.105, 18, 14), skin, 0, 0.7, 0.01);
  head.scale.set(0.95, 1.15, 1.05);
  const hair = mesh(new THREE.SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.72, -0.005);
  hair.scale.set(0.98, 1.12, 1.08);
  torso.add(chest, neck, head, hair);
  if (female && Math.random() < 0.75) {
    const long = mesh(cap(0.085, 0.16), hairM, 0, 0.6, -0.06);
    long.scale.set(1.2, 1, 0.6);
    torso.add(long);
  }
  // oči
  for (const x of [-0.035, 0.035]) torso.add(mesh(new THREE.SphereGeometry(0.012, 6, 6), darkM, x, 0.72, 0.1));
  root.add(hips, torso);

  const limb = (r1, l1, r2, l2, m1, m2, x, y, endGeo, endMat) => {
    const upper = new THREE.Group();
    upper.position.set(x, y, 0);
    upper.add(mesh(cap(r1, l1), m1, 0, -(l1 / 2 + r1 * 0.6), 0));
    const lower = new THREE.Group();
    lower.position.y = -(l1 + r1 * 0.9);
    lower.add(mesh(cap(r2, l2), m2, 0, -(l2 / 2 + r2 * 0.5), 0));
    if (endGeo) { const e = mesh(endGeo, endMat, 0, -(l2 + r2 * 1.2), 0); lower.add(e); lower.userData.end = e; }
    upper.add(lower);
    return { upper, lower };
  };
  const shortSleeve = Math.random() < 0.4;
  const foot = new THREE.BoxGeometry(0.1, 0.07, 0.24);
  foot.translate(0, 0, 0.05);
  const hand = new THREE.SphereGeometry(0.045, 8, 8);
  const legs = [-1, 1].map((sd) => limb(0.075, 0.34, 0.06, 0.34, bottom, bottom, sd * 0.09, 0.9, foot, shoeM));
  const arms = [-1, 1].map((sd) => limb(0.052, 0.22, 0.045, 0.2, top, shortSleeve ? skin : top, sd * (female ? 0.2 : 0.23), 1.5, hand, skin));
  for (const l of legs) root.add(l.upper);
  for (const a of arms) { torso.add(a.upper); a.upper.position.y -= 1.02; }
  if (female && Math.random() < 0.35) {
    const skirt = mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.36, 14, 1, true), bottom, 0, 0.82, 0);
    skirt.material = bottom.clone(); skirt.material.side = THREE.DoubleSide;
    root.add(skirt);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { legs, arms, torso, root, phase: Math.random() * 6 };
  return g;
}

export function animateHuman(h, speed, dt, mode) {
  const u = h.userData;
  if (u.kit) return animateKitHuman(h, speed, dt, mode);
  if (!u.legs) return;
  const run = Math.min(1, Math.max(0, (speed - 4) / 4));
  u.phase += dt * (speed > 0.2 ? 3.2 + speed * 1.15 : 0);
  const amp = Math.min(1, speed / 4.2) * (0.55 + run * 0.35);
  const p = u.phase;
  for (let i = 0; i < 2; i++) {
    const ph = p + i * Math.PI;
    const sw = Math.sin(ph);
    u.legs[i].upper.rotation.x = -sw * amp;
    u.legs[i].lower.rotation.x = Math.max(0, Math.cos(ph)) * amp * (1.3 + run);
    u.arms[i].upper.rotation.x = sw * amp * (0.8 + run * 0.4);
    u.arms[i].upper.rotation.z = (i ? -1 : 1) * 0.06;
    u.arms[i].lower.rotation.x = -(0.18 + run * 1.1 + Math.max(0, sw) * amp * 0.4);
  }
  u.torso.rotation.x = run * 0.18;
  u.torso.rotation.y = Math.sin(p) * amp * 0.12;
  u.root.position.y = Math.abs(Math.cos(p)) * amp * 0.05;
  // nečinnost – dýchání
  if (speed <= 0.2) {
    for (let i = 0; i < 2; i++) {
      u.legs[i].upper.rotation.x *= 0.8; u.legs[i].lower.rotation.x *= 0.8;
      u.arms[i].upper.rotation.x *= 0.8;
      u.arms[i].lower.rotation.x = -0.15;
    }
    u.root.position.y = 0;
  }
}

/* ---------- vozidlo (arkádová fyzika) ---------- */
export class Vehicle {
  constructor(mesh, kind = 'car') {
    this.mesh = mesh;
    this.kind = kind;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0;
    this.v = 0; this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.hp = 100;
    this.L = mesh.userData.L || 4.4;
    this.W = mesh.userData.W || 1.8;
    this.r = this.W * 0.62;
    this.maxV = kind === 'police' ? 46 : kind === 'trolley' ? 16 : 40;
    this.accel = kind === 'police' ? 13 : 10;
    this.driver = null; // 'player' | 'ai' | null
    this.sink = 0;
    this.dead = false;
  }
  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.y = Vehicle.city ? Vehicle.city.surface(x, z) : 0; this.sync(); }
  sync() {
    const c = Vehicle.city;
    if (c && this.kind !== 'heli') {
      // výška podle povrchu (terén / most), náklon podle svahu
      const [fx, fz] = this.forward();
      const hl = this.L * 0.4, hw = this.W * 0.42;
      const yh = this.y + 1;
      const yf = c.surface(this.x + fx * hl, this.z + fz * hl, yh);
      const yb = c.surface(this.x - fx * hl, this.z - fz * hl, yh);
      const yl = c.surface(this.x + fz * hw, this.z - fx * hw, yh);
      const yr = c.surface(this.x - fz * hw, this.z + fx * hw, yh);
      const ty = (yf + yb + yl + yr) / 4 - (this.sinkY || 0);
      this.y = Math.abs(ty - this.y) > 3 ? ty : this.y + (ty - this.y) * 0.5;
      const m = this.mesh;
      m.rotation.order = 'YXZ';
      m.rotation.x += (-Math.atan2(yf - yb, hl * 2) - m.rotation.x) * 0.3;
      m.rotation.z += (Math.atan2(yl - yr, hw * 2) - m.rotation.z) * 0.3;
    }
    if (this.mesh.userData.bike) {
      // motorka se v zatáčce naklání, jezdec je vidět jen když řídí hráč
      const sp = Math.hypot(this.vx, this.vz);
      this.lean = (this.lean || 0) + ((-this.steer * Math.min(1, sp / 10) * 0.6) - (this.lean || 0)) * 0.15;
      this.mesh.rotation.z = this.lean;
      this.mesh.userData.rider.visible = this.driver === 'player';
    }
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.h;
  }
  forward() { return [Math.sin(this.h), Math.cos(this.h)]; }

  /** ctl: { throttle, steer, hand } */
  drive(dt, ctl, city) {
    if (this.dead) { this.v *= 0.9; ctl = { throttle: 0, steer: 0, hand: true }; }
    const [fx, fz] = this.forward();
    let v = this.v;
    const t = ctl.throttle;
    if (t > 0) v += (v < 0 ? 22 : this.accel * (1 - Math.max(0, v) / this.maxV)) * t * dt;
    else if (t < 0) v += (v > 0 ? -24 : -6 * (1 + v / 9)) * -t * dt;
    else v -= Math.sign(v) * Math.min(Math.abs(v), (2 + Math.abs(v) * 0.12) * dt);
    if (ctl.hand) v -= Math.sign(v) * Math.min(Math.abs(v), 9 * dt);
    this.v = v;
    const target = ctl.steer * 0.62 / (1 + Math.abs(v) / 16);
    this.steer += (target - this.steer) * Math.min(1, dt * 8);
    this.h += (v / 2.7) * Math.tan(this.steer) * dt * (ctl.hand && Math.abs(v) > 6 ? 1.6 : 1);
    // drift: rychlost se stáčí do směru jízdy podle přilnavosti
    const grip = ctl.hand ? 1.8 : 9;
    const k = Math.min(1, dt * grip);
    this.vx += (fx * v - this.vx) * k;
    this.vz += (fz * v - this.vz) * k;
    this.move(dt, city);
  }

  move(dt, city) {
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    let impact = 0;
    const [fx, fz] = this.forward();
    const off = this.L * 0.3;
    // dva kruhy (předek, zadek)
    for (const s of [1, -1]) {
      const cx = nx + fx * off * s, cz = nz + fz * off * s;
      const c = city.collide(cx, cz, this.r, this.y);
      if (c.hit) {
        nx += c.x - cx; nz += c.z - cz;
        const dot = this.vx * c.nx + this.vz * c.nz;
        if (dot < 0) {
          impact = Math.max(impact, -dot);
          this.vx -= c.nx * dot * 1.3;
          this.vz -= c.nz * dot * 1.3;
        }
      }
    }
    if (impact > 0) {
      this.v = (this.vx * fx + this.vz * fz) * 0.8;
      if (impact > 4) this.damage(impact * 1.6);
    }
    this.x = nx; this.z = nz;
    this.lastImpact = impact;
    // voda
    if (this.kind !== 'heli' && city.isWater(this.x, this.z)) {
      this.sink += dt;
      this.vx *= 0.9; this.vz *= 0.9; this.v *= 0.9;
      this.sinkY = Math.min(1.6, this.sink * 0.8);
      if (this.sink > 2.5) this.dead = true;
    } else if (this.sink > 0 && !this.dead) { this.sink = 0; this.sinkY = 0; }
    const ww = this.mesh.userData.wheels;
    if (ww) for (const w of ww) w.rotation.x += (this.v * dt) / (w.userData.r || 0.34);
    const fw = this.mesh.userData.front;
    if (fw) for (const w of fw) w.rotation.y = this.steer * 0.9;
    this.sync();
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.mesh.traverse((o) => { if (o.isMesh && o.material === this.mesh.userData.paint) o.material = std('#262321', { roughness: 1 }); });
    }
  }

  speedKmh() { return Math.abs(Math.hypot(this.vx, this.vz)) * 3.6; }
}

/** Natočení k cíli – vrací řízení -1..1 */
export function steerTo(veh, tx, tz) {
  const want = Math.atan2(tx - veh.x, tz - veh.z);
  const d = wrapAngle(want - veh.h);
  return clamp(d * 2.2, -1, 1) * (veh.v < 0 ? -1 : 1);
}

/** Motorka (naked bike ~2,1 m): rám, nádrž, sedlo, řídítka, kola; jezdec se ukáže, když řídí hráč. */
export function makeBikeMesh(color = '#c4161c') {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8 });
  const black = std('#1b1c1e', { roughness: 0.6 });
  const chrome = std('#c9ccd0', { metalness: 0.9, roughness: 0.2 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const wheels = [], front = [];
  for (const [z, f] of [[0.72, 1], [-0.72, 0]]) {
    const steer = new THREE.Group();
    steer.position.set(0, 0.33, z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 10, 24), black);
    tyre.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), chrome);
    rim.rotation.z = Math.PI / 2;
    spin.add(tyre, rim);
    steer.add(spin);
    g.add(steer);
    wheels.push(spin);
    if (f) front.push(steer);
  }
  add(new THREE.BoxGeometry(0.28, 0.32, 0.55), paint, 0, 0.82, 0.22, 0.15);          // nádrž
  add(new THREE.BoxGeometry(0.26, 0.1, 0.6), black, 0, 0.8, -0.3);                   // sedlo
  add(new THREE.BoxGeometry(0.22, 0.12, 0.35), paint, 0, 0.82, -0.68, -0.25);        // zadní kapota
  add(new THREE.BoxGeometry(0.3, 0.32, 0.5), std('#3a3c40', { metalness: 0.6 }), 0, 0.5, 0.05); // motor
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), chrome, 0, 0.62, 0.62, -0.45); // vidlice
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), black, 0, 1.02, 0.5, 0, 0, Math.PI / 2); // řídítka
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), lightM, 0, 0.92, 0.72, Math.PI / 2); // světlo
  add(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 8), chrome, 0.16, 0.42, -0.45, Math.PI / 2 - 0.15); // výfuk
  // jezdec (jednoduchá postava v helmě)
  const rider = new THREE.Group();
  const shirt = std('#c8452c', { roughness: 0.8 }), jeans = std('#253044', { roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.38, 4, 10), shirt); torso.position.set(0, 1.28, -0.12); torso.rotation.x = 0.5;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), std('#111', { roughness: 0.3 })); helmet.position.set(0, 1.62, 0.06);
  rider.add(torso, helmet);
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), jeans); thigh.position.set(sx * 0.14, 0.92, -0.08); thigh.rotation.x = Math.PI / 2 - 0.2;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 8), jeans); shin.position.set(sx * 0.17, 0.62, 0.1); shin.rotation.x = 0.35;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), shirt); arm.position.set(sx * 0.24, 1.22, 0.24); arm.rotation.x = -1.0;
    rider.add(thigh, shin, arm);
  }
  rider.visible = false;
  g.add(rider);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { L: 2.1, W: 0.8, wheels, front, rider, paint, bike: true };
  return g;
}

/** Stíhačka (převzato z Hrej Hradec): delta křídla, dvojité kýly, plamen z trysky. */
export function makeJet() {
  const g = new THREE.Group();
  const body = std('#6f7a86', { metalness: 0.45, roughness: 0.45 });
  const dark = std('#3d444c', { metalness: 0.4, roughness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2a3a4a', roughness: 0.05, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.85 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 11, 16), body);
  fus.rotation.x = Math.PI / 2; fus.position.set(0, 1.6, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.6, 16), body);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.6, 7.3);
  const can = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  can.scale.set(1, 0.9, 2.6); can.position.set(0, 2.25, 3.2);
  // delta křídla
  const wing = new THREE.Shape();
  wing.moveTo(0, 2.5); wing.lineTo(5.2, -3.2); wing.lineTo(5.2, -3.9); wing.lineTo(0, -3.9); wing.closePath();
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.16, bevelEnabled: false });
  wg.rotateX(Math.PI / 2);
  for (const sd of [1, -1]) {
    const w = new THREE.Mesh(wg, body);
    w.scale.x = sd; w.position.set(sd * 0.5, 1.45, 0);
    g.add(w);
    // ocasní plochy (dvojité kýly)
    const fin = new THREE.Shape();
    fin.moveTo(0, 0); fin.lineTo(1.8, 0); fin.lineTo(2.6, 2.4); fin.lineTo(1.6, 2.4); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false });
    const f = new THREE.Mesh(fg, dark);
    f.rotation.y = -Math.PI / 2; f.rotation.z = sd * 0.18;
    f.position.set(sd * 0.7, 2.1, -5.4);
    g.add(f);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 2.4), dark);
    intake.position.set(sd * 0.95, 1.4, 1.6);
    g.add(intake);
  }
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1, 14, 1, true), dark);
  noz.rotation.x = Math.PI / 2; noz.position.set(0, 1.6, -5.9);
  const flameM = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.0, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4, 14), flameM);
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, 1.6, -8.3);
  // podvozek
  for (const [x, z] of [[0, 4.6], [1.6, -1.2], [-1.6, -1.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), dark);
    leg.position.set(x, 0.75, z);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), tyreM);
    tyre.rotation.z = Math.PI / 2; tyre.position.set(x, 0.3, z);
    g.add(leg, tyre);
  }
  g.add(fus, nose, can, noz, flame);
  g.traverse((o) => { if (o.isMesh && o !== flame) o.castShadow = true; });
  g.userData = { L: 15, W: 10.4, flame, flameM };
  return g;
}


/** Tank: korba s pásy, otočná věž s kanónem (věž = userData.turret, ústí = userData.muzzle). */
export function makeTank() {
  const g = new THREE.Group();
  const olive = std('#4d5a34', { roughness: 0.75, metalness: 0.15 }), dark = std('#2c3220', { roughness: 0.8 }), track = std('#1b1b1a', { roughness: 0.95 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.1, 6.6), olive); hull.position.y = 1.15;
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.9, 1.4), olive); glacis.position.set(0, 1.25, 3.5); glacis.rotation.x = -0.55;
  g.add(hull, glacis);
  for (const sd of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 7.0), track); t.position.set(sd * 1.75, 0.55, 0); g.add(t);
    for (let k = 0; k < 6; k++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.84, 14), dark); w.rotation.z = Math.PI / 2; w.position.set(sd * 1.75, 0.5, -2.6 + k * 1.04); g.add(w); }
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 7.1), olive); fender.position.set(sd * 1.75, 1.08, 0); g.add(fender);
  }
  const turret = new THREE.Group(); turret.position.set(0, 1.7, -0.3);
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.85, 8), olive); tb.position.y = 0.42;
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12), dark); hatch.position.set(0.45, 0.9, -0.3);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.6, 12), dark); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.5, 3.4);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12), dark); brake.rotation.x = Math.PI / 2; brake.position.set(0, 0.5, 5.75);
  const mg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), dark); mg.position.set(-0.5, 1.05, 0.2);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.5, 6.1);
  turret.add(tb, hatch, barrel, brake, mg, muzzle);
  g.add(turret);
  // hvězda na věži
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { L: 7.0, W: 3.6, turret, muzzle, top: 2.6 };
  return g;
}
