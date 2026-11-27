/*
 * PARTY v zadní části věznice: večer se dvůr promění v obří mejdan. Hlavní pódium s DJ, LED stěnou a pyrotechnikou,
 * čtyři menší pódia s gogo tanečnicemi u tyče, dva bary s barmany, 5000 tančících lidí, lasery, otočné hlavy,
 * stroboskopy, světla na domech, konfety, plameny, mlha a ohňostroj. Ovládací panel s 20 efekty (ručně mixovat).
 */
import * as THREE from 'three';
import { makeHuman, animateHuman } from './entities.js?v=20261127235908';
import { Avengers } from './avengers.js?v=20261127235908';
import { Crowd } from './crowd.js?v=20261127235908';

const S = { x: -204, z: 1170 }; // střed hlavního pódia
const FACE = Math.atan2(-232 - S.x, 1146 - S.z); // pódium hledí do dvora (k davu)
const TRI = [[-300, 1126], [-126, 1115], [-208, 1207]]; // obrys zadního dvora
const BPM = 122.7; // One More Time (výchozí)
const RW = { f0: 4, f1: 32.5, w: 5 }; // molo STAGE 2: od přední hrany pódia k gogo pódiím

/* Písničky: parts = [čas (s), kdo rapuje (index, -1 = všichni, null = nikdo), 'pole' = tanec u tyče]. Časy podle hlasitosti skladby. */
const TRACKS = [
  { title: 'One More Time', artist: 'Daft Punk', src: 'assets/audio/one-more-time.mp3', bpm: 122.7, genre: 'house', led: ['ONE MORE', 'TIME'] },
  { title: 'KSN (Pintlich rmx)', artist: 'YZO & PTK feat. Robin Zoot, Nik Tendo & Ektor', src: 'assets/audio/ksn.mp3', bpm: 139.5, genre: 'hiphop', led: ['KSN', 'KSN'],
    rappers: [
      { name: 'Yzomandias', model: 'Casual2_Male', shirt: '#111111', pants: '#1b1b1b' },
      { name: 'PTK', model: 'Casual3_Male', shirt: '#c9a227', pants: '#222' },
      { name: 'Robin Zoot', model: 'Casual_Male', shirt: '#e8e8e8', pants: '#2b2b33' },
      { name: 'Nik Tendo', model: 'Casual_Bald', shirt: '#b3202a', pants: '#111' },
      { name: 'Ektor', model: 'Suit_Male', shirt: '#1d1d22', pants: '#1d1d22' },
      { name: 'Pintlich', model: 'Worker_Male', shirt: '#2f6bff', pants: '#222' },
    ],
    parts: [[0, null], [20, -1], [32, 0], [46, 1], [58, 2], [73, 3], [86, -1], [93, 4], [107, 5], [118, 0], [131, 1], [144, 2], [157, 3], [170, -1], [181, null]] },
  { title: 'GET LOW', artist: 'YZO & PTK', src: 'assets/audio/get-low.mp3', bpm: 82.5, genre: 'hiphop', led: ['GET', 'LOW'],
    rappers: [
      { name: 'Yzomandias', model: 'Casual2_Male', shirt: '#111111', pants: '#1b1b1b' },
      { name: 'PTK', model: 'Casual3_Male', shirt: '#c9a227', pants: '#222' },
      { name: 'Crew – Robin', model: 'Casual_Male', shirt: '#e8e8e8', pants: '#2b2b33' },
      { name: 'Crew – Ektor', model: 'Suit_Male', shirt: '#1d1d22', pants: '#1d1d22' },
      { name: 'Crew – Pintlich', model: 'Worker_Male', shirt: '#2f6bff', pants: '#222' },
      { name: 'Crew – Nik', model: 'Casual_Bald', shirt: '#b3202a', pants: '#111' },
    ],
    parts: [[0, null], [2, 0], [21, 1], [36, 0], [51, -1], [65, 1], [82, 0], [97, 1], [113, 0], [129, -1], [143, 1], [160, 0], [175, null]] },
  { title: 'Kolem Krku', artist: 'Nik Tendo & Decky', src: 'assets/audio/kolem-krku.mp3', bpm: 100, genre: 'hiphop', led: ['KOLEM', 'KRKU'],
    rappers: [
      { name: 'Nik Tendo', model: 'Casual_Bald', shirt: '#b3202a', pants: '#111' },
      { name: 'Decky', model: 'Casual_Male', shirt: '#f2f2f2', pants: '#26262e' },
      { name: 'Crew – Yzo', model: 'Casual2_Male', shirt: '#111111', pants: '#1b1b1b' },
      { name: 'Crew – PTK', model: 'Casual3_Male', shirt: '#c9a227', pants: '#222' },
      { name: 'Crew – Ektor', model: 'Suit_Male', shirt: '#1d1d22', pants: '#1d1d22' },
      { name: 'Crew – Robin', model: 'Worker_Male', shirt: '#2f6bff', pants: '#222' },
    ],
    parts: [[0, null], [17, 0], [36, 1], [55, -1], [69, 1], [81, 0], [100, 1], [119, -1], [133, 0], [145, 1], [164, 0], [183, -1], [197, null]] },
  { title: 'UKA MI', artist: 'Annet X & Sara Rikas', src: 'assets/audio/uka-mi.mp3', bpm: 113, genre: 'hiphop', led: ['UKA', 'MI'], poles: true,
    rappers: [
      { name: 'Annet X', model: 'Casual2_Female', female: true, shirt: '#ff2d8a', pants: '#111111' },
      { name: 'Sara Rikas', model: 'Casual3_Female', female: true, shirt: '#111111', pants: '#c0c0c8' },
    ],
    parts: [[0, null, 'pole'], [11, 0], [28, 1], [45, -1], [56, null, 'pole'], [68, 0], [79, 1], [90, null, 'pole'], [101, -1], [118, 0], [130, null, 'pole'], [137, 1], [152, -1], [170, null, 'pole']] },
];
const HIP_COLORS = ['#ffb000', '#b026ff', '#ff2d55', '#ffd700', '#7a2bff', '#ff7a00', '#ffffff', '#ff00d4'];
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
    this.speed = 1; this.color = 0; this.master = 1; this.lightStyle = 'auto';
    this.S = S; this.FACE = FACE; this.RW = RW; this.av = new Avengers(this);
  }

  start() {
    if (this.active) { this.stop(); return; }
    const G = this.game;
    if (G.mma?.active) G.mma.finish(true);
    this.active = true; this.t = 0; this.stage2 = false;
    G.setHour = 22;
    this.build();
    this.makePanel();
    this.makePlayer();
    this.setTrack(0);
    this.av.hookFloor();
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
    // boční obrazovky: vyjedou do stran a obraz se roztáhne přes všechny tři (široké plátno, každá ukazuje třetinu)
    this.ledWC = document.createElement('canvas'); this.ledWC.width = 1536; this.ledWC.height = 256;
    const wt = new THREE.CanvasTexture(this.ledWC); wt.colorSpace = THREE.SRGBColorSpace; wt.repeat.set(1 / 3, 1);
    this.ledW = [wt, wt.clone(), wt.clone()]; this.ledW.forEach((tx, k) => { tx.offset.x = k / 3; });
    this.ledMain = this.led.material; this.ledMid = new THREE.MeshBasicMaterial({ map: this.ledW[1] });
    this.ledSide = [-1, 1].map((sd) => { const m = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: this.ledW[sd < 0 ? 0 : 2] })), ...P(-3.75, 0, 5.6), FACE); const fr = new THREE.Mesh(new THREE.BoxGeometry(14.3, 7.3, 0.25), black); fr.position.z = -0.15; m.add(fr); m.visible = false; return { m, sd }; });
    this.led3 = false; this.led3k = 0;
    // nápis DJ nad pódiem
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 160; const sg = sc.getContext('2d');
    sg.fillStyle = '#000'; sg.fillRect(0, 0, 1024, 160); sg.font = '900 110px "Russo One", sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.shadowColor = '#00e5ff'; sg.shadowBlur = 30; sg.fillStyle = '#ffffff'; sg.fillText('DJ TIËSTO', 512, 84);
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace; this.bannerC = sc; this.bannerT = st;
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
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 2.6, 20), black), x, y + 1.3, z);
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: '#ff00d4' })), x, y + 2.6, z); ring.rotation.x = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 10), mat('#e8e8e8', { metalness: 1, roughness: 0.1 })), x, y + 5.1, z);
      const d = makeHuman({ female: true, uniform: { shirt: COLORS[this.gogos.length % COLORS.length], pants: '#111' }, scale: 1, tint: false });
      d.position.set(x + 0.45, y + 2.6, z); scene.add(d);
      this.gogos.push({ m: d, x: x + 0.45, y: y + 2.6, z, cx: x, cz: z, ph: Math.random() * 6, bones: this.bonesOf(d), ring });
    }
    // STAGE 2: vysouvací molo z pódia do davu (stejná výška 1,8 m), vysune se tlačítkem
    {
      const W = RW.w, rg = new THREE.Group();
      const body = new THREE.BoxGeometry(W, 1.8, 1); body.translate(0, 0.9, 0.5);
      rg.add(new THREE.Mesh(body, black));
      const top = new THREE.BoxGeometry(W - 0.3, 0.03, 1); top.translate(0, 1.815, 0.5);
      this.rwTop = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ color: '#15151b', metalness: 0.7, roughness: 0.25 })); rg.add(this.rwTop);
      const strip = new THREE.BoxGeometry(0.1, 0.1, 1); strip.translate(0, 0, 0.5);
      this.rwStrips = [];
      for (const sx of [-W / 2, W / 2]) for (const sy of [1.8, 0.15]) { const m = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ color: '#39ff14' })); m.position.set(sx, sy, 0); rg.add(m); this.rwStrips.push(m); }
      const endG = new THREE.BoxGeometry(W, 0.1, 0.1); this.rwEnd = new THREE.Mesh(endG, new THREE.MeshBasicMaterial({ color: '#ff00d4' })); this.rwEnd.position.y = 1.8; rg.add(this.rwEnd);
      rg.position.set(...P(RW.f0 - 0.2, 0, 0)); rg.rotation.y = FACE; rg.scale.z = 0.001; rg.visible = false; g.add(rg);
      this.rw = { g: rg, L: 0, goal: 0 };
    }
    // 2 VELKÉ BARY po stranách (30 m na šířku, čelem do davu) s barmany, kteří míchají drinky
    this.bartenders = []; this.barSpots = []; this.bars = []; this.glasses = [];
    const bottleM = ['#2f8f3a', '#c9a043', '#8a1f2a', '#cfe8ff', '#3fa0ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, transparent: true, opacity: 0.9, emissive: c, emissiveIntensity: 0.55 }));
    const bottleG = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8), neckG = new THREE.CylinderGeometry(0.025, 0.04, 0.12, 6);
    const steel = mat('#d8dde3', { metalness: 1, roughness: 0.15 });
    const drinkC = ['#ff3d7f', '#39ff14', '#00e5ff', '#ffb000', '#b026ff'];
    const BL = 30; // délka baru
    for (const side of [-1, 1]) {
      const [cx, cy, cz] = P(12, side * 24, 0), y = cy;
      const dx = -side * rx, dz = -side * rz, ang = Math.atan2(dx, dz); // bar hledí k ose pódia (do davu)
      const Q = (u, v, h = 0) => [cx + fx * u + dx * v, y + h, cz + fz * u + dz * v]; // u = podél baru, v = k davu
      this.bars.push({ cx, cz, dx, dz });
      add(new THREE.Mesh(new THREE.BoxGeometry(BL, 1.15, 1.2), mat('#1a1012', { roughness: 0.4 })), ...Q(0, 0, 0.58), ang);
      add(new THREE.Mesh(new THREE.BoxGeometry(BL + 0.2, 0.08, 1.35), mat('#2a2a30', { metalness: 0.6, roughness: 0.25 })), ...Q(0, 0, 1.17), ang);
      add(new THREE.Mesh(new THREE.BoxGeometry(BL, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: '#00e5ff' })), ...Q(0, 0.62, 1.05), ang);
      add(new THREE.Mesh(new THREE.BoxGeometry(BL, 0.1, 0.04), new THREE.MeshBasicMaterial({ color: '#ff00d4' })), ...Q(0, 0.62, 0.12), ang);
      // zadní stěna s regály a lahvemi
      add(new THREE.Mesh(new THREE.BoxGeometry(BL, 3.4, 0.4), mat('#0d0d10')), ...Q(0, -3, 1.7), ang);
      for (const h of [1.25, 1.95, 2.65]) add(new THREE.Mesh(new THREE.BoxGeometry(BL - 1, 0.05, 0.35), new THREE.MeshBasicMaterial({ color: '#ffb35c' })), ...Q(0, -2.65, h), ang);
      for (let k = 0; k < 3 * 56; k++) {
        const u = -BL / 2 + 1 + (k % 56) * ((BL - 2) / 55), h = 1.45 + Math.floor(k / 56) * 0.7, m = bottleM[(k * 7) % 5];
        add(new THREE.Mesh(bottleG, m), ...Q(u, -2.65, h), ang); add(new THREE.Mesh(neckG, m), ...Q(u, -2.65, h + 0.23), ang);
      }
      // stříška s neonem a velký nápis BAR
      add(new THREE.Mesh(new THREE.BoxGeometry(BL + 1, 0.25, 4.8), mat('#111116')), ...Q(0, -1.1, 3.9), ang);
      add(new THREE.Mesh(new THREE.BoxGeometry(BL + 1, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: '#39ff14' })), ...Q(0, 1.32, 3.85), ang);
      for (const u of [-BL / 2, BL / 2]) add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.9, 0.25), truss), ...Q(u, 1.1, 1.95), ang);
      const sign = document.createElement('canvas'); sign.width = 1024; sign.height = 192; const ig = sign.getContext('2d'); ig.fillStyle = '#000'; ig.fillRect(0, 0, 1024, 192); ig.font = '900 130px "Russo One", sans-serif'; ig.textAlign = 'center'; ig.textBaseline = 'middle'; ig.shadowColor = '#ff00d4'; ig.shadowBlur = 34; ig.fillStyle = '#ff7ae8'; ig.fillText('★ BAR ★', 512, 100);
      const stx = new THREE.CanvasTexture(sign); stx.colorSpace = THREE.SRGBColorSpace;
      add(new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: stx })), ...Q(0, 1.2, 5.0), ang);
      add(new THREE.Mesh(new THREE.BoxGeometry(BL, 0.55, 2.4), mat('#18181c')), ...Q(0, -1.5, 0.27), ang); // vyvýšená podlaha za barem
      // teplé světlo nad barem, ať jsou barmani vidět
      const bl = new THREE.PointLight('#ffd2a0', 70, 32, 1.1); bl.position.set(...Q(0, 0.4, 3.4)); g.add(bl);
      // 6 barmanů: šejkr v ruce, sklenice na pultu
      for (let k = 0; k < 6; k++) {
        const u = -BL / 2 + 2.5 + k * ((BL - 5) / 5), m = makeHuman({ name: k % 2 ? 'Suit_Male' : 'Casual_Female', uniform: { shirt: '#111', pants: '#111' }, tint: false });
        const [px, , pz] = Q(u, -1.0); m.position.set(px, y + 0.55, pz); m.scale.multiplyScalar(1.12); m.rotation.y = ang; scene.add(m);
        const shaker = new THREE.Group();
        const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.3, 12), steel); shaker.add(sb);
        const sc2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.085, 0.1, 12), steel); sc2.position.y = 0.2; shaker.add(sc2);
        g.add(shaker);
        const glasses = [];
        for (const du of [-0.45, 0.45]) {
          const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.22, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, roughness: 0 }));
          const c = drinkC[(k + (du > 0 ? 1 : 0)) % 5];
          const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 1, 12), new THREE.MeshBasicMaterial({ color: c }));
          drink.geometry.translate(0, 0.5, 0);
          const [gx, gy2, gz] = Q(u + du, 0.05, 1.21); glass.position.set(gx, gy2 + 0.11, gz); drink.position.set(gx, gy2 + 0.01, gz);
          g.add(glass); g.add(drink); glasses.push({ glass, drink });
        }
        this.bartenders.push({ m, ph: Math.random() * 6, bones: this.bonesOf(m), shaker, glasses, ang });
      }
      // fronta lidí u baru: 3 řady
      for (let row = 0; row < 3; row++) for (let u = -BL / 2 + 0.6; u < BL / 2 - 0.4; u += 0.95) {
        const [sx, , sz] = Q(u + (row % 2) * 0.45, 1.25 + row * 0.75); this.barSpots.push([sx, sz, ang + Math.PI]);
      }
    }
    // 5000 LIDÍ: rovnoměrně po dvoře, mimo pódia, bary a budovy
    this.crowd = new Crowd(scene, { capacity: 5000, shirt: '#3a3f4a', pants: '#20242c' });
    this.people = [];
    const busy = (x, z) => {
      const dx = x - S.x, dz = z - S.z, f = dx * fx + dz * fz, r = dx * rx + dz * rz;
      if (f > -5 && f < 5.5 && Math.abs(r) < 12) return true; // hlavní pódium + reproduktory
      for (const q of this.gogos) if (Math.hypot(x - q.cx, z - q.cz) < 2.4) return true;
      for (const B of this.bars) { const ox = x - B.cx, oz = z - B.cz, u = ox * fx + oz * fz, v = ox * B.dx + oz * B.dz; if (Math.abs(u) < 16 && v > -4 && v < 3.6) return true; } // bary + fronta
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
    // lidé v cestě mola: kam uhnou (do stran) a kam se dívají, když je molo venku
    for (const p of this.people) {
      if (p.bar) continue;
      const dx = p.x - S.x, dz = p.z - S.z, f = dx * fx + dz * fz, r = dx * rx + dz * rz;
      p.m = 0;
      if (f > RW.f0 - 0.5 && f < RW.f1 + 0.8 && Math.abs(r) < RW.w / 2 + 0.5) {
        const nr = (r < 0 ? -1 : 1) * (RW.w / 2 + 0.6 + Math.random() * 2.2), nf = Math.min(f, RW.f1 + 0.6 + Math.random() * 2);
        p.ax = S.x + fx * nf + rx * nr; p.az = S.z + fz * nf + rz * nr; p.rf = f;
      }
      if (f > 2 && f < RW.f1 + 12 && Math.abs(r) < 16) { const cf = Math.max(RW.f0, Math.min(RW.f1, f)), tx = S.x + fx * cf, tz = S.z + fz * cf; p.h2 = Math.atan2(tx - p.x, tz - p.z); }
    }
    // oblečení: pestré barvy triček
    for (const p of this.people) { p.col = COLORS[Math.floor(Math.random() * COLORS.length)]; this.crowd.setShirt(p.i, p.col); }
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
    this.washL = new THREE.PointLight('#8a6bff', 110, 110, 1.25); this.washL.position.set(...P(22, 0, 16)); g.add(this.washL);
    this.washL2 = new THREE.PointLight('#ff4fd8', 80, 100, 1.25); this.washL2.position.set(...P(45, 0, 14)); g.add(this.washL2);
    
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
  bonesOf(m) { const b = {}; m.traverse((o) => { if (/^UpperArm\.?L$/.test(o.name)) b.uaL = o; if (/^UpperArm\.?R$/.test(o.name)) b.uaR = o; if (/^Torso$/.test(o.name)) b.torso = o; if (/^Hips$/.test(o.name)) b.hips = o; if (/^Fist\.?R$/.test(o.name)) b.fistR = o; }); return b; }

  /* ---------------- ovládací panel ---------------- */
  makePanel() {
    const css = document.createElement('style'); css.id = 'party-css';
    css.textContent = `#party-panel{position:fixed;right:12px;top:max(150px,calc(env(safe-area-inset-top) + 144px));z-index:42;width:min(330px,92vw);max-height:calc(100vh - 230px);overflow:auto;background:rgba(8,8,14,.88);border:1px solid rgba(57,255,20,.4);border-radius:14px;padding:10px;font:700 12px "Chakra Petch",sans-serif;color:#fff;pointer-events:auto}
#party-panel h3{margin:0 0 8px;font:400 15px "Bungee",sans-serif;color:#39ff14;display:flex;justify-content:space-between;align-items:center}
#party-panel .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}
#party-panel button{font:700 12px "Chakra Petch",sans-serif;color:#cfd3da;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px 6px;cursor:pointer;text-align:left}
#party-panel button.on{background:linear-gradient(90deg,rgba(57,255,20,.35),rgba(0,229,255,.25));color:#fff;border-color:#39ff14}
#party-panel .row{display:flex;gap:6px;align-items:center;margin-top:8px}#party-panel input[type=range]{flex:1;accent-color:#39ff14}
#party-panel .sw{width:22px;height:22px;border-radius:50%;border:2px solid #fff3;cursor:pointer;padding:0}
#party-panel .min{background:none;border:0;color:#39ff14;font-size:16px;cursor:pointer;padding:0 4px}
#party-panel.collapsed .body{display:none}
#party-player{position:fixed;right:12px;top:max(56px,calc(env(safe-area-inset-top) + 50px));z-index:43;width:min(330px,92vw);background:rgba(8,8,14,.9);border:1px solid rgba(57,255,20,.45);border-radius:12px;padding:6px 8px;font:700 11px "Chakra Petch",sans-serif;color:#fff;pointer-events:auto}
#party-player .pp-top{display:flex;align-items:center;gap:4px}#party-player .pp-top button{font-size:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:7px;width:26px;height:24px;padding:0;cursor:pointer}
#party-player .pp-top button.st2{width:auto;padding:0 7px;font:800 11px "Chakra Petch",sans-serif;color:#04140b;background:#39ff14;border-color:#39ff14}#party-player .pp-top button.st2.on{background:#ff2d8a;border-color:#ff2d8a;color:#fff}
#party-player .pp-t{flex:1;min-width:0;line-height:1.1}#party-player .pp-t b{display:block;font:400 11.5px "Bungee",sans-serif;color:#39ff14;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#party-player .pp-t span{display:block;font-size:10px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#party-player input{width:46px;accent-color:#39ff14}
#party-player .pp-list{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}#party-player .pp-list button{font:700 10px "Chakra Petch",sans-serif;color:#cfd3da;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:2px 7px;cursor:pointer}
#party-player .pp-list button.on{background:linear-gradient(90deg,rgba(57,255,20,.4),rgba(0,229,255,.3));color:#fff;border-color:#39ff14}
@media (max-width:760px){#party-player{top:auto;bottom:calc(150px + env(safe-area-inset-bottom))}#party-player input{display:none}}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.id = 'party-panel';
    d.innerHTML = `<h3>🎛️ Světelný pult <span><button class="min" data-a="min">–</button><button class="min" data-a="end">✕</button></span></h3><div class="body"><div class="grid">${EFFECTS.map(([k, l], i) => `<button data-fx="${k}" class="${this.fx[k] ? 'on' : ''}">${i + 1}. ${l}</button>`).join('')}</div>
<div class="row"><button data-a="led3">📺 3 obrazovky vedle sebe</button></div>
<div class="row">Styl <button data-style="auto" class="on">AUTO</button><button data-style="disco">DISKO</button><button data-style="hiphop">HIP HOP</button></div>
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
      if (b.dataset.style) { this.lightStyle = b.dataset.style; d.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('on', x === b)); }
      if (b.dataset.col) { this.color = +b.dataset.col; this.fx.rainbow = false; d.querySelector('[data-fx=rainbow]').classList.remove('on'); }
      const a = b.dataset.a;
      if (a === 'led3') { this.led3 = !this.led3; b.classList.toggle('on', this.led3); this.game.audio?.noise?.(0.8, 0.2, 110); }
      if (a === 'min') d.classList.toggle('collapsed');
      if (a === 'end') this.stop();
      if (a === 'all' || a === 'none' || a === 'rnd') for (const [k] of EFFECTS) { this.fx[k] = a === 'all' ? true : a === 'none' ? false : Math.random() < 0.55; d.querySelector(`[data-fx=${k}]`).classList.toggle('on', this.fx[k]); }
    });
    d.addEventListener('input', (e) => { const a = e.target.dataset.a; if (a === 'speed') this.speed = +e.target.value; if (a === 'master') this.master = +e.target.value; });
  }

  /* ---------------- průběh ---------------- */
  update(dt) {
    if (!this.active) return;
    if (this.doom) { this.av.update(dt, 0); return; } // DOOM: vše zhasne, ztichne a nikdo se nehne
    this.t += dt;
    const G = this.game, F = this.fx, gy = this.gy;
    const mt = this.music && !this.music.paused ? this.music.currentTime : this.t;
    const beatF = (mt * (this.bpm || BPM)) / 60, beat = beatF % 1, bar = Math.floor(beatF / 4);
    const hipL = this.lightStyle === 'hiphop' || (this.lightStyle === 'auto' && TRACKS[this.ti]?.genre === 'hiphop');
    // HIP HOP: světla se pohnou skokem na každý úder a pak drží, pomaleji; důraz na 2. a 4. dobu. DISKO: plynule a rychle
    const t = hipL ? (Math.floor(beatF) + Math.min(1, beat * 5)) * 0.32 * this.speed : this.t * this.speed;
    const pulse = !F.beat ? 0.5 : hipL ? Math.pow(1 - beat, 2) * (Math.floor(beatF) % 2 ? 1 : 0.45) : Math.pow(1 - beat, 3);
    const PAL = hipL ? HIP_COLORS : COLORS;
    const col = (k) => F.rainbow ? new THREE.Color().setHSL(((t * 0.08 + k * 0.07) % 1), 1, 0.55) : new THREE.Color(F.uv ? '#7a2bff' : PAL[(this.color + k) % PAL.length]);
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
    const strobeOn = F.strobe && (hipL ? Math.floor(beatF) % 2 === 1 && beat < 0.09 : Math.floor(this.t * 14) % 2 === 0);
    this.strobeL.intensity = strobeOn ? 220 * M : 0;
    for (const [k, B] of this.blinders.entries()) { B.visible = F.blinders || strobeOn; B.material.opacity = F.blinders ? (beat < 0.15 ? 1 : 0.15) * M : strobeOn ? 1 : 0; B.scale.setScalar(2 + (k % 2) * 0.5); }
    this.washL.color.copy(col(5)); this.washL.intensity = 110 * M * (0.55 + pulse * 0.7);
    this.washL2.color.copy(col(1)); this.washL2.intensity = 80 * M * (0.55 + (1 - pulse) * 0.5);
    this.edge.material.color.copy(col(2));
    // LED stěna
    this.led3k += ((this.led3 ? 1 : 0) - this.led3k) * Math.min(1, dt * 1.8);
    const wide = this.led3k > 0.03;
    this.led.material = wide ? this.ledMid : this.ledMain;
    for (const sd of this.ledSide) { sd.m.visible = F.led && wide; const [lx, ly, lz] = this.P(-3.75, sd.sd * 14.15 * this.led3k, 5.6); sd.m.position.set(lx, ly, lz); }
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
    this.updateRunway(dt, col);
    this.updatePerformers(dt, mt, beatF);
    this.av.update(dt, beatF);
  }
  drawLed(t, beat, col) {
    const wideL = this.led3k > 0.03, c = wideL ? this.ledWC : this.ledC, g = c.getContext('2d'), w = c.width, h = c.height;
    const tr = TRACKS[this.ti] || TRACKS[0], mode = Math.floor(t / 5) % 4;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    // efekt v pozadí
    if (mode === 0) { { const nb = wideL ? 48 : 16; for (let k = 0; k < nb; k++) { g.fillStyle = '#' + col(k).getHexString(); const bh = (0.2 + Math.abs(Math.sin(t * 3 + k * 0.7)) * 0.8) * h * (1 - beat * 0.4); g.fillRect(k * w / nb + 2, h - bh, w / nb - 4, bh); } } }
    else if (mode === 1) { for (let r = 0; r < (wideL ? 22 : 8); r++) { g.strokeStyle = '#' + col(r).getHexString(); g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, ((t * 80 + r * 40) % (w * 0.62)), 0, 7); g.stroke(); } }
    else if (mode === 2) { for (let k = 0; k < (wideL ? 30 : 12); k++) { g.fillStyle = '#' + col(k).getHexString(); g.globalAlpha = 0.7; const x = ((t * 140 + k * 90) % (w + 120)) - 60; g.fillRect(x, 0, 26, h); } g.globalAlpha = 1; }
    else { for (let k = 0; k < (wideL ? 1100 : 400); k++) { g.fillStyle = '#' + col(k).getHexString(); g.fillRect(Math.random() * w, Math.random() * h, 6, 6); } g.fillStyle = 'rgba(255,255,255,' + (1 - beat) * 0.3 + ')'; g.fillRect(0, 0, w, h); }
    // text přes efekt: střídá se název písně, interpret, kdo rapuje
    const step = Math.floor(t / 2.5) % 4;
    let txt = null, small = null;
    if (tr.genre === 'hiphop') {
      const name = this.heroSinger || this.curRapper;
      txt = step === 0 ? tr.title.toUpperCase() : step === 1 ? null : step === 2 ? (name ? '🎤 ' + name.toUpperCase() : tr.led[0]) : tr.led[beat < 0.5 ? 0 : 1];
      if (step === 0) small = tr.artist;
    } else txt = step % 2 ? tr.led[beat < 0.5 ? 0 : 1] : (step === 0 ? 'DJ TIËSTO' : null);
    if (txt) {
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, h * 0.22, w, h * (small ? 0.62 : 0.56));
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${wideL ? 120 : 72}px "Russo One", sans-serif`;
      g.shadowColor = '#' + col(2).getHexString(); g.shadowBlur = 20; g.fillStyle = '#fff'; g.globalAlpha = 0.75 + (1 - beat) * 0.25;
      g.fillText(txt, w / 2, small ? h * 0.44 : h / 2, w - 30);
      if (small) { g.font = '700 26px "Chakra Petch", sans-serif'; g.shadowBlur = 8; g.fillText(small, w / 2, h * 0.7, w - 30); }
      g.globalAlpha = 1; g.shadowBlur = 0;
    }
    if (wideL) this.ledW[0].needsUpdate = true; else this.ledT.needsUpdate = true;
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
    // barmani: cyklus 6 s – míchání v šejkru nad hlavou, nalévání do sklenic, podání
    for (const B of this.bartenders) {
      animateHuman(B.m, 0, dt);
      const cyc = ((t + B.ph * 2) % 6) / 6, sh = cyc < 0.55, pour = cyc >= 0.55 && cyc < 0.85;
      const s = Math.sin(t * 22 + B.ph);
      if (sh) { if (B.bones.uaR) B.bones.uaR.rotation.x -= 2.5 + s * 0.35; if (B.bones.uaL) B.bones.uaL.rotation.x -= 2.4 + s * 0.35; }
      else if (pour) { if (B.bones.uaR) B.bones.uaR.rotation.x -= 1.35; if (B.bones.uaL) B.bones.uaL.rotation.x -= 0.6; }
      else { if (B.bones.uaR) B.bones.uaR.rotation.x -= 1.0 + (cyc - 0.85) * 3; if (B.bones.uaL) B.bones.uaL.rotation.x -= 0.4; }
      B.m.updateMatrixWorld(true);
      if (B.bones.fistR) { B.bones.fistR.getWorldPosition(B.shaker.position); B.shaker.position.y += 0.08; }
      B.shaker.rotation.set(sh ? s * 0.5 : pour ? 2.1 : 0.3, B.ang, 0, 'YXZ');
      const fill = pour ? (cyc - 0.55) / 0.3 : sh ? 0.02 : 1;
      for (const G2 of B.glasses) { G2.drink.scale.y = Math.max(0.01, 0.18 * fill); G2.drink.visible = fill > 0.03; }
    }
    // dav: skáčou do rytmu, ruce nahoře; u baru stojí a objednávají
    const C = this.crowd;
    C.updateCorpses(dt, (x, z) => this.game.city.ground(x, z), () => {});
    const hip = TRACKS[this.ti]?.genre === 'hiphop'; C.beatF = beatF;
    for (const p of this.people) {
      if (C.dead[p.i] || p.gone) continue;
      if (p.st) { this.av.stepPerson(p, dt, t, beatF, hip); continue; }
      if (p.web > 0) { p.web -= dt; C.set(p.i, C.x[p.i], p.y, C.z[p.i], p.h, 0, 'kneel', t); if (p.web <= 0) C.setShirt(p.i, p.col); continue; }
      if (p.bar) { C.set(p.i, p.x, p.y, p.z, p.h, 0, Math.sin(t * 1.3 + p.ph) > 0.7 ? 'smoke' : 'walk', t); continue; }
      const L = this.rw?.L || 0, st2 = L > 1.5;
      if (p.ax != null) { const need = L > p.rf - RW.f0 - 1.2; p.m = Math.max(0, Math.min(1, p.m + (need ? dt * 1.6 : -dt * 0.8))); }
      const x = p.ax != null ? p.x + (p.ax - p.x) * p.m : p.x, z = p.ax != null ? p.z + (p.az - p.z) * p.m : p.z;
      const fan = st2 && p.h2 != null, h = fan ? p.h2 : p.h;
      if (hip) { // hip hop: pokyvování v kolenou na každý úder, pomalé houpání do stran
        const lb = beatF + p.ph * 0.015, dip = Math.pow(Math.abs(Math.sin(lb * Math.PI)), 0.6) * 0.09 * (0.6 + p.hype);
        C.set(p.i, x, p.y - dip + 0.05, z, h + Math.sin(lb * Math.PI * 0.5 + p.ph) * 0.28, p.m > 0 && p.m < 1 ? 1.2 : 0, 'hiphop', t);
        continue;
      }
      const j = bounce(p.ph) * (0.6 + p.hype) * (fan ? 1.4 : 1), mode = (fan || p.hype > 0.35 || pulse > 0.6) ? 'riot' : 'walk';
      C.set(p.i, x, p.y + j, z, h + Math.sin(t * 2 + p.ph) * (fan ? 0.12 : 0.2), p.m > 0 && p.m < 1 ? 1.2 : 0, mode, t);
    }
    C.commit();
  }

  /* ---------------- přehrávač a rappeři ---------------- */
  makePlayer() {
    const d = document.createElement('div'); d.id = 'party-player';
    d.innerHTML = `<div class="pp-top"><button data-p="prev">⏮</button><button data-p="play">⏸</button><button data-p="next">⏭</button><button data-p="stage2" class="st2">STAGE 2</button><div class="pp-t"><b></b><span></span></div><input type="range" min="0" max="1" step="0.05" value="0.95" data-p="vol"></div>
