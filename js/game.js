import * as THREE from 'three';
import { clamp, lerp, rand, pick, wrapAngle, closestOnSeg, pointInPoly } from './util.js?v=20261128005025';
import { PrisonLife } from './prison.js?v=20261128005025';
import { Weapons } from './weapons.js?v=20261128005025';
import { MMA } from './mma.js?v=20261128005025';
import { Party } from './party.js?v=20261128005025';
import { PrisonFX } from './prisonfx.js?v=20261128005025';
import { Vehicle, makeKitCar, makeCarMesh, makePoliceMesh, makeBusMesh, makeHeliMesh, makeBikeMesh, makeJet, makeTank, makeHuman, animateHuman, steerTo } from './entities.js?v=20261128005025';

const ROAD_SPEED = { primary: 14, primary_link: 10, secondary: 13, secondary_link: 9, tertiary: 12, tertiary_link: 9, residential: 8.5, unclassified: 8.5, living_street: 5, busway: 9 };

/** Věznice: místo u budovy C (5) a kde stojí vozidla po teleportu (souřadnice světa). */
const PRISON_SPAWN = { x: -238, z: 1056.2, h: Math.PI, car: [-252, 1057.8, Math.PI / 2 + 0.12], bike: [-226.5, 1057.7, -Math.PI / 2 - 0.12], heli: [-259, 1069], jet: [-243.5, 1068.6, Math.PI / 2], tank: [-213, 1071.5, Math.PI / 2] }; // stíhačka na hřišti D1, tank na hřišti D2

export const LANDMARKS = [
  ['Vinařice - náměstí', 'Náměstí ve Vinařicích'],
  ['bývalý důl Mayrau', 'Hornický skanzen Mayrau'],
  ['Jáma Mayrau', 'Těžní věž jámy Mayrau'],
  ['Věznice Vinařice', 'Věznice Vinařice'],
  ['Vinařická hora', 'Vinařická hora (vyhlídka)'],
  ['V lomu', 'Lom na Vinařické hoře'],
  ['Vřesoviště', 'Vřesoviště'],
  ['bývalé koupaliště Vinařice', 'Bývalé koupaliště'],
  ['Vinařice, škola', 'Zastávka Vinařice, škola'],
  ['Vinařice, 7. ulice', 'Hornická kolonie (7. ulice)'],
  ['Jáma Ronna', 'Jáma Ronna'],
  ['Jáma Barré', 'Jáma Barré'],
  ['Sokolovna', 'Sokolovna Švermov'],
  ['Baník Švermov', 'Hřiště Baník Švermov'],
  ['nám. Mikoláše Alše', 'Nám. Mikoláše Alše'],
  ['Kladno, Hnidousy', 'Hnidousy'],
  ['Policie ČR OO Kladno venkov', 'Policie Kladno venkov'],
];

export class Game {
  constructor({ city, world, scene, camera, input, hud, audio, mobile }) {
    Object.assign(this, { city, world, scene, camera, input, hud, audio, mobile });
    this.time = 0;
    this.money = 500;
    this.wanted = 0;
    this.lastSeen = 0;
    this.mode = 'foot';
    this.camYaw = Math.PI; this.camPitch = 0.32; this.camDist = 7; this.camFar = false;
    this.lastMouse = -10;
    this.traffic = []; this.peds = []; this.police = []; this.trolleys = []; this.parked = [];
    this.mission = null; this.missionCooldown = 6;
    this.waypoint = null; this.gps = null; this.gpsT = 0;
    this.msgT = 0;
    this.landmarks = LANDMARKS.map(([key, label]) => {
      // věznice: teleport dovnitř k budově C (5), kde čeká auto, vrtulník a motorka
      if (key === 'Věznice Vinařice' && city.prison) return { label, x: PRISON_SPAWN.x, z: PRISON_SPAWN.z, prisonInside: true };
      const p = city.findByName(key);
      return p ? { label, x: p.x, z: p.z } : null;
    }).filter(Boolean);
    // věznice: zvlášť i hlavní brána zvenku
    if (city.prison && world.prisonGate) {
      const i = this.landmarks.findIndex((l) => l.label === 'Věznice Vinařice');
      this.landmarks.splice(i + 1, 0, { label: 'Věznice Vinařice – hlavní brána', x: world.prisonGate.x, z: world.prisonGate.z });
    }

    // hráč
    const pm = makeHuman({ name: 'Casual_Male', female: false, scale: 1, tint: false, shirt: '#c8452c', pants: '#253044', hair: '#3a2716', skin: '#f0c9a6' });
    scene.add(pm);
    this.player = { mesh: pm, x: 0, z: 0, y: 0, vy: 0, h: 0, hp: 100, speed: 0 };
    // start vždy na náměstí ve Vinařicích
    const sq = city.findByName('Vinařice - náměstí');
    this.column = sq ? { x: sq.x, z: sq.z } : { x: 0, z: 0 };
    const start = city.freeSpotNear(this.column.x + 6, this.column.z, 0, 4);
    this.player.x = start.x; this.player.z = start.z; this.player.y = city.ground(start.x, start.z);
    Vehicle.city = city;

    this.spawnParked();
    this.spawnTrolleys();
    this.spawnHeli();
    this.spawnLineup();
    this.prisonLife = new PrisonLife(this);
    this.weapons = new Weapons(this);
    try { this.prisonFx = new PrisonFX(this); } catch (e) { console.warn('vylepšení věznice', e); }
    this.mma = new MMA(this);
    this.party = new Party(this);
    // start uvnitř věznice Vinařice (u budovy C, vedle auto, motorka a vrtulník)
    if (city.prison) { this.arrivePrison(true); this.camFar = true; }
  }

