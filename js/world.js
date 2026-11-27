import * as THREE from 'three';
import { hash01, pointInPoly, nextFrame } from './util.js?v=20261127200331';
import { K_PEN } from './data.js?v=20261127200331';
import * as TX from './textures.js?v=20261127200331';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* --------- pomocný buffer geometrie --------- */
class Buf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  v(x, y, z, nx, ny, nz, u, w, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, w); this.col.push(c.r, c.g, c.b);
  }
  tri(a, b, c, col, uvf) {
    // a,b,c = [x,y,z]; normála z vektorového součinu
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      const [u, w] = uvf(p);
      this.v(p[0], p[1], p[2], nx, ny, nz, u, w, col);
    }
  }
  /** Otočí ploché trojúhelníky tak, aby mířily nahoru. */
  faceUp() {
    const p = this.pos, u = this.uv;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i + 3] - p[i], az = p[i + 5] - p[i + 2];
      const bx = p[i + 6] - p[i], bz = p[i + 8] - p[i + 2];
      if (az * bx - ax * bz < 0) {
        for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
        const j = (i / 3) * 2;
        for (let k = 0; k < 2; k++) { const t = u[j + 2 + k]; u[j + 2 + k] = u[j + 4 + k]; u[j + 4 + k] = t; }
      }
    }
    return this;
  }
  /**
   * Položí plochu na terén: rozdělí dlouhé trojúhelníky (hrana > maxEdge) a k výšce přičte G(x, z).
   * Normály plochých částí se nastaví podle sklonu terénu.
   */
  drape(G, maxEdge = 8, faceNormals = false, tol = 0.04) {
    const P = this.pos, N = this.nor, U = this.uv, Cc = this.col;
    const out = new Buf();
    const m2 = maxEdge * maxEdge;
    const vert = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], U[i * 2], U[i * 2 + 1], Cc[i * 3], Cc[i * 3 + 1], Cc[i * 3 + 2]];
    const mid = (a, b) => a.map((v, k) => (v + b[k]) / 2);
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
    // dělí se jen tam, kde se terén pod trojúhelníkem ohýbá (na rovině zůstane velký)
    const bend = (a, b, c) => {
      const ga = G(a[0], a[2]), gb = G(b[0], b[2]), gc = G(c[0], c[2]);
      const e = (p, q, gp, gq) => Math.abs(G((p[0] + q[0]) / 2, (p[2] + q[2]) / 2) - (gp + gq) / 2);
      const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      return Math.max(e(a, b, ga, gb), e(b, c, gb, gc), e(c, a, gc, ga), Math.abs(G(cx, cz) - (ga + gb + gc) / 3));
    };
    const emit = (a, b, c, depth) => {
      const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a);
      const mx = Math.max(ab, bc, ca);
      if (mx > m2 && depth < 14 && (mx > 1600 || bend(a, b, c) > tol)) {
        if (mx === ab) { const m = mid(a, b); emit(a, m, c, depth + 1); emit(m, b, c, depth + 1); }
        else if (mx === bc) { const m = mid(b, c); emit(a, b, m, depth + 1); emit(a, m, c, depth + 1); }
        else { const m = mid(c, a); emit(a, b, m, depth + 1); emit(m, b, c, depth + 1); }
        return;
      }
      if (faceNormals) {
        const ys = [a, b, c].map((v) => v[1] + G(v[0], v[2]));
        const ux = b[0] - a[0], uy = ys[1] - ys[0], uz = b[2] - a[2], vx = c[0] - a[0], vy = ys[2] - ys[0], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        [a, b, c].forEach((v, k) => { out.pos.push(v[0], ys[k], v[2]); out.nor.push(nx, ny, nz); out.uv.push(v[6], v[7]); out.col.push(v[8], v[9], v[10]); });
        return;
      }
      for (const v of [a, b, c]) {
        const x = v[0], z = v[2];
        const y = v[1] + G(x, z);
        let nx = v[3], ny = v[4], nz = v[5];
        if (ny > 0.9) {
          const e = 1.5;
          nx = G(x - e, z) - G(x + e, z); nz = G(x, z - e) - G(x, z + e); ny = 2 * e;
          const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        }
        out.pos.push(x, y, z); out.nor.push(nx, ny, nz); out.uv.push(v[6], v[7]); out.col.push(v[8], v[9], v[10]);
      }
    };
    for (let i = 0; i < P.length / 3; i += 3) emit(vert(i), vert(i + 1), vert(i + 2), 0);
    return out;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const C = (hex) => new THREE.Color(hex);
/** Pořadí překrývajících se ploch na terénu (vyšší k = blíž kameře). */
function layer(m, k) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -k;
  m.polygonOffsetUnits = -k * 4;
  return m;
}
const PAL = {
  blockCore: ['#ecd08a', '#efe2c2', '#e3a98f', '#d4dcc6', '#ebbfa7', '#f3e8cd', '#d8c3a0', '#e9d7a8', '#cfd9dd', '#f0d6b5'].map(C),
  block: ['#ddd4c5', '#d2c4ad', '#e6dcc9', '#c8bba8', '#e2d2b4', '#d6d0c4'].map(C),
  panel: ['#dedbd2', '#d3d8da', '#e3d9c6', '#cdd3c8', '#e6cb92', '#b1c8d3', '#dbab95', '#c9d6b8'].map(C),
  house: ['#f1e8d6', '#e8d6b4', '#ddcbad', '#f3e5cc', '#d2c1a7', '#e9dfcf'].map(C),
  civic: ['#d9d4c9', '#c9b79d', '#b8684c', '#e2ddd2', '#a95b42', '#cfc6b5'].map(C),
  industrial: ['#c2bfb7', '#adaeaa', '#c8bdaa', '#b7b4ab'].map(C),
  church: ['#ebe2cd', '#ddd1b8'].map(C),
  tile: ['#9e4b33', '#a85c3d', '#8b402d', '#7d4b3b', '#94503a', '#5a5653'].map(C),
  flat: ['#8f8c86', '#7d7b76', '#9c978e', '#72716d', '#8a877f'].map(C),
};
const GREEN_COL = {
  grass: '#86a85c', meadow: '#93b062', park: '#7aa457', garden: '#80a85a', recreation_ground: '#86aa5c',
  pitch: '#6aa94f', forest: '#5a8a44', wood: '#5d8c46', cemetery: '#6f9154',
};

function ringArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a / 2);
}

function triangulate(p) {
  // 2D souřadnice (x, -z) = (x, sever) → CCW
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i], -p[i + 1]));
  try { return { pts, tris: THREE.ShapeUtils.triangulateShape(pts, []) }; } catch { return { pts, tris: [] }; }
}

/* ===================== BUDOVY ===================== */

/*
 * Dominanty: vzhled podle skutečnosti. Bez jména se hledají podle polohy (střed půdorysu ±6 m).
 * wall = barva zdí, roof = barva střechy, flat = plochá střecha (nahoře model), extra = doplněk.
 */
const COPPER = '#5f9c86', BRICK = '#a5583c';
/*
 * Věznice Vinařice – budovy podle popisu pamětníka (podklady/popis_veznice.md), fotografií z Wikimedia Commons
 * a ortofota ČÚZK. x, z = bod uvnitř půdorysu (souřadnice světa), n = číslo na mapě podklady/veznice_budovy.jpg.
 * Barvy: 16 bílá + ocelová klec v nástavbě a okrová vlnitá střecha, 12 mintová, 13/14 šedá omítka,
 * vrátnice 19/20 světle šedá s tmavou stříškou, za ní béžová správní budova (foto). Ostatní dle typu.
 */
const P_CELL = '#e4e1d9', P_GREY = '#aeaba2', P_BEIGE = '#cdb999', P_IND = '#c3c1ba';
const PRISON_B = [
  { n: 1, x: -356.4, z: 1059.1, sign: 'Oddíly L4 · L5', style: 'prison', wall: P_CELL, r: 'gabled', pitch: 0.24 },
  { n: 2, x: -333.3, z: 1052.5, sign: 'Mistři · správa', style: 'civic', wall: P_CELL, flat: true },
  { n: 3, x: -322.8, z: 1047.5, sign: 'Agregát', style: 'industrial', wall: P_IND, flat: true },
  { n: 4, x: -295.6, z: 1048.0, sign: 'MON · Stupeň B · Toxi', style: 'prison', wall: P_CELL, r: 'gabled', pitch: 0.24 },
  { n: 5, x: -238.8, z: 1041.6, sign: 'Oddíl C – nekuřáci · Zdravotní odd.', style: 'prison', wall: P_CELL, r: 'gabled', pitch: 0.24 },
  { n: 6, x: -202.5, z: 1042.1, sign: 'Zdravotní oddělení', style: 'civic', wall: '#e9e7e1', r: 'gabled', pitch: 0.24 },
  { n: 7, x: -137.5, z: 1048.6, sign: 'Pracoviště', style: 'industrial', wall: P_IND, r: 'gabled', pitch: 0.18 },
  { n: 8, x: -91.2, z: 1044.0, sign: 'Pracoviště', style: 'industrial', wall: P_IND, r: 'gabled', pitch: 0.18 },
  { n: 9, x: -437.1, z: 1088.2, sign: 'Oddělení výkonu trestu', style: 'civic', wall: P_GREY, r: 'gabled', pitch: 0.24 },
  { n: 10, x: -404.9, z: 1071.3, sign: 'Správní oddělení', style: 'civic', wall: P_BEIGE, r: 'gabled', pitch: 0.24 },
  { n: 11, x: -399.3, z: 1088.6, sign: 'Ředitelství', style: 'civic', wall: P_BEIGE, flat: true },
  { n: 12, x: -291.6, z: 1100.0, sign: 'Jídelna', style: 'civic', wall: '#cfe6d6', flat: true },
  { n: 13, x: -241.3, z: 1092.7, sign: 'Oddíly 11V · 11Z · 12 · 12B', style: 'prison', wall: P_GREY, flat: true },
  { n: 14, x: -196.3, z: 1092.5, sign: 'Oddíly 10V · 10Z', style: 'prison', wall: P_GREY, flat: true },
  { n: 15, x: -175.9, z: 1084.8, sign: 'Kotelna', style: 'industrial', wall: P_IND, flat: true },
  { n: 16, x: -160.2, z: 1062.1, sign: 'Budova K · K1–K8', style: 'prison', wall: '#e9e7e0', roof: '#b39a62', r: 'gabled', pitch: 0.16, lv: 5, extra: 'cageTop' },
  { n: 17, x: -126.7, z: 1092.8, sign: 'Pracoviště', style: 'industrial', wall: P_IND, r: 'gabled', pitch: 0.18 },
  { n: 18, x: -102.2, z: 1074.0, sign: 'Pracoviště', style: 'industrial', wall: P_IND, r: 'gabled', pitch: 0.18 },
  { n: 19, x: -432.6, z: 1107.9, sign: 'Vrátnice · vstup', style: 'civic', wall: '#dcdcd6', roof: '#3e4346', flat: true },
  { n: 20, x: -420.3, z: 1125.8, sign: 'Vstup', style: 'civic', wall: '#dcdcd6', roof: '#3e4346', flat: true },
  { n: 21, x: -413.7, z: 1107.2, sign: 'Účtárna', style: 'civic', wall: P_BEIGE, flat: true },
  { n: 22, x: -390.3, z: 1102.6, sign: 'Ředitelství', style: 'civic', wall: P_BEIGE, flat: true },
  { n: 23, x: -352.2, z: 1104.8, sign: 'Budova M · M1 · M2', style: 'prison', wall: P_CELL, r: 'gabled', pitch: 0.24 },
  { n: 24, x: -297.9, z: 1134.5, sign: 'Zásobování – vjezd', style: 'civic', wall: '#dcdcd6', flat: true },
  { n: 25, x: -291.3, z: 1130.8, sign: 'Zásobování – výjezd', style: 'civic', wall: '#dcdcd6', flat: true },
  { n: 26, x: -268.8, z: 1158.2, sign: 'Sklad · řidiči', style: 'industrial', wall: '#b9bcbc', r: 'gabled', pitch: 0.18, rh: 10.6, lv: 3, garage: 2 }, // „vlnička“: 3 patra, vpravo 2 velká garážová vrata (pamětník)
  { n: 27, x: -195.8, z: 1172.8, sign: 'Garáže', style: 'industrial', wall: P_IND, flat: true },
  { n: 28, x: -178.5, z: 1154.6, sign: 'Garáže', style: 'industrial', wall: P_IND, flat: true },
  { n: 29, x: -238.3, z: 1186.8, sign: 'Autopark', style: 'industrial', wall: P_IND, flat: true },
  { n: 30, x: -223.2, z: 1196.3, sign: 'Truhlárna', style: 'industrial', wall: P_IND, r: 'gabled', pitch: 0.18 },
];

const LANDMARKS = [
  // Věznice Vinařice (podle ortofota ČÚZK): blok s plochou střechou a technikou na střeše uprostřed areálu
  { near: [-307, 1097], r: 16, inPrison: true, style: 'civic', wall: '#e2dfd8', flat: true },
  // vysoká hala na východě areálu (17 m ze stínu), plochá střecha s atikou
  { near: [-160, 1062], r: 12, inPrison: true, style: 'industrial', wall: '#d6d1c4', flat: true },
  // ostatní budovy v areálu: omítnuté, mříže v oknech, nízké sedlové střechy z plechu
  { inPrison: true, kinds: ['civic', 'block', 'house'], style: 'prison', r: 'gabled', pitch: 0.24 },
  { inPrison: true, kinds: ['industrial'], style: 'industrial', r: 'gabled', pitch: 0.18 },
  // Hornický skanzen Mayrau: režné cihlové budovy dolu (strojovna, cechovna, šachetní budova)
  { near: [-520, 1110], r: 140, kinds: ['civic', 'block', 'industrial'], wall: BRICK, style: 'brick', roof: '#4f4a46' },
];
function landmarkOf(b) {
  if (b.pb) return b.pb;
  for (const L of LANDMARKS) {
    if (L.poi || L.pt) { if (L.bid !== b.id) continue; return L; }
    if (L.inPrison && (!b.inPrison || (L.kinds && !L.kinds.includes(b.k)))) continue;
    if (L.inPrison && !L.near) return L;
    if (L.near) { if (Math.hypot(b.cx - L.near[0], b.cz - L.near[1]) > L.r || (L.kinds && !L.kinds.includes(b.k))) continue; return L; }
    if (L.name && b.n !== L.name) continue;
    if (L.small != null && L.small !== (b.maxx - b.minx < 14)) continue;
    if (L.at && Math.hypot(b.cx - L.at[0], b.cz - L.at[1]) > 6) continue;
    return L;
  }
  return null;
}

/** Nejmenší opsaný obdélník: střed, osa hřebene u (delší strana), kolmice v, poloviční rozměry. */
function obb(p) {
  const n = p.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = p[j * 2] - p[i * 2], uz = p[j * 2 + 1] - p[i * 2 + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.5) continue;
    ux /= l; uz /= l;
    let a0 = 1e9, a1 = -1e9, d0 = 1e9, d1 = -1e9;
    for (let k = 0; k < n; k++) {
      const x = p[k * 2], z = p[k * 2 + 1];
      const a = x * ux + z * uz, d = -x * uz + z * ux;
      if (a < a0) a0 = a; if (a > a1) a1 = a; if (d < d0) d0 = d; if (d > d1) d1 = d;
    }
    const area = (a1 - a0) * (d1 - d0);
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, d0, d1 };
  }
  if (!best) return null;
  let { ux, uz } = best;
  let hl = (best.a1 - best.a0) / 2, hw = (best.d1 - best.d0) / 2;
  const am = (best.a1 + best.a0) / 2, dm = (best.d1 + best.d0) / 2;
  const cx = am * ux - dm * uz, cz = am * uz + dm * ux;
  let vx = -uz, vz = ux;
  if (hw > hl) { [hl, hw] = [hw, hl]; [ux, uz, vx, vz] = [vx, vz, ux, uz]; }
  return { cx, cz, ux, uz, vx, vz, hl, hw };
}

/** Douglas–Peucker pro uzavřený obrys (odstraní drobné zářezy, které dělaly zubaté střechy). */
function simplifyRing(p, tol) {
  const n = p.length / 2;
  if (n < 5) return p;
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([p[i * 2], p[i * 2 + 1]]);
  const dp = (a, b, out) => {
    let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b % n];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { dp(a, mi, out); dp(mi, b, out); } else out.push(a);
  };
  // rozdělit na dvě poloviny podle nejvzdálenějšího bodu od prvního
  let far = 0, fd = 0;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const idx = [];
  dp(0, far, idx); dp(far, n, idx);
  if (idx.length < 3) return p;
  const out = [];
  for (const i of idx) out.push(pts[i][0], pts[i][1]);
  return out;
}

/** Lineární rovina f = k·((x,z)−c)·dir + c0 jako [A, B, C]. */
const plane = (o, dx, dz, k, c0) => [k * dx, k * dz, c0 - k * (dx * o.cx + dz * o.cz)];
const evalP = (P, x, z) => P[0] * x + P[1] * z + P[2];

/** Ořízne polygon (x,z ploché pole) polorovinou A·x + B·z + C ≤ 0. */
function clipHalf(p, A, B, C) {
  const out = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const da = A * ax + B * az + C, db = A * bx + B * bz + C;
    if (da <= 0) out.push(ax, az);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push(ax + (bx - ax) * t, az + (bz - az) * t);
    }
  }
  return out;
}

/**
 * Střecha budovy jako sada rovin (výška nad okapem = min přes roviny).
 * Vrací null pro plochou střechu.
 */
function roofModel(b, core) {
  let shape = b.r;
  // vesnice: obytné domy a menší veřejné budovy mají šikmé střechy (asi čtvrtina valbových)
  if (!shape) shape = b.k === 'house' || b.k === 'church' || ((b.k === 'block' || b.k === 'civic') && b.rh < 13.5)
    ? (b.k !== 'church' && hash01(b.id * 31 + 7) < 0.27 ? 'hipped' : 'gabled') : 'flat';
  if (shape === 'flat' || shape === 'onion' || shape === 'dome') return null;
  const o = obb(b.p);
  if (!o || o.hw < 1.2) return null;
  if (b.ro) { [o.ux, o.uz, o.vx, o.vz] = [o.vx, o.vz, o.ux, o.uz]; [o.hl, o.hw] = [o.hw, o.hl]; }
  const church = b.k === 'church';
  const pitch = church ? 1.5 : shape === 'skillion' ? 0.3 : b.pitch || 0.82; // tan sklonu
  // nepravidelný půdorys (L, U, s dvorem): střecha stoupá od každé stěny stejným sklonem → hřebeny po křídlech
  const area = ringArea(b.p);
  if ((shape === 'gabled' || shape === 'hipped') && !church && b.p.length > 8 && area / (4 * o.hl * o.hw) < 0.72) {
    let per = 0;
    for (let i = 0, j = b.p.length - 2; i < b.p.length; j = i, i += 2) per += Math.hypot(b.p[i] - b.p[j], b.p[i + 1] - b.p[j + 1]);
    const half = Math.min(7.5, Math.max(2, (area / per) * 1.15)); // poloviční šířka křídla (obrys bývá bez dvora → omezit)
    let srh = Math.min(7, half * pitch, b.rh * 0.42);
    if (b.rh - srh < 2.6) srh = b.rh - 2.6;
    if (srh < 0.9) return null;
    // křídla: hřeben v poloviční šířce křídla, dál střecha klesá (dvůr / vnitřek zůstane nízko)
    return { skel: true, planes: [], p: simplifyRing(b.p, 1.2), kk: srh / half, half, eave: b.h - srh, rh: srh, o };
  }
  let rh = b.rl ? b.rl * 2.7 + 0.4 : o.hw * pitch;
  if (shape === 'pyramidal') rh = Math.min(o.hw, o.hl) * pitch;
  if (shape === 'skillion') rh = o.hw * 2 * pitch;
  rh = Math.min(rh, church ? 16 : 10, b.rh * (church ? 0.6 : 0.45));
  // výška z katastru je i se střechou → okap níž
  const wall = b.rh - rh;
  if (wall < 2.3) rh = b.rh - 2.3;
  if (rh < 0.9) return null;
  const k = rh / o.hw;
  let planes;
  if (shape === 'skillion') planes = [plane(o, o.vx, o.vz, rh / (2 * o.hw), rh / 2)];
  else {
    planes = [plane(o, o.vx, o.vz, -k, rh), plane(o, o.vx, o.vz, k, rh)];
    if (shape === 'hipped' || shape === 'pyramidal') {
      const kh = shape === 'pyramidal' ? rh / o.hl : k;
      const c0 = shape === 'pyramidal' ? rh : k * o.hl;
      planes.push(plane(o, o.ux, o.uz, -kh, c0), plane(o, o.ux, o.uz, kh, c0));
    }
  }
  return { planes, eave: b.h - rh, rh, o };
}

function edgeDist(p, x, z) {
  let d = 1e9;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], bx = p[i], bz = p[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    const e = ex * ex + ez * ez;
    if (e < d) d = e;
  }
  return Math.sqrt(d);
}
const roofF = (m, x, z) => {
  if (m.skel) { const d = edgeDist(m.p, x, z); return Math.max(0, m.rh - m.kk * Math.abs(d - m.half)); }
  let f = 1e9; for (const P of m.planes) { const v = evalP(P, x, z); if (v < f) f = v; } return Math.max(0, f);
};

