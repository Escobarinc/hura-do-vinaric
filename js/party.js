/*
 * PARTY v zadní části věznice: večer se dvůr promění v obří mejdan. Hlavní pódium s DJ, LED stěnou a pyrotechnikou,
 * čtyři menší pódia s gogo tanečnicemi u tyče, dva bary s barmany, 5000 tančících lidí, lasery, otočné hlavy,
 * stroboskopy, světla na domech, konfety, plameny, mlha a ohňostroj. Ovládací panel s 20 efekty (ručně mixovat).
 */
import * as THREE from 'three';
import { makeHuman, animateHuman } from './entities.js?v=20261127210238';
import { Crowd } from './crowd.js?v=20261127210238';

const S = { x: -204, z: 1170 }; // střed hlavního pódia
const FACE = Math.atan2(-232 - S.x, 1146 - S.z); // pódium hledí do dvora (k davu)
const TRI = [[-300, 1126], [-126, 1115], [-208, 1207]]; // obrys zadního dvora
const BPM = 122.7; // One More Time
const COLORS = ['#ff1f5a', '#00e5ff', '#39ff14', '#ffe600', '#b026ff', '#ff7a00', '#ffffff', '#ff00d4'];

export const EFFECTS = [
  ['lasers', 'Lasery z pódia'], ['fan', 'Laserový vějíř'], ['ceiling', 'Laserový strop'], ['tunnel', 'Laserový tunel'],
  ['heads', 'Otočné hlavy'], ['walls', 'Barvy na domy'], ['strobe', 'Stroboskopy'], ['led', 'LED stěna'],
  ['flames', 'Plameny'], ['co2', 'CO₂ výstřely'], ['confetti', 'Konfety'], ['ball', 'Disco koule'],
  ['fog', 'Mlha'], ['uv', 'UV světlo'], ['beat', 'Světla do rytmu'], ['rainbow', 'Duhové barvy'],
  ['blinders', 'Oslňovače'], ['fireworks', 'Ohňostroj'], ['strings', 'Řetězy světel'], ['mega', 'MEGA laser show'],
];

const inTri = (x, z) => { let c = false; for (let a = 0, b = 2; a < 3; b = a++) { const [xa, za] = TRI[a], [xb, zb] = TRI[b]; if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) c = !c; } return c; };
const glowTex = (inner, outer) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

export class Party {
  constructor(game) {
    this.game = game; this.active = false;
    this.fx = Object.fromEntries(EFFECTS.map(([k]) => [k, ['lasers', 'fan', 'heads', 'walls', 'led', 'beat', 'ceiling', 'strings', 'flames', 'confetti', 'ball', 'fog'].includes(k)]));
    this.speed = 1; this.color = 0; this.master = 1;
  }

  start() {
    if (this.active) { this.stop(); return; }
    const G = this.game;
    if (G.mma?.active) G.mma.finish(true);
    this.active = true; this.t = 0;
    G.setHour = 22;
    this.build();
    this.makePanel();
    try { this.music = new Audio('assets/audio/one-more-time.mp3'); this.music.loop = true; this.music.volume = 0.95; this.music.play().catch(() => {}); } catch { /* bez hudby */ }
    G.toast?.('🎉 PARTY! Ovládání světel vpravo · tlačítko PARTY znovu = konec');
  }

