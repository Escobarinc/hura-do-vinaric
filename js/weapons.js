/*
 * Zbraně: pistole, brokovnice, samopal, granát.
 * 1–4 výběr, 0 schovat, levé tlačítko myši střelba / hod. Míří se středem obrazovky (zaměřovač).
 * Zásah: krev (kapky + louže), postava se svalí k zemi animací umírání a odsune se ve směru střely.
 * Granát: oblouk, odrazy, po 2,4 s výbuch (ohnivá koule, záblesk, rázová vlna, kouř, jiskry),
 * lidé v dosahu odletí a dopadnou, auta se odhodí a poškodí, kamera se otřese.
 */
import * as THREE from 'three';

const WEAPONS = [
  null,
  { name: 'Pistole', icon: '🔫', rate: 0.32, auto: false, pellets: 1, spread: 0.008, range: 110, sound: [0.13, 0.5, 1900] },
  { name: 'Brokovnice', icon: '💥', rate: 0.95, auto: false, pellets: 9, spread: 0.055, range: 38, sound: [0.28, 0.85, 900] },
  { name: 'Samopal', icon: '🔫', rate: 0.085, auto: true, pellets: 1, spread: 0.022, range: 95, sound: [0.07, 0.38, 2300] },
  { name: 'Granát', icon: '💣', rate: 1.1, grenade: true },
  { name: 'Bazuka', icon: '🚀', rate: 1.3, rocket: true },
];
const NW = WEAPONS.length; // počet slotů včetně „bez zbraně“
const KILL_R = 8, PUSH_R = 13, FUSE = 2.4;

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Jednoduchý částicový systém (kapky krve, jiskry, prach). */
class Particles {
  constructor(scene, max, color, size, additive = false) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.ground = null;
  }
  emit(x, y, z, vx, vy, vz, life, grav = 9.8) {
    const i = this.n++ % this.max;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.grav[i] = grav;
  }
  update(dt, ground, onLand) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const gy = ground(this.pos[k], this.pos[k + 2]);
      if (this.pos[k + 1] < gy + 0.03) {
        this.pos[k + 1] = gy + 0.03; this.vel[k] *= 0.2; this.vel[k + 1] = 0; this.vel[k + 2] *= 0.2;
        if (onLand && this.grav[i] > 0) { onLand(this.pos[k], this.pos[k + 2]); this.grav[i] = 0; }
      }
      if (this.life[i] <= 0) this.pos[k + 1] = -9999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Weapons {
  constructor(game) {
    this.game = game;
    const { scene } = game;
    this.scene = scene;
    this.slot = 0;
    this.cool = 0;
    this.corpses = [];
    this.burning = []; // hořící vraky
    this.rockets = []; // rakety z bazuky a tanku
    this.debris = []; // trosky zdí, plotů a budov
    this.holes = []; // díry v budovách
    this.queueBoom = []; // výbuchy zničených vozidel (až v dalším snímku, ať se neřetězí v jednom průchodu)
    this.grenades = [];
    this.fx = [];
    this.pools = [];
    this.shake = 0;
    this.blood = new Particles(scene, 900, '#8a0b0b', 0.09);
    this.sparks = new Particles(scene, 500, '#ffcf6a', 0.12, true);
    this.dust = new Particles(scene, 400, '#9c968a', 0.16);
    this.flashT = glowTexture('rgba(255,255,230,1)', 'rgba(255,170,40,.8)');
    this.fireT = glowTexture('rgba(255,250,220,1)', 'rgba(255,120,20,.9)');
    this.smokeT = glowTexture('rgba(90,88,84,.9)', 'rgba(60,58,55,.5)');
    this.light = new THREE.PointLight('#ffb050', 0, 40, 1.6);
    scene.add(this.light);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.7, 0.7, 0.7); this.flash.visible = false;
    scene.add(this.flash);
    this.poolMat = new THREE.MeshLambertMaterial({ color: '#5c0606', transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }); // matná, ať se neleskne do bíla
    this.scorchMat = new THREE.MeshBasicMaterial({ color: '#141210', transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 });
    this.makeGuns();
    this.makeHud();
  }

  /* ---------- modely zbraní v ruce ---------- */
  makeGuns() {
    const dark = new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.7, roughness: 0.35 });
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4428', roughness: 0.7 });
    const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
    const pistol = new THREE.Group(); pistol.add(box(0.05, 0.08, 0.22, dark, 0, 0.03, 0.05), box(0.045, 0.12, 0.06, dark, 0, -0.04, -0.03));
    const shotgun = new THREE.Group(); shotgun.add(box(0.06, 0.07, 0.75, dark, 0, 0.02, 0.2), box(0.07, 0.1, 0.32, wood, 0, -0.02, -0.25), box(0.06, 0.05, 0.25, wood, 0, -0.03, 0.3));
    const smg = new THREE.Group(); smg.add(box(0.06, 0.09, 0.42, dark, 0, 0.02, 0.08), box(0.04, 0.18, 0.05, dark, 0, -0.1, 0.12), box(0.05, 0.1, 0.05, dark, 0, -0.05, -0.05), box(0.04, 0.05, 0.2, dark, 0, 0.0, -0.2));
    const nade = new THREE.Group(); const gb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: '#3f4a2c', roughness: 0.6 })); nade.add(gb);
    // bazuka: zelená trubka na rameni s mířidlem a rukojetí
    const olive = new THREE.MeshStandardMaterial({ color: '#4b5a32', roughness: 0.6, metalness: 0.2 });
    const bazooka = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.25, 14, 1, true), olive); tube.material.side = THREE.DoubleSide; tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.16, 0.12);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.18, 14, 1, true), olive); bell.rotation.x = Math.PI / 2; bell.position.set(0, 0.16, -0.55);
    bazooka.add(tube, bell, box(0.04, 0.14, 0.05, dark, 0, 0.03, 0.18), box(0.04, 0.12, 0.05, dark, 0, 0.04, -0.05), box(0.03, 0.06, 0.08, dark, 0.07, 0.25, 0.3));
    this.gunMeshes = [null, pistol, shotgun, smg, nade, bazooka];
    this.hand = new THREE.Group();
    this.hand.position.set(-0.26, 1.18, 0.38);
    for (const m of this.gunMeshes) if (m) { m.visible = false; this.hand.add(m); }
    this.game.player.mesh.add(this.hand);
  }

  makeHud() {
    const css = document.createElement('style');
    css.textContent = `#xhair{position:fixed;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;z-index:30;display:none}
#xhair:before,#xhair:after{content:"";position:absolute;background:#fff;box-shadow:0 0 2px #000}
#xhair:before{left:12px;top:0;width:2px;height:26px}#xhair:after{top:12px;left:0;height:2px;width:26px}
#xhair i{position:absolute;left:10px;top:10px;width:6px;height:6px;border-radius:50%;border:1px solid #fff;box-shadow:0 0 2px #000}
#wpn{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;pointer-events:none;
font:700 13px "Manrope",sans-serif;color:#eef2f5;background:rgba(14,18,23,.72);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px 12px;white-space:nowrap}
#wpn b{color:#ffd23f}#wpn span{opacity:.6;font-weight:600}`;
    document.head.appendChild(css);
    this.xhair = document.createElement('div'); this.xhair.id = 'xhair'; this.xhair.innerHTML = '<i></i>';
    this.label = document.createElement('div'); this.label.id = 'wpn';
    document.body.append(this.xhair, this.label);
    this.updateHud();
  }
  updateHud() {
    const w = WEAPONS[this.slot];
    const show = this.game.mode === 'foot' && !document.getElementById('hud')?.hidden;
    this.xhair.style.display = show && w ? 'block' : 'none';
    this.label.style.display = show ? 'block' : 'none';
    this.label.innerHTML = w
      ? `${w.icon} <b>${w.name}</b> <span>· K / myš = ${w.grenade ? 'hod' : 'střelba'} · Q / kolečko = další zbraň · 1–5 · 6 pěsti</span>`
      : '👊 <b>Pěsti (6)</b> <span>· myš / F = rána · zbraně: Q nebo kolečko · 1 pistole · 2 brokovnice · 3 samopal · 4 granát · 5 bazuka</span>';
  }

  /* ---------- cíle ---------- */
  targets() {
    const out = [];
    for (const p of this.game.peds) if (p.state !== 'dead') out.push({ mesh: p.mesh, kill: (dir, boom) => { this.game.peds.splice(this.game.peds.indexOf(p), 1); this.corpse(p.mesh, dir, boom, null); } });
    const pl = this.game.prisonLife;
    if (pl) for (const p of pl.pool) if (p.used && !p.dead && p.mesh.visible) out.push({ mesh: p.mesh, kill: (dir, boom) => { p.dead = true; this.corpse(p.mesh, dir, boom, p); } });
    if (pl?.crowdTargets) out.push(...pl.crowdTargets());
    return out;
  }

  /** Paprsek proti postavám (svislý válec) a budovám; vrací nejbližší zásah. */
  cast(O, D, range) {
    const city = this.game.city;
    let best = null;
    for (const t of this.targets()) {
      const F = t.mesh.position;
      if (Math.abs(F.x - O.x) > range || Math.abs(F.z - O.z) > range) continue;
      const ox = O.x - F.x, oz = O.z - F.z, a = D.x * D.x + D.z * D.z, b = 2 * (ox * D.x + oz * D.z), c = ox * ox + oz * oz - 0.36 * 0.36;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-6) continue;
      let tt = (-b - Math.sqrt(disc)) / (2 * a);
      if (tt < 0) tt = (-b + Math.sqrt(disc)) / (2 * a);
      if (tt < 0.3 || tt > range) continue;
      const y = O.y + D.y * tt;
      if (y < F.y || y > F.y + 1.85) continue;
      if (!best || tt < best.t) best = { t: tt, target: t, head: y > F.y + 1.5 };
    }
    // vozidla (otočený kvádr podle směru jízdy)
    for (const v of this.game.allVehicles()) {
      if (!v.mesh?.visible || v === this.game.vehicle) continue;
      if (Math.abs(v.x - O.x) > range + 8 || Math.abs(v.z - O.z) > range + 8) continue;
      const tt = this.rayVehicle(O, D, v);
      if (tt != null && tt > 0.3 && tt <= range && (!best || tt < best.t)) best = { t: tt, vehicle: v };
    }
    // překážky: budovy a terén
    const lim = best ? best.t : range;
    for (let s = 1; s < lim; s += 0.8) {
      const x = O.x + D.x * s, y = O.y + D.y * s, z = O.z + D.z * s;
      if (y < city.ground(x, z)) return { t: s, wall: true, p: new THREE.Vector3(x, city.ground(x, z) + 0.02, z) };
      const bd = city.buildingAt(x, z);
      if (bd && y < bd.h && y > bd.mh) return { t: s, wall: true, p: new THREE.Vector3(x, y, z) };
    }
    if (best) return { ...best, p: new THREE.Vector3(O.x + D.x * best.t, O.y + D.y * best.t, O.z + D.z * best.t) };
    return { t: range, p: new THREE.Vector3(O.x + D.x * range, O.y + D.y * range, O.z + D.z * range) };
  }

  /** Průsečík paprsku s kvádrem vozidla (v souřadnicích vozidla); vrací vzdálenost nebo null. */
  rayVehicle(O, D, v) {
    const L = (v.L || 4.5) / 2 + 0.1, W = (v.W || 2) / 2 + 0.1, H = v.mesh.userData.top || (v.L > 8 ? 3.2 : 1.8);
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const ox = O.x - v.x, oz = O.z - v.z, oy = O.y - v.y;
    const o = [ox * fx + oz * fz, ox * fz - oz * fx, oy], d = [D.x * fx + D.z * fz, D.x * fz - D.z * fx, D.y];
    const lo = [-L, -W, 0], hi = [L, W, H];
    let t0 = -Infinity, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
      let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    return t0 >= 0 ? t0 : t1 >= 0 ? t1 : null;
  }

  /** Poškození vozidla zbraní; při zničení výbuch a hořící vrak. */
  hurtVehicle(v, n, p) {
    if (v.dead && v.burnT != null) return;
    v.hp = (v.hp ?? 100) - n;
    for (let i = 0; i < 4; i++) this.sparks.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5, 0.3, 9);
    if (v.hp > 0) return;
    this.wreck(v);
  }
  wreck(v, boom = true) {
    if (v.burnT != null) return;
    v.dead = true; v.hp = 0; v.burnT = 0;
    // ohořelý lak
    const black = new THREE.MeshStandardMaterial({ color: '#1d1b1a', roughness: 1 });
    v.mesh.traverse((o) => { if (o.isMesh && !o.material?.transparent && o.material?.type !== 'MeshBasicMaterial') o.material = black; });
    // oheň na vraku
    const H = v.mesh.userData.top || (v.L > 8 ? 3.2 : 1.8);
    v.flames = [];
    for (let i = 0; i < (v.L > 8 ? 6 : 3); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.userData = { lx: (Math.random() - 0.5) * (v.W || 2) * 0.6, lz: (Math.random() - 0.5) * (v.L || 4) * 0.7, h: H, ph: Math.random() * 6 };
      this.scene.add(sp); v.flames.push(sp);
    }
    this.burning.push(v);
    if (boom) this.queueBoom.push(new THREE.Vector3(v.x, v.y + 1, v.z));
  }
  updateBurning(dt) {
    for (const p of this.queueBoom.splice(0)) this.explode(p, true);
    const t = performance.now() / 1000;
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const v = this.burning[i];
      v.burnT += dt;
      const fade = Math.max(0, 1 - Math.max(0, v.burnT - 25) / 10);
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      for (const sp of v.flames) {
        const u = sp.userData, sc = (1.6 + Math.sin(t * 9 + u.ph) * 0.4) * fade;
        sp.position.set(v.x + u.lz * fx + u.lx * fz, v.y + u.h + sc * 0.4, v.z + u.lz * fz - u.lx * fx);
        sp.scale.set(sc, sc * 1.4, 1);
      }
      if (Math.random() < 0.5 * fade) this.dust.emit(v.x, v.y + 2.5, v.z, (Math.random() - 0.5), 2.5 + Math.random() * 2, (Math.random() - 0.5), 3, -0.6);
      if (fade <= 0 || !v.mesh.parent) { for (const sp of v.flames) this.scene.remove(sp); this.burning.splice(i, 1); }
    }
  }

  /**
   * Přejetí autem: každý, koho vozidlo zasáhne v rychlosti nad ~15 km/h, odletí ve směru jízdy.
   * Platí pro chodce ve městě, vězně, dozorce, vzbouřence i policisty.
   */
  runOver(v) {
    const sp = Math.hypot(v.vx || 0, v.vz || 0);
    if (sp < 4 || v.y - this.game.city.ground(v.x, v.z) > 2) return;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), L = (v.L || 4.5) / 2 + 0.35, W = (v.W || 2) / 2 + 0.35, R = L + W;
    const inside = (x, z) => {
      const dx = x - v.x, dz = z - v.z;
      if (Math.abs(dx) > R || Math.abs(dz) > R) return false;
      return Math.abs(dx * fx + dz * fz) < L && Math.abs(dx * fz - dz * fx) < W;
    };
    const dir = new THREE.Vector3(v.vx / sp, 0, v.vz / sp);
    const fling = () => dir.clone().multiplyScalar(sp * (0.8 + Math.random() * 0.4)).add(new THREE.Vector3((Math.random() - 0.5) * 3, 3 + sp * 0.35, (Math.random() - 0.5) * 3));
    let n = 0;
    const hit = (x, y, z, kill) => { this.bleed(new THREE.Vector3(x, y + 0.9, z), dir, 12); kill(dir, { vel: fling() }); n++; };
    const G = this.game;
    for (const p of [...G.peds]) if (p.state !== 'dead' && inside(p.mesh.position.x, p.mesh.position.z)) {
      const m = p.mesh.position; hit(m.x, m.y, m.z, (d, b) => { G.peds.splice(G.peds.indexOf(p), 1); this.corpse(p.mesh, d, b, null); });
    }
    const pl = G.prisonLife;
    if (pl) {
      for (const p of pl.pool) if (p.used && !p.dead && p.mesh.visible && inside(p.mesh.position.x, p.mesh.position.z)) {
        const m = p.mesh.position; hit(m.x, m.y, m.z, (d, b) => { p.dead = true; this.corpse(p.mesh, d, b, p); });
      }
      for (const C of [pl.mealCrowd, pl.riotCrowd, pl.policeCrowd]) {
        if (!C) continue;
        for (let i = 0; i < C.cap; i++) {
          if (!C.vis[i] || C.dead[i] || !inside(C.x[i], C.z[i])) continue;
          hit(C.x[i], C.y[i], C.z[i], (d, b) => { C.kill(i, d, b.vel); if (C === pl.riotCrowd && pl.riot) pl.riot.rs[i] = 4; pl.onCrowdKill?.(C, i); });
        }
      }
    }
    if (n) {
      G.audio?.noise?.(0.12, 0.6, 500);
      this.shake = Math.max(this.shake, 0.08 * Math.min(4, n));
      v.v *= Math.max(0.75, 1 - 0.03 * n); // každé tělo trochu přibrzdí
      if (v === G.vehicle) G.addWanted(n > 2 ? 2 : 1);
    }
  }

  /* ---------- ničení zdí, plotů a budov ---------- */
  /** Rozbije kus zdi / plotu: zmizí geometrie i kolize, odletí trosky. dir = směr nárazu. */
  breakPiece(pc, dx = 0, dz = 0) {
    if (pc.broken) return;
    pc.broken = true;
    for (const f of pc.f) f.off = true;
    if (pc.obst) { pc.obst.r = 0; pc.obst.h = -99; }
    for (const r of pc.ranges) {
      const a = r.mesh.geometry.attributes.position;
      for (let i = r.start; i < r.start + r.count; i++) a.setY(i, -500);
      a.needsUpdate = true;
    }
    const city = this.game.city, y = city.ground(pc.cx, pc.cz), wall = pc.kind === 'wall', mk = wall ? 'wall' : 'fence';
    this.debrisGeo ||= new THREE.BoxGeometry(1, 1, 1);
    this.debrisM ||= { wall: new THREE.MeshStandardMaterial({ color: '#cfcbc2', roughness: 0.95 }), fence: new THREE.MeshStandardMaterial({ color: '#9aa0a4', metalness: 0.6, roughness: 0.45 }) };
    const n = wall ? 7 : 3;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisM[mk]);
      const sz = wall ? 0.35 + Math.random() * 0.7 : 0.08;
      m.scale.set(wall ? sz : 1.4, wall ? sz * 0.7 : 1.2 + Math.random(), wall ? sz : sz);
      m.position.set(pc.cx + (Math.random() - 0.5) * 1.2, y + Math.random() * (wall ? 3 : 1.5), pc.cz + (Math.random() - 0.5) * 1.2);
      m.castShadow = true;
      this.scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3(dx * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3, 2 + Math.random() * 4, dz * (2 + Math.random() * 4) + (Math.random() - 0.5) * 3), spin: (Math.random() - 0.5) * 8, t: 0, half: (wall ? m.scale.y : 0.05) / 2 });
    }
    if (this.debris.length > 260) for (const d of this.debris.splice(0, this.debris.length - 260)) this.scene.remove(d.m);
    for (let k = 0; k < (wall ? 26 : 8); k++) this.dust.emit(pc.cx, y + Math.random() * 3, pc.cz, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 1.6, 4);
    const now = performance.now();
    if (now - (this.breakSnd || 0) > 90) { this.breakSnd = now; this.game.audio?.noise?.(wall ? 0.5 : 0.25, wall ? 0.7 : 0.4, wall ? 220 : 1400); }
  }
  /** Rozdrtí drobnost (lavička, budka, přístřešek…): zploští se nebo odletí, zmizí její kolize. */
  smashProp(pr, dx, dz, boom = false) {
    if (pr.broken) return;
    pr.broken = true;
    if (pr.obst) { pr.obst.r = 0; pr.obst.h = -99; }
    const o = pr.obj;
    if (pr.tree) { o.rotation.z = (dx >= 0 ? -1 : 1) * 1.45; o.rotation.y = Math.atan2(dx, dz); } // strom se skácí
    else if (boom) { o.visible = false; }
    else { o.scale.y = 0.12; o.position.y = this.game.city.ground(pr.x, pr.z) + 0.03; o.rotation.z += (Math.random() - 0.5) * 0.3; }
    const y = this.game.city.ground(pr.x, pr.z);
    this.debrisGeo ||= new THREE.BoxGeometry(1, 1, 1);
    this.propDebM ||= new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.9 });
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(this.debrisGeo, this.propDebM); const s2 = 0.12 + Math.random() * 0.25; m.scale.set(s2 * 2, s2 * 0.4, s2);
      m.position.set(pr.x, y + 0.5, pr.z); this.scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3(dx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, 2 + Math.random() * 3, dz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2), spin: (Math.random() - 0.5) * 9, t: 0, half: s2 * 0.2 });
    }
    for (let k = 0; k < 8; k++) this.dust.emit(pr.x, y + 0.5, pr.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 1.2, 4);
    const now = performance.now();
    if (now - (this.propSnd || 0) > 80) { this.propSnd = now; this.game.audio?.noise?.(0.2, 0.5, 900); }
  }
  /** Tank přejede drobnosti před sebou i pod sebou. */
  crushProps(v) {
    const fx = Math.sin(v.h), fz = Math.cos(v.h), dir = Math.sign(v.v || 1);
    for (const pr of this.game.city.props || []) {
      if (pr.broken || Math.abs(pr.x - v.x) > 8 || Math.abs(pr.z - v.z) > 8) continue;
      const dx = pr.x - v.x, dz = pr.z - v.z;
      if (Math.abs(dx * fx + dz * fz) < v.L / 2 + pr.r && Math.abs(dx * fz - dz * fx) < v.W / 2 + pr.r * 0.6) this.smashProp(pr, fx * dir, fz * dir);
    }
  }
  /** Výbuch rozbije zdi a ploty v okruhu r. */
  breakNear(x, z, r) {
    for (const pr of this.game.city.props || []) {
      if (pr.broken || Math.abs(pr.x - x) > r || Math.abs(pr.z - z) > r) continue;
      const d = Math.hypot(pr.x - x, pr.z - z);
      if (d < r) this.smashProp(pr, (pr.x - x) / (d || 1), (pr.z - z) / (d || 1), true);
    }
    for (const pc of this.game.city.breakables || []) {
      if (pc.broken || Math.abs(pc.cx - x) > r + 2 || Math.abs(pc.cz - z) > r + 2) continue;
      const d = Math.hypot(pc.cx - x, pc.cz - z);
      if (d < (pc.kind === 'wall' ? r * 0.6 : r)) this.breakPiece(pc, (pc.cx - x) / (d || 1), (pc.cz - z) / (d || 1));
    }
  }
  /** Tank (nebo rychlé auto u plotu) prorazí, co má před sebou. */
  ramBreak(v, walls, push = null) {
    const sp = Math.hypot(v.vx || 0, v.vz || 0);
    if (push == null && sp < 1.2) return;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), dir = push ?? Math.sign(v.v || 1);
    const px = v.x + fx * dir * (v.L / 2 + 0.4), pz = v.z + fz * dir * (v.L / 2 + 0.4), R = v.W / 2 + 0.9;
    for (const pc of this.game.city.breakables || []) {
      if (pc.broken || (!walls && pc.kind === 'wall') || Math.abs(pc.cx - px) > R + 2 || Math.abs(pc.cz - pz) > R + 2) continue;
      // vzdálenost od úseku kusu
      const ex = pc.x1 - pc.x0, ez = pc.z1 - pc.z0, l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((px - pc.x0) * ex + (pz - pc.z0) * ez) / l2));
      if (Math.hypot(pc.x0 + ex * t - px, pc.z0 + ez * t - pz) < R) this.breakPiece(pc, fx * dir, fz * dir);
    }
  }
  /** Tank přejede auto: zmačká ho (zploštělý vrak). */
  crushCars(v) {
    if (Math.hypot(v.vx || 0, v.vz || 0) < 1) return;
    for (const o of this.game.allVehicles()) {
      if (o === v || o.crushed || o.kind === 'heli' || !o.mesh?.visible) continue;
      if (Math.hypot(o.x - v.x, o.z - v.z) > (v.L + o.L) * 0.42) continue;
      o.crushed = true;
      if (o.burnT == null) this.wreck(o, false);
      o.mesh.scale.y = 0.38; o.v = o.vx = o.vz = 0;
      this.game.audio?.crash?.(30);
      this.shake = Math.max(this.shake, 0.35);
    }
  }
  updateDebris(dt) {
    const city = this.game.city;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (d.rest) continue;
      d.v.y -= 9.8 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.spin * dt; d.m.rotation.z += d.spin * 0.7 * dt;
      const gy = city.ground(d.m.position.x, d.m.position.z) + d.half;
      if (d.m.position.y < gy) { d.m.position.y = gy; d.v.multiplyScalar(0.35); d.v.y = Math.abs(d.v.y) * 0.3; if (d.v.length() < 0.6) { d.rest = true; d.m.rotation.x = Math.round(d.m.rotation.x / (Math.PI / 2)) * (Math.PI / 2); } }
    }
  }
  /** Díra do budovy po zásahu raketou: tmavý otvor s otlučeným okrajem na stěně, trosky a prach. */
  holeInBuilding(p, b) {
    // nejbližší stěna → normála ven
    const q = b.p;
    let bd = 1e9, nx = 0, nz = 0;
    for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) {
      const ax = q[j], az = q[j + 1], ex = q[i] - ax, ez = q[i + 1] - az, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.z - az) * ez) / l2));
      const cx = ax + ex * t, cz = az + ez * t, d = Math.hypot(p.x - cx, p.z - cz);
      if (d < bd) { bd = d; const l = Math.sqrt(l2); nx = ez / l; nz = -ex / l; }
    }
    // normála musí mířit ven z budovy
    const cxB = b.cx, czB = b.cz;
    if ((p.x - cxB) * nx + (p.z - czB) * nz < 0) { nx = -nx; nz = -nz; }
    if (!this.holeT) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const ring = (r0, col) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k <= 28; k++) { const a = (k / 28) * Math.PI * 2, r = r0 * (0.75 + Math.random() * 0.35); g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.closePath(); g.fill(); };
      ring(122, 'rgba(70,64,58,0.55)'); ring(104, '#9a8f84'); ring(88, '#5e554d'); ring(72, '#1d1a18'); ring(52, '#0a0909');
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(30,26,22,${Math.random() * 0.5})`; g.fillRect(128 + (Math.random() - 0.5) * 230, 128 + (Math.random() - 0.5) * 230, 4, 4); }
      this.holeT = new THREE.CanvasTexture(c); this.holeT.colorSpace = THREE.SRGBColorSpace;
    }
    const sz = 2.2 + Math.random() * 1.2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshStandardMaterial({ map: this.holeT, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4 }));
    const y = Math.min(Math.max(p.y, b.g + sz / 2), b.h - 0.5);
    m.position.set(p.x + nx * 0.06, y, p.z + nz * 0.06);
    m.rotation.set(0, Math.atan2(nx, nz), Math.random() * 6);
    this.scene.add(m);
    this.holes.push(m);
    if (this.holes.length > 160) this.scene.remove(this.holes.shift());
    // trosky z díry
    this.debrisGeo ||= new THREE.BoxGeometry(1, 1, 1);
    this.holeDebM ||= new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.95 });
    for (let k = 0; k < 6; k++) {
      const d = new THREE.Mesh(this.debrisGeo, this.holeDebM); const s2 = 0.2 + Math.random() * 0.4; d.scale.set(s2, s2 * 0.7, s2);
      d.position.set(p.x + nx * 0.5, y, p.z + nz * 0.5); d.castShadow = true; this.scene.add(d);
      this.debris.push({ m: d, v: new THREE.Vector3(nx * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2, 1 + Math.random() * 3, nz * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2), spin: (Math.random() - 0.5) * 8, t: 0, half: s2 * 0.35 });
    }
  }

  /* ---------- střelba ---------- */
  muzzle() {
    const v = new THREE.Vector3(0, 0.03, 0.3);
    this.gunMeshes[this.slot]?.localToWorld(v);
    return v;
  }
  fire() {
    const w = WEAPONS[this.slot], G = this.game, cam = G.camera;
    const O = cam.position.clone(), D0 = new THREE.Vector3();
    cam.getWorldDirection(D0);
    // začni paprsek až u hráče (kamera je za ním)
    const P = G.player;
    const along = (P.x - O.x) * D0.x + (P.y + 1.4 - O.y) * D0.y + (P.z - O.z) * D0.z;
    O.addScaledVector(D0, Math.max(0, along));
    const M = this.muzzle();
    let killed = 0;
    for (let k = 0; k < w.pellets; k++) {
      const D = D0.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * w.spread, (Math.random() - 0.5) * 2 * w.spread, (Math.random() - 0.5) * 2 * w.spread)).normalize();
      const hit = this.cast(O, D, w.range);
      this.tracer(M, hit.p);
      if (hit.vehicle) {
        this.hurtVehicle(hit.vehicle, w.pellets > 1 ? 3 : w.auto ? 4 : 9, hit.p);
      } else if (hit.target) {
        this.bleed(hit.p, D, w.pellets > 1 ? 10 : 22);
        hit.target.kill(D, false);
        killed++;
      } else {
        for (let i = 0; i < 6; i++) this.dust.emit(hit.p.x, hit.p.y, hit.p.z, (Math.random() - 0.5) * 2 - D.x * 1.5, Math.random() * 2, (Math.random() - 0.5) * 2 - D.z * 1.5, 0.6, 6);
        for (let i = 0; i < 3; i++) this.sparks.emit(hit.p.x, hit.p.y, hit.p.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.25, 9);
      }
    }
    this.casing(M, D0);
    // záblesk, světlo, zvuk, zpětný ráz
    this.flash.position.copy(M); this.flash.visible = true; this.flash.material.rotation = Math.random() * 6;
    this.flashT0 = 0.05;
    this.light.position.copy(M); this.light.intensity = 6; this.light.distance = 14;
    G.audio?.noise?.(...w.sound);
    this.shake = Math.max(this.shake, w.pellets > 1 ? 0.18 : 0.05);
    // následky: lidé utíkají, policie si všimne
    for (const p of G.peds) if (p.state !== 'dead' && Math.hypot(p.x - P.x, p.z - P.z) < 35) { p.state = 'flee'; p.timer = 8; }
    const cops = G.police.some((c) => Math.hypot(c.veh.x - P.x, c.veh.z - P.z) < 120);
    if (killed) G.addWanted(killed > 1 ? 2 : 1);
    else if (cops && (G.time - (this.lastShotWanted || -9)) > 4) { this.lastShotWanted = G.time; G.addWanted(1); }
  }

  npcShot(a, b) {
    if (this.fx.length < 120) this.tracer(a, b);
    this.sparks.emit(a.x, a.y, a.z, (Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2, 0.08, 0);
    const now = performance.now();
    if (now - (this.npcSnd || 0) > 45) { this.npcSnd = now; this.game.audio?.noise?.(0.06, 0.18, 2400); }
  }

  /** Nábojnice vyletí doprava nahoru, odskočí od země a chvíli leží. */
  casing(M, D) {
    this.casings ||= [];
    this.casingGeo ||= new THREE.CylinderGeometry(0.012, 0.012, 0.04, 6);
    this.casingMat ||= new THREE.MeshStandardMaterial({ color: '#c9a043', metalness: 0.9, roughness: 0.3 });
    const m = new THREE.Mesh(this.casingGeo, this.casingMat);
    m.position.copy(M);
    this.scene.add(m);
    const rx = -D.z, rz = D.x;
    this.casings.push({ m, v: new THREE.Vector3(rx * 1.8 + (Math.random() - 0.5) * 0.4, 2 + Math.random(), rz * 1.8 + (Math.random() - 0.5) * 0.4), t: 0 });
    if (this.casings.length > 80) this.scene.remove(this.casings.shift().m);
  }
  updateCasings(dt) {
    if (!this.casings) return;
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.t += dt;
      if (c.v) {
        c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += dt * 20; c.m.rotation.z += dt * 13;
        const gy = this.game.city.surface(c.m.position.x, c.m.position.z) + 0.012;
        if (c.m.position.y < gy) { c.m.position.y = gy; if (c.v.y < -1.5) { c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5; } else { c.v = null; c.m.rotation.set(0, Math.random() * 6, Math.PI / 2); } }
      }
      if (c.t > 25) { this.scene.remove(c.m); this.casings.splice(i, 1); }
    }
  }

  tracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    this.scene.add(line);
    this.fx.push({ obj: line, t: 0, life: 0.07, kind: 'tracer' });
  }

  /** Krev: sprška kapek ve směru střely; kapky na zemi tvoří skvrny. */
  bleed(p, D, n) {
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 3.5;
      this.blood.emit(p.x, p.y, p.z, D.x * s + (Math.random() - 0.5) * 1.6, Math.random() * 2.2 + 0.3, D.z * s + (Math.random() - 0.5) * 1.6, 1.4);
    }
    for (let i = 0; i < 4; i++) this.blood.emit(p.x, p.y, p.z, -D.x * 1.2 + (Math.random() - 0.5), Math.random() * 1.5, -D.z * 1.2 + (Math.random() - 0.5), 1.0);
  }
  bloodPool(x, z, r = 0.9, grow = 5) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), this.poolMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, this.game.city.surface(x, z) + 0.035, z);
    m.scale.set(0.05, 0.05, 0.05);
    m.userData = { r: r * (0.8 + Math.random() * 0.5), grow, t: 0 };
    this.scene.add(m);
    this.pools.push(m);
    if (this.pools.length > 90) this.scene.remove(this.pools.shift());
  }

  /* ---------- mrtvá těla ---------- */
  corpse(mesh, dir, boom, poolPerson) {
    const c = { mesh, t: 0, poolPerson, dir: dir.clone().setY(0).normalize(), mode: boom ? 'fly' : 'fall', bled: false };
    if (!boom) {
      // otočit čelem ke střelci → padá dozadu, ve směru střely
      mesh.rotation.y = Math.atan2(-c.dir.x, -c.dir.z);
      c.slide = 1.6 + Math.random();
    } else {
      c.vel = boom.vel; c.spin = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
    }
    this.corpses.push(c);
  }
  updateCorpses(dt) {
    const city = this.game.city;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i], m = c.mesh;
      c.t += dt;
      if (c.mode === 'fly') {
        c.vel.y -= 9.8 * dt;
        m.position.addScaledVector(c.vel, dt);
        m.rotation.x += c.spin.x * dt; m.rotation.z += c.spin.z * dt; m.rotation.y += c.spin.y * dt;
        const gy = city.surface(m.position.x, m.position.z);
        const bd = city.buildingAt(m.position.x, m.position.z);
        if (bd && m.position.y < bd.h) { c.vel.x *= -0.3; c.vel.z *= -0.3; m.position.addScaledVector(c.vel, dt * 2); }
        if (m.position.y <= gy && c.vel.y < 0) {
          m.position.y = gy;
          if (Math.abs(c.vel.y) > 4) { c.vel.y *= -0.25; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.4); }
          else {
            // dopad: leží
            c.mode = 'lie';
            m.rotation.x = 0; m.rotation.z = 0;
            const u = m.userData;
            const a = u.actions?.Death;
            if (a) { u.cur?.stop(); a.reset(); a.play(); a.time = a.getClip().duration * 0.92; u.cur = a; u.mixer.update(0); }
            else m.rotation.x = -Math.PI / 2;
            this.bloodPool(m.position.x, m.position.z, 1.1, 3);
          }
        }
        continue;
      }
      if (c.mode === 'fall') {
        // odsunutí zásahem a pád
        const s = c.slide * Math.max(0, 1 - c.t / 0.45);
        m.position.x += c.dir.x * s * dt; m.position.z += c.dir.z * s * dt;
        m.position.y = city.surface(m.position.x, m.position.z);
        if (m.userData.kit) {
          const u = m.userData;
          if (u.cur !== u.actions.Death) { const a = u.actions.Death; if (a) { a.reset(); a.timeScale = 1.1 + Math.random() * 0.3; a.play(); if (u.cur) a.crossFadeFrom(u.cur, 0.08, false); u.cur = a; } }
          u.mixer.update(dt);
        } else m.rotation.x = Math.max(-Math.PI / 2, m.rotation.x - dt * 5);
        if (c.t > 0.9 && !c.bled) { c.bled = true; this.bloodPool(m.position.x - c.dir.x * 0.4, m.position.z - c.dir.z * 0.4); }
        if (c.t > 1.6) c.mode = 'lie';
      }
      if (c.t > 120) {
        // po dvou minutách tělo zmizí
        if (c.poolPerson) { c.poolPerson.dead = false; c.poolPerson.used = false; m.visible = false; m.rotation.set(0, 0, 0); }
        else this.scene.remove(m);
        this.corpses.splice(i, 1);
      }
    }
  }

  /* ---------- granát ---------- */
  throwGrenade() {
    const G = this.game, cam = G.camera, D = new THREE.Vector3();
    cam.getWorldDirection(D);
    const start = this.muzzle();
    const vel = D.clone().multiplyScalar(17).add(new THREE.Vector3(0, 5.5, 0));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({ color: '#3f4a2c', roughness: 0.6 }));
    mesh.position.copy(start);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.grenades.push({ mesh, vel, t: 0 });
    G.audio?.blip?.(300, 0.08, 'triangle', 0.08, -120);
  }
  /** Kanón stíhačky: rychlá dávka po směru letu (trasovací střely). */
  jetBurst(O, D) {
    const D2 = D.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012)).normalize();
    const hit = this.cast(O, D2, 420);
    this.tracer(O, hit.p);
    if (hit.vehicle) this.hurtVehicle(hit.vehicle, 14, hit.p);
    else if (hit.target) { this.bleed(hit.p, D2, 16); hit.target.kill(D2, false); this.game.addWanted(1); }
    else { for (let i = 0; i < 5; i++) this.dust.emit(hit.p.x, hit.p.y, hit.p.z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.7, 6); for (let i = 0; i < 3; i++) this.sparks.emit(hit.p.x, hit.p.y, hit.p.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 0.25, 9); }
    const now = performance.now();
    if (now - (this.jetSnd || 0) > 40) { this.jetSnd = now; this.game.audio?.noise?.(0.06, 0.45, 2600); }
  }

  /**
   * Pěstní souboj: rána tomu, kdo stojí před hráčem (do 1,7 m). Třetí rána ho složí k zemi.
   * Platí pro chodce, vězně, dozorce, vzbouřence i policisty.
   */
  punch() {
    const G = this.game, P = G.player;
    G.punchT = 0.45;
    P.mesh.userData.punchNew = true;
    const fx = Math.sin(P.h), fz = Math.cos(P.h);
    let best = null, bd = 1.7;
    for (const t of this.targets()) {
      const q = t.mesh.position, dx = q.x - P.x, dz = q.z - P.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(q.y - P.y) > 1.2) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.35) continue; // jen před sebou
      bd = d; best = t;
    }
    G.audio?.noise?.(0.06, 0.18, 1800); // švih
    if (!best) return;
    const q = best.mesh.position, D = new THREE.Vector3(fx, 0, fz);
    const key = best.key || best.mesh;
    this.punchHp ||= new Map();
    const hp = (this.punchHp.get(key) ?? 3) - 1;
    this.punchHp.set(key, hp);
    this.bleed(new THREE.Vector3(q.x, q.y + 1.55, q.z), D, 4);
    G.audio?.noise?.(0.09, 0.7, 320); G.audio?.blip?.(90, 0.08, 'square', 0.12, -40);
    this.shake = Math.max(this.shake, 0.06);
    if (hp <= 0) { best.kill(D, { vel: D.clone().multiplyScalar(3).add(new THREE.Vector3(0, 2.5, 0)) }); this.punchHp.delete(key); this.fighters = (this.fighters || []).filter((f) => f.key !== key); }
    else if (!(this.fighters ||= []).some((f) => f.key === key) && this.fighters.length < 3) this.fighters.push({ key, t: best, next: G.time + 0.7 + Math.random() * 0.4 }); // brání se
    else if (best.mesh.isObject3D) { best.mesh.position.x += fx * 0.35; best.mesh.position.z += fz * 0.35; } // zavrávorá
    for (const p of G.peds) if (p.mesh === best.mesh) { p.state = 'flee'; p.timer = 8; p.x += fx * 0.35; p.z += fz * 0.35; }
    if (hp === 2 && G.police.some((c) => Math.hypot(c.veh.x - P.x, c.veh.z - P.z) < 90)) G.addWanted(1);
    if (hp <= 0) G.addWanted(1);
  }

  /** Kdo dostal ránu, brání se: jde k hráči a vrací rány (slabší a pomalejší než hráč). */
  updateFighters(dt) {
    const G = this.game, P = G.player;
    if (!this.fighters?.length) return;
    for (let i = this.fighters.length - 1; i >= 0; i--) {
      const f = this.fighters[i], t = f.t;
      const alive = t.crowd ? t.crowd.vis[t.ci] && !t.crowd.dead[t.ci] : (t.mesh.visible !== false && !G.weapons.corpses.some((c) => c.mesh === t.mesh));
      const q = t.crowd ? { x: t.crowd.x[t.ci], y: t.crowd.y[t.ci], z: t.crowd.z[t.ci] } : t.mesh.position;
      const dx = P.x - q.x, dz = P.z - q.z, d = Math.hypot(dx, dz);
      if (!alive || d > 9 || G.mode !== 'foot' || P.hp <= 0) { this.fighters.splice(i, 1); continue; }
      const h = Math.atan2(dx, dz);
      if (t.crowd) t.crowd.h[t.ci] = h;
      else {
        t.mesh.rotation.y = h;
        if (d > 1.3) { const s = Math.min(d - 1.2, 3.2 * dt); t.mesh.position.x += (dx / d) * s; t.mesh.position.z += (dz / d) * s; } // jde po hráči
        const ped = G.peds.find((p) => p.mesh === t.mesh); if (ped) { ped.x = t.mesh.position.x; ped.z = t.mesh.position.z; ped.state = 'fight'; ped.timer = 3; }
      }
      if (d < 1.8 && G.time >= f.next) {
        f.next = G.time + 1.4 + Math.random() * 0.7;
        if (!t.crowd) { t.mesh.userData.punchNew = true; t.mesh.userData.punchT = 0.45; }
        if (Math.random() < 0.6) { // zásah
          G.hurt(3 + Math.round(Math.random() * 3), 'rvačka');
          this.bleed(new THREE.Vector3(P.x, P.y + 1.55, P.z), new THREE.Vector3(-dx / (d || 1), 0, -dz / (d || 1)), 3);
          G.audio?.noise?.(0.08, 0.6, 360);
          this.shake = Math.max(this.shake, 0.12);
        } else G.audio?.noise?.(0.06, 0.18, 1600); // vedle
      }
    }
  }

  /** Bazuka: raketa letí tam, kam míří kamera. */
  fireBazooka() {
    const G = this.game, cam = G.camera, D = new THREE.Vector3();
    cam.getWorldDirection(D);
    const P = G.player, O = cam.position.clone();
    const along = (P.x - O.x) * D.x + (P.y + 1.4 - O.y) * D.y + (P.z - O.z) * D.z;
    O.addScaledVector(D, Math.max(0, along) + 1.2);
    this.fireRocket(O, D, false);
    this.shake = Math.max(this.shake, 0.25);
  }
  /** Raketa z bodu O ve směru D (bazuka i tank); po zásahu výbuch. */
  fireRocket(O, D, npc = false, speed = 70) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10), new THREE.MeshStandardMaterial({ color: '#4b5a32', roughness: 0.5 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#2b2b2b' }));
    body.rotation.x = Math.PI / 2; tip.rotation.x = Math.PI / 2; tip.position.z = 0.4;
    const glowM = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glowM.position.z = -0.4; glowM.scale.set(0.7, 0.7, 1);
    mesh.add(body, tip, glowM);
    mesh.position.copy(O);
    mesh.lookAt(O.clone().add(D));
    this.scene.add(mesh);
    this.rockets.push({ mesh, D: D.clone().normalize(), speed, t: 0, npc });
    this.flash.position.copy(O); this.flash.visible = true; this.flashT0 = 0.08;
    this.game.audio?.noise?.(0.45, 0.8, 600); this.game.audio?.blip?.(180, 0.4, 'sawtooth', 0.12, -100);
  }
  updateRockets(dt) {
    const city = this.game.city;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i], m = r.mesh;
      r.t += dt;
      const step = r.speed * dt;
      const hit = this.cast(m.position, r.D, step + 0.5);
      const P = m.position;
      let boom = null;
      if (hit.vehicle || hit.target || hit.wall) boom = hit.p;
      else if (P.y < city.surface(P.x, P.z) + 0.1 || r.t > 4) boom = P.clone();
      if (boom) {
        this.scene.remove(m); this.rockets.splice(i, 1);
        if (hit.vehicle) this.wreck(hit.vehicle);
        if (hit.wall) { const b = city.buildingAt(boom.x - r.D.x * 0.3, boom.z - r.D.z * 0.3) || city.buildingAt(boom.x + r.D.x * 0.5, boom.z + r.D.z * 0.5); if (b) this.holeInBuilding(boom, b); }
        this.explode(boom, r.npc);
        continue;
      }
      P.addScaledVector(r.D, step);
      r.D.y -= 0.6 * dt / r.speed; // nepatrný pokles
      if (Math.random() < 0.9) this.dust.emit(P.x - r.D.x * 0.5, P.y - r.D.y * 0.5, P.z - r.D.z * 0.5, (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, 1.2, -0.3);
    }
  }

  /** Granát hozený odjinud (policie): oblouk z bodu o do bodu t. */
  throwFrom(o, t, npc = true) {
    const T = 1.25, vel = new THREE.Vector3((t.x - o.x) / T, (t.y - o.y) / T + 4.9 * T, (t.z - o.z) / T);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#2f3b22', roughness: 0.6 }));
    mesh.position.set(o.x, o.y, o.z);
    this.scene.add(mesh);
    this.grenades.push({ mesh, vel, t: 0, npc });
  }

  updateGrenades(dt) {
    const city = this.game.city;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i], m = g.mesh;
      g.t += dt;
      g.vel.y -= 9.8 * dt;
      const prev = m.position.clone();
      m.position.addScaledVector(g.vel, dt);
      m.rotation.x += dt * 8;
      const bd = city.buildingAt(m.position.x, m.position.z);
      if (bd && m.position.y < bd.h) { m.position.copy(prev); g.vel.x *= -0.4; g.vel.z *= -0.4; }
      const gy = city.surface(m.position.x, m.position.z) + 0.09;
      if (m.position.y < gy) { m.position.y = gy; g.vel.y = Math.abs(g.vel.y) * 0.32; g.vel.x *= 0.6; g.vel.z *= 0.6; if (g.vel.y > 1) this.game.audio?.blip?.(900, 0.03, 'square', 0.03); }
      if (g.t > (g.npc ? 1.6 : FUSE)) { this.scene.remove(m); this.grenades.splice(i, 1); this.explode(m.position.clone(), g.npc); }
    }
  }

  explode(p, npc = false) {
    const G = this.game, city = G.city;
    // ohnivá koule, jádro, rázová vlna, kouř, jiskry, ožehnutí
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fire.position.copy(p).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(fire);
    this.fx.push({ obj: fire, t: 0, life: 0.75, kind: 'fire' });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.copy(p).add(new THREE.Vector3(0, 0.6, 0));
    this.scene.add(core);
    this.fx.push({ obj: core, t: 0, life: 0.28, kind: 'core' });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p).setY(city.surface(p.x, p.z) + 0.15);
    this.scene.add(ring);
    this.fx.push({ obj: ring, t: 0, life: 0.5, kind: 'ring' });
    for (let k = 0; k < 18; k++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeT, transparent: true, depthWrite: false, opacity: 0.8 }));
      sm.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3));
      sm.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5);
      sm.material.rotation = Math.random() * 6;
      this.scene.add(sm);
      this.fx.push({ obj: sm, t: -k * 0.02, life: 6 + Math.random() * 3, kind: 'smoke' });
    }
    for (let k = 0; k < 120; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = 6 + Math.random() * 16;
      this.sparks.emit(p.x, p.y + 0.4, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, 0.5 + Math.random() * 0.7, 12);
    }
    for (let k = 0; k < 40; k++) this.dust.emit(p.x, p.y + 0.2, p.z, (Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10, 1.5, 8);
    const sc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), this.scorchMat);
    sc.rotation.x = -Math.PI / 2;
    sc.position.copy(p).setY(city.surface(p.x, p.z) + 0.04);
    this.scene.add(sc);
    this.pools.push(sc);
    this.light.position.copy(p).add(new THREE.Vector3(0, 2, 0)); this.light.intensity = 40; this.light.distance = 45;
    this.boomLight = 0.6;
    G.audio?.noise?.(1.4, 0.95, 160); G.audio?.blip?.(70, 0.8, 'sine', 0.5, -45);
    // otřes kamery podle vzdálenosti
    const F = G.focus() || G.player;
    this.shake = Math.max(this.shake, 1.4 * Math.max(0, 1 - Math.hypot(F.x - p.x, F.z - p.z) / 70));
    // lidé: v dosahu zabití odletí, dál jen utečou
    let killed = 0;
    for (const t of this.targets()) {
      const m = t.mesh.position, dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz) || 0.1;
      if (d < KILL_R) {
        const f = 1 - d / KILL_R;
        const dir = new THREE.Vector3(dx / d, 0, dz / d);
        const vel = dir.clone().multiplyScalar(5 + 17 * f).add(new THREE.Vector3(0, 5 + 9 * f + Math.random() * 2, 0));
        this.bleed(new THREE.Vector3(m.x, m.y + 1, m.z), dir, 14);
        t.kill(dir, { vel });
        killed++;
      }
    }
    for (const q of G.peds) if (q.state !== 'dead' && Math.hypot(q.x - p.x, q.z - p.z) < 60) { q.state = 'flee'; q.timer = 10; }
    // zdi a ploty v okolí
    this.breakNear(p.x, p.z, 4.5);
    // vozidla odhodí a poškodí
    for (const v of G.allVehicles()) {
      const dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz) || 0.1;
      if (d > PUSH_R) continue;
      const f = 1 - d / PUSH_R;
      v.vx = (v.vx || 0) + (dx / d) * 12 * f; v.vz = (v.vz || 0) + (dz / d) * 12 * f;
      if (v === G.vehicle) { v.hp = (v.hp ?? 100) - 90 * f; if (v.hp <= 0) v.dead = true; continue; }
      v.hp = (v.hp ?? 100) - 120 * f;
      if (v.hp <= 0) this.wreck(v);
    }
    // hráč sám
    const P = G.player;
    const dp = Math.hypot(P.x - p.x, P.z - p.z);
    if (G.mode === 'foot' && dp < KILL_R) G.hurt(Math.round(110 * (1 - dp / KILL_R)), 'výbuch');
    if (!npc) G.addWanted(killed ? 2 : 1);
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t < 0) continue;
      const k = f.t / f.life, o = f.obj;
      if (f.kind === 'tracer') o.material.opacity = 0.9 * (1 - k);
      else if (f.kind === 'fire') { const s = 2 + 9 * Math.min(1, k * 2.2); o.scale.set(s, s, s); o.material.opacity = Math.max(0, 1 - k * k); o.position.y += dt * 2; }
      else if (f.kind === 'core') { const s = 0.5 + 3.5 * k; o.scale.set(s, s, s); o.material.opacity = 1 - k; }
      else if (f.kind === 'ring') { const s = 1 + 15 * k; o.scale.set(s, s, s); o.material.opacity = 0.8 * (1 - k); }
      else if (f.kind === 'smoke') {
        o.position.addScaledVector(o.userData.v, dt); o.userData.v.multiplyScalar(1 - dt * 0.6);
        const s = 2 + 5 * k; o.scale.set(s, s, s); o.material.opacity = 0.75 * (1 - k);
      }
      if (f.t >= f.life) { this.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); this.fx.splice(i, 1); }
    }
    for (const m of this.pools) {
      const u = m.userData;
      if (u.r && u.t < u.grow) { u.t += dt; const s = u.r * Math.min(1, u.t / u.grow); m.scale.set(s, s, s); }
    }
    if (this.flashT0 > 0) { this.flashT0 -= dt; if (this.flashT0 <= 0) this.flash.visible = false; }
    if (this.boomLight > 0) { this.boomLight -= dt; this.light.intensity = 40 * Math.max(0, this.boomLight / 0.6); }
    else this.light.intensity *= Math.max(0, 1 - dt * 30);
  }

  update(dt) {
    const G = this.game, inp = G.input;
    let pick = null;
    for (let k = 0; k < NW; k++) if (inp.hit('Digit' + k) || inp.hit('Numpad' + k)) pick = k;
    if (inp.hit('Digit6') || inp.hit('Numpad6')) pick = 0; // 6 = pěsti (jako 0)
    // Q / kolečko myši: další zbraň dokola (0 → 1 → … → bazuka → 0)
    if (inp.hit('KeyQ')) pick = (this.slot + 1) % NW;
    if (inp.wheel) { pick = (this.slot + (inp.wheel > 0 ? 1 : NW - 1)) % NW; inp.wheel = 0; }
    if (G.mode !== 'foot') pick = null; // v autě / stíhačce čísla patří vozidlu
    if (pick !== null && pick !== this.slot) {
      this.slot = pick;
      G.audio?.blip?.(500 + pick * 60, 0.05, 'square', 0.04);
      const w = WEAPONS[pick];
      G.toast?.(w ? `${w.icon} ${w.name}` : '👊 Pěsti (6) – myš / F = rána');
      this.updateHud();
    }
    const onFoot = G.mode === 'foot' && G.player.hp > 0;
    this.gunMeshes.forEach((m, k) => { if (m) m.visible = onFoot && k === this.slot; });
    this.cool -= dt;
    const w = WEAPONS[this.slot];
    // pěsti (bez zbraně): myš / F / K = rána
    if (onFoot && !w && (inp.hit('Mouse0') || inp.hit('KeyF') || inp.hit('KeyK')) && this.cool <= 0) { this.cool = 0.42; this.punch(); }
    if (onFoot && w) {
      // hráč míří tam, kam kamera
      G.player.h = G.camYaw;
      G.player.mesh.rotation.y = G.camYaw;
      // střelba: levé tlačítko myši nebo klávesa F
      const want = w.auto ? inp.mouseBtn || inp.down('KeyK') || inp.down('KeyF') || inp.down('KeyM') : inp.hit('Mouse0') || inp.hit('KeyK') || inp.hit('KeyF') || inp.hit('KeyM');
      if (want && this.cool <= 0) {
        this.cool = w.rate;
        if (w.grenade) this.throwGrenade(); else if (w.rocket) this.fireBazooka(); else this.fire();
      }
    }
    const ground = (x, z) => G.city.surface(x, z);
    this.blood.update(dt, ground, (x, z) => { if (Math.random() < 0.12) this.bloodPool(x, z, 0.18 + Math.random() * 0.2, 0.6); });
    this.sparks.update(dt, ground);
    this.dust.update(dt, ground);
    this.updateCorpses(dt);
    this.updateCasings(dt);
    this.updateGrenades(dt);
    this.updateBurning(dt);
    this.updateFighters(dt);
    this.updateRockets(dt);
    this.updateDebris(dt);
    this.updateFx(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) { this.hudT = 0.25; this.updateHud(); }
  }

  /** Restart: zmizí mrtvá těla, krev, granáty a efekty. */
  clearAll() {
    for (const v of this.burning) for (const sp of v.flames) this.scene.remove(sp);
    this.burning.length = 0; this.queueBoom.length = 0;
    for (const r of this.rockets) this.scene.remove(r.mesh);
    this.rockets.length = 0;
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris.length = 0;
    for (const h of this.holes) this.scene.remove(h);
    this.holes.length = 0;
    for (const c of this.corpses) {
      if (c.poolPerson) { c.poolPerson.dead = false; c.poolPerson.used = false; c.mesh.visible = false; c.mesh.rotation.set(0, 0, 0); }
      else this.scene.remove(c.mesh);
    }
    this.corpses.length = 0;
    for (const m of this.pools) this.scene.remove(m);
    this.pools.length = 0;
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades.length = 0;
    for (const f of this.fx) this.scene.remove(f.obj);
    this.fx.length = 0;
    for (const c of this.casings || []) this.scene.remove(c.m);
    if (this.casings) this.casings.length = 0;
    for (const P of [this.blood, this.sparks, this.dust]) { P.life.fill(0); P.pos.fill(-9999); P.points.geometry.attributes.position.needsUpdate = true; }
  }

  /** Otřes kamery (volá se po nastavení kamery). */
  applyShake(cam) {
    if (this.shake <= 0) return;
    const s = this.shake * 0.35;
    cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
  }
}