/** Vzorkovač barev z ortofota (zmenšené kopie dílů). */
function orthoSampler(ortho, H) {
  if (!ortho) return null;
  const S = 768;
  const ctxs = ortho.map((t) => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(t.image, 0, 0, S, S);
      return g.getImageData(0, 0, S, S).data;
    } catch { return null; }
  });
  if (ctxs.some((c) => !c)) return null;
  return (x, z) => {
    const ci = x < 0 ? 0 : 1, cj = z < 0 ? 0 : 1;
    const d = ctxs[cj * 2 + ci];
    const u = (x - (-H + ci * H)) / H, v = (z - (-H + cj * H)) / H;
    const px = Math.max(0, Math.min(S - 1, Math.floor(u * S))), py = Math.max(0, Math.min(S - 1, Math.floor(v * S)));
    const o = (py * S + px) * 4;
    return [d[o], d[o + 1], d[o + 2]];
  };
}

/* ---------- styly fasád ---------- */
// výška patra a šířka okenní osy (m)
const STYLE_DIM = {
  baroque: [3.9, 3.6], grunder: [3.7, 3.3], secession: [3.6, 3.3], brick: [3.3, 3.0], functional: [3.1, 3.4],
  sorela: [3.0, 3.0], panel: [2.8, 3.0], panel2: [2.8, 3.0], house: [2.9, 3.2], house2: [2.9, 3.2],
  civic: [3.6, 3.6], glass: [3.6, 2.2], industrial: [5, 4], church: [6, 4.5], prison: [3.1, 3.0],
};
const SP = (list) => list.map(C);
const STYLE_PAL = {
  baroque: SP(['#ecd08a', '#efe2c2', '#e3a98f', '#d4dcc6', '#ebbfa7', '#f3e8cd', '#e8c9a0', '#d9c6e0', '#cfd9dd', '#f0d6b5', '#e6d07c']),
  grunder: SP(['#e7dccb', '#dccfb8', '#efe4cf', '#d8c6a8', '#e9d6b6', '#d6d0c4', '#e3cdb8', '#cdd2c4']),
  secession: SP(['#efe0c0', '#e8d2b0', '#dfe2d0', '#ecd8c8', '#f2e6cf', '#d9d9c4']),
  brick: SP(['#a85a3e', '#9c4f35', '#b0634a', '#94503a', '#a65f48']),
  functional: SP(['#f4f2ee', '#ecebe6', '#efe9de', '#e4e6e6', '#f2ecdf']),
  sorela: SP(['#d8cdb8', '#cfc4ad', '#ddd3c0', '#c9c0ae', '#d6cbb2']),
  panel: SP(['#dedbd2', '#d3d8da', '#e3d9c6', '#cdd3c8', '#e6cb92', '#b1c8d3', '#dbab95', '#c9d6b8', '#e8d48f', '#b9cfa2']),
  panel2: SP(['#e3e0d8', '#c7d6de', '#e9d2a4', '#d6c3d8', '#cfe0c4', '#f0c9a4']),
  house: SP(['#f1e8d6', '#e8d6b4', '#ddcbad', '#f3e5cc', '#d2c1a7', '#e9dfcf', '#f4f1ea']),
  house2: SP(['#f4efe4', '#ecdcbc', '#e4d4c0', '#f0e6d2']),
  civic: SP(['#d9d4c9', '#c9b79d', '#e2ddd2', '#cfc6b5', '#d8d2c0']),
  glass: SP(['#ffffff', '#e8eef2', '#dfe6ea']),
  industrial: SP(['#c2bfb7', '#adaeaa', '#c8bdaa', '#b7b4ab']),
  church: SP(['#ebe2cd', '#ddd1b8']),
  prison: SP(['#e6e2d8', '#dedad0', '#e9e4d6', '#d8d6cf']),
};
const pickW = (h, opts) => {
  let tot = 0;
  for (const k in opts) tot += opts[k];
  let r = h * tot;
  for (const k in opts) if ((r -= opts[k]) < 0) return k;
  return Object.keys(opts)[0];
};
/** Styl fasády podle druhu, roku stavby a čtvrti. */
function facadeStyle(b, core) {
  if (b.pair != null) return 'secession';
  const h = hash01(b.id * 17 + 5), y = b.yr;
  // Pražské předměstí (západně od Labe) – Gočárův „salon republiky“, meziválečná architektura
  const gocar = b.cx < -260 && b.cx > -1700 && Math.abs(b.cz) < 1100;
  if (b.k === 'church') return 'church';
  if (b.k === 'industrial') return 'industrial';
  if (b.k === 'house') return h < 0.5 ? 'house' : 'house2';
  // vesnice a hornické kolonie: rodinné domy, tu a tam prvorepublikový dům nebo bytovka z 50. let
  if ((b.k === 'block' || b.k === 'civic') && b.rh < 13.5 && !y) {
    if (b.k === 'civic') return pickW(h, { civic: 3, brick: 2, functional: 2, grunder: 1 });
    return pickW(h, { house: 5, house2: 4, grunder: 1, sorela: 1, brick: 1 });
  }
  if (b.k === 'panel') {
    if ((b.bt === 'office' || b.bt === 'commercial') && h < 0.5) return 'glass';
    return h < 0.55 ? 'panel' : 'panel2';
  }
  if (y && !(core && y >= 1918)) {
    if (y < 1800) return 'baroque';
    if (y < 1918) return h < 0.55 ? 'grunder' : 'secession';
    if (y < 1946) return h < 0.5 ? 'brick' : 'functional';
    if (y < 1960) return 'sorela';
    if (y < 1992) return b.k === 'civic' ? 'civic' : 'panel2';
    return h < 0.4 ? 'glass' : 'functional';
  }
  if (b.k === 'civic') {
    if (core) return pickW(h, { grunder: 4, baroque: 2, civic: 2 });
    if (gocar) return pickW(h, { brick: 5, functional: 3, civic: 2 });
    return pickW(h, { civic: 4, functional: 3, glass: 2, brick: 1 });
  }
  if (core) return pickW(h, { baroque: 4, grunder: 4, secession: 2 });
  if (gocar) return pickW(h, { functional: 4, brick: 3, grunder: 3, secession: 1 });
  return pickW(h, { grunder: 3, sorela: 3, functional: 2, secession: 1, panel2: 1 });
}
const HISTORIC = new Set(['baroque', 'grunder', 'secession', 'sorela', 'brick', 'civic']);

/** Prostorová římsa podél hrany (přední plocha, spodek, vršek). */
function trimBand(T, ax, az, bx, bz, nx, nz, y, hgt, d, col) {
  const len = Math.hypot(bx - ax, bz - az);
  const ex = ((bx - ax) / len) * d, ez = ((bz - az) / len) * d;
  const a = [ax - ex + nx * d, az - ez + nz * d], b = [bx + ex + nx * d, bz + ez + nz * d];
  const y0 = y - hgt, y1 = y;
  const dark = col.clone().multiplyScalar(0.72);
  T.v(a[0], y0, a[1], nx, 0, nz, 0, 0, col); T.v(b[0], y0, b[1], nx, 0, nz, 0, 0, col); T.v(b[0], y1, b[1], nx, 0, nz, 0, 0, col);
  T.v(a[0], y0, a[1], nx, 0, nz, 0, 0, col); T.v(b[0], y1, b[1], nx, 0, nz, 0, 0, col); T.v(a[0], y1, a[1], nx, 0, nz, 0, 0, col);
  T.v(ax, y0, az, 0, -1, 0, 0, 0, dark); T.v(b[0], y0, b[1], 0, -1, 0, 0, 0, dark); T.v(bx, y0, bz, 0, -1, 0, 0, 0, dark);
  T.v(ax, y0, az, 0, -1, 0, 0, 0, dark); T.v(a[0], y0, a[1], 0, -1, 0, 0, 0, dark); T.v(b[0], y0, b[1], 0, -1, 0, 0, 0, dark);
  T.v(ax, y1, az, 0, 1, 0, 0, 0, col); T.v(bx, y1, bz, 0, 1, 0, 0, 0, col); T.v(b[0], y1, b[1], 0, 1, 0, 0, 0, col);
  T.v(ax, y1, az, 0, 1, 0, 0, 0, col); T.v(b[0], y1, b[1], 0, 1, 0, 0, 0, col); T.v(a[0], y1, a[1], 0, 1, 0, 0, 0, col);
}

/** Kvádr (komín) do bufferu. */
function boxInto(T, x, z, w, y0, y1, col) {
  const h = w / 2;
  const P = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    const nx = (b[1] - a[1]) / w, nz = -(b[0] - a[0]) / w;
    T.v(a[0], y0, a[1], nx, 0, nz, 0, 0, col); T.v(b[0], y0, b[1], nx, 0, nz, 0, 0, col); T.v(b[0], y1, b[1], nx, 0, nz, 0, 0, col);
    T.v(a[0], y0, a[1], nx, 0, nz, 0, 0, col); T.v(b[0], y1, b[1], nx, 0, nz, 0, 0, col); T.v(a[0], y1, a[1], nx, 0, nz, 0, 0, col);
  }
  const top = col.clone().multiplyScalar(0.5);
  T.v(P[0][0], y1, P[0][1], 0, 1, 0, 0, 0, top); T.v(P[2][0], y1, P[2][1], 0, 1, 0, 0, 0, top); T.v(P[1][0], y1, P[1][1], 0, 1, 0, 0, 0, top);
  T.v(P[0][0], y1, P[0][1], 0, 1, 0, 0, 0, top); T.v(P[3][0], y1, P[3][1], 0, 1, 0, 0, 0, top); T.v(P[2][0], y1, P[2][1], 0, 1, 0, 0, 0, top);
}

/** Přístřešek zastávky / zastřešení: střecha na sloupcích, u zastávky prosklená zadní stěna. */
const SHELTER_ROOF = C('#8e959b'), SHELTER_POST = C('#3f464c'), SHELTER_GLASS = C('#7f9aaa');
function shelterInto(b, flats, trims) {
  const p = b.p, n = p.length / 2;
  const top = b.h, y0 = b.gmin - 0.3;
  // deska střechy
  const { pts, tris } = triangulate(p);
  for (const t of tris) {
    const q = t.map((k) => [pts[k].x, top, -pts[k].y]);
    flats.tri(q[0], q[2], q[1], SHELTER_ROOF, (v) => [v[0] / 6, v[2] / 6]);
    const u = t.map((k) => [pts[k].x, top - 0.18, -pts[k].y]);
    trims.tri(u[0], u[1], u[2], SHELTER_ROOF.clone().multiplyScalar(0.7), () => [0, 0]);
  }
  let longest = 0, li = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    trimBand(trims, ax, az, bx, bz, nx, nz, top, 0.18, 0.02, SHELTER_ROOF);
    if (len > longest) { longest = len; li = i; }
    if (n <= 10) boxInto(trims, ax, az, 0.14, y0, top - 0.1, SHELTER_POST);
  }
  // zastávka: zadní prosklená stěna podél nejdelší strany
  if (!b.lifted && longest > 2) {
    const j = (li + 1) % n;
    const ax = p[li * 2], az = p[li * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const nx = -(bz - az) / longest, nz = (bx - ax) / longest;
    const ya = b.g + 0.15, yb = top - 0.35;
    for (const [x0, z0, x1, z1] of [[ax, az, bx, bz]]) {
      trims.v(x0, ya, z0, nx, 0, nz, 0, 0, SHELTER_GLASS); trims.v(x1, ya, z1, nx, 0, nz, 0, 0, SHELTER_GLASS); trims.v(x1, yb, z1, nx, 0, nz, 0, 0, SHELTER_GLASS);
      trims.v(x0, ya, z0, nx, 0, nz, 0, 0, SHELTER_GLASS); trims.v(x1, yb, z1, nx, 0, nz, 0, 0, SHELTER_GLASS); trims.v(x0, yb, z0, nx, 0, nz, 0, 0, SHELTER_GLASS);
    }
    // lavička
    const mx = (ax + bx) / 2 - nx * 0.5, mz = (az + bz) / 2 - nz * 0.5;
    boxInto(trims, mx, mz, 0.45, b.g + 0.4, b.g + 0.48, C('#6b4a32'));
  }
}

/** Dvojice malých staveb u konce mostu (pavilony předmostí) mají být stejné. */
function pairBridgeheads(city) {
  const ends = [];
  for (const r of city.roads) if (r.b && r.n && r.drive) ends.push([r.p[0], r.p[1]], [r.p[r.p.length - 2], r.p[r.p.length - 1]]);
  for (const [ex, ez] of ends) {
    const near = [];
    city.bGrid.query(ex, ez, 28, (b) => {
      const w = b.maxx - b.minx, d = b.maxz - b.minz;
      if (w < 14 && d < 14 && Math.hypot(b.cx - ex, b.cz - ez) < 28 && !near.includes(b)) near.push(b);
    });
    if (near.length < 2) continue;
    near.sort((a, b) => Math.hypot(a.cx - ex, a.cz - ez) - Math.hypot(b.cx - ex, b.cz - ez));
    const [a, b] = near;
    const sa = (a.maxx - a.minx) * (a.maxz - a.minz), sb = (b.maxx - b.minx) * (b.maxz - b.minz);
    if (Math.abs(sa - sb) > Math.max(sa, sb) * 0.45) continue;
    const rh = Math.max(a.rh, b.rh);
    for (const o of [a, b]) {
      o.rh = rh; o.h = o.g + rh; o.r = 'flat'; o.pair = a.id;
      o.lv = rh > 5 ? Math.round(rh / 3.1) : 1;
    }
  }
}

