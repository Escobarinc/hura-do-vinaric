export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
// rAF se v neaktivní kartě zastaví – timeout zajistí, že načítání pokračuje
export const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 60); });

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Bod v polygonu; p = [x0,z0,x1,z1,...] */
export function pointInPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

const _c = { x: 0, z: 0, t: 0, d2: 0 };
/** Nejbližší bod na úsečce AB (vrací sdílený objekt). */
export function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  _c.x = ax + dx * t;
  _c.z = az + dz * t;
  _c.t = t;
  const ex = px - _c.x, ez = pz - _c.z;
  _c.d2 = ex * ex + ez * ez;
  return _c;
}

/** Jednoduchá prostorová mřížka pro rychlé dotazy. */
export class Grid {
  constructor(cell = 32) {
    this.cell = cell;
    this.map = new Map();
    this.stamp = 1;
  }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(item, minx, minz, maxx, maxz) {
    const c = this.cell;
    const x0 = Math.floor(minx / c), x1 = Math.floor(maxx / c);
    const z0 = Math.floor(minz / c), z1 = Math.floor(maxz / c);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(item);
      }
  }
  /** Zavolá cb pro každou unikátní položku v okolí. */
  query(x, z, r, cb) {
    const c = this.cell;
    const st = ++this.stamp;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.map.get(this.key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const it = a[i];
          if (it._q === st) continue;
          it._q = st;
          if (cb(it) === false) return;
        }
      }
  }
}

export function fmtMoney(n) {
  return Math.round(n).toLocaleString('cs-CZ');
}

/** Malý deterministický generátor pro stabilní variace. */
export function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash(n) { return hash01(n) * 2 - 1; }
