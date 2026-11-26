import { Grid, pointInPoly, closestOnSeg } from './util.js';

export const AI_ROADS = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary',
  'tertiary_link', 'unclassified', 'residential', 'living_street', 'busway']);
export const DRIVE_ROADS = new Set([...AI_ROADS, 'service']);
export const WALK_ROADS = new Set(['footway', 'pedestrian', 'path', 'living_street', 'steps']);

const RIVER_W = { 'Týnecký potok': 2.6, 'Knovízský potok': 2.2, 'Svinařovský potok': 2.2 };

/** Části obce a okolí (střed v herních souřadnicích, poloměr). */
const ZONES = [
  { n: 'Vinařice – náměstí', x: -55, z: -33, r: 70 },
  { n: 'Věznice Vinařice', x: -255, z: 1100, r: 150, prison: true },
  { n: 'Důl Mayrau', x: -520, z: 1110, r: 230 },
  { n: 'Vinařická hora', x: -380, z: -900, r: 420 },
  { n: 'Vinařice', x: -60, z: -40, r: 820 },
];

/** Stáhne data s průběhem. */
export async function fetchData(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nepodařilo se načíst mapová data (' + res.status + ')');
  const total = +res.headers.get('content-length') || 2200000;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total), got);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}

/** Výškový model terénu (ČÚZK DMR 5G) – hlavička JSON + Uint16 cm. */
export async function fetchTerrain(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const nl = buf.indexOf(10);
    const hdr = JSON.parse(new TextDecoder().decode(buf.subarray(0, nl)));
    const raw = new Uint16Array(buf.buffer.slice(nl + 1, nl + 1 + hdr.n * hdr.n * 2));
    // 2× rozmazání 3×3 – vyhladí ostré skoky (opěrné zdi), kopec zůstane
    const n = hdr.n;
    let a = Float32Array.from(raw), b2 = new Float32Array(n * n);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let sum = 0, c = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= n) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            if (ii < 0 || ii >= n) continue;
            sum += a[jj * n + ii]; c++;
          }
        }
        b2[j * n + i] = sum / c;
      }
      [a, b2] = [b2, a];
    }
    return { ...hdr, data: a };
  } catch (e) {
    console.warn('Terén se nenačetl, svět bude rovný', e);
    return null;
  }
}

/** Vzdálenost bodu od obrysu polygonu. */
function edgeDistance(x, z, p) {
  let d = 1e18;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const c = closestOnSeg(x, z, p[j], p[j + 1], p[i], p[i + 1]);
    if (c.d2 < d) d = c.d2;
  }
  return Math.sqrt(d);
}

/** Srovná výškovou mřížku uvnitř polygonu na medián, v pásu `blend` m kolem něj plynulý přechod. */
function flattenArea(t, poly, blend) {
  const n = t.n, d = t.data;
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (let i = 0; i < poly.length; i += 2) { minx = Math.min(minx, poly[i]); maxx = Math.max(maxx, poly[i]); minz = Math.min(minz, poly[i + 1]); maxz = Math.max(maxz, poly[i + 1]); }
  const cell = (v) => Math.round((v + t.half) / t.step);
  const i0 = Math.max(0, cell(minx - blend)), i1 = Math.min(n - 1, cell(maxx + blend));
  const j0 = Math.max(0, cell(minz - blend)), j1 = Math.min(n - 1, cell(maxz + blend));
  const inside = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * t.step - t.half, z = j * t.step - t.half;
    if (pointInPoly(x, z, poly)) inside.push(d[j * n + i]);
  }
  if (!inside.length) return;
  inside.sort((a, b) => a - b);
  const flat = inside[Math.floor(inside.length / 2)];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * t.step - t.half, z = j * t.step - t.half, k = j * n + i;
    if (pointInPoly(x, z, poly)) { d[k] = flat; continue; }
    const e = edgeDistance(x, z, poly);
    if (e < blend) { const w = 0.5 + 0.5 * Math.cos((e / blend) * Math.PI); d[k] = d[k] * (1 - w) + flat * w; }
  }
}

/** Data mají y = sever; v herním světě je sever -z. */
function toWorld(flat) {
  const a = new Float32Array(flat.length);
  for (let i = 0; i < flat.length; i += 2) { a[i] = flat[i]; a[i + 1] = -flat[i + 1]; }
  return a;
}
function bbox(o) {
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  const p = o.p;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < minx) minx = p[i];
    if (p[i] > maxx) maxx = p[i];
    if (p[i + 1] < minz) minz = p[i + 1];
    if (p[i + 1] > maxz) maxz = p[i + 1];
  }
  o.minx = minx; o.minz = minz; o.maxx = maxx; o.maxz = maxz;
  o.cx = (minx + maxx) / 2; o.cz = (minz + maxz) / 2;
}