function buildBuildings(city, tex, ortho, facades = null) {
  pairBridgeheads(city);
  if (city.prison) for (const b of city.buildings) b.inPrison = pointInPoly(b.cx, b.cz, city.prison);
  for (const e of PRISON_B) { const b = city.buildingAt(e.x, e.z); if (b) b.pb = e; }
  // dominanty určené bodem zájmu (budova, ve které bod leží)
  for (const L of LANDMARKS) if (L.poi || L.pt) {
    const q = L.pt ? { x: L.pt[0], z: L.pt[1] } : city.poi.find((o) => o.n === L.poi);
    const b = q && city.buildingAt(q.x, q.z);
    L.bid = b ? b.id : -1;
  }
  // vzhled konkrétních domů podle fotografií (data/facades.json)
  for (const [x, z, c, st, arc] of facades?.b || []) {
    const b = city.buildingAt(x, z);
    if (b) b.fac = { c, st, arc: !!arc };
  }
  const walls = {}; const roofs = new Buf();
  const H = city.half;
  const oRoofs = ortho ? [0, 1, 2, 3].map(() => new Buf()) : null;
  const sample = orthoSampler(ortho, H);
  const white = new THREE.Color('#ffffff');
  const kinds = [...Object.keys(STYLE_DIM), 'shop', 'arcade'];
  // Velké náměstí – domy do náměstí mají podloubí
  const squares = city.plazas.filter((q) => (q.n === 'Velké náměstí' || q.n === 'Malé náměstí') && q.t === 'square');
  const facesSquare = (mx, mz, nx, nz) => squares.some((sq) => {
    if (mx < sq.minx - 8 || mx > sq.maxx + 8 || mz < sq.minz - 8 || mz > sq.maxz + 8) return false;
    return pointInPoly(mx + nx * 7, mz + nz * 7, sq.p) || pointInPoly(mx - nx * 7, mz - nz * 7, sq.p);
  });
  const facesStreet = (mx, mz, nx, nz) => !city.buildingAt(mx + nx * 3, mz + nz * 3) && !!city.nearestRoad(mx + nx * 4, mz + nz * 4, 6);
  for (const k of kinds) walls[k] = new Buf();
  const trims = new Buf();
  const flats = new Buf();
  const chimneyC = C('#8d5a46');
  const landmarks = [];
  const tmpC = new THREE.Color();

  for (const b of city.buildings) {
    if (b.n === 'Bílá Věž') { landmarks.push({ type: 'whiteTower', b }); continue; }
    if (b.k === 'shelter') { shelterInto(b, flats, trims); continue; }
    const LM = landmarkOf(b);
    if (LM?.flat) b.r = 'flat';
    if (LM?.r) b.r = LM.r;
    if (LM?.pitch) b.pitch = LM.pitch;
    if (LM?.lv) b.lv = LM.lv;
    if (LM?.rh && !b.lmFixed) { b.rh = LM.rh; b.h = b.g + LM.rh; b.lmFixed = true; }
    if (LM?.extra) landmarks.push({ type: LM.extra, b });
    const p = b.p;
    const n = p.length / 2;
    const core = false; // vesnice nemá historické městské jádro
    const st = LM?.style || b.fac?.st || (LM?.extra === 'cathedral' ? 'church' : facadeStyle(b, core));
    const pal = STYLE_PAL[st];
    const wc = (LM?.wall ? C(LM.wall) : b.fac ? C(b.fac.c) : b.pair != null ? C('#ece4d2') : pal[Math.floor(hash01(b.id * 7 + 3) * pal.length)]).clone();
    if (b.pair == null && !b.fac && !LM?.wall) wc.offsetHSL(0, 0, (hash01(b.id * 13) - 0.5) * 0.06);
    const W = walls[st];
    const plinth = wc.clone().multiplyScalar(st === 'panel' || st === 'panel2' || st === 'industrial' ? 0.85 : 0.8);
    const base = plinth.clone().multiplyScalar(0.62);
    const wcTop = wc.clone().multiplyScalar(1.04);
    const gy = b.g;
    const roof = roofModel(b, core);
    b.roofM = roof; // pro chůzi po šikmé střeše
    const y0 = b.mh;
    const eave = roof ? roof.eave : b.h;
    const parapet = !roof && b.rh > 4 ? 0.55 : 0;
    const top = (x, z) => (roof ? eave + roofF(roof, x, z) : eave + parapet);
    // výška patra podle počtu podlaží z katastru, jinak podle stylu
    let [fh, bay] = STYLE_DIM[st];
    if (b.lv && b.lv > 0) fh = Math.max(2.7, Math.min(4.8, (eave - gy) / b.lv));
    const tile = fh * 4;
    // obchody v přízemí – historické a městské domy u ulic
    const shopP = b.k === 'civic' ? 0.2 : 0.1;
    const INSTIT = new Set(['school', 'university', 'college', 'kindergarten', 'government', 'public', 'civic', 'hospital', 'church', 'cathedral', 'chapel', 'office', 'train_station']);
    const shops = b.pair == null && !LM && !b.n && b.k === 'block' && !INSTIT.has(b.bt) && !b.lifted && HISTORIC.has(st) && st !== 'civic' && eave - gy > fh * 2.2 && hash01(b.id * 31 + 7) < shopP
      && !!city.nearestRoad(b.cx, b.cz, Math.max(b.maxx - b.minx, b.maxz - b.minz) / 2 + 6, (r) => r.drive || r.t === 'pedestrian');
    const S = walls.shop;
    const shopC = wc.clone().lerp(white, 0.55);
    const ym = b.lifted ? y0 : Math.min(eave, gy + fh);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      // okenní osy rozložené přesně na délku stěny
      const nb = Math.max(1, Math.round(len / bay));
      const uS = nb / 4 / len;
      if (!b.lifted) {
        // část pod terénem (svah) + přízemí
        if (gy - y0 > 0.05) {
          const v0 = (y0 - gy) / tile;
          W.v(ax, y0, az, nx, 0, nz, 0, v0, base); W.v(bx, y0, bz, nx, 0, nz, len * uS, v0, base); W.v(bx, gy, bz, nx, 0, nz, len * uS, 0, base);
          W.v(ax, y0, az, nx, 0, nz, 0, v0, base); W.v(bx, gy, bz, nx, 0, nz, len * uS, 0, base); W.v(ax, gy, az, nx, 0, nz, 0, 0, base);
        }
        const G0 = Math.min(gy, ym);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        // vnější normála: bod za stěnou nesmí být uvnitř budovy
        const out = pointInPoly(mx + nx * 0.6, mz + nz * 0.6, p) ? -1 : 1;
        const arcEdge = len > 3 && b.k !== 'church' && ((core && HISTORIC.has(st) && (!b.fac || b.fac.arc) && facesSquare(mx, mz, nx * out, nz * out))
          || (b.fac?.arc && facesStreet(mx, mz, nx * out, nz * out)));
        if (arcEdge) {
          const A = walls.arcade, vm = (ym - G0) / fh;
          A.v(ax, G0, az, nx, 0, nz, 0, 0, shopC); A.v(bx, G0, bz, nx, 0, nz, len * uS, 0, shopC); A.v(bx, ym, bz, nx, 0, nz, len * uS, vm, shopC);
          A.v(ax, G0, az, nx, 0, nz, 0, 0, shopC); A.v(bx, ym, bz, nx, 0, nz, len * uS, vm, shopC); A.v(ax, ym, az, nx, 0, nz, 0, vm, shopC);
        } else if (shops && len > 3) {
          const vm = (ym - G0) / fh;
          S.v(ax, G0, az, nx, 0, nz, 0, 0, shopC); S.v(bx, G0, bz, nx, 0, nz, len * uS, 0, shopC); S.v(bx, ym, bz, nx, 0, nz, len * uS, vm, shopC);
          S.v(ax, G0, az, nx, 0, nz, 0, 0, shopC); S.v(bx, ym, bz, nx, 0, nz, len * uS, vm, shopC); S.v(ax, ym, az, nx, 0, nz, 0, vm, shopC);
        } else {
          const v1 = (ym - gy) / tile;
          W.v(ax, G0, az, nx, 0, nz, 0, 0, plinth); W.v(bx, G0, bz, nx, 0, nz, len * uS, 0, plinth); W.v(bx, ym, bz, nx, 0, nz, len * uS, v1, plinth);
          W.v(ax, G0, az, nx, 0, nz, 0, 0, plinth); W.v(bx, ym, bz, nx, 0, nz, len * uS, v1, plinth); W.v(ax, ym, az, nx, 0, nz, 0, v1, plinth);
        }
      }
      // zlomy střechy podél hrany (štíty)
      const ts = [0, 1];
      if (roof) {
        const P = roof.planes;
        for (let q = 0; q < P.length; q++) for (let r = q + 1; r < P.length; r++) {
          const fa = evalP(P[q], ax, az) - evalP(P[r], ax, az), fb = evalP(P[q], bx, bz) - evalP(P[r], bx, bz);
          if ((fa < 0) !== (fb < 0) && fa !== fb) ts.push(fa / (fa - fb));
        }
        ts.sort((x, y) => x - y);
      }
      for (let s2 = 0; s2 < ts.length - 1; s2++) {
        const t0 = ts[s2], t1 = ts[s2 + 1];
        if (t1 - t0 < 1e-4) continue;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const h0 = top(x0, z0), h1 = top(x1, z1);
        if (h0 <= ym && h1 <= ym) continue;
        const ua = len * t0 * uS, ub = len * t1 * uS;
        // okna jen pod okapem; štít a atika jsou hladká omítka
        const e0 = Math.min(h0, eave), e1 = Math.min(h1, eave);
        if (e0 > ym || e1 > ym) {
          const vm = (ym - gy) / tile, va = (e0 - gy) / tile, vb = (e1 - gy) / tile;
          W.v(x0, ym, z0, nx, 0, nz, ua, vm, wc); W.v(x1, ym, z1, nx, 0, nz, ub, vm, wc); W.v(x1, e1, z1, nx, 0, nz, ub, vb, wcTop);
          W.v(x0, ym, z0, nx, 0, nz, ua, vm, wc); W.v(x1, e1, z1, nx, 0, nz, ub, vb, wcTop); W.v(x0, e0, z0, nx, 0, nz, ua, va, wcTop);
        }
        if (h0 > eave + 0.02 || h1 > eave + 0.02) {
          const gc = wcTop;
          const b0 = Math.max(ym, eave);
          trims.v(x0, b0, z0, nx, 0, nz, 0, 0, gc); trims.v(x1, b0, z1, nx, 0, nz, 0, 0, gc); trims.v(x1, Math.max(b0, h1), z1, nx, 0, nz, 0, 0, gc);
          trims.v(x0, b0, z0, nx, 0, nz, 0, 0, gc); trims.v(x1, Math.max(b0, h1), z1, nx, 0, nz, 0, 0, gc); trims.v(x0, Math.max(b0, h0), z0, nx, 0, nz, 0, 0, gc);
        }
      }
      // prostorové římsy: korunní pod střechou, kordonová nad přízemím
      if (HISTORIC.has(st) && len > 1.5 && eave - gy > 5) {
        const tc2 = wc.clone().lerp(white, 0.45);
        trimBand(trims, ax, az, bx, bz, nx, nz, eave, st === 'baroque' ? 0.75 : 0.55, st === 'baroque' ? 0.45 : 0.32, tc2);
        if (core && !b.lifted && ym < eave - 1) trimBand(trims, ax, az, bx, bz, nx, nz, ym + 0.12, 0.25, 0.14, tc2);
      }
    }
    // komíny na šikmých střechách domů a historické zástavby
    if (roof && roof.planes.length >= 2 && (b.k === 'house' || HISTORIC.has(st)) && hash01(b.id * 41) < 0.75) {
      const o = roof.o;
      const cnt = o.hl > 7 ? 2 : 1;
      for (let k = 0; k < cnt; k++) {
        const t = cnt === 1 ? (hash01(b.id) - 0.5) * 0.6 : k ? 0.45 : -0.45;
        const off = (hash01(b.id * 3 + k) - 0.5) * o.hw * 0.6;
        const x = o.cx + o.ux * o.hl * t + o.vx * off, z = o.cz + o.uz * o.hl * t + o.vz * off;
        const ry = eave + roofF(roof, x, z);
        boxInto(trims, x, z, 0.7, ry - 0.6, eave + roof.rh + 0.9, chimneyC);
      }
    }
    // střecha
    if (roof) {
      // skutečná barva krytiny z leteckého snímku (průměr z několika bodů)
      let tc = PAL.tile[Math.floor(hash01(b.id * 3 + 1) * PAL.tile.length)];
      if (sample) {
        let r = 0, g = 0, bl = 0, cnt = 0;
        for (let k = 0; k < n; k++) {
          for (const f of [0.35, 0.65]) {
            const [cr, cg, cb] = sample(b.cx + (p[k * 2] - b.cx) * f, b.cz + (p[k * 2 + 1] - b.cz) * f);
            r += cr; g += cg; bl += cb; cnt++;
          }
        }
        tmpC.setRGB(r / cnt / 255, g / cnt / 255, bl / cnt / 255, THREE.SRGBColorSpace);
        // ortofoto je bledší a šedší než skutečnost → vrátit sytost
        const hsl = {};
        tmpC.getHSL(hsl);
        tmpC.setHSL(hsl.h, Math.min(0.75, hsl.s * 1.9 + 0.06), Math.min(0.62, hsl.l * 1.15 + 0.03));
        tc = tc.clone().lerp(tmpC, 0.75);
      }
      if (LM?.roof) tc = C(LM.roof);
      if (roof.skel) {
        const tb = new Buf();
        const { pts, tris } = triangulate(p);
        for (const t of tris) {
          const qv = t.map((k) => [pts[k].x, eave, -pts[k].y]);
          tb.tri(qv[0], qv[2], qv[1], tc, (v) => [v[0] / 4, v[2] / 4]);
        }
        for (let i = 0; i < tb.nor.length; i += 3) { tb.nor[i] = 0; tb.nor[i + 1] = 1; tb.nor[i + 2] = 0; }
        const d = tb.faceUp().drape((x, z) => roofF(roof, x, z), 2.5, true, 0.05);
        for (const k of ['pos', 'nor', 'uv', 'col']) { const src = d[k], dst = roofs[k]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
      }
      const P = roof.planes;
      for (let q = 0; q < P.length; q++) {
        let reg = p;
        for (let r = 0; r < P.length && reg.length >= 6; r++) {
          if (r === q) continue;
          reg = clipHalf(reg, P[q][0] - P[r][0], P[q][1] - P[r][1], P[q][2] - P[r][2]);
        }
        if (reg.length < 6) continue;
        const gl = Math.hypot(P[q][0], P[q][1]) || 1;
        const gx = P[q][0] / gl, gz = P[q][1] / gl;
        const sl = Math.sqrt(1 + gl * gl);
        const uvf = (v) => [(v[0] * -gz + v[2] * gx) / 4, ((v[0] * gx + v[2] * gz) * sl) / 4];
        const shade = tc.clone().multiplyScalar(0.92 + 0.16 * hash01(q + b.id));
        const { pts, tris } = triangulate(reg);
        for (const t of tris) {
          const qv = t.map((k) => { const x = pts[k].x, z = -pts[k].y; return [x, eave + Math.max(0, evalP(P[q], x, z)), z]; });
          roofs.tri(qv[0], qv[2], qv[1], shade, uvf);
        }
      }
    } else {
      // plochá střecha: čistý povrch v barvě odečtené z ortofota (fotka na střeše byla rozmazaná a se šikmými fasádami)
      let fc = PAL.flat[Math.floor(hash01(b.id * 5 + 2) * PAL.flat.length)];
      if (sample) {
        let r = 0, g = 0, bl = 0, cnt = 0;
        for (let k = 0; k < n; k++) {
          const [cr, cg, cb] = sample(b.cx + (p[k * 2] - b.cx) * 0.4, b.cz + (p[k * 2 + 1] - b.cz) * 0.4);
          r += cr; g += cg; bl += cb; cnt++;
        }
        const [cr, cg, cb] = sample(b.cx, b.cz);
        r += cr * 2; g += cg * 2; bl += cb * 2; cnt += 2;
        tmpC.setRGB(r / cnt / 255, g / cnt / 255, bl / cnt / 255, THREE.SRGBColorSpace);
        const hsl = {};
        tmpC.getHSL(hsl);
        tmpC.setHSL(hsl.h, Math.min(0.25, hsl.s * 0.7), Math.max(0.28, Math.min(0.62, hsl.l * 1.2)));
        fc = tmpC.clone();
      }
      if (LM?.roof) fc = C(LM.roof);
      const { pts, tris } = triangulate(p);
      for (const t of tris) {
        const q = t.map((k) => [pts[k].x, eave + 0.05, -pts[k].y]);
        flats.tri(q[0], q[2], q[1], fc, (v) => [v[0] / 6, v[2] / 6]);
      }
    }
  }
  // oprava orientace střech (normála musí mířit nahoru)
  for (const RB of [roofs, flats, ...(oRoofs || [])]) {
    const rp = RB.pos, rn = RB.nor;
    for (let i = 0; i < rp.length; i += 9) {
      if (rn[i + 1] < 0) {
        for (let k = 0; k < 3; k++) {
          const t = rp[i + 3 + k]; rp[i + 3 + k] = rp[i + 6 + k]; rp[i + 6 + k] = t;
        }
        const uvI = (i / 3) * 2;
        const u = RB.uv;
        [u[uvI + 2], u[uvI + 4]] = [u[uvI + 4], u[uvI + 2]];
        [u[uvI + 3], u[uvI + 5]] = [u[uvI + 5], u[uvI + 3]];
        for (let k = 0; k < 9; k += 3) { rn[i + k] = -rn[i + k]; rn[i + k + 1] = -rn[i + k + 1]; rn[i + k + 2] = -rn[i + k + 2]; }
      }
    }
  }

  const group = new THREE.Group();
  const mats = {};
  for (const k of kinds) {
    if (!walls[k].pos.length) continue;
    const m = new THREE.MeshStandardMaterial({
      map: tex[k].map, emissiveMap: tex[k].emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
      vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide,
    });
    mats[k] = m;
    const mesh = new THREE.Mesh(walls[k].geometry(), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (flats.pos.length) {
    const fm = new THREE.Mesh(flats.geometry(), new THREE.MeshStandardMaterial({ map: TX.grassTexture(), vertexColors: true, roughness: 0.95 }));
    fm.castShadow = true; fm.receiveShadow = true;
    group.add(fm);
  }
  if (trims.pos.length) {
    const tm = new THREE.Mesh(trims.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    tm.castShadow = true; tm.receiveShadow = true;
    group.add(tm);
  }
  const roofMat = new THREE.MeshStandardMaterial({ map: TX.roofTexture(), vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const rm = new THREE.Mesh(roofs.geometry(), roofMat);
  rm.castShadow = true; rm.receiveShadow = true;
  group.add(rm);
  if (oRoofs) oRoofs.forEach((RB, k) => {
    if (!RB.pos.length) return;
    const m = new THREE.Mesh(RB.geometry(), new THREE.MeshStandardMaterial({ map: ortho[k], vertexColors: true, roughness: 0.9 }));
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  });
  return { group, mats, landmarks };
}

/* ===================== BÍLÁ VĚŽ ===================== */
function whiteTower(b) {
  const g = new THREE.Group();
  const w = Math.max(6, Math.min(b.maxx - b.minx, b.maxz - b.minz));
  // podle fotografií: šedohnědý pískovec, tmavá (břidlicová) báň s ochozem
  const stone = new THREE.MeshStandardMaterial({ color: '#b9a68f', roughness: 0.9 });
  const copper = new THREE.MeshStandardMaterial({ color: '#3d4447', roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.7 });
  const shaftH = 46;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, shaftH, w), stone);
  shaft.position.y = shaftH / 2;
  g.add(shaft);
  // římsy a okna
  for (const y of [14, 28, 40]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, w + 0.6), stone);
    r.position.y = y; g.add(r);
  }
  for (let s = 0; s < 4; s++) {
    for (const y of [20, 34, 43]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, y === 43 ? 3.4 : 2.2, 0.2), dark);
      const a = (s * Math.PI) / 2;
      win.position.set(Math.sin(a) * (w / 2 + 0.05), y, Math.cos(a) * (w / 2 + 0.05));
      win.rotation.y = a;
      g.add(win);
    }
  }
  // cibulová střecha (soustružený profil)
  const prof = [];
  const R = w * 0.72;
  const P = [[0.98, 0], [1.0, 0.8], [0.62, 2.2], [0.5, 3.0], [0.78, 5.0], [0.86, 6.4], [0.7, 8.0], [0.32, 9.6], [0.16, 10.4],
    [0.22, 11.2], [0.3, 12.0], [0.24, 13.0], [0.1, 13.8], [0.06, 16.5], [0.0, 17.5]];
  for (const [r, y] of P) prof.push(new THREE.Vector2(r * R, y));
  const onion = new THREE.Mesh(new THREE.LatheGeometry(prof, 4 * 6), copper);
  onion.rotation.y = Math.PI / 4;
  onion.scale.set(1, 1.25, 1);
  onion.position.y = shaftH;
  g.add(onion);
  // ochoz
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.9, w + 1.2), copper);
  rail.position.y = shaftH + 0.4;
  g.add(rail);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), new THREE.MeshStandardMaterial({ color: '#d8b04a', metalness: 0.8, roughness: 0.3 }));
  cross.position.y = shaftH + 17.5 * 1.25 + 0.6;
  g.add(cross);
  // ciferníky pod ochozem
  const cm = new THREE.MeshStandardMaterial({ map: clockTexture(), transparent: true, roughness: 0.5 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const c = new THREE.Mesh(new THREE.CircleGeometry(w * 0.26, 32), cm);
    c.position.set(Math.sin(a) * (w / 2 + 0.08), 37.5, Math.cos(a) * (w / 2 + 0.08));
    c.rotation.y = a;
    g.add(c);
  }
  g.position.set(b.cx, b.g, b.cz);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* ===================== KATEDRÁLA SV. DUCHA ===================== */
// gotické cihlové trojlodí; dvě věže s jehlancovými střechami na západním průčelí
function cathedralTowers(b) {
  const o = obb(b.p);
  if (!o) return null;
  const g = new THREE.Group();
  const brick = new THREE.MeshStandardMaterial({ color: '#a85a3e', roughness: 0.92 });
  const stone = new THREE.MeshStandardMaterial({ color: '#d8cfbf', roughness: 0.85 });
  const slate = new THREE.MeshStandardMaterial({ color: '#3f4448', roughness: 0.6, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#25282b', roughness: 0.7 });
  // západní konec podélné osy
  const s = o.ux < 0 ? 1 : -1;
  const ex = o.cx + o.ux * o.hl * s, ez = o.cz + o.uz * o.hl * s;
  const w = Math.min(6, o.hw * 0.6);
  const shaft = 31;
  for (const side of [-1, 1]) {
    const t = new THREE.Group();
    const tx = ex - o.ux * s * (w / 2) + o.vx * side * (o.hw - w / 2), tz = ez - o.uz * s * (w / 2) + o.vz * side * (o.hw - w / 2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, shaft, w), brick);
    body.position.y = shaft / 2;
    t.add(body);
    for (const y of [10, 20, shaft - 0.3]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, w + 0.5), stone);
      r.position.y = y; t.add(r);
    }
    // gotická okna
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      for (const y of [15, 25]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, y === 25 ? 4.2 : 3, 0.2), dark);
        win.position.set(Math.sin(a) * (w / 2 + 0.05), y, Math.cos(a) * (w / 2 + 0.05));
        win.rotation.y = a;
        t.add(win);
      }
    }
    // jehlan (osmiboký) s věžičkami v rozích
    const spire = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 17, 8), slate);
    spire.position.y = shaft + 8.5;
    spire.rotation.y = Math.PI / 8;
    t.add(spire);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 6), slate);
      p.position.set(cx * (w / 2 - 0.3), shaft + 1.6, cz * (w / 2 - 0.3));
      t.add(p);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), new THREE.MeshStandardMaterial({ color: '#d8b04a', metalness: 0.8, roughness: 0.3 }));
    cross.position.y = shaft + 17.6;
    t.add(cross);
    t.position.set(tx, b.g - 0.5, tz);
    t.rotation.y = Math.atan2(o.ux, o.uz);
    g.add(t);
  }
  // opěrné pilíře a lomená okna podél lodi
  const nave = Math.max(4, b.rh - 6);
  for (const side of [-1, 1]) {
    const cnt = Math.max(3, Math.floor((o.hl * 2 - w) / 6));
    for (let k = 0; k < cnt; k++) {
      const t = -o.hl + w + 3 + k * ((o.hl * 2 - w - 6) / Math.max(1, cnt - 1));
      const along = -s * t;
      const px = o.cx + o.ux * along + o.vx * side * (o.hw + 0.6), pz = o.cz + o.uz * along + o.vz * side * (o.hw + 0.6);
      const bt = new THREE.Mesh(new THREE.BoxGeometry(1.2, nave, 1.0), brick);
      bt.position.set(px, b.g + nave / 2 - 0.5, pz);
      bt.rotation.y = Math.atan2(o.ux, o.uz);
      const capB = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 4), stone);
      capB.position.set(px, b.g + nave + 0.3, pz);
      capB.rotation.y = Math.atan2(o.ux, o.uz) + Math.PI / 4;
      g.add(bt, capB);
      if (k < cnt - 1) {
        const mid = along - s * ((o.hl * 2 - w - 6) / Math.max(1, cnt - 1)) / 2;
        const wx = o.cx + o.ux * mid + o.vx * side * (o.hw + 0.06), wz = o.cz + o.uz * mid + o.vz * side * (o.hw + 0.06);
        const shape = new THREE.Shape();
        shape.moveTo(-0.9, 0); shape.lineTo(0.9, 0); shape.lineTo(0.9, nave * 0.55); shape.quadraticCurveTo(0.9, nave * 0.68, 0, nave * 0.75);
        shape.quadraticCurveTo(-0.9, nave * 0.68, -0.9, nave * 0.55); shape.closePath();
        const win = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#2b3340', roughness: 0.3, metalness: 0.3, side: THREE.DoubleSide }));
        win.position.set(wx, b.g + 2.5, wz);
        win.rotation.y = Math.atan2(o.vx * side, o.vz * side);
        g.add(win);
      }
    }
  }
  // rozeta na západním průčelí mezi věžemi
  const rose = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: '#33405a', roughness: 0.3, metalness: 0.3, side: THREE.DoubleSide }));
  rose.position.set(ex + o.ux * s * 0.08, b.g + 14, ez + o.uz * s * 0.08);
  rose.rotation.y = Math.atan2(o.ux * s, o.uz * s);
  const roseR = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.2, 6, 24), stone);
  roseR.position.copy(rose.position); roseR.rotation.y = rose.rotation.y;
  g.add(rose, roseR);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

/* ===================== DALŠÍ DOMINANTY ===================== */
const lmMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

/** Barokní báň s lucernou (věže kostela Nanebevzetí P. Marie). */
function baroqueHelmet(b) {
  const w = Math.min(b.maxx - b.minx, b.maxz - b.minz);
  const R = w * 0.5;
  const dark = lmMat(COPPER, { metalness: 0.3, roughness: 0.5 });
  const g = new THREE.Group();
  const prof = [[1.0, 0], [0.98, 0.5], [0.62, 1.6], [0.55, 2.2], [0.78, 3.4], [0.8, 4.2], [0.55, 5.2], [0.3, 5.8],
    [0.3, 7.4], [0.36, 7.6], [0.2, 8.4], [0.12, 9.2], [0.06, 11.0], [0, 11.6]].map(([r, y]) => new THREE.Vector2(r * R, y * (w / 8)));
  const helm = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), dark);
  g.add(helm);
  // římsa a otvory lucerny
  const cor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, w + 0.6), lmMat('#e3d9c4'));
  cor.position.y = 0.1;
  g.add(cor);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), lmMat('#d8b04a', { metalness: 0.8, roughness: 0.3 }));
  cross.position.y = 11.6 * (w / 8) + 0.6;
  g.add(cross);
  g.position.set(b.cx, b.h, b.cz);
  return g;
}

/** Kupole na tamburu (bývalá synagoga). */
function domeOn(b) {
  const w = Math.min(b.maxx - b.minx, b.maxz - b.minz);
  const r = w * 0.3;
  const copper = lmMat(COPPER, { metalness: 0.3, roughness: 0.5 });
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3.2, 24), lmMat('#e6dcc4', { roughness: 0.85 }));
  drum.position.y = 1.6;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), copper);
  dome.position.y = 3.2;
  dome.scale.y = 1.15;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 2, 10), copper);
  lantern.position.y = 3.2 + r * 1.2 + 0.8;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 10), copper);
  cap.position.y = lantern.position.y + 1.7;
  g.add(drum, dome, lantern, cap);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.1), lmMat('#2a2f36'));
    win.position.set(Math.sin(a) * (r + 0.02), 1.7, Math.cos(a) * (r + 0.02));
    win.rotation.y = a;
    g.add(win);
  }
  g.position.set(b.cx, b.h, b.cz);
  return g;
}