  /* ---------------- stavba ---------------- */
  build() {
    const G = this.game, city = G.city, scene = G.scene, gy = city.ground(S.x, S.z);
    this.gy = gy;
    const g = new THREE.Group(); this.group = g; scene.add(g);
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    const add = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
    const fx = Math.sin(FACE), fz = Math.cos(FACE), rx = Math.cos(FACE), rz = -Math.sin(FACE); // vpřed / vpravo od pódia
    const P = (f, r, y = 0) => [S.x + fx * f + rx * r, gy + y, S.z + fz * f + rz * r];
    this.P = P;
    // schovat drobnosti na dvoře (stromy, lavičky…)
    this.hidden = [];
    for (const pr of city.props || []) if (inTri(pr.x, pr.z) && pr.obj.visible) { pr.obj.visible = false; this.hidden.push(pr); if (pr.obst) { pr._r = pr.obst.r; pr.obst.r = 0; } }
    // HLAVNÍ PÓDIUM 16 × 8 m, výška 1,8 m, příhradová konstrukce, LED stěna
    const black = mat('#0a0a0c', { roughness: 0.8 }), truss = mat('#9aa0a6', { metalness: 0.8, roughness: 0.3 });
    add(new THREE.Mesh(new THREE.BoxGeometry(16, 1.8, 8), black), ...P(0, 0, 0.9), FACE);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: '#39ff14' })); add(edge, ...P(4.02, 0, 1.8), FACE); this.edge = edge;
    for (const r of [-8, 8]) for (const f of [-4, 3.8]) add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 9, 0.35), truss), ...P(f, r, 6.3), FACE);
    for (const f of [-4, 3.8]) add(new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.4, 0.4), truss), ...P(f, 0, 10.8), FACE);
    for (const r of [-8, 8]) add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 8), truss), ...P(0, r, 10.8), FACE);
    // LED stěna (animované plátno)
    this.ledC = document.createElement('canvas'); this.ledC.width = 512; this.ledC.height = 256;
    this.ledT = new THREE.CanvasTexture(this.ledC); this.ledT.colorSpace = THREE.SRGBColorSpace;
    this.led = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: this.ledT })), ...P(-3.7, 0, 5.6), FACE);
    // nápis DJ nad pódiem
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 160; const sg = sc.getContext('2d');
    sg.fillStyle = '#000'; sg.fillRect(0, 0, 1024, 160); sg.font = '900 110px "Russo One", sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.shadowColor = '#00e5ff'; sg.shadowBlur = 30; sg.fillStyle = '#ffffff'; sg.fillText('DJ TIËSTO', 512, 84);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshBasicMaterial({ map: st })), ...P(3.9, 0, 9.9), FACE);
    // DJ pult a DJ
    add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 1.2), mat('#141418', { metalness: 0.5 })), ...P(1.2, 0, 2.35), FACE);
    const deckM = new THREE.MeshBasicMaterial({ color: '#00e5ff' });
    for (const r of [-1.2, 1.2]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 20), deckM), ...P(1.2, r, 2.93), FACE);
    this.dj = makeHuman({ name: 'Casual2_Male', uniform: { shirt: '#111', pants: '#111' }, scale: 1.05, tint: false });
    { const [x, y, z] = P(0.2, 0, 1.8); this.dj.position.set(x, y, z); this.dj.rotation.y = FACE; scene.add(this.dj); }
    this.djBones = this.bonesOf(this.dj);
    // reproduktory
    for (const r of [-10, 10]) for (let k = 0; k < 4; k++) add(new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.6), mat('#111')), ...P(2, r, 0.8 + k * 1.65), FACE);
    // 4 MENŠÍ PÓDIA s tyčí a gogo tanečnicí
    this.gogos = [];
    for (const [f, r] of [[6, -14], [6, 14], [14, -8], [14, 8]]) {
      const [x, y, z] = P(f, r, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.3, 20), black), x, y + 0.65, z);
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: '#ff00d4' })), x, y + 1.3, z); ring.rotation.x = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 10), mat('#e8e8e8', { metalness: 1, roughness: 0.1 })), x, y + 3.3, z);
      const d = makeHuman({ female: true, uniform: { shirt: COLORS[this.gogos.length % COLORS.length], pants: '#111' }, scale: 1, tint: false });
      d.position.set(x + 0.45, y + 1.3, z); scene.add(d);
      this.gogos.push({ m: d, x: x + 0.45, y: y + 1.3, z, cx: x, cz: z, ph: Math.random() * 6, bones: this.bonesOf(d), ring });
    }
    // 2 BARY po stranách s barmany
    this.bartenders = []; this.barSpots = [];
    for (const r of [-24, 24]) {
      const [x, y, z] = P(10, r, 0), ang = FACE + (r < 0 ? Math.PI / 2 : -Math.PI / 2);
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(10, 1.15, 1.2), mat('#1a1012', { roughness: 0.4 })), x, y + 0.58, z, ang + Math.PI / 2);
      add(new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.08, 1.35), new THREE.MeshBasicMaterial({ color: '#00e5ff' })), x, y + 1.16, z, ang + Math.PI / 2);
      const bx = Math.sin(ang), bz = Math.cos(ang);
      add(new THREE.Mesh(new THREE.BoxGeometry(10, 2.6, 0.4), mat('#0d0d10')), x - bx * 2.6, y + 1.3, z - bz * 2.6, ang + Math.PI / 2);
      // lahve na regálu
      const bottleM = ['#2f8f3a', '#c9a043', '#8a1f2a', '#cfe8ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.25 }));
      for (let k = 0; k < 24; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), bottleM[k % 4]); const o = -4.5 + (k % 12) * 0.8; add(b, x - bx * 2.35 + Math.cos(ang) * o, y + 1.6 + Math.floor(k / 12) * 0.6, z - bz * 2.35 - Math.sin(ang) * o); }
      const sign = document.createElement('canvas'); sign.width = 512; sign.height = 128; const ig = sign.getContext('2d'); ig.fillStyle = '#000'; ig.fillRect(0, 0, 512, 128); ig.font = '900 80px "Russo One", sans-serif'; ig.textAlign = 'center'; ig.textBaseline = 'middle'; ig.shadowColor = '#ff00d4'; ig.shadowBlur = 24; ig.fillStyle = '#ff7ae8'; ig.fillText('BAR', 256, 66);
      const stx = new THREE.CanvasTexture(sign); stx.colorSpace = THREE.SRGBColorSpace;
      add(new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: stx })), x - bx * 2.38, y + 3.1, z - bz * 2.38, ang + Math.PI / 2 + Math.PI);
      for (let k = 0; k < 3; k++) {
        const o = -3 + k * 3, m = makeHuman({ name: k % 2 ? 'Suit_Male' : 'Casual_Female', uniform: { shirt: '#111', pants: '#111' }, tint: false });
        const px = x - bx * 1.4 + Math.cos(ang) * o, pz = z - bz * 1.4 - Math.sin(ang) * o;
        m.position.set(px, y, pz); m.rotation.y = ang; scene.add(m);
        this.bartenders.push({ m, ph: Math.random() * 6, bones: this.bonesOf(m) });
      }
      for (let k = 0; k < 14; k++) { const o = -4.5 + (k % 7) * 1.5, row = Math.floor(k / 7); this.barSpots.push([x + bx * (1.3 + row * 0.8) + Math.cos(ang) * o, z + bz * (1.3 + row * 0.8) - Math.sin(ang) * o, ang + Math.PI]); }
    }
    // 5000 LIDÍ: rovnoměrně po dvoře, mimo pódia, bary a budovy
    this.crowd = new Crowd(scene, { capacity: 5000, shirt: '#ffffff', pants: '#2a3140' });
    this.people = [];
    const busy = (x, z) => {
      const dx = x - S.x, dz = z - S.z, f = dx * fx + dz * fz, r = dx * rx + dz * rz;
      if (f > -5 && f < 5.5 && Math.abs(r) < 12) return true; // hlavní pódium + reproduktory
      for (const q of this.gogos) if (Math.hypot(x - q.cx, z - q.cz) < 2.4) return true;
      if (f > 6 && f < 14 && Math.abs(Math.abs(r) - 24) < 3.5) return true; // bary
      return false;
    };
    for (const [x, z, h] of this.barSpots) { if (this.people.length >= 5000) break; this.people.push({ i: this.people.length, x, z, y: city.ground(x, z), h, ph: Math.random() * 6, bar: true }); }
    // všechna volná místa na dvoře, pak vybrat 5000: nejhustěji u pódia, dozadu řidčeji
    const cand = [], step = 0.6;
    for (let x = -300; x < -126; x += step) for (let z = 1112; z < 1207; z += step) {
      const jx = x + (Math.random() - 0.5) * 0.35, jz = z + (Math.random() - 0.5) * 0.35;
      if (!inTri(jx, jz) || busy(jx, jz) || city.buildingAt(jx, jz) || city.collide(jx, jz, 0.3).hit) continue;
      cand.push([jx, jz, Math.hypot(jx - S.x, jz - S.z) * (0.55 + Math.random() * 0.9)]);
    }
    cand.sort((a, b) => a[2] - b[2]);
    for (const [jx, jz] of cand) {
      if (this.people.length >= 5000) break;
      this.people.push({ i: this.people.length, x: jx, z: jz, y: city.ground(jx, jz), h: Math.atan2(S.x - jx, S.z - jz) + (Math.random() - 0.5) * 0.6, ph: Math.random() * 6, hype: Math.random() });
    }
    // oblečení: pestré barvy triček
    for (const p of this.people) this.crowd.setShirt(p.i, COLORS[Math.floor(Math.random() * COLORS.length)]);
    /* ---------------- SVĚTLA ---------------- */
    const add2 = (m) => { g.add(m); return m; };
    const beamMat = (c, o = 0.55) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const beamGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 6); beamGeo.translate(0, 0.5, 0); beamGeo.rotateX(Math.PI / 2); // osa +Z
    const coneGeo = new THREE.ConeGeometry(1.6, 1, 20, 1, true); coneGeo.translate(0, -0.5, 0); coneGeo.rotateX(-Math.PI / 2); // špička v počátku, roste do +Z
    // lasery z pódia (vějíř 12)
    this.lasers = [];
    for (let k = 0; k < 12; k++) { const [x, y, z] = P(3.6, -7 + k * 1.27, 10.5); const m = add2(new THREE.Mesh(beamGeo, beamMat(COLORS[k % 6]))); m.position.set(x, y, z); m.scale.set(1.4, 1.4, 70); this.lasers.push({ m, k, kind: 'lasers' }); }
    // vějíř z podlahy pódia (16 tenkých)
    for (let k = 0; k < 16; k++) { const [x, y, z] = P(3.9, -6 + k * 0.8, 1.9); const m = add2(new THREE.Mesh(beamGeo, beamMat('#39ff14', 0.6))); m.position.set(x, y, z); m.scale.set(0.7, 0.7, 80); this.lasers.push({ m, k, kind: 'fan' }); }
    // laserový strop: z rohů dvora přes dav
    const corners = [[-292, 1128], [-134, 1118], [-210, 1200], [-260, 1150], [-170, 1140]];
    for (let k = 0; k < 20; k++) { const c = corners[k % corners.length]; const m = add2(new THREE.Mesh(beamGeo, beamMat(COLORS[(k + 2) % 8], 0.5))); m.position.set(c[0], gy + 7 + (k % 3), c[1]); m.scale.set(1, 1, 90); this.lasers.push({ m, k, kind: 'ceiling' }); }
    // tunel: kruh laserů nad davem směrem k pódiu
    for (let k = 0; k < 18; k++) { const m = add2(new THREE.Mesh(beamGeo, beamMat('#00e5ff', 0.5))); this.lasers.push({ m, k, kind: 'tunnel' }); }
    // mega show: široké paprsky
    for (let k = 0; k < 8; k++) { const [x, y, z] = P(0, -6 + k * 1.7, 11); const m = add2(new THREE.Mesh(beamGeo, beamMat(COLORS[k], 0.45))); m.position.set(x, y, z); m.scale.set(5, 5, 90); this.lasers.push({ m, k, kind: 'mega' }); }
    // otočné hlavy (kužely) na trusu
    this.heads = [];
    for (let k = 0; k < 10; k++) { const [x, y, z] = P(3.6 - (k % 2) * 7.6, -7.5 + Math.floor(k / 2) * 3.75, 10.6); const m = add2(new THREE.Mesh(coneGeo, beamMat('#ffffff', 0.12))); m.position.set(x, y, z); m.scale.set(1.2, 1.2, 30); this.heads.push({ m, k }); }
    // barvy na domy: kužely z dvora na fasády + pulzující světla
    this.walls = [];
    for (const b of city.buildings) {
      const cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2;
      if (Math.hypot(cx - S.x, cz - S.z) > 90 || !b.inPrison) continue;
      if (!inTri(cx, cz) && Math.abs(cz - 1120) > 25) continue;
      const m = add2(new THREE.Mesh(coneGeo, beamMat('#ff00d4', 0.16)));
      const ox = cx + (S.x - cx) * 0.35, oz = cz + (S.z - cz) * 0.35; m.position.set(ox, gy + 0.3, oz); m.lookAt(cx, gy + 5, cz);
      m.scale.set(3, 3, Math.hypot(cx - ox, cz - oz) + 3); this.walls.push({ m, k: this.walls.length });
    }
    for (let k = 0; k < 2; k++) { const l = new THREE.PointLight(COLORS[k], 30, 70, 1.3); const c = corners[k]; l.position.set(c[0], gy + 6, c[1]); g.add(l); this.walls.push({ light: l, k }); }
    // stroboskopy a oslňovače
    this.strobeL = new THREE.PointLight('#ffffff', 0, 90, 1.2); this.strobeL.position.set(...P(4, 0, 12)); g.add(this.strobeL);
    this.blinders = [];
    for (let k = 0; k < 8; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,255,1)', 'rgba(255,230,180,.6)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.set(...P(3.8, -7 + k * 2, 10.2)); sp.scale.set(2.2, 2.2, 1); g.add(sp); this.blinders.push(sp); }
    // hlavní světlo na dav a pódium (aby bylo vidět)
    this.washL = new THREE.PointLight('#8a6bff', 300, 140, 1.15); this.washL.position.set(...P(22, 0, 16)); g.add(this.washL);
    this.washL2 = new THREE.PointLight('#ff4fd8', 220, 120, 1.15); this.washL2.position.set(...P(45, 0, 14)); g.add(this.washL2);
    
    // plameny a CO2 před pódiem
    this.flameT = glowTex('rgba(255,250,200,1)', 'rgba(255,120,0,.85)');
    this.flames = [], this.co2 = [];
    for (let k = 0; k < 6; k++) { const [x, y, z] = P(4.4, -7 + k * 2.8, 1.8); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.position.set(x, y + 1.5, z); g.add(sp); this.flames.push({ sp, y: y + 1.5, k }); }
    const smokeT = glowTex('rgba(255,255,255,.9)', 'rgba(220,230,255,.35)');
    for (let k = 0; k < 4; k++) { const [x, y, z] = P(4.4, -8 + k * 5.3, 1.8); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.position.set(x, y + 3, z); g.add(sp); this.co2.push({ sp, y, k }); }
    // disco koule
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.05, flatShading: true }));
    this.ball.position.set(...P(14, 0, 12)); g.add(this.ball);
    this.sparkles = [];
    const spT = glowTex('rgba(255,255,255,1)', 'rgba(200,220,255,.5)');
    for (let k = 0; k < 120; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(0.35); g.add(sp); this.sparkles.push({ sp, a: Math.random() * 6.28, r: 8 + Math.random() * 40, y: Math.random() * 6 }); }
    // mlha (nízké opar sprity)
    this.fogs = [];
    const fogT = glowTex('rgba(200,200,255,.35)', 'rgba(120,120,200,.12)');
    for (let k = 0; k < 40; k++) { let x, z; do { x = -290 + Math.random() * 160; z = 1118 + Math.random() * 88; } while (!inTri(x, z)); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); sp.position.set(x, gy + 1.2, z); sp.scale.set(14, 4, 1); g.add(sp); this.fogs.push({ sp, ph: Math.random() * 6 }); }
    // konfety (body)
    const n = 3000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { pos[k * 3] = S.x + (Math.random() - 0.5) * 70; pos[k * 3 + 1] = gy + Math.random() * 25; pos[k * 3 + 2] = S.z + (Math.random() - 0.5) * 70; const c = new THREE.Color(COLORS[k % 8]); col.set([c.r, c.g, c.b], k * 3); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.12, vertexColors: true })); this.confetti.frustumCulled = false; g.add(this.confetti);
    // řetězy světel po obvodu dvora
    const bulbs = [], bc = [];
    for (let e = 0; e < 3; e++) { const [ax, az] = TRI[e], [bx, bz] = TRI[(e + 1) % 3], L = Math.hypot(bx - ax, bz - az); for (let s = 0; s < L; s += 1.2) { const t = s / L; bulbs.push(ax + (bx - ax) * t + (S.x - ax) * 0.03, gy + 5 + Math.sin(s * 0.6) * 0.5, az + (bz - az) * t + (S.z - az) * 0.03); const c = new THREE.Color(COLORS[bulbs.length % 8]); bc.push(c.r, c.g, c.b); } }
    const sg2 = new THREE.BufferGeometry(); sg2.setAttribute('position', new THREE.Float32BufferAttribute(bulbs, 3)); sg2.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    this.strings = new THREE.Points(sg2, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(this.strings);
    // ohňostroj
    this.fw = []; this.fwT = glowTex('rgba(255,255,255,1)', 'rgba(255,200,120,.6)');
  }
  bonesOf(m) { const b = {}; m.traverse((o) => { if (/^UpperArm\.?L$/.test(o.name)) b.uaL = o; if (/^UpperArm\.?R$/.test(o.name)) b.uaR = o; if (/^Torso$/.test(o.name)) b.torso = o; if (/^Hips$/.test(o.name)) b.hips = o; }); return b; }

  /* ---------------- ovládací panel ---------------- */
  makePanel() {
    const css = document.createElement('style'); css.id = 'party-css';
    css.textContent = `#party-panel{position:fixed;right:12px;top:max(70px,calc(env(safe-area-inset-top) + 60px));z-index:42;width:min(330px,92vw);max-height:72vh;overflow:auto;background:rgba(8,8,14,.88);border:1px solid rgba(57,255,20,.4);border-radius:14px;padding:10px;font:700 12px "Chakra Petch",sans-serif;color:#fff;pointer-events:auto}
#party-panel h3{margin:0 0 8px;font:400 15px "Bungee",sans-serif;color:#39ff14;display:flex;justify-content:space-between;align-items:center}
#party-panel .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}
#party-panel button{font:700 12px "Chakra Petch",sans-serif;color:#cfd3da;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 6px;cursor:pointer;text-align:left}
#party-panel button.on{background:linear-gradient(90deg,rgba(57,255,20,.35),rgba(0,229,255,.25));color:#fff;border-color:#39ff14}
#party-panel .row{display:flex;gap:6px;align-items:center;margin-top:8px}#party-panel input[type=range]{flex:1;accent-color:#39ff14}
#party-panel .sw{width:22px;height:22px;border-radius:50%;border:2px solid #fff3;cursor:pointer;padding:0}
#party-panel .min{background:none;border:0;color:#39ff14;font-size:16px;cursor:pointer;padding:0 4px}
#party-panel.collapsed .body{display:none}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.id = 'party-panel';
    d.innerHTML = `<h3>🎛️ Světelný pult <span><button class="min" data-a="min">–</button><button class="min" data-a="end">✕</button></span></h3><div class="body"><div class="grid">${EFFECTS.map(([k, l], i) => `<button data-fx="${k}" class="${this.fx[k] ? 'on' : ''}">${i + 1}. ${l}</button>`).join('')}</div>
<div class="row">Rychlost <input type="range" min="0.3" max="3" step="0.1" value="1" data-a="speed"></div>
<div class="row">Jas <input type="range" min="0.2" max="1.5" step="0.05" value="1" data-a="master"></div>
<div class="row">${COLORS.map((c, i) => `<button class="sw" data-col="${i}" style="background:${c}"></button>`).join('')}</div>
<div class="row"><button data-a="all">Vše zap</button><button data-a="none">Vše vyp</button><button data-a="rnd">Náhodně</button></div></div>`;
    document.body.appendChild(d); this.panel = d;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.fx) { const k = b.dataset.fx; this.fx[k] = !this.fx[k]; b.classList.toggle('on', this.fx[k]); }
      if (b.dataset.col) { this.color = +b.dataset.col; this.fx.rainbow = false; d.querySelector('[data-fx=rainbow]').classList.remove('on'); }
      const a = b.dataset.a;
      if (a === 'min') d.classList.toggle('collapsed');
      if (a === 'end') this.stop();
      if (a === 'all' || a === 'none' || a === 'rnd') for (const [k] of EFFECTS) { this.fx[k] = a === 'all' ? true : a === 'none' ? false : Math.random() < 0.55; d.querySelector(`[data-fx=${k}]`).classList.toggle('on', this.fx[k]); }
    });
    d.addEventListener('input', (e) => { const a = e.target.dataset.a; if (a === 'speed') this.speed = +e.target.value; if (a === 'master') this.master = +e.target.value; });
  }

  /* ---------------- průběh ---------------- */
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const G = this.game, F = this.fx, t = this.t * this.speed, gy = this.gy;
    const mt = this.music && !this.music.paused ? this.music.currentTime : this.t;
    const beatF = (mt * BPM) / 60, beat = beatF % 1, pulse = F.beat ? Math.pow(1 - beat, 3) : 0.5, bar = Math.floor(beatF / 4);
    const col = (k) => F.rainbow ? new THREE.Color().setHSL(((t * 0.08 + k * 0.07) % 1), 1, 0.55) : new THREE.Color(F.uv ? '#7a2bff' : COLORS[(this.color + k) % COLORS.length]);
    const M = this.master;
    // lasery
    for (const L of this.lasers) {
      const on = F[L.kind] || (F.mega && L.kind === 'mega');
      L.m.visible = !!on && (L.kind !== 'mega' || F.mega);
      if (!L.m.visible) continue;
      const k = L.k;
      L.m.material.color.copy(col(k)); L.m.material.opacity = (L.kind === 'mega' ? 0.32 : 0.5) * M * (0.55 + pulse * 0.6);
      if (L.kind === 'lasers') { const yaw = FACE + Math.sin(t * 1.3 + k * 0.5) * 0.9, pit = 0.05 + Math.sin(t * 0.9 + k) * 0.25; L.m.rotation.set(-pit, yaw, 0, 'YXZ'); }
      else if (L.kind === 'fan') { const yaw = FACE + (k - 7.5) * 0.09 * (1 + Math.sin(t * 0.7)), pit = -0.25 - Math.sin(t * 2 + k * 0.3) * 0.2; L.m.rotation.set(pit, yaw, 0, 'YXZ'); L.m.visible = (Math.floor(beatF * 2) + k) % 3 !== 0 || !F.beat; }
      else if (L.kind === 'ceiling') { const tx = S.x + Math.sin(t * 0.6 + k) * 30, tz = S.z + Math.cos(t * 0.5 + k * 1.3) * 25; L.m.lookAt(tx, gy + 4 + Math.sin(t + k) * 2, tz); }
      else if (L.kind === 'tunnel') { const a = (k / 18) * Math.PI * 2 + t * 0.8, [cx, cy, cz] = this.P(26, 0, 5); L.m.position.set(cx + Math.cos(a) * 6 * Math.cos(FACE), cy + Math.sin(a) * 4, cz - Math.cos(a) * 6 * Math.sin(FACE)); L.m.rotation.set(0, FACE + Math.PI, 0); L.m.scale.set(1, 1, 30); }
      else if (L.kind === 'mega') { const yaw = FACE + Math.sin(t * 0.8 + k * 0.8) * 1.2, pit = -0.15 + Math.sin(t * 1.7 + k) * 0.35; L.m.rotation.set(pit, yaw, 0, 'YXZ'); }
    }
    // otočné hlavy
    for (const H of this.heads) { H.m.visible = F.heads; if (!F.heads) continue; const yaw = FACE + Math.sin(t * 0.9 + H.k) * 0.8, pit = 0.7 + Math.sin(t * 1.1 + H.k * 1.7) * 0.35; H.m.rotation.set(pit, yaw, 0, 'YXZ'); H.m.material.color.copy(col(H.k + 3)); H.m.material.opacity = 0.1 * M * (0.6 + pulse); }
    // domy
    for (const W of this.walls) { if (W.m) { W.m.visible = F.walls; W.m.material.color.copy(col(W.k)); W.m.material.opacity = 0.15 * M * (0.5 + pulse); } if (W.light) { W.light.visible = F.walls; W.light.color.copy(col(W.k)); W.light.intensity = 70 * M * (0.4 + pulse); } }
    // strobo + oslňovače
    const strobeOn = F.strobe && Math.floor(this.t * 14) % 2 === 0;
    this.strobeL.intensity = strobeOn ? 220 * M : 0;
    for (const [k, B] of this.blinders.entries()) { B.visible = F.blinders || strobeOn; B.material.opacity = F.blinders ? (beat < 0.15 ? 1 : 0.15) * M : strobeOn ? 1 : 0; B.scale.setScalar(2 + (k % 2) * 0.5); }
    this.washL.color.copy(col(5)); this.washL.intensity = 300 * M * (0.55 + pulse * 0.7);
    this.washL2.color.copy(col(1)); this.washL2.intensity = 220 * M * (0.55 + (1 - pulse) * 0.5);
    this.edge.material.color.copy(col(2));
    // LED stěna
    this.led.visible = F.led; if (F.led) this.drawLed(t, beat, col);
    // plameny, CO2
    for (const Fl of this.flames) { const burst = F.flames && ((bar % 2 === 0 && beat < 0.35) || F.mega); Fl.sp.visible = burst; if (burst) { const h = 2.5 + Math.random() * 1.5; Fl.sp.scale.set(1.4, h, 1); Fl.sp.position.y = Fl.y + h / 2 - 0.5; } }
    if (F.flames && bar % 2 === 0 && beat < 0.05) G.audio?.noise?.(0.3, 0.25, 250);
    for (const Cc of this.co2) { const shot = F.co2 && bar % 4 === 3 && beat < 0.6; Cc.sp.material.opacity = shot ? 0.8 * (1 - beat) : Math.max(0, Cc.sp.material.opacity - dt * 1.5); Cc.sp.scale.set(2.5, 6 + beat * 6, 1); }
    // konfety
    this.confetti.visible = F.confetti;
    if (F.confetti) { const a = this.confetti.geometry.attributes.position; for (let k = 0; k < a.count; k++) { let y = a.getY(k) - dt * (1.2 + (k % 5) * 0.3); if (y < gy) y = gy + 22 + Math.random() * 6; a.setY(k, y); a.setX(k, a.getX(k) + Math.sin(this.t * 2 + k) * dt * 0.4); } a.needsUpdate = true; }
    // disco koule
    this.ball.visible = F.ball; this.ball.rotation.y += dt * 0.8;
    for (const s2 of this.sparkles) { s2.sp.visible = F.ball; if (!F.ball) continue; s2.a += dt * 0.5; s2.sp.position.set(S.x + Math.cos(s2.a) * s2.r, gy + 0.5 + s2.y, S.z + Math.sin(s2.a) * s2.r); s2.sp.material.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(this.t * 6 + s2.r)); }
    // mlha
    for (const f of this.fogs) { f.sp.visible = F.fog; f.sp.material.color.copy(col(4)); f.sp.position.x += Math.sin(this.t * 0.2 + f.ph) * dt * 0.5; }
    // řetězy
    this.strings.visible = F.strings; this.strings.material.opacity = 0.6 + pulse * 0.4;
    // ohňostroj
    if (F.fireworks && Math.random() < dt * 1.2) this.firework();
    this.updateFireworks(dt);
    // DJ, tanečnice, barmani, dav
    this.animatePeople(dt, beatF, pulse);
  }
  drawLed(t, beat, col) {
    const c = this.ledC, g = c.getContext('2d'), w = c.width, h = c.height;
    const mode = Math.floor(t / 6) % 4;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    if (mode === 0) { for (let k = 0; k < 16; k++) { g.fillStyle = '#' + col(k).getHexString(); const bh = (0.2 + Math.abs(Math.sin(t * 3 + k * 0.7)) * 0.8) * h * (1 - beat * 0.4); g.fillRect(k * w / 16 + 2, h - bh, w / 16 - 4, bh); } }
    else if (mode === 1) { for (let r = 0; r < 8; r++) { g.strokeStyle = '#' + col(r).getHexString(); g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, ((t * 80 + r * 40) % 320), 0, 7); g.stroke(); } }
    else if (mode === 2) { g.font = '900 96px "Russo One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#' + col(1).getHexString(); g.globalAlpha = 0.6 + (1 - beat) * 0.4; g.fillText(beat < 0.5 ? 'ONE MORE' : 'TIME', w / 2, h / 2); g.globalAlpha = 1; }
    else { for (let k = 0; k < 400; k++) { g.fillStyle = '#' + col(k).getHexString(); g.fillRect(Math.random() * w, Math.random() * h, 6, 6); } g.fillStyle = 'rgba(255,255,255,' + (1 - beat) * 0.3 + ')'; g.fillRect(0, 0, w, h); }
    this.ledT.needsUpdate = true;
  }
  firework() {
    const n = 90, pos = new Float32Array(n * 3), vel = [], c = new THREE.Color(COLORS[Math.floor(Math.random() * 8)]);
    const cx = S.x + (Math.random() - 0.5) * 60, cy = this.gy + 25 + Math.random() * 15, cz = S.z + (Math.random() - 0.5) * 50;
    for (let k = 0; k < n; k++) { pos.set([cx, cy, cz], k * 3); const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 4); vel.push(v); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: c, size: 0.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    p.frustumCulled = false; this.group.add(p); this.fw.push({ p, vel, t: 0 });
    this.game.audio?.noise?.(0.5, 0.35, 180);
  }
  updateFireworks(dt) {
    for (let i = this.fw.length - 1; i >= 0; i--) {
      const f = this.fw[i]; f.t += dt; const a = f.p.geometry.attributes.position;
      for (let k = 0; k < f.vel.length; k++) { f.vel[k].y -= 6 * dt; f.vel[k].multiplyScalar(1 - dt * 0.8); a.setXYZ(k, a.getX(k) + f.vel[k].x * dt, a.getY(k) + f.vel[k].y * dt, a.getZ(k) + f.vel[k].z * dt); }
      a.needsUpdate = true; f.p.material.opacity = Math.max(0, 1 - f.t / 2);
      if (f.t > 2) { this.group.remove(f.p); this.fw.splice(i, 1); }
    }
  }
  animatePeople(dt, beatF, pulse) {
    const t = this.game.time, bounce = (ph) => Math.max(0, Math.sin((beatF + ph * 0.05) * Math.PI * 2)) * 0.22;
    // DJ: kývání do rytmu, ruka nahoře na dropu
    animateHuman(this.dj, 0, dt);
    if (this.djBones.uaR) this.djBones.uaR.rotation.x -= 1.1 + (Math.floor(beatF / 8) % 2 ? Math.max(0, Math.sin(beatF * Math.PI)) * 1.6 : 0);
    if (this.djBones.uaL) this.djBones.uaL.rotation.x -= 1.0;
    this.dj.position.y = this.P(0, 0, 1.8)[1] + bounce(0) * 0.6;
    // gogo tanečnice: krouží kolem tyče, vlní se, ruce nahoře
    for (const D of this.gogos) {
      const a = t * 0.9 + D.ph, x = D.cx + Math.cos(a) * 0.45, z = D.cz + Math.sin(a) * 0.45;
      D.m.position.set(x, D.y + bounce(D.ph) * 0.7, z); D.m.rotation.y = Math.atan2(D.cx - x, D.cz - z) + Math.PI / 2 + Math.sin(t * 2 + D.ph) * 0.4;
      animateHuman(D.m, 0, dt);
      if (D.bones.uaL) D.bones.uaL.rotation.x -= 2.6 + Math.sin(t * 4 + D.ph) * 0.3;
      if (D.bones.uaR) D.bones.uaR.rotation.x -= 1.4 + Math.sin(t * 4 + D.ph + 1) * 0.6;
      if (D.bones.torso) D.bones.torso.rotation.z += Math.sin(t * 4 + D.ph) * 0.25;
      if (D.bones.hips) D.bones.hips.rotation.y += Math.sin(t * 4 + D.ph) * 0.3;
      D.ring.material.color.setHSL((t * 0.2 + D.ph) % 1, 1, 0.55);
    }
    // barmani: míchají drinky (shaker nahoře, ruce se střídají)
    for (const B of this.bartenders) {
      animateHuman(B.m, 0, dt);
      const s = Math.sin(t * 9 + B.ph);
      if (B.bones.uaR) B.bones.uaR.rotation.x -= 1.6 + s * 0.6;
      if (B.bones.uaL) B.bones.uaL.rotation.x -= 1.6 - s * 0.6;
    }
    // dav: skáčou do rytmu, ruce nahoře; u baru stojí a objednávají
    const C = this.crowd;
    C.updateCorpses(dt, (x, z) => this.game.city.ground(x, z), () => {});
    for (const p of this.people) {
      if (C.dead[p.i]) continue;
      if (p.bar) { C.set(p.i, p.x, p.y, p.z, p.h, 0, Math.sin(t * 1.3 + p.ph) > 0.7 ? 'smoke' : 'walk', t); continue; }
      const j = bounce(p.ph) * (0.6 + p.hype), mode = (p.hype > 0.35 || pulse > 0.6) ? 'riot' : 'walk';
      C.set(p.i, p.x, p.y + j, p.z, p.h + Math.sin(t * 2 + p.ph) * 0.2, 0, mode, t);
    }
    C.commit();
  }

  /** Cíle pro zbraně: lidé na party. */
  targets() {
    if (!this.active) return [];
    const C = this.crowd, out = [];
    for (const p of this.people) if (!C.dead[p.i]) out.push({ key: `party:${p.i}`, crowd: C, ci: p.i, mesh: { position: { x: C.x[p.i], y: C.y[p.i], z: C.z[p.i] } }, kill: (dir, boom) => C.kill(p.i, dir, boom?.vel || null) });
    return out;
  }

  stop() {
    if (!this.active) return;
    const G = this.game;
    this.active = false;
    this.music?.pause(); this.music = null;
    G.scene.remove(this.group);
    for (const m of [this.dj, ...this.gogos.map((d) => d.m), ...this.bartenders.map((b) => b.m)]) G.scene.remove(m);
    this.crowd?.hideAll(true); if (this.crowd) G.scene.remove(this.crowd.group);
    for (const pr of this.hidden || []) { if (!pr.broken) pr.obj.visible = true; if (pr.obst && pr._r != null) pr.obst.r = pr._r; }
    this.panel?.remove(); document.getElementById('party-css')?.remove();
    G.toast?.('Party skončila');
  }
}
