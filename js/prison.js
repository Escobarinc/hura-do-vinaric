/*
 * Věznice Vinařice – život v areálu.
 * Podle popisu pamětníka (podklady/popis_veznice.md):
 *  - obědy 10:30–12:30 a večeře 15:30–17:30: postupně se vystřídají všechny oddíly (skupiny ~60 lidí ve formaci,
 *    v čele dozorce), skupina jdoucí z jídelny se míjí s další, která se mezitím nastoupí před svou budovou,
 *  - u hlavního vstupu a zásobování jsou velké posuvné brány (otevírají se pro vozidla),
 *  - eskortní autobus přijíždí hlavní branou (západ, vrátnice 19/20), na konci budovy 4 zatočí vpravo,
 *    projede mezi 12 a 13 a dozadu k 17, parkuje za kotelnou 15 blíž k 17,
 *  - v areálu stojí vězeňská auta.
 * Souřadnice světa: x = východ, z = jih (čísla budov podle podklady/veznice_budovy.jpg).
 */
import * as THREE from 'three';
import { Vehicle, makeKitCar, makeBusMesh, makeHuman, animateHuman } from './entities.js?v=20261127214230';
import { labelTexture } from './textures.js?v=20261127214230';
import { Crowd } from './crowd.js?v=20261127214230';

// barvy oblečení – ústavní oděv vězňů a uniforma dozorců (upravit podle skutečnosti)
export const UNIFORM = { shirt: '#3f4f63', pants: '#34404f' };
export const GUARD = { shirt: '#1d2633', pants: '#161c26' };
const VS_BLUE = '#1f3f8a';

const CENTER = { x: -260, z: 1090 };
const ACTIVE_R = 480; // život v areálu běží jen v blízkosti hráče

/*
 * Chodí se jen po silnicích (ne přes hřiště). Síť vnitřních cest obkreslená z ortofota ČÚZK:
 * severní hlavní cesta, příčka mezi hřišti C a D dolů mezi 12 a 13, cesta podél severní strany 13,
 * ulička mezi hřišti A a B, která pokračuje mezi jídelnou 12 a budovou M (23), a cesta mezi zahrádkou B a hřištěm C.
 * Jídelna má dva vchody (podle pamětníka): č. 1 zepředu na severní stěně (konec cesty mezi B a C), č. 2 z boku (západní stěna).
 */
const MESS_N = [-312.5, 1090.6]; // vchod 1 – severní stěna, na konci cesty mezi zahrádkou B a hřištěm C (pamětník)
const MESS_W = [-324.4, 1099]; // vchod 2 (z boku)
const NET = [
  // severní hlavní cesta (od západu k budově K a kolem ní)
  [[-382, 1067], [-360, 1067], [-329.5, 1066.6], [-324, 1065.5], [-312.5, 1063.6], [-295, 1060.8], [-270, 1057], [-242, 1053], [-196, 1049], [-187, 1048], [-180, 1052], [-179, 1065], [-183, 1070]],
  // ulička mezi hřišti A a B a dál mezi 12 a M
  [[-329.5, 1066.6], [-329.5, 1085.5], [-329.5, 1099], [-329.5, 1106], [-329.5, 1112]],
  // cesta k vchodu 1: mezi zahrádkou B a hřištěm C rovně k severní stěně jídelny
  [[-312.5, 1063.6], [-312.5, 1080], MESS_N],
  [[-329.5, 1099], MESS_W],
  // podél jižní stěny budovy M (tudy chodí M na jídlo a zpět) a napojení na uličku
  [[-329.5, 1112], [-330.6, 1115], [-332.5, 1115.4], [-350.8, 1117.7], [-366, 1119.6]],
  // příčka mezi hřišti C a D dolů mezi 12 a 13
  [[-270, 1057], [-269.5, 1068], [-268.5, 1080.8], [-264, 1088], [-263, 1100]],
  // cesta podél severní strany budovy 13
  [[-268.5, 1080.8], [-240, 1081], [-213, 1081]],
];
/**
 * Pořadí oddílů (podle pamětníka): K levá část, K pravá část, O + C, L4/L5, celé M, Toxi/MON/B, 10, 11–12.
 * door = dveře budovy, mess = kterým vchodem jdou do jídelny. M, L, Toxi, MON, B chodí bočním vchodem.
 */
const WAVES = [
  // přední vchod (fronta 'front'): K, pak O + C, Toxi/MON/B, 10, 11–12
  { name: 'K1 · K2 · K3 · K4', bldg: 'K', lane: 'front', size: 200, door: [-174.5, 1046], mess: MESS_N },
  { name: 'K5 · K6 · K7 · K8', bldg: 'K', lane: 'front', size: 200, door: [-174.5, 1068], mess: MESS_N },
  // boční vchod (fronta 'side'): M vychází zároveň s K, jakmile M odejde, jde L (pamětník)
  { name: 'M1 · M2', bldg: 'M', lane: 'side', size: 100, door: [-350.8, 1116], mess: MESS_W }, // jižní stranou budovy M
  { name: 'L4 · L5', bldg: '1', lane: 'side', size: 100, door: [-360, 1065.6], mess: MESS_W },
  { name: 'O', bldg: 'O', lane: 'front', size: 50, door: [-238, 1050.5], mess: MESS_N }, // umístění budovy O zatím odhad (u C)
  { name: 'C', bldg: '5', lane: 'front', size: 50, door: [-238, 1050.5], mess: MESS_N },
  { name: 'Toxi · MON · B', bldg: '4', lane: 'front', size: 150, door: [-295, 1057.4], mess: MESS_W },
  { name: '10V · 10Z', bldg: '14', lane: 'front', size: 100, door: [-212.2, 1081], mess: MESS_N },
  { name: '11V · 11Z · 12 · 12B', bldg: '13', lane: 'front', size: 200, door: [-233, 1083.7], mess: MESS_N },
];

