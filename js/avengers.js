/*
 * AVENGERS + HVĚZDNÁ BRÁNA na party: pět hrdinů na pódiu (Iron Man, Kapitán Amerika, Thor, Spider-Man, Hulk),
 * ovladač s povely (hody kladivem a sekerou, smash, houpání na pavučině, let a střelba), převzetí hrdiny jako
 * vlastního avatara, povely pro všechny (Stage 2, zpívat, útok na lidi), hvězdná brána před DJ, schody ze Stage 2
 * a průchod lidí bránou. Vše stojí na pódiu z party.js (souřadnice f = vpřed od pódia, r = do strany).
 */
import * as THREE from 'three';
import { makeHuman, animateHuman } from './entities.js?v=20261127234448';

const HEROES = [
  { id: 'iron', name: 'Iron Man', model: 'Casual_Male', shirt: '#b3121d', pants: '#8f0e17', hat: '#b3121d', skin: '#e0a800', scale: 1.3, r: -6, speed: 4 },
  { id: 'cap', name: 'Kapitán Amerika', model: 'Casual2_Male', shirt: '#1f4fa8', pants: '#1a3f86', hat: '#1f4fa8', skin: '#f1c9a5', scale: 1.3, r: -3, speed: 4.5 },
  { id: 'thor', name: 'Thor', model: 'Casual3_Male', shirt: '#2a2d36', pants: '#22242b', hat: '#f2d15c', skin: '#f1c9a5', scale: 1.4, r: 0, speed: 4 },
  { id: 'spidey', name: 'Spider-Man', model: 'Casual_Bald', shirt: '#c4161c', pants: '#1b3fa0', hat: '#c4161c', skin: '#c4161c', scale: 1.2, r: 3, speed: 5.5 },
  { id: 'hulk', name: 'Hulk', model: 'Casual_Bald', shirt: '#4caf3a', pants: '#5b2a86', hat: '#111111', skin: '#4caf3a', scale: 2.3, r: 6.3, speed: 6 },
];
const ABIL = {
  iron: [['fly', '🚀 Vzlétni / přistaň'], ['shoot', '💥 Střílej z ruky']],
  cap: [['hammer', '🔨 Pošli kladivo'], ['pass', '🔨➜ Kladivo Thorovi']],
  thor: [['axe', '🪓 Hoď sekeru'], ['hammer', '🔨 Hoď kladivo'], ['pass', '🔨➜ Zpět Kapitánovi']],
  spidey: [['swing', '🕸️ Zhoupni se nad lidmi'], ['web', '🕷️ Vystřel síť']],
  hulk: [['smash', '👊 SMASH'], ['leap', '🦘 Skok do davu']],
};
const glow = (inner, outer) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.4, outer); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const label = (text, color) => { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d'); g.font = '900 54px "Russo One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = '#fff'; g.fillText(text, 256, 50, 500); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(3.4, 0.64, 1); return s; };
const V = new THREE.Vector3();

export class Avengers {
  constructor(party) { this.p = party; this.heroes = []; this.aim = 0; this.sel = 'cap'; this.webs = []; this.beams = []; this.flashes = []; }
  get G() { return this.p.game; }
  get top() { return this.p.gy + 1.8; }
  /** f/r (souřadnice pódia) ↔ svět */
  W(f, r) { const F = this.p.FACE, S = this.p.S; return [S.x + Math.sin(F) * f + Math.cos(F) * r, S.z + Math.cos(F) * f - Math.sin(F) * r]; }
  fr(x, z) { const F = this.p.FACE, S = this.p.S, dx = x - S.x, dz = z - S.z; return [dx * Math.sin(F) + dz * Math.cos(F), dx * Math.cos(F) - dz * Math.sin(F)]; }
  onStage(x, z) { const [f, r] = this.fr(x, z), RW = this.p.RW, L = this.p.rw?.L || 0; return (f > -4 && f < 4.05 && Math.abs(r) < 8) || (L > 0.3 && f >= 4 && f < RW.f0 + L && Math.abs(r) < RW.w / 2); }
  floorY(x, z) { return this.onStage(x, z) ? this.top : this.G.city.ground(x, z); }

  /* ---------- zapnutí s party ---------- */
  /** Po pódiu a molu se dá chodit (hráč i převzatý hrdina). */
  hookFloor() {
    const c = this.G.city; if (this._rh) return;
    this._rh = c.roofHeight;
    c.roofHeight = (x, z, y) => { const o = this._rh.call(c, x, z, y); return this.p.active && this.onStage(x, z) && (y == null || y >= this.top - 0.5) ? Math.max(o, this.top) : o; };
  }
  unhookFloor() { if (this._rh) { this.G.city.roofHeight = this._rh; this._rh = null; } }

  /* ---------- hrdinové ---------- */
  summon() {
    this.openPanel();
    if (this.heroes.length) { this.G.toast?.('Avengers už jsou na pódiu'); return; }
    const sc = this.G.scene, g = this.p.group;
    this.fxT = glow('rgba(255,255,255,1)', 'rgba(120,200,255,.7)');
    HEROES.forEach((d, k) => {
      const m = makeHuman({ name: d.model, uniform: { shirt: d.shirt, pants: d.pants, hat: d.hat }, skin: d.skin, scale: d.scale, tint: false });
      const [sx, sz] = this.W(-3.2, d.r < 0 ? -7.5 : 7.5), [hx, hz] = this.W(3.3, d.r);
      m.position.set(sx, this.top, sz); sc.add(m);
      const b = {}; m.traverse((o) => { if (/^UpperArm\.?L$/.test(o.name)) b.uaL = o; if (/^UpperArm\.?R$/.test(o.name)) b.uaR = o; if (/^Fist\.?R$/.test(o.name)) b.fistR = o; if (/^Fist\.?L$/.test(o.name)) b.fistL = o; if (/^Torso$/.test(o.name)) b.torso = o; if (/^Head$/.test(o.name)) b.head = o; });
      const tag = label(d.name, d.shirt); g.add(tag);
      const H = { ...d, k, m, b, tag, x: sx, z: sz, y: this.top, h: this.p.FACE, path: [[hx, hz]], home: 'stage', cool: 0, t: 0, acc: [], air: 0, armT: 0 };
      // doplňky kostýmu (sledují kosti)
      const add = (o, bone, off, yaw = 0) => { g.add(o); H.acc.push({ o, bone, off, yaw }); return o; };
      if (d.id === 'iron') {
        add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('rgba(255,255,255,1)', 'rgba(0,229,255,.9)'), blending: THREE.AdditiveBlending, depthWrite: false })), 'torso', [0, 0.28, 0.3]).scale.setScalar(0.5);
        H.jet = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('rgba(255,255,220,1)', 'rgba(255,140,0,.9)'), blending: THREE.AdditiveBlending, depthWrite: false })), null, [0, -0.2, 0]); H.jet.scale.set(0.9, 1.6, 1); H.jet.visible = false;
      }
      if (d.id === 'cap') {
        const sc2 = document.createElement('canvas'); sc2.width = sc2.height = 128; const q = sc2.getContext('2d');
        for (const [rr, cc] of [[64, '#c4161c'], [50, '#f2f2f2'], [36, '#c4161c'], [22, '#1f4fa8']]) { q.fillStyle = cc; q.beginPath(); q.arc(64, 64, rr, 0, 7); q.fill(); }
        q.fillStyle = '#fff'; q.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 8 : 20; q.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } q.fill();
        const st = new THREE.CanvasTexture(sc2); st.colorSpace = THREE.SRGBColorSpace;
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 28), [new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.8 }), new THREE.MeshStandardMaterial({ map: st, metalness: 0.5, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: st, metalness: 0.5, roughness: 0.35 })]);
        shield.geometry.rotateX(Math.PI / 2); add(shield, 'fistL', [-0.12, 0.15, 0.1], Math.PI / 2);
      }
      if (d.id === 'thor') {
        const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshStandardMaterial({ color: '#b3121d', side: THREE.DoubleSide, roughness: 0.8 }));
        cape.geometry.translate(0, -0.6, 0); add(cape, 'torso', [0, 0.5, -0.3]);
      }
      if (d.id === 'spidey') for (const ex of [-0.13, 0.13]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff' })); eye.scale.set(1, 1.3, 0.35); add(eye, 'head', [ex, 0.22, 0.3]); }
      this.heroes.push(H);
    });
    // Thorovo kladivo (má ho Kapitán) a sekera (Thor)
    const metal = new THREE.MeshStandardMaterial({ color: '#b9bec6', metalness: 0.9, roughness: 0.25 }), wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.8 });
    const ham = new THREE.Group(); { const hd = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.38), metal); hd.position.y = 0.62; ham.add(hd); const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), wood); hl.position.y = 0.2; ham.add(hl); }
    const axe = new THREE.Group(); { const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 8), wood); hl.position.y = 0.45; axe.add(hl); const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.09, 20, 1, false, 0, Math.PI), metal); bl.rotation.z = Math.PI / 2; bl.rotation.y = Math.PI / 2; bl.position.set(0, 1.05, 0.12); axe.add(bl); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.42), metal); bk.position.set(0, 1.05, -0.2); axe.add(bk); }
    const mk = (obj, holder, hand) => {
      this.p.group.add(obj);
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fxT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); spark.scale.setScalar(2.4); spark.visible = false; this.p.group.add(spark);
      const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 7 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: '#bfe9ff', transparent: true, blending: THREE.AdditiveBlending })); bolt.frustumCulled = false; bolt.visible = false; this.p.group.add(bolt);
      return { obj, holder, hand, fly: null, spark, bolt, spin: 0 };
    };
    this.hammer = mk(ham, 'cap', 'fistR'); this.axe = mk(axe, 'thor', 'fistR');
    this.G.toast?.('🦸 Avengers přicházejí na pódium! Ovladač je dole.');
    this.renderPanel();
  }
  hero(id) { return this.heroes.find((h) => h.id === id && !h.gone); }
  /** Směr povelu: u převzatého hrdiny směr kamery, jinak zvolený směr od pódia. */
  dir(H) { const a = this.ctrl === H ? this.G.camYaw : this.p.FACE + this.aim; return { x: Math.sin(a), z: Math.cos(a), a }; }
  flash(x, y, z, s = 3, col = '#bfe9ff') { this.fxT ||= glow('rgba(255,255,255,1)', 'rgba(120,200,255,.7)'); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fxT, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.set(x, y, z); sp.scale.setScalar(s); this.p.group.add(sp); this.flashes.push({ sp, t: 0, s }); }
  /** Zabije lidi v okruhu (dav party) a rozhodí je od středu. */
  blast(x, z, rad, power = 7) {
    const C = this.p.crowd; let n = 0;
    for (const q of this.p.people) {
      if (q.gone || C.dead[q.i]) continue;
      const dx = C.x[q.i] - x, dz = C.z[q.i] - z, d = Math.hypot(dx, dz);
      if (d < rad) { const u = d || 1; C.kill(q.i, { x: dx / u, z: dz / u }, { x: (dx / u) * power, y: 4 + Math.random() * 4, z: (dz / u) * power }); n++; }
    }
    return n;
  }

  /* ---------- schopnosti ---------- */
  act(id, what) {
    const H = this.hero(id); if (!H) return;
    const d = this.dir(H), au = this.G.audio;
    const item = what === 'axe' ? this.axe : this.hammer;
    if (what === 'hammer' || what === 'axe') {
      if (item.fly || item.holder !== id) { this.G.toast?.(what === 'axe' ? 'Sekera je ve vzduchu' : `Kladivo teď má ${this.hero(item.holder)?.name || 'někdo jiný'}`); return; }
      H.armT = 0.5; H.faceA = d.a;
      item.fly = { ph: 'out', d, dist: 0, range: 46, kill: !!this.attack, from: item.obj.position.clone() };
      au?.noise?.(0.35, 0.3, 400);
    } else if (what === 'pass') {
      const to = id === 'cap' ? 'thor' : 'cap', T = this.hero(to);
      if (!T || this.hammer.fly || this.hammer.holder !== id) { this.G.toast?.('Kladivo teď hodit nejde'); return; }
      H.armT = 0.5; H.faceA = Math.atan2(T.x - H.x, T.z - H.z);
      this.hammer.fly = { ph: 'to', to, kill: false }; au?.noise?.(0.3, 0.3, 500);
    } else if (what === 'smash') {
      H.jump = { t: 0, x0: H.x, z0: H.z, x1: H.x, z1: H.z, h: 2.5, T: 0.55 };
    } else if (what === 'leap') {
      H.path = []; H.jump = { t: 0, x0: H.x, z0: H.z, x1: H.x + d.x * 16, z1: H.z + d.z * 16, h: 7, T: 1.1 }; H.faceA = d.a; H.home = 'free';
    } else if (what === 'fly') {
      H.flying = !H.flying; H.home = 'free'; H.path = [];
      if (this.ctrl === H) { this.G.jetpack = H.flying; if (H.flying) this.G.player.vy = 9; }
      this.G.toast?.(H.flying ? '🚀 Iron Man letí' : 'Iron Man přistává');
    } else if (what === 'shoot') {
      const hand = H.b.fistR ? H.b.fistR.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(H.x, H.y + 1.4, H.z);
      const tx = H.x + d.x * 20, tz = H.z + d.z * 20, ty = this.G.city.ground(tx, tz) + 0.9;
      this.beam(hand, new THREE.Vector3(tx, ty, tz)); H.armT = 0.4; H.faceA = d.a;
      this.blast(tx, tz, 2.6, 8); au?.blip?.(900, 0.25, 'sawtooth', 0.12, 200);
    } else if (what === 'web') {
      const from = new THREE.Vector3(H.x, H.y + 1.5, H.z);
      this.webs.push({ p: from, v: new THREE.Vector3(d.x * 30, 3, d.z * 30), t: 0, m: this.webBall(from) }); H.armT = 0.4; H.faceA = d.a;
      au?.blip?.(1400, 0.12, 'square', 0.05, 600);
    } else if (what === 'swing') {
      if (H.swing) return;
      // kyvadlo: kotva vysoko před hrdinou, přelet nad hlavami a návrat na místo
      const R = 15, ax = H.x + d.x * 15, az = H.z + d.z * 15, ay = Math.max(H.y, this.top) + R - 2.2;
      H.swing = { t: 0, ax, ay, az, R, d, x0: H.x, z0: H.z, y0: H.y, T: 4.2 }; H.path = []; H.faceA = d.a;
      au?.blip?.(1200, 0.2, 'square', 0.05, 500);
    }
  }
  webBall(p) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff', wireframe: true })); m.position.copy(p); this.p.group.add(m); return m; }
  beam(a, b) {
    const len = a.distanceTo(b), geo = new THREE.CylinderGeometry(0.14, 0.14, len, 6); geo.translate(0, len / 2, 0); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#8fe9ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a); m.lookAt(b); this.p.group.add(m); this.beams.push({ m, t: 0 }); this.flash(b.x, b.y, b.z, 5, '#8fe9ff');
  }

  /* ---------- povely pro všechny ---------- */
  cmd(c) {
    const P = this.p;
    if (c === 'stage2') {
      if (!P.stage2) { P.toggleStage2(); P.syncStage2?.(); }
      this.attack = false;
      this.heroes.forEach((H, i) => { if (H.gone || this.ctrl === H) return; H.home = 'rw'; H.flying = false; this.route(H, this.W(P.RW.f0 + 3.5 + i * 5.6, 0)); });
    } else if (c === 'stage') {
      this.attack = false;
      for (const H of this.heroes) { if (H.gone || this.ctrl === H) continue; H.home = 'stage'; H.flying = false; this.route(H, this.W(3.3, H.r)); }
    } else if (c === 'sing') { this.sing = !this.sing; if (!this.sing) P.heroSinger = null; this.G.toast?.(this.sing ? '🎤 Avengers zpívají' : 'Avengers přestali zpívat'); }
    else if (c === 'attack') {
      this.attack = !this.attack; this.sing = false; P.heroSinger = null;
      this.G.toast?.(this.attack ? '⚔️ ÚTOK NA LIDI!' : 'Útok zastaven – hrdinové se vracejí');
      if (!this.attack) for (const H of this.heroes) { if (H.gone || this.ctrl === H) continue; H.flying = false; H.home = 'stage'; this.route(H, this.W(3.3, H.r)); }
    } else if (c === 'leave') {
      if (!this.gate || this.gate.st !== 'open') { this.G.toast?.('Nejdřív otevři hvězdnou bránu'); return; }
      this.release(); this.attack = false; this.sing = false; P.heroSinger = null;
      for (const H of this.heroes) { if (H.gone) continue; H.flying = false; H.leave = true; H.home = 'free'; this.route(H, this.W(2.9, 0)); H.path.push(this.W(2.2, 0)); }
      this.G.toast?.('🌀 Avengers odcházejí hvězdnou bránou');
    } else if (c === 'rapLeave') {
      if (!this.gate || this.gate.st !== 'open') { this.G.toast?.('Nejdřív otevři hvězdnou bránu'); return; }
      if (!P.rappers?.length) { this.G.toast?.('Na pódiu teď nejsou žádní rappeři'); return; }
      for (const R of P.rappers) R.leave = this.W(2.3, 0);
      this.G.toast?.('🌀 Rappeři odcházejí hvězdnou bránou');
    }
    this.renderPanel();
  }
  /** Cesta po pódiu: mezi hlavním pódiem a molem jen přes jeho začátek. */
  route(H, to) {
    const [f0] = this.fr(H.x, H.z), [f1, r1] = this.fr(to[0], to[1]), RW = this.p.RW, path = [];
    const st0 = this.onStage(H.x, H.z);
    if (!st0) path.push(this.W(Math.max(RW.f0 + 1, Math.min(RW.f0 + (this.p.rw?.L || 0) - 1, f0)), 0)); // z davu zpět na molo (vyskočí)
    if ((f0 < RW.f0) !== (f1 < RW.f0) || !st0) path.push(this.W(RW.f0 - 0.5, Math.max(-1.5, Math.min(1.5, r1))));
    path.push(to); H.path = path;
  }
  possess(id) {
    const H = this.hero(id); if (!H) return;
    if (this.ctrl === H) { this.release(); return; }
    this.release();
    const G = this.G, P = G.player;
    if (G.mode !== 'foot') { G.toast?.('Nejdřív vystup z vozidla'); return; }
    this.ctrl = H; H.path = []; H.swing = null; H.jump = null; H.home = 'free';
    this._jp = G.jetpack; P.x = H.x; P.z = H.z; P.y = H.y; P.vy = 0; P.h = H.h; G.camYaw = H.h;
    G.jetpack = id === 'iron' ? true : false; if (id === 'iron') H.flying = P.y > this.floorY(P.x, P.z) + 0.5;
    G.toast?.(`🎮 Ovládáš: ${H.name} · B = hlavní schopnost · U = druhá · L = pustit`);
    this.renderPanel();
  }
  release() { if (!this.ctrl) return; const H = this.ctrl; this.ctrl = null; this.G.jetpack = this._jp || false; H.flying = H.y > this.floorY(H.x, H.z) + 0.5 && H.id === 'iron'; this.renderPanel(); }

  /* ---------- hvězdná brána ---------- */
  toggleGate() {
    this.openPanel();
    if (!this.gate) this.buildGate();
    const g = this.gate;
    if (g.st === 'down' || g.st === 'lower') { g.st = 'rise'; this.G.toast?.('🌀 Hvězdná brána vyjíždí z pódia'); }
    else { g.st = 'lower'; g.hz.visible = false; this.G.toast?.('Hvězdná brána se zavírá'); }
    this.renderPanel();
  }
  buildGate() {
    const g = new THREE.Group(), R = 2.7, [x, z] = this.W(2.5, 0);
    const stone = new THREE.MeshStandardMaterial({ color: '#6f757d', metalness: 0.75, roughness: 0.4 });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.42, 10, 54), stone));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 0.42, 0.2, 6, 39), new THREE.MeshStandardMaterial({ color: '#3d4249', metalness: 0.8, roughness: 0.5, flatShading: true })); g.add(inner);
    const chev = [];
    for (let k = 0; k < 9; k++) { const a = Math.PI / 2 + (k / 9) * Math.PI * 2, c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.9), new THREE.MeshBasicMaterial({ color: '#3a2a12' })); c.position.set(Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1), 0); c.rotation.z = a - Math.PI / 2; g.add(c); chev.push(c); }
    const hc = document.createElement('canvas'); hc.width = hc.height = 128; const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace;
    const hz = new THREE.Mesh(new THREE.CircleGeometry(R - 0.5, 40), new THREE.MeshBasicMaterial({ map: ht, side: THREE.DoubleSide, transparent: true, opacity: 0.94 })); hz.visible = false; g.add(hz);
    const woosh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); woosh.visible = false; g.add(woosh);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.4), stone); base.position.y = -R - 0.35; g.add(base);
    g.rotation.y = this.p.FACE; g.position.set(x, this.top - R - 4, z); this.p.group.add(g);
    this.gate = { g, R, x, z, inner, chev, hz, hc, ht, woosh, st: 'down', t: 0, lit: 0, yUp: this.top + R + 0.5, yDown: this.top - R - 4 };
  }
  updateGate(dt) {
    const g = this.gate; if (!g) return;
    const au = this.G.audio; g.t += dt;
    if (g.st === 'rise') { g.g.position.y = Math.min(g.yUp, g.g.position.y + dt * 2.6); if (Math.random() < dt * 4) au?.noise?.(0.15, 0.08, 90); if (g.g.position.y >= g.yUp) { g.st = 'dial'; g.t = 0; g.lit = 0; } }
    else if (g.st === 'dial') {
      g.inner.rotation.z += dt * 2.4 * (g.lit % 2 ? -1 : 1);
      if (g.t > 0.45) { g.t = 0; g.chev[g.lit]?.material.color.set('#ff7a1a'); g.lit++; au?.blip?.(180 + g.lit * 25, 0.25, 'sawtooth', 0.1, 90); if (g.lit >= 9) { g.st = 'woosh'; g.t = 0; g.woosh.visible = true; au?.noise?.(1.1, 0.5, 300); } }
    } else if (g.st === 'woosh') {
      const a = g.t / 0.9, s = Math.sin(Math.min(1, a) * Math.PI); g.woosh.scale.set(1.8, 1.8, 0.3 + s * 6); g.woosh.position.z = s * 3; g.woosh.material.opacity = 0.9 * (1 - a * 0.5);
      g.hz.visible = true; if (a >= 1) { g.woosh.visible = false; g.st = 'open'; this.G.toast?.('🌀 Brána je otevřená'); this.renderPanel(); }
    } else if (g.st === 'lower') { for (const c of g.chev) c.material.color.set('#3a2a12'); g.g.position.y = Math.max(g.yDown, g.g.position.y - dt * 2.6); if (g.g.position.y <= g.yDown) g.st = 'down'; }
    if (g.hz.visible) { // čeřící se horizont událostí
      const c = g.hc.getContext('2d'); c.fillStyle = '#0b4fa8'; c.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 7; k++) { c.strokeStyle = `rgba(${150 + k * 14},${210 + k * 6},255,${0.25 + 0.1 * Math.sin(g.t * 3 + k)})`; c.lineWidth = 5; c.beginPath(); c.arc(64 + Math.sin(g.t * 1.3 + k) * 6, 64 + Math.cos(g.t * 1.1 + k * 2) * 6, (g.t * 26 + k * 19) % 76, 0, 7); c.stroke(); }
      g.ht.needsUpdate = true;
    }
  }
  /** Záblesk při průchodu bránou. */
  zap() { const g = this.gate; if (!g) return; if (Math.random() < 0.35) this.flash(g.x, this.top + 1.2 + Math.random() * 1.5, g.z, 2.2, '#9fd8ff'); if (Math.random() < 0.08) this.G.audio?.blip?.(700, 0.12, 'sine', 0.04, 1500); }

  /* ---------- schody ze Stage 2, lidé lezou na pódia, všichni bránou ---------- */
  toggleStairs() {
    this.openPanel();
    const P = this.p, RW = P.RW;
    if (!P.stage2) { P.toggleStage2(); P.syncStage2?.(); }
    if (!this.stairs) {
      this.stairs = { list: [], k: 0, on: false };
      const dark = new THREE.MeshStandardMaterial({ color: '#111116', roughness: 0.7 }), neon = new THREE.MeshBasicMaterial({ color: '#39ff14' });
      for (const sf of [12, 24]) for (const side of [-1, 1]) {
        const sg = new THREE.Group();
        for (let k = 0; k < 6; k++) { const hgt = 1.8 - (k + 1) * 0.28, st = new THREE.Mesh(new THREE.BoxGeometry(2.4, hgt, 0.5), dark); st.position.set(0, hgt / 2, 0.25 + k * 0.5); sg.add(st); const ed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.05), neon); ed.position.set(0, hgt + 0.02, 0.48 + k * 0.5); sg.add(ed); }
        const [x, z] = this.W(sf, side * RW.w / 2); sg.position.set(x, P.gy, z); sg.rotation.y = P.FACE + (side > 0 ? Math.PI / 2 : -Math.PI / 2); sg.scale.z = 0.001; sg.visible = false; P.group.add(sg);
        this.stairs.list.push({ g: sg, f: sf, side });
      }
      // místa k tanci na molu a po stranách hlavního pódia (střed zůstává volný jako ulička)
      const spots = [];
      for (let f = RW.f0 + 1.2; f < RW.f1 - 0.4; f += 0.85) for (const r of [-2.05, -1.25, 1.25, 2.05]) spots.push([f, r]);
      for (const f of [1.9, 2.8, 3.6]) for (let r = 3.2; r < 7.6; r += 0.85) { spots.push([f, r]); spots.push([f, -r]); }
      this.stairs.spots = spots.sort((a, b) => Math.abs(a[0] - 18) - Math.abs(b[0] - 18));
    }
    const S = this.stairs; S.on = !S.on;
    if (!S.on) { this.G.toast?.('Schody zajíždějí – lidé slézají z pódia'); for (const q of P.people) if (q.st && !q.exit) this.sendDown(q); S.next = 0; }
    else { this.G.toast?.('🪜 Schody vyjely – lidé lezou na pódium'); S.queue = null; S.next = 0; S.wait = 2; }
    this.renderPanel();
  }
  nearStair(x, z) { let best = null, bd = 1e9; for (const s of this.stairs.list) { const [fx, fz] = this.W(s.f, s.side * 6.2), d = Math.hypot(fx - x, fz - z); if (d < bd) { bd = d; best = s; } } return [best, bd]; }
  pos(q) { const C = this.p.crowd; return q.st ? [q.px, q.pz, q.py] : [C.x[q.i], C.z[q.i], q.y]; }
  startWalk(q, path, wait = 0) { const [x, z, y] = this.pos(q); q.px = x; q.pz = z; q.py = y; q.st = 1; q.path = path; q.wait = wait; }
  sendDown(q) { const [s] = this.nearStair(q.px, q.pz), lane = s.side * 1.6; q.spot = null; q.back = true; this.startWalk(q, [[...this.W(s.f, lane), this.top], [...this.W(s.f, s.side * 2.4), this.top], [...this.W(s.f, s.side * 5.9), this.p.gy], [q.ax ?? q.x, q.az ?? q.z, q.y]], Math.random() * 3); }
  updateStairs(dt) {
    const S = this.stairs; if (!S) return;
    S.k += ((S.on ? 1 : 0) - S.k) * Math.min(1, dt * 2.5);
    for (const s of S.list) { s.g.visible = S.k > 0.02; s.g.scale.z = Math.max(0.001, S.k); }
    if (!S.on || this.exodus) return;
    S.wait -= dt; if (S.wait > 0 || S.next >= S.spots.length) return;
    if (!S.queue) { // kdo je nejblíž schodům, leze první
      S.queue = this.p.people.filter((q) => !q.bar && !q.st && !q.gone && !this.p.crowd.dead[q.i]).map((q) => [q, this.nearStair(q.x, q.z)[1]]).sort((a, b) => a[1] - b[1]).slice(0, S.spots.length + 60).map((e) => e[0]);
    }
    S.wait = 0.12;
    const q = S.queue.shift(); if (!q || q.st || this.p.crowd.dead[q.i]) return;
    const [f, r] = S.spots[S.next++], [x, z] = this.pos(q), [s] = this.nearStair(x, z), lane = s.side * (Math.abs(r) < 2.4 ? Math.abs(r) : 1.6);
    const path = [[...this.W(s.f + (Math.random() - 0.5) * 1.4, s.side * 5.9), this.p.gy], [...this.W(s.f, s.side * 2.4), this.top], [...this.W(s.f, lane), this.top]];
    if (f < this.p.RW.f0) path.push([...this.W(this.p.RW.f0 - 0.4, Math.sign(r) * 1.8), this.top]);
    path.push([...this.W(f, r), this.top]); q.spot = [f, r]; q.back = false; this.startWalk(q, path);
  }
  /** Všichni (na pódiu i pod ním) projdou hvězdnou bránou. */
  startExodus() {
    if (!this.gate || this.gate.st !== 'open') { if (!this.gate || this.gate.st === 'down' || this.gate.st === 'lower') this.toggleGate(); this.wantExodus = true; this.G.toast?.('🌀 Otevírám bránu – pak půjdou všichni skrz'); return; }
    if (!this.stairs?.on) this.toggleStairs();
    this.exodus = true; this.wantExodus = false; this.goneN = 0;
    const P = this.p, C = P.crowd, RW = P.RW, list = [];
    const gatePts = (lane) => [[...this.W(RW.f0 - 0.3, lane), this.top], [...this.W(3.0, lane * 0.6), this.top], [...this.W(2.2, lane * 0.4), this.top]];
    for (const q of P.people) {
      if (q.gone || C.dead[q.i]) continue;
      const [x, z] = this.pos(q), lane = (Math.random() - 0.5) * 3.2;
      let path, len;
      if (q.st && this.onStage(x, z)) { const [f] = this.fr(x, z); path = f > RW.f0 ? [[...this.W(f, lane), this.top], ...gatePts(lane)] : gatePts(lane); len = Math.max(0, f); }
      else { const [s, d] = this.nearStair(x, z); path = [[...this.W(s.f + (Math.random() - 0.5) * 1.6, s.side * 5.9), P.gy], [...this.W(s.f, s.side * 2.4), this.top], [...this.W(s.f - 1, lane), this.top], ...gatePts(lane)]; len = d + s.f + 12; }
      list.push([q, path, len]);
    }
    list.sort((a, b) => a[2] - b[2]);
    list.forEach(([q, path], k) => { q.exit = true; this.startWalk(q, path, k * 0.022); });
    this.G.toast?.(`🌀 ${list.length} lidí míří k hvězdné bráně`);
    this.renderPanel();
  }
  /** Krok jednoho člověka, který leze na pódium / jde k bráně / tančí na pódiu. Volá party v animatePeople. */
  stepPerson(q, dt, t, beatF, hip) {
    const C = this.p.crowd;
    if (q.wait > 0) { q.wait -= dt; C.set(q.i, q.px, q.py + (q.py > this.p.gy + 1 ? 0 : 0), q.pz, q.h, 0, hip ? 'hiphop' : 'riot', t); return; }
    const w = q.path && q.path[0];
    if (w) {
      const dx = w[0] - q.px, dz = w[1] - q.pz, d = Math.hypot(dx, dz), sp = q.exit ? 4.6 : 3, st = Math.min(d, sp * dt);
      if (d > 0.05) { q.px += (dx / d) * st; q.pz += (dz / d) * st; q.py += (w[2] - q.py) * Math.min(1, st / d); q.fh = Math.atan2(dx, dz); }
      if (d < 0.25) { q.py = w[2]; q.path.shift(); }
      C.set(q.i, q.px, q.py, q.pz, q.fh ?? q.h, sp, 'walk', t);
      return;
    }
    if (q.exit) { q.gone = true; q.st = 0; C.hide(q.i, true); this.goneN++; this.zap(); return; }
    if (q.back) { q.st = 0; q.back = false; return; }
    // tančí na pódiu čelem k davu
    const bounce = Math.max(0, Math.sin((beatF + q.ph * 0.05) * Math.PI * 2)) * 0.2;
    const [, r] = q.spot || [0, 0], face = this.p.FACE + (Math.abs(r) < 2.6 ? (r < 0 ? 1 : -1) * 1.2 : 0) + Math.sin(t * 1.5 + q.ph) * 0.4;
    if (hip) C.set(q.i, q.px, q.py - Math.abs(Math.sin(beatF * Math.PI)) * 0.07 + 0.05, q.pz, face, 0, 'hiphop', t);
    else C.set(q.i, q.px, q.py + bounce, q.pz, face, 0, 'riot', t);
  }

  /* ---------- průběh ---------- */
  update(dt, beatF) {
    const P = this.p, G = this.G, t = G.time;
    this.updateGate(dt); this.updateStairs(dt);
    if (this.wantExodus && this.gate?.st === 'open') this.startExodus();
    if (this.exodus && this.pnl && (this._pt = (this._pt || 0) + dt) > 0.5) { this._pt = 0; const el = this.pnl.querySelector('.av-count'); if (el) el.textContent = `Bránou prošlo ${this.goneN} lidí`; }
    this.updateFx(dt);
    if (!this.heroes.length) return;
    // převzatý hrdina: klávesy B / U / L
    if (this.ctrl) {
      const inp = G.input, id = this.ctrl.id, A = ABIL[id];
      if (G.mode !== 'foot') this.release();
      else { if (inp.hit('KeyB')) this.act(id, A[0][0]); if (inp.hit('KeyU')) this.act(id, A[1][0]); if (inp.hit('KeyL')) this.release(); }
    }
    const bounce = Math.max(0, Math.sin(beatF * Math.PI * 2)) * 0.1;
    const singer = this.sing ? this.heroes.filter((h) => !h.gone)[Math.floor(beatF / 16) % Math.max(1, this.heroes.filter((h) => !h.gone).length)] : null;
    if (this.sing) P.heroSinger = singer?.name || null;
    for (const H of this.heroes) {
      if (H.gone) continue;
      H.t += dt; H.cool -= dt; H.armT = Math.max(0, H.armT - dt);
      let speed = 0, mode = null;
      if (this.ctrl === H) { // hrdina = hráč
        const pl = G.player; pl.mesh.visible = false; H.walking = false;
        if (!H.swing && !H.jump) { H.x = pl.x; H.z = pl.z; H.y = pl.y; H.h = pl.h; speed = pl.speed || 0; if (pl.y > this.floorY(pl.x, pl.z) + 0.3) mode = 'air'; }
        if (H.id === 'iron') H.flying = pl.y > this.floorY(pl.x, pl.z) + 0.4;
      } else if (!H.swing && !H.jump) this.ai(H, dt, t);
      // skok / smash (Hulk)
      if (H.jump) {
        const J = H.jump; J.t += dt; const a = Math.min(1, J.t / J.T);
        H.x = J.x0 + (J.x1 - J.x0) * a; H.z = J.z0 + (J.z1 - J.z0) * a;
        const g0 = this.floorY(J.x0, J.z0), g1 = this.floorY(J.x1, J.z1); H.y = g0 + (g1 - g0) * a + Math.sin(a * Math.PI) * J.h; mode = 'air';
        if (a >= 1) { H.jump = null; H.y = g1; const n = this.blast(H.x, H.z, 4.6, 9); this.flash(H.x, H.y + 0.6, H.z, 8, '#9cff7a'); G.audio?.noise?.(0.6, 0.6, 90); G.shake = Math.max(G.shake || 0, 0.5); if (n && this.ctrl === H) G.toast?.(`💥 HULK SMASH! ${n} lidí`); }
      }
      // houpání na pavučině (Spider-Man)
      if (H.swing) {
        const W2 = H.swing; W2.t += dt; const a = Math.min(1, W2.t / W2.T), ang = -Math.cos(a * Math.PI * 2) * 1.05; // tam a zpět
        const horiz = Math.sin(ang) * W2.R, vert = Math.cos(ang) * W2.R;
        H.x = W2.ax + W2.d.x * horiz; H.z = W2.az + W2.d.z * horiz; H.y = Math.max(W2.ay - vert, this.floorY(H.x, H.z) + (a > 0.03 && a < 0.97 ? 2.2 : 0));
        H.h = W2.d.a + (Math.sin(a * Math.PI * 2) > 0 ? 0 : Math.PI); mode = 'air';
        if (!W2.line) { W2.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff' })); W2.line.frustumCulled = false; P.group.add(W2.line); }
        const lp = W2.line.geometry.attributes.position; lp.setXYZ(0, W2.ax, W2.ay, W2.az); lp.setXYZ(1, H.x, H.y + 1.6, H.z); lp.needsUpdate = true;
        if (a >= 1) { P.group.remove(W2.line); H.swing = null; H.x = W2.x0; H.z = W2.z0; H.y = W2.y0; }
        if (this.ctrl === H) { const pl = G.player; pl.x = H.x; pl.z = H.z; pl.y = H.y; pl.vy = 0; }
      }
      if (this.ctrl === H && H.jump) { const pl = G.player; pl.x = H.x; pl.z = H.z; pl.y = H.y; pl.vy = 0; }
      if (H.walking) speed = H.speed;
      const dance = !H.walking && !H.flying && !H.swing && !H.jump && this.ctrl !== H;
      H.m.position.set(H.x, H.y + (dance ? bounce * (singer === H ? 2 : 1) : 0), H.z);
      if (H.faceA != null && H.armT > 0) H.h = H.faceA;
      H.m.rotation.y = H.h;
      if (H.flying) { H.m.rotation.x = Math.min(0.9, (H.fspeed || 0) * 0.08); mode = 'air'; } else H.m.rotation.x = 0;
      animateHuman(H.m, speed, dt, mode);
      const b = H.b;
      if (H.armT > 0) { if (b.uaR) b.uaR.rotation.x -= 2.6 * Math.sin((H.armT / 0.5) * Math.PI); } // hod / výstřel
      else if (singer === H && dance) { if (b.uaL) b.uaL.rotation.x -= 2.3; if (b.uaR) b.uaR.rotation.x -= 1.0 + Math.abs(Math.sin(beatF * Math.PI)) * 1.2; }
      else if (dance && H.id === 'hulk') { if (b.uaL) b.uaL.rotation.x -= 0.6 + bounce * 6; if (b.uaR) b.uaR.rotation.x -= 0.6 + bounce * 6; }
      if (H.swing && b.uaR) { b.uaR.rotation.x -= 2.9; }
      H.m.updateMatrixWorld(true);
      // doplňky kostýmu a jmenovka
      const sy = Math.sin(H.h), cy = Math.cos(H.h);
      for (const a of H.acc) {
        const bn = a.bone && b[a.bone]; if (bn) bn.getWorldPosition(V); else V.set(H.x, H.y + (a.bone === 'head' ? 1.3 : a.bone === 'torso' ? 0.9 : 0.6) * H.scale, H.z);
        const [ox, oy, oz] = a.off, s = H.scale; a.o.position.set(V.x + (cy * ox + sy * oz) * s, V.y + oy * s, V.z + (-sy * ox + cy * oz) * s); if (a.o.isMesh) a.o.rotation.y = H.h + a.yaw;
      }
      if (H.jet) { H.jet.visible = !!H.flying; H.jet.scale.set(0.9, 1.4 + Math.random() * 0.6, 1); }
      H.tag.position.set(H.x, H.y + 1.76 * H.scale + 0.55, H.z); H.tag.visible = this.ctrl !== H || true;
    }
    if (!this.heroes.length) return;
    this.updateItem(this.hammer, dt, t); this.updateItem(this.axe, dt, t);
  }
  updateFx(dt) {
    const P = this.p, G = this.G;
    // sítě, paprsky, záblesky
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const w = this.webs[i]; w.t += dt; w.v.y -= 9 * dt; w.p.addScaledVector(w.v, dt); w.m.position.copy(w.p); w.m.rotation.x += dt * 9;
      const gnd = G.city.ground(w.p.x, w.p.z);
      if (w.p.y < gnd + 1.2 || w.t > 2) { // dopad: lidé v okruhu zůstanou zamotaní v síti
        const C = P.crowd; for (const q of P.people) { if (q.gone || q.st || C.dead[q.i]) continue; if (Math.hypot(C.x[q.i] - w.p.x, C.z[q.i] - w.p.z) < 3) { q.web = 9; C.setShirt(q.i, '#ffffff'); } }
        const net = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.8 })); net.position.set(w.p.x, gnd, w.p.z); net.scale.y = 0.75; P.group.add(net); this.flashes.push({ sp: net, t: 0, s: 0, life: 9 });
        P.group.remove(w.m); this.webs.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; b.t += dt; b.m.material.opacity = 0.9 * (1 - b.t / 0.25); if (b.t > 0.25) { P.group.remove(b.m); b.m.geometry.dispose(); this.beams.splice(i, 1); } }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; const life = f.life || 0.35; if (f.s) { f.sp.scale.setScalar(f.s * (1 + f.t * 3)); f.sp.material.opacity = 1 - f.t / life; } else if (f.t > life - 1) f.sp.material.opacity = Math.max(0, life - f.t) * 0.8; if (f.t > life) { P.group.remove(f.sp); this.flashes.splice(i, 1); } }
  }
  /** Chování hrdiny bez ovládání: chůze po cestě, let, útok, odchod bránou. */
  ai(H, dt, t) {
    const G = this.G, P = this.p;
    H.walking = false;
    if (this.attack && !H.leave) this.attackAi(H, dt, t);
    if (H.flying) { // Iron Man krouží nad davem
      H.fa = (H.fa || 0) + dt * 0.5; const [cx, cz] = this.W(20, 0), tx = cx + Math.cos(H.fa) * 16, tz = cz + Math.sin(H.fa) * 11, ty = P.gy + 8 + Math.sin(H.fa * 2) * 1.5;
      const dx = tx - H.x, dz = tz - H.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(d * 2, 14);
      H.x += (dx / d) * sp * dt; H.z += (dz / d) * sp * dt; H.y += (ty - H.y) * Math.min(1, dt * 2); H.h = Math.atan2(dx, dz); H.fspeed = sp; return;
    }
    const fl = this.floorY(H.x, H.z);
    if (H.y > fl + 0.05) H.y = Math.max(fl, H.y - dt * 12); else H.y += (fl - H.y) * Math.min(1, dt * 14);
    const w = H.path[0];
    if (w) {
      const dx = w[0] - H.x, dz = w[1] - H.z, d = Math.hypot(dx, dz);
      if (d < 0.2) { H.path.shift(); if (!H.path.length && H.leave) { H.gone = true; G.scene.remove(H.m); H.tag.visible = false; for (const a of H.acc) a.o.visible = false; for (const it of [this.hammer, this.axe]) if (it.holder === H.id && !it.fly) it.obj.visible = false; this.flash(H.x, H.y + 1.5, H.z, 6, '#9fd8ff'); G.audio?.blip?.(500, 0.3, 'sine', 0.08, 1600); if (!this.heroes.some((h) => !h.gone)) { G.toast?.('Avengers zmizeli v hvězdné bráně'); this.clearHeroes(); } } }
      else { const st = Math.min(d, H.speed * dt); H.x += (dx / d) * st; H.z += (dz / d) * st; H.h = Math.atan2(dx, dz); H.walking = true; }
    } else if (H.home !== 'free' || !this.attack) { if (H.armT <= 0 && !H.leave) H.h += ((this.p.FACE + Math.sin(t * 0.6 + H.k) * 0.3) - H.h) * Math.min(1, dt * 4); }
  }
  attackAi(H, dt, t) {
    if (H.cool > 0) return;
    const P = this.p, C = P.crowd, alive = P.people.filter((q) => !q.gone && !q.st && !C.dead[q.i]);
    if (!alive.length) return;
    const tgt = alive[Math.floor(Math.random() * alive.length)], a = Math.atan2(C.x[tgt.i] - H.x, C.z[tgt.i] - H.z);
    const saveAim = this.aim; this.aim = a - P.FACE; // míří na vybraného člověka
    if (H.id === 'hulk') { // skáče davem a drtí
      const d = Math.min(14, Math.hypot(C.x[tgt.i] - H.x, C.z[tgt.i] - H.z)); H.path = []; H.home = 'free';
      H.jump = { t: 0, x0: H.x, z0: H.z, x1: H.x + Math.sin(a) * d, z1: H.z + Math.cos(a) * d, h: 5, T: 0.9 }; H.h = a; H.cool = 1.5;
    } else if (H.id === 'thor') { if (this.axe.holder === 'thor' && !this.axe.fly) { this.attack = true; this.act('thor', 'axe'); } else if (this.hammer.holder === 'thor' && !this.hammer.fly) this.act('thor', 'hammer'); H.cool = 2.6; }
    else if (H.id === 'cap') { if (this.hammer.holder === 'cap' && !this.hammer.fly) this.act('cap', 'hammer'); H.cool = 3.2; }
    else if (H.id === 'iron') { if (!H.flying) { H.flying = true; H.home = 'free'; H.path = []; } else { this.aim = Math.atan2(C.x[tgt.i] - H.x, C.z[tgt.i] - H.z) - P.FACE; const hand = new THREE.Vector3(H.x, H.y + 1, H.z), tp = new THREE.Vector3(C.x[tgt.i], C.y[tgt.i] + 1, C.z[tgt.i]); this.beam(hand, tp); this.blast(tp.x, tp.z, 2.4, 8); this.G.audio?.blip?.(900, 0.2, 'sawtooth', 0.08, 200); } H.cool = 0.9; }
    else if (H.id === 'spidey') { if (Math.random() < 0.4 && this.onStage(H.x, H.z)) this.act('spidey', 'swing'); else this.act('spidey', 'web'); H.cool = 2.2; }
    this.aim = saveAim;
  }
  /** Kladivo / sekera: v ruce, letí rovně nad hlavami a vrací se, nebo letí k jinému hrdinovi. */
  updateItem(it, dt, t) {
    const o = it.obj, Hh = this.hero(it.holder);
    const handPos = (H, out) => { const bn = H?.b[it === this.hammer && H.id === 'thor' ? 'fistL' : 'fistR']; if (bn) bn.getWorldPosition(out); else if (H) out.set(H.x, H.y + 1.2, H.z); return out; };
    if (!it.fly) {
      if (!Hh) { o.visible = false; it.spark.visible = it.bolt.visible = false; return; }
      handPos(Hh, o.position); o.position.y -= 0.25 * Hh.scale; o.rotation.set(0, Hh.h, 0); o.scale.setScalar(Hh.scale * 0.95); it.spark.visible = it.bolt.visible = false; return;
    }
    const F = it.fly, sp = 34;
    it.spin += dt * 22; o.rotation.set(it.spin, F.d ? F.d.a : 0, 0, 'YXZ');
    const cruise = this.p.gy + 3.1; // nad hlavami davu
    if (F.ph === 'out') {
      F.dist += sp * dt; o.position.x += F.d.x * sp * dt; o.position.z += F.d.z * sp * dt; o.position.y += (cruise - o.position.y) * Math.min(1, dt * 5);
      if (F.dist >= F.range) F.ph = 'back';
    } else {
      const T = F.ph === 'to' ? this.hero(F.to) : Hh; if (!T) { it.fly = null; return; }
      handPos(T, V); const dx = V.x - o.position.x, dy = V.y - o.position.y, dz = V.z - o.position.z, d = Math.hypot(dx, dy, dz);
      if (d < sp * dt + 0.3) { // chyceno
        it.fly = null; if (F.ph === 'to') { it.holder = F.to; this.G.toast?.(`🔨 ${T.name} chytil kladivo`); this.renderPanel(); }
        T.armT = 0.35; T.faceA = T.h; this.flash(V.x, V.y, V.z, 3); this.G.audio?.blip?.(300, 0.15, 'triangle', 0.1, 120); return;
      }
      o.position.x += (dx / d) * sp * dt; o.position.y += (dy / d) * sp * dt; o.position.z += (dz / d) * sp * dt; F.d = { x: dx / d, z: dz / d, a: Math.atan2(dx, dz) };
    }
    // blesky a zásah lidí (jen při útoku)
    it.spark.visible = true; it.spark.position.copy(o.position); it.spark.material.opacity = 0.6 + Math.random() * 0.4;
    it.bolt.visible = it === this.hammer && Math.random() < 0.6;
    if (it.bolt.visible) { const bp = it.bolt.geometry.attributes.position, gnd = this.p.gy + 1.7; for (let k = 0; k < 7; k++) { const a = k / 6; bp.setXYZ(k, o.position.x + (Math.random() - 0.5) * 1.6 * Math.sin(a * Math.PI), o.position.y + (gnd - o.position.y) * a, o.position.z + (Math.random() - 0.5) * 1.6 * Math.sin(a * Math.PI)); } bp.needsUpdate = true; }
    if (F.kill) { const C = this.p.crowd; for (const q of this.p.people) { if (q.gone || C.dead[q.i]) continue; const dx = C.x[q.i] - o.position.x, dz = C.z[q.i] - o.position.z; if (dx * dx + dz * dz < 2.2 && Math.abs(C.y[q.i] + 1.2 - o.position.y) < 2.6) C.kill(q.i, { x: F.d.x, z: F.d.z }, { x: F.d.x * 7 + (Math.random() - 0.5) * 4, y: 5, z: F.d.z * 7 + (Math.random() - 0.5) * 4 }); } }
  }

  /* ---------- ovladač ---------- */
  openPanel() {
    if (this.pnl) { this.pnl.classList.remove('collapsed'); return; }
    if (!document.getElementById('av-css')) {
      const css = document.createElement('style'); css.id = 'av-css';
      css.textContent = `#av-panel{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(58px + env(safe-area-inset-bottom));z-index:43;width:min(640px,96vw);max-height:46vh;overflow:auto;background:rgba(8,8,14,.92);border:1px solid rgba(255,45,85,.55);border-radius:14px;padding:8px 10px;font:700 12px "Chakra Petch",sans-serif;color:#fff;pointer-events:auto}
#av-panel h3{margin:0 0 6px;font:400 14px "Bungee",sans-serif;color:#ff5c7a;display:flex;justify-content:space-between;align-items:center}
#av-panel .r{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:5px}#av-panel .r>span{opacity:.7;font-size:11px;min-width:54px}
#av-panel button{font:700 12px "Chakra Petch",sans-serif;color:#e6e8ee;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:6px 9px;cursor:pointer}
#av-panel button.on{background:linear-gradient(90deg,rgba(255,45,85,.55),rgba(255,176,0,.4));border-color:#ff5c7a;color:#fff}
#av-panel button.go{background:#39ff14;color:#04140b;border-color:#39ff14}#av-panel button.red{background:#c4161c;border-color:#ff5c7a}
#av-panel .x{background:none;border:0;color:#ff5c7a;font-size:16px;padding:0 4px}#av-panel.collapsed .body{display:none}#av-panel .av-count{color:#9fd8ff}
@media (max-width:760px){#av-panel{bottom:calc(215px + env(safe-area-inset-bottom));max-height:38vh}}`;
      document.head.appendChild(css);
    }
    const d = document.createElement('div'); d.id = 'av-panel'; document.body.appendChild(d); this.pnl = d;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return; const D = b.dataset;
      if (D.x === 'min') { d.classList.toggle('collapsed'); return; }
      if (D.x === 'close') { d.remove(); this.pnl = null; return; }
      if (D.sum) this.summon();
      if (D.sel) { this.sel = D.sel; this.renderPanel(); }
      if (D.aim) { this.aim = +D.aim; this.renderPanel(); }
      if (D.act) this.act(this.sel, D.act);
      if (D.pos) this.possess(this.sel);
      if (D.cmd) this.cmd(D.cmd);
      if (D.gate) this.toggleGate();
      if (D.stairs) this.toggleStairs();
      if (D.exo) this.startExodus();
    });
    this.renderPanel();
  }
  renderPanel() {
    const d = this.pnl; if (!d) return;
    const live = this.heroes.filter((h) => !h.gone), on = (c) => (c ? ' class="on"' : '');
    if (live.length && !this.hero(this.sel)) this.sel = live[0].id;
    const gs = this.gate?.st, gOpen = gs === 'open', gUp = gs && gs !== 'down' && gs !== 'lower';
    let h = `<h3>🦸 Avengers &amp; 🌀 Hvězdná brána <span><button class="x" data-x="min">–</button><button class="x" data-x="close">✕</button></span></h3><div class="body">`;
    if (!live.length) h += `<div class="r"><button class="go" data-sum="1">🦸 Zavolat Avengers na pódium</button></div>`;
    else {
      const H = this.hero(this.sel), holder = this.hero(this.hammer.holder)?.name || '—';
      h += `<div class="r"><span>Hrdina</span>${live.map((x) => `<button data-sel="${x.id}"${on(x.id === this.sel)}>${x.name}${this.ctrl === x ? ' 🎮' : ''}</button>`).join('')}</div>`;
      h += `<div class="r"><span>${H.name}</span>${ABIL[H.id].map(([a, l]) => `<button data-act="${a}">${l}</button>`).join('')}<button data-pos="1"${on(this.ctrl === H)}>${this.ctrl === H ? '🎮 Pustit (L)' : '🎮 Ovládat sám'}</button></div>`;
      h += `<div class="r"><span>Směr hodu</span>${[[1.0, '⬅'], [0.5, '↖'], [0, '⬆ rovně'], [-0.5, '↗'], [-1.0, '➡']].map(([a, l]) => `<button data-aim="${a}"${on(Math.abs(this.aim - a) < 0.01)}>${l}</button>`).join('')}<span style="min-width:0">🔨 má: ${holder}</span></div>`;
      h += `<div class="r"><span>Všichni</span><button data-cmd="stage2">Na STAGE 2</button><button data-cmd="stage">Zpět na pódium</button><button data-cmd="sing"${on(this.sing)}>🎤 Zpívat</button><button data-cmd="attack" class="${this.attack ? 'on' : 'red'}">${this.attack ? '⏹ Zastavit útok' : '⚔️ ÚTOK NA LIDI'}</button></div>`;
    }
    h += `<div class="r"><span>Brána</span><button data-gate="1"${on(gUp)}>${gUp ? '🌀 Zavřít bránu' : '🌀 STARGATE'}</button>${live.length ? `<button data-cmd="leave">Avengers bránou pryč</button>` : ''}<button data-cmd="rapLeave">Rappeři bránou pryč</button></div>`;
    h += `<div class="r"><span>Lidé</span><button data-stairs="1"${on(this.stairs?.on)}>🪜 Schody ze STAGE 2</button><button data-exo="1"${on(this.exodus)}>🌀 Všichni bránou</button><span class="av-count" style="min-width:0">${this.exodus ? `Bránou prošlo ${this.goneN} lidí` : gOpen ? 'brána otevřená' : ''}</span></div></div>`;
    d.innerHTML = h;
  }
  clearHeroes() {
    const sc = this.G.scene, g = this.p.group;
    for (const H of this.heroes) { sc.remove(H.m); g.remove(H.tag); for (const a of H.acc) g.remove(a.o); if (H.swing?.line) g.remove(H.swing.line); }
    for (const it of [this.hammer, this.axe]) if (it) { g.remove(it.obj); g.remove(it.spark); g.remove(it.bolt); }
    this.heroes = []; this.hammer = this.axe = null; this.sing = false; this.attack = false; this.p.heroSinger = null; this.renderPanel();
  }
  /** Konec party: vše pryč. */
  stop() {
    this.release(); if (this.heroes.length) this.clearHeroes();
    this.gate = null; this.stairs = null; this.exodus = false; this.wantExodus = false;
    this.webs = []; this.beams = []; this.flashes = [];
    this.pnl?.remove(); this.pnl = null; this.unhookFloor();
  }
}