/** Hodiny na všech stranách věže (hlavní nádraží). */
function clockFaces(b) {
  const o = obb(b.p);
  const g = new THREE.Group();
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#f4f1e8'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
  x.strokeStyle = '#222'; x.lineWidth = 6; x.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    x.fillStyle = '#222';
    x.fillRect(64 + Math.sin(a) * 48 - 3, 64 - Math.cos(a) * 48 - 7, 6, 14);
  }
  x.lineCap = 'round';
  x.lineWidth = 7; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + 26, 64 - 15); x.stroke();
  x.lineWidth = 4; x.beginPath(); x.moveTo(64, 64); x.lineTo(64, 18); x.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, emissive: '#fff4d8', emissiveMap: tex, emissiveIntensity: 0.15 });
  const rad = Math.min(o.hw, o.hl) * 0.75;
  for (const [dx, dz, half] of [[o.ux, o.uz, o.hl], [-o.ux, -o.uz, o.hl], [o.vx, o.vz, o.hw], [-o.vx, -o.vz, o.hw]]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(rad, 32), m);
    c.position.set(o.cx + dx * (half + 0.06), b.h - rad - 1.2, o.cz + dz * (half + 0.06));
    c.rotation.y = Math.atan2(dx, dz);
    g.add(c);
  }
  return g;
}

/** Ciferník (sdílená textura). */
let _clockTex = null;
function clockTexture() {
  if (_clockTex) return _clockTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#f4f1e8'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
  x.strokeStyle = '#c8a24a'; x.lineWidth = 6; x.stroke();
  x.fillStyle = '#222';
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.fillRect(64 + Math.sin(a) * 48 - 3, 64 - Math.cos(a) * 48 - 7, 6, 14); }
  x.strokeStyle = '#222'; x.lineCap = 'round';
  x.lineWidth = 7; x.beginPath(); x.moveTo(64, 64); x.lineTo(90, 49); x.stroke();
  x.lineWidth = 4; x.beginPath(); x.moveTo(64, 64); x.lineTo(64, 18); x.stroke();
  _clockTex = new THREE.CanvasTexture(cv);
  _clockTex.colorSpace = THREE.SRGBColorSpace;
  return _clockTex;
}

/** Mariánský (morový) sloup – podstavec s balustrádou, sloup, pozlacená socha. */
function marianColumn(x, z, y) {
  const g = new THREE.Group();
  const stone = lmMat('#d9cfbd', { roughness: 0.9 });
  const gold = lmMat('#d6ad4a', { metalness: 0.85, roughness: 0.3 });
  const step = (w, h, yy) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), stone); m.position.y = yy + h / 2; g.add(m); };
  step(9, 0.4, 0); step(8, 0.4, 0.4); step(7.2, 0.9, 0.8);
  // balustráda
  for (let k = 0; k < 4; k++) {
    for (let t = -3; t <= 3; t++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.75, 6), stone);
      const a = (k * Math.PI) / 2;
      b.position.set(Math.cos(a) * 3.4 + Math.sin(a) * t * 0.9 * (k % 2 ? 1 : 0) - (k % 2 ? 0 : 0), 2.05, Math.sin(a) * 3.4 + (k % 2 ? 0 : t * 0.9));
      if (k % 2) b.position.set(Math.cos(a) * 3.4 + t * 0.9, 2.05, Math.sin(a) * 3.4);
      g.add(b);
    }
  }
  // sochy světců v rozích
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), stone);
    ped.position.set(cx * 2.6, 2.3, cz * 2.6);
    const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), stone);
    fig.position.set(cx * 2.6, 3.5, cz * 2.6);
    g.add(ped, fig);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 2.4), stone);
  base.position.y = 1.7 + 1.6;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 8.5, 14), stone);
  col.position.y = 4.9 + 4.25;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), stone);
  cap.position.y = 13.65;
  const statue = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 10), gold);
  statue.position.y = 14.9;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 20), gold);
  halo.position.y = 16.1;
  g.add(base, col, cap, statue, halo);
  g.position.set(x, y, z);
  return g;
}

/** Pomník: podstavec a bronzová postava. */
/**
 * Ocelová těžní věž (kozlíková): čtyřnohý šachetní rám s ondřejskými kříži, nahoře lanovnice
 * se dvěma kladkami, šikmé vzpěry ke strojovně a lana ke strojovně. dir = směr ke strojovně.
 */
function headframe(H, dir) {
  const g = new THREE.Group();
  const steel = lmMat('#5a3a2c', { roughness: 0.7, metalness: 0.4 });
  const dark = lmMat('#2b2522', { roughness: 0.6, metalness: 0.5 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // nosník mezi dvěma body
  const beam = (a, b, t = 0.32, m = steel) => {
    const d = b.clone().sub(a), L = d.length();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, L, t), m);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    g.add(mesh);
    return mesh;
  };
  const w0 = 3.4, w1 = 2.4; // poloviční šířka dole a nahoře (rám se zužuje)
  const at = (sx, sz, y) => { const w = w0 + (w1 - w0) * (y / H); return V(sx * w, y, sz * w); };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) beam(at(sx, sz, 0), at(sx, sz, H), 0.55);
  // patra s vodorovnými ztužidly a kříži v každé stěně
  const levels = 7;
  for (let k = 0; k <= levels; k++) {
    const y = (H * k) / levels;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      beam(at(ax, az, y), at(bx, bz, y), 0.3);
      if (k < levels) {
        const y2 = (H * (k + 1)) / levels;
        beam(at(ax, az, y), at(bx, bz, y2), 0.16);
        beam(at(bx, bz, y), at(ax, az, y2), 0.16);
      }
    }
  }
  // lanovnice: plošina se zábradlím
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w1 * 2 + 1.6, 0.35, w1 * 2 + 1.6), steel);
  deck.position.y = H + 0.2;
  g.add(deck);
  for (const [sx, sz] of corners) beam(V(sx * (w1 + 0.8), H + 0.3, sz * (w1 + 0.8)), V(sx * (w1 + 0.8), H + 1.4, sz * (w1 + 0.8)), 0.08, dark);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    beam(V(ax * (w1 + 0.8), H + 1.4, az * (w1 + 0.8)), V(bx * (w1 + 0.8), H + 1.4, bz * (w1 + 0.8)), 0.08, dark);
  }
  // dvě lanové kladky vedle sebe, rovina kladek míří ke strojovně (+z)
  const R = 2.4;
  for (const sx of [-1.15, 1.15]) {
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 8, 40), dark);
    wheel.add(rim);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.09, R * 2, 0.09), dark);
      sp.rotation.z = a;
      wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 12), dark);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(sx, H + 0.5 + R, 0);
    g.add(wheel);
    // ložiska kladky na kozlících
    beam(V(sx - 0.4, H + 0.35, 0), V(sx - 0.4, H + 0.5 + R, 0), 0.28);
    beam(V(sx + 0.4, H + 0.35, 0), V(sx + 0.4, H + 0.5 + R, 0), 0.28);
    // lano ke strojovně (z vrchu kladky šikmo dolů) a do jámy (svisle)
    const top = V(sx, H + 0.5 + R * 2, 0.0);
    beam(V(sx, H + 0.5 + R, R), V(sx, 9, H * 0.95), 0.06, dark);
    beam(V(sx, H + 0.5 + R, -R), V(sx, 1, -R), 0.06, dark);
    void top;
  }
  // šikmé vzpěry ke strojovně
  const foot = H * 0.62;
  for (const sx of [-1, 1]) {
    const a = V(sx * 3.2, 0, foot), b = V(sx * w1, H, w1);
    beam(a, b, 0.62);
    // ztužení vzpěry
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      const p = a.clone().lerp(b, t);
      beam(p, at(sx, 1, p.y), 0.22);
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.6), lmMat('#9a958b', { roughness: 0.95 }));
    pad.position.set(sx * 3.2, 0.3, foot);
    g.add(pad);
  }
  beam(V(-3.2, H * 0.35, foot * 0.65), V(3.2, H * 0.35, foot * 0.65), 0.3);
  // betonové patky nohou rámu
  for (const [sx, sz] of corners) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), lmMat('#9a958b', { roughness: 0.95 }));
    pad.position.set(sx * w0, 0.3, sz * w0);
    g.add(pad);
  }
  g.rotation.y = dir;
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

/* ===================== VĚZNICE VINAŘICE ===================== */
/*
 * Obvod a vnitřní členění podle ortofota ČÚZK (2,6 px/m) a OSM (obrys areálu, ploty, brány, komín).
 * Souřadnice světa: x = východ, z = jih. Bílá betonová zeď na severu, východě a jihovýchodě,
 * u jižního křídla a na západě plot, uvnitř zabezpečená zóna se zdí a souběžným plotem, 5 strážních věží.
 */
const PRISON = {
  walls: [ // vnější betonová zeď 5 m
    [[-422, 1060], [-388, 1029], [-379.1, 1021.6], [-287.5, 1017.2], [-256.3, 1014.8], [-62.4, 1000.2], [-56.5, 1084.3],
      [-115.4, 1115.6], [-151.3, 1152.4], [-221.4, 1227.1]],
    [[-418.6, 1132.6], [-323.9, 1126.8]],
  ],
  innerWalls: [ // zeď zabezpečené zóny 5 m
    [[-404, 1051], [-386, 1050]],
    [[-389, 1064], [-377, 1128.5], [-323.9, 1124.5], [-247.9, 1119.5], [-150.4, 1113.5], [-116, 1112]],
  ],
  fences: [ // obvodový plot 3 m (západ a jižní křídlo)
    [[-303.2, 1147.1], [-221.4, 1227.1]],
    [[-422, 1060], [-424, 1064.6], [-449.4, 1078.1], [-447.8, 1083.1], [-441.2, 1094], [-438.2, 1099.4], [-440.9, 1101.1],
      [-432.3, 1115.5], [-430.7, 1114.5], [-421, 1130.7], [-418.6, 1132.6]],
  ],
  innerFences: [ // souběžné ploty 4 m uvnitř (pás mezi zdí a plotem)
    [[-381, 1031], [-287, 1025], [-256, 1023], [-70, 1008.5]],
    [[-68.5, 1008.5], [-67, 1078], [-116, 1104.5]],
    [[-383.5, 1066], [-372, 1122.8], [-323.9, 1119], [-247.9, 1111.5], [-150.4, 1105.5], [-116, 1104.5]],
  ],
  towers: [[-388, 1029], [-279, 1016], [-66, 999], [-116, 1112], [-376, 1127]],
  gate: { a: [-323.9, 1126.8], b: [-303.2, 1147.1] }, // vjezd s vrátnicí (OSM brána na rohu, vrátnice uvnitř)
  // další průjezdy: západní brána z OSM (cesta od Mayrau) a vjezd ve vnitřní zdi (ortofoto)
  openings: [[-303.2, 1147.1, 4.2], [-439.7, 1096.8, 3.6], [-266.3, 1120.6, 3.4], [-266.3, 1112.7, 3.4], [-387.5, 1067.5, 4.6]],
  chimney: [-175.1, 1098.8, 31], // kotelna (výška ze ZABAGED)
};