  /* =============== SPAWN =============== */
  spawnParked() {
    // pár zaparkovaných aut kolem náměstí a po městě
    const pr = this.city.prison;
    const roads = this.city.roads.filter((r) => (r.t === 'residential' || r.t === 'service' || r.t === 'living_street')
      && !(pr && pointInPoly(r.cx, r.cz, pr))); // ve věznici neparkují civilní auta
    const near = roads.filter((r) => Math.hypot(r.cx, r.cz) < 350);
    const list = [...near.slice(0, 10), ...Array.from({ length: 50 }, () => pick(roads))];
    for (const r of list) {
      const p = r.p;
      const i = (Math.floor(Math.random() * (p.length / 2 - 1))) * 2;
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 6) continue;
      const t = rand(0.2, 0.8);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const off = r.w / 2 + 0.6;
      const x = ax + (bx - ax) * t + nx * off, z = az + (bz - az) * t + nz * off;
      if (this.city.collide(x, z, 1.4).hit || this.city.isWater(x, z)) continue;
      const v = new Vehicle(makeCarMesh());
      v.place(x, z, Math.atan2(bx - ax, bz - az));
      this.scene.add(v.mesh);
      this.parked.push(v);
    }
  }

  spawnTrolleys() {
    for (const line of this.city.lines) {
      const p = line.p;
      const cum = [0];
      for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
      const len = cum[cum.length - 1];
      const stops = [];
      for (const s of this.city.stops) {
        let best = 1e9, bs = 0;
        for (let i = 0; i < p.length - 2; i += 2) {
          const c = closestOnSeg(s.x, s.z, p[i], p[i + 1], p[i + 2], p[i + 3]);
          if (c.d2 < best) { best = c.d2; bs = cum[i / 2] + Math.sqrt((c.x - p[i]) ** 2 + (c.z - p[i + 1]) ** 2); }
        }
        if (best < 22 * 22 && !stops.some((o) => o.n === s.n || Math.abs(o.s - bs) < 60)) stops.push({ s: bs, n: s.n });
      }
      stops.sort((a, b) => a.s - b.s);
      line.cum = cum; line.len = len; line.stops = stops;
      for (let k = 0; k < 2; k++) {
        const v = new Vehicle(makeBusMesh(line.ref), 'trolley');
        this.scene.add(v.mesh);
        this.trolleys.push({ veh: v, line, s: (len * (k + 0.3)) / 2, dir: k === 0 ? 1 : -1, wait: 0, v: 0, atStop: null });
      }
    }
  }

  spawnHeli() {
    // vrtulník čeká na náměstí kousek od sloupu (volné místo o poloměru 8 m)
    const c = this.column;
    let pad = null;
    for (let i = 0; i < 300 && !pad; i++) {
      const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * (i < 150 ? 20 : 50);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (!this.city.collide(x, z, 8).hit && !this.city.isWater(x, z)) pad = { x, z };
    }
    pad = pad || this.world.helipad;
    if (!pad) return;
    const v = new Vehicle(makeHeliMesh(), 'heli');
    v.place(pad.x, pad.z, Math.atan2(c.x - pad.x, c.z - pad.z));
    v.vy = 0; v.rotor = 0;
    this.scene.add(v.mesh);
    this.heli = v;
  }

  /** Vozidla na výběr vedle sloupu (sportovní, dodávka, policie, hasiči). */
  spawnLineup() {
    const c = this.column;
    const list = [
      ['sport', () => makeKitCar('sedan-sports', '#c4161c'), 'car', 'Sportovní auto'],
      ['van', () => makeKitCar('van', '#f1f1ee'), 'car', 'Dodávka'],
      ['police', () => makePoliceMesh(), 'police', 'Policejní auto'],
      ['fire', () => makeKitCar('firetruck'), 'car', 'Hasičské auto'],
    ];
    const gap = 4.6;
    let best = null;
    for (let a = 0; a < 360 && !best; a += 10) {
      for (const dist of [11, 14, 18, 23]) {
        const r = (a * Math.PI) / 180, dx = Math.sin(r), dz = Math.cos(r);
        const ok = list.every((_, k) => {
          const o = (k - (list.length - 1) / 2) * gap;
          const x = c.x + dx * dist - dz * o, z = c.z + dz * dist + dx * o;
          return !this.city.collide(x, z, 3.2).hit && !this.city.isWater(x, z);
        });
        if (!ok) continue;
        // místo pro vrtulník hned za koncem řady (poloměr 7 m)
        const he = (list.length / 2) * gap + 7.5;
        const end = [1, -1].map((sd) => ({ x: c.x + dx * dist - dz * he * sd, z: c.z + dz * dist + dx * he * sd }))
          .find((q) => !this.city.collide(q.x, q.z, 7).hit && !this.city.isWater(q.x, q.z));
        if (end) { best = { dx, dz, dist, heli: end }; break; }
      }
    }
    best = best || { dx: 1, dz: 0, dist: 14 };
    if (this.heli && best.heli) {
      // vrtulník zaparkovaný vedle aut u sloupu
      this.heli.y = 0;
      this.heli.place(best.heli.x, best.heli.z, Math.atan2(-best.dx, -best.dz));
    }
    this.lineup = {};
    list.forEach(([key, make, kind, label], k) => {
      const o = (k - (list.length - 1) / 2) * gap;
      const x = c.x + best.dx * best.dist - best.dz * o, z = c.z + best.dz * best.dist + best.dx * o;
      const v = new Vehicle(make(), kind);
      v.place(x, z, Math.atan2(-best.dx, -best.dz)); // přídí ke sloupu
      v.owned = true; v.label = label;
      if (key === 'fire') { v.maxV = 34; v.accel = 8; }
      if (key === 'sport') { v.maxV = 58; v.accel = 16; }
      this.scene.add(v.mesh);
      this.parked.push(v);
      this.lineup[key] = v;
    });
    // kamera na začátku míří na připravená vozidla
    // hráč stojí před řadou (z druhé strany než sloup) a dívá se na vozidla i sloup
    const P = this.player;
    let lx = c.x + best.dx * best.dist, lz = c.z + best.dz * best.dist;
    if (best.heli) { lx = (lx * 2 + best.heli.x) / 3; lz = (lz * 2 + best.heli.z) / 3; }
    const s0 = this.city.freeSpotNear(lx + best.dx * 26, lz + best.dz * 26, 0, 3);
    Object.assign(P, { x: s0.x, z: s0.z, y: this.city.surface(s0.x, s0.z) });
    P.h = Math.atan2(lx - P.x, lz - P.z);
    this.camYaw = P.h;
    this.camFar = true;
  }

  /** R = restart: zpět na náměstí, všechna vozidla znovu připravená. */
  restart() {
    if (this.mma?.active) this.mma.finish();
    this.resetTo(this.column);
    for (const v of Object.values(this.lineup || {})) {
      this.scene.remove(v.mesh);
      const i = this.parked.indexOf(v);
      if (i >= 0) this.parked.splice(i, 1);
    }
    if (this.heli) { this.heli.rotor = 0; this.heli.vx = this.heli.vz = this.heli.vy = 0; this.heli.dead = false; this.heli.hp = 100; this.heli.mesh.rotation.x = this.heli.mesh.rotation.z = 0; }
    this.player.mesh.visible = true;
    this.spawnLineup();
    if (this.city.prison) { this.arrivePrison(true); this.hud.bigMsg('RESTART', 'Zpátky ve věznici Vinařice'); }
    else this.hud.bigMsg('RESTART', 'Zpátky na náměstí ve Vinařicích');
  }

  /** Volba ze startovní nabídky. */
  startWith(key) {
    if (key === 'foot' || this.mode !== 'foot') return;
    if (key === 'heli' && this.heli) {
      Object.assign(this.player, { x: this.heli.x, z: this.heli.z, y: this.heli.y });
      this.enter(this.heli, 'heli');
      this.toast('Mezerník stoupat · Shift klesat · W/S vpřed/vzad · A/D otáčení');
      return;
    }
    const v = this.lineup?.[key];
    if (!v || v.dead) return;
    const i = this.parked.indexOf(v);
    if (i >= 0) this.parked.splice(i, 1);
    Object.assign(this.player, { x: v.x, z: v.z, y: v.y });
    this.enter(v, 'car');
    this.toast(v.label + ' – šťastnou cestu!');
  }

  linePoint(line, s, dir, off) {
    const p = line.p, cum = line.cum;
    s = clamp(s, 0, line.len);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    const ax = p[lo * 2], az = p[lo * 2 + 1], bx = p[hi * 2], bz = p[hi * 2 + 1];
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    dx = (dx / l) * dir; dz = (dz / l) * dir;
    return { x: ax + (bx - ax) * t - dz * off, z: az + (bz - az) * t + dx * off, dx, dz };
  }

  spawnTrafficCar() {
    const P = this.focus();
    const n = this.city.nearestNode(P.x + rand(-240, 240), P.z + rand(-240, 240), 120);
    const outs = n ? n.out.filter((o) => !o.e.navOnly) : [];
    if (!outs.length) return;
    const d = Math.hypot(n.x - P.x, n.z - P.z);
    if (d < 90 || d > 280) return;
    const o = pick(outs);
    const v = new Vehicle(makeCarMesh());
    const ai = { veh: v, e: o.e, dir: o.dir, s: 0, spd: 0, stuck: 0, bumped: 0 };
    this.placeAI(ai, 1);
    this.scene.add(v.mesh);
    v.driver = 'ai';
    this.traffic.push(ai);
  }

  placeAI(ai, snap) {
    const e = ai.e;
    const lane = e.oneway ? 0 : Math.min(2, e.w * 0.24);
    const pt = this.city.edgePoint(e, ai.s, ai.dir, lane, this._pt || (this._pt = {}));
    const v = ai.veh;
    const h = Math.atan2(pt.dx, pt.dz);
    if (snap) { v.x = pt.x; v.z = pt.z; v.h = h; }
    else {
      v.x = pt.x; v.z = pt.z;
      v.h += wrapAngle(h - v.h) * 0.25;
    }
    v.vx = pt.dx * ai.spd; v.vz = pt.dz * ai.spd; v.v = ai.spd;
    v.sync();
  }

  spawnPed() {
    const P = this.focus();
    const x = P.x + rand(-140, 140), z = P.z + rand(-140, 140);
    if (Math.hypot(x - P.x, z - P.z) < 40) return;
    const r = this.city.nearestRoad(x, z, 40, (r) => r.walk || ['residential', 'tertiary', 'secondary', 'primary', 'living_street'].includes(r.t));
    if (!r) return;
    const side = r.road.walk ? 0 : (r.road.w / 2 + 1.6) * (Math.random() < 0.5 ? 1 : -1);
    const mesh = makeHuman();
    this.scene.add(mesh);
    const seg = r.seg;
    this.peds.push({ mesh, road: r.road, i: seg.i, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, side, x: r.x, z: r.z, h: 0, state: 'walk', timer: 0, speed: rand(1.1, 1.6) });
  }

  spawnPolice() {
    const P = this.focus();
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2;
      const n = this.city.nearestNode(P.x + Math.cos(a) * 170, P.z + Math.sin(a) * 170, 100);
      if (!n) continue;
      const v = new Vehicle(makePoliceMesh(), 'police');
      const o = n.out[0];
      const nx = o ? (o.dir > 0 ? o.e.pts[2] : o.e.pts[o.e.pts.length - 4]) : n.x;
      const nz = o ? (o.dir > 0 ? o.e.pts[3] : o.e.pts[o.e.pts.length - 3]) : n.z;
      v.place(n.x, n.z, Math.atan2(nx - n.x, nz - n.z));
      v.driver = 'police';
      this.scene.add(v.mesh);
      this.police.push({ veh: v, path: null, repath: 0, stuck: 0, reverse: 0 });
      return;
    }
  }

  /* =============== POMOCNÉ =============== */
  focus() {
    if (this.mode === 'foot') return this.player;
    if (this.mode === 'mma') return this.mma.focusPt();
    return this.vehicle;
  }
  allVehicles() {
    const a = [...this.parked, ...this.traffic.map((t) => t.veh), ...this.police.map((p) => p.veh), ...this.trolleys.map((t) => t.veh), ...(this.prisonLife?.vehicles || [])];
    if (this.heli) a.push(this.heli);
    return a;
  }
  toast(text, t = 3) { this.hud.toast(text); this.msgT = t; }
  addWanted(n) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.lastSeen = this.time;
    if (this.wanted > before && before === 0) this.toast('Policie po tobě jde!');
  }

  /* =============== HLAVNÍ UPDATE =============== */
  update(dt) {
    this.time += dt;
    const inp = this.input;
    // kamera myší
    if (inp.mouseDX || inp.mouseDY) {
      this.camYaw -= inp.mouseDX * 0.0028;
      this.camPitch = clamp(this.camPitch + inp.mouseDY * 0.002, -0.15, 1.2);
      this.lastMouse = this.time;
    }
    if (inp.hit('KeyC')) this.camFar = !this.camFar;
    if (inp.hit('KeyH') && this.mode === 'car') this.audio.horn();

    if (this.mode === 'foot') this.updateFoot(dt);
    else if (this.mode === 'car') this.updateCar(dt);
    else if (this.mode === 'heli') this.updateHeli(dt);
    else if (this.mode === 'jet') this.updateJet(dt);
    else if (this.mode === 'trolley') this.updateRide(dt);
    else if (this.mode === 'mma') this.mma.update(dt);
    if (this.mma?.active && this.mode !== 'mma') this.mma.update(dt);
    if (this.party?.active) this.party.update(dt); // divák: zápas běží, hráč se volně pohybuje

    this.updateFallingAircraft(dt);
    if (inp.hit('KeyE')) this.handleE();

    this.updateTraffic(dt);
    this.updateTrolleys(dt);
    this.prisonLife?.update(dt);
    this.weapons?.update(dt);
    this.updatePeds(dt);
    this.updatePolice(dt);
    this.updateHeliIdle(dt);
    this.vehicleCollisions();
    this.updateMission(dt);
    this.updateCamera(dt);
    this.updateAudio();

    if (this.msgT > 0 && (this.msgT -= dt) <= 0) this.hud.toast(null);
  }

  /* --------------- pěšky --------------- */
  updateFoot(dt) {
    const P = this.player, inp = this.input, city = this.city;
    const a = inp.axes();
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    let mx = fx * a.y + rx * a.x, mz = fz * a.y + rz * a.x;
    const ml = Math.hypot(mx, mz);
    const sprint = inp.down('ShiftLeft', 'ShiftRight');
    const swimming = !city.buildingAt(P.x, P.z) && city.isWater(P.x, P.z);
    let sp = ml > 0.05 ? (sprint ? 8.2 : 4.3) * Math.min(1, ml) : 0;
    if (swimming) sp *= 0.45;
    const flying = this.jetpack && P.y > city.roofHeight(P.x, P.z, P.y + 0.6) + 0.3;
    if (flying && ml > 0.05) sp = (this.jetTurbo ? 65 : 13) * Math.min(1, ml); // jetpack: ve vzduchu rychleji, TURBO 5× (Shift tu znamená klesání)
    if (this.chute && ml > 0.05) sp = Math.max(sp, 7 * Math.min(1, ml)); // padák: klouzavý let
    if (ml > 0.05) {
      mx /= ml; mz /= ml;
      P.h += wrapAngle(Math.atan2(mx, mz) - P.h) * Math.min(1, dt * 12);
    }
    let nx = P.x + mx * sp * dt, nz = P.z + mz * sp * dt;
    const c = city.collide(nx, nz, 0.38, P.y + 0.4);
    P.x = c.x; P.z = c.z;
    P.speed = sp;
    // skok + gravitace (lze stát na střeše)
    const g2 = city.roofHeight(P.x, P.z, P.y + 0.6);
    const floor = swimming ? city.ground(P.x, P.z) - 0.9 : g2;
    let thrust = false;
    if (this.jetpack) {
      // jetpack: mezerník = tah nahoru, X = klesání, bez ovládání zůstane viset ve vzduchu
      thrust = inp.down('Space');
      const down = inp.down('KeyX', 'ControlLeft') || (sprint && P.y > floor + 0.3); // ve vzduchu Shift = dolů
      if (thrust) P.vy = Math.min(this.jetTurbo ? 30 : 9, P.vy + (this.jetTurbo ? 70 : 26) * dt);
      else if (down) P.vy = Math.max(-14, P.vy - 20 * dt);
      else if (P.y > floor + 0.3 && !this.chute && !this.freefall) P.vy *= Math.max(0, 1 - dt * 4); // bez ovládání visí ve vzduchu (klesá se jen na X)
      else if (this.chute || this.freefall) P.vy -= 15 * dt; // s padákem / po výskoku se padá (padák brzdí níže)
      else P.vy -= 15 * dt;
      if (P.y > floor + 160) P.vy = Math.min(P.vy, 0);
    } else {
      if (inp.hit('Space') && P.y <= floor + 0.05 && !swimming) P.vy = 5.2;
      P.vy -= 15 * dt;
    }
    if (this.chute && P.vy < -4.2) P.vy += (-4.2 - P.vy) * Math.min(1, dt * 3); // otevřený padák brzdí pád až na ~4 m/s
    P.y += P.vy * dt;
    if (P.y <= floor) {
      if (P.vy < -14 && !this.jetpack) this.hurt((-P.vy - 14) * 6, 'pád');
      P.y = floor; P.vy = Math.max(0, thrust ? P.vy : 0);
      if (this.chute) this.closeChute(true);
      this.freefall = false;
    }
    this.updateChute(dt);
    this.updateJetpackFx(dt, thrust);
    // srážka s vozidly
    for (const v of this.allVehicles()) {
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      if (d < v.L / 2 + 0.4 && v.y < P.y + 1.5 && P.y < v.y + 2) {
        const s = Math.hypot(v.vx, v.vz);
        const ux = (P.x - v.x) / (d || 1), uz = (P.z - v.z) / (d || 1);
        if (s > 5 && v.kind !== 'heli') {
          this.hurt(s * 2.2, 'auto');
          P.x += ux * 2; P.z += uz * 2;
        } else { P.x += ux * 0.15; P.z += uz * 0.15; }
      }
    }
    const m = P.mesh;
    m.visible = true;
    m.position.set(P.x, P.y, P.z);
    m.rotation.y = P.h;
    this.punchT = Math.max(0, (this.punchT || 0) - dt);
    animateHuman(m, sp, dt, P.y > floor + 0.25 ? 'air' : this.punchT > 0 ? 'punch' : null);
    this.hud.setSpeed(null);
  }

  /**
   * P: ze stíhačky / vrtulníku katapultáž, ve vzduchu otevře (nebo odhodí) padák.
   * Vrací false, když P nemá co dělat (pak P mění denní dobu).
   */
  handleP() {
    if (this.mode === 'jet' || this.mode === 'heli') { this.eject(); return true; }
    if (this.mode !== 'foot') return false;
    const P = this.player, floor = this.city.roofHeight(P.x, P.z, P.y + 0.6);
    if (this.chute) { this.closeChute(false); this.toast('Padák odhozen'); return true; }
    if (P.y > floor + 2.5) { this.openChute(); return true; }
    return false;
  }
  eject() {
    const v = this.vehicle, P = this.player;
    this.vehicle = null; this.mode = 'foot';
    v.driver = null;
    if (v.kind === 'jet') v.mesh.userData.flameM.opacity = 0;
    v.falling = true; v.fallVy = v.kind === 'jet' ? Math.sin(v.pitch || 0) * (v.spd || 0) : (v.vy || 0);
    Object.assign(P, { x: v.x, z: v.z, y: v.y + 3.5, vy: 7, h: v.h });
    this.freefall = true; // po výskoku se vždy padá, i se zapnutým jetpackem
    P.mesh.visible = true;
    this.audio.door(); this.audio?.blip?.(220, 0.3, 'sawtooth', 0.08, 300);
    this.toast('Katapultáž! P = otevřít padák · J = jetpack');
  }
  openChute() {
    if (!this.chuteMesh) {
      const g = new THREE.Group();
      const c = document.createElement('canvas'); c.width = 256; c.height = 32;
      const cg = c.getContext('2d');
      for (let k = 0; k < 8; k++) { cg.fillStyle = k % 2 ? '#f4f1ea' : '#e2541b'; cg.fillRect(k * 32, 0, 32, 32); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
      canopy.scale.set(1, 0.42, 0.75); canopy.position.y = 6.2; canopy.castShadow = true;
      g.add(canopy);
      const lineM = new THREE.MeshBasicMaterial({ color: '#333333' });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2, top = new THREE.Vector3(Math.cos(a) * 3.3, 6.0, Math.sin(a) * 3.3 * 0.75), bot = new THREE.Vector3(0, 1.5, 0);
        const d = top.clone().sub(bot), L = d.length();
        const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, L, 3), lineM);
        ln.position.copy(bot).addScaledVector(d, 0.5);
        ln.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        g.add(ln);
      }
      this.chuteMesh = g;
      this.scene.add(g);
    }
    this.chute = true; this.chuteT = 0;
    this.chuteMesh.visible = true;
    this.audio?.noise?.(0.4, 0.4, 900);
    this.toast('🪂 Padák otevřen · WASD řízení · J = jetpack · P = odhodit');
  }
  closeChute(landed) {
    this.chute = false;
    if (this.chuteMesh) this.chuteMesh.visible = false;
    if (landed) this.toast('Přistál jsi');
  }
  updateChute(dt) {
    if (!this.chute || !this.chuteMesh) return;
    const P = this.player, m = this.chuteMesh;
    this.chuteT += dt;
    const k = Math.min(1, 0.15 + this.chuteT * 1.6);
    m.scale.set(k, k, k);
    m.position.set(P.x, P.y, P.z);
    m.rotation.y = P.h;
    m.rotation.z = Math.sin(this.time * 1.3) * 0.05;
  }
  /** Stíhačka / vrtulník bez pilota padá k zemi a po dopadu vybuchne (pak se objeví zpátky ve věznici). */
  updateFallingAircraft(dt) {
    for (const v of [this.jet, this.heli]) {
      if (!v || !v.falling || v.driver === 'player') continue;
      const city = this.city;
      v.fallVy = (v.fallVy || 0) - 9.8 * dt;
      if (v.kind === 'jet') {
        v.spd = Math.max(0, (v.spd || 0) - 6 * dt);
        v.pitch = Math.max(-1.2, (v.pitch || 0) - dt * 0.4);
        const [fx, fz] = v.forward();
        v.x += fx * v.spd * dt; v.z += fz * v.spd * dt;
        v.roll = (v.roll || 0) + dt * 0.8;
        v.mesh.rotation.set(-v.pitch, v.h, v.roll, 'YXZ');
      } else {
        v.x += (v.vx || 0) * dt; v.z += (v.vz || 0) * dt; v.vx *= 0.99; v.vz *= 0.99;
        v.mesh.rotation.z += dt * 0.6; v.rotor = Math.max(0, (v.rotor || 0) - dt * 0.3);
      }
      v.y += v.fallVy * dt;
      v.mesh.position.set(v.x, v.y, v.z);
      const gy = city.roofHeight(v.x, v.z, v.y + 2);
      const hit = city.collide(v.x, v.z, 3, v.y + 1).hit;
      if (v.y <= gy || hit) {
        v.falling = false;
        this.weapons?.explode(new THREE.Vector3(v.x, Math.max(v.y, gy) + 1, v.z), true);
        this.audio.crash(40);
        if (v.kind === 'jet') this.placePrisonJet();
        else {
          const S = PRISON_SPAWN;
          v.vx = v.vz = v.vy = 0; v.rotor = 0; v.dead = false; v.hp = 100;
          v.place(S.heli[0], S.heli[1], Math.PI / 2); v.y = city.ground(S.heli[0], S.heli[1]);
          v.mesh.rotation.set(0, v.h, 0); v.mesh.position.set(v.x, v.y, v.z);
        }
        this.toast(v.kind === 'jet' ? 'Stíhačka se zřítila · nová čeká na hřišti' : 'Vrtulník se zřítil · nový čeká ve věznici');
      }
    }
  }

  /** Jetpack (raketový batoh): zapnout / vypnout. */
  toggleJetpack(on = !this.jetpack) {
    this.jetpack = on;
    if (on && !this.jetMesh) {
      const g = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial({ color: '#8e979e', metalness: 0.8, roughness: 0.3 });
      const red = new THREE.MeshStandardMaterial({ color: '#c4161c', roughness: 0.4 });
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.16), red); pack.position.set(0, 1.25, -0.22);
      g.add(pack);
      this.jetFlames = [];
      for (const sx of [-0.13, 0.13]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12), metal); tank.position.set(sx, 1.22, -0.33);
        const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 12), metal); noz.position.set(sx, 0.89, -0.33);
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.weapons?.fireT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        fl.position.set(sx, 0.62, -0.33);
        g.add(tank, noz, fl);
        this.jetFlames.push(fl);
      }
      this.player.mesh.add(g);
      this.jetMesh = g;
    }
    if (this.jetMesh) this.jetMesh.visible = on;
    if (!on) this.jetTurbo = false;
    this.toast(on ? '🚀 Jetpack zapnutý · J znovu = TURBO · podržet J = vypnout · mezerník nahoru, Shift dolů' : 'Jetpack vypnutý');
  }
  /** J krátce: vypnuto → zapnuto → TURBO (5×) → zapnuto …; podržet J = vypnout. */
  jetpackPress() {
    if (!this.jetpack) { this.toggleJetpack(true); return; }
    this.jetTurbo = !this.jetTurbo;
    this.toast(this.jetTurbo ? '🔥 Jetpack TURBO – 5× rychleji! (J = normální · podržet J = vypnout)' : '🚀 Jetpack normální rychlost (J = TURBO · podržet J = vypnout)');
  }
  updateJetpackFx(dt, thrust) {
    if (!this.jetMesh || !this.jetpack) return;
    const t = performance.now() / 1000;
    for (const [i, fl] of this.jetFlames.entries()) {
      const s = thrust ? 0.55 + 0.15 * Math.sin(t * 40 + i) : 0.18 + 0.04 * Math.sin(t * 30 + i);
      fl.scale.set(s * 0.7, s * 1.6, s);
      fl.position.y = 0.85 - s * 0.6;
    }
    if (thrust) {
      this.jetSnd = (this.jetSnd || 0) - dt;
      if (this.jetSnd <= 0) { this.jetSnd = 0.12; this.audio?.noise?.(0.14, 0.07, 420); }
    }
  }

  hurt(n, why) {
    const P = this.player;
    P.hp = Math.max(0, P.hp - n);
    if (P.hp <= 0) this.wasted();
  }

  wasted() {
    const fn = this.column;
    this.hud.bigMsg('ZÁCHRANKA', 'Kladenská nemocnice tě dala dohromady · −300 Kč');
    this.money = Math.max(0, this.money - 300);
    this.resetTo(fn);
  }

  busted() {
    // při vysoké hledanosti to končí za zdmi vinařické věznice
    const jail = this.wanted >= 4;
    const ps = (jail ? this.world.prisonGate : this.city.findByName('Policie ČR OO Kladno venkov')) || this.column;
    const fine = Math.min(this.money, 200 + this.wanted * 300);
    this.hud.bigMsg('ZATČEN', `Pokuta ${fine.toLocaleString('cs-CZ')} Kč · ${jail ? 'Věznice Vinařice – propuštěn před bránou' : 'Obvodní oddělení Kladno venkov'}`);
    this.money -= fine;
    this.resetTo(ps);
  }

  resetTo(p) {
    if (this.vehicle) { this.vehicle.driver = null; if (this.vehicle.kind !== 'heli' && this.vehicle.kind !== 'trolley' && !this.parked.includes(this.vehicle)) this.parked.push(this.vehicle); }
    this.vehicle = null; this.mode = 'foot';
    this.ride = null;
    const s = this.city.freeSpotNear(p.x, p.z, 5, 60);
    Object.assign(this.player, { x: s.x, z: s.z, y: this.city.surface(s.x, s.z), vy: 0, hp: 100 });
    this.wanted = 0;
    for (const c of this.police) this.scene.remove(c.veh.mesh);
    this.police = [];
    this.mission = null; this.hud.mission(null);
  }

  /* --------------- nastoupit / vystoupit --------------- */
  handleE() {
    const P = this.player;
    if (this.mode === 'foot') {
      // autobus v zastávce
      for (const t of this.trolleys) {
        const v = t.veh;
        if (t.wait > 0.5 && Math.hypot(v.x - P.x, v.z - P.z) < 9) {
          this.mode = 'trolley'; this.ride = t; P.mesh.visible = false;
          this.toast(`Nastoupil jsi do autobusu ${t.line.ref}. E = vystoupit v zastávce`);
          return;
        }
      }
      if (this.jet && Math.hypot(this.jet.x - P.x, this.jet.z - P.z) < 8 && Math.abs(this.jet.y - P.y) < 3) {
        this.enter(this.jet, 'jet');
        this.toast('Stíhačka: W plyn · A/D zatáčení · mezerník/Shift výška · 1 kanón · 2 rakety · F nebo myš = palba');
        return;
      }
      if (this.heli && Math.hypot(this.heli.x - P.x, this.heli.z - P.z) < 7 && Math.abs(this.heli.y - P.y) < 3) {
        this.enter(this.heli, 'heli');
        this.toast('Mezerník stoupat · Shift klesat · W/S vpřed/vzad · A/D otáčení');
        return;
      }
      let best = null, bd = 4.2;
      for (const v of [...this.parked, ...this.traffic.map((t) => t.veh), ...this.police.map((p) => p.veh)]) {
        const d = Math.hypot(v.x - P.x, v.z - P.z);
        if (d < bd && !v.dead) { bd = d; best = v; }
      }
      if (!best) return;
      const ai = this.traffic.find((t) => t.veh === best);
      if (ai) {
        this.traffic.splice(this.traffic.indexOf(ai), 1);
        // vyhozený řidič utíká
        const m = makeHuman();
        this.scene.add(m);
        this.peds.push({ mesh: m, x: best.x + 2, z: best.z, h: 0, state: 'flee', timer: 6, speed: 6, road: null });
        const copsNear = this.police.some((c) => Math.hypot(c.veh.x - P.x, c.veh.z - P.z) < 80);
        if (copsNear || Math.random() < 0.55) this.addWanted(1);
        this.toast('Ukradl jsi auto!');
      }
      const pol = this.police.find((c) => c.veh === best);
      if (pol) { this.police.splice(this.police.indexOf(pol), 1); this.addWanted(2); this.toast('Ukradl jsi policejní auto!'); }
      const pk = this.parked.indexOf(best);
      if (pk >= 0) {
        this.parked.splice(pk, 1);
        if (!best.owned && Math.random() < 0.25) { this.addWanted(1); this.toast('Spustil se alarm!'); }
      }
      this.enter(best, 'car');
    } else if (this.mode === 'car' || this.mode === 'heli' || this.mode === 'jet') {
      const v = this.vehicle;
      if (this.mode === 'jet' && (v.y - this.city.roofHeight(v.x, v.z) > 0.8 || v.spd > 6)) { this.toast('Nejdřív přistaň a zastav'); return; }
      if (this.mode === 'car' && Math.hypot(v.vx, v.vz) > 6) { this.toast('Nejdřív zpomal'); return; }
      if (this.mode === 'heli' && (v.y - this.city.roofHeight(v.x, v.z) > 0.8 || Math.hypot(v.vx, v.vz) > 3)) { this.toast('Nejdřív přistaň'); return; }
      this.exit();
    } else if (this.mode === 'trolley') {
      const t = this.ride;
      if (t.wait <= 0 && t.v > 1) { this.toast('Vystoupit můžeš jen v zastávce'); return; }
      const [fx, fz] = t.veh.forward();
      const s = this.city.collide(t.veh.x + fz * 3, t.veh.z - fx * 3, 0.4);
      Object.assign(this.player, { x: s.x, z: s.z, y: this.city.surface(s.x, s.z), vy: 0 });
      this.mode = 'foot'; this.ride = null;
    }
  }

  enter(v, mode) {
    this.vehicle = v; v.driver = 'player'; this.mode = mode;
    this.player.mesh.visible = false;
    this.audio.door();
    if (mode === 'car') this.camYaw = v.h;
  }

  exit() {
    const v = this.vehicle;
    const [fx, fz] = v.forward();
    const ex = v.x + fz * (v.W / 2 + 0.9), ez = v.z - fx * (v.W / 2 + 0.9);
    const y = v.y;
    const c = this.city.collide(ex, ez, 0.4, y + 0.4);
    Object.assign(this.player, { x: c.x, z: c.z, y, vy: 0, h: v.h });
    v.driver = null;
    if (v.kind !== 'heli' && v.kind !== 'jet') { v.vx = v.vz = v.v = 0; this.parked.push(v); }
    if (v.kind === 'jet') { v.spd = 0; v.mesh.userData.flameM.opacity = 0; }
    this.vehicle = null; this.mode = 'foot';
    this.audio.door();
  }

  /* --------------- řízení --------------- */
  updateCar(dt) {
    const v = this.vehicle, inp = this.input;
    const a = inp.axes();
    // tank prorazí zdi i ploty, rychlé auto jen plot (dřív než se srazí)
    if (v.isTank && a.y) this.weapons?.ramBreak(v, true, Math.sign(a.y));
    else if (Math.hypot(v.vx, v.vz) > 14) this.weapons?.ramBreak(v, false);
    v.drive(dt, { throttle: a.y, steer: -a.x, hand: inp.down('Space') }, this.city);
    this.weapons?.runOver(v);
    if (v.isTank) { this.updateTankGun(v, dt); this.weapons?.crushCars(v); if (Math.abs(v.v) > 0.3) { this.weapons?.crushProps(v); this.weapons?.ramBreak(v, true); } }
    if (v.lastImpact > 6) this.audio.crash(v.lastImpact);
    if (v.dead && v.sink > 2.4) {
      this.toast('Auto skončilo v řece!');
      this.exit();
      const s = this.city.freeSpotNear(this.player.x, this.player.z, 5, 50);
      Object.assign(this.player, { x: s.x, z: s.z, y: this.city.surface(s.x, s.z) });
      return;
    }
    if (v.kind === 'police') {
      const on = Math.floor(this.time * 6) % 2;
      v.mesh.userData.lights[0].emissiveIntensity = on ? 3 : 0.2;
      v.mesh.userData.lights[1].emissiveIntensity = on ? 0.2 : 3;
    }
    this.hud.setSpeed(v.speedKmh(), v.hp);
  }

  /* --------------- vrtulník --------------- */
  updateHeli(dt) {
    const v = this.vehicle, inp = this.input, city = this.city;
    const a = inp.axes();
    v.rotor = Math.min(1, v.rotor + dt * 0.5);
    const lift = v.rotor >= 1;
    const up = (inp.down('Space') ? 1 : 0) - (inp.down('ShiftLeft', 'ShiftRight') ? 1 : 0);
    v.h -= a.x * 1.4 * dt;
    const [fx, fz] = v.forward();
    if (lift) {
      v.vx += fx * a.y * 16 * dt; v.vz += fz * a.y * 16 * dt;
      v.vy += (up * 10 - v.vy * 1.5) * dt;
    } else v.vy = 0;
    v.vx *= 1 - dt * 0.5; v.vz *= 1 - dt * 0.5;
    const sp = Math.hypot(v.vx, v.vz);
    if (sp > 55) { v.vx *= 55 / sp; v.vz *= 55 / sp; }
    let nx = v.x + v.vx * dt, nz = v.z + v.vz * dt;
    v.y = clamp(v.y + v.vy * dt, 0, 460);
    const c = city.collide(nx, nz, 4.5, v.y);
    if (c.hit) {
      const imp = Math.abs(v.vx * c.nx + v.vz * c.nz);
      if (imp > 8) { this.hurt(imp, 'vrtulník'); this.audio.crash(imp); }
      v.vx *= -0.3; v.vz *= -0.3;
    }
    v.x = c.x; v.z = c.z;
    const ground = city.roofHeight(v.x, v.z);
    if (v.y < ground) { v.y = ground; v.vy = Math.max(0, v.vy); }
    v.sync();
    v.mesh.rotation.x = clamp(a.y * 0.18 * (lift ? 1 : 0), -0.25, 0.25);
    v.mesh.rotation.order = 'YXZ';
    v.mesh.rotation.z = a.x * 0.15;
    this.player.x = v.x; this.player.z = v.z; this.player.y = v.y;
    this.hud.setSpeed(sp * 3.6, null, Math.round(v.y));
  }

  updateHeliIdle(dt) {
    const v = this.heli;
    if (!v) return;
    if (this.vehicle !== v) {
      v.rotor = Math.max(0, (v.rotor || 0) - dt * 0.2);
      const g = this.city.roofHeight(v.x, v.z);
      if (v.y > g) v.y = Math.max(g, v.y - dt * 6);
      v.sync();
    }
    v.mesh.userData.rotor.rotation.y += (v.rotor || 0) * dt * 28;
    v.mesh.userData.tail.rotation.x += (v.rotor || 0) * dt * 40;
  }

  /* --------------- autobus jako cestující --------------- */
  updateRide(dt) {
    const t = this.ride;
    this.player.x = t.veh.x; this.player.z = t.veh.z; this.player.y = t.veh.y;
    const next = this.nextStop(t);
    this.hud.setSpeed(t.v * 3.6);
    this.hud.mission(`<b>Autobus ${t.line.ref}</b><small>${t.wait > 0 ? 'Zastávka: ' + (t.atStop || '') : 'Příští zastávka: ' + (next ? next.n : 'konečná')}</small>`);
  }

  nextStop(t) {
    const st = t.line.stops;
    if (t.dir > 0) return st.find((s) => s.s > t.s + 1);
    for (let i = st.length - 1; i >= 0; i--) if (st[i].s < t.s - 1) return st[i];
    return null;
  }

  updateTrolleys(dt) {
    const vehs = [...this.traffic.map((x) => x.veh), this.vehicle].filter(Boolean);
    for (const t of this.trolleys) {
      const v = t.veh;
      if (t.wait > 0) {
        t.wait -= dt; t.v = 0;
        if (t.wait <= 0) t.s += t.dir * 2;
      } else {
        const next = this.nextStop(t);
        const dist = next ? Math.abs(next.s - t.s) : (t.dir > 0 ? t.line.len - t.s : t.s);
        let target = 11.5;
        if (dist < 40) target = Math.max(2, dist * 0.32);
        // vozidlo před námi
        const [fx, fz] = v.forward();
        for (const o of vehs) {
          const dx = o.x - v.x, dz = o.z - v.z;
          const ahead = dx * fx + dz * fz;
          if (ahead > 0 && ahead < 16 && Math.abs(dx * fz - dz * fx) < 2.4) target = Math.min(target, (ahead - 9) * 0.8);
        }
        target = Math.max(0, target);
        t.v += clamp(target - t.v, -6 * dt, 2.2 * dt);
        t.s += t.v * t.dir * dt;
        if (next && dist < 1.2) { t.wait = 9; t.atStop = next.n; t.s = next.s; }
        if (t.s >= t.line.len) { t.s = t.line.len; t.dir = -1; t.wait = 14; t.atStop = 'konečná'; }
        if (t.s <= 0) { t.s = 0; t.dir = 1; t.wait = 14; t.atStop = 'konečná'; }
      }
      const pt = this.linePoint(t.line, t.s, t.dir, 2.0);
      const h = Math.atan2(pt.dx, pt.dz);
      const first = v.x === 0 && v.z === 0;
      v.x = pt.x; v.z = pt.z;
      v.h = first ? h : v.h + wrapAngle(h - v.h) * Math.min(1, dt * 4);
      v.vx = pt.dx * t.v; v.vz = pt.dz * t.v; v.v = t.v;
      v.sync();
    }
  }

  /* --------------- provoz --------------- */
  updateTraffic(dt) {
    const target = this.mobile ? 28 : 55;
    if (this.traffic.length < target) for (let i = 0; i < 3; i++) this.spawnTrafficCar();
    const F = this.focus();
    const obstacles = [...this.traffic.map((t) => t.veh), ...this.trolleys.map((t) => t.veh), ...this.police.map((p) => p.veh), ...this.parked, ...(this.prisonLife?.vehicles || [])];
    if (this.vehicle) obstacles.push(this.vehicle);
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const ai = this.traffic[i], v = ai.veh;
      if (Math.hypot(v.x - F.x, v.z - F.z) > 340) { this.scene.remove(v.mesh); this.traffic.splice(i, 1); continue; }
      if (v.dead) { this.traffic.splice(i, 1); this.parked.push(v); continue; }
      if (ai.bumped > 0) { ai.bumped -= dt; ai.spd = 0; continue; }
      let want = ROAD_SPEED[ai.e.road.t] || 8;
      const [fx, fz] = v.forward();
      // překážky před autem
      for (const o of obstacles) {
        if (o === v) continue;
        const dx = o.x - v.x, dz = o.z - v.z;
        if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 16 && Math.abs(dx * fz - dz * fx) < 2.2) want = Math.min(want, Math.max(0, (ahead - 6) * 0.9));
      }
      if (this.mode === 'foot') {
        const P = this.player, dx = P.x - v.x, dz = P.z - v.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 10 && Math.abs(dx * fz - dz * fx) < 2) want = 0;
      }
      ai.spd += clamp(want - ai.spd, -9 * dt, 3 * dt);
      ai.s += ai.spd * dt;
      if (ai.spd < 0.3 && want === 0) { ai.stuck += dt; if (ai.stuck > 12) { ai.stuck = 0; ai.bumped = 0; } } else ai.stuck = 0;
      while (ai.s >= ai.e.len) {
        ai.s -= ai.e.len;
        const node = ai.dir > 0 ? ai.e.b : ai.e.a;
        let opts = node.out.filter((o) => o.e !== ai.e && (!o.e.navOnly || ai.veh.driver === 'police'));
        if (!opts.length) opts = node.out.filter((o) => !o.e.navOnly);
        if (!opts.length) { ai.dir = -ai.dir; break; }
        // preferovat jízdu rovně
        const hx = fx, hz = fz;
        let best = null, bw = -1e9;
        for (const o of opts) {
          const pts = o.e.pts;
          const sx = o.dir > 0 ? pts[2] - pts[0] : pts[pts.length - 4] - pts[pts.length - 2];
          const sz = o.dir > 0 ? pts[3] - pts[1] : pts[pts.length - 3] - pts[pts.length - 1];
          const l = Math.hypot(sx, sz) || 1;
          const w = (sx * hx + sz * hz) / l + Math.random() * 1.2 + (ROAD_SPEED[o.e.road.t] || 8) * 0.03;
          if (w > bw) { bw = w; best = o; }
        }
        ai.e = best.e; ai.dir = best.dir;
      }
      this.placeAI(ai, 0);
    }
  }

  /* --------------- chodci --------------- */
  updatePeds(dt) {
    const target = this.mobile ? 22 : 45;
    if (this.peds.length < target) this.spawnPed();
    const F = this.focus();
    const movers = [...this.traffic.map((t) => t.veh), ...this.police.map((p) => p.veh), ...this.trolleys.map((t) => t.veh), ...(this.prisonLife?.vehicles || [])];
    if (this.vehicle && this.vehicle.kind !== 'heli') movers.push(this.vehicle);
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (Math.hypot(p.x - F.x, p.z - F.z) > 190) { this.scene.remove(p.mesh); this.peds.splice(i, 1); continue; }
      // srážka
      if (p.state !== 'down') {
        for (const v of movers) {
          const d = Math.hypot(v.x - p.x, v.z - p.z);
          const s = Math.hypot(v.vx, v.vz);
          if (d < v.L / 2 + 0.3 && s > 4) {
            p.state = 'down'; p.timer = 8;
            p.vx = v.vx * 0.6; p.vz = v.vz * 0.6;
            if (v === this.vehicle) {
              this.audio.thud();
              p.hits = true;
              this.pedHits = (this.pedHits || 0) + 1;
              if (this.pedHits % 2 === 0 || this.police.some((c) => Math.hypot(c.veh.x - p.x, c.veh.z - p.z) < 70)) this.addWanted(1);
            }
            break;
          }
        }
      }
      const m = p.mesh;
      if (p.state === 'down') {
        p.timer -= dt;
        p.x += (p.vx || 0) * dt; p.z += (p.vz || 0) * dt;
        p.vx = (p.vx || 0) * (1 - dt * 3); p.vz = (p.vz || 0) * (1 - dt * 3);
        const gy = this.city.surface(p.x, p.z, m.position.y + 0.6);
        if (m.userData.kit) { animateHuman(m, 0, dt, 'down'); m.position.set(p.x, gy, p.z); }
        else { m.rotation.x = lerp(m.rotation.x, -Math.PI / 2, Math.min(1, dt * 10)); m.position.set(p.x, gy + 0.2, p.z); }
        if (p.timer <= 0) { p.state = 'flee'; p.timer = 5; m.rotation.x = 0; }
        continue;
      }
      if (p.state === 'fight') { // rvačka s hráčem (pozici a směr řídí weapons.updateFighters)
        p.timer -= dt;
        const u = m.userData; u.punchT = Math.max(0, (u.punchT || 0) - dt);
        m.position.set(p.x, this.city.surface(p.x, p.z, m.position.y + 0.6), p.z);
        animateHuman(m, 0, dt, u.punchT > 0 ? 'punch' : null);
        if (p.timer <= 0) { p.state = 'flee'; p.timer = 5; }
        continue;
      }
      let sp = p.speed;
      if (p.state === 'flee') {
        p.timer -= dt;
        sp = 5.5;
        const ax = p.x - F.x, az = p.z - F.z;
        p.h = Math.atan2(ax, az);
        if (p.timer <= 0) { p.state = 'walk'; p.road = null; }
      } else if (p.road) {
        const r = p.road, pp = r.p;
        const ax = pp[p.i], az = pp[p.i + 1], bx = pp[p.i + 2], bz = pp[p.i + 3];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        p.t += (sp * dt * p.dir) / len;
        if (p.t > 1) { if (p.i + 4 < pp.length) { p.i += 2; p.t = 0; } else { p.t = 1; p.dir = -1; } }
        if (p.t < 0) { if (p.i >= 2) { p.i -= 2; p.t = 1; } else { p.t = 0; p.dir = 1; } }
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const tx = ax + (bx - ax) * p.t + nx * p.side, tz = az + (bz - az) * p.t + nz * p.side;
        p.h = Math.atan2(tx - p.x, tz - p.z) || p.h;
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (d > 3) { p.x = tx; p.z = tz; } else { p.x = tx; p.z = tz; }
        m.position.set(p.x, this.city.surface(p.x, p.z, m.position.y + 0.6), p.z);
        m.rotation.y = p.h;
        animateHuman(m, sp, dt);
        continue;
      } else {
        sp = 1.3;
        if (Math.random() < dt * 0.3) p.h += rand(-1, 1);
      }
      const c = this.city.collide(p.x + Math.sin(p.h) * sp * dt, p.z + Math.cos(p.h) * sp * dt, 0.35);
      if (c.hit) p.h += Math.PI * 0.5;
      p.x = c.x; p.z = c.z;
      m.position.set(p.x, this.city.surface(p.x, p.z, m.position.y + 0.6), p.z);
      m.rotation.y = p.h;
      animateHuman(m, sp, dt);
    }
  }

  /* --------------- policie --------------- */
  updatePolice(dt) {
    if (this.mode === 'mma') return; // během zápasu policie nezasahuje
    const F = this.focus();
    const want = this.wanted === 0 ? 0 : Math.min(6, this.wanted + (this.wanted > 2 ? 1 : 0));
    if (this.police.length < want && Math.random() < dt * 0.8) this.spawnPolice();
    let seen = false, busting = false;
    const target = this.mode === 'foot' ? this.player : this.vehicle;
    const tSpeed = this.mode === 'foot' ? this.player.speed : Math.hypot(target.vx, target.vz);
    for (let i = this.police.length - 1; i >= 0; i--) {
      const c = this.police[i], v = c.veh;
      const d = Math.hypot(v.x - F.x, v.z - F.z);
      if (this.wanted === 0) {
        // odjedou pryč a zmizí
        v.drive(dt, { throttle: 0.4, steer: 0, hand: false }, this.city);
        if (d > 160) { this.scene.remove(v.mesh); this.police.splice(i, 1); }
        continue;
      }
      if (d > 380 || v.dead) { if (v.dead) this.parked.push(v); else this.scene.remove(v.mesh); this.police.splice(i, 1); continue; }
      const los = d < 140 && this.city.lineOfSight(v.x, v.z, F.x, F.z);
      if (los) seen = true;
      let tx = F.x, tz = F.z;
      if (!(los && d < 60) && this.mode !== 'heli') {
        c.repath -= dt;
        if (c.repath <= 0 || !c.path) {
          c.repath = 1.5;
          c.path = this.city.findPath(this.city.nearestNode(v.x, v.z), this.city.nearestNode(F.x, F.z));
        }
        if (c.path) {
          while (c.path.length > 1 && Math.hypot(c.path[0][0] - v.x, c.path[0][1] - v.z) < 9) c.path.shift();
          [tx, tz] = c.path[0];
        }
      }
      let steer = steerTo(v, tx, tz);
      const ang = Math.abs(wrapAngle(Math.atan2(tx - v.x, tz - v.z) - v.h));
      let thr = d < 9 && this.mode === 'foot' ? -0.3 : ang > 1.2 ? 0.45 : 1;
      if (d < 12 && tSpeed < 2) thr = Math.min(thr, 0);
      if (this.mode === 'heli' || this.mode === 'jet') thr = d < 20 ? 0 : thr;
      // zaseknutí
      if (Math.abs(v.v) < 1.2 && thr > 0) { c.stuck += dt; if (c.stuck > 1.8) { c.reverse = 1.3; c.stuck = 0; } } else c.stuck = 0;
      if (c.reverse > 0) { c.reverse -= dt; thr = -1; steer = -steer; }
      v.drive(dt, { throttle: thr, steer, hand: false }, this.city);
      const on = Math.floor(this.time * 6 + i) % 2;
      v.mesh.userData.lights[0].emissiveIntensity = on ? 3 : 0.2;
      v.mesh.userData.lights[1].emissiveIntensity = on ? 0.2 : 3;
      if (d < 7.5 && tSpeed < 2.2 && this.mode !== 'heli' && (this.mode !== 'foot' || this.player.y - this.city.surface(this.player.x, this.player.z) < 1)) busting = true;
    }
    if (seen) this.lastSeen = this.time;
    if (this.wanted > 0) {
      const lose = 9 + this.wanted * 4;
      if (this.time - this.lastSeen > lose) {
        this.wanted--; this.lastSeen = this.time;
        if (this.wanted === 0) this.toast('Setřásl jsi policii');
      }
      this.bustT = busting ? (this.bustT || 0) + dt : 0;
      if (this.bustT > 2.5) { this.bustT = 0; this.busted(); }
    }
    this.seen = seen;
  }

  /* --------------- srážky vozidel --------------- */
  vehicleCollisions() {
    const me = this.vehicle;
    if (!me || me.kind === 'heli') return;
    const others = [...this.traffic, ...this.police.map((p) => ({ veh: p.veh, cop: true })), ...this.parked.map((v) => ({ veh: v, parked: true })), ...this.trolleys.map((t) => ({ veh: t.veh, heavy: true })), ...(this.prisonLife?.vehicles || []).map((v) => ({ veh: v, heavy: true }))];
    for (const o of others) {
      const v = o.veh;
      if (v === me) continue;
      const dx = me.x - v.x, dz = me.z - v.z;
      const d = Math.hypot(dx, dz);
      const minD = (me.L + v.L) / 2 * 0.62 + 0.4;
      if (d < minD && d > 0.01) {
        const ux = dx / d, uz = dz / d;
        const rel = (me.vx - v.vx) * ux + (me.vz - v.vz) * uz;
        const push = minD - d;
        if (o.heavy) { me.x += ux * push; me.z += uz * push; }
        else {
          me.x += ux * push * 0.6; me.z += uz * push * 0.6;
          v.x -= ux * push * 0.4; v.z -= uz * push * 0.4;
          if (o.parked || o.cop) { v.vx -= ux * rel * 0.5; v.vz -= uz * rel * 0.5; v.sync(); }
        }
        if (rel < 0) {
          me.vx -= ux * rel * 1.2; me.vz -= uz * rel * 1.2;
          me.v *= 0.6;
          if (-rel > 5) { me.damage(-rel * 1.2); v.damage(-rel * 1.5); this.audio.crash(-rel); }
          if (o.cop && -rel > 4 && (this.time - (this.copHitT || -9)) > 3) { this.copHitT = this.time; this.addWanted(1); }
          if (!o.cop && !o.parked && !o.heavy) o.bumped = 3;
        }
      }
    }
    // parkující auta se dokutálí
    for (const v of this.parked) {
      if (Math.abs(v.vx) + Math.abs(v.vz) > 0.05) {
        v.vx *= 0.92; v.vz *= 0.92;
        v.move(1 / 60, this.city);
      }
    }
  }

  /* --------------- zakázky (taxi) --------------- */
  updateMission(dt) {
    const m = this.mission;
    const F = this.focus();
    if (!m) {
      this.hud.marker(null);
      if (this.beam) this.beam.visible = false;
      if (this.mode === 'trolley') return;
      if (this.waypoint) { this.hud.mission(this.navHtml()); return; }
      if (this.mode !== 'car' || this.vehicle.kind === 'police' || this.wanted > 0) { this.hud.mission(null); return; }
      this.missionCooldown -= dt;
      if (this.missionCooldown > 0) { this.hud.mission(null); return; }
      // nová zakázka: vyzvednout zákazníka
      const a = Math.random() * Math.PI * 2, r = rand(150, 380);
      const road = this.city.nearestRoad(F.x + Math.cos(a) * r, F.z + Math.sin(a) * r, 80, (r) => r.ai);
      if (!road) return;
      const ped = makeHuman();
      ped.position.set(road.x, this.city.surface(road.x, road.z), road.z);
      this.scene.add(ped);
      this.mission = { stage: 'pickup', x: road.x, z: road.z, ped, t: 0 };
      this.toast('Nová zakázka: vyzvedni zákazníka (zelená značka)');
      this.audio.ding();
      return;
    }
    const d = Math.hypot(m.x - F.x, m.z - F.z);
    this.hud.marker(m);
    if (!this.beam) {
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: '#5cc27a', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
      this.scene.add(this.beam);
    }
    this.beam.visible = true;
    this.beam.material.color.set(m.stage === 'pickup' ? '#5cc27a' : '#ffd23f');
    this.beam.position.set(m.x, this.city.ground(m.x, m.z) + 30, m.z);
    if (m.stage === 'pickup') {
      this.hud.mission(`<b>Taxi: vyzvedni zákazníka</b><small>${Math.round(d)} m · ${this.city.placeName(m.x, m.z).street || ''}</small>`);
      if (this.mode !== 'car') { this.cancelMission('Zakázka zrušena – vystoupil jsi'); return; }
      if (d < 9 && this.vehicle.speedKmh() < 12) {
        this.scene.remove(m.ped);
        const opts = this.landmarks.filter((l) => { const dd = Math.hypot(l.x - F.x, l.z - F.z); return dd > 450 && dd < 2200; });
        const L = pick(opts.length ? opts : this.landmarks);
        const road = this.city.nearestRoad(L.x, L.z, 160, (r) => r.drive) || { x: L.x, z: L.z };
        const dist = Math.hypot(road.x - F.x, road.z - F.z);
        Object.assign(m, { stage: 'drop', x: road.x, z: road.z, label: L.label, reward: Math.round(60 + dist * 0.32), time: dist / 7.5 + 35 });
        this.toast(`„Na ${L.label}, prosím.“`);
        this.audio.ding();
      }
    } else if (m.stage === 'drop') {
      m.time -= dt;
      this.hud.mission(`<b>Taxi → ${m.label}</b><small>${Math.round(d)} m · zbývá ${Math.max(0, Math.ceil(m.time))} s · ${m.reward} Kč</small>`);
      if (this.mode !== 'car') { this.cancelMission('Zákazník vystoupil – zakázka zrušena'); return; }
      if (m.time <= 0) { this.cancelMission('Nestihl jsi to. Zákazník odešel bez placení.'); return; }
      if (d < 10 && this.vehicle.speedKmh() < 12) {
        const bonus = Math.round(m.time * 2);
        this.money += m.reward + bonus;
        this.toast(`Zaplaceno ${m.reward} Kč + spropitné ${bonus} Kč`);
        this.audio.cash();
        this.mission = null; this.missionCooldown = 8;
        this.hud.mission(null);
      }
    }
  }

  cancelMission(msg) {
    if (this.mission?.ped) this.scene.remove(this.mission.ped);
    this.mission = null; this.missionCooldown = 10;
    this.toast(msg); this.hud.mission(null);
  }

  /** Navigace k cíli (mise nebo bod na mapě). */
  gpsTarget() {
    if (this.mission) return this.mission;
    return this.waypoint;
  }
  updateGps(dt) {
    this.gpsT -= dt;
    const t = this.gpsTarget();
    if (!t) {
      this.gps = null;
      if (this.navArrow) this.navArrow.visible = false;
      if (this.navMesh) this.navMesh.visible = false;
      return;
    }
    const F = this.focus();
    if (this.waypoint && !this.mission && Math.hypot(t.x - F.x, t.z - F.z) < 15) {
      this.toast(`Jsi v cíli${this.waypoint.label ? ': ' + this.waypoint.label : ''}`);
      this.waypoint = null; this.gps = null; this.updateNavLine(); return;
    }
    if (this.gpsT > 0) { this.updateNavArrow(dt); return; }
    this.gpsT = 1.2;
    const path = this.city.findPath(this.city.nearestNode(F.x, F.z), this.city.nearestNode(t.x, t.z), 12000);
    this.gps = path ? [[F.x, F.z], ...path, [t.x, t.z]] : [[F.x, F.z], [t.x, t.z]];
    this.updateNavLine();
    this.updateNavArrow(dt);
  }

  /** Spustí navigaci k místu {x, z, label}. */
  navTo(l) {
    this.waypoint = { x: l.x, z: l.z, label: l.label };
    this.gpsT = 0;
    if (this.mission) { this.mission = null; this.hud.marker(null); }
    this.toast(`Navigace: ${l.label}`);
  }
  navCancel() {
    this.waypoint = null; this.gps = null; this.updateNavLine();
    this.hud.mission(null);
    this.toast('Navigace zrušena');
  }

  /** Další odbočka na trase: vzdálenost, směr, ulice. */
  navInfo() {
    const p = this.gps, F = this.focus();
    if (!p || p.length < 2 || !F) return null;
    // body aspoň 6 m od sebe (ať drobné zalomení silnice není odbočka)
    const pts = [[F.x, F.z]];
    for (const q of p.slice(1)) { const l = pts[pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 6) pts.push(q); }
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let acc = 0, turn = null;
    for (let i = 1; i < pts.length - 1 && !turn; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
      acc += Math.hypot(bx - ax, bz - az);
      const a1 = Math.atan2(bx - ax, bz - az), a2 = Math.atan2(cx - bx, cz - bz);
      const da = wrapAngle(a2 - a1);
      if (Math.abs(da) > 0.6 && acc > 3) {
        // x = východ, z = jih → kladné da (atan2(x,z)) = doleva při pohledu po směru jízdy
        const rd = this.city.nearestRoad(bx + (cx - bx) * 0.3, bz + (cz - bz) * 0.3, 15, (r) => !!r.n);
        turn = { d: acc, left: da > 0, sharp: Math.abs(da) > 2, street: rd ? rd.road.n : null };
      }
    }
    return { total, turn };
  }
  navHtml() {
    const w = this.waypoint, n = this.navInfo();
    const km = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');
    const head = `<b>➜ ${w.label || 'Cíl na mapě'}</b>`;
    if (!n) return head + '<small>Hledám trasu… · N = zrušit</small>';
    let line = 'Pokračuj rovně do cíle';
    if (n.turn) {
      const dir = n.turn.sharp ? (n.turn.left ? 'ostře vlevo' : 'ostře vpravo') : n.turn.left ? 'vlevo' : 'vpravo';
      line = `${n.turn.d < 25 ? 'Teď' : 'Za ' + km(n.turn.d)} <b>${n.turn.left ? '↰' : '↱'} ${dir}</b>${n.turn.street ? ' · ' + n.turn.street : ''}`;
    }
    return `${head}<small>${line}<br>do cíle ${km(n.total)} · N = změnit / zrušit</small>`;
  }

  /** Trasa jako fialový pás s šipkami na silnici. */
  updateNavLine() {
    if (!this.navMesh) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(160,110,255,0.55)'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.moveTo(14, 46); g.lineTo(32, 18); g.lineTo(50, 46); g.lineTo(42, 46); g.lineTo(32, 31); g.lineTo(22, 46); g.closePath(); g.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.navTex = tex;
      this.navMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      this.navMesh.renderOrder = 5;
      this.navMesh.frustumCulled = false;
      this.scene.add(this.navMesh);
    }
    const p = this.gps;
    this.navMesh.visible = !!(p && p.length > 1 && this.waypoint && !this.mission);
    if (!this.navMesh.visible) return;
    const pos = [], uv = [];
    const W = 1.6;
    let v = 0;
    const Y = (x, z) => this.city.surface(x, z) + 0.25;
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.5) continue;
      const nx = -(bz - az) / L * W, nz = (bx - ax) / L * W;
      const n = Math.max(1, Math.ceil(L / 4));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const y0 = Y(x0, z0), y1 = Y(x1, z1), v0 = v / 4, v1 = (v + L / n) / 4;
        pos.push(x0 - nx, y0, z0 - nz, x0 + nx, y0, z0 + nz, x1 + nx, y1, z1 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz);
        uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
        v += L / n;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.navMesh.geometry.dispose();
    this.navMesh.geometry = geo;
  }

  /** Šipka nad hráčem / autem ukazující směr trasy. */
  updateNavArrow(dt) {
    if (this.navTex) this.navTex.offset.y -= dt * 0.9;
    const on = !!(this.gps && this.waypoint && !this.mission && this.mode !== 'trolley');
    if (!this.navArrow) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 1.3); shape.lineTo(0.9, -0.2); shape.lineTo(0.3, -0.2); shape.lineTo(0.3, -1); shape.lineTo(-0.3, -1); shape.lineTo(-0.3, -0.2); shape.lineTo(-0.9, -0.2); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.navArrow = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#a06eff', emissive: new THREE.Color('#6a3fd0'), emissiveIntensity: 0.6, roughness: 0.4 }));
      this.scene.add(this.navArrow);
    }
    this.navArrow.visible = on;
    if (this.navMesh) this.navMesh.visible = on;
    if (!on) return;
    const F = this.focus();
    // cíl šipky: bod trasy ~15 m před námi
    let tx = this.waypoint.x, tz = this.waypoint.z, acc = 0;
    const p = this.gps;
    let best = 0, bd = 1e18;
    for (let i = 0; i < p.length; i++) { const d = (p[i][0] - F.x) ** 2 + (p[i][1] - F.z) ** 2; if (d < bd) { bd = d; best = i; } }
    for (let i = best + 1; i < p.length; i++) {
      acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (acc > 15) { tx = p[i][0]; tz = p[i][1]; break; }
    }
    const up = this.mode === 'car' ? 3.4 : this.mode === 'heli' ? 5 : 2.8;
    this.navArrow.position.set(F.x, (F.y ?? this.city.surface(F.x, F.z)) + up + Math.sin(this.time * 3) * 0.12, F.z);
    this.navArrow.rotation.y = Math.atan2(tx - F.x, tz - F.z);
    const sc = this.mode === 'foot' ? 0.6 : 1;
    this.navArrow.scale.set(sc, sc, sc);
  }

  teleport(l) {
    if (this.wanted > 0) { this.toast('S policií v patách se teleportovat nedá'); return; }
    const s = this.city.freeSpotNear(l.x, l.z, 6, 50);
    if (this.mode !== 'foot') {
      if (this.mode === 'trolley') this.ride = null;
      else this.exit();
      this.mode = 'foot';
    }
    Object.assign(this.player, { x: s.x, z: s.z, y: this.city.surface(s.x, s.z), vy: 0 });
    if (l.prisonInside) this.arrivePrison();
  }

  /** Teleport do věznice: hráč u budovy C, vedle auto, motorka a vrtulník (na hřišti D1). */
  arrivePrison(quiet = false) {
    const S = PRISON_SPAWN, c = this.city;
    // hráč se dívá k autu a vrtulníku (ne do zdi budovy C)
    const lookH = Math.atan2((S.car[0] + S.heli[0]) / 2 - S.x, (S.car[1] + S.heli[1]) / 2 - S.z);
    Object.assign(this.player, { x: S.x, z: S.z, y: c.surface(S.x, S.z), vy: 0, h: lookH });
    this.camYaw = lookH;
    const car = this.lineup?.sport;
    if (car) { car.v = car.vx = car.vz = 0; car.place(S.car[0], S.car[1], S.car[2]); car.dead = false; car.hp = 100; if (!this.parked.includes(car)) this.parked.push(car); }
    if (!this.bike) {
      this.bike = new Vehicle(makeBikeMesh('#c4161c'), 'car');
      this.bike.label = 'Motorka'; this.bike.owned = true;
      this.bike.maxV = 52; this.bike.accel = 17; this.bike.r = 0.55;
      this.scene.add(this.bike.mesh);
      this.parked.push(this.bike);
    }
    const b = this.bike;
    b.v = b.vx = b.vz = 0; b.dead = false; b.hp = 100;
    b.place(S.bike[0], S.bike[1], S.bike[2]);
    if (!this.parked.includes(b) && this.vehicle !== b) this.parked.push(b);
    if (this.heli) {
      const hv = this.heli;
      hv.vx = hv.vz = hv.vy = 0; hv.rotor = 0; hv.dead = false; hv.hp = 100;
      hv.place(S.heli[0], S.heli[1], Math.PI / 2);
      hv.y = c.ground(S.heli[0], S.heli[1]);
      hv.sync?.();
    }
    this.placePrisonJet();
    // tank na hřišti D2
    if (!this.tank) {
      this.tank = new Vehicle(makeTank(), 'car');
      this.tank.label = 'Tank'; this.tank.owned = true; this.tank.isTank = true;
      this.tank.maxV = 14; this.tank.accel = 6; this.tank.r = 2.4;
      this.scene.add(this.tank.mesh);
    }
    const tk = this.tank;
    if (this.vehicle !== tk) {
      tk.v = tk.vx = tk.vz = 0; tk.dead = false; tk.hp = 5000; tk.burnT = null;
      tk.place(S.tank[0], S.tank[1], S.tank[2]);
      tk.mesh.userData.turret.rotation.y = 0;
      if (!this.parked.includes(tk)) this.parked.push(tk);
    }
    if (!quiet) this.toast('Věznice Vinařice – u budovy C stojí auto, motorka, vrtulník, na hřištích stíhačka a tank');
  }

  /** Tank: věž míří tam, kam kamera; myš / F = výstřel z kanónu (raketa s výbuchem). */
  updateTankGun(v, dt) {
    const T = v.mesh.userData.turret, inp = this.input;
    const want = wrapAngle(this.camYaw - v.h);
    T.rotation.y += wrapAngle(want - T.rotation.y) * Math.min(1, dt * 4);
    this.tankCool = (this.tankCool || 0) - dt;
    if ((inp.hit('Mouse0') || inp.hit('KeyF') || inp.hit('KeyK')) && this.tankCool <= 0 && this.weapons) {
      this.tankCool = 1.6;
      const O = new THREE.Vector3(); v.mesh.userData.muzzle.getWorldPosition(O);
      const h = v.h + T.rotation.y, D = new THREE.Vector3(Math.sin(h), Math.sin(-this.camPitch * 0.6 + 0.12), Math.cos(h)).normalize();
      this.weapons.fireRocket(O, D, false, 95);
      this.weapons.shake = Math.max(this.weapons.shake, 0.5);
      v.v -= 1.5; // zpětný ráz
    }
  }

  /** Stíhačka na hřišti D1 (svislý vzlet, takže dráhu nepotřebuje). */
  placePrisonJet() {
    const S = PRISON_SPAWN;
    if (!this.jet) { this.jet = new Vehicle(makeJet(), 'jet'); this.scene.add(this.jet.mesh); }
    const v = this.jet;
    if (this.vehicle === v) return;
    v.spd = 0; v.pitch = 0; v.roll = 0; v.vy = 0; v.dead = false;
    v.place(S.jet[0], S.jet[1], S.jet[2]);
    v.y = this.city.surface(S.jet[0], S.jet[1]);
    v.mesh.rotation.set(0, v.h, 0);
    v.mesh.position.set(v.x, v.y, v.z);
    v.mesh.userData.flameM.opacity = 0;
  }

  /** Stíhačka: W/S plyn, A/D zatáčení s náklonem, mezerník/Shift stoupání a klesání. */
  updateJet(dt) {
    const v = this.vehicle, inp = this.input, city = this.city;
    const a = inp.axes();
    const MAX = 262; // ≈ 940 km/h
    if (a.y > 0) v.spd += (40 + v.spd * 0.18) * a.y * dt;
    else if (a.y < 0) v.spd += 70 * a.y * dt;
    else v.spd -= 4 * dt;
    v.spd = clamp(v.spd, 0, MAX);
    const up = (inp.down('Space') ? 1 : 0) - (inp.down('ShiftLeft', 'ShiftRight') ? 1 : 0);
    const ground = city.roofHeight(v.x, v.z, v.y + 2);
    const onGround = v.y <= ground + 0.05;
    const rollT = a.x * (v.spd > 30 ? 1.1 : 0.4);
    v.roll += (rollT - v.roll) * Math.min(1, dt * 3);
    const turn = v.spd > 30 ? -v.roll * 0.75 : -a.x * 1.2;
    v.h += turn * dt;
    const pitchT = up * 0.55;
    v.pitch += (pitchT - v.pitch) * Math.min(1, dt * 2.5);
    let vy;
    if (v.spd > 45) vy = Math.sin(v.pitch) * v.spd - (v.spd < 70 ? (70 - v.spd) * 0.3 : 0);
    else vy = up > 0 ? 9 : onGround ? 0 : up < 0 ? -9 : -3;
    const [fx, fz] = v.forward();
    const hs = v.spd * Math.cos(v.pitch);
    let nx = v.x + fx * hs * dt, nz = v.z + fz * hs * dt;
    const H = city.half - 30;
    if (Math.abs(nx) > H || Math.abs(nz) > H) { v.h += Math.PI * dt * 0.8; nx = clamp(nx, -H, H); nz = clamp(nz, -H, H); }
    let ny = v.y + vy * dt;
    const c = city.collide(nx, nz, 4, ny + 1.5);
    const g2 = city.roofHeight(nx, nz, ny + 2);
    if ((c.hit && v.spd > 20) || (ny < g2 && (v.spd > 70 || vy < -14))) { this.crashJet(); return; }
    if (c.hit) { nx = c.x; nz = c.z; v.spd *= 0.5; }
    if (ny < g2) { ny = g2; if (v.pitch < 0) v.pitch = 0; }
    v.x = nx; v.z = nz; v.y = ny;
    v.vx = fx * hs; v.vz = fz * hs;
    const m = v.mesh;
    m.position.set(v.x, v.y, v.z);
    m.rotation.order = 'YXZ';
    m.rotation.y = v.h; m.rotation.x = -v.pitch; m.rotation.z = v.roll;
    m.userData.flameM.opacity = Math.min(0.95, v.spd / MAX + (a.y > 0 ? 0.35 : 0));
    m.userData.flame.scale.set(1, 0.5 + (v.spd / MAX) * 1.8, 1);
    this.player.x = v.x; this.player.z = v.z; this.player.y = v.y;
    this.hud.setSpeed(v.spd * 3.6, null, Math.round(v.y - city.ground(v.x, v.z)));
    this.updateJetGuns(v, dt);
  }

  /** Zbraně stíhačky: 1 = kanón (dávky), 2 = rakety; střelba myší, F nebo K (na telefonu 💥). */
  updateJetGuns(v, dt) {
    const inp = this.input, W = this.weapons;
    if (!W) return;
    if (inp.hit('Digit1') || inp.hit('Numpad1')) { this.jetWpn = 1; this.toast('✈ Kanón – dávky (myš / F)'); }
    if (inp.hit('Digit2') || inp.hit('Numpad2')) { this.jetWpn = 2; this.toast('🚀 Rakety (myš / F)'); }
    if (inp.hit('KeyQ')) { this.jetWpn = this.jetWpn === 2 ? 1 : 2; this.toast(this.jetWpn === 2 ? '🚀 Rakety' : '✈ Kanón'); }
    this.jetWpn ||= 1;
    this.jetCool = (this.jetCool || 0) - dt;
    const firing = inp.mouseBtn || inp.down('KeyF') || inp.down('KeyK');
    if (!firing || this.jetCool > 0) return;
    const m = v.mesh;
    const D = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion).normalize();
    if (this.jetWpn === 1) {
      this.jetCool = 0.045;
      const O = new THREE.Vector3(0.7 * ((this.jetSide = -(this.jetSide || 1)) || 1), 1.5, 8.5).applyMatrix4(m.matrixWorld);
      W.jetBurst(O, D);
    } else {
      this.jetCool = 0.32;
      const O = new THREE.Vector3(3.2 * ((this.jetSide = -(this.jetSide || 1)) || 1), 1.2, 1.5).applyMatrix4(m.matrixWorld);
      W.fireRocket(O, D, false, 150 + v.spd);
    }
  }

  crashJet() {
    const v = this.vehicle;
    this.audio.crash(40);
    this.weapons?.explode(new THREE.Vector3(v.x, v.y + 1, v.z), true);
    this.hud.bigMsg('HAVÁRIE', 'Stíhačka narazila · na hřišti ve věznici čeká nová');
    this.vehicle = null; this.mode = 'foot';
    v.driver = null;
    this.placePrisonJet();
    this.player.mesh.visible = true;
    this.wasted();
  }

  /* --------------- kamera --------------- */
  updateCamera(dt) {
    if (this.mode === 'mma' || (this.mma?.active && this.mma.cinematic)) { this.mma.camera(this.camera, dt); return; }
    let tx, ty, tz, dist, heading = null;
    if (this.mode === 'foot') { const P = this.player; tx = P.x; ty = P.y + 1.6; tz = P.z; dist = this.camFar ? 11 : 6.5; }
    else if (this.mode === 'car') { const v = this.vehicle; tx = v.x; ty = v.y + 1.8; tz = v.z; dist = this.camFar ? 15 : 9.5; heading = Math.abs(v.v) > 2 ? (v.v > 0 ? v.h : v.h) : null; }
    else if (this.mode === 'heli') { const v = this.vehicle; tx = v.x; ty = v.y + 3; tz = v.z; dist = this.camFar ? 34 : 22; heading = v.h; }
    else if (this.mode === 'jet') { const v = this.vehicle; tx = v.x; ty = v.y + 3; tz = v.z; dist = (this.camFar ? 40 : 26) + v.spd * 0.04; heading = v.h; }
    else { const v = this.ride.veh; tx = v.x; ty = v.y + 3.5; tz = v.z; dist = 18; heading = v.h; }
    // se zbraní v ruce: kamera přes pravé rameno, zaměřovač míří do prostoru vedle postavy
    const armed = this.mode === 'foot' && this.weapons?.slot > 0;
    this.aimT = lerp(this.aimT || 0, armed ? 1 : 0, Math.min(1, dt * 6));
    if (this.aimT > 0.01 && this.mode === 'foot') {
      const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw), k = this.aimT;
      tx += rx * 0.95 * k; tz += rz * 0.95 * k; ty += 0.15 * k;
      dist = lerp(dist, this.camFar ? 6 : 3.8, k);
    }
    if (heading !== null && this.time - this.lastMouse > 1.5) this.camYaw += wrapAngle(heading - this.camYaw) * Math.min(1, dt * 2.2);
    const pitch = this.camPitch + (this.mode === 'heli' ? 0.15 : 0);
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    // kolize kamery s budovami
    let dd = dist;
    for (let s = 1.5; s <= dist; s += 1) {
      const px = tx - fx * s * Math.cos(pitch), pz = tz - fz * s * Math.cos(pitch), py = ty + s * Math.sin(pitch);
      const b = this.city.buildingAt(px, pz);
      if (b && py < b.h + 0.5) { dd = Math.max(1.5, s - 0.8); break; }
    }
    this.camD = lerp(this.camD || dd, dd, dd < (this.camD || dd) ? 1 : Math.min(1, dt * 3));
    const D = this.camD;
    const cx = tx - fx * D * Math.cos(pitch), cz = tz - fz * D * Math.cos(pitch);
    const cy = Math.max(this.city.ground(cx, cz) + 0.6, ty + D * Math.sin(pitch));
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(tx, ty, tz);
    this.weapons?.applyShake(this.camera);
  }

  updateAudio() {
    const sp = this.mode === 'car' ? Math.abs(this.vehicle.v) : this.mode === 'jet' ? 20 + this.vehicle.spd / 5 : this.mode === 'heli' ? -1 : 0;
    this.audio.engine(this.mode === 'car' || this.mode === 'jet', sp, this.mode === 'heli');
    this.audio.siren(this.police.some((c) => Math.hypot(c.veh.x - this.focus().x, c.veh.z - this.focus().z) < 160) && this.wanted > 0);
  }

  /** Kontextová nápověda pro E. */
  hint() {
    const P = this.player;
    if (this.mode === 'mma') return null;
    if (this.mode === 'foot') {
      for (const t of this.trolleys) if (t.wait > 0.5 && Math.hypot(t.veh.x - P.x, t.veh.z - P.z) < 9) {
        const n = this.nextStop(t);
        return `<kbd>E</kbd> Nastoupit do autobusu ${t.line.ref}${n ? ' · směr ' + n.n : ''}`;
      }
      if (this.jet && Math.hypot(this.jet.x - P.x, this.jet.z - P.z) < 8 && Math.abs(this.jet.y - P.y) < 3) return '<kbd>E</kbd> Nastoupit do stíhačky';
      if (this.heli && Math.hypot(this.heli.x - P.x, this.heli.z - P.z) < 7) return '<kbd>E</kbd> Nastoupit do vrtulníku';
      for (const v of this.parked) if (!v.dead && Math.hypot(v.x - P.x, v.z - P.z) < 4.2) return v.owned ? `<kbd>E</kbd> Nastoupit: ${v.label}` : '<kbd>E</kbd> Vloupat se do auta';
      for (const t of this.traffic) if (Math.hypot(t.veh.x - P.x, t.veh.z - P.z) < 4.2) return '<kbd>E</kbd> Ukrást auto';
      for (const c of this.police) if (Math.hypot(c.veh.x - P.x, c.veh.z - P.z) < 4.2) return '<kbd>E</kbd> Ukrást policejní auto';
      return null;
    }
    if (this.mode === 'car' && Math.hypot(this.vehicle.vx, this.vehicle.vz) < 6) return '<kbd>E</kbd> Vystoupit';
    if (this.mode === 'trolley' && this.ride.wait > 0) return '<kbd>E</kbd> Vystoupit';
    if (this.mode === 'heli' && this.vehicle.y - this.city.roofHeight(this.vehicle.x, this.vehicle.z) < 0.8) return '<kbd>E</kbd> Vystoupit';
    if (this.mode === 'jet' && this.vehicle.spd < 6 && this.vehicle.y - this.city.roofHeight(this.vehicle.x, this.vehicle.z) < 0.8) return '<kbd>E</kbd> Vystoupit';
    return null;
  }
}

export { THREE };