/** Nejkratší cesta po síti NET z bodu a do bodu b (oba se napojí na nejbližší úsek). */
function routeOnNet(a, b) {
  const nodes = [], key = (p) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`, idx = new Map(), adj = [];
  const node = (p) => { const k = key(p); if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push(p); adj.push([]); } return idx.get(k); };
  const link = (i, j) => { const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]); adj[i].push([j, d]); adj[j].push([i, d]); };
  const segs = [];
  for (const line of NET) for (let i = 0; i + 1 < line.length; i++) { const u = node(line[i]), v = node(line[i + 1]); link(u, v); segs.push([u, v]); }
  const attach = (p) => {
    let best = null;
    for (const [u, v] of segs) {
      const [ax, az] = nodes[u], [bx, bz] = nodes[v], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2));
      const q = [ax + dx * t, az + dz * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d) best = { d, q, u, v };
    }
    const qi = node(best.q);
    if (qi !== best.u) link(qi, best.u);
    if (qi !== best.v) link(qi, best.v);
    const pi = node(p);
    if (pi !== qi) link(pi, qi);
    return pi;
  };
  const s0 = attach(a), t0 = attach(b);
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  dist[s0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === t0) break;
    done[u] = true;
    for (const [v, d] of adj[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
  }
  const path = [];
  for (let u = t0; u >= 0; u = prev[u]) path.unshift(nodes[u]);
  return path;
}
// výdej jídla (herní hodiny) – během okna se vystřídají všechny skupiny
const MEALS = [{ name: 'oběd', from: 10.5, to: 12.5 }, { name: 'večeře', from: 15.5, to: 17.5 }];
// pravidlo: skupiny z různých budov se na cestě nesmí potkat → cesta k jídelně je vždy jen pro jednu budovu
const READY_S = 1; // po spuštění vyrazí hned (žádné stání před budovou)
const EAT_S = 100; // jídlo (skutečné sekundy)
const WALK_V = 1.9; // svižný pochod
const ROW = 0.9, COLS = 4; // ~50 lidí na oddíl (pamětník) → čtyřstupy

// eskortní autobus: trasa od hlavní brány dovnitř (před bránou se připojí veřejná silnice)
const BUS_IN = [[-475, 1106], [-440, 1097], [-412, 1083], [-387, 1069.5], [-345, 1068.5], [-324, 1066.5], [-286, 1062],
  [-268, 1066], [-263, 1080], [-263, 1095], [-261, 1105.5], [-240, 1107.3], [-200, 1105.4], [-170, 1102.5], [-150, 1100.6]];
const BUS_TIMES = [9.0, 13.5, 19.0]; // mimo výdej jídla
const BUS_WAIT = 0.6; // herní hodiny stání (výstup eskortovaných)
const DOOR_K = [-156, 1094]; // jižní vstup budovy K (16)

/** Délky polylinie a bod podle staničení. */
function prep(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return { pts: path, cum, len: cum[cum.length - 1] };
}
function at(P, s) {
  const { pts, cum } = P;
  if (s <= 0) { const [a, b] = pts; return { x: a[0], z: a[1], h: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
  for (let i = 1; i < pts.length; i++) {
    if (s <= cum[i]) {
      const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), a = pts[i - 1], b = pts[i];
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, h: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  return { x: b[0], z: b[1], h: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/** Polep Vězeňské služby na bok vozidla. */
function livery(mesh, L, W, H, big = false) {
  const mat = new THREE.MeshStandardMaterial({ map: labelTexture('VĚZEŇSKÁ SLUŽBA', VS_BLUE, '#ffffff', 512, 80), roughness: 0.5 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L * (big ? 0.55 : 0.62), big ? 0.42 : 0.26), mat);
    p.position.set(s * (W / 2 + 0.03), H, big ? -0.6 : -0.1);
    p.rotation.y = s * Math.PI / 2;
    mesh.add(p);
  }
}

export class PrisonLife {
  constructor(game) {
    this.game = game;
    const { city, scene } = game;
    this.city = city; this.scene = scene;
    this.vehicles = [];
    this.groups = [];
    this.pool = [];
    this.lastHour = null;
    if (!city.prison) return;
    this.spawnCars();
    // trasy skupin
    let off = 0;
    this.waves = WAVES.map((w) => {
      const P = prep(routeOnNet(w.door, w.mess)), rows = Math.ceil(w.size / COLS), tail = 2 + rows * ROW + 1.5;
      // nástup v bloku před budovou: řady rovnoběžně se stěnou, od dveří směrem ven
      const a = P.pts[0], b2 = P.pts[1] || [a[0] + 1, a[1]], dl = Math.hypot(b2[0] - a[0], b2[1] - a[1]) || 1;
      const ox = (b2[0] - a[0]) / dl, oz = (b2[1] - a[1]) / dl, wx = -oz, wz = ox;
      const bw = Math.min(26, Math.ceil(Math.sqrt(w.size * 2.6))), block = [];
      for (let i = 0; i < w.size; i++) {
        const c = i % bw, r = Math.floor(i / bw), l = (c - (bw - 1) / 2) * 0.72;
        block.push([a[0] + wx * l + ox * (1.2 + r * 0.8), a[1] + wz * l + oz * (1.2 + r * 0.8), Math.atan2(ox, oz)]);
      }
      const o = { ...w, P, rows, tail, off, guards: null, block };
      off += w.size;
      return o;
    });
    // vězni na jídle jako hromadný dav (přes 1000 lidí)
    this.mealCrowd = new Crowd(this.scene, { capacity: off, shirt: UNIFORM.shirt, pants: UNIFORM.pants });
    this.buildSchedule();
    // autobus
    const pub = this.publicApproach();
    this.pub = pub;
    this.busIn = prep([...pub, ...BUS_IN]);
    // odjezd (odhad): vycouvá ke křižovatce mezi 12 a 13, pak vpřed vnitřním vjezdem a ven bránou zásobování (24/25)
    this.junctionS = this.busIn.cum[pub.length + BUS_IN.findIndex((p) => p[0] === -263 && p[1] === 1095)];
    this.busOut = prep([[-263, 1095], [-262.5, 1106], [-266.2, 1116], [-266.5, 1124], [-278, 1127], [-293, 1141], [-303, 1147],
      [-311, 1150], [-340, 1140], [-356, 1148], [-371, 1157], [-412, 1178], [-428, 1186], ...this.publicDeparture()]);
    this.convoy = []; // autobusy a hasiči (skriptovaná vozidla)
    this.fire = null;
    this.horses = []; // „koně“ na budově K
    this.riotArmed = true; // policie zasahuje se samopaly a granáty
    this.makeButtons();
  }

  /** Úsek veřejné silnice před hlavní bránou (od jihu, směr Kladno), končí u vjezdu. */
  publicApproach() {
    const r = this.city.roads.find((q) => q.t === 'tertiary' && (() => { for (let i = 0; i < q.p.length; i += 2) if (Math.hypot(q.p[i] + 478, q.p[i + 1] - 1106) < 8) return true; return false; })());
    if (!r) return [[-480, 1180]];
    const pts = [];
    for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i], r.p[i + 1]]);
    let k = 0, bd = 1e9;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] + 478, p[1] - 1106); if (d < bd) { bd = d; k = i; } });
    // přijíždí z jihu (větší z) – vezmi body od jihu k bráně, asi 200 m
    const south = pts[0][1] > pts[pts.length - 1][1];
    const seq = south ? pts.slice(0, k + 1) : pts.slice(k).reverse();
    const out = [];
    let acc = 0;
    for (let i = seq.length - 1; i >= 0; i--) {
      out.unshift(seq[i]);
      if (i < seq.length - 1) acc += Math.hypot(seq[i][0] - seq[i + 1][0], seq[i][1] - seq[i + 1][1]);
      if (acc > 220) break;
    }
    return out;
  }

  /** Veřejná silnice od výjezdu zásobování dál na jih (~150 m), kde autobus zmizí. */
  publicDeparture() {
    let best = null, bd = 1e9;
    for (const q of this.city.roads) {
      if (!q.ai) continue;
      for (let i = 0; i < q.p.length; i += 2) {
        const d = Math.hypot(q.p[i] + 428, q.p[i + 1] - 1186);
        if (d < bd) { bd = d; best = { q, i }; }
      }
    }
    if (!best || bd > 25) return [];
    const pts = [];
    for (let i = 0; i < best.q.p.length; i += 2) pts.push([best.q.p[i], best.q.p[i + 1]]);
    const k = best.i / 2;
    const seq = (pts[pts.length - 1][1] > pts[0][1]) ? pts.slice(k) : pts.slice(0, k + 1).reverse();
    const out = [];
    let acc = 0;
    for (let i = 0; i < seq.length; i++) {
      if (i) acc += Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]);
      out.push(seq[i]);
      if (acc > 160) break;
    }
    return out;
  }

  /* ---------------- vězeňská auta ---------------- */
  makeVSCar(type) {
    const m = makeKitCar(type, '#f3f4f2');
    const u = m.userData;
    livery(m, u.L || 4.4, u.W || 1.8, type === 'van' || type === 'delivery' ? 1.25 : 0.8);
    // modrý pruh
    const stripe = new THREE.MeshStandardMaterial({ color: VS_BLUE, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry((u.L || 4.4) * 0.92, 0.1), stripe);
      p.position.set(s * ((u.W || 1.8) / 2 + 0.025), 0.55, 0);
      p.rotation.y = s * Math.PI / 2;
      m.add(p);
    }
    return m;
  }
  spawnCars() {
    const spots = [
      // autopark (29) a dvůr u skladu (26)
      ['van', -247, 1170, 2.4], ['van', -242, 1174, 2.4], ['sedan', -236, 1178, 2.4], ['delivery', -252, 1166, 2.4],
      // u správy (2) uvnitř
      ['sedan', -336, 1072, 1.5],
      // před hlavním vstupem (vrátnice 19/20)
      ['sedan', -462, 1112, 0.2], ['suv', -466, 1104, 0.2],
    ];
    for (const [type, x, z, h] of spots) {
      const s = this.city.freeSpotNear(x, z, 0, 6);
      const v = new Vehicle(this.makeVSCar(type));
      v.place(s.x, s.z, h);
      v.label = 'Auto Vězeňské služby';
      this.scene.add(v.mesh);
      this.game.parked.push(v);
    }
  }

  /* ---------------- lidé ---------------- */
  person(kind) {
    const free = this.pool.find((p) => !p.used && p.kind === kind);
    if (free) { free.used = true; free.mesh.visible = true; return free; }
    const c = kind === 'guard' ? GUARD : UNIFORM;
    const names = kind === 'guard' ? ['Worker_Male'] : ['Casual_Male', 'Casual2_Male', 'Casual3_Male', 'Casual_Bald', 'Casual_Bald'];
    const name = names[Math.floor(Math.random() * names.length)];
    const mesh = makeHuman({ name, female: false, tint: false, uniform: { ...c, hat: kind === 'guard' ? '#1a2230' : null }, shirt: c.shirt, pants: c.pants });
    this.scene.add(mesh);
    const p = { mesh, kind, used: true };
    this.pool.push(p);
    return p;
  }
  release(list) { for (const p of list) { if (p.dead) continue; p.used = false; p.mesh.visible = false; } } // mrtví zůstávají ležet

  /** Skupina kráčí ve trojstupu po trase (dir 1 = z budovy do jídelny, -1 = zpět). */
  startGroup(route, dir) {
    const cols = 3, rows = Math.ceil(route.size / cols);
    const people = [];
    for (let i = 0; i < route.size; i++) people.push(this.person('prisoner'));
    const guards = [this.person('guard'), this.person('guard')];
    this.groups.push({ route, dir, s: 0, rows, cols, people, guards, len: route.P.len + rows * 0.95 + 3 });
  }

  updateGroups(dt) {
    for (let gi = this.groups.length - 1; gi >= 0; gi--) {
      const G = this.groups[gi];
      G.s += WALK_V * dt;
      const L = G.route.P.len;
      const place = (p, sAlong, lat, idx) => {
        if (p.dead) return;
        // mimo trasu = uvnitř budovy
        if (sAlong < 0 || sAlong > L) { p.mesh.visible = false; return; }
        const q = at(G.route.P, G.dir > 0 ? sAlong : L - sAlong);
        const h = G.dir > 0 ? q.h : q.h + Math.PI;
        const nx = Math.cos(h), nz = -Math.sin(h);
        const x = q.x + nx * lat, z = q.z + nz * lat;
        p.mesh.visible = true;
        p.mesh.position.set(x, this.city.ground(x, z), z);
        p.mesh.rotation.y = h;
        const far = Math.hypot(x - this.game.camera.position.x, z - this.game.camera.position.z) > 140;
        if (!far || (this.frame + idx) % 4 === 0) animateHuman(p.mesh, WALK_V, far ? dt * 4 : dt, 'walk');
      };
      G.people.forEach((p, i) => {
        const r = Math.floor(i / G.cols), c = i % G.cols;
        const jit = (hash(i + gi * 31) - 0.5) * 0.25;
        place(p, G.s - 1.5 - r * 0.95 + jit, (c - (G.cols - 1) / 2) * 0.78 + jit * 0.5, i);
      });
      place(G.guards[0], G.s, 1.9, 900);
      place(G.guards[1], G.s - 1.5 - G.rows * 0.95 - 0.8, -1.9, 901);
      if (G.s > G.len) { this.release(G.people); this.release(G.guards); this.groups.splice(gi, 1); }
    }
  }

  /**
   * Rozvrh výdeje jídla (skutečné sekundy od začátku okna). Skupiny z různých budov se nesmí potkat:
   * naráz smí jít jen ty, jejichž cesty nesdílí žádný úsek – např. M a L bočním vchodem souběžně
   * s oddíly jdoucími předním vchodem (proto má jídelna boční vstup, podle pamětníka).
   * Oddíly ze stejné budovy (K1–K4, K5–K8) smí jít těsně za sebou.
   */
  buildSchedule(sel = null) {
    const W = this.waves, walk = (w) => (w.P.len + w.tail) / WALK_V;
    const WAVES_ORDER = (wi) => wi; // rozestup odchodů podle pořadí v seznamu
    const use = (i) => !sel || sel.has(W[i].bldg);
    // úseky cest, které skupina používá (mřížka 3 m, vč. šířky trojstupu)
    const cells = W.map((w) => {
      const set = new Set(), { pts, cum, len } = w.P;
      for (let s2 = 0; s2 <= len; s2 += 1.5) {
        const q = at(w.P, s2), nx = Math.cos(q.h), nz = -Math.sin(q.h);
        for (const l of [-1.4, 0, 1.4]) set.add(`${Math.floor((q.x + nx * l) / 3)},${Math.floor((q.z + nz * l) / 3)}`);
      }
      void pts; void cum;
      return set;
    });
    const share = W.map((_, i) => W.map((__, j) => { for (const k of cells[i]) if (cells[j].has(k)) return true; return false; }));
    const tasks = [];
    // smí skupina wi používat cestu v čase [a0, a1]? Jiná budova se sdíleným úsekem = ne;
    // stejná budova smí jít za ní, jakmile čelo předchozí skupiny projde (odstup).
    // stejným směrem smí jít skupiny za sebou v proudu (jakmile konec předchozí projde dveřmi),
    // proti sobě (do jídelny × z jídelny) se skupiny z různých budov na společné cestě nepotkají
    // hromadný oběd (všechny budovy): všichni vyrazí hned, souběžné proudy jdou vedle sebe
    const mass = !sel || sel.size >= PrisonLife.BUILDINGS.length;
    const ok = (wi, kind, a0, a1) => tasks.every((t) => {
      if (t.ready >= a1 || a0 >= t.end || !share[t.wi][wi]) return true;
      if (mass && t.kind === 'out' && kind === 'out') return true;
      if (t.kind === kind) return a0 >= t.ready + (W[t.wi].tail + 4) / WALK_V;
      return W[t.wi].bldg === W[wi].bldg;
    });
    // dvě fronty (přední a boční vchod), každá má své pořadí odchodů
    const lanes = {}, lastOut = {};
    W.forEach((w, i) => { if (!use(i)) return; (lanes[w.lane] ||= []).push(i); lastOut[w.lane] = 0; });
    const backs = [];
    while (Object.values(lanes).some((q) => q.length) || backs.length) {
      const cands = [];
      for (const ln in lanes) for (const wi of lanes[ln]) cands.push({ wi, kind: 'out', earliest: mass ? WAVES_ORDER(wi) * 2.5 : 0 });
      for (const b2 of backs) cands.push({ wi: b2.wi, kind: 'back', earliest: b2.avail });
      let best = null;
      for (const c of cands) {
        const dur = walk(W[c.wi]) + (c.kind === 'out' ? READY_S : 0);
        const times = [c.earliest, ...tasks.flatMap((t) => [t.end, t.ready + (W[t.wi].tail + 4) / WALK_V]).filter((x) => x > c.earliest)].sort((x, y) => x - y);
        const t0 = times.find((x) => ok(c.wi, c.kind, x, x + dur));
        if (t0 == null) continue;
        if (!best || t0 < best.t0 - 1e-6 || (Math.abs(t0 - best.t0) < 1e-6 && c.kind === 'back')) best = { ...c, t0, dur };
      void lastOut;
      }
      const r0 = best.t0, start = best.kind === 'out' ? r0 + READY_S : r0;
      tasks.push({ wi: best.wi, kind: best.kind, ready: r0, start, end: r0 + best.dur });
      if (best.kind === 'out') { const ln = W[best.wi].lane; lanes[ln].splice(lanes[ln].indexOf(best.wi), 1); lastOut[ln] = r0; backs.push({ wi: best.wi, avail: r0 + best.dur + EAT_S }); }
      else backs.splice(backs.findIndex((x) => x.wi === best.wi), 1);
    }
    tasks.sort((x, y) => x.ready - y.ready);
    this.tasks = tasks;
    W.forEach((w, i) => (w.latOff = mass ? [0, 1.25, -1.25][i % 3] : 0));
    this.mealSeconds = tasks.length ? Math.max(...tasks.map((t) => t.end)) + 20 : 60;
    // zpomalení času u věznice tak, aby se všichni vystřídali v okně 2 herních hodin
    this.slow = Math.max(1, this.mealSeconds / (2 * 60));
  }

  /** Stav každé skupiny v čase h (počítá se z času – funguje i při příchodu uprostřed výdeje). */
  mealPlan(h) {
    const meal = MEALS.find((m) => h >= m.from && h < m.to + 0.1);
    const out = this.waves.map(() => ({ stage: 'none' }));
    if (!meal) { this.cancelledMeal = null; return out; }
    if (this.cancelledMeal === meal) return out; // výdej přerušila vzpoura
    const t = (h - meal.from) * 60 * this.slow;
    for (const k of this.tasks) {
      const w = this.waves[k.wi];
      // všichni vyjdou hned a stojí nastoupení v bloku před svou budovou, než na ně přijde řada
      if (k.kind === 'out' && t >= 0 && t < k.start) out[k.wi] = { stage: 'ready', s: 0, dir: 1, v: 0, meal };
      else if (t >= k.start && t < k.end) {
        out[k.wi] = k.kind === 'out'
          ? { stage: 'march', s: (t - k.start) * WALK_V, dir: 1, v: WALK_V, meal }
          : { stage: 'back', s: (t - k.start) * WALK_V, dir: -1, v: WALK_V, meal };
      }
    }
    return out;
  }

  updateMeals(dt, h, near) {
    const plan = near ? this.mealPlan(h) : this.waves.map(() => ({ stage: 'none' }));
    const anyMeal = near && plan.some((p) => p.stage !== 'none');
    const inMeal = near && MEALS.some((m) => h >= m.from && h < m.to + 0.1 && m !== this.cancelledMeal);
    this.game.timeSlow = inMeal ? this.slow : 1;
    if (inMeal && !this.mealOn) {
      const m = MEALS.find((q) => h >= q.from && h < q.to + 0.1);
      this.game.toast(`${m.name === 'oběd' ? 'Výdej obědů' : 'Výdej večeří'} – oddíly se střídají v jídelně (čas u věznice běží pomaleji)`);
    }
    this.mealOn = inMeal;
    const cam = this.game.camera.position;
    const C = this.mealCrowd, tnow = performance.now() / 1000;
    this.waves.forEach((w, wi) => {
      const st = plan[wi];
      if (st.stage === 'none') {
        if (w.shown) { for (let i = 0; i < w.size; i++) C.hide(w.off + i); w.shown = false; }
        if (w.guards) { this.release(w.guards); w.guards = null; }
        w.lastStage = 'none';
        return;
      }
      if (st.stage === 'march' && w.lastStage !== 'march') this.game.toast(`Na ${st.meal.name} jdou oddíly ${w.name}`);
      w.lastStage = st.stage;
      w.shown = true;
      if (!w.guards) w.guards = [this.person('guard'), this.person('guard')];
      const L = w.P.len;
      const pos = (sAlong, lat) => {
        const q = at(w.P, st.dir > 0 ? sAlong : L - sAlong);
        const hd = st.dir > 0 ? q.h : q.h + Math.PI, nx = Math.cos(hd), nz = -Math.sin(hd);
        return [q.x + nx * lat, q.z + nz * lat, hd];
      };
      const placeKit = (p, sAlong, idx, speed) => {
        if (p.dead) return;
        if (sAlong < 0 || sAlong > L) { p.mesh.visible = false; return; }
        const [x, z, hd] = pos(sAlong, 0);
        p.mesh.visible = true;
        p.mesh.position.set(x, this.city.ground(x, z), z);
        p.mesh.rotation.y = hd;
        const far = Math.hypot(x - cam.x, z - cam.z) > 140;
        if (!far || (this.frame + idx) % 4 === 0) animateHuman(p.mesh, speed, far ? dt * 4 : dt, speed > 0 ? 'walk' : 'idle');
      };
      // dozorce vede skupinu, druhý jde na konci
      placeKit(w.guards[0], Math.max(st.s, st.stage === 'ready' ? 0.5 : st.s), 900 + wi, st.v);
      const far = Math.hypot(at(w.P, Math.min(L, Math.max(0, st.s))).x - cam.x, at(w.P, Math.min(L, Math.max(0, st.s))).z - cam.z) > 220;
      if (!far || this.frame % 3 === wi % 3) {
        for (let i = 0; i < w.size; i++) {
          const ci = w.off + i;
          if (C.dead[ci]) continue;
          const r = Math.floor(i / COLS), c = i % COLS;
          const jit = (hash(i + wi * 31) - 0.5) * 0.22;
          const sA = st.s - 2 - r * ROW + jit;
          if (st.dir > 0 && sA < 0) { // ještě stojí v nástupním bloku
            const [bx, bz, bh] = w.block[i];
            C.set(ci, bx, this.city.ground(bx, bz), bz, bh, 0, 'walk', tnow);
            continue;
          }
          if (sA < 0 || sA > L) { C.hide(ci); continue; }
          const [x, z, hd] = pos(sA, (c - (COLS - 1) / 2) * 0.62 + jit * 0.3 + (w.latOff || 0) * (st.dir > 0 ? 1 : -1));
          C.set(ci, x, this.city.ground(x, z), z, hd, st.v, 'walk', tnow);
        }
      }
      placeKit(w.guards[1], st.s - 2 - w.rows * ROW - 0.9, 950 + wi, st.v);
    });
    C.commit();
    return anyMeal;
  }

  /** Postavy z davů jako cíle pro zbraně: zasažená postava zmizí z davu a na jejím místě se svalí plná postava. */
  crowdTargets() {
    const out = [];
    for (const C of [this.mealCrowd, this.riotCrowd, this.policeCrowd]) {
      if (!C) continue;
      for (let i = 0; i < C.cap; i++) {
        if (!C.vis[i] || C.dead[i]) continue;
        const pos = { x: C.x[i], y: C.y[i], z: C.z[i] };
        C._uid ||= Math.random().toString(36).slice(2);
        out.push({ key: `${C._uid}:${i}`, crowd: C, ci: i, mesh: { position: pos }, kill: (dir, boom) => {
          C.kill(i, dir, boom?.vel || null);
          if (C === this.riotCrowd && this.riot) this.riot.rs[i] = 4;
          this.onCrowdKill?.(C, i);
        } });
      }
    }
    return out;
  }

  /* ---------------- brány ---------------- */
  updateGates(dt) {
    const gates = this.game.world.prisonGates || [];
    if (!gates.length) return;
    const G = this.game;
    const movers = [];
    if (G.vehicle) movers.push([G.vehicle, 24]);
    else if (G.mode === 'foot') movers.push([G.player, 7]);
    for (const c of this.convoy) if (c.stage !== 'wait') movers.push([c.v, 28]);
    for (const c of G.police) movers.push([c.veh, 22]);
    for (const g of gates) {
      const want = movers.some(([v, r]) => Math.hypot(v.x - g.x, v.z - g.z) < r) ? 1 : 0;
      const prev = g.open;
      g.open += Math.sign(want - g.open) * Math.min(Math.abs(want - g.open), dt / 3.5); // ~3,5 s otevření
      if (g.open !== prev) {
        const t = g.open * g.open * (3 - 2 * g.open);
        g.leaf.position.set(g.closed[0] + (g.opened[0] - g.closed[0]) * t, g.closed[1], g.closed[2] + (g.opened[2] - g.closed[2]) * t);
      }
      g.fence.off = g.open > 0.8;
    }
  }

  /* ---------------- eskortní autobus ---------------- */
  makeEscortBus() {
    const m = makeBusMesh('VS');
    // vězeňská úprava: bílá s modrým pruhem, zatmavená okna s mřížemi, polep
    m.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      const c = o.material.color.getHexString();
      if (c === 'c8262b') { o.material = o.material.clone(); o.material.color.set(VS_BLUE); }
    });
    const u = m.userData;
    livery(m, u.L, u.W, 1.15, true);
    const barsC = document.createElement('canvas'); barsC.width = 64; barsC.height = 32;
    const g = barsC.getContext('2d');
    g.fillStyle = '#1b2026'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#8a9096'; for (let x = 2; x < 64; x += 8) g.fillRect(x, 0, 2, 32);
    const t = new THREE.CanvasTexture(barsC); t.wrapS = THREE.RepeatWrapping; t.repeat.set(10, 1); t.colorSpace = THREE.SRGBColorSpace;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(u.L - 2.2, 1.0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
      w.position.set(s * (u.W / 2 + 0.02), 2.05, -0.6);
      w.rotation.y = s * Math.PI / 2;
      m.add(w);
    }
    return m;
  }
  /** Úsek trasy P mezi staničeními s0 → s1 (i pozpátku), navzorkovaný po 2 m. */
  subPath(P, s0, s1) {
    const pts = [], dir = s1 >= s0 ? 1 : -1;
    for (let s2 = s0; dir > 0 ? s2 < s1 : s2 > s1; s2 += dir * 2) { const q = at(P, s2); pts.push([q.x, q.z]); }
    const q = at(P, s1); pts.push([q.x, q.z]);
    return prep(pts);
  }

  /* ---------------- konvoj: eskortní autobusy a hasiči ---------------- */
  /**
   * Skriptované vozidlo: wait → in (jede k místu stání, drží odstup) → park → back (couvá) → out / pryč.
   * Zadní vozidlo odjíždí první, ostatní čekají, až uvolní cestu.
   */
  addConvoy(mesh, opts) {
    const v = new Vehicle(mesh, 'trolley');
    v.label = opts.label;
    mesh.visible = false;
    this.scene.add(mesh);
    this.vehicles.push(v);
    const c = { v, stage: 'wait', s: 0, spd: 0, ...opts };
    const q = at(c.inP, 0);
    v.place(q.x, q.z, q.h);
    this.convoy.push(c);
    return c;
  }
  removeConvoy(c) {
    this.scene.remove(c.v.mesh);
    this.vehicles.splice(this.vehicles.indexOf(c.v), 1);
    this.convoy.splice(this.convoy.indexOf(c), 1);
  }

  updateConvoy(dt) {
    const F = this.game.focus() || this.game.player;
    for (const c of [...this.convoy]) {
      if (c.v.dead) { c.v.vx = c.v.vz = 0; continue; } // zničený vrak zůstane stát
      if (c.stage === 'wait') { c.delay -= dt; if (c.delay <= 0) { c.stage = 'in'; c.v.mesh.visible = true; } continue; }
      if (c.stage === 'park') {
        c.v.vx = c.v.vz = 0;
        c.wait -= dt;
        // odjíždí, až dostane pokyn, a vozidla stojící za ním už odjela
        const behindBusy = this.convoy.some((o) => o !== c && o.group === c.group && o.k > c.k && (o.stage !== 'out' && o.stage !== 'gone' && !(o.stage === 'back' && o.s > 22)));
        if (c.wait <= 0 && c.mayLeave() && !behindBusy) { c.stage = 'back'; c.s = 0; c.spd = 0; c.P = this.subPath(c.inP, c.stopS, c.backTo); }
        continue;
      }
      const back = c.stage === 'back';
      const P = c.stage === 'in' ? c.inP : back ? c.P : c.outP;
      const end = c.stage === 'in' ? c.stopS : P.len;
      const left = end - c.s;
      const here = at(P, c.s), ahead = at(P, c.s + 9);
      const turn = Math.abs(Math.atan2(Math.sin(ahead.h - here.h), Math.cos(ahead.h - here.h)));
      let want = back ? Math.min(3.2, Math.max(0.5, left / 3)) : c.cruise;
      if (!back && turn > 0.35) want = Math.min(want, c.fast ? 12 : 3.5);
      const gateD = Math.min(Math.hypot(here.x + 440, here.z - 1097), Math.hypot(here.x + 387, here.z - 1069.5), Math.hypot(here.x + 266, here.z - 1116), Math.hypot(here.x + 303, here.z - 1147));
      if (gateD < 14) want = Math.min(want, c.fast ? 13 : 2.8);
      if (c.stage === 'in' && left < 25) want = Math.min(want, Math.max(0, left / (c.fast ? 2 : 4)));
      // odstup od vozidla před sebou na stejné trase
      for (const o of this.convoy) {
        if (o === c || o.group !== c.group || o.stage !== c.stage || o.s <= c.s) continue;
        const gap = o.s - c.s - (c.fast ? 8.5 : 13);
        want = Math.min(want, gap < 1 ? 0 : gap / 2);
      }
      // nezajet do hráče ani do lidí
      const hd = back ? here.h + Math.PI : here.h, fx = Math.sin(hd), fz = Math.cos(hd);
      const blocked = (x, z) => { const dx = x - here.x, dz = z - here.z, al = dx * fx + dz * fz; return al > 0 && al < 13 && Math.abs(dx * fz - dz * fx) < 2.4; };
      if (blocked(F.x, F.z)) want = 0;
      if (!c.fast) for (const p of this.pool) if (p.used && p.mesh.visible && !p.dead && blocked(p.mesh.position.x, p.mesh.position.z)) { want = 0; break; }
      c.spd += Math.max(-(c.fast ? 14 : 6) * dt, Math.min((c.fast ? 9 : 2.5) * dt, want - c.spd));
      c.s += Math.max(0, c.spd) * dt;
      const q = at(P, c.s);
      c.v.place(q.x, q.z, back ? q.h + Math.PI : q.h);
      const sp = back ? -c.spd : c.spd;
      c.v.vx = Math.sin(q.h) * c.spd; c.v.vz = Math.cos(q.h) * c.spd;
      c.v.mesh.userData.wheels?.forEach((w) => (w.rotation.x += (sp * dt) / 0.5));
      c.tick?.(c, dt);
      if (c.stage === 'in' && left < 0.4 && c.spd < 0.2) { c.stage = 'park'; c.spd = 0; c.onPark?.(c); }
      else if (back && c.s >= P.len - 0.05) { if (c.outP) { c.stage = 'out'; c.s = 0; c.spd = 0; } else this.removeConvoy(c); }
      else if (c.stage === 'out' && c.s >= P.len - 0.05) this.removeConvoy(c);
    }
  }

  /** Eskortní autobusy: n autobusů v koloně, z každého vystoupí `size` eskortovaných a jdou do budovy K. */
  startEscort(n = 1, size = 10) {
    if (this.convoy.some((c) => c.group === 'bus')) { this.game.toast('Eskorta už je na cestě'); return; }
    for (let k = 0; k < n; k++) {
      this.addConvoy(this.makeEscortBus(), {
        group: 'bus', k, label: 'Eskortní autobus', delay: k * 7, cruise: 9,
        inP: this.busIn, stopS: this.busIn.len - k * 14.5, backTo: this.junctionS, outP: this.busOut,
        wait: BUS_WAIT * 60 + size * 0.6,
        mayLeave: () => true,
        onPark: (c) => {
          // výstup předními dveřmi (pravý bok) a chůze k budově K
          const q = at(c.inP, c.stopS), fx = Math.sin(q.h), fz = Math.cos(q.h), rx = -Math.cos(q.h), rz = Math.sin(q.h);
          const door = [q.x + fx * 3.5 + rx * 1.8, q.z + fz * 3.5 + rz * 1.8];
          const route = { size, P: prep([door, [door[0] + fx * 4, door[1] + fz * 4], [DOOR_K[0], DOOR_K[1] + 3], DOOR_K]) };
          this.startGroup(route, 1);
        },
      });
    }
    const F = this.game.focus() || this.game.player;
    if (Math.hypot(F.x - CENTER.x, F.z - CENTER.z) < 400) this.game.toast(n > 1 ? `Přijíždí ${n} eskortní autobusy` : 'Přijíždí eskortní autobus');
  }

  /* ---------------- hasičský zásah ---------------- */
  /** Budovy, které mohou hořet, a místo na cestě před nimi, kam přijedou hasiči. */
  static FIRE_TARGETS = [
    { n: 16, stop: [-181, 1060], name: 'budova K' }, // hoří jen budova K (pamětník)
  ];

  startFire() {
    if (this.fire) { this.game.toast('Hasiči už zasahují'); return; }
    const T = PrisonLife.FIRE_TARGETS[Math.floor(Math.random() * PrisonLife.FIRE_TARGETS.length)];
    const b = this.city.buildings.find((q) => q.pb?.n === T.n);
    if (!b) return;
    const W = this.game.weapons;
    const fire = { T, b, I: 1, flames: [], smoke: [], smokeT: 0, done: false, doneT: 0, group: new THREE.Group() };
    this.scene.add(fire.group);
    // plameny: na střeše a v oknech
    const inside = (x, z) => { let c2 = false; const p = b.p; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c2 = !c2; } return c2; };
    const mk = (x, y, z, sc) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.fireT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.set(x, y, z); sp.userData = { sc, ph: Math.random() * 6, y0: y };
      fire.group.add(sp); fire.flames.push(sp);
    };
    for (let i = 0, tries = 0; i < 16 && tries < 400; tries++) {
      const x = b.minx + Math.random() * (b.maxx - b.minx), z = b.minz + Math.random() * (b.maxz - b.minz);
      if (inside(x, z)) { mk(x, b.h + 0.8, z, 3.5 + Math.random() * 3); i++; }
    }
    const p = b.p, n = p.length / 2;
    for (let i = 0; i < 14; i++) {
      const e = Math.floor(Math.random() * n), t = Math.random();
      const ax = p[e * 2], az = p[e * 2 + 1], bx = p[((e + 1) % n) * 2], bz = p[((e + 1) % n) * 2 + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      const mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
      if (inside(mx + nx * 0.5, mz + nz * 0.5)) { nx = -nx; nz = -nz; }
      mk(mx + nx * 0.4, b.g + b.rh * (0.45 + Math.random() * 0.5), mz + nz * 0.4, 1.8 + Math.random() * 1.8); // hoří hlavně horní patra
    }
    this.makeWavers(fire, b);
    fire.light = new THREE.PointLight('#ff7a2a', 10, 70, 1.4);
    fire.light.position.set(b.cx, b.h + 4, b.cz);
    fire.group.add(fire.light);
    // voda z hasičských děl
    const max = 6000;
    fire.wPos = new Float32Array(max * 3).fill(-9999); fire.wVel = new Float32Array(max * 3); fire.wLife = new Float32Array(max); fire.wN = 0;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(fire.wPos, 3));
    fire.water = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d8f0ff', size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }));
    fire.water.frustumCulled = false;
    fire.group.add(fire.water);
    this.fire = fire;
    // 5 hasičských aut hlavní branou ke hořící budově
    const inP = prep([...this.pub, [-475, 1106], [-440, 1097], [-412, 1083], [-387, 1069.5], ...routeOnNet([-382, 1067], T.stop)]);
    const gateS = inP.cum[this.pub.length];
    for (let k = 0; k < 5; k++) {
      const mesh = makeKitCar('firetruck');
      const blue = new THREE.MeshBasicMaterial({ color: '#3d7bff' });
      const beacons = [-0.5, 0.5].map((x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.22), blue.clone()); m.position.set(x, (mesh.userData.top || 2.4) + 0.1, (mesh.userData.L || 6) * 0.3); mesh.add(m); return m; });
      this.addConvoy(mesh, {
        group: 'fire', k, label: 'Hasičské auto', delay: k * 3.2, cruise: 10,
        inP, stopS: inP.len - k * 12, backTo: Math.max(0, gateS - 45), outP: null, wait: 6,
        mayLeave: () => fire.done && fire.doneT > 10,
        tick: (c, dt) => {
          const on = Math.floor(performance.now() / 180 + k) % 2 === 0;
          beacons[0].material.color.set(on ? '#5a95ff' : '#0a1a40'); beacons[1].material.color.set(on ? '#0a1a40' : '#5a95ff');
        },
        onPark: () => {},
      });
    }
    this.game.toast(`🔥 Hoří ${T.name}! Přijíždí 5 hasičských aut.`);
    this.game.prisonFx?.announce('Pozor, požár v budově K. Všichni zůstaňte na celách. Přijíždějí hasiči.');
    this.game.audio?.blip?.(660, 0.4, 'sawtooth', 0.06, 220);
  }

  /**
   * Vězni v oknech budovy K: v každém okně (mimo nástavbu s klecí) jeden, za mřížemi, rychle mává.
   * Okna jsou na fasádě rozložena rovnoměrně – počet os = round(délka stěny / 3 m), v každém patře uprostřed.
   */
  /** Okna budovy: střed každé okenní osy v každém patře (fasáda: osy po ~3 m, okno uprostřed patra). */
  windowSlots(b) {
    if (b._wins) return b._wins;
    const lv = b.lv || Math.max(1, Math.round(b.rh / 3.1));
    const eave = b.roofM && !b.roofM.skel ? b.roofM.eave : b.h;
    const fh = Math.max(2.7, Math.min(4.8, (eave - b.g) / lv));
    const out = [];
    const p = b.p, n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], bz = p[((i + 1) % n) * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1.5) continue;
      let nx = (bz - az) / len, nz = -(bx - ax) / len;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      let inside = false;
      { const x = mx + nx * 0.5, z = mz + nz * 0.5; for (let a = 0, c2 = n - 1; a < n; c2 = a++) { const xi = p[a * 2], zi = p[a * 2 + 1], xj = p[c2 * 2], zj = p[c2 * 2 + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } }
      if (inside) { nx = -nx; nz = -nz; }
      const nb = Math.max(1, Math.round(len / 3.0));
      for (let k = 0; k < nb; k++) {
        const t = (k + 0.5) / nb, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        for (let f = 0; f < lv - 1; f++) out.push({ x, z, y: b.g + (f + 0.5) * fh, nx, nz, f, k, edge: i, col: `${i}:${k}` });
      }
    }
    b._wins = { list: out, fh, lv };
    return b._wins;
  }

  makeWavers(fire, b) {
    // mávající vězni na přeskáčku (cik cak), nepravidelně – ne v každém okně
    const W0 = this.windowSlots(b);
    const slots = W0.list.filter((w) => ((w.k + w.f) % 2 === 0 ? Math.random() < 0.72 : Math.random() < 0.1))
      .map((w) => ({ ...w, ph: Math.random() * 6, sp: 10 + Math.random() * 5, side: Math.random() < 0.5 ? -1 : 1 }));
    this._buildWavers(fire, slots);
  }
  _buildWavers(fire, slots) {
    const N = slots.length;
    const shirt = new THREE.MeshStandardMaterial({ color: UNIFORM.shirt, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: '#e8bf9c', roughness: 0.7 });
    const bar = new THREE.MeshStandardMaterial({ color: '#2e3134', metalness: 0.5, roughness: 0.5 });
    const armGeo = new THREE.BoxGeometry(0.11, 0.5, 0.11); armGeo.translate(0, 0.25, 0); // otáčí se v rameni
    const torso = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.5, 0.2), shirt, N);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), skin, N);
    const arm = new THREE.InstancedMesh(armGeo, shirt, N);
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1.3, 0.035), bar, N * 4);
    const o = new THREE.Object3D();
    slots.forEach((w, i) => {
      const ry = Math.atan2(w.nx, w.nz);
      o.rotation.set(0, ry, 0); o.scale.set(1, 1, 1);
      o.position.set(w.x + w.nx * 0.03, w.y - 0.32, w.z + w.nz * 0.03); o.updateMatrix(); torso.setMatrixAt(i, o.matrix);
      o.position.set(w.x + w.nx * 0.03, w.y + 0.08, w.z + w.nz * 0.03); o.updateMatrix(); head.setMatrixAt(i, o.matrix);
      const tx = -w.nz, tz = w.nx; // vodorovně podél stěny
      [-0.42, -0.14, 0.14, 0.42].forEach((d, k) => { o.rotation.set(0, ry, 0); o.position.set(w.x + w.nx * 0.12 + tx * d, w.y, w.z + w.nz * 0.12 + tz * d); o.updateMatrix(); bars.setMatrixAt(i * 4 + k, o.matrix); });
      w.sx = w.x + w.nx * 0.06 + tx * 0.26 * w.side; w.sz = w.z + w.nz * 0.06 + tz * 0.26 * w.side; w.sy = w.y - 0.1; w.ry = ry;
    });
    for (const m of [torso, head, bars, arm]) m.frustumCulled = false; // instance jsou rozeseté po celé budově
    for (const m of [torso, head, bars]) { m.instanceMatrix.needsUpdate = true; fire.group.add(m); }
    arm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fire.group.add(arm);
    fire.wavers = { slots, arm, o, meshes: [torso, head, bars, arm] };
  }
  updateWavers(f, t) {
    const W = f.wavers;
    if (!W) return;
    const { slots, arm, o } = W;
    // dokud hoří, mávají rychle; po uhašení pomaleji, pak přestanou
    if (f.done) { // po uhašení už v oknech nejsou
      if (!W.gone) { W.gone = true; for (const m of W.meshes) m.visible = false; }
      return;
    }
    const amp = 1;
    for (let i = 0; i < slots.length; i++) {
      const w = slots[i];
      // ruka nad hlavou kmitá ze strany na stranu (0 = svisle nahoru); po uhašení klesne dolů
      const ang = w.side * ((0.5 + Math.sin(t * w.sp + w.ph) * 0.45) * amp + 2.9 * (1 - amp));
      o.position.set(w.sx, w.sy, w.sz);
      o.rotation.set(0, w.ry, ang, 'YXZ');
      o.updateMatrix();
      arm.setMatrixAt(i, o.matrix);
    }
    arm.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- „koně“ na budově K ---------------- */
  /**
   * Co chvíli se v horním patře budovy K objeví vězeň a spouští po laně (koni) něco vězni
   * v okně pod sebou ve stejné okenní ose. Na konci lana je vždy něco přivázané (balíček, ponožka, igelitka…).
   * Pořadí: objeví se → spouští → spodní vězeň převezme → nahoře vytáhne prázdné lano → zmizí.
   */
  makeFigure(w, reach) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: UNIFORM.shirt, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: '#e8bf9c', roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.5, 0.2), shirt); torso.position.y = -0.32;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin); head.position.y = 0.08;
    const armGeo = new THREE.BoxGeometry(0.11, 0.55, 0.11); armGeo.translate(0, -0.27, 0);
    const arm = new THREE.Mesh(armGeo, shirt); arm.position.set(0.24, -0.12, 0.05);
    arm.rotation.x = reach; // natažená ruka z okna
    const barM = new THREE.MeshStandardMaterial({ color: '#2e3134', metalness: 0.5, roughness: 0.5 });
    for (const d of [-0.42, -0.14, 0.14, 0.42]) { const bb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.3, 0.035), barM); bb.position.set(d, 0, 0.09); g.add(bb); }
    g.add(torso, head, arm);
    g.position.set(w.x + w.nx * 0.04, w.y, w.z + w.nz * 0.04);
    g.rotation.y = Math.atan2(w.nx, w.nz);
    g.userData.arm = arm;
    this.scene.add(g);
    return g;
  }
  makeLoad() {
    const kinds = [
      () => new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: '#c9a36a', roughness: 0.9 })), // balíček
      () => new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.8 })), // bílý balíček
      () => new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), new THREE.MeshStandardMaterial({ color: ['#2b2b2b', '#7a1f1f', '#2f4f7a'][Math.floor(Math.random() * 3)], roughness: 0.9 })), // ponožka
      () => new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: ['#e9e9e4', '#1f1f1f', '#3b6b3b'][Math.floor(Math.random() * 3)], roughness: 0.4, transparent: true, opacity: 0.9 })), // igelitka
      () => new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#d33', roughness: 0.6 })), // krabička cigaret / tuba
    ];
    const m = kinds[Math.floor(Math.random() * kinds.length)]();
    m.scale.setScalar(1.7); // ať je to vidět
    m.castShadow = true;
    return m;
  }
  startHorse() {
    const b = this.city.buildings.find((q) => q.pb?.n === 16);
    if (!b) return;
    const { list } = this.windowSlots(b);
    const maxF = Math.max(...list.map((w) => w.f));
    const tops = list.filter((w) => w.f >= Math.max(2, maxF - 1) && !this.horses.some((h) => h.col === w.col));
    if (!tops.length) return;
    let up, down, type = 'down';
    if (Math.random() < 0.45) {
      // bokem: k sousednímu oknu ve stejném patře (kývnutím na provázku)
      const cand = list.filter((w) => !this.horses.some((h) => h.col === w.col));
      const pick = cand[Math.floor(Math.random() * cand.length)];
      const nb = pick ? list.filter((w) => w.edge === pick.edge && w.f === pick.f && Math.abs(w.k - pick.k) === 1 && !this.horses.some((h) => h.col === w.col)) : [];
      if (nb.length) { up = pick; down = nb[Math.floor(Math.random() * nb.length)]; type = 'side'; }
    }
    if (type === 'down') {
      up = tops[Math.floor(Math.random() * tops.length)];
      const belowAll = list.filter((w) => w.col === up.col && w.f < up.f);
      if (!belowAll.length) return;
      down = belowAll[Math.floor(Math.random() * belowAll.length)];
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 6), new THREE.MeshStandardMaterial({ color: '#f1ecdc', roughness: 0.8, emissive: new THREE.Color('#2a2820') }));
    rope.visible = false;
    const load = this.makeLoad();
    load.visible = false;
    this.scene.add(rope, load);
    const top = { x: up.x + up.nx * 0.55, y: up.y - 0.45, z: up.z + up.nz * 0.55 };
    this.horses.push({ col: up.col, up, down, top, rope, load, type, figUp: this.makeFigure(up, -1.2), figDown: type === 'side' ? this.makeFigure(down, -1.1) : null,
      stage: 'appear', t: 0, len: 0, target: type === 'side' ? 1 : top.y - (down.y - 0.25), ph: Math.random() * 6 });
  }
  updateHorses(dt, near) {
    this.horseT = (this.horseT ?? 3) - dt;
    if (near && this.horseT <= 0 && this.horses.length < 5) { this.horseT = 3 + Math.random() * 4; this.startHorse(); }
    const t = performance.now() / 1000;
    for (let i = this.horses.length - 1; i >= 0; i--) {
      const h = this.horses[i];
      h.t += dt;
      if (h.stage === 'appear' && h.t > 0.8) { h.stage = 'lower'; h.t = 0; h.rope.visible = h.load.visible = true; }
      else if (h.stage === 'lower' && h.type === 'side') {
        h.len = Math.min(1, h.len + dt * 0.4); // 0 → 1 = cesta k sousednímu oknu
        if (h.len >= 1) { h.stage = 'grab'; h.t = 0; }
      } else if (h.stage === 'lower') {
        h.len = Math.min(h.target, h.len + dt * 0.9);
        if (!h.figDown && h.len > h.target - 2.2) h.figDown = this.makeFigure(h.down, -0.9); // spodní vězeň se natahuje
        if (h.len >= h.target) { h.stage = 'grab'; h.t = 0; }
      } else if (h.stage === 'grab' && h.t > 1.6) { h.stage = 'pull'; h.t = 0; h.load.visible = false; } // převzato
      else if (h.stage === 'pull') {
        h.len = Math.max(0, h.len - dt * (h.type === 'side' ? 0.7 : 1.4));
        if (h.figDown && h.t > 1) { this.scene.remove(h.figDown); h.figDown = null; }
        if (h.len <= 0.05) { h.stage = 'leave'; h.t = 0; h.rope.visible = false; }
      } else if (h.stage === 'leave' && h.t > 0.6) {
        this.scene.remove(h.rope, h.load, h.figUp);
        if (h.figDown) this.scene.remove(h.figDown);
        this.horses.splice(i, 1);
        continue;
      }
      // lano s mírným kýváním, na konci náklad
      if (h.rope.visible) {
        let ex, ey, ez;
        if (h.type === 'side') {
          // kyvadlo: náklad se odhoupne od zdi a doletí k sousednímu oknu, s rozkmitem
          const p = h.len, e = p * p * (3 - 2 * p), sw = Math.sin(t * 6 + h.ph) * 0.25 * (1 - p) * (h.stage === 'lower' ? 1 : 0);
          const bx = h.down.x + h.down.nx * 0.55, bz = h.down.z + h.down.nz * 0.55;
          ex = h.top.x + (bx - h.top.x) * (e + sw) + h.up.nx * Math.sin(Math.PI * p) * 0.9;
          ez = h.top.z + (bz - h.top.z) * (e + sw) + h.up.nz * Math.sin(Math.PI * p) * 0.9;
          ey = h.top.y - 0.15 - Math.sin(Math.PI * p) * 1.1;
        } else {
          const sway = Math.sin(t * 1.7 + h.ph) * Math.min(0.25, h.len * 0.03);
          const tx = -h.up.nz, tz = h.up.nx;
          ex = h.top.x + tx * sway + h.up.nx * 0.05; ey = h.top.y - Math.max(0.05, h.len); ez = h.top.z + tz * sway + h.up.nz * 0.05;
        }
        const L = Math.max(0.05, Math.hypot(ex - h.top.x, ey - h.top.y, ez - h.top.z));
        h.rope.position.set((ex + h.top.x) / 2, (ey + h.top.y) / 2, (ez + h.top.z) / 2);
        h.rope.scale.set(1, L, 1);
        h.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(h.top.x - ex, h.top.y - ey, h.top.z - ez).normalize());
        h.load.position.set(ex, ey - 0.1, ez);
        h.load.rotation.y = t * 0.6 + h.ph;
      }
      // ruka horního vězně jemně popouští lano
      if (h.figUp) h.figUp.userData.arm.rotation.x = -1.2 + Math.sin(t * 6 + h.ph) * 0.08;
    }
  }

  updateFire(dt) {
    const f = this.fire;
    if (!f) return;
    const t = performance.now() / 1000;
    const W = this.game.weapons;
    // stříkající hasičská auta
    const sprayers = this.convoy.filter((c) => c.group === 'fire' && c.stage === 'park');
    if (!f.done) {
      f.I = Math.max(0, f.I - dt * 0.0045 * sprayers.length);
      if (f.I <= 0) { f.done = true; this.game.toast('Požár uhašen'); this.game.prisonFx?.wetGround(f.b); }
    } else f.doneT += dt;
    const I = f.I;
    for (const sp of f.flames) {
      const u = sp.userData, fl = 0.75 + 0.25 * Math.sin(t * 9 + u.ph) + 0.15 * Math.sin(t * 23 + u.ph * 2);
      const s2 = u.sc * I * fl;
      sp.visible = s2 > 0.15;
      sp.scale.set(s2, s2 * 1.35, s2);
      sp.position.y = u.y0 + s2 * 0.35;
      sp.material.rotation = Math.sin(t * 2 + u.ph) * 0.2;
    }
    f.light.intensity = 10 * I * (0.8 + 0.2 * Math.sin(t * 13));
    this.updateWavers(f, t);
    // kouř (po uhašení bílá pára, pak konec)
    f.smokeT -= dt;
    const smokeRate = f.done ? (f.doneT < 12 ? 0.25 : 0) : 0.06;
    if (smokeRate && f.smokeT <= 0 && f.flames.length) {
      f.smokeT = smokeRate;
      const src = f.flames[Math.floor(Math.random() * Math.min(16, f.flames.length))];
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.smokeT, transparent: true, depthWrite: false, opacity: 0.85, color: f.done ? '#e8e8e8' : '#3a3836' }));
      sm.position.copy(src.position);
      sm.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 1.2 + 0.8, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.2), life: 7 + Math.random() * 3, t: 0 };
      f.group.add(sm); f.smoke.push(sm);
    }
    for (let i = f.smoke.length - 1; i >= 0; i--) {
      const sm = f.smoke[i], u = sm.userData;
      u.t += dt;
      sm.position.addScaledVector(u.v, dt);
      const k = u.t / u.life, sc = 3 + 9 * k;
      sm.scale.set(sc, sc, sc);
      sm.material.opacity = 0.8 * (1 - k);
      if (u.t > u.life) { f.group.remove(sm); sm.material.dispose(); f.smoke.splice(i, 1); }
    }
    // voda: oblouk z děla na střeše auta k plamenům
    if (!f.done) for (const c of sprayers) {
      const v = c.v, fx = Math.sin(v.h), fz = Math.cos(v.h);
      const o = new THREE.Vector3(v.x + fx * 1.2, v.y + (v.mesh.userData.top || 2.4) + 0.6, v.z + fz * 1.2);
      // voda až nahoru: cíl na střeše / v horních patrech
      const high = f.flames.filter((q) => q.userData.y0 > f.b.g + f.b.rh * 0.6);
      const pool = high.length ? high : f.flames;
      const tg = pool[(c.k * 3 + Math.floor(t * 0.4)) % pool.length].position;
      for (let r = 0; r < Math.ceil(220 * dt); r++) {
        const T2 = 1.45 + Math.random() * 0.3, i = f.wN++ % f.wLife.length;
        const tx = tg.x + (Math.random() - 0.5) * 2, ty = tg.y + (Math.random() - 0.5) * 1.5, tz = tg.z + (Math.random() - 0.5) * 2;
        f.wPos.set([o.x, o.y, o.z], i * 3);
        f.wVel.set([(tx - o.x) / T2, (ty - o.y) / T2 + 4.9 * T2, (tz - o.z) / T2], i * 3);
        f.wLife[i] = T2;
      }
    }
    for (let i = 0; i < f.wLife.length; i++) {
      if (f.wLife[i] <= 0) continue;
      f.wLife[i] -= dt;
      const k = i * 3;
      f.wVel[k + 1] -= 9.8 * dt;
      f.wPos[k] += f.wVel[k] * dt; f.wPos[k + 1] += f.wVel[k + 1] * dt; f.wPos[k + 2] += f.wVel[k + 2] * dt;
      if (f.wLife[i] <= 0) f.wPos[k + 1] = -9999;
    }
    f.water.geometry.attributes.position.needsUpdate = true;
    // konec zásahu: hasiči odjeli a kouř se rozplynul
    if (f.done && f.doneT > 12 && !f.smoke.length && !this.convoy.some((c) => c.group === 'fire')) {
      this.scene.remove(f.group);
      this.fire = null;
    }
  }

  /* ---------------- policejní zásah při vzpouře ---------------- */
  makePoliceVan() {
    const m = makeKitCar('van', '#eef0f3');
    const u = m.userData, L = u.L || 4.8, W = u.W || 2, top = u.top || 2.3;
    const blue = new THREE.MeshStandardMaterial({ color: '#1d4fb8', roughness: 0.4 });
    const yel = new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.4 });
    const txt = new THREE.MeshStandardMaterial({ map: labelTexture('POLICIE', '#1d4fb8', '#ffffff', 512, 96), roughness: 0.5 });
    for (const sd of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.94, 0.22), blue); st.position.set(sd * (W / 2 + 0.03), 0.75, 0); st.rotation.y = sd * Math.PI / 2;
      const st2 = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.94, 0.1), yel); st2.position.set(sd * (W / 2 + 0.031), 0.6, 0); st2.rotation.y = sd * Math.PI / 2;
      const t = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.5, 0.36), txt); t.position.set(sd * (W / 2 + 0.032), 1.3, -0.3); t.rotation.y = sd * Math.PI / 2;
      m.add(st, st2, t);
    }
    const bar = [-0.45, 0.45].map((x) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.24), new THREE.MeshBasicMaterial({ color: '#3d7bff' })); b.position.set(x, top + 0.1, L * 0.28); m.add(b); return b; });
    m.userData.beacons = bar;
    return m;
  }

  startRiot() {
    if (this.riot) { this.game.toast('Policejní zásah už probíhá'); return; }
    this.goToPrison();
    // místa vzpoury: vnitřní cesty mezi budovami (ne přes hřiště)
    const spots = [];
    for (const line of NET) for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < L; d += 1.2) { const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L; if (x > -338 && x < -176) spots.push([x, z, -(bz - az) / L, (bx - ax) / L]); }
    }
    // bouří se vězni, kteří právě jdou na jídlo (přímo tam, kde jsou); jinak vězni na cestách
    const MC = this.mealCrowd, src = [];
    for (let i = 0; i < MC.cap && src.length < 1200; i++) if (MC.vis[i] && !MC.dead[i]) src.push([MC.x[i], MC.z[i], MC.h[i]]);
    const fromMeal = src.length >= 10;
    if (fromMeal) {
      this.cancelledMeal = MEALS.find((m) => this.game.hour >= m.from && this.game.hour < m.to + 0.1) || null;
      MC.hideAll();
      for (const w of this.waves) { w.shown = false; if (w.guards) { this.release(w.guards); w.guards = null; } }
    }
    const N = fromMeal ? src.length : 240;
    if (!this.riotCrowd) this.riotCrowd = new Crowd(this.scene, { capacity: 1200, shirt: UNIFORM.shirt, pants: UNIFORM.pants });
    if (!this.policeCrowd) this.policeCrowd = new Crowd(this.scene, { capacity: 200, shirt: '#1b2a44', pants: '#141c2c', helmet: '#0e1420', baton: true });
    const R = { N, phase: 'riot', t: 0, rs: new Uint8Array(N), home: [], tgt: [], vel: new Float32Array(N), by: new Int16Array(N).fill(-1), pol: [], vansArrived: 0, calmT: 0 };
    this.riotCrowd.dead.fill(0); this.policeCrowd.dead.fill(0);
    for (let i = 0; i < N; i++) {
      let x, z, h;
      if (fromMeal) [x, z, h] = src[i];
      else { const [sx, sz, nx, nz] = spots[Math.floor(Math.random() * spots.length)]; const l = (Math.random() - 0.5) * 3.2; x = sx + nx * l; z = sz + nz * l; h = Math.random() * 6.28; }
      R.home.push([x, z]); R.tgt.push([x, z]);
      this.riotCrowd.x[i] = x; this.riotCrowd.z[i] = z; this.riotCrowd.h[i] = h;
      R.vel[i] = 1 + Math.random() * 1.6;
    }
    for (let i = N; i < this.riotCrowd.cap; i++) this.riotCrowd.hide(i);
    this.riot = R;
    this.sirenOn(true);
    this.game.prisonFx?.announce('Pozor, vyhlašuji poplach. Všichni odsouzení okamžitě na zem. Zasahuje policie.');
    this.game.toast(fromMeal ? `🚨 Vězni na cestě k jídelně se bouří (${N})! Poplach – přijíždí policie.` : '🚨 Vězni se bouří! Vyhlášen poplach – přijíždí policie.');
    // po 5 s přijede 10 policejních dodávek hlavní branou
    // dodávky přijíždějí velmi rychle: krátký nájezd z ulice, vysoká rychlost, malé rozestupy
    const pubShort = this.pub.slice(-2);
    // až k jídelně: první dodávka zastaví u přední cesty k jídelně, ostatní za ní na hlavní cestě
    const inP = prep([...pubShort, [-475, 1106], [-440, 1097], [-412, 1083], [-387, 1069.5], ...routeOnNet([-382, 1067], [-290, 1060.6])]);
    const gateS = inP.cum[pubShort.length];
    for (let k = 0; k < 10; k++) {
      this.addConvoy(this.makePoliceVan(), {
        group: 'police', k, label: 'Policejní dodávka', delay: k * 0.45, cruise: 26, fast: true,
        inP, stopS: inP.len - k * 9.5, backTo: Math.max(0, gateS - 45), outP: null, wait: 2,
        mayLeave: () => R.phase === 'leaving' && !R.pol.some((o) => o.van === k && o.st !== 5),
        tick: (c) => {
          const on = Math.floor(performance.now() / 160 + k) % 2 === 0, bc = c.v.mesh.userData.beacons;
          bc[0].material.color.set(on ? '#5a95ff' : '#0a1a40'); bc[1].material.color.set(on ? '#0a1a40' : '#5a95ff');
        },
        onPark: (c) => {
          // z dodávky vyleze 20 policistů
          const v = c.v, fx = Math.sin(v.h), fz = Math.cos(v.h);
          for (let j = 0; j < 20; j++) {
            const id = R.pol.length;
            if (id >= 200) break;
            R.pol.push({ id, van: k, st: 1, x: v.x - fx * 3.4 + (Math.random() - 0.5) * 2, z: v.z - fz * 3.4 + (Math.random() - 0.5) * 2, h: v.h + Math.PI, tgt: -1, t: 0, home: [v.x - fx * 3.4, v.z - fz * 3.4], delay: j * 0.06 }); // vyskákají hned
          }
          R.vansArrived++;
          if (R.vansArrived === 1) this.game.toast('🚓 Policie zasahuje – pacifikuje vězně');
        },
      });
    }
  }

  updateRiot(dt) {
    const R = this.riot;
    if (!R) return;
    R.t += dt;
    const RC = this.riotCrowd, PC = this.policeCrowd, t = performance.now() / 1000, G = (x, z) => this.city.ground(x, z);
    // vězni: pobíhají, mávají, utíkají před policií; zmlácení leží
    let standing = 0;
    const vans = this.convoy.filter((c) => c.group === 'police' && c.stage === 'in').map((c) => c.v);
    for (let i = 0; i < R.N; i++) {
      if (RC.dead[i]) continue;
      let x = RC.x[i], z = RC.z[i];
      const st = R.rs[i];
      if (st === 3) { RC.set(i, x, G(x, z), z, RC.h[i], 0, 'lie', t); continue; }
      if (st === 2) { RC.set(i, x, G(x, z), z, RC.h[i], 0, 'kneel', t); continue; }
      standing++;
      let tx = R.tgt[i][0], tz = R.tgt[i][1], v = R.vel[i];
      const ob = R.by[i] >= 0 ? R.pol[R.by[i]] : null;
      const van = vans.find((vv) => Math.hypot(vv.x - x, vv.z - z) < 7);
      if (van) { const dx = x - van.x, dz = z - van.z, dd = Math.hypot(dx, dz) || 1, fx = Math.sin(van.h), fz = Math.cos(van.h), side = dx * fz - dz * fx >= 0 ? 1 : -1; tx = x + fz * side * 4 + (dx / dd); tz = z - fx * side * 4 + (dz / dd); v = 4.5; } // uskočí před dodávkou
      else if (ob && Math.hypot(ob.x - x, ob.z - z) < 6) { tx = x + (x - ob.x) * 3; tz = z + (z - ob.z) * 3; v = 3.1; } // útěk
      else if (Math.hypot(tx - x, tz - z) < 0.6 || Math.random() < dt * 0.3) {
        const [hx, hz] = R.home[i]; R.tgt[i] = [hx + (Math.random() - 0.5) * 9, hz + (Math.random() - 0.5) * 9];
      }
      const d = Math.hypot(tx - x, tz - z) || 1;
      x += ((tx - x) / d) * v * dt; z += ((tz - z) / d) * v * dt;
      const h = Math.atan2(tx - x, tz - z);
      RC.set(i, x, G(x, z) + Math.abs(Math.sin(t * 7 + i)) * 0.12, z, h, v, 'riot', t);
    }
    RC.commit();
    // policisté: vyběhnou z dodávky, každý si vezme nejbližšího vězně, dobíhá, bije obuškem, pak dalšího
    for (const o of R.pol) {
      if (o.delay > 0) { o.delay -= dt; continue; }
      if (PC.dead[o.id] && o.st !== 5) { if (o.tgt >= 0) { R.by[o.tgt] = -1; if (R.rs[o.tgt] === 2) R.rs[o.tgt] = 0; } o.st = 5; continue; } // zastřelený policista
      if (o.st === 5) { if (!PC.dead[o.id]) PC.hide(o.id); continue; }
      if (o.st === 1 && o.tgt < 0 && this.riotArmed) {
        // nejbližší stojící vzbouřenec (bez rezervace – střílí se na dálku)
        let best = -1, bd = 1e9;
        for (let i = 0; i < R.N; i++) { if (RC.dead[i] || R.rs[i] >= 2) continue; const d = (RC.x[i] - o.x) ** 2 + (RC.z[i] - o.z) ** 2; if (d < bd) { bd = d; best = i; } }
        if (best >= 0) o.tgt = best; else o.st = R.phase === 'leaving' ? 4 : 3;
      }
      if (o.st === 1 && o.tgt < 0) {
        let best = -1, bd = 1e9;
        for (let i = 0; i < R.N; i++) {
          if (RC.dead[i] || R.rs[i] >= 2 || R.by[i] >= 0) continue;
          const d = (RC.x[i] - o.x) ** 2 + (RC.z[i] - o.z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        if (best >= 0) { o.tgt = best; R.by[best] = o.id; }
        else if (R.phase === 'leaving') o.st = 4;
        else o.st = 3; // hlídá
      }
      if (o.st === 1) {
        const i = o.tgt;
        if (RC.dead[i] || R.rs[i] >= 3) { o.tgt = -1; continue; }
        const dx = RC.x[i] - o.x, dz = RC.z[i] - o.z, d = Math.hypot(dx, dz);
        if (this.riotArmed && d < 16 && d > 1.5) { o.st = 6; o.t = 1.2 + Math.random() * 0.8; o.fireT = 0; o.h = Math.atan2(dx, dz); }
        else if (d < 0.95) { o.st = 2; o.t = 1.6 + Math.random() * 1.2; R.rs[i] = 2; }
        else { o.x += (dx / d) * 4.6 * dt; o.z += (dz / d) * 4.6 * dt; o.h = Math.atan2(dx, dz); }
        PC.set(o.id, o.x, G(o.x, o.z), o.z, o.h, 4.6, 'walk', t);
      } else if (o.st === 2) {
        const i = o.tgt;
        o.t -= dt;
        if (Math.random() < dt * 2.5) this.game.audio?.thud?.();
        if (o.t <= 0) { R.rs[i] = 3; RC.h[i] = o.h; o.tgt = -1; o.st = 1; }
        PC.set(o.id, o.x, G(o.x, o.z), o.z, o.h, 0, 'beat', t);
      } else if (o.st === 6) {
        // dávka ze samopalu na cíl, občas granát do davu
        const i = o.tgt;
        o.t -= dt;
        if (i < 0 || RC.dead[i] || R.rs[i] >= 3 || o.t <= 0) { o.st = 1; o.tgt = -1; PC.set(o.id, o.x, G(o.x, o.z), o.z, o.h, 0, 'aim', t); continue; }
        const dx = RC.x[i] - o.x, dz = RC.z[i] - o.z, d = Math.hypot(dx, dz) || 1;
        o.h = Math.atan2(dx, dz);
        o.fireT -= dt;
        const W = this.game.weapons;
        if (o.fireT <= 0 && W) {
          o.fireT = 0.1 + Math.random() * 0.05;
          const fx = dx / d, fz = dz / d, gy = G(o.x, o.z);
          const a = new THREE.Vector3(o.x + fx * 0.7 + fz * 0.15, gy + 1.42, o.z + fz * 0.7 - fx * 0.15);
          const tb = new THREE.Vector3(RC.x[i] + (Math.random() - 0.5) * 0.6, G(RC.x[i], RC.z[i]) + 0.9 + Math.random() * 0.7, RC.z[i] + (Math.random() - 0.5) * 0.6);
          W.npcShot(a, tb);
          if (Math.random() < 0.3) {
            const dir = { x: fx, z: fz };
            W.bleed(tb, new THREE.Vector3(fx, 0, fz), 10);
            RC.kill(i, dir); R.rs[i] = 4;
          }
        }
        o.nade = (o.nade ?? 6 + Math.random() * 20) - dt;
        if (o.nade <= 0 && d > 8 && d < 26 && W && W.grenades.length < 5) {
          o.nade = 14 + Math.random() * 20;
          const gy = G(o.x, o.z);
          W.throwFrom({ x: o.x, y: gy + 1.8, z: o.z }, { x: RC.x[i], y: G(RC.x[i], RC.z[i]) + 0.2, z: RC.z[i] });
        }
        PC.set(o.id, o.x, G(o.x, o.z), o.z, o.h, 0, 'aim', t);
      } else if (o.st === 3) {
        PC.set(o.id, o.x, G(o.x, o.z), o.z, o.h, 0, 'walk', t);
        if (R.phase === 'leaving') o.st = 4;
      } else if (o.st === 4) {
        const dx = o.home[0] - o.x, dz = o.home[1] - o.z, d = Math.hypot(dx, dz);
        if (d < 0.8) { o.st = 5; PC.hide(o.id); continue; }
        o.x += (dx / d) * 3.2 * dt; o.z += (dz / d) * 3.2 * dt; o.h = Math.atan2(dx, dz);
        PC.set(o.id, o.x, G(o.x, o.z), o.z, o.h, 3.2, 'walk', t);
      }
    }
    PC.commit();
    // fáze zásahu
    if (R.phase === 'riot' && R.vansArrived) R.phase = 'fight';
    if (R.phase === 'fight' && standing === 0 && !R.pol.some((o) => o.st === 2 || o.st === 6)) { R.phase = 'calm'; R.calmT = 0; this.game.toast('✅ Pořádek obnoven'); }
    if (R.phase === 'calm') { R.calmT += dt; if (R.calmT > 12) R.phase = 'leaving'; }
    if (R.phase === 'leaving' && !this.convoy.some((c) => c.group === 'police')) {
      RC.hideAll(); PC.hideAll(); // mrtvá těla zůstanou ležet (zmizí po Restartu)
      this.riot = null;
      this.sirenOn(false);
    }
  }

  /** Poplachová siréna (kvílivý tón), vypíná se tlačítkem. */
  sirenOn(on) {
    const a = this.game.audio;
    if (on && !this.siren && a?.ctx) {
      const c = a.ctx, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 640;
      lfo.type = 'sine'; lfo.frequency.value = 0.32; lg.gain.value = 260;
      lfo.connect(lg).connect(o.frequency);
      g.gain.value = 0.07;
      o.connect(g).connect(a.master);
      o.start(); lfo.start();
      this.siren = { o, lfo, g };
    }
    if (!on && this.siren) { try { this.siren.o.stop(); this.siren.lfo.stop(); } catch { /* už stojí */ } this.siren = null; }
    if (on && !a?.ctx) this.siren = this.siren || { silent: true };
    if (this.sirenBtn) this.sirenBtn.style.display = this.siren ? '' : 'none';
  }

  /* ---------------- tlačítka (vlevo nahoře) ---------------- */
  makeButtons() {
    const css = document.createElement('style');
    css.textContent = `#prison-btns{position:absolute;left:16px;top:max(14px,env(safe-area-inset-top));display:flex;flex-wrap:wrap;gap:6px;max-width:min(560px,70vw);pointer-events:auto;z-index:25}
#prison-btns button{font:700 13px "Chakra Petch",sans-serif;color:#eef2f5;background:rgba(14,18,23,.78);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:7px 11px;cursor:pointer}
#prison-btns button:hover{background:rgba(57,255,20,.8);color:#04140b}
#prison-btns .pb-toggle{display:none;background:rgba(57,255,20,.85);color:#04140b}
@media (pointer: coarse),(max-width:700px){#prison-btns{flex-direction:column;align-items:flex-start;max-width:60vw;left:max(10px,env(safe-area-inset-left))}#prison-btns .pb-toggle{display:block}#prison-btns:not(.open) button:not(.pb-toggle){display:none}#prison-btns button{font-size:14px;padding:9px 13px}#prison-btns .pb-toggle{font-size:13px;padding:8px 10px}#meal-pick{top:60px;left:10px}}
.mission{top:max(60px,calc(env(safe-area-inset-top) + 48px)) !important}
#meal-pick{position:absolute;left:16px;top:96px;z-index:40;pointer-events:auto;background:rgba(14,18,23,.94);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;font:600 14px "Chakra Petch",sans-serif;color:#eef2f5;width:min(330px,86vw)}
#meal-pick h3{margin:0 0 8px;font-size:16px}
#meal-pick label{display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer}
#meal-pick label span{opacity:.6;font-weight:600;margin-left:auto;font-size:12.5px}
#meal-pick input{width:18px;height:18px;accent-color:#39ff14}
#meal-pick .row{display:flex;gap:6px;margin-top:10px}
#meal-pick .row button{font:700 13px "Chakra Petch",sans-serif;color:#eef2f5;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:7px 10px;cursor:pointer}
#meal-pick .row .go{background:#39ff14;color:#04140b;flex:1}`;
    document.head.appendChild(css);
    const box = document.createElement('div');
    box.id = 'prison-btns';
    const small = () => matchMedia('(pointer: coarse), (max-width: 700px)').matches;
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); b.blur(); if (small()) box.classList.remove('open'); }); box.appendChild(b); };
    const tg = document.createElement('button');
    tg.className = 'pb-toggle'; tg.textContent = '☰ Věznice';
    tg.addEventListener('click', (e) => { e.stopPropagation(); box.classList.toggle('open'); tg.textContent = box.classList.contains('open') ? '✕ Zavřít' : '☰ Věznice'; tg.blur(); });
    box.appendChild(tg);
    add('🍲 Spustit obědy', () => this.startMeal(0));
    add('🌙 Spustit večeře', () => this.startMeal(1));
    add('🚌 Eskortní autobusy', () => { this.goToPrison(); this.startEscort(2, 35); this.game.prisonFx?.announce('Pozor, přijíždí eskorta. Uvolněte vjezd.'); });
    add('🚒 Hasičský zásah', () => { this.goToPrison(); this.startFire(); });
    add('🚨 Policejní zásah', () => this.startRiot());
    add('🥊 MMA zápas', () => this.openMmaPicker(false));
    add('🎉 PARTY', () => this.game.party.start());
    add('🥊 MMA – hraj za vězně', () => { const M = this.game.mma; if (M.active) M.takeOver(); else this.openMmaPicker(true); });
    add('🔄 Restart', () => this.resetAll());
    add('📍 Teleport (T)', () => this.game.hud.openTeleport(this.game));
    add('🧭 Navigace (N)', () => this.game.hud.openNav(this.game));
    add('🚀 Jetpack (J)', () => this.game.jetpackPress());
    add('⛔ Jetpack vyp.', () => this.game.toggleJetpack(false));
    add(matchMedia('(pointer: coarse)').matches ? '❔ Ovládání' : '⌨️ Klávesy', () => { const c = document.getElementById('controls'); c.hidden = !c.hidden; if (!c.hidden && document.pointerLockElement) document.exitPointerLock(); });
    add('🔕 Vypnout sirénu', () => this.sirenOn(false));
    this.sirenBtn = box.lastChild;
    this.sirenBtn.style.display = 'none';
    (document.getElementById('hud') || document.body).appendChild(box);
  }
  /** Restart areálu: zmizí mrtvoly a krev, skončí vzpoura, požár, autobusy, koně i výdej jídla. */
  resetAll() {
    if (this.game.mma?.active) this.game.mma.finish();
    if (this.riot) this.riot = null;
    this.riotCrowd?.hideAll(true); this.policeCrowd?.hideAll(true);
    this.mealCrowd.hideAll(true);
    this.sirenOn(false);
    for (const c of [...this.convoy]) this.removeConvoy(c);
    if (this.fire) { this.scene.remove(this.fire.group); this.fire = null; }
    for (const h of this.horses) { this.scene.remove(h.rope, h.load, h.figUp); if (h.figDown) this.scene.remove(h.figDown); }
    this.horses.length = 0;
    const meal = MEALS.find((m) => this.game.hour >= m.from && this.game.hour < m.to + 0.1);
    this.cancelledMeal = meal || null;
    for (const w of this.waves) { w.shown = false; w.lastStage = 'none'; if (w.guards) { this.release(w.guards); w.guards = null; } }
    for (const G of this.groups) { this.release(G.people); this.release(G.guards); }
    this.groups.length = 0;
    this.game.weapons?.clearAll();
    for (const p of this.pool) { p.dead = false; p.used = false; p.mesh.visible = false; p.mesh.rotation.set(0, 0, 0); }
    this.game.timeSlow = 1;
    this.game.toast('🔄 Restart – areál je čistý, můžeš spustit cokoli znovu');
  }

  /** Když je hráč daleko, přenese ho do věznice (k budově C). */
  goToPrison() {
    const F = this.game.focus() || this.game.player;
    if (Math.hypot(F.x - CENTER.x, F.z - CENTER.z) < ACTIVE_R - 40) return;
    const l = this.game.landmarks.find((q) => q.prisonInside);
    if (l) this.game.teleport(l);
  }
  /** Výběr MMA zápasu: 1 na 1 nebo 3 na 3 (play = hned hraješ za vězně). */
  openMmaPicker(play) {
    document.getElementById('meal-pick')?.remove();
    const box = document.createElement('div');
    box.id = 'meal-pick';
    box.innerHTML = `<h3>🥊 ${play ? 'Hraj za vězně' : 'Večerní MMA zápas'}</h3><p style="margin:0 0 8px;font-size:12.5px;opacity:.75">${play ? 'Vyber zápas, ve kterém budeš vězeň.' : 'Bachaři proti vězňům. Za vězně můžeš kdykoli naskočit tlačítkem „MMA – hraj za vězně“.'}</p>`
      + '<div class="row"><button data-a="1" class="go">1 na 1</button><button data-a="3" class="go">3 na 3</button><button data-a="x">✕</button></div>';
    (document.getElementById('hud') || document.body).appendChild(box);
    if (document.pointerLockElement) document.exitPointerLock();
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = e.target.dataset?.a;
      if (a === 'x') box.remove();
      if (a === '1' || a === '3') { box.remove(); this.game.mma.start(a === '3' ? (play ? 'teamPlay' : 'team') : (play ? 'play' : 'watch')); }
    });
  }
  /** Tlačítko oběd / večeře: nejdřív výběr budov, které půjdou. */
  startMeal(i) { this.openMealPicker(i); }

  static BUILDINGS = [
    { b: 'K', label: 'Budova K', sub: 'K1–K8' },
    { b: 'M', label: 'Budova M', sub: 'M1, M2' },
    { b: '1', label: 'Budova L', sub: 'L4, L5' },
    { b: 'O', label: 'Budova O', sub: 'O' },
    { b: '5', label: 'Budova C', sub: 'C' },
    { b: '4', label: 'Budova 4', sub: 'Toxi, MON, B' },
    { b: '14', label: 'Budova 14', sub: '10V, 10Z' },
    { b: '13', label: 'Budova 13', sub: '11V, 11Z, 12, 12B' },
  ];
  openMealPicker(i) {
    document.getElementById('meal-pick')?.remove();
    if (!this.mealSel) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('hrej-vinarice-meal') || 'null'); } catch { /* bez úložiště */ }
      this.mealSel = new Set(saved || PrisonLife.BUILDINGS.map((x) => x.b));
    }
    const box = document.createElement('div');
    box.id = 'meal-pick';
    box.innerHTML = `<h3>${i === 0 ? '🍲 Kdo půjde na oběd?' : '🌙 Kdo půjde na večeři?'}</h3>`
      + PrisonLife.BUILDINGS.map((x) => `<label><input type="checkbox" value="${x.b}" ${this.mealSel.has(x.b) ? 'checked' : ''}> <b>${x.label}</b> <span>${x.sub}</span></label>`).join('')
      + `<div class="row"><button data-a="all">Vše</button><button data-a="none">Nic</button><button data-a="go" class="go">${i === 0 ? 'Spustit oběd' : 'Spustit večeři'}</button><button data-a="x">✕</button></div>`;
    (document.getElementById('hud') || document.body).appendChild(box);
    if (document.pointerLockElement) document.exitPointerLock();
    const boxes = [...box.querySelectorAll('input')];
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = e.target.dataset?.a;
      if (a === 'all') boxes.forEach((c) => (c.checked = true));
      if (a === 'none') boxes.forEach((c) => (c.checked = false));
      if (a === 'x') box.remove();
      if (a === 'go') {
        const sel = new Set(boxes.filter((c) => c.checked).map((c) => c.value));
        if (!sel.size) { this.game.toast('Vyber aspoň jednu budovu'); return; }
        box.remove();
        this.launchMeal(i, sel);
      }
    });
  }
  /** Spustí výdej jídla jen pro vybrané budovy (rozvrh a zpomalení času se přepočítají). */
  launchMeal(i, sel) {
    this.mealSel = sel;
    this.cancelledMeal = null;
    try { localStorage.setItem('hrej-vinarice-meal', JSON.stringify([...sel])); } catch { /* bez úložiště */ }
    this.buildSchedule(sel);
    const m = MEALS[i];
    this.goToPrison();
    this.game.timeFast = 1;
    this.game.setHour = m.from;
    const names = PrisonLife.BUILDINGS.filter((x) => sel.has(x.b)).map((x) => x.label.replace('Budova ', '')).join(', ');
    this.game.prisonFx?.announce(i === 0 ? 'Pozor, pozor. Nástup na oběd. Oddíly se připraví k odchodu do jídelny.' : 'Pozor, pozor. Nástup na večeři. Oddíly se připraví k odchodu do jídelny.');
    this.game.toast(`${i === 0 ? '🍲 Výdej obědů' : '🌙 Výdej večeří'} začíná – jdou budovy ${names}`);
  }

  update(dt) {
    if (!this.city.prison) return;
    this.frame = (this.frame || 0) + 1;
    const h = this.game.hour ?? 15;
    const F = this.game.focus() || this.game.ride?.veh || this.game.player;
    const near = F && Math.hypot(F.x - CENTER.x, F.z - CENTER.z) < ACTIVE_R;
    if (this.game.hourJumped) { this.lastHour = null; this.game.hourJumped = false; } // skok v čase nespouští autobusy
    this.updateMeals(dt, h, near);
    this.updateGates(dt);
    if (this.lastHour != null && near) {
      for (const t of BUS_TIMES) {
        const cr = this.lastHour <= h ? this.lastHour < t && t <= h : this.lastHour < t || t <= h;
        if (cr) this.startEscort(1, 10);
      }
    }
    this.lastHour = h;
    this.updateGroups(dt);
    this.updateConvoy(dt);
    this.updateFire(dt);
    this.updateRiot(dt);
    const G2 = (x, z) => this.city.surface(x, z), pool = (x, z) => this.game.weapons?.bloodPool(x, z, 0.9, 3);
    for (const C of [this.mealCrowd, this.riotCrowd, this.policeCrowd]) if (C?.corpseList.length) { C.updateCorpses(dt, G2, pool); C.commit(); }
    { const K = this.city.buildings.find((q) => q.pb?.n === 16); this.updateHorses(dt, !!K && Math.hypot(F.x - K.cx, F.z - K.cz) < 230); }
  }
}