function buildPrison(city, G, world) {
  const g = new THREE.Group();
  world.prisonTowers = PRISON.towers;
  world.prisonPerimeter = { walls: PRISON.walls, innerWalls: PRISON.innerWalls, fences: PRISON.fences, innerFences: PRISON.innerFences };
  const wallTex = TX.prisonWallTexture();
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
  const capM = lmMat('#c9c5bc', { roughness: 0.9 });
  const meshT = TX.chainLinkTexture();
  const steel = lmMat('#9aa0a4', { metalness: 0.6, roughness: 0.45 });
  const darkSteel = lmMat('#4a4d50', { metalness: 0.5, roughness: 0.5 });
  const wireT = TX.razorWireTexture();
  const wireM = new THREE.MeshStandardMaterial({ map: wireT, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 });
  const concrete = lmMat('#cfcbc2', { roughness: 0.95 });
  const lampM = new THREE.MeshStandardMaterial({ color: '#f4f1e6', emissive: new THREE.Color('#fff4d6'), emissiveIntensity: 0, roughness: 0.3 });
  world.prisonLampMat = lampM;
  const geos = { wall: [], cap: [], steel: [], dark: [], wire: [], concrete: [], lamp: [] };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /** Kvádr mezi dvěma body (osa Y = spojnice). */
  const beamGeo = (a, b, tx, tz = tx) => {
    const d = b.clone().sub(a), L = d.length();
    const geo = new THREE.BoxGeometry(tx, L, tz);
    const m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1));
    return geo.applyMatrix4(m);
  };
  const boxAt = (list, w, h, d, x, y, z, rot = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot), V(1, 1, 1)));
    list.push(geo);
  };
  // úseky polylinie po kouscích (terén pod zdí se mění)
  const pieces = (pts, step, cb, gap = null) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / step));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        if (gap && gap((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        cb(x0, z0, x1, z1, Math.atan2(bx - ax, bz - az));
      }
    }
  };
  // hlavní vjezd = brána z OSM na rohu areálu (tudy vede příjezdová cesta)
  const gateMid = [PRISON.gate.b[0], PRISON.gate.b[1]];
  const inOpening = (x, z) => PRISON.openings.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r);

  // ---------- rozbitelné kusy zdí a plotů (tank, výbuchy): každý kus = id, jeho geometrie nesou userData.dz ----------
  const brk = (city.breakables ||= []);
  const tag = (list, id) => { list[list.length - 1].userData.dz = id; };
  const newPiece = (kind, x0, z0, x1, z1, H) => { const o = { id: brk.length, kind, x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, H, f: [], ranges: [], broken: false }; brk.push(o); return o; };
  // ---------- betonové zdi (5 m) se žiletkovým drátem ----------
  const wall = (pts, H) => {
    pieces(pts, 1.5, (x0, z0, x1, z1, rot) => {
      const pc = newPiece('wall', x0, z0, x1, z1, H), id = pc.id;
      const g0 = G(x0, z0), g1 = G(x1, z1), lo = Math.min(g0, g1) - 0.8, top = Math.max(g0, g1) + H;
      const L = Math.hypot(x1 - x0, z1 - z0) + 0.04;
      boxAt(geos.wall, 0.32, top - lo, L, (x0 + x1) / 2, (top + lo) / 2, (z0 + z1) / 2, rot); tag(geos.wall, id);
      boxAt(geos.cap, 0.5, 0.18, L, (x0 + x1) / 2, top + 0.09, (z0 + z1) / 2, rot); tag(geos.cap, id);
      // drát v rozích (konzole do Y a válec drátu)
      const wg = new THREE.CylinderGeometry(0.38, 0.38, L, 10, 1, true);
      wg.rotateX(Math.PI / 2);
      wg.applyMatrix4(new THREE.Matrix4().compose(V((x0 + x1) / 2, top + 0.55, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot), V(1, 1, 1)));
      geos.wire.push(wg); tag(geos.wire, id);
      geos.dark.push(beamGeo(V(x0, top, z0), V(x0, top + 0.95, z0), 0.06)); tag(geos.dark, id);
      pc.f.push(city.addFence(x0, z0, x1, z1, H + 0.9, 0.35));
    }, inOpening);
  };
  // ---------- ploty z pletiva se sloupky a drátem nahoře ----------
  const fenceMeshes = [];
  const fence = (pts, H, gap = null) => {
    const pos = [], uv = [], dzList = [];
    pieces(pts, 3, (x0, z0, x1, z1) => {
      const pc = newPiece('fence', x0, z0, x1, z1, H), id = pc.id;
      const g0 = G(x0, z0), g1 = G(x1, z1), L = Math.hypot(x1 - x0, z1 - z0);
      pos.push(x0, g0, z0, x1, g1, z1, x1, g1 + H, z1, x0, g0, z0, x1, g1 + H, z1, x0, g0 + H, z0);
      uv.push(0, 0, L / 1.2, 0, L / 1.2, H / 1.2, 0, 0, L / 1.2, H / 1.2, 0, H / 1.2);
      dzList.push(id);
      geos.steel.push(beamGeo(V(x0, g0 - 0.3, z0), V(x0, g0 + H + 0.45, z0), 0.09)); tag(geos.steel, id);
      // šikmá konzole a drát nahoře
      geos.wire.push((() => {
        const wg = new THREE.CylinderGeometry(0.3, 0.3, L, 8, 1, true);
        wg.rotateX(Math.PI / 2);
        wg.applyMatrix4(new THREE.Matrix4().compose(V((x0 + x1) / 2, (g0 + g1) / 2 + H + 0.35, (z0 + z1) / 2),
          new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(x1 - x0, z1 - z0)), V(1, 1, 1)));
        return wg;
      })()); tag(geos.wire, id);
      // kolize po kusech (kus jde rozbít)
      const n = Math.max(1, Math.round(L / 1.5));
      for (let k = 0; k < n; k++) {
        const ax = x0 + ((x1 - x0) * k) / n, az = z0 + ((z1 - z0) * k) / n, bx = x0 + ((x1 - x0) * (k + 1)) / n, bz = z0 + ((z1 - z0) * (k + 1)) / n;
        pc.f.push(city.addFence(ax, az, bx, bz, H + 0.6, 0.2));
      }
    }, gap);
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    geo.userData.dzList = dzList; // 6 vrcholů na kus
    fenceMeshes.push(geo);
  };


  for (const w of PRISON.walls) wall(w, 5);
  for (const w of PRISON.innerWalls) wall(w, 5);
  // obvodový plot včetně úseku s vjezdem (mezera pro bránu)
  fence([PRISON.gate.a, PRISON.gate.b], 3, inOpening);
  for (const f of PRISON.fences) fence(f, 3, inOpening);
  for (const f of PRISON.innerFences) fence(f, 4, inOpening);
  // sloupky bran v průjezdech
  for (const [ox, oz, r] of PRISON.openings) {
    for (const s2 of [-1, 1]) {
      // osa průjezdu kolmo k plotu ~ podle nejbližší cesty
      const rd = city.nearestRoad(ox, oz, 12, (q) => q.drive);
      let ux = 1, uz = 0;
      if (rd) { const q = rd.road.p; const L = Math.hypot(q[2] - q[0], q[3] - q[1]) || 1; ux = (q[2] - q[0]) / L; uz = (q[3] - q[1]) / L; }
      const px = ox - uz * r * s2, pz = oz + ux * r * s2;
      boxAt(geos.dark, 0.3, 4.2, 0.3, px, G(px, pz) + 2.1, pz);
    }
  }

  // ---------- jídelna (12): dva vchody se širokými bílými dveřmi (podle pamětníka) ----------
  const doorM = lmMat('#f4f4f1', { roughness: 0.45 });
  const doorFrame = lmMat('#9aa0a6', { metalness: 0.4, roughness: 0.5 });
  const glassD = new THREE.MeshStandardMaterial({ color: '#2a3540', roughness: 0.15, metalness: 0.4 });
  /** Dveře přímo na stěně budovy: najde nejbližší úsek obrysu k bodu (nx, nz) a natočí se podle něj. */
  const doorOnWall = (b, px, pz) => {
    const p = b.p, n = p.length / 2;
    let best = null;
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], bz = p[((i + 1) % n) * 2 + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0.1, Math.min(0.9, ((px - ax) * dx + (pz - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(px - qx, pz - qz);
      if (!best || d < best.d) best = { d, qx, qz, dx, dz };
    }
    const L = Math.hypot(best.dx, best.dz);
    let nx = best.dz / L, nz = -best.dx / L;
    if (pointInPoly(best.qx + nx * 0.5, best.qz + nz * 0.5, p)) { nx = -nx; nz = -nz; }
    whiteDoor(best.qx + nx * 0.06, best.qz + nz * 0.06, Math.atan2(nx, nz));
  };
  const whiteDoor = (x, z, face) => {
    const y = G(x, z);
    const d = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.75, 0.1), doorFrame); frame.position.y = 1.375;
    d.add(frame);
    for (const sx of [-0.66, 0.66]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.26, 2.5, 0.08), doorM); leaf.position.set(sx, 1.27, 0.05);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.02), glassD); win.position.set(sx, 1.75, 0.1);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), doorFrame); handle.position.set(sx * 0.2, 1.1, 0.12);
      d.add(leaf, win, handle);
    }
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 1.2), lmMat('#c9c5bc', { roughness: 0.9 })); step.position.set(0, 0.07, 0.6);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.4), lmMat('#d8d5ce')); canopy.position.set(0, 2.95, 0.65);
    d.add(step, canopy);
    d.position.set(x, y, z);
    d.rotation.y = face;
    d.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(d);
  };
  const mess = city.buildings.find((b) => b.pb?.n === 12);
  if (mess) {
    doorOnWall(mess, -312.5, 1088); // vchod 1 – zepředu (severní stěna) na konci cesty mezi B a C
    doorOnWall(mess, -326, 1099); // vchod 2 – z boku (západní stěna)
  }

  // ---------- garážová vrata (vlnička 26): dvě velká sekční vrata v pravé části stěny do dvora ----------
  for (const b of city.buildings) {
    if (!b.pb?.garage) continue;
    const p = b.p, n = p.length / 2, tx = -245, tz = 1145; // směr do dvora
    let best = null, bs = -1e9;
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], bz = p[((i + 1) % n) * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 8) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (pointInPoly(mx + nx * 0.5, mz + nz * 0.5, p)) { nx = -nx; nz = -nz; }
      const dl = Math.hypot(tx - mx, tz - mz) || 1, sc = ((tx - mx) * nx + (tz - mz) * nz) / dl + L / 100;
      if (sc > bs) { bs = sc; best = { mx, mz, nx, nz, L }; }
    }
    if (!best) continue;
    // vpravo z pohledu člověka, který stojí před stěnou
    const rx = best.nz, rz = -best.nx;
    const slatC = document.createElement('canvas'); slatC.width = 64; slatC.height = 64;
    const sg = slatC.getContext('2d');
    sg.fillStyle = '#c4c7ca'; sg.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) { sg.fillStyle = 'rgba(0,0,0,.22)'; sg.fillRect(0, y, 64, 1.5); sg.fillStyle = 'rgba(255,255,255,.35)'; sg.fillRect(0, y + 1.5, 64, 1); }
    const slat = new THREE.CanvasTexture(slatC); slat.wrapS = slat.wrapT = THREE.RepeatWrapping; slat.repeat.set(2, 3); slat.colorSpace = THREE.SRGBColorSpace;
    const doorMat = new THREE.MeshStandardMaterial({ map: slat, metalness: 0.4, roughness: 0.5 });
    for (let k = 0; k < b.pb.garage; k++) {
      const off = best.L * (0.16 + k * 0.2);
      const x = best.mx + rx * off + best.nx * 0.06, z = best.mz + rz * off + best.nz * 0.06, y = G(x, z);
      const gd = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 4.8, 0.14), darkSteel); frame.position.y = 2.4;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.4, 0.1), doorMat); leaf.position.set(0, 2.2, 0.06);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: '#ff9a1a', emissive: new THREE.Color('#ff7a00'), emissiveIntensity: 0.6 })); lamp.position.set(2.6, 5.0, 0.1);
      gd.add(frame, leaf, lamp);
      gd.position.set(x, y, z);
      gd.rotation.y = Math.atan2(best.nx, best.nz);
      gd.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      g.add(gd);
    }
  }

  // ---------- vycházkové dvory a hřiště (obkreslené z ortofota), každé oplocené ----------
  buildYards(g, city, G, fence, geos, boxAt, beamGeo, V, darkSteel, steel);
  // ---------- vycházkové kotce u budovy K (bez střechy, nahoře pletivo) a zadní část s psincem ----------
  buildPenK(g, city, G, geos, boxAt, V, meshT);
  buildBackYard(g, city, G, fence, geos, boxAt, beamGeo, V, steel, darkSteel, meshT);

  // ---------- strážní věže ----------
  for (const [x, z] of PRISON.towers) {
    const y = G(x, z);
    boxAt(geos.concrete, 2.2, 7.2, 2.2, x, y + 3.4, z);
    // kabina: parapet, prosklený pás, střecha s přesahem
    boxAt(geos.concrete, 3.8, 1.1, 3.8, x, y + 7.55, z);
    for (const [dx, dz] of [[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]]) boxAt(geos.dark, 0.16, 1.5, 0.16, x + dx, y + 8.85, z + dz);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.45, 3.6), new THREE.MeshStandardMaterial({ color: '#33424e', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 }));
    glass.position.set(x, y + 8.85, z);
    g.add(glass);
    boxAt(geos.concrete, 4.6, 0.3, 4.6, x, y + 9.75, z);
    // reflektor na střeše a žebřík
    const sl = new THREE.CylinderGeometry(0.28, 0.36, 0.5, 12);
    sl.rotateZ(Math.PI / 2);
    sl.translate(x, y + 10.25, z);
    geos.dark.push(sl);
    boxAt(geos.lamp, 0.05, 0.4, 0.4, x + 0.27, y + 10.25, z);
    for (let k = 0; k < 14; k++) boxAt(geos.dark, 0.5, 0.04, 0.04, x, y + 0.5 + k * 0.5, z + 1.2);
    city.obstacles.push({ x, z, r: 1.7, h: 10 });
  }

  // ---------- osvětlovací stožáry podél vnitřní zdi ----------
  for (const w of PRISON.innerWalls.concat([PRISON.walls[0]])) {
    let acc = 0;
    pieces(w, 1, (x0, z0, x1, z1, rot) => {
      acc += Math.hypot(x1 - x0, z1 - z0);
      if (acc < 38) return;
      acc = 0;
      // stožár kousek uvnitř (od zdi k těžišti areálu)
      const cx = -250, cz = 1080;
      const l = Math.hypot(cx - x0, cz - z0) || 1, ix = x0 + ((cx - x0) / l) * 2.5, iz = z0 + ((cz - z0) / l) * 2.5;
      const y = G(ix, iz);
      geos.steel.push(beamGeo(V(ix, y, iz), V(ix, y + 10, iz), 0.18));
      boxAt(geos.dark, 1.6, 0.12, 0.12, ix, y + 10, iz, rot);
      for (const s of [-0.65, 0.65]) {
        const ox = Math.cos(rot) * s, oz = -Math.sin(rot) * s;
        boxAt(geos.dark, 0.45, 0.32, 0.3, ix + ox, y + 9.8, iz + oz, rot);
        boxAt(geos.lamp, 0.4, 0.04, 0.26, ix + ox, y + 9.63, iz + oz, rot);
      }
      city.obstacles.push({ x: ix, z: iz, r: 0.3, h: 10 });
      (world.prisonMasts ||= []).push([ix, iz, rot]);
    });
  }

  // ---------- vjezdy: hlavní vstup na západě (vrátnice 19/20), jih = zásobování (24/25) ----------
  const signBoard = (px, pz, face, lines) => {
    const board = new THREE.Group();
    let y = 2.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.25 + lines.length * 0.62, 0.06), darkSteel);
    back.position.set(0, y - (lines.length - 1) * 0.31, -0.04);
    board.add(back);
    for (const [txt, bgc, fgc] of lines) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.56), new THREE.MeshStandardMaterial({ map: TX.labelTexture(txt, bgc, fgc, 640, 100) }));
      t.position.y = y;
      board.add(t);
      y -= 0.62;
    }
    for (const sx of [-1.6, 1.6]) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.1), darkSteel); pst.position.set(sx, 1.5, -0.08); board.add(pst); }
    board.position.set(px, G(px, pz), pz);
    board.rotation.y = face;
    g.add(board);
    city.obstacles.push({ x: px, z: pz, r: 0.6, h: 3 });
  };
  const entrance = (at, ux, uz, lines, boom, gateW = 7.4) => {
    // u = směr jízdy dovnitř; n = podél plotu
    const nx = -uz, nz = ux;
    // velká posuvná vězeňská brána (šedé plné ocelové křídlo jako na fotce), jezdí po kolejnici podél plotu
    const wGate = gateW;
    const rot = Math.atan2(nx, nz);
    const y0 = G(at[0], at[1]);
    const leaf = new THREE.Group();
    const steelGrey = lmMat('#c3c7cb', { metalness: 0.45, roughness: 0.5 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, wGate + 0.5), steelGrey);
    panel.position.y = 2.0;
    const frameT = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, wGate + 0.6), darkSteel);
    frameT.position.y = 3.85;
    const frameB = frameT.clone(); frameB.position.y = 0.2;
    leaf.add(panel, frameT, frameB);
    for (let k = -2; k <= 2; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.08), darkSteel); rib.position.set(0, 2.0, (k * (wGate + 0.4)) / 4.4); leaf.add(rib); }
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, wGate + 0.5, 10, 1, true), wireM);
    wire.rotation.x = Math.PI / 2; wire.position.y = 4.3;
    leaf.add(wire);
    // značka zákaz vjezdu na obou stranách
    const zc = document.createElement('canvas'); zc.width = zc.height = 64;
    const zg = zc.getContext('2d');
    zg.fillStyle = '#fff'; zg.beginPath(); zg.arc(32, 32, 31, 0, 7); zg.fill();
    zg.strokeStyle = '#d0201a'; zg.lineWidth = 9; zg.beginPath(); zg.arc(32, 32, 26, 0, 7); zg.stroke();
    const zM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(zc), transparent: true });
    for (const sd of [-1, 1]) { const z1 = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), zM); z1.position.set(sd * 0.08, 1.8, 0); z1.rotation.y = sd * Math.PI / 2; leaf.add(z1); }
    leaf.rotation.y = rot;
    leaf.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(leaf);
    // kolejnice
    // odjíždí na tu stranu, kde nestojí budova
    let sd = 1;
    for (const t of [1, -1]) {
      let free = true;
      for (let k = 0.3; k <= 1.6; k += 0.1) if (city.buildingAt(at[0] + nx * t * wGate * k, at[1] + nz * t * wGate * k)) free = false;
      if (free) { sd = t; break; }
    }
    const closed = [at[0], y0, at[1]], opened = [at[0] + nx * sd * (wGate + 0.4), y0, at[1] + nz * sd * (wGate + 0.4)];
    leaf.position.set(...closed);
    boxAt(geos.dark, 0.14, 0.06, wGate * 2.2, at[0] + nx * sd * wGate * 0.55, y0 + 0.03, at[1] + nz * sd * wGate * 0.55, rot);
    const fence = city.addFence(at[0] - nx * wGate / 2, at[1] - nz * wGate / 2, at[0] + nx * wGate / 2, at[1] + nz * wGate / 2, 4.6, 0.3);
    (world.prisonGates ||= []).push({ leaf, closed, opened, fence, x: at[0], z: at[1], open: 0 });
    if (boom) {
      const bx0 = at[0] - ux * 6 - nx * 3.6, bz0 = at[1] - uz * 6 - nz * 3.6, by = G(bx0, bz0);
      boxAt(geos.dark, 0.5, 1.1, 0.4, bx0, by + 0.55, bz0, Math.atan2(nx, nz));
      const bc = document.createElement('canvas'); bc.width = 128; bc.height = 8;
      const bg2 = bc.getContext('2d');
      for (let i = 0; i < 8; i++) { bg2.fillStyle = i % 2 ? '#d22' : '#fff'; bg2.fillRect(i * 16, 0, 16, 8); }
      const boomM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 6.8), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(bc) }));
      boomM.position.set(bx0 + nx * 3.5, by + 1.0, bz0 + nz * 3.5);
      boomM.rotation.y = Math.atan2(nx, nz);
      g.add(boomM);
    }
    signBoard(at[0] - ux * 9 + nx * 6.5, at[1] - uz * 9 + nz * 6.5, Math.atan2(-ux, -uz), lines);
  };
  const W = [-439.7, 1096.8], wu = [0.87, -0.48]; // u = kolmo na plot (dovnitř)
  entrance(W, wu[0], wu[1], [['VĚZNICE VINAŘICE', '#1f3f8a', '#ffffff'], ['Vězeňská služba České republiky', '#ffffff', '#1f3f8a'], ['ZÁKAZ VSTUPU · střežený prostor', '#ffffff', '#b3261e']], true, 7.4);
  entrance(gateMid, 0.70, -0.71, [['ZÁSOBOVÁNÍ', '#1f3f8a', '#ffffff'], ['Vjezd jen se svolením', '#ffffff', '#b3261e']], true, 8.6);
  // místo před hlavním vstupem (zvenku) – sem míří teleport, navigace a propuštění
  world.prisonGate = city.freeSpotNear(W[0] - wu[0] * 16, W[1] - wu[1] * 16, 0, 5);

  // ---------- cedule na budovách (u stěny směrem k nejbližší cestě) ----------
  for (const b of city.buildings) {
    const e = b.pb;
    if (!e?.sign) continue;
    const rd = city.nearestRoad(b.cx, b.cz, 80, (q) => q.drive || q.walk);
    const tx = rd ? rd.x : -260, tz = rd ? rd.z : 1080;
    const p = b.p, n = p.length / 2;
    let best = null, bs = -1e9;
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], bz = p[((i + 1) % n) * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 3) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (pointInPoly(mx + nx * 0.5, mz + nz * 0.5, p)) { nx = -nx; nz = -nz; }
      const dl = Math.hypot(tx - mx, tz - mz) || 1;
      const sc = ((tx - mx) * nx + (tz - mz) * nz) / dl + Math.min(L, 20) / 40;
      if (sc > bs) { bs = sc; best = { mx, mz, nx, nz }; }
    }
    if (!best) continue;
    const w = Math.min(3.4, 0.9 + e.sign.length * 0.11);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.5), new THREE.MeshStandardMaterial({ map: TX.labelTexture(e.sign, '#1f3f8a', '#ffffff', 640, 92), roughness: 0.6 }));
    plate.position.set(best.mx + best.nx * 0.07, b.g + 2.9, best.mz + best.nz * 0.07);
    plate.rotation.y = Math.atan2(best.nx, best.nz);
    g.add(plate);
  }

  // ---------- komín kotelny: štíhlý ocelový komín v příhradové konstrukci (podle ortofota) ----------
  {
    const [x, z, Hc] = PRISON.chimney;
    const y = G(x, z);
    const tube = new THREE.CylinderGeometry(0.55, 0.65, Hc, 16);
    tube.translate(x, y + Hc / 2, z);
    geos.steel.push(tube);
    const ring = new THREE.CylinderGeometry(0.75, 0.75, 0.6, 16);
    ring.translate(x, y + Hc - 0.3, z);
    geos.dark.push(ring);
    // příhradová věž 2,6 × 2,6 m do 2/3 výšky
    const w = 1.3, Ht = Hc * 0.68, lv = 8;
    const cs = [[-w, -w], [w, -w], [w, w], [-w, w]];
    for (const [cx, cz] of cs) geos.dark.push(beamGeo(V(x + cx, y, z + cz), V(x + cx * 0.75, y + Ht, z + cz * 0.75), 0.16));
    for (let k = 0; k <= lv; k++) {
      const yy = y + (Ht * k) / lv, sc = 1 - 0.25 * (k / lv), yy2 = y + (Ht * (k + 1)) / lv, sc2 = 1 - 0.25 * ((k + 1) / lv);
      for (let i = 0; i < 4; i++) {
        const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
        geos.dark.push(beamGeo(V(x + ax * sc, yy, z + az * sc), V(x + bx * sc, yy, z + bz * sc), 0.08));
        if (k < lv) geos.dark.push(beamGeo(V(x + ax * sc, yy, z + az * sc), V(x + bx * sc2, yy2, z + bz * sc2), 0.06));
      }
    }
    city.obstacles.push({ x, z, r: 1.6, h: Hc });
  }

  // sloučení do pár meshů
  const add = (list, mat) => {
    if (!list.length) return;
    const tags = list.map((q) => q.userData.dz);
    const flat = list.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; });
    const m = new THREE.Mesh(mergeGeometries(flat), mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    // rozsahy vrcholů rozbitelných kusů v sloučené geometrii
    let off = 0;
    flat.forEach((q, i) => { const n = q.attributes.position.count; if (tags[i] != null) brk[tags[i]].ranges.push({ mesh: m, start: off, count: n }); off += n; });
  };
  add(geos.wall, wallM); add(geos.cap, capM); add(geos.steel, steel); add(geos.dark, darkSteel); add(geos.concrete, concrete); add(geos.lamp, lampM);
  add(geos.wire, wireM);
  if (fenceMeshes.length) {
    const fm = new THREE.Mesh(mergeGeometries(fenceMeshes), new THREE.MeshStandardMaterial({ map: meshT, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }));
    fm.castShadow = true;
    g.add(fm);
    let off = 0;
    for (const q of fenceMeshes) { for (const id of q.userData.dzList || []) { brk[id].ranges.push({ mesh: fm, start: off, count: 6 }); off += 6; } if (!q.userData.dzList) off += q.attributes.position.count; }
  }
  return g;
}

/** Budova K (16): v nástavbě obvodová ocelová klec (vycházky/tělocvična) – podle fotografie. */
function cageTop(b) {
  const o = obb(b.p);
  if (!o) return null;
  const g = new THREE.Group();
  const eave = b.roofM && !b.roofM.skel ? b.roofM.eave : b.h;
  const y0 = eave - 3.4, y1 = eave - 0.2, off = 0.9;
  const barC = document.createElement('canvas'); barC.width = 64; barC.height = 64;
  const bg = barC.getContext('2d');
  bg.clearRect(0, 0, 64, 64);
  bg.fillStyle = '#2f3336';
  for (let x = 0; x < 64; x += 8) bg.fillRect(x, 0, 2.5, 64);
  bg.fillRect(0, 30, 64, 3);
  const tex = new THREE.CanvasTexture(barC);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
  const slab = lmMat('#d9d6ce', { roughness: 0.9 });
  const sides = [[o.ux, o.uz, o.hl, o.vx, o.vz, o.hw], [-o.ux, -o.uz, o.hl, o.vx, o.vz, o.hw], [o.vx, o.vz, o.hw, o.ux, o.uz, o.hl], [-o.vx, -o.vz, o.hw, o.ux, o.uz, o.hl]];
  for (const [dx, dz, d, tx, tz, half] of sides) {
    const L = (half + off) * 2;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(L, y1 - y0), mat);
    tex.repeat.set(L / 1.6, (y1 - y0) / 1.6);
    plane.position.set(o.cx + dx * (d + off), (y0 + y1) / 2, o.cz + dz * (d + off));
    plane.rotation.y = Math.atan2(dx, dz);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.25, off + 0.1), slab);
    ledge.position.set(o.cx + dx * (d + off / 2), y0, o.cz + dz * (d + off / 2));
    ledge.rotation.y = Math.atan2(dx, dz);
    g.add(plane, ledge);
  }
  return g;
}

/*
 * Vycházkové dvory věznice: obdélníky [x0, z0, x1, z1] (souřadnice světa) podle ortofota.
 * A, C = oválná dráha s trávníkem, B = zahrádka, D1 = hřiště na míčové hry, D2 = posilovací dvůr s přístřešky.
 * gate = strana s brankou do dvora (k nejbližší cestě).
 */
const YARDS = [
  { id: 'A', r: [-374, 1077, -333.5, 1097], type: 'track', gate: 'n', align: 23, huts: [[-361, 1088]] },
  { id: 'B', r: [-325.8, 1070, -315, 1082.5], type: 'garden', gate: 'w', align: 12, open: true }, // jen záhony, bez plotu (pamětník)
  { id: 'C', r: [-310, 1067.5, -274.5, 1086], type: 'track', gate: 'n', align: 12, huts: [[-307, 1076.5], [-299, 1078.5]] },
  { id: 'D1', r: [-266, 1060, -234.5, 1077.5], type: 'court', gate: 'n', align: 13 },
  { id: 'D2', r: [-233.5, 1060, -191, 1077.5], type: 'gym', gate: 'n', align: 13, huts: [[-225, 1065], [-202, 1064]] },
];
const PX = 20; // pixelů na metr v texturách dvorů