export class City {
  constructor(raw, terrain = null) {
    this.half = raw.half;
    this.terrain = terrain;
    // y = 0 odpovídá nejnižšímu bodu terénu (base m n. m.)
    this.datum = terrain ? terrain.base : 0;
    // areál věznice je ve skutečnosti rovný – srovnat terén uvnitř obvodu (+ plynulý přechod ven)
    if (terrain && raw.prison) flattenArea(terrain, toWorld(raw.prison), 25);
    this.buildings = raw.buildings.map((b, i) => {
      const o = { id: i, p: toWorld(b.p), k: b.k, n: b.n && b.n.replace(/\s+/g, ' ').trim(), r: b.r, rl: b.rl, ro: b.ro, lv: b.l, yr: b.y, bt: b.b };
      bbox(o);
      // výšky budov jsou absolutní: g = terén pod budovou, h = střecha, mh = spodek
      let sum = 0, mn = 1e9;
      const p = o.p, n = p.length / 2;
      for (let k = 0; k < p.length; k += 2) { const y = this.ground(p[k], p[k + 1]); sum += y; if (y < mn) mn = y; }
      o.g = n ? sum / n : 0;
      o.gmin = n ? mn : 0;
      o.rh = b.h;
      o.lifted = (b.mh || 0) > 0;
      o.h = o.g + b.h;
      o.mh = o.lifted ? o.g + b.mh : o.gmin - 0.6;
      return o;
    });
    this.roads = raw.roads.map((r, i) => {
      const o = { id: i, p: toWorld(r.p), t: r.t, w: r.w, n: r.n, b: !!r.b, o: !!r.o };
      o.drive = DRIVE_ROADS.has(r.t);
      o.ai = AI_ROADS.has(r.t);
      o.walk = WALK_ROADS.has(r.t);
      bbox(o);
      return o;
    });
    this.water = raw.water.map((w) => { const o = { p: toWorld(w.p) }; bbox(o); return o; });
    this.rivers = raw.rivers.map((r) => {
      const o = { p: toWorld(r.p), n: r.n, w: RIVER_W[r.n] || (r.w > 10 ? 12 : 2) };
      bbox(o);
      return o;
    });
    this.green = raw.green.map((g) => { const o = { p: toWorld(g.p), t: g.t, n: g.n }; bbox(o); return o; });
    this.rail = raw.rail.map((r) => ({ p: toWorld(r.p), b: r.b }));
    // mostovky: navazující úseky mostu se spojí a mostovka se proloží mezi předmostími na březích
    this.buildDecks(this.roads.filter((r) => r.b));
    this.buildDecks(this.rail.filter((r) => r.b));
    this.plazas = (raw.plazas || []).map((g) => { const o = { p: toWorld(g.p), t: g.t, n: g.n }; bbox(o); return o; });
    const pt = (o) => ({ ...o, x: o.x, z: -o.y });
    this.poi = raw.poi.map(pt);
    this.stops = raw.stops.map(pt);
    this.districts = raw.districts.map(pt);
    this.lines = raw.lines.map((l) => ({ ref: l.ref, n: l.n, p: toWorld(l.p) }));

    // mřížky
    this.bGrid = new Grid(40);
    for (const b of this.buildings) this.bGrid.add(b, b.minx, b.minz, b.maxx, b.maxz);
    this.rGrid = new Grid(40);
    this.segs = [];
    for (const r of this.roads) {
      const p = r.p;
      for (let i = 0; i < p.length - 2; i += 2) {
        const s = { r, i, ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3] };
        this.segs.push(s);
        const pad = r.w / 2 + 1;
        this.rGrid.add(s, Math.min(s.ax, s.bx) - pad, Math.min(s.az, s.bz) - pad,
          Math.max(s.ax, s.bx) + pad, Math.max(s.az, s.bz) + pad);
      }
    }
    this.wGrid = new Grid(60);
    for (const w of this.water) this.wGrid.add({ kind: 'poly', w }, w.minx, w.minz, w.maxx, w.maxz);
    for (const r of this.rivers) {
      const p = r.p;
      for (let i = 0; i < p.length - 2; i += 2) {
        const s = { kind: 'seg', w: r.w, ax: p[i], az: p[i + 1], bx: p[i + 2], bz: p[i + 3] };
        const pad = r.w / 2;
        this.wGrid.add(s, Math.min(s.ax, s.bx) - pad, Math.min(s.az, s.bz) - pad,
          Math.max(s.ax, s.bx) + pad, Math.max(s.az, s.bz) + pad);
      }
    }
    this.obstacles = []; // sloupy, kašny, pomníky (kruhy)
    this.fences = []; // zdi a ploty (úsečky s tloušťkou a výškou)
    this.fGrid = new Grid(30);
    this.prison = raw.prison ? toWorld(raw.prison) : null;
    this.buildGraph();
  }

  /* ---------------- terén ---------------- */

  /** Výška terénu (bilineárně), mimo území se drží okraje. */
  ground(x, z) {
    const t = this.terrain;
    if (!t) return 0;
    const n = t.n;
    let fx = (x + t.half) / t.step, fz = (z + t.half) / t.step;
    fx = fx < 0 ? 0 : fx > n - 1.001 ? n - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > n - 1.001 ? n - 1.001 : fz;
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const d = t.data, o = j * n + i;
    const a = d[o] + (d[o + 1] - d[o]) * tx;
    const b = d[o + n] + (d[o + n + 1] - d[o + n]) * tx;
    return (a + (b - a) * tz) / 100 + t.base - this.datum;
  }

  /** Mostovky pro skupiny navazujících mostních úseků (sdílejí koncový bod). */
  buildDecks(list) {
    const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const ends = new Map();
    list.forEach((r, i) => {
      for (const k of [key(r.p[0], r.p[1]), key(r.p[r.p.length - 2], r.p[r.p.length - 1])]) {
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k).push(i);
      }
    });
    for (const ids of ends.values()) for (let k = 1; k < ids.length; k++) parent[find(ids[k])] = find(ids[0]);
    const groups = new Map();
    list.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
    for (const rs of groups.values()) {
      // koncové body skupiny = body, které má jen jeden úsek
      const term = [];
      for (const r of rs) for (const [x, z] of [[r.p[0], r.p[1]], [r.p[r.p.length - 2], r.p[r.p.length - 1]]]) {
        if (ends.get(key(x, z)).filter((i) => rs.includes(list[i])).length === 1) term.push([x, z]);
      }
      if (rs.length === 1 || term.length !== 2) { for (const r of rs) this.deckOf(r); continue; }
      const [A, B] = term;
      const dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
      const ya = this.ground(A[0], A[1]), yb = this.ground(B[0], B[1]);
      // terén (a hladina) pod mostem – mostovka musí být nad ním s rezervou
      const N = 24, gs = [];
      for (let k = 0; k <= N; k++) gs.push(this.ground(A[0] + dx * k / N, A[1] + dz * k / N));
      for (const r of rs) {
        const d = [];
        for (let i = 0; i < r.p.length; i += 2) {
          const t = Math.max(0, Math.min(1, ((r.p[i] - A[0]) * dx + (r.p[i + 1] - A[1]) * dz) / L2));
          const base = ya + (yb - ya) * t + Math.sin(t * Math.PI) * Math.min(1.2, L * 0.006);
          const k = Math.min(N - 1, Math.floor(t * N)), f = t * N - k;
          const under = gs[k] + (gs[k + 1] - gs[k]) * f;
          d.push(Math.max(base, under + 1.4 * Math.sqrt(Math.sin(t * Math.PI))));
        }
        r.deck = d;
      }
    }
  }

  /** Spočítá výšky mostovky v bodech mostu. */
  deckOf(r) {
    const p = r.p, n = p.length / 2;
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
    const L = cum[n - 1] || 1;
    const ya = this.ground(p[0], p[1]), yb = this.ground(p[p.length - 2], p[p.length - 1]);
    // mírné vyklenutí uprostřed
    r.deck = cum.map((c) => { const t = c / L; return ya + (yb - ya) * t + Math.sin(t * Math.PI) * Math.min(1.2, L * 0.006); });
    return r.deck;
  }

  /** Výška mostovky v bodě (nebo null). yHint: výška objektu – pod mostem zůstane dole. */
  bridgeY(x, z, yHint = null) {
    let best = null;
    this.rGrid.query(x, z, 2, (s) => {
      const r = s.r;
      if (!r.b || !r.deck) return;
      const c = closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      const hw = r.w / 2 + 1.5;
      if (c.d2 > hw * hw) return;
      const k = s.i / 2;
      const sl = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      const t = Math.hypot(c.x - s.ax, c.z - s.az) / sl;
      const y = r.deck[k] + (r.deck[k + 1] - r.deck[k]) * t;
      if (yHint != null && yHint < y - 2.5) return;
      if (best == null || y > best) best = y;
    });
    return best;
  }

  /** Povrch, po kterém se jezdí a chodí (most nebo terén). */
  surface(x, z, yHint = null) {
    const b = this.bridgeY(x, z, yHint);
    return b != null ? b : this.ground(x, z);
  }

  /* ---------------- dotazy ---------------- */

  isWater(x, z) {
    let wet = false;
    this.wGrid.query(x, z, 1, (it) => {
      if (it.kind === 'poly') {
        const w = it.w;
        if (x >= w.minx && x <= w.maxx && z >= w.minz && z <= w.maxz && pointInPoly(x, z, w.p)) wet = true;
      } else {
        const c = closestOnSeg(x, z, it.ax, it.az, it.bx, it.bz);
        if (c.d2 < (it.w / 2) * (it.w / 2)) wet = true;
      }
      return !wet;
    });
    if (!wet) return false;
    return !this.onBridge(x, z);
  }

  onBridge(x, z) {
    let on = false;
    this.rGrid.query(x, z, 2, (s) => {
      if (!s.r.b) return;
      const c = closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      const hw = s.r.w / 2 + 1.5;
      if (c.d2 < hw * hw) { on = true; return false; }
    });
    return on;
  }

  /** Nejbližší silnice (volitelný filtr). */
  nearestRoad(x, z, maxD = 40, filter = null) {
    let best = null, bd = maxD * maxD;
    this.rGrid.query(x, z, maxD, (s) => {
      if (filter && !filter(s.r)) return;
      const c = closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      if (c.d2 < bd) {
        bd = c.d2;
        best = { road: s.r, x: c.x, z: c.z, d: Math.sqrt(c.d2), seg: s };
      }
    });
    return best;
  }

  /** Budova obsahující bod. */
  buildingAt(x, z) {
    let hit = null;
    this.bGrid.query(x, z, 0.5, (b) => {
      if (x >= b.minx && x <= b.maxx && z >= b.minz && z <= b.maxz && pointInPoly(x, z, b.p)) { hit = b; return false; }
    });
    return hit;
  }

  /** Výška povrchu (střechy) v bodě – pro vrtulník. */
  roofHeight(x, z, yHint = null) {
    const b = this.buildingAt(x, z);
    if (!b) return this.surface(x, z, yHint);
    const m = b.roofM;
    if (!m) return b.h;
    if (m.skel) {
      let d = 1e9;
      const p = m.p;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const ax = p[j], az = p[j + 1], dx = p[i] - ax, dz = p[i + 1] - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
      }
      return m.eave + Math.max(0, m.rh - m.kk * Math.abs(d - m.half));
    }
    let f = 1e9;
    for (const P of m.planes) { const v = P[0] * x + P[1] * z + P[2]; if (v < f) f = v; }
    return m.eave + Math.max(0, f);
  }

  /**
   * Vytlačí kruh z budov. y = absolutní výška objektu (budovy nižší než y se ignorují); bez y = na zemi.
   * Vrací {x, z, hit, nx, nz}.
   */
  collide(x, z, r, y = null) {
    let hit = false, nx = 0, nz = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.bGrid.query(x, z, r + 1, (b) => {
        const yy = y ?? b.g;
        if (yy >= b.h || yy + 1.6 < b.mh) return;
        if (x < b.minx - r || x > b.maxx + r || z < b.minz - r || z > b.maxz + r) return;
        const p = b.p;
        const inside = pointInPoly(x, z, p);
        let bd = 1e18, bx = 0, bz = 0;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
          const c = closestOnSeg(x, z, p[j], p[j + 1], p[i], p[i + 1]);
          if (c.d2 < bd) { bd = c.d2; bx = c.x; bz = c.z; }
        }
        const d = Math.sqrt(bd);
        if (!inside && d >= r) return;
        let ux = x - bx, uz = z - bz;
        const ul = Math.hypot(ux, uz) || 1;
        ux /= ul; uz /= ul;
        if (inside) { ux = -ux; uz = -uz; }
        const push = inside ? d + r : r - d;
        x += ux * push; z += uz * push;
        nx += ux; nz += uz;
        hit = moved = true;
      });
      for (const o of this.obstacles) {
        const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), rr = o.r + r;
        if (d >= rr || (y != null && y > this.ground(o.x, o.z) + o.h)) continue;
        const ux = d ? dx / d : 1, uz = d ? dz / d : 0;
        x = o.x + ux * rr; z = o.z + uz * rr;
        nx += ux; nz += uz; hit = moved = true;
      }
      this.fGrid.query(x, z, r + 1, (f) => {
        if (f.off) return; // otevřená brána
        const c = closestOnSeg(x, z, f.ax, f.az, f.bx, f.bz);
        const rr = r + f.th / 2, d = Math.sqrt(c.d2);
        if (d >= rr) return;
        if (y != null && y > this.ground(c.x, c.z) + f.h) return; // přeskočeno / přeletěno
        let ux = x - c.x, uz = z - c.z;
        const ul = Math.hypot(ux, uz);
        if (ul < 1e-4) { ux = -(f.bz - f.az); uz = f.bx - f.ax; } // přesně na ose – odsunout kolmo
        const l = Math.hypot(ux, uz) || 1;
        ux /= l; uz /= l;
        x = c.x + ux * rr; z = c.z + uz * rr;
        nx += ux; nz += uz; hit = moved = true;
      });
      if (!moved) break;
    }
    const nl = Math.hypot(nx, nz) || 1;
    return { x, z, hit, nx: nx / nl, nz: nz / nl };
  }

  /** Zeď / plot jako úsečka: h = výška nad terénem, th = tloušťka. */
  addFence(ax, az, bx, bz, h, th = 0.4) {
    const f = { ax, az, bx, bz, h, th };
    this.fences.push(f);
    const m = th + 1;
    this.fGrid.add(f, Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m);
    return f;
  }

  /** Je mezi body volný výhled (pro policii)? Hrubý test po krocích. */
  lineOfSight(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.buildingAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** Jméno místa: ulice + čtvrť. */
  placeName(x, z) {
    let district = null, dd = 1e18;
    for (const d of this.districts) {
      const q = (d.x - x) ** 2 + (d.z - z) ** 2 * 1;
      const w = d.big ? q * 1.6 : q;
      if (w < dd) { dd = w; district = d; }
    }
    let street = null;
    const r = this.nearestRoad(x, z, 30, (r) => !!r.n);
    if (r) street = r.road.n;
    const zone = this.prison && pointInPoly(x, z, this.prison) ? ZONES[1] : ZONES.find((q) => !q.prison && Math.hypot(x - q.x, z - q.z) < q.r);
    if (zone && zone.r <= 70) street = 'náměstí';
    return { street, district: zone ? zone.n : district ? district.n : 'Vinařice' };
  }

  /* ---------------- silniční graf ---------------- */

  buildGraph() {
    const key = (x, z) => Math.round(x * 10) * 100003 + Math.round(z * 10);
    const count = new Map();
    // přístupové cesty do věznice: jen pro navigaci a policii, běžný provoz tam nejezdí
    const prisonRoad = (r) => {
      if (!this.prison || r.ai || !r.drive) return false;
      for (let i = 0; i < r.p.length; i += 2) if (pointInPoly(r.p[i], r.p[i + 1], this.prison)) return true;
      return false;
    };
    const ai = this.roads.filter((r) => r.ai || prisonRoad(r));
    for (const r of ai) {
      const p = r.p;
      for (let i = 0; i < p.length; i += 2) {
        const k = key(p[i], p[i + 1]);
        const end = i === 0 || i === p.length - 2;
        count.set(k, (count.get(k) || 0) + (end ? 2 : 1));
      }
    }
    const nodes = new Map();
    const getNode = (x, z) => {
      const k = key(x, z);
      let n = nodes.get(k);
      if (!n) { n = { id: nodes.size, x, z, out: [], all: [] }; nodes.set(k, n); }
      return n;
    };
    const edges = [];
    for (const r of ai) {
      const p = r.p;
      let start = 0;
      for (let i = 2; i < p.length; i += 2) {
        const k = key(p[i], p[i + 1]);
        if (count.get(k) >= 2 || i === p.length - 2) {
          const pts = p.slice(start, i + 2);
          if (pts.length >= 4) {
            const a = getNode(pts[0], pts[1]);
            const b = getNode(pts[pts.length - 2], pts[pts.length - 1]);
            const cum = [0];
            for (let j = 2; j < pts.length; j += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]));
            const e = { id: edges.length, pts, cum, len: cum[cum.length - 1], a, b, w: r.w, oneway: r.o, road: r, navOnly: !r.ai };
            if (e.len > 0.5) {
              edges.push(e);
              a.out.push({ e, dir: 1 });
              a.all.push(e); b.all.push(e);
              if (!r.o) b.out.push({ e, dir: -1 });
            }
          }
          start = i;
        }
      }
    }
    this.nodes = [...nodes.values()];
    this.edges = edges;
    // největší souvislá komponenta
    let bestComp = null;
    const seen = new Set();
    for (const n of this.nodes) {
      if (seen.has(n)) continue;
      const comp = [];
      const st = [n];
      seen.add(n);
      while (st.length) {
        const c = st.pop();
        comp.push(c);
        for (const e of c.all) for (const m of [e.a, e.b]) if (!seen.has(m)) { seen.add(m); st.push(m); }
      }
      if (!bestComp || comp.length > bestComp.length) bestComp = comp;
    }
    for (const n of bestComp) n.main = true;
    this.mainEdges = edges.filter((e) => e.a.main && e.len > 8);
    this.nGrid = new Grid(60);
    for (const n of this.nodes) if (n.main && n.out.length) this.nGrid.add(n, n.x, n.z, n.x, n.z);
  }

  /** Bod na hraně ve vzdálenosti s (ve směru dir), s posunem do pravého pruhu. */
  edgePoint(e, s, dir, laneOff, out) {
    const cum = e.cum, pts = e.pts;
    let d = dir > 0 ? s : e.len - s;
    d = Math.max(0, Math.min(e.len, d));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    const ax = pts[(i - 1) * 2], az = pts[(i - 1) * 2 + 1], bx = pts[i * 2], bz = pts[i * 2 + 1];
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (dir < 0) { dx = -dx; dz = -dz; }
    // pravý pruh: (dx,dz) otočený o -90° v rovině xz → (-dz, dx)
    out.x = ax + (bx - ax) * t - dz * laneOff;
    out.z = az + (bz - az) * t + dx * laneOff;
    out.dx = dx; out.dz = dz;
    return out;
  }

  nearestNode(x, z, r = 200) {
    let best = null, bd = 1e18;
    this.nGrid.query(x, z, r, (n) => {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }

  /** A* po silniční síti – vrací seznam bodů. */
  findPath(from, to, maxIter = 4000) {
    if (!from || !to) return null;
    const open = [{ n: from, f: 0 }];
    const g = new Map([[from, 0]]);
    const prev = new Map();
    const h = (n) => Math.hypot(n.x - to.x, n.z - to.z);
    let it = 0;
    while (open.length && it++ < maxIter) {
      // malá binární halda
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur.n === to) break;
      const gc = g.get(cur.n);
      for (const o of cur.n.out) {
        const m = o.dir > 0 ? o.e.b : o.e.a;
        const ng = gc + o.e.len;
        if (ng < (g.get(m) ?? 1e18)) {
          g.set(m, ng);
          prev.set(m, { n: cur.n, o });
          open.push({ n: m, f: ng + h(m) });
        }
      }
    }
    if (!prev.has(to)) return null;
    const path = [];
    let c = to;
    while (c !== from) {
      const pv = prev.get(c);
      const { e, dir } = pv.o;
      const seg = [];
      for (let i = 0; i < e.pts.length; i += 2) seg.push([e.pts[i], e.pts[i + 1]]);
      if (dir < 0) seg.reverse();
      path.unshift(...seg.slice(1));
      c = pv.n;
    }
    path.unshift([from.x, from.z]);
    return path;
  }

  findByName(name) {
    const b = this.buildings.find((b) => b.n === name);
    if (b) return { x: b.cx, z: b.cz, h: b.rh, b };
    const p = this.poi.find((p) => p.n === name) || this.stops.find((s) => s.n === name);
    if (p) return { x: p.x, z: p.z };
    const g = this.green.find((g) => g.n === name);
    if (g) return { x: g.cx, z: g.cz };
    return null;
  }

  /** Volné místo poblíž (mimo budovy a vodu). */
  freeSpotNear(x, z, minR = 0, maxR = 60) {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minR + Math.random() * (maxR - minR);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const c = this.collide(px, pz, 2.5);
      if (!c.hit && !this.isWater(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }
}