<div class="pp-list">${TRACKS.map((t, i) => `<button data-i="${i}">${t.genre === 'hiphop' ? '🎤' : '🎧'} ${t.title}</button>`).join('')}</div>`;
    document.body.appendChild(d); this.player = d;
    d.addEventListener('pointerdown', (e) => e.stopPropagation());
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.i) this.setTrack(+b.dataset.i);
      const p = b.dataset.p;
      if (p === 'prev') this.setTrack((this.ti + TRACKS.length - 1) % TRACKS.length);
      if (p === 'next') this.setTrack((this.ti + 1) % TRACKS.length);
      if (p === 'stage2') { this.toggleStage2(); b.classList.toggle('on', this.stage2); b.textContent = this.stage2 ? 'STAGE 2 ✕' : 'STAGE 2'; }
      if (p === 'play' && this.music) { if (this.music.paused) this.music.play().catch(() => {}); else this.music.pause(); this.syncPlayer(); }
    });
    d.addEventListener('input', (e) => { if (e.target.dataset.p === 'vol') { this.vol = +e.target.value; if (this.music) this.music.volume = this.vol; } });
  }
  syncPlayer() {
    if (!this.player) return;
    const t = TRACKS[this.ti];
    this.player.querySelector('.pp-t b').textContent = t.title;
    this.player.querySelector('.pp-t span').textContent = t.artist;
    this.player.querySelector('[data-p=play]').textContent = this.music && !this.music.paused ? '⏸' : '▶';
    this.player.querySelectorAll('.pp-list button').forEach((b, i) => b.classList.toggle('on', i === this.ti));
  }
  setTrack(i) {
    this.ti = i; const t = TRACKS[i];
    this.music?.pause();
    try {
      this.music = new Audio(t.src); this.music.volume = this.vol ?? 0.95;
      this.music.addEventListener('ended', () => { if (this.active && this.music?.src.endsWith(t.src)) this.setTrack((this.ti + 1) % TRACKS.length); });
      this.music.addEventListener('play', () => this.syncPlayer()); this.music.addEventListener('pause', () => this.syncPlayer());
      this.music.play().catch(() => {});
    } catch { this.music = null; }
    this.bpm = t.bpm;
    this.buildPerformers(t);
    this.drawBanner(t);
    this.syncPlayer();
    this.game.toast?.(t.genre === 'hiphop' ? `🎤 ${t.title} – na pódium jdou rappeři` : `🎧 ${t.title} – DJ Tiësto`);
  }
  /** Nápis nad pódiem: DJ, nebo název písně a interpret. */
  drawBanner(t) {
    const c = this.bannerC; if (!c) return;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 160); g.textAlign = 'center'; g.textBaseline = 'middle';
    if (t.genre !== 'hiphop') { g.font = '900 110px "Russo One", sans-serif'; g.shadowColor = '#00e5ff'; g.shadowBlur = 30; g.fillStyle = '#fff'; g.fillText('DJ TIËSTO', 512, 84); }
    else {
      g.shadowColor = '#ff00d4'; g.shadowBlur = 26; g.fillStyle = '#fff'; g.font = '900 80px "Russo One", sans-serif';
      g.fillText(t.title.toUpperCase(), 512, 58, 990);
      g.shadowColor = '#39ff14'; g.shadowBlur = 14; g.fillStyle = '#b8ff9c'; g.font = '700 38px "Chakra Petch", sans-serif';
      g.fillText(t.artist, 512, 126, 990);
    }
    g.shadowBlur = 0; this.bannerT.needsUpdate = true;
  }
  /** Menu: AVENGERS / STARGATE (party se případně sama spustí). */
  avengers() { if (!this.active) this.start(); this.av.summon(); }
  stargate() { if (!this.active) this.start(); this.av.toggleGate(); }
  syncStage2() { const b = this.player?.querySelector('[data-p=stage2]'); if (b) { b.classList.toggle('on', !!this.stage2); b.textContent = this.stage2 ? 'STAGE 2 ✕' : 'STAGE 2'; } }
  toggleStage2() {
    this.stage2 = !this.stage2; this.rw.goal = this.stage2 ? RW.f1 - RW.f0 : 0;
    this.game.audio?.noise?.(1.2, 0.25, 120);
    this.game.toast?.(this.stage2 ? '🚀 STAGE 2 – molo vyjíždí do davu' : 'STAGE 2 zajíždí zpět');
  }
  updateRunway(dt, col) {
    const R = this.rw; if (!R) return;
    const goal = this.stage2 ? R.goal : this.rwBusy ? R.L : 0; // nezajede, dokud na něm stojí rappeři
    const d = goal - R.L; if (Math.abs(d) > 0.01) { R.L += Math.sign(d) * Math.min(Math.abs(d), dt * 5); if (Math.random() < dt * 3) this.game.audio?.noise?.(0.15, 0.08, 90); }
    R.g.visible = R.L > 0.02; R.g.scale.z = Math.max(0.001, R.L + 0.2);
    this.rwEnd.scale.z = 1 / R.g.scale.z; this.rwEnd.position.z = 1;
    for (const [k, m] of this.rwStrips.entries()) m.material.color.copy(col(k));
  }
  clearPerformers() {
    const sc = this.game.scene;
    for (const R of this.rappers || []) { sc.remove(R.m); this.group.remove(R.mic); this.group.remove(R.spot); }
    this.rappers = [];
    for (const p of this.poles || []) p.down = true; // tyče zajedou zpět do podlahy
  }
  buildPerformers(t) {
    this.clearPerformers();
    if (t.genre !== 'hiphop') return;
    const sc = this.game.scene, n = t.rappers.length, P = this.P;
    const spots = n === 6 ? [-6.6, -4.4, -2.4, 2.4, 4.4, 6.6] : n === 2 ? [-4.2, 4.2] : t.rappers.map((_, k) => -6 + (12 * k) / Math.max(1, n - 1));
    const coneGeo = new THREE.ConeGeometry(1.1, 1, 20, 1, true); coneGeo.translate(0, -0.5, 0);
    t.rappers.forEach((r, k) => {
      const m = makeHuman({ name: r.model, female: r.female, uniform: { shirt: r.shirt, pants: r.pants, hat: r.hat }, scale: 1.35, tint: false });
      const side = spots[k] < 0 ? -1 : 1;
      const [sx, sy, sz] = P(-3.2, side * 7.5, 1.8), [tx, , tz] = P(t.poles ? 2.2 : 2.9, spots[k], 1.8);
      m.position.set(sx, sy, sz); sc.add(m);
      const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.34, 10), new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.6, roughness: 0.3 }));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 1, roughness: 0.25, emissive: '#555a60', emissiveIntensity: 0.6 })); head.position.y = 0.2; mic.add(head);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 10), new THREE.MeshBasicMaterial({ color: r.shirt === '#111111' || r.shirt === '#1d1d22' ? '#39ff14' : r.shirt })); band.position.y = 0.1; mic.add(band);
      this.group.add(mic);
      const spot = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#fff6d0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      spot.position.set(tx, sy + 9, tz); spot.scale.set(1, 9, 1); spot.visible = false; this.group.add(spot);
      this.rappers.push({ m, mic, spot, k, sx, sz, tx, tz, y: sy, t: -k * 0.35, ph: Math.random() * 6, bones: this.bonesOf(m), cx: tx, cz: tz, pole: null });
    });
    if (t.poles) {
      // dvě tyče vyjedou z podlahy pódia vedle rapperek
      this.poles = (this.poles || []).filter((p) => !p.down);
      if (!this.poles.length) for (const R of this.rappers) {
        const px = R.tx + (this.P(0, 1, 0)[0] - this.P(0, 0, 0)[0]) * 0.9 * Math.sign(R.k ? 1 : -1), pz = R.tz + (this.P(0, 1, 0)[2] - this.P(0, 0, 0)[2]) * 0.9 * Math.sign(R.k ? 1 : -1);
        const pg = new THREE.Group();
        pg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5.2, 12), new THREE.MeshStandardMaterial({ color: '#f2f2f2', metalness: 1, roughness: 0.08 }))).position.y = 2.6;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: '#ff00d4' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; pg.add(ring);
        pg.position.set(px, R.y - 5.3, pz); this.group.add(pg);
        this.poles.push({ g: pg, x: px, z: pz, y: R.y, h: -5.3, ring, down: false });
      }
      this.rappers.forEach((R, k) => { R.pole = this.poles[k] || null; });
    }
  }
  updatePerformers(dt, mt, beatF) {
    const t = this.game.time, tr = TRACKS[this.ti];
    // tyče: vyjíždění / zajíždění
    for (let i = (this.poles || []).length - 1; i >= 0; i--) {
      const p = this.poles[i];
      p.h += (p.down ? -1 : 1) * dt * 2.2; p.h = Math.min(0, p.h);
      p.g.position.y = p.y + p.h; p.ring.material.color.setHSL((t * 0.3 + i * 0.5) % 1, 1, 0.55);
      if (p.down && p.h < -5.3) { this.group.remove(p.g); this.poles.splice(i, 1); }
    }
    if (!this.rappers?.length) { this.curRapper = null; this.rwBusy = false; return; }
    // kdo právě rapuje: -1 = všichni (refrén), null = nikdo, 'pole' = tanec u tyče
    let seg = tr.parts[0];
    for (const s of tr.parts) if (mt >= s[0]) seg = s;
    const who = seg[1], poleDance = seg[2] === 'pole' || (tr.poles && who === null);
    const bounce = Math.max(0, Math.sin(beatF * Math.PI * 2)) * 0.12;
    let busy = 0;
    for (const R of this.rappers) {
      if (R.gone) continue;
      R.t += dt;
      if ((R.m.position.x - S.x) * Math.sin(FACE) + (R.m.position.z - S.z) * Math.cos(FACE) > RW.f0 - 0.2) busy++;
      const active = who === -1 || who === R.k;
      let x, z, speed = 0, face = FACE;
      if (R.t < 0) { x = R.sx; z = R.sz; }
      else if (R.t < 3) { const a = R.t / 3; x = R.sx + (R.tx - R.sx) * a; z = R.sz + (R.tz - R.sz) * a; speed = 2.5; face = Math.atan2(R.tx - R.sx, R.tz - R.sz); }
      else {
        // domovské místo: hlavní pódium, nebo molo STAGE 2
        const n = this.rappers.length, L = this.rw?.L || 0;
        const rf = RW.f0 + 1.4 + (R.k + 0.5) * ((RW.f1 - RW.f0 - 2) / n), rr = (R.k % 2 ? 1 : -1) * (n > 2 ? 1.2 : 0.9);
        const onRw = this.stage2 && L > rf - RW.f0 + 0.5;
        let hx = R.tx, hz = R.tz;
        if (onRw) { hx = S.x + Math.sin(FACE) * rf + Math.cos(FACE) * rr; hz = S.z + Math.cos(FACE) * rf - Math.sin(FACE) * rr; }
        if (R.leave) { hx = R.leave[0]; hz = R.leave[1]; }
        // cesta: z pódia na molo (a zpět) jen přes jeho začátek, ne vzduchem
        const lf = (q, w) => (q - S.x) * Math.sin(FACE) + (w - S.z) * Math.cos(FACE), lr = (q, w) => (q - S.x) * Math.cos(FACE) - (w - S.z) * Math.sin(FACE);
        const cf = lf(R.cx, R.cz), cr = lr(R.cx, R.cz), hf = lf(hx, hz);
        let gx = hx, gz = hz;
        if ((hf > RW.f0 && cf < RW.f0 + 0.3 && Math.abs(cr) > 1.6) || (hf < RW.f0 && cf > RW.f0 - 0.2 && Math.abs(lr(hx, hz)) > 1.6 && cf > 3.4)) {
          const wf = 3.3, wr = Math.sign(cr || 1) * 1.0; gx = S.x + Math.sin(FACE) * wf + Math.cos(FACE) * wr; gz = S.z + Math.cos(FACE) * wf - Math.sin(FACE) * wr;
          if (Math.hypot(gx - R.cx, gz - R.cz) < 0.3) { gx = hx; gz = hz; }
        }
        const dd = Math.hypot(gx - R.cx, gz - R.cz);
        if (dd > 0.08) { const st = Math.min(dd, dt * 3.6); R.cx += (gx - R.cx) / dd * st; R.cz += (gz - R.cz) / dd * st; speed = 2.6; face = Math.atan2(gx - R.cx, gz - R.cz); x = R.cx; z = R.cz; R.walking = true; }
        else {
          R.walking = false; R.cx = hx; R.cz = hz;
          if (R.leave) { R.gone = true; R.m.visible = false; R.mic.visible = false; R.spot.visible = false; this.av.flash(hx, R.y + 1.5, hz, 5, '#9fd8ff'); this.game.audio?.blip?.(500, 0.3, 'sine', 0.08, 1600); continue; }
          const inRw = lf(R.cx, R.cz) > RW.f0 + 0.3;
          if (poleDance && R.pole && R.pole.h > -0.3 && !inRw) { const a = t * 1.1 + R.ph; x = R.pole.x + Math.cos(a) * 0.42; z = R.pole.z + Math.sin(a) * 0.42; face = Math.atan2(R.pole.x - x, R.pole.z - z) + Math.PI / 2 + Math.sin(t * 2.4 + R.ph) * 0.35; }
          else if (inRw) { const side = lr(R.cx, R.cz) < 0 ? -1 : 1; x = R.cx + Math.sin(FACE) * Math.sin(t * 0.9 + R.ph) * (active ? 0.6 : 0.2); z = R.cz + Math.cos(FACE) * Math.sin(t * 0.9 + R.ph) * (active ? 0.6 : 0.2); face = FACE + side * (Math.PI / 2) * (0.5 + 0.5 * Math.sin(t * 0.7 + R.ph)) ; }
          else { const sway = active ? Math.sin(t * 1.3 + R.ph) * 0.5 : 0; x = R.cx + Math.cos(FACE) * sway; z = R.cz - Math.sin(FACE) * sway; face = FACE + Math.sin(t * 0.8 + R.ph) * (active ? 0.45 : 0.2); }
        }
      }
      R.m.position.set(x, R.y + (R.t >= 3 && !R.walking ? bounce * (active ? 1.6 : 0.8) : 0), z); R.m.rotation.y = face;
      animateHuman(R.m, speed, dt);
      const B = R.bones;
      if (R.t >= 3) {
        if (R.walking) { /* jde */ } else if (poleDance && R.pole) { // sexy tanec u tyče (na molu bez tyče): ruka na tyči, vlnění boky
          if (B.uaL) B.uaL.rotation.x -= 2.7; if (B.uaR) B.uaR.rotation.x -= 2.1 + Math.sin(t * 3 + R.ph) * 0.5;
          if (B.hips) B.hips.rotation.y += Math.sin(t * 4.2 + R.ph) * 0.45; if (B.torso) B.torso.rotation.z += Math.sin(t * 4.2 + R.ph + 1) * 0.3;
        } else if (active) { // rapuje: mikrofon u pusy, druhá ruka gestikuluje do rytmu
          if (B.uaR) B.uaR.rotation.x -= 2.35 + Math.sin(t * 2 + R.ph) * 0.08;
          if (B.uaL) B.uaL.rotation.x -= 1.2 + Math.abs(Math.sin(beatF * Math.PI)) * 1.1;
          if (B.torso) B.torso.rotation.x += 0.12 + Math.sin(beatF * Math.PI * 2) * 0.08;
        } else { // čeká: pohupuje se, občas ruka nahoru
          if (B.uaR) B.uaR.rotation.x -= 0.9; if (B.uaL) B.uaL.rotation.x -= Math.sin(t * 0.6 + R.ph) > 0.5 ? 2.6 : 0.3;
        }
      }
      R.m.updateMatrixWorld(true);
      if (B.fistR) { B.fistR.getWorldPosition(R.mic.position); R.mic.position.y += 0.12; }
      R.mic.rotation.set(-0.5, face, 0, 'YXZ');
      R.spot.visible = active && R.t >= 3 && (!poleDance || this.stage2); R.spot.position.set(x, R.y + 9, z);
      R.spot.material.opacity = 0.14 + bounce * 0.4;
    }
    this.rwBusy = busy > 0;
    // ukazatel, kdo rapuje
    this.curRapper = who === -1 ? 'všichni' : who == null ? null : tr.rappers[who]?.name;
    const name = who === -1 ? 'všichni' : who === null ? (poleDance ? 'tanec u tyče' : '—') : tr.rappers[who]?.name;
    if (this.player) this.player.querySelector('.pp-t span').textContent = `${tr.artist} · 🎤 ${name}`;
  }

  /** Cíle pro zbraně: lidé na party. */
  targets() {
    if (!this.active) return [];
    const C = this.crowd, out = [];
    for (const p of this.people) if (!C.dead[p.i] && !p.gone) out.push({ key: `party:${p.i}`, crowd: C, ci: p.i, mesh: { position: { x: C.x[p.i], y: C.y[p.i], z: C.z[p.i] } }, kill: (dir, boom) => C.kill(p.i, dir, boom?.vel || null) });
    return out;
  }

  stop() {
    if (!this.active) return;
    const G = this.game;
    this.active = false;
    this.music?.pause(); this.music = null;
    this.av.stop();
    this.clearPerformers(); this.poles = []; this.player?.remove(); this.player = null;
    G.scene.remove(this.group);
    for (const m of [this.dj, ...this.gogos.map((d) => d.m), ...this.bartenders.map((b) => b.m)]) G.scene.remove(m);
    this.crowd?.hideAll(true); if (this.crowd) G.scene.remove(this.crowd.group);
    for (const pr of this.hidden || []) { if (!pr.broken) pr.obj.visible = true; if (pr.obst && pr._r != null) pr.obst.r = pr._r; }
    this.panel?.remove(); document.getElementById('party-css')?.remove();
    G.toast?.('Party skončila');
  }
}