/** Povrch dvora: dvory jsou betonové (pamětník); zahrádka B má záhony. */
function yardTexture(Y, W, H) {
  const c = document.createElement('canvas');
  c.width = Math.min(2048, Math.round(W * PX)); c.height = Math.min(2048, Math.round(H * PX));
  const g = c.getContext('2d'), sx = c.width / W, sy = c.height / H;
  const M = (x) => x * sx, N = (z) => z * sy;
  const grain = (col, n, a, sz = 2) => { for (let i = 0; i < n; i++) { g.fillStyle = col.replace('A', (Math.random() * a).toFixed(3)); g.fillRect(Math.random() * c.width, Math.random() * c.height, sz, sz); } };
  if (Y.type === 'garden') {
    g.fillStyle = '#6f9450'; g.fillRect(0, 0, c.width, c.height); grain('rgba(20,50,10,A)', 6000, 0.25);
    g.fillStyle = '#cfc8b8'; g.fillRect(M(W / 2 - 0.6), 0, M(1.2), c.height);
    for (let i = 0; i < 4; i++) {
      for (const sd of [0, 1]) {
        const x = sd ? W / 2 + 1.2 : 1, w = W / 2 - 2.2;
        g.fillStyle = '#6b4a30'; g.fillRect(M(x), N(1.5 + i * 2.6), M(w), N(1.5));
        for (let k = 0; k < 14; k++) { g.fillStyle = ['#e04848', '#f2c53d', '#f08ac0', '#ffffff', '#9a6ad8'][k % 5]; g.beginPath(); g.arc(M(x + Math.random() * w), N(1.7 + i * 2.6 + Math.random() * 1.1), M(0.12), 0, 7); g.fill(); }
      }
    }
  } else {
    // beton: šedé desky, dilatační spáry po ~3 m, skvrny a zašlé okraje
    g.fillStyle = '#a9a7a1'; g.fillRect(0, 0, c.width, c.height);
    grain('rgba(70,68,64,A)', 16000, 0.18); grain('rgba(255,255,255,A)', 6000, 0.12);
    for (let i = 0; i < 26; i++) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const x = Math.random() * c.width, y = Math.random() * c.height, r = M(0.8 + Math.random() * 2.5);
      g.save(); g.translate(x, y); g.scale(r, r * (0.6 + Math.random() * 0.6));
      gr.addColorStop(0, `rgba(60,58,52,${0.08 + Math.random() * 0.1})`); gr.addColorStop(1, 'rgba(60,58,52,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    }
    g.strokeStyle = 'rgba(55,53,50,.55)'; g.lineWidth = Math.max(1.5, M(0.035));
    const step = 3;
    for (let x = step; x < W; x += step) { g.beginPath(); g.moveTo(M(x), 0); g.lineTo(M(x), c.height); g.stroke(); }
    for (let z = step; z < H; z += step) { g.beginPath(); g.moveTo(0, N(z)); g.lineTo(c.width, N(z)); g.stroke(); }
    g.strokeStyle = 'rgba(40,38,35,.35)'; g.lineWidth = M(0.4);
    g.strokeRect(M(0.2), N(0.2), M(W - 0.4), N(H - 0.4));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildYards(root, city, G, fence, geos, boxAt, beamGeo, V, darkSteel, steel) {
  const white = lmMat('#e9e8e4', { roughness: 0.5 });
  const wood = lmMat('#8a5a36', { roughness: 0.8 });
  const hutRoof = lmMat('#7d8287', { metalness: 0.3, roughness: 0.6 });
  for (const Y of YARDS) {
    const [x0, z0, x1, z1] = Y.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, AW = x1 - x0, AH = z1 - z0;
    // natočení podle sousední budovy (dlouhá osa jejího obrysu), v rozmezí ±45°
    let th = 0;
    const ab = city.buildings.find((q) => q.pb?.n === Y.align);
    const o = ab && obb(ab.p);
    if (o) { th = Math.atan2(o.uz, o.ux); while (th > Math.PI / 4) th -= Math.PI / 2; while (th < -Math.PI / 4) th += Math.PI / 2; }
    // natočený obdélník se vejde do obkresleného obrysu z ortofota (nezasahuje do cest)
    const cs = Math.cos(th), sn = Math.abs(Math.sin(th)), d2 = cs * cs - sn * sn;
    const W = (AW * cs - AH * sn) / d2, H = (AH * cs - AW * sn) / d2;
    const ux = Math.cos(th), uz = Math.sin(th), vx = -uz, vz = ux;
    const L = (lx, lz) => [cx + ux * lx + vx * lz, cz + uz * lx + vz * lz]; // místní → svět
    (city.yardFrames ||= []).push({ id: Y.id, type: Y.type, cx, cz, ux, uz, vx, vz, W, H, L, huts: Y.huts || [] });
    const rot = -th; // natočení objektů kolem svislé osy
    const y = G(cx, cz);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: yardTexture(Y, W, H), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    plane.rotation.set(-Math.PI / 2, rot, 0, 'YXZ');
    plane.position.set(cx, y + 0.06, cz);
    plane.receiveShadow = true;
    root.add(plane);
    // plot 3,2 m s brankou (mezera uprostřed strany gate)
    const hw = W / 2, hh = H / 2;
    const corners = [L(-hw, -hh), L(hw, -hh), L(hw, hh), L(-hw, hh)];
    const gl = { n: [0, -hh], s: [0, hh], w: [-hw, 0], e: [hw, 0] }[Y.gate];
    const gp = L(gl[0], gl[1]);
    if (!Y.open) {
      fence([...corners, corners[0]], 3.2, (x, z) => Math.hypot(x - gp[0], z - gp[1]) < 1.7);
      const along = Y.gate === 'n' || Y.gate === 's';
      for (const sd of [-0.9, 0.9]) { const q = L(gl[0] + (along ? sd : 0), gl[1] + (along ? 0 : sd)); boxAt(geos.dark, 0.12, 3.2, 0.12, q[0], y + 1.6, q[1]); }
      boxAt(geos.dark, along ? 1.9 : 0.12, 0.12, along ? 0.12 : 1.9, gp[0], y + 3.2, gp[1], rot);
    }
    // vybavení (v místních souřadnicích dvora)
    if (Y.type === 'court') {
      for (const sd of [-1, 1]) {
        const [gx, gz] = L(sd * (hw - 1.5), 0);
        const goal = new THREE.Group();
        for (const pz of [-1.5, 1.5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), white); post.position.set(0, 1, pz); goal.add(post); }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 8), white); bar.rotation.x = Math.PI / 2; bar.position.y = 2; goal.add(bar);
        const net = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
        net.position.set(sd * 0.6, 1, 0); net.rotation.y = Math.PI / 2; goal.add(net);
        goal.position.set(gx, y, gz);
        goal.rotation.y = rot;
        root.add(goal);
        addProp(city, gx, gz, 1.6, goal);
      }
    }
    if (Y.type === 'gym') {
      for (const [lx, lz] of [[-hw + 4, -3.5], [-hw + 8, -3.5], [hw - 6, 3.5]]) {
        const [bx, bz] = L(lx, lz), [ax, az] = L(lx - 0.85, lz), [cx2, cz2] = L(lx + 0.85, lz);
        const ob = { x: bx, z: bz, r: 0.9, h: 2.4 };
        const pid = propPiece(city, bx, bz, 1.0, ob);
        for (const [px, pz] of [L(lx - 0.8, lz), L(lx + 0.8, lz)]) { geos.steel.push(beamGeo(V(px, y, pz), V(px, y + 2.4, pz), 0.08)); geos.steel[geos.steel.length - 1].userData.dz = pid; }
        geos.steel.push(beamGeo(V(ax, y + 2.35, az), V(cx2, y + 2.35, cz2), 0.05)); geos.steel[geos.steel.length - 1].userData.dz = pid;
        city.obstacles.push(ob);
      }
      for (const [lx, lz] of [[-4, 3.5], [4, -3.5]]) {
        const [qx, qz] = L(lx, lz), pid = propPiece(city, qx, qz, 1.2);
        const tg = () => { geos.steel[geos.steel.length - 1].userData.dz = pid; };
        for (const sd of [-0.25, 0.25]) for (const e of [-1, 1]) { const [px, pz] = L(lx + e, lz + sd); geos.steel.push(beamGeo(V(px, y, pz), V(px, y + 1.3, pz), 0.06)); tg(); }
        for (const sd of [-0.25, 0.25]) { const [ax, az] = L(lx - 1.1, lz + sd), [bx2, bz2] = L(lx + 1.1, lz + sd); geos.steel.push(beamGeo(V(ax, y + 1.3, az), V(bx2, y + 1.3, bz2), 0.05)); tg(); }
      }
    }
    if (Y.type !== 'court') {
      for (let k = 0; k < 3; k++) {
        const [bx, bz] = L(-hw + (W * (k + 1)) / 4, hh - 1.2);
        const bench = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.45), wood); seat.position.y = 0.45;
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.06), wood); back.position.set(0, 0.75, 0.22);
        const legs = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.08), darkSteel); legs.position.y = 0.21;
        bench.add(seat, back, legs);
        bench.position.set(bx, y, bz); bench.rotation.y = rot;
        root.add(bench);
        addProp(city, bx, bz, 1.0, bench);
      }
    }
    // telefonní automat uprostřed strany u cesty (vedle branky), čelem do dvora
    if (!Y.open) {
      const sgn = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[Y.gate];
      const along = Y.gate === 'n' || Y.gate === 's';
      const lx = along ? 3.4 : gl[0] + sgn[0] * 0.55, lz = along ? gl[1] + sgn[1] * 0.55 : 3.4;
      const [px, pz] = L(lx, lz);
      const face = Math.atan2(ux * sgn[0] + vx * sgn[1], uz * sgn[0] + vz * sgn[1]); // směr do dvora (svět)
      const booth = phoneBooth(px, y, pz, face);
      root.add(booth);
      const [sx, sz] = L(lx + sgn[0] * 0.75, lz + sgn[1] * 0.75);
      (city.phones ||= []).push({ x: sx, z: sz, h: face + Math.PI, yard: Y.id });
      const ob = { x: px, z: pz, r: 0.35, h: 2.3 }; city.obstacles.push(ob);
      addProp(city, px, pz, 0.8, booth, ob);
    }
    // přístřešky (poloha z ortofota), natočené s dvorem
    for (const [hx, hz] of Y.huts || []) {
      const hut = new THREE.Group();
      for (const [dx, dz] of [[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), steel); p.position.set(dx, 1.25, dz); hut.add(p); }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.6), hutRoof); roof.position.y = 2.55; roof.castShadow = true;
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.45), wood); bench.position.set(0, 0.45, 0.6);
      hut.add(roof, bench);
      hut.position.set(hx, y, hz); hut.rotation.y = rot;
      root.add(hut);
      const ob = { x: hx, z: hz, r: 0.3, h: 2.5 }; city.obstacles.push(ob);
      addProp(city, hx, hz, 1.8, hut, ob);
    }
  }
}

/** Rozbitelné drobnosti (lavičky, přístřešky, automaty, branky, boudy…): tank je přejede, výbuch rozmetá. */
function addProp(city, x, z, r, obj, obst = null) { (city.props ||= []).push({ x, z, r, obj, obst, broken: false }); }
/** Rozbitelný kus sloučené geometrie (hrazdy apod.): geometrie v seznamu geos dostanou userData.dz. */
function propPiece(city, x, z, r, obst = null) {
  const brk = (city.breakables ||= []);
  const pc = { id: brk.length, kind: 'prop', x0: x - r, z0: z, x1: x + r, z1: z, cx: x, cz: z, H: 2.4, f: [], ranges: [], broken: false, obst };
  brk.push(pc);
  return pc.id;
}

/** Telefonní automat pro odsouzené: sloupek, zadní deska, akustická stříška, přístroj se sluchátkem. face = kam míří přední strana. */
function phoneBooth(x, y, z, face) {
  const g = new THREE.Group();
  const blue = lmMat('#1f4f8f', { roughness: 0.5, metalness: 0.2 }), grey = lmMat('#3b3f44', { metalness: 0.5, roughness: 0.45 }), black = lmMat('#141414', { roughness: 0.6 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.12), grey); post.position.set(0, 1.15, -0.1);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.06), blue); back.position.set(0, 1.55, -0.02);
  // akustická stříška (půlválec) nad přístrojem
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.95, 16, 1, true, -Math.PI / 2, Math.PI), blue);
  hood.material = blue.clone(); hood.material.side = THREE.DoubleSide;
  hood.rotation.z = Math.PI / 2; hood.position.set(0, 2.2, 0.2); hood.scale.set(1, 1, 0.9);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.16), grey); box.position.set(0, 1.45, 0.08);
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.02), lmMat('#c9ccd0', { metalness: 0.6 })); keys.position.set(0.02, 1.38, 0.17);
  const handset = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 4, 8), black); handset.position.set(-0.13, 1.5, 0.19);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), black); cord.position.set(-0.13, 1.3, 0.18);
  // cedulka TELEFON
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const cg = c.getContext('2d'); cg.fillStyle = '#f2f2ee'; cg.fillRect(0, 0, 256, 64); cg.fillStyle = '#1f4f8f'; cg.font = 'bold 40px sans-serif'; cg.textAlign = 'center'; cg.fillText('TELEFON', 128, 47);
  const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.6 })); sign.position.set(0, 2.05, 0.015);
  g.add(post, back, hood, box, keys, handset, cord, sign);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.position.set(x, y, z); g.rotation.y = face;
  return g;
}

/** Střed trojúhelníku a body kotců K v místních souřadnicích: s = napříč (0 západ … 1 východ), t = do hloubky (0 u budovy … 1 jih). */
function penPoint(s, t) {
  const { tl, tr, bl, br } = K_PEN;
  const ax = tl[0] + (tr[0] - tl[0]) * s, az = tl[1] + (tr[1] - tl[1]) * s;
  const bx = bl[0] + (br[0] - bl[0]) * s, bz = bl[1] + (br[1] - bl[1]) * s;
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

/**
 * Vycházkové kotce u jižního konce budovy K (podle ortofota): obvodová zeď ~4 m, uvnitř zdi do Y
 * (od budovy ke středu a odtud do obou jižních rohů) → tři kotce. Nahoře místo střechy pletivo.
 * Chodí tam odsouzení z „díry“ (kázeňský trest).
 */
function buildPenK(root, city, G, geos, boxAt, V, meshT) {
  const H = 4.2, y = G(...penPoint(0.5, 0.5));
  const C = penPoint(0.43, 0.3), TOP = penPoint(0.43, 0), BL = penPoint(0, 1), BR = penPoint(1, 1), TL = penPoint(0, 0), TR = penPoint(1, 0);
  const wallM = lmMat('#e6e3db', { roughness: 0.92 });
  const seg = (a, b, th = 0.3, h = H) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    boxAt(geos.concrete, th, h + 0.6, L + th, (a[0] + b[0]) / 2, y + (h - 0.6) / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1]));
    city.addFence(a[0], a[1], b[0], b[1], h + 3, th / 2 + 0.1);
  };
  seg(TL, BL, 0.35); seg(BL, BR, 0.35); seg(BR, TR, 0.35); // obvod (sever = stěna budovy K)
  seg(TOP, C); seg(C, BL); seg(C, BR); // vnitřní zdi do Y
  void wallM;
  // pletivo místo stropu (ve výšce zdí), nosníky
  const meshMat = new THREE.MeshStandardMaterial({ map: meshT.clone(), alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 });
  meshMat.map.needsUpdate = true;
  const W = Math.hypot(TR[0] - TL[0], TR[1] - TL[1]), D = Math.hypot(BL[0] - TL[0], BL[1] - TL[1]);
  meshMat.map.repeat.set(W / 1.0, D / 1.0);
  const ux = (TR[0] - TL[0]) / W, uz = (TR[1] - TL[1]) / W;
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), meshMat);
  const [cx, cz] = penPoint(0.5, 0.5);
  roof.rotation.set(-Math.PI / 2, -Math.atan2(uz, ux), 0, 'YXZ');
  roof.position.set(cx, y + H + 0.02, cz);
  root.add(roof);
  for (let k = 1; k < 6; k++) { const a = penPoint(k / 6, 0), b = penPoint(k / 6, 1); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); boxAt(geos.dark, 0.1, 0.16, L, (a[0] + b[0]) / 2, y + H - 0.06, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1])); }
  // dveře z budovy do každého kotce
  for (const s of [0.2, 0.43, 0.75]) { const [dx, dz] = penPoint(s === 0.43 ? 0.58 : s, 0.02); boxAt(geos.dark, 1.1, 2.2, 0.12, dx, y + 1.1, dz, Math.atan2(ux, uz)); }
  // tři kotce (trojúhelníky / čtyřúhelníky) pro chůzi odsouzených
  city.kPens = [
    [TL, TOP, C, BL], // západní
    [C, BR, BL], // jižní
    [TOP, TR, BR, C], // východní
  ];
}

/**
 * Zadní (jižní) trojúhelník věznice podle ortofota: policejní psinec (hospodářské budovy a kotce se psy),
 * dva velké stromy, sklad palet, trávník uprostřed dvora, buňka. Ostatní (hala, zdi) se nemění.
 */
export const BACKYARD = {
  tri: [[-302, 1125.5], [-124, 1114], [-208, 1209]], // obrys dvora (pro povrch)
  lawns: [
    [[-240, 1121], [-205, 1118.6], [-204, 1141], [-238, 1143]], // trávník pod stromy
    [[-236.7, 1156.5], [-213.6, 1154.4], [-214.3, 1168]], // trávník uprostřed dvora
    [[-134.8, 1123.1], [-124, 1114], [-129, 1130.6], [-208.2, 1210.9], [-208.8, 1198.6]], // pás mezi plotem a vnější zdí
  ],
  sheds: [ // hospodářské budovy psince [x0, z0, x1, z1, výška]
    [-184, 1120, -177.3, 1127.2, 3.0], [-173.1, 1119, -160.9, 1125.4, 3.3], [-176.9, 1125.4, -161.7, 1133.1, 3.6],
    [-161.3, 1124.5, -154.9, 1130.9, 3.0], [-155.4, 1117, -137.9, 1125.6, 4.0], [-183.7, 1129.9, -177.2, 1132.2, 2.6],
  ],
  kennel: { x0: -178.5, x1: -152, z0: 1134.2, z1: 1140.6, n: 6 }, // výběhy pro psy
  trees: [[-214, 1121, 6.5], [-210, 1132, 5.5], [-233, 1137, 4.2]],
};
function buildBackYard(root, city, G, fence, geos, boxAt, beamGeo, V, steel, darkSteel, meshT) {
  const B = BACKYARD;
  const wallM = lmMat('#d9d5cb', { roughness: 0.9 }), roofM = lmMat('#8b9299', { metalness: 0.35, roughness: 0.55 });
  for (const [x0, z0, x1, z1, h] of B.sheds) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = G(cx, cz);
    const body = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), wallM); body.position.set(cx, y + h / 2, cz);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.22, z1 - z0 + 0.4), roofM); roof.position.set(cx, y + h + 0.1, cz);
    body.castShadow = body.receiveShadow = roof.castShadow = true;
    root.add(body, roof);
    // dveře a okna
    boxAt(geos.dark, 1.0, 2.1, 0.1, cx - (x1 - x0) * 0.25, y + 1.05, z1 + 0.02);
    for (let k = 0; k < Math.floor((x1 - x0) / 4); k++) boxAt(geos.dark, 1.1, 0.8, 0.08, x0 + 2.2 + k * 4, y + h * 0.62, z0 - 0.02);
    city.addFence(x0, z0, x1, z0, h + 0.4, 0.2); city.addFence(x1, z0, x1, z1, h + 0.4, 0.2);
    city.addFence(x1, z1, x0, z1, h + 0.4, 0.2); city.addFence(x0, z1, x0, z0, h + 0.4, 0.2);
  }
  // cedule psince
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const cg = c.getContext('2d'); cg.fillStyle = '#f4f2ea'; cg.fillRect(0, 0, 512, 96); cg.fillStyle = '#1b2f55'; cg.font = 'bold 44px sans-serif'; cg.textAlign = 'center'; cg.fillText('PSINEC · SLUŽEBNÍ PSI', 256, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshStandardMaterial({ map: t }));
    s.position.set(-169.3, G(-169.3, 1133.1) + 2.9, 1133.15); root.add(s);
  }
  // výběhy (kotce) pro psy: betonová podlaha, pletivo, plechová stříška vzadu, bouda
  const K = B.kennel, ky = G((K.x0 + K.x1) / 2, (K.z0 + K.z1) / 2), w = (K.x1 - K.x0) / K.n;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(K.x1 - K.x0 + 0.6, 0.12, K.z1 - K.z0 + 0.6), lmMat('#b9b6ae', { roughness: 0.95 }));
  pad.position.set((K.x0 + K.x1) / 2, ky + 0.06, (K.z0 + K.z1) / 2); pad.receiveShadow = true; root.add(pad);
  const pts = [[K.x0, K.z0], [K.x0, K.z1], [K.x1, K.z1], [K.x1, K.z0]];
  fence(pts, 2.2);
  for (let k = 1; k < K.n; k++) fence([[K.x0 + k * w, K.z0], [K.x0 + k * w, K.z1]], 2.2);
  const shelter = new THREE.Mesh(new THREE.BoxGeometry(K.x1 - K.x0, 0.1, 2.2), roofM); shelter.position.set((K.x0 + K.x1) / 2, ky + 2.35, K.z0 + 1.1); root.add(shelter);
  const houseM = lmMat('#7a5534', { roughness: 0.85 });
  city.dogRuns = [];
  for (let k = 0; k < K.n; k++) {
    const cx = K.x0 + (k + 0.5) * w;
    const house = new THREE.Group();
    const hb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.0), houseM); hb.position.y = 0.4;
    const hr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.2), roofM); hr.position.y = 0.86; hr.rotation.x = 0.12;
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.45), lmMat('#151515')); hole.position.set(0, 0.32, 0.505);
    house.add(hb, hr, hole); house.position.set(cx - w * 0.22, ky + 0.12, K.z0 + 0.9); root.add(house);
    addProp(city, cx - w * 0.22, K.z0 + 0.9, 0.8, house);
    // miska
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.08, 12), lmMat('#9aa0a6', { metalness: 0.7 })); bowl.position.set(cx + w * 0.3, ky + 0.16, K.z1 - 0.6); root.add(bowl); addProp(city, cx + w * 0.3, K.z1 - 0.6, 0.4, bowl);
    city.dogRuns.push({ x0: K.x0 + k * w + 0.5, x1: K.x0 + (k + 1) * w - 0.5, z0: K.z0 + 1.9, z1: K.z1 - 0.5, y: ky + 0.12 });
  }
  // stromy
  const trunkM = lmMat('#5a4330', { roughness: 0.9 }), leafM = lmMat('#3f6b34', { roughness: 0.85 }), leafM2 = lmMat('#4f7c3c', { roughness: 0.85 });
  for (const [x, z, r] of B.trees) {
    const y = G(x, z), tr = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, r * 0.9, 8), trunkM); trunk.position.y = r * 0.45;
    tr.add(trunk);
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (0.55 + Math.random() * 0.2), 1), k % 2 ? leafM : leafM2);
      c.position.set((Math.random() - 0.5) * r * 0.6, r * (1.05 + Math.random() * 0.35), (Math.random() - 0.5) * r * 0.6);
      c.castShadow = true; tr.add(c);
    }
    trunk.castShadow = true; tr.position.set(x, y, z); root.add(tr);
    const ob = { x, z, r: 0.45, h: r }; city.obstacles.push(ob);
    addProp(city, x, z, 1.2, tr, ob); city.props[city.props.length - 1].tree = true;
  }
  // sklad palet, sudy, kontejner, buňka
  const palletM = lmMat('#a07a4c', { roughness: 0.9 });
  for (const [x, z, n] of [[-212, 1128, 4], [-208.5, 1128.5, 6], [-205, 1129, 3], [-201.5, 1128.2, 5], [-197.5, 1129.5, 2], [-209, 1132.5, 3]]) {
    for (let k = 0; k < n; k++) boxAt(geos.concrete, 1.2, 0.14, 0.8, x, G(x, z) + 0.07 + k * 0.15, z);
  }
  void palletM;
  const barrelM = lmMat('#2a5bb8', { roughness: 0.5 });
  for (const [x, z] of [[-196, 1126.5], [-195.2, 1127.4], [-196.8, 1127.6], [-194.6, 1126.4]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), barrelM); b.position.set(x, G(x, z) + 0.45, z); b.castShadow = true; root.add(b); addProp(city, x, z, 0.5, b); }
  const cont = (x, z, w2, d, h, col, rot = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h, d), lmMat(col, { roughness: 0.7, metalness: 0.3 })); m.position.set(x, G(x, z) + h / 2, z); m.rotation.y = rot; m.castShadow = true; root.add(m); const ob = { x, z, r: Math.max(w2, d) / 2, h }; city.obstacles.push(ob); addProp(city, x, z, Math.max(w2, d) / 2 + 0.5, m, ob); };
  cont(-227.5, 1139.5, 2.4, 6.0, 2.5, '#7b4a2c'); // buňka u stromů
  cont(-228, 1158, 1.6, 1.2, 1.3, '#d9b02a'); cont(-225.5, 1158.4, 1.4, 1.1, 1.2, '#2c62b0'); cont(-221.5, 1158.8, 1.0, 1.4, 1.6, '#8a9096');
}

/** Cihlový komín (Mayrau 48 m). */
function brickChimney(x, y, z, H) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 2.4, H, 24), lmMat('#8e4a35', { roughness: 0.92 }));
  m.position.y = H / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4, 5.6), lmMat('#8a4834', { roughness: 0.92 }));
  base.position.y = 2;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.25, 1.4, 24), lmMat('#3a3330', { roughness: 0.8 }));
  crown.position.y = H - 0.7;
  for (let k = 1; k < 5; k++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.4 - (1.25 * k * 0.2) + 0.05, 2.4 - (1.25 * k * 0.2) + 0.05, 0.35, 24), lmMat('#3d3633', { metalness: 0.4 }));
    band.position.y = H * k * 0.2;
    g.add(band);
  }
  g.add(m, base, crown);
  g.position.set(x, y, z);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function statueOn(x, z, y, tall = 3) {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.BoxGeometry(1.8, tall, 1.8), lmMat('#8f8a83', { roughness: 0.9 }));
  ped.position.y = tall / 2;
  const bronze = lmMat('#3f5a4c', { metalness: 0.6, roughness: 0.45 });
  const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.5, 4, 10), bronze);
  fig.position.y = tall + 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bronze);
  head.position.y = tall + 2.3;
  g.add(ped, fig, head);
  g.position.set(x, y, z);
  return g;
}

/** Kašna: kamenná nádrž s vodou a středovým sloupkem. */
function fountain(x, z, y) {
  const g = new THREE.Group();
  const stone = lmMat('#cfc6b6', { roughness: 0.9 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.7, 24, 1, true), stone);
  rim.position.y = 0.35;
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.9, 24), lmMat('#5a8ea6', { roughness: 0.1, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.5;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.4, 10), stone);
  post.position.y = 1.2;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.4, 0.4, 16), stone);
  bowl.position.y = 2.4;
  g.add(rim, water, post, bowl);
  g.position.set(x, y, z);
  return g;
}

/** Hodinová věž na nároží (Hučák): cihlový dřík, krémové patro s hodinami, břidlicová helmice. */
function clockTower(b) {
  const g = new THREE.Group();
  // nároží nejblíž lávce přes jez
  let best = 0, bd = 1e9;
  for (let i = 0; i < b.p.length; i += 2) { const d = Math.hypot(b.p[i] + 485, b.p[i + 1] - 234); if (d < bd) { bd = d; best = i; } }
  const cx = b.p[best] + (b.cx - b.p[best]) * 0.12, cz = b.p[best + 1] + (b.cz - b.p[best + 1]) * 0.12;
  const w = 5, hgt = b.rh + 12;
  const brick = lmMat('#b45a3e', { roughness: 0.9 });
  const plaster = lmMat('#ece2cc', { roughness: 0.85 });
  const slate = lmMat('#3f4448', { roughness: 0.55, metalness: 0.2 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, hgt - 4, w), brick);
  shaft.position.y = (hgt - 4) / 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 4, w + 0.4), plaster);
  top.position.y = hgt - 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 5.5, 4), slate);
  roof.position.y = hgt + 2.75; roof.rotation.y = Math.PI / 4;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), slate);
  lantern.position.y = hgt + 5.8;
  g.add(shaft, top, roof, lantern);
  const cm = new THREE.MeshStandardMaterial({ map: clockTexture(), transparent: true, roughness: 0.5 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const c = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), cm);
    c.position.set(Math.sin(a) * (w / 2 + 0.25), hgt - 2, Math.cos(a) * (w / 2 + 0.25));
    c.rotation.y = a;
    g.add(c);
  }
  g.position.set(cx, b.g - 0.3, cz);
  return g;
}

/** Betonový kostel (Božské srdce Páně): střední věž s křížem a dva boční pylony na průčelí. */
function concreteChurch(b) {
  const o = obb(b.p);
  if (!o) return null;
  const g = new THREE.Group();
  const conc = lmMat('#aeada7', { roughness: 0.95 });
  const dark = lmMat('#3a3f45', { roughness: 0.6 });
  // průčelí = kratší strana obrácená k Dukelské třídě (na sever, tj. −z)
  const s = o.uz > 0 ? -1 : 1;
  const fx = o.cx + o.ux * s * o.hl, fz = o.cz + o.uz * s * o.hl;
  const add = (w, d, h, x, z, mat = conc) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, b.g - 0.3 + h / 2, z);
    m.rotation.y = Math.atan2(o.ux, o.uz);
    g.add(m);
    return m;
  };
  const tw = 6, th = 38;
  add(tw, tw, th, fx - o.ux * s * (tw / 2 - 1), fz - o.uz * s * (tw / 2 - 1));
  // úzké okno ve věži a kříž
  add(1.2, tw + 0.2, th * 0.55, fx - o.ux * s * (tw / 2 - 1), fz - o.uz * s * (tw / 2 - 1), dark).position.y = b.g + th * 0.45;
  const cross1 = add(0.5, 0.5, 5, fx - o.ux * s * (tw / 2 - 1), fz - o.uz * s * (tw / 2 - 1));
  cross1.position.y = b.g + th + 2.5;
  const cross2 = add(2.6, 0.5, 0.5, fx - o.ux * s * (tw / 2 - 1), fz - o.uz * s * (tw / 2 - 1));
  cross2.position.y = b.g + th + 3.5;
  for (const sd of [-1, 1]) {
    const px = fx - o.ux * s * 2 + o.vx * sd * (o.hw - 2), pz = fz - o.uz * s * 2 + o.vz * sd * (o.hw - 2);
    add(4, 4, b.rh + 5, px, pz);
  }
  return g;
}

/** Stará radnice: dvě věže s hodinami a tmavými báněmi na průčelí do náměstí. */
function townHall(b) {
  const o = obb(b.p);
  if (!o) return null;
  const g = new THREE.Group();
  const white = lmMat('#efeeea', { roughness: 0.85 });
  const dark = lmMat('#33393c', { metalness: 0.3, roughness: 0.5 });
  // průčelí = delší strana obrácená k morovému sloupu
  const toC = [40 - o.cx, -6 - o.cz];
  const side = toC[0] * o.vx + toC[1] * o.vz > 0 ? 1 : -1;
  const fx = o.cx + o.vx * side * (o.hw - 1.8), fz = o.cz + o.vz * side * (o.hw - 1.8);
  const w = 3.6, top = b.rh + 9;
  const cm = new THREE.MeshStandardMaterial({ map: clockTexture(), transparent: true, roughness: 0.5 });
  for (const e of [-1, 1]) {
    const t = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, top, w), white);
    shaft.position.y = top / 2;
    const cor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.4, w + 0.5), white);
    cor.position.y = top;
    const prof = [[1, 0], [0.95, 0.4], [0.55, 1.4], [0.62, 2.2], [0.45, 2.9], [0.2, 3.3], [0.22, 4.4], [0.1, 4.9], [0.03, 6.2], [0, 6.6]]
      .map(([r, y]) => new THREE.Vector2(r * w * 0.62, y));
    const helm = new THREE.Mesh(new THREE.LatheGeometry(prof, 12), dark);
    helm.position.y = top + 0.2;
    t.add(shaft, cor, helm);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const c = new THREE.Mesh(new THREE.CircleGeometry(w * 0.32, 24), cm);
      c.position.set(Math.sin(a) * (w / 2 + 0.05), top - 2.2, Math.cos(a) * (w / 2 + 0.05));
      c.rotation.y = a;
      t.add(c);
    }
    const along = e * (o.hl - w / 2 - 0.6);
    t.position.set(fx + o.ux * along, b.g - 0.3, fz + o.uz * along);
    t.rotation.y = Math.atan2(o.ux, o.uz);
    g.add(t);
  }
  return g;
}

/* ===================== PLOCHY (zeleň, voda) ===================== */
function polyMesh(list, colorOf, y, uvScale, G = null) {
  const buf = new Buf();
  for (const o of list) {
    const { pts, tris } = triangulate(o.p);
    const col = colorOf(o);
    for (const t of tris) {
      const q = t.map((k) => [pts[k].x, y, -pts[k].y]);
      buf.tri(q[0], q[2], q[1], col, (v) => [v[0] / uvScale, v[2] / uvScale]);
    }
  }
  // normály nahoru bez ohledu na orientaci
  for (let i = 0; i < buf.nor.length; i += 3) { buf.nor[i] = 0; buf.nor[i + 1] = 1; buf.nor[i + 2] = 0; }
  buf.faceUp();
  return (G ? buf.drape(G) : buf).geometry();
}

/* ===================== PÁSY (silnice, řeky) ===================== */
function ribbon(buf, p, w, y, col, vScale, uv = true) {
  const n = p.length / 2;
  if (n < 2) return;
  const Y = typeof y === 'number' ? () => y : (i) => y[i];
  const hw = w / 2;
  const L = [], R = [];
  let dist = 0;
  const ds = [0];
  for (let i = 0; i < n; i++) {
    const px = p[i * 2], pz = p[i * 2 + 1];
    let tx, tz;
    if (i === 0) { tx = p[2] - px; tz = p[3] - pz; }
    else if (i === n - 1) { tx = px - p[i * 2 - 2]; tz = pz - p[i * 2 - 1]; }
    else {
      const ax = px - p[i * 2 - 2], az = pz - p[i * 2 - 1];
      const bx = p[i * 2 + 2] - px, bz = p[i * 2 + 3] - pz;
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      tx = ax / la + bx / lb; tz = az / la + bz / lb;
    }
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    let nx = -tz, nz = tx;
    let scale = 1;
    if (i > 0 && i < n - 1) {
      const ax = px - p[i * 2 - 2], az = pz - p[i * 2 - 1];
      const la = Math.hypot(ax, az) || 1;
      const dot = (-az / la) * nx + (ax / la) * nz;
      scale = Math.min(2.2, 1 / Math.max(0.35, Math.abs(dot)));
    }
    L.push([px + nx * hw * scale, pz + nz * hw * scale]);
    R.push([px - nx * hw * scale, pz - nz * hw * scale]);
    if (i > 0) { dist += Math.hypot(px - p[i * 2 - 2], pz - p[i * 2 - 1]); ds.push(dist); }
  }
  for (let i = 0; i < n - 1; i++) {
    const v0 = ds[i] / vScale, v1 = ds[i + 1] / vScale;
    const a = L[i], b = R[i], c = R[i + 1], d = L[i + 1];
    const y0 = Y(i), y1 = Y(i + 1);
    buf.v(a[0], y0, a[1], 0, 1, 0, 0, v0, col); buf.v(b[0], y0, b[1], 0, 1, 0, 1, v0, col); buf.v(c[0], y1, c[1], 0, 1, 0, 1, v1, col);
    buf.v(a[0], y0, a[1], 0, 1, 0, 0, v0, col); buf.v(c[0], y1, c[1], 0, 1, 0, 1, v1, col); buf.v(d[0], y1, d[1], 0, 1, 0, 0, v1, col);
  }
  // kulatý konec pro hezčí křižovatky
  for (const i of [0, n - 1]) {
    const cx = p[i * 2], cz = p[i * 2 + 1];
    const y = Y(i);
    const seg = 8;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      buf.v(cx, y, cz, 0, 1, 0, 0.5, 0, col);
      buf.v(cx + Math.cos(a1) * hw, y, cz + Math.sin(a1) * hw, 0, 1, 0, 0, 0, col);
      buf.v(cx + Math.cos(a0) * hw, y, cz + Math.sin(a0) * hw, 0, 1, 0, 0, 0, col);
    }
  }
  // kontrola orientace trojúhelníků (normála nahoru) – neřešíme, materiál je DoubleSide
  void uv;
  return { L, R };
}

/** Kamenné zábradlí podél okraje mostu (vnější hrana pásu). */
function bridgeRailing(buf, edge, deck, col, h = 1.05, t = 0.35) {
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i], b = edge[i + 1], ya = deck[i], yb = deck[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * t / 2, nz = dx / l * t / 2;
    for (const s of [1, -1]) {
      const ax = a[0] + nx * s, az = a[1] + nz * s, bx = b[0] + nx * s, bz = b[1] + nz * s;
      buf.v(ax, ya, az, nx * s, 0, nz * s, 0, 0, col); buf.v(bx, yb, bz, nx * s, 0, nz * s, 0, 0, col); buf.v(bx, yb + h, bz, nx * s, 0, nz * s, 0, 0, col);
      buf.v(ax, ya, az, nx * s, 0, nz * s, 0, 0, col); buf.v(bx, yb + h, bz, nx * s, 0, nz * s, 0, 0, col); buf.v(ax, ya + h, az, nx * s, 0, nz * s, 0, 0, col);
    }
    const tc = col.clone().multiplyScalar(1.08);
    buf.v(a[0] + nx, ya + h, a[1] + nz, 0, 1, 0, 0, 0, tc); buf.v(b[0] + nx, yb + h, b[1] + nz, 0, 1, 0, 0, 0, tc); buf.v(b[0] - nx, yb + h, b[1] - nz, 0, 1, 0, 0, 0, tc);
    buf.v(a[0] + nx, ya + h, a[1] + nz, 0, 1, 0, 0, 0, tc); buf.v(b[0] - nx, yb + h, b[1] - nz, 0, 1, 0, 0, 0, tc); buf.v(a[0] - nx, ya + h, a[1] - nz, 0, 1, 0, 0, 0, tc);
  }
}

/** Body podél lomené čáry po krocích (pro lampy a pilíře). */
function alongEdge(edge, deck, step, start) {
  const out = [];
  let acc = start;
  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[i], b = edge[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc <= l) {
      const t = acc / l;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: deck[i] + (deck[i + 1] - deck[i]) * t, dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l });
      acc += step;
    }
    acc -= l;
  }
  return out;
}

/** Boční stěny a spodek mostovky. */
function bridgeSides(buf, edges, deck, col, depth = 1.1) {
  const { L, R } = edges;
  for (const side of [L, R]) {
    for (let i = 0; i < side.length - 1; i++) {
      const a = side[i], b = side[i + 1], ya = deck[i], yb = deck[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = (side === L ? -1 : 1) * -dz / l, nz = (side === L ? -1 : 1) * dx / l;
      buf.v(a[0], ya + 0.1, a[1], nx, 0, nz, 0, 0, col); buf.v(b[0], yb + 0.1, b[1], nx, 0, nz, 1, 0, col); buf.v(b[0], yb - depth, b[1], nx, 0, nz, 1, 1, col);
      buf.v(a[0], ya + 0.1, a[1], nx, 0, nz, 0, 0, col); buf.v(b[0], yb - depth, b[1], nx, 0, nz, 1, 1, col); buf.v(a[0], ya - depth, a[1], nx, 0, nz, 0, 1, col);
    }
  }
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = R[i], c = R[i + 1], d = L[i + 1], y0 = deck[i] - depth, y1 = deck[i + 1] - depth;
    buf.v(a[0], y0, a[1], 0, -1, 0, 0, 0, col); buf.v(c[0], y1, c[1], 0, -1, 0, 1, 1, col); buf.v(b[0], y0, b[1], 0, -1, 0, 1, 0, col);
    buf.v(a[0], y0, a[1], 0, -1, 0, 0, 0, col); buf.v(d[0], y1, d[1], 0, -1, 0, 0, 1, col); buf.v(c[0], y1, c[1], 0, -1, 0, 1, 1, col);
  }
}

/* ===================== STROMY ===================== */
/** Stromy podle leteckého snímku: tmavě zelené pixely = koruny stromů. */
function treesFromOrtho(city, sample, max) {
  const spots = [];
  const H = city.half, step = 8;
  for (let z = -H + 3; z < H - 3; z += step) {
    for (let x = -H + 3; x < H - 3; x += step) {
      const px = x + (hash01(x * 7.3 + z * 1.1) - 0.5) * step * 0.8;
      const pz = z + (hash01(x * 2.9 - z * 5.7) - 0.5) * step * 0.8;
      const [r, g, b] = sample(px, pz);
      const lum = r * 0.3 + g * 0.59 + b * 0.11;
      if (!(g > r * 1.04 && g > b * 1.08 && lum < 118 && lum > 22)) continue;
      if (city.buildingAt(px, pz) || city.isWater(px, pz)) continue;
      const rd = city.nearestRoad(px, pz, 12);
      if (rd && rd.d < rd.road.w / 2 + 1.2) continue;
      // tmavší = vzrostlejší strom
      spots.push([px, pz, 0.95 + Math.min(0.85, (118 - lum) / 80)]);
    }
  }
  if (spots.length <= max) return spots;
  // vnitřní město celé, okraje (pole, lesy za městem) proředit
  const inner = spots.filter((q) => Math.hypot(q[0], q[1]) < 1300);
  const outer = spots.filter((q) => Math.hypot(q[0], q[1]) >= 1300);
  const room = Math.max(0, max - inner.length);
  const k = outer.length / Math.max(1, room);
  return [...inner.slice(0, max), ...Array.from({ length: Math.min(room, outer.length) }, (_, i) => outer[Math.floor(i * k)])];
}

function buildTrees(city, mobile, sample = null) {
  const spots = sample ? treesFromOrtho(city, sample, mobile ? 8000 : 24000) : [];
  if (!sample) {
  const max = mobile ? 2500 : 6500;
  const kinds = new Set(['park', 'forest', 'wood', 'garden', 'cemetery', 'recreation_ground', 'grass']);
  for (const g of city.green) {
    if (!kinds.has(g.t)) continue;
    const area = ringArea(g.p);
    const dens = g.t === 'forest' || g.t === 'wood' ? 1 / 70 : g.t === 'grass' ? 1 / 900 : 1 / 220;
    const cnt = Math.min(400, Math.floor(area * dens));
    for (let i = 0; i < cnt * 2 && spots.length < max; i++) {
      const x = g.minx + Math.random() * (g.maxx - g.minx);
      const z = g.minz + Math.random() * (g.maxz - g.minz);
      if (!pointInPoly(x, z, g.p)) continue;
      if (city.buildingAt(x, z)) continue;
      const r = city.nearestRoad(x, z, 14);
      if (r && r.d < r.road.w / 2 + 1.5) continue;
      if (city.isWater(x, z)) continue;
      spots.push([x, z, 0.75 + Math.random() * 0.7]);
    }
  }
  // stromořadí podél ulic v rezidenčních čtvrtích
  for (const r of city.roads) {
    if (spots.length >= max) break;
    if (!(r.t === 'residential' || r.t === 'tertiary') || r.b) continue;
    const p = r.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 6; s < len - 3; s += 14) {
        if (Math.random() < 0.55) continue;
        const side = Math.random() < 0.5 ? 1 : -1;
        const off = r.w / 2 + 3;
        const x = ax + ((bx - ax) * s) / len + nx * off * side, z = az + ((bz - az) * s) / len + nz * off * side;
        if (city.buildingAt(x, z)) continue;
        const c = city.collide(x, z, 1.5);
        if (c.hit) continue;
        const rr = city.nearestRoad(x, z, 10);
        if (rr && rr.d < rr.road.w / 2 + 1) continue;
        spots.push([x, z, 0.7 + Math.random() * 0.4]);
      }
    }
  }
  }
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3, 6);
  trunkG.translate(0, 1.5, 0);
  const crownG = new THREE.IcosahedronGeometry(2.6, 1);
  crownG.translate(0, 5, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#5b4635', roughness: 1 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const tones = ['#4f7a35', '#5e8a3c', '#476e31', '#6a9441', '#58813a', '#3f6a2f'];
  spots.forEach(([x, z, s], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    m.compose(new THREE.Vector3(x, city.ground(x, z) - 0.2, z), q, new THREE.Vector3(s, s * (0.9 + Math.random() * 0.4), s));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.set(tones[i % tones.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06));
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  const g = new THREE.Group();
  g.add(trunks, crowns);
  g.userData.spots = spots;
  return g;
}

/* ===================== POULIČNÍ LAMPY ===================== */
function buildLamps(city) {
  const spots = [];
  for (const r of city.roads) {
    if (!['primary', 'secondary', 'tertiary', 'residential'].includes(r.t) || spots.length > 2500) continue;
    const p = r.p;
    let acc = Math.random() * 30;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      while (acc < len) {
        const off = r.w / 2 + 1.2;
        const x = ax + ((bx - ax) * acc) / len + nx * off, z = az + ((bz - az) * acc) / len + nz * off;
        if (!city.buildingAt(x, z)) spots.push([x, z, Math.atan2(-nx, -nz)]);
        acc += 34;
      }
      acc -= len;
    }
  }
  const poleG = new THREE.CylinderGeometry(0.08, 0.12, 7, 5);
  poleG.translate(0, 3.5, 0);
  const headG = new THREE.BoxGeometry(0.35, 0.18, 1.2);
  headG.translate(0, 7, 0.5);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: '#3d4247', roughness: 0.6, metalness: 0.4 }), spots.length);
  const headMat = new THREE.MeshStandardMaterial({ color: '#d7d7d0', emissive: '#ffcf87', emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(headG, headMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, z, a], i) => {
    q.setFromAxisAngle(up, a);
    m.compose(new THREE.Vector3(x, city.ground(x, z) - 0.1, z), q, one);
    poles.setMatrixAt(i, m); heads.setMatrixAt(i, m);
  });
  const g = new THREE.Group();
  g.add(poles, heads);
  g.userData.headMat = headMat;
  return g;
}

/* ===================== HLAVNÍ STAVBA SVĚTA ===================== */
export async function buildWorld(city, scene, progress, mobile, ortho = null) {
  const tex = TX.facadeTextures();
  const world = { mats: {} };

  progress(0.05, 'Pokládám zemi');
  await nextFrame();
  const G = (x, z) => city.ground(x, z);
  /** Rovina zvlněná podle terénu (souřadnice světa). */
  const terrainPlane = (cx, cz, size, segs, dy = 0, hole = 0) => {
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, 0, cz);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      const inner = hole && Math.abs(x) < hole - 1 && Math.abs(z) < hole - 1;
      pa.setY(i, inner ? G(x, z) - 30 : G(x, z) + dy);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const gt = TX.groundTexture();
  gt.repeat.set(160, 160);
  // okolí mimo herní území (o kus níž, aby neprosvítalo)
  const ground = new THREE.Mesh(terrainPlane(0, 0, 9000, 90, -1.2, city.half),
    new THREE.MeshStandardMaterial({ map: gt, color: '#a7a596', roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const H = city.half;
  const seg = mobile ? 320 : 640; // 5 m / 2,5 m (terén z DMR 5G po 2 m)
  // letecký snímek ČÚZK jako povrch města (4 díly), jinak travnatý podklad
  const tiles = ortho || [0, 1, 2, 3].map(() => null);
  tiles.forEach((t, k) => {
    const i = k % 2, j = Math.floor(k / 2);
    const mat = t ? new THREE.MeshStandardMaterial({ map: t, roughness: 1 }) : new THREE.MeshStandardMaterial({ map: gt, color: '#a7a596', roughness: 1 });
    layer(mat, -1);
    const m = new THREE.Mesh(terrainPlane(-H + i * H + H / 2, -H + j * H + H / 2, H, seg), mat);
    m.receiveShadow = true;
    scene.add(m);
  });

  progress(0.12, 'Sázím parky a sady');
  await nextFrame();
  const gm = new THREE.MeshStandardMaterial({ map: TX.grassTexture(), vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const greenOrder = [...city.green].sort((a, b) => ringArea(b.p) - ringArea(a.p));
  const green = ortho ? null : new THREE.Mesh(polyMesh(greenOrder, (g) => C(GREEN_COL[g.t] || '#86a85c'), 0.06, 6, G), gm);
  if (green) { green.receiveShadow = true; scene.add(green); }

  // náměstí (dlažba) a parkoviště (asfalt)
  const sq = city.plazas.filter((p) => p.t === 'square');
  const pk = city.plazas.filter((p) => p.t === 'parking');
  const cobT = TX.pavingTexture();
  const sqMesh = new THREE.Mesh(polyMesh(sq, () => C('#c4bdb1'), 0.12, 2.2, G), layer(new THREE.MeshStandardMaterial({ map: cobT, vertexColors: true, roughness: 1 }), 1));
  sqMesh.receiveShadow = true;
  scene.add(sqMesh);
  if (!ortho) {
    const pkMesh = new THREE.Mesh(polyMesh(pk, () => C('#d8d8d8'), 0.098, 10, G), new THREE.MeshStandardMaterial({ map: TX.asphaltTexture(false), vertexColors: true, roughness: 0.95 }));
    pkMesh.receiveShadow = true;
    scene.add(pkMesh);
  }

  progress(0.2, 'Napouštím potoky a rybníky');
  await nextFrame();
  const wt = TX.waterTexture();
  wt.repeat.set(1, 1);
  const wm = layer(new THREE.MeshStandardMaterial({ color: '#5a8ea6', map: wt, roughness: 0.12, metalness: 0.35, side: THREE.DoubleSide }), 1);
  const wbuf = new Buf();
  const wcol = C('#ffffff');
  for (const r of city.rivers) ribbon(wbuf, r.p, r.w, 0.12, wcol, 30);
  const riverGeo = wbuf.faceUp().drape(G, 10).geometry();
  const lakeGeo = polyMesh(city.water, () => wcol, 0.13, 30, G);
  const water = new THREE.Group();
  water.add(new THREE.Mesh(riverGeo, wm), new THREE.Mesh(lakeGeo, wm));
  water.children.forEach((m) => (m.receiveShadow = true));
  scene.add(water);
  world.waterTex = wt;

  progress(0.3, 'Asfaltuji ulice');
  await nextFrame();
  const walkB = new Buf(), sideB = new Buf(), plainB = new Buf(), markB = new Buf(), railB = new Buf();
  // mosty: vlastní (nepokládané) buffery s výškou mostovky
  const bWalk = new Buf(), bSide = new Buf(), bPlain = new Buf(), bMark = new Buf(), bRail = new Buf(), bBody = new Buf();
  const white = C('#ffffff'), concrete = C('#b9b4aa'), stoneC = C('#d6cdbd'), steelC = C('#5d6b78');
  const steelM = new THREE.MeshStandardMaterial({ color: '#5d6b78', metalness: 0.5, roughness: 0.5 });
  const bridgeLamps = [], piers = [];
  const lift = (deck, d) => deck.map((y) => y + d);
  const order = { footway: 0, path: 0, cycleway: 0, steps: 0, track: 0, pedestrian: 0, service: 1, living_street: 1, residential: 2, unclassified: 2, tertiary_link: 3, tertiary: 3, secondary_link: 4, secondary: 4, primary_link: 5, primary: 5, busway: 2 };
  for (const r of city.roads) {
    const o = order[r.t] ?? 1;
    const br = r.b && r.deck;
    if (r.walk && r.t !== 'living_street') {
      const col = r.t === 'cycleway' ? C('#c9a69a') : r.t === 'path' || r.t === 'track' ? C('#cdbd9c') : white;
      if (br) {
        const e = ribbon(bWalk, r.p, r.w, lift(r.deck, 0.07), col, 4);
        const stoneRail = r.n === 'Hučák';
        bridgeSides(bBody, e, r.deck, stoneRail ? stoneC : steelC, stoneRail ? 0.9 : 0.5);
        bridgeRailing(bBody, e.L, r.deck, stoneRail ? C('#e8e4da') : steelC, stoneRail ? 1.0 : 1.1, stoneRail ? 0.3 : 0.08);
        bridgeRailing(bBody, e.R, r.deck, stoneRail ? C('#e8e4da') : steelC, stoneRail ? 1.0 : 1.1, stoneRail ? 0.3 : 0.08);
        // ocelové pilíře do V (lávky přes Orlici a u Jiráskových sadů)
        if (!stoneRail) {
          const ctr = [];
          for (let k = 0; k < r.p.length / 2; k++) ctr.push([r.p[k * 2], r.p[k * 2 + 1]]);
          for (const q of alongEdge(ctr, r.deck, 16, 8)) {
            const gy = G(q.x, q.z), hgt = q.y - gy;
            if (hgt < 1.5) continue;
            for (const sd of [-1, 1]) {
              const geo = new THREE.BoxGeometry(0.35, Math.hypot(hgt, 3.2), 0.35);
              const m = new THREE.Mesh(geo, steelM);
              m.position.set(q.x + q.dx * sd * 1.6, gy + hgt / 2, q.z + q.dz * sd * 1.6);
              m.rotation.order = 'YXZ';
              m.rotation.y = Math.atan2(q.dx, q.dz);
              m.rotation.x = -sd * Math.atan2(3.2, hgt);
              scene.add(m);
            }
          }
        }
      }
      else ribbon(walkB, r.p, r.w, 0.2, col, 4);
      continue;
    }
    if (!r.drive && r.t !== 'track') continue;
    const marked = r.w >= 9 && o >= 3;
    if (br) {
      const e = ribbon(bSide, r.p, r.w + 3.4, lift(r.deck, 0.03), white, 4);
      bridgeSides(bBody, e, r.deck, concrete, 1.3);
      // zábradlí, lampy a pilíře
      bridgeRailing(bBody, e.L, r.deck, stoneC);
      bridgeRailing(bBody, e.R, r.deck, stoneC);
      const len = r.deck.length > 1 ? alongEdge(e.L, r.deck, 1e9, 0) && e.L.reduce((s2, q, i) => i ? s2 + Math.hypot(q[0] - e.L[i - 1][0], q[1] - e.L[i - 1][1]) : 0, 0) : 0;
      for (const side of [e.L, e.R]) for (const q of alongEdge(side, r.deck, 18, 9)) bridgeLamps.push(q);
      if (len > 35) {
        const mid = r.p.length / 2;
        const ctr = [];
        for (let k = 0; k < mid; k++) ctr.push([r.p[k * 2], r.p[k * 2 + 1]]);
        const n = Math.max(1, Math.round(len / 32) - 1);
        for (const q of alongEdge(ctr, r.deck, len / (n + 1), len / (n + 1)).slice(0, n)) {
          if (!city.isWater(q.x, q.z) && G(q.x, q.z) > q.y - 4) continue;
          piers.push({ ...q, w: r.w + 3 });
        }
      }
      ribbon(marked ? bMark : bPlain, r.p, r.w, lift(r.deck, 0.06 + o * 0.004), white, marked ? 14 : 10);
      continue;
    }
    if (o >= 2) ribbon(sideB, r.p, r.w + 4.2, 0.2, white, 4);
    ribbon(marked ? markB : plainB, r.p, r.w, 0.22, white, marked ? 14 : 10);
  }
  for (const r of city.rail) {
    const br = r.b && r.deck;
    const RB = br ? bRail : railB;
    const e = ribbon(RB, r.p, 4.2, br ? lift(r.deck, 0.02) : 0.13, C('#7e766b'), 6);
    if (br) bridgeSides(bBody, e, r.deck, concrete, 1.4);
    // koleje
    const p = r.p;
    for (const off of [-0.72, 0.72]) {
      const q = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 2) {
        const j = Math.min(i, p.length - 4);
        const dx = p[j + 2] - p[j], dz = p[j + 3] - p[j + 1];
        const l = Math.hypot(dx, dz) || 1;
        q[i] = p[i] - (dz / l) * off; q[i + 1] = p[i + 1] + (dx / l) * off;
      }
      ribbon(RB, q, 0.14, br ? lift(r.deck, 0.12) : 0.2, C('#3a3735'), 6);
    }
  }
  const asphaltM = layer(new THREE.MeshStandardMaterial({ map: TX.asphaltTexture(false), roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }), 4);
  const markM = layer(new THREE.MeshStandardMaterial({ map: TX.asphaltTexture(true), roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }), 5);
  const pav = TX.pavingTexture();
  const walkM = layer(new THREE.MeshStandardMaterial({ map: pav, roughness: 1, side: THREE.DoubleSide, vertexColors: true }), 3);
  const sideM = layer(new THREE.MeshStandardMaterial({ map: pav, color: '#d6d0c6', roughness: 1, side: THREE.DoubleSide, vertexColors: true }), 2);
  const railM = layer(new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, side: THREE.DoubleSide }), 3);
  for (const [b, m] of [[sideB, sideM], [walkB, walkM], [plainB, asphaltM], [markB, markM], [railB, railM]]) {
    const mesh = new THREE.Mesh(b.faceUp().drape(G, 5, false, 0.07).geometry(), m);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const [b, m] of [[bSide, sideM], [bWalk, walkM], [bPlain, asphaltM], [bMark, markM], [bRail, railM]]) {
    if (!b.pos.length) continue;
    const mesh = new THREE.Mesh(b.faceUp().geometry(), m);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // jez Hučák: kamenné pilíře pod lávkou a voda přepadající přes korunu jezu
  for (const r of city.roads) {
    if (r.n !== 'Hučák' || !r.b || !r.deck) continue;
    const ax = r.p[0], az = r.p[1], bx = r.p[r.p.length - 2], bz = r.p[r.p.length - 1];
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
    let nx = -uz, nz = ux;
    if (nz > 0) { nx = -nx; nz = -nz; } // po proudu = na sever (Labe teče k severu)
    const stoneM = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.95 });
    const deckAt = (t) => r.deck[0] + (r.deck[r.deck.length - 1] - r.deck[0]) * t;
    const water = G(ax + (bx - ax) * 0.5, az + (bz - az) * 0.5) + 0.12;
    const crest = water + 1.3;
    // pilíře
    const nP = Math.max(2, Math.round(L / 11));
    for (let k = 0; k <= nP; k++) {
      const t = k / nP, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const top = deckAt(t) - 0.2, bot = water - 2.5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, top - bot, 7), stoneM);
      m.position.set(x, (top + bot) / 2, z);
      m.rotation.y = Math.atan2(ux, uz) + Math.PI / 2;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    // koruna jezu a přepad: ze koruny šikmo dolů po proudu, pak zpěněná hladina
    const fallB = new Buf(), foamB = new Buf();
    const wc = C('#ffffff');
    const seg = 24;
    for (let k = 0; k < seg; k++) {
      const t0 = k / seg, t1 = (k + 1) / seg;
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
      const q = (p, d) => [p[0] + nx * d, p[1] + nz * d];
      // přepad (strmá plocha)
      const a = q(p0, 1.5), b = q(p1, 1.5), c = q(p1, 5), d = q(p0, 5);
      fallB.v(a[0], crest, a[1], nx, 0.5, nz, t0 * 4, 0, wc); fallB.v(b[0], crest, b[1], nx, 0.5, nz, t1 * 4, 0, wc); fallB.v(c[0], water + 0.15, c[1], nx, 0.5, nz, t1 * 4, 1, wc);
      fallB.v(a[0], crest, a[1], nx, 0.5, nz, t0 * 4, 0, wc); fallB.v(c[0], water + 0.15, c[1], nx, 0.5, nz, t1 * 4, 1, wc); fallB.v(d[0], water + 0.15, d[1], nx, 0.5, nz, t0 * 4, 1, wc);
      // pěna pod jezem
      const e = q(p1, 16), f = q(p0, 16);
      foamB.v(d[0], water + 0.16, d[1], 0, 1, 0, t0 * 4, 0, wc); foamB.v(c[0], water + 0.16, c[1], 0, 1, 0, t1 * 4, 0, wc); foamB.v(e[0], water + 0.16, e[1], 0, 1, 0, t1 * 4, 3, wc);
      foamB.v(d[0], water + 0.16, d[1], 0, 1, 0, t0 * 4, 0, wc); foamB.v(e[0], water + 0.16, e[1], 0, 1, 0, t1 * 4, 3, wc); foamB.v(f[0], water + 0.16, f[1], 0, 1, 0, t0 * 4, 3, wc);
      // koruna jezu (kamenný práh)
      const g0 = q(p0, 0.2), g1 = q(p1, 0.2);
      fallB.v(g0[0], crest + 0.02, g0[1], 0, 1, 0, 0, 0, C('#a19a8e')); fallB.v(g1[0], crest + 0.02, g1[1], 0, 1, 0, 0, 0, C('#a19a8e')); fallB.v(b[0], crest + 0.02, b[1], 0, 1, 0, 0, 0, C('#a19a8e'));
      fallB.v(g0[0], crest + 0.02, g0[1], 0, 1, 0, 0, 0, C('#a19a8e')); fallB.v(b[0], crest + 0.02, b[1], 0, 1, 0, 0, 0, C('#a19a8e')); fallB.v(a[0], crest + 0.02, a[1], 0, 1, 0, 0, 0, C('#a19a8e'));
    }
    const foamT = TX.waterTexture();
    foamT.repeat.set(1, 1);
    const fallM = new THREE.MeshStandardMaterial({ color: '#e9f2f4', map: foamT, vertexColors: true, roughness: 0.3, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const foamM = layer(new THREE.MeshStandardMaterial({ color: '#d8e8ec', map: foamT, roughness: 0.4, transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 2);
    scene.add(new THREE.Mesh(fallB.geometry(), fallM), new THREE.Mesh(foamB.geometry(), foamM));
    world.weirTex = foamT;
  }

  // pilíře mostů (ve vodě) a lampy na mostech
  for (const q of piers) {
    const geo = new THREE.BoxGeometry(q.w, q.y - 1.2 - (G(q.x, q.z) - 3), 2.4);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b3ab9d', roughness: 0.95 }));
    m.position.set(q.x, (q.y - 1.2 + G(q.x, q.z) - 3) / 2, q.z);
    m.rotation.y = Math.atan2(q.dx, q.dz) + Math.PI / 2;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  if (bridgeLamps.length) {
    const poleG = new THREE.CylinderGeometry(0.07, 0.11, 5.5, 6); poleG.translate(0, 2.75, 0);
    const globeG = new THREE.SphereGeometry(0.28, 10, 8); globeG.translate(0, 5.7, 0);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: '#2f3438', metalness: 0.5, roughness: 0.5 }), bridgeLamps.length);
    const globeM = new THREE.MeshStandardMaterial({ color: '#f4efe2', emissive: '#ffd99a', emissiveIntensity: 0 });
    const globes = new THREE.InstancedMesh(globeG, globeM, bridgeLamps.length);
    const mm = new THREE.Matrix4();
    bridgeLamps.forEach((q, i) => { mm.makeTranslation(q.x, q.y + 1.05, q.z); poles.setMatrixAt(i, mm); globes.setMatrixAt(i, mm); });
    poles.castShadow = true;
    scene.add(poles, globes);
    world.bridgeGlobe = globeM;
  }
  if (bBody.pos.length) {
    const bm = new THREE.Mesh(bBody.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    bm.castShadow = bm.receiveShadow = true;
    scene.add(bm);
  }

  progress(0.45, 'Stavím domy podle RÚIAN');
  await nextFrame();
  const facades = await fetch('data/facades.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const bld = buildBuildings(city, tex, ortho, facades);
  scene.add(bld.group);
  world.buildingMats = bld.mats;

  progress(0.62, 'Stavím těžní věž Mayrau');
  await nextFrame();
  for (const l of bld.landmarks) {
    if (l.type === 'whiteTower') scene.add(whiteTower(l.b));
    const make = { cathedral: cathedralTowers, baroqueHelmet, dome: domeOn, clock: clockFaces, townHall, clockTower, concreteChurch, cageTop }[l.type];
    const obj = make && make(l.b);
    if (obj && l.type !== 'whiteTower') {
      obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      scene.add(obj);
    }
  }

  // dominanty Vinařic (souřadnice světa = x, −sever)
  const mayrau = city.poi.find((p) => p.n === 'Jáma Mayrau');
  if (mayrau) {
    // vzpěry míří ke strojovně (největší budova v okolí)
    let mach = null, ma = 0;
    for (const b of city.buildings) {
      const d = Math.hypot(b.cx - mayrau.x, b.cz - mayrau.z);
      const area = (b.maxx - b.minx) * (b.maxz - b.minz);
      if (d > 12 && d < 70 && area > ma) { ma = area; mach = b; }
    }
    const dir = mach ? Math.atan2(mach.cx - mayrau.x, mach.cz - mayrau.z) : 0;
    const hf = headframe(28, dir);
    hf.position.set(mayrau.x, G(mayrau.x, mayrau.z), mayrau.z);
    scene.add(hf);
    for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const c = Math.cos(dir), sn = Math.sin(dir);
      city.obstacles.push({ x: mayrau.x + ox * c + oz * sn, z: mayrau.z - ox * sn + oz * c, r: 0.7, h: 28 });
    }
  }
  // Věznice Vinařice – zdi, ploty, věže, osvětlení, vjezd, komín kotelny
  if (city.prison) scene.add(buildPrison(city, G, world));
  // cihlový komín dolu Mayrau (48 m, OSM)
  scene.add(brickChimney(-638.9, G(-638.9, 1168.3), 1168.3, 48));
  city.obstacles.push({ x: -638.9, z: 1168.3, r: 3, h: 48 });

  // pomník obětem 2. světové války ve Švermově
  const pom = city.poi.find((p) => p.n === 'Pomník obětem 2. SV');
  if (pom) { scene.add(statueOn(pom.x, pom.z, G(pom.x, pom.z), 2.4)); city.obstacles.push({ x: pom.x, z: pom.z, r: 1.3, h: 5 }); }

  progress(0.7, 'Sázím stromy');
  await nextFrame();
  world.ortho = ortho;
  const trees = buildTrees(city, mobile, orthoSampler(ortho, city.half));
  scene.add(trees);

  progress(0.78, 'Rozsvěcuji lampy');
  await nextFrame();
  const lamps = buildLamps(city);
  scene.add(lamps);
  world.lampMat = lamps.userData.headMat;

  // přistávací plocha záchranky na louce u dolu Mayrau
  const fn = city.poi.find((p) => p.n === 'bývalý důl Mayrau');
  if (fn) {
    const spot = city.freeSpotNear(fn.x, fn.z, 50, 160);
    const padT = TX.labelTexture('H', '#2e7d4f', '#fff', 256, 256);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ map: padT, roughness: 0.8 }));
    pad.rotation.x = -Math.PI / 2;
    spot.y = G(spot.x, spot.z);
    pad.position.set(spot.x, spot.y + 0.2, spot.z);
    pad.receiveShadow = true;
    scene.add(pad);
    world.helipad = spot;
  }

  world.update = (dt, t, night) => {
    world.night = night;
    world.prisonFx?.update(dt, t, night);
    wt.offset.x = (t * 0.004) % 1;
    if (world.weirTex) world.weirTex.offset.y = (-t * 0.6) % 1; // přepadající voda teče
    wt.offset.y = (t * 0.011) % 1;
    for (const m of Object.values(bld.mats)) m.emissiveIntensity = night * 1.1;
    world.lampMat.emissiveIntensity = night * 2.5;
    if (world.prisonLampMat) world.prisonLampMat.emissiveIntensity = night * 4;
    if (world.bridgeGlobe) world.bridgeGlobe.emissiveIntensity = night * 3;
  };
  return world;
}
