/*
 * MMA zápas ve věznici (zadní dvůr u psince). Tlačítkem se postaví oktagon (osmiúhelník s pletivem), kolem 500 fandících
 * vězňů, 50 bachařů a 10 psovodů se psy, reflektory a lasery, červený koberec se schůdky. Nejdřív nastoupí bachaři,
 * pak vězni, hlasatelka je uvede, rozhodčí odstartuje 3 kola (pěsti a kopy). Varianty 1 na 1 a 3 na 3.
 * Hrát za vězně: WASD pohyb, myš / F rána, G / Q kop, Shift kryt, O = vytáhne nůž (podvod).
 */
import * as THREE from 'three';
import { makeHuman, animateHuman } from './entities.js?v=20261127195850';
import { Crowd } from './crowd.js?v=20261127195850';
import { PrisonFX } from './prisonfx.js?v=20261127195850';

const C = { x: -222, z: 1152 }; // střed oktagonu
const R = 5.4; // poloměr oktagonu (k vrcholu)
const DECK = 0.9; // výška podlahy
const ROUND_S = 60, REST_S = 8;
const CARPET_A = Math.PI * 0.82; // směr nástupu bachařů (vězni přicházejí z opačné strany)
const ENTRY_A = { blue: CARPET_A, red: CARPET_A + Math.PI };
const VOICE = { // hlášky hlasatelky (nahrané, hrají i na telefonu)
  intro: 'mma_intro', intro3: 'mma_intro3', red: 'mma_red', red_you: 'mma_red_you', red3: 'mma_red3', rules: 'mma_rules',
  r1: 'mma_r1', r2: 'mma_r2', r3: 'mma_r3', e1: 'mma_e1', e2: 'mma_e2',
  knife: 'mma_knife', ko_guard: 'mma_ko_guard', ko_con: 'mma_ko_con', dec_guard: 'mma_dec_guard', dec_con: 'mma_dec_con',
};

export class MMA {
  constructor(game) { this.game = game; this.active = false; }

  /* ---------------- aréna ---------------- */
  build() {
    const G = this.game, city = G.city, scene = G.scene;
    const gy = city.ground(C.x, C.z);
    this.gy = gy;
    const g = new THREE.Group(); this.group = g;
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    // podlaha oktagonu (plachta s logem a červeným osmiúhelníkem)
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
    const cg = cv.getContext('2d');
    cg.fillStyle = '#ebe9e3'; cg.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 5000; i++) { cg.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`; cg.fillRect(Math.random() * 1024, Math.random() * 1024, 3, 3); }
    const oct = (r) => { cg.beginPath(); for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; cg.lineTo(512 + Math.cos(a) * r, 512 + Math.sin(a) * r); } };
    cg.strokeStyle = '#b11d1d'; cg.lineWidth = 12; oct(480); cg.stroke();
    // znak uprostřed: žlutý osmiúhelník s bleskem a nápis OKTAGON
    const oct2 = (cx, cy, r) => { cg.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k / 8) * Math.PI * 2; cg.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } cg.closePath(); };
    oct2(512, 430, 150); cg.fillStyle = '#ffd400'; cg.fill();
    oct2(512, 430, 108); cg.fillStyle = '#ffffff'; cg.fill();
    oct2(512, 430, 92); cg.fillStyle = '#1b1b1b'; cg.fill();
    cg.fillStyle = '#ffffff'; cg.beginPath(); cg.moveTo(452, 470); cg.lineTo(580, 392); cg.lineTo(520, 432); cg.lineTo(572, 432); cg.lineTo(444, 512); cg.lineTo(500, 462); cg.closePath(); cg.fill();
    cg.fillStyle = '#ffd400'; cg.font = '900 112px "Russo One", "Arial Black", sans-serif'; cg.textAlign = 'center'; cg.fillText('OKTAGON', 512, 680);
    cg.fillStyle = '#1b1b1b'; cg.font = '900 54px "Russo One", "Arial Black", sans-serif'; cg.fillText('VINAŘICE', 512, 745);
    cg.fillStyle = 'rgba(30,60,140,.85)'; cg.beginPath(); cg.arc(512 + Math.cos(Math.PI / 8) * 380, 512 + Math.sin(Math.PI / 8) * 380, 36, 0, 7); cg.fill();
    const ft = new THREE.CanvasTexture(cv); ft.colorSpace = THREE.SRGBColorSpace;
    // osmiboká plošina (CylinderGeometry s 8 stranami = oktagon)
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, DECK, 8, 1), [mat('#1a1a1a'), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.9 }), mat('#1a1a1a')]);
    deck.rotation.y = 0; deck.position.set(C.x, gy + DECK / 2, C.z); deck.receiveShadow = true; deck.castShadow = true;
    g.add(deck);
    this.deckTop = gy + DECK;
    // pletivo, polstrované sloupky, horní hrana; vstup na straně koberce
    const mesh = document.createElement('canvas'); mesh.width = mesh.height = 64;
    const mg = mesh.getContext('2d'); mg.strokeStyle = '#111'; mg.lineWidth = 3;
    for (let i = -64; i < 128; i += 12) { mg.beginPath(); mg.moveTo(i, 0); mg.lineTo(i + 64, 64); mg.stroke(); mg.beginPath(); mg.moveTo(i + 64, 0); mg.lineTo(i, 64); mg.stroke(); }
    const mt = new THREE.CanvasTexture(mesh); mt.wrapS = mt.wrapT = THREE.RepeatWrapping;
    const pad = mat('#0e0e0e', { roughness: 0.45 }), padRed = mat('#a01818', { roughness: 0.45 }), padBlue = mat('#1a3fa0', { roughness: 0.45 });
    const H = 1.8, top = this.deckTop;
    // vrcholy osmiúhelníku (stejně jako CylinderGeometry: úhel 0 míří na +z)
    this.verts = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; this.verts.push([C.x + Math.sin(a) * R, C.z + Math.cos(a) * R]); }
    const sideFor = (ang) => { let door = 0, bd = 9; for (let k = 0; k < 8; k++) { const [ax, az] = this.verts[k], [bx, bz] = this.verts[(k + 1) % 8], mx = (ax + bx) / 2 - C.x, mz = (az + bz) / 2 - C.z; const a2 = Math.atan2(mz, mx), d = Math.abs(Math.atan2(Math.sin(a2 - ang), Math.cos(a2 - ang))); if (d < bd) { bd = d; door = k; } } return door; };
    const doorSide = { blue: sideFor(ENTRY_A.blue), red: sideFor(ENTRY_A.red) };
    const isDoorSide = (k) => k === doorSide.blue || k === doorSide.red;
    for (let k = 0; k < 8; k++) {
      const [ax, az] = this.verts[k], [bx, bz] = this.verts[(k + 1) % 8], L = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      const isDoor = isDoorSide(k), w = isDoor ? L * 0.45 : L;
      const mx = isDoor ? ax + (bx - ax) * 0.775 : (ax + bx) / 2, mz = isDoor ? az + (bz - az) * 0.775 : (az + bz) / 2;
      const pm = new THREE.MeshStandardMaterial({ map: mt.clone(), alphaTest: 0.3, transparent: true, side: THREE.DoubleSide, roughness: 0.6 });
      pm.map.needsUpdate = true; pm.map.repeat.set(w / 0.35, H / 0.35);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, H), pm); panel.position.set(mx, top + H / 2, mz); panel.rotation.y = rot; g.add(panel);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, 0.22), pad); rail.position.set((ax + bx) / 2, top + H + 0.09, (az + bz) / 2); rail.rotation.y = rot; g.add(rail);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H + 0.4, 10), k === 1 ? padBlue : k === 5 ? padRed : pad);
      post.position.set(ax, top + (H + 0.4) / 2, az); g.add(post);
    }
    // dva nástupy: bachaři (modrá brána) a vězni (červená brána) z opačných stran
    this.cageDoors = []; this.entries = {};
    const stepM = mat('#262626'), brass = mat('#c9a43a', { metalness: 0.8, roughness: 0.3 }), archM = mat('#111');
    for (const team of ['blue', 'red']) {
      const door = doorSide[team];
      const [dax, daz] = this.verts[door], [dbx, dbz] = this.verts[(door + 1) % 8];
      { // dveře klece (otevřené ven, po odchodu moderátora se zavřou)
        const L = Math.hypot(dbx - dax, dbz - daz), w = L * 0.55, rot = Math.atan2(dbx - dax, dbz - daz) - Math.PI / 2;
        const pm = new THREE.MeshStandardMaterial({ map: mt.clone(), alphaTest: 0.3, transparent: true, side: THREE.DoubleSide, roughness: 0.6 });
        pm.map.needsUpdate = true; pm.map.repeat.set(w / 0.35, H / 0.35);
        const pivot = new THREE.Group(); pivot.position.set(dax, top, daz); pivot.rotation.y = rot;
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(w, H), pm); leaf.position.set(w / 2, H / 2, 0);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.08), pad); frame.position.set(w / 2, H, 0);
        const frame2 = frame.clone(); frame2.position.y = 0.05;
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.12), mat('#c9a43a', { metalness: 0.8 })); handle.position.set(w - 0.12, H * 0.5, 0.05);
        pivot.add(leaf, frame, frame2, handle); g.add(pivot);
        pivot.rotateY(1.45);
        this.cageDoors.push({ pivot, cur: 1.45 });
      }
      const dmx = dax + (dbx - dax) * 0.27, dmz = daz + (dbz - daz) * 0.27, ux0 = dmx - C.x, uz0 = dmz - C.z, ul = Math.hypot(ux0, uz0);
      const ux = ux0 / ul, uz = uz0 / ul;
      const E = { ux, uz };
      E.doorPt = [C.x + ux * (ul - 0.3), C.z + uz * (ul - 0.3)];
      for (let s2 = 0; s2 < 4; s2++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, DECK * (s2 + 1) / 4, 0.42), stepM);
        const d = ul + 0.25 + (3 - s2) * 0.42;
        st.position.set(C.x + ux * d, gy + (DECK * (s2 + 1) / 4) / 2, C.z + uz * d); st.rotation.y = Math.atan2(ux, uz); g.add(st);
      }
      E.stairFoot = [C.x + ux * (ul + 2.1), C.z + uz * (ul + 2.1)];
      E.stairTop = [C.x + ux * (ul + 0.2), C.z + uz * (ul + 0.2)];
      const carpetLen = 12;
      E.carpetStart = [E.stairFoot[0] + ux * carpetLen, E.stairFoot[1] + uz * carpetLen];
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, carpetLen), mat('#9c1010', { roughness: 0.95 }));
      carpet.rotation.order = 'YXZ'; carpet.rotation.y = Math.atan2(ux, uz); carpet.rotation.x = -Math.PI / 2;
      carpet.position.set((E.stairFoot[0] + E.carpetStart[0]) / 2, gy + 0.03, (E.stairFoot[1] + E.carpetStart[1]) / 2);
      g.add(carpet);
      // pochodně podél koberce: kovový sloup s miskou a hořícím ohněm
      this.torches ||= [];
      this.fireT ||= (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const gr = x.createRadialGradient(64, 80, 4, 64, 70, 60); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,60,.95)'); gr.addColorStop(0.55, 'rgba(255,90,10,.6)'); gr.addColorStop(1, 'rgba(120,20,0,0)'); x.fillStyle = gr; x.beginPath(); x.moveTo(64, 4); x.quadraticCurveTo(118, 70, 96, 112); x.quadraticCurveTo(64, 128, 32, 112); x.quadraticCurveTo(10, 70, 64, 4); x.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
      for (const sd of [-1, 1]) for (let k = 0; k <= 4; k++) {
        const d = (k / 4) * carpetLen, px = E.stairFoot[0] + ux * d - uz * sd * 1.25, pz = E.stairFoot[1] + uz * d + ux * sd * 1.25;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.5, 8), mat('#2a2a2a', { metalness: 0.7 })); pole.position.set(px, gy + 0.75, pz); g.add(pole);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.09, 0.18, 12), brass); bowl.position.set(px, gy + 1.55, pz); g.add(bowl);
        const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        fire.position.set(px, gy + 1.95, pz); fire.scale.set(0.6, 0.85, 1); g.add(fire);
        this.torches.push({ fire, y: gy + 1.95, ph: Math.random() * 6 });
      }
      // pár světel od ohňů (ne u každé pochodně – šetří výkon)
      for (const d of [0.2, 0.8]) { const l = new THREE.PointLight('#ff8a30', 6, 9, 1.6); l.position.set(E.stairFoot[0] + ux * carpetLen * d, gy + 2.2, E.stairFoot[1] + uz * carpetLen * d); g.add(l); this.torches.push({ light: l, ph: Math.random() * 6 }); }
      const arch = new THREE.Group();
      for (const sd of [-1, 1]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.3, 0.3), archM); col.position.set(sd * 1.5, 1.65, 0); arch.add(col); }
      const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128;
      const sg = sc.getContext('2d'); sg.fillStyle = team === 'blue' ? '#0b1a44' : '#3a0707'; sg.fillRect(0, 0, 512, 128); sg.fillStyle = team === 'blue' ? '#7fb2ff' : '#ff7a6a'; sg.font = 'bold 60px sans-serif'; sg.textAlign = 'center'; sg.fillText(team === 'blue' ? 'BACHAŘI' : 'VĚZNI', 256, 86);
      const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace;
      const signM = new THREE.MeshStandardMaterial({ map: stx, emissive: '#ffffff', emissiveMap: stx, emissiveIntensity: 0.7 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.85, 0.2), [archM, archM, archM, archM, signM, signM]); sign.position.y = 3.4; arch.add(sign);
      arch.position.set(E.carpetStart[0], gy, E.carpetStart[1]); arch.rotation.y = Math.atan2(ux, uz);
      g.add(arch);
      this.entries[team] = E;
    }
    // zpětná kompatibilita (moderátor, konec zápasu) = modrá brána
    Object.assign(this, { doorPt: this.entries.blue.doorPt, stairTop: this.entries.blue.stairTop, stairFoot: this.entries.blue.stairFoot, carpetStart: this.entries.blue.carpetStart });
    const ux = this.entries.blue.ux, uz = this.entries.blue.uz;
    // osvětlení jako na turnaji: stožáry s reflektory, kužely světla, barevné lasery, hlavní světlo nad klecí
    this.beams = []; this.lasers = [];
    const coneM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3, px = C.x + Math.cos(a) * 17, pz = C.z + Math.sin(a) * 17, Hh = 10;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, Hh, 8), mat('#2c2c2c', { metalness: 0.6 })); pole.position.set(px, gy + Hh / 2, pz); g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d6', emissiveIntensity: 2.5 }));
      head.position.set(px, gy + Hh, pz); head.lookAt(C.x, this.deckTop, C.z); g.add(head);
      // kužel reflektoru (natočený do klece, pomalu krouží)
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1, 24, 1, true), coneM(k % 2 ? '#ffe9b0' : '#cfe3ff'));
      cone.geometry.translate(0, -0.5, 0);
      cone.position.set(px, gy + Hh, pz); g.add(cone);
      this.beams.push({ cone, px, py: gy + Hh, pz, ph: k * 1.1 });
      // laser
      const las = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshBasicMaterial({ color: ['#ff2a2a', '#22ff55', '#2a8cff'][k % 3], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      las.geometry.translate(0, 0.5, 0);
      las.position.set(px, gy + Hh - 0.6, pz); g.add(las);
      this.lasers.push({ las, px, py: gy + Hh - 0.6, pz, ph: k * 0.9 });
    }
    const key = new THREE.PointLight('#fff4dc', 90, 34, 1.4); key.position.set(C.x, gy + 9, C.z); g.add(key);
    // světla ze stožárů na diváky a okolí (turnaj se koná večer, aréna svítí do dálky)
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; const l = new THREE.PointLight('#fff1d6', 45, 30, 1.3); l.position.set(C.x + Math.cos(a) * 15, gy + 8.5, C.z + Math.sin(a) * 15); g.add(l); }
    this.colorLights = ['#ff3355', '#3388ff'].map((c, i) => { const l = new THREE.PointLight(c, 18, 26, 1.6); l.position.set(C.x + (i ? 6 : -6), gy + 6, C.z); g.add(l); return l; });
    scene.add(g);
    // dočasně schovat drobnosti v prostoru arény
    this.hidden = [];
    for (const pr of city.props || []) if (Math.hypot(pr.x - C.x, pr.z - C.z) < 22 && pr.obj.visible) { pr.obj.visible = false; this.hidden.push(pr); if (pr.obst) { pr._r = pr.obst.r; pr.obst.r = 0; } }
    // fanoušci: 500 vězňů kolem klece (mimo uličku)
    this.crowd = new Crowd(scene, { capacity: 800, shirt: '#3f4f63', pants: '#34404f' });
    this.fans = [];
    // ulička pro zápasníky: pás 2×1,9 m kolem koberce (od dveří klece až za bránu) zůstane volný
    const inAisle = (x, z) => Object.values(this.entries).some((E) => {
      const ax = E.doorPt[0], az = E.doorPt[1], bx = E.carpetStart[0] + E.ux * 3, bz = E.carpetStart[1] + E.uz * 3;
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez, t = ((x - ax) * ex + (z - az) * ez) / l2;
      if (t < 0 || t > 1) return false;
      return Math.hypot(ax + ex * t - x, az + ez * t - z) < 1.9;
    });
    const aisle = () => false;
    let n = 0;
    for (let ring = 0; n < 800 && ring < 16; ring++) {
      const rr = 8.4 + ring * 0.75, cnt = Math.floor((2 * Math.PI * rr) / 0.7);
      for (let k = 0; k < cnt && n < 800; k++) {
        const a = (k / cnt) * Math.PI * 2 + (ring % 2) * 0.2;
        if (aisle(a, rr)) continue;
        const x = C.x + Math.cos(a) * rr + (Math.random() - 0.5) * 0.3, z = C.z + Math.sin(a) * rr + (Math.random() - 0.5) * 0.3;
        if (inAisle(x, z) || city.collide(x, z, 0.35).hit || city.buildingAt(x, z)) continue; // ne do uličky, zdi, budovy
        this.fans.push({ i: n++, x, z, y: city.ground(x, z), h: Math.atan2(C.x - x, C.z - z), ph: Math.random() * 6, hype: Math.random() });
      }
    }
    // 50 bachařů v kruhu mezi klecí a diváky + 10 psovodů se psy u uličky a na okraji
    this.guards = new Crowd(scene, { capacity: 60, shirt: '#1d2633', pants: '#161c26', helmet: '#1d2633', baton: true });
    this.guardPos = [];
    for (let k = 0; k < 50; k++) {
      const a = (k / 50) * Math.PI * 2; if (aisle(a, 7.3)) continue;
      const x = C.x + Math.cos(a) * 7.3, z = C.z + Math.sin(a) * 7.3;
      if (inAisle(x, z)) continue;
      this.guardPos.push({ x, z, y: city.ground(x, z), h: Math.atan2(x - C.x, z - C.z) + Math.PI * (k % 2) }); // střídavě čelem k divákům / ke kleci
    }
    this.dogs = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.15, rr = k < 2 ? 0 : 20.5;
      let x, z;
      if (k < 2) { const sd = k ? 1 : -1; x = this.stairFoot[0] + ux * 6 - uz * sd * 1.8; z = this.stairFoot[1] + uz * 6 + ux * sd * 1.8; } // u uličky
      else { x = C.x + Math.cos(a) * rr; z = C.z + Math.sin(a) * rr; }
      const h = Math.atan2(C.x - x, C.z - z);
      this.guardPos.push({ x, z, y: city.ground(x, z), h, handler: true });
      const dog = G.prisonFx?.makeDog?.();
      if (dog) { const dx = x + Math.cos(h) * 0.8, dz = z - Math.sin(h) * 0.8; dog.position.set(dx, city.ground(dx, dz), dz); dog.rotation.y = h; this.dogs.push({ m: dog, ph: Math.random() * 6 }); }
    }
    this.pools = [];
  }

  /* ---------------- postavy ---------------- */
  fighter(opts, name, team) {
    const m = makeHuman({ ...opts, scale: 1.05, tint: false });
    this.game.scene.add(m);
    // GLTFLoader odstraní z názvů kostí tečky (Fist.L → FistL)
    const bone = (n) => { const n2 = n.replace(/\./g, ''); let b = null; m.traverse((o) => { if (!b && (o.name === n || o.name === n2)) b = o; }); return b; };
    // MMA rukavice na obou pěstech (bachaři modré, vězni červené, rozhodčí bez)
    if (team) {
      m.updateMatrixWorld(true);
      const col = team === 'blue' ? '#1f4fc4' : '#c41f1f';
      for (const n of ['Fist.L', 'Fist.R']) {
        const b = bone(n); if (!b) continue;
        const ws = new THREE.Vector3(); b.getWorldScale(ws); const k = 1 / (ws.x || 1);
        const glove = new THREE.Group();
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 }));
        pad.scale.set(1, 0.9, 1.15);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.06, 10), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }));
        cuff.position.y = -0.06;
        glove.add(pad, cuff); glove.scale.setScalar(k);
        b.add(glove);
      }
    }
    return {
      m, name, team, x: 0, z: 0, y: 0, h: 0, hp: 100, act: 'idle', actT: 0, cool: 1, hitDone: false, landed: 0, kickN: 0,
      bones: { ulR: bone('UpperLeg.R'), llR: bone('LowerLeg.R'), uaL: bone('UpperArm.L'), uaR: bone('UpperArm.R'), torso: bone('Torso'), fistR: bone('Fist.R') },
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, block: false, path: null, pi: 0, delay: 0,
    };
  }

  /** mode: 'watch' | 'play' (1 na 1, hráč = vězeň) | 'team' (3 na 3) | 'teamPlay' (3 na 3, hráč = vězeň) */
  start(mode = 'watch') {
    if (this.active) {
      const wantTeam = mode === 'team' || mode === 'teamPlay', play = mode === 'play' || mode === 'teamPlay';
      if (play && wantTeam === this.team && !this.playAs) { this.takeOver(); return; }
      this.finish(true); // jiná varianta: hned nový nástup a zápas
    }
    const G = this.game;
    this.build();
    this.active = true;
    this.playAs = mode === 'play' || mode === 'teamPlay';
    this.team = mode === 'team' || mode === 'teamPlay';
    G.setHour = 21; // turnaje jsou vždy večer, za tmy
    G.wanted = 0;
    this.cinematic = true; // úvod (oktagon, nástup, moderátor) vždy kamerou arény; divák pak dostane zpět pohled ze hry
    if (this.playAs) { if (G.vehicle) G.exit?.(); G.mode = 'mma'; G.player.mesh.visible = false; }
    const N = this.team ? 3 : 1;
    const guardNames = ['Bachař Novák', 'Bachař Dvořák', 'Bachař Černý'], conNames = ['Vězeň „Kladivo“', 'Vězeň „Žiletka“', 'Vězeň „Tank“'];
    const conModels = ['Casual_Bald', 'Casual2_Male', 'Casual3_Male'];
    this.blue = []; this.red = [];
    for (let k = 0; k < N; k++) {
      this.blue.push(this.fighter({ name: 'Worker_Male', uniform: { shirt: '#1d2633', pants: '#161c26', hat: '#1d2633' } }, guardNames[k], 'blue'));
      this.red.push(this.fighter({ name: conModels[k], uniform: { shirt: '#3f4f63', pants: '#34404f' } }, k === 0 && this.playAs ? 'TY (vězeň)' : conNames[k], 'red'));
    }
    this.me = this.playAs ? this.red[0] : null;
    document.body.classList.toggle('mma-play', this.playAs);
    this.all = [...this.blue, ...this.red];
    this.ref = this.fighter({ name: 'Suit_Male', uniform: { shirt: '#f4f4f2', pants: '#141414' } }, 'Rozhodčí', null);
    // rozhodčí čeká u neutrálního rohu, uprostřed stojí moderátor s mikrofonem
    { const a = (3 / 8) * Math.PI * 2, rx = C.x + Math.sin(a) * (R - 1.2), rz = C.z + Math.cos(a) * (R - 1.2); this.place(this.ref, rx, rz, Math.atan2(C.x - rx, C.z - rz)); this.ref.y = this.deckTop; this.ref.m.position.y = this.ref.y; }
    this.mc = this.fighter({ name: 'Suit_Male', uniform: { shirt: '#111318', pants: '#111318' }, skin: '#e8c3a0' }, 'Moderátor', null);
    this.place(this.mc, C.x, C.z, Math.atan2(this.doorPt[0] - C.x, this.doorPt[1] - C.z)); this.mc.y = this.deckTop; this.mc.m.position.y = this.mc.y;
    this.dressMc(this.mc);
    this.mc.path = [[this.doorPt[0], this.doorPt[1]], [this.stairTop[0], this.stairTop[1]], [this.stairFoot[0], this.stairFoot[1]], [this.carpetStart[0], this.carpetStart[1]]]; this.mc.pi = 0; this.mc.leaving = false;
    this.musicDone = false; this.music = null;
    // nástupní trasy: koberec → schůdky → vstup → roh (bachaři modrý roh, vězni červený)
    const corner = (team, k) => { const a = (team === 'blue' ? 1 : 5) / 8 * Math.PI * 2, cx = C.x + Math.sin(a) * (R - 1.3), cz = C.z + Math.cos(a) * (R - 1.3); return [cx + (k - (N - 1) / 2) * 1.0 * Math.cos(a), cz - (k - (N - 1) / 2) * 1.0 * Math.sin(a)]; };
    for (const [list, team] of [[this.blue, 'blue'], [this.red, 'red']]) list.forEach((f, k) => {
      const [cx, cz] = corner(team, k);
      const E = this.entries[team];
      f.entry = E;
      f.path = [[E.stairFoot[0], E.stairFoot[1]], [E.stairTop[0], E.stairTop[1]], [E.doorPt[0], E.doorPt[1]], [cx, cz]];
      f.pi = 0; f.delay = k * 0.8; f.corner = [cx, cz];
      this.place(f, E.carpetStart[0], E.carpetStart[1], 0); f.m.visible = false;
    });
    this.phase = 'show'; this.t = 0; this.round = 0; this.clock = ROUND_S; // 1) nejdřív se ukáže oktagon
    this.makeHud();
    this.status = '🎵 Nástup zápasníků';
    G.toast?.(this.playAs ? '🥊 Hraješ za vězně · WASD · myš / F rána · G / Q kop · Shift kryt · O nůž' : '🥊 MMA zápas za tmy · V = kamera arény / pohled ze hry');
    this.knife = null;
  }

  /** Moderátor: černý oblek, bílá košile, motýlek, mikrofon v pravé ruce. */
  dressMc(f) {
    const m = f.m; m.updateMatrixWorld(true);
    const at = (bone, obj, y = 0) => { if (!bone) return; const ws = new THREE.Vector3(); bone.getWorldScale(ws); const k = 1 / (ws.x || 1); obj.scale.setScalar(k); obj.position.y = y * k; bone.add(obj); };
    const mic = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.6, roughness: 0.3 }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.9, roughness: 0.35 }));
    head.position.y = 0.12;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 6, 14), new THREE.MeshStandardMaterial({ color: '#39ff14', emissive: '#39ff14', emissiveIntensity: 0.8 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.075;
    mic.add(handle, head, ring); mic.rotation.x = -0.4;
    at(f.bones.fistR, mic, 0.04);
    // motýlek a bílá náprsenka
    let neck = null; m.traverse((o) => { if (!neck && (o.name === 'Neck' || o.name === 'neck')) neck = o; });
    if (neck) {
      const tie = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: '#d41f2c', roughness: 0.5 });
      for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), red); w.rotation.z = sd * Math.PI / 2; w.position.x = sd * 0.03; tie.add(w); }
      tie.position.z = 0.09; at(neck, tie, -0.02);
    }
  }
  /** Moderátor: uprostřed klece hlásí nástup (mikrofon u pusy), pak odchází z klece. */
  mcStep(dt) {
    const f = this.mc; if (!f || f.gone) return;
    if (!f.leaving) {
      f.m.position.set(f.x, f.y, f.z);
      const tgt = this.phase === 'walkRed' ? this.red[0] : this.blue[0];
      if (tgt?.m.visible) f.h += Math.atan2(Math.sin(Math.atan2(tgt.x - f.x, tgt.z - f.z) - f.h), Math.cos(Math.atan2(tgt.x - f.x, tgt.z - f.z) - f.h)) * Math.min(1, dt * 3);
      f.m.rotation.y = f.h;
      animateHuman(f.m, 0, dt);
      // mikrofon u pusy, volná ruka gestikuluje
      if (f.bones.uaR) { f.bones.uaR.rotation.x -= 1.25; f.bones.uaR.rotation.z += 0.55; }
      if (f.bones.uaL) f.bones.uaL.rotation.x -= 0.6 + Math.max(0, Math.sin(this.game.time * 3)) * 0.9;
      return;
    }
    const p = f.path[f.pi];
    if (!p) { f.gone = true; this.game.scene.remove(f.m); return; }
    const dx = p[0] - f.x, dz = p[1] - f.z, d = Math.hypot(dx, dz), v = 2.2;
    if (d < 0.15) { f.pi++; return; }
    const st = Math.min(d, v * dt); f.x += (dx / d) * st; f.z += (dz / d) * st; f.h = Math.atan2(dx, dz);
    const gy = this.game.city.ground(f.x, f.z);
    f.y = f.pi === 0 ? this.deckTop : f.pi === 1 ? gy + DECK * Math.max(0, Math.min(1, 1 - Math.hypot(f.x - this.stairTop[0], f.z - this.stairTop[1]) / 1.9)) : gy;
    if (f.pi >= 2) f.y = gy;
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    animateHuman(f.m, v, dt);
    if (f.bones.uaR) { f.bones.uaR.rotation.x -= 0.5; }
  }
  place(f, x, z, h) { f.x = x; f.z = z; f.h = h; f.y = this.game.city.ground(x, z); f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = h; }

  /** Hlasatelka: nahraná hláška (key), jinak hlas prohlížeče. */
  say(key, text) {
    this.status = text;
    const file = VOICE[key], v = PrisonFX.voiceEl();
    if (file && v) { v.pause(); v.src = `assets/voice/${file}.m4a`; v.currentTime = 0; v.muted = false; v.play().catch(() => { try { this.game.prisonFx?.speak?.(text); } catch { /* ticho */ } }); }
    else { try { this.game.prisonFx?.speak?.(text); } catch { /* ticho */ } }
  }

  /* ---------------- HUD ---------------- */
  makeHud() {
    const css = document.createElement('style'); css.id = 'mma-css';
    css.textContent = `#mma-hud{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:40;pointer-events:none;width:min(580px,94vw);font:800 13px "Chakra Petch",sans-serif;color:#fff;text-align:center}
#mma-hud .row{display:flex;align-items:center;gap:8px}#mma-hud .bar{flex:1;height:16px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.35);border-radius:4px;overflow:hidden;display:flex}
#mma-hud .bar i{display:block;height:100%;transition:width .15s}#mma-hud .b i{background:linear-gradient(90deg,#2b5fd8,#79a8ff)}#mma-hud .r{justify-content:flex-end}#mma-hud .r i{background:linear-gradient(270deg,#d82b2b,#ff8a7a)}
#mma-hud .mid{min-width:96px;background:rgba(0,0,0,.75);border-radius:6px;padding:3px 6px;font-size:12px}#mma-hud .nm{display:flex;justify-content:space-between;margin-top:3px;text-shadow:0 1px 3px #000;font-size:12px}
#mma-hud .st{margin-top:6px;background:rgba(0,0,0,.65);display:inline-block;padding:4px 10px;border-radius:8px;font-size:13px;max-width:94vw}
#mma-end{position:fixed;right:16px;bottom:16px;z-index:41;pointer-events:auto;font:800 14px "Chakra Petch",sans-serif;color:#fff;background:#39ff14;color:#04140b;border:0;border-radius:10px;padding:9px 14px;cursor:pointer}
@media (pointer:coarse),(max-width:700px){
#mma-hud{top:calc(max(12px,env(safe-area-inset-top)) + 46px);width:94vw;font-size:11px}#mma-hud .bar{height:12px}#mma-hud .mid{min-width:78px;font-size:11px}#mma-hud .nm{font-size:11px}#mma-hud .st{font-size:12px}
#mma-end,#mma-cam,#mma-play{bottom:auto!important;top:calc(max(12px,env(safe-area-inset-top)) + 158px)!important;font-size:12px!important;padding:6px 9px!important;border-radius:8px!important}
#mma-play{right:auto!important;left:10px!important}#mma-cam{right:auto!important;left:50%!important;transform:translateX(-50%)}#mma-end{right:10px!important}
body.mma-on .hud-left,body.mma-on #beta-badge,body.mma-on .toast{display:none!important}}`;
    document.head.appendChild(css);
    document.body.classList.add('mma-on');
    const d = document.createElement('div'); d.id = 'mma-hud';
    d.innerHTML = '<div class="row"><div class="bar b"><i id="mma-b"></i></div><div class="mid" id="mma-mid"></div><div class="bar r"><i id="mma-r"></i></div></div><div class="nm"><span id="mma-bn"></span><span id="mma-rn"></span></div><div class="st" id="mma-st"></div>';
    document.body.appendChild(d); this.hud = d;
    const b = document.createElement('button'); b.id = 'mma-end'; b.textContent = '✕ Ukončit zápas';
    b.addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });
    document.body.appendChild(b); this.endBtn = b;
    if (!this.playAs) {
      const c = document.createElement('button'); c.id = 'mma-cam'; c.textContent = this.cinematic ? '🎮 Pohled ze hry (V)' : '🎥 Kamera arény (V)';
      c.style.cssText = 'position:fixed;right:16px;bottom:62px;z-index:41;pointer-events:auto;font:800 14px "Chakra Petch",sans-serif;color:#fff;background:rgba(14,18,23,.85);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:9px 14px;cursor:pointer';
      c.addEventListener('click', (e) => { e.stopPropagation(); this.toggleCam(); c.blur(); });
      document.body.appendChild(c); this.camBtn = c;
      const pb = document.createElement('button'); pb.id = 'mma-play'; pb.textContent = '🥊 Hraj za vězně';
      pb.style.cssText = 'position:fixed;right:16px;bottom:108px;z-index:41;pointer-events:auto;font:800 14px "Chakra Petch",sans-serif;color:#fff;background:#39ff14;color:#04140b;border:0;border-radius:10px;padding:9px 14px;cursor:pointer';
      pb.addEventListener('click', (e) => { e.stopPropagation(); this.takeOver(); });
      document.body.appendChild(pb); this.playBtn = pb;
    }
  }
  /** Během zápasu se hráč „přesune“ do vězně v kleci a hraje za něj. */
  takeOver() {
    if (this.playAs) return;
    const G = this.game;
    const f = this.red.find((q) => q.act !== 'ko');
    if (!f) { G.toast?.('Všichni vězni jsou K.O.'); return; }
    this.playAs = true; this.me = f; f.name = 'TY (vězeň)';
    document.body.classList.add('mma-play');
    if (G.vehicle) G.exit?.();
    G.mode = 'mma'; G.player.mesh.visible = false;
    this.cinematic = true; this.camP = null;
    this.camBtn?.remove(); this.camBtn = null; this.playBtn?.remove(); this.playBtn = null;
    G.toast?.('🥊 Hraješ za vězně · WASD · myš / F rána · G / Q kop · Shift kryt · O nůž');
  }
  toggleCam() {
    this.cinematic = !this.cinematic;
    if (this.camBtn) this.camBtn.textContent = this.cinematic ? '🎮 Pohled ze hry (V)' : '🎥 Kamera arény (V)';
    this.camP = null;
  }
  teamHp(list) { return list.reduce((s, f) => s + Math.max(0, f.hp), 0) / list.length; }
  updateHud() {
    const $ = (id) => document.getElementById(id);
    if (!this.hud || !$('mma-b')) return;
    $('mma-b').style.width = `${this.teamHp(this.blue)}%`; $('mma-r').style.width = `${this.teamHp(this.red)}%`;
    $('mma-bn').textContent = `🔵 ${this.team ? 'Bachaři' : this.blue[0].name} ${Math.round(this.teamHp(this.blue))}`;
    $('mma-rn').textContent = `${Math.round(this.teamHp(this.red))} ${this.team ? (this.playAs ? 'Vězni (TY)' : 'Vězni') : this.red[0].name}${this.knife ? ' 🔪' : ''} 🔴`;
    const s = Math.max(0, Math.ceil(this.clock));
    $('mma-mid').textContent = this.round ? `KOLO ${this.round}/3 · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'NÁSTUP';
    $('mma-st').textContent = this.status || '';
  }

  /* ---------------- průběh ---------------- */
  update(dt) {
    if (!this.active) return;
    if (!this.playAs && this.game.input.hit('KeyV')) this.toggleCam();
    this.t += dt;
    const ph = this.phase;
    if (ph === 'show') {
      // 1) oktagon se ukáže, moderátor stojí uprostřed
      this.status = 'Vinařice Fight Night';
      if (this.t > 4) { this.phase = 'walkAll'; this.t = 0; this.status = 'Nástup zápasníků'; }
    } else if (ph === 'walkAll' || ph === 'walkBlue' || ph === 'walkRed') {
      // 2) zápasníci přicházejí ze dvou stran (bachaři modrou bránou, vězni červenou)
      let done = true;
      for (const f of this.all) { if (this.walk(f, dt) === false) done = false; }
      if (done) {
        // 3) všichni v ringu → moderátor: „Jedeme bomby!“
        this.phase = 'announce'; this.t = 0; this.status = '🎤 Jedeme bomby!';
        try { this.music = new Audio('assets/audio/jedeme-bomby.mp3'); this.music.volume = 0.9; this.music.addEventListener('ended', () => (this.musicDone = true)); this.music.play().catch(() => { this.musicDone = true; }); } catch { this.musicDone = true; }
      }
    } else if (ph === 'announce') {
      // písnička dohraje → moderátor odchází → zavřou se dveře → rozhodčí
      for (const f of this.all) { const o = this.nearestFoe(f); if (o) f.h = Math.atan2(o.x - f.x, o.z - f.z); this.idle(f, dt); }
      if ((this.musicDone || this.t > 16) && this.t > 2 && this.mc && !this.mc.leaving) { this.mc.leaving = true; this.status = 'Moderátor opouští klec'; }
      if (this.mc?.leaving && (this.mc.gone || this.mc.pi >= 2)) {
        let open = false;
        for (const D of this.cageDoors || []) if (D.cur > 0) { open = true; const st = Math.min(D.cur, dt * 2.2); D.pivot.rotateY(-st); D.cur -= st; if (D.cur <= 0) { this.game.audio?.noise?.(0.25, 0.8, 300); this.game.audio?.blip?.(140, 0.2, 'square', 0.1, -40); } }
        if (!open) { this.phase = 'intro'; this.t = 0; this.status = ''; if (!this.playAs && this.cinematic) this.toggleCam(); this.say('rules', 'Pravidla znáte. Pěsti a kopy. Ťukněte si… a bojujte!'); }
      }
    } else if (ph === 'teardown') {
      this.teardownStep(dt);
    } else if (ph === 'intro') {
      for (const f of this.all) { const o = this.nearestFoe(f); if (o) f.h = Math.atan2(o.x - f.x, o.z - f.z); this.idle(f, dt); }
      if (this.t > 4) this.startRound(1);
    } else if (ph === 'fight') {
      this.clock -= dt;
      for (const f of this.all) this.fightStep(f, dt);
      for (const f of this.all) this.keepIn(f);
      this.separate();
      this.updateKnife(dt);
      if (this.clock <= 0) {
        if (this.round >= 3) this.decision();
        else { this.phase = 'rest'; this.t = 0; this.say(this.round === 1 ? 'e1' : 'e2', `Konec ${this.round}. kola!`); this.bell(2); }
      }
    } else if (ph === 'rest') {
      for (const f of this.all) {
        if (f.act === 'ko') { this.updateAnim(f, dt); continue; }
        this.stepTo(f, f.corner[0], f.corner[1], 1.6, dt); f.hp = Math.min(100, f.hp + dt * 0.8);
      }
      if (this.t > REST_S) this.startRound(this.round + 1);
    } else if (ph === 'end') {
      for (const f of this.all) { if (f.act === 'ko') this.updateAnim(f, dt); else if (f.team === this.winTeam) this.idle(f, dt, true); else this.idle(f, dt); }
      if (this.t > 12) this.startTeardown();
    }
    this.refStep(dt);
    this.mcStep(dt);
    if (this.phase !== 'teardown') this.updateFans(dt);
    this.updateLights(dt);
    this.updateHud();
  }

  /* ---------------- po zápase: rozchod, kamiony a rozebrání oktagonu ---------------- */
  static BARRACKS = [[-174.5, 1046], [-174.5, 1068], [-238, 1050.5], [-360, 1065.6], [-350.8, 1116], [-295, 1057.4], [-212.2, 1081], [-233, 1083.7]];
  static TRUCK_IN = [[-388, 1238], [-397, 1224], [-407, 1211], [-428, 1186], [-412, 1178], [-371, 1157], [-356, 1148], [-340, 1140], [-311, 1150], [-303, 1147], [-293, 1141], [-280, 1129], [-262, 1134], [-250, 1140]];
  makeTruck() {
    const g = new THREE.Group(), black = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.45, metalness: 0.4 }), chrome = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.9, roughness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1c2a36', roughness: 0.1, metalness: 0.5 }), tyre = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 2.4), black); cab.position.set(0, 2.0, 6.6);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.1, 0.05), glass); ws.position.set(0, 2.6, 7.82);
    const grill = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.06), chrome); grill.position.set(0, 1.25, 7.82);
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.55, 3.4, 12.5), black); trailer.position.set(0, 2.45, -1.2);
    // nápis na návěsu
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const cg = c.getContext('2d');
    // žlutý nápis OKTAGON s osmiúhelníkem místo písmene O (vlastní kresba)
    cg.fillStyle = '#0d0e10'; cg.fillRect(0, 0, 1024, 256);
    cg.fillStyle = '#ffd400'; cg.font = '900 150px "Russo One", "Arial Black", sans-serif'; cg.textBaseline = 'middle'; cg.textAlign = 'left';
    const word = 'KTAG', wx = 250; cg.fillText(word, wx, 128);
    const oct = (cx, r) => { cg.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k / 8) * Math.PI * 2; cg.lineTo(cx + Math.cos(a) * r, 128 + Math.sin(a) * r); } cg.closePath(); };
    const drawO = (cx) => { oct(cx, 70); cg.fillStyle = '#ffd400'; cg.fill(); oct(cx, 50); cg.fillStyle = '#0d0e10'; cg.fill(); oct(cx, 40); cg.fillStyle = '#ffffff'; cg.fill(); cg.fillStyle = '#0d0e10'; cg.beginPath(); cg.moveTo(cx - 26, 140); cg.lineTo(cx + 26, 110); cg.lineTo(cx + 4, 128); cg.lineTo(cx + 26, 128); cg.lineTo(cx - 26, 152); cg.lineTo(cx - 4, 136); cg.closePath(); cg.fill(); };
    drawO(170);
    const ww = cg.measureText(word).width; drawO(wx + ww + 85);
    cg.fillStyle = '#ffd400'; cg.fillText('N', wx + ww + 165, 128);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    for (const sd of [-1, 1]) { const sgn = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.4), new THREE.MeshStandardMaterial({ map: tx, emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: 0.25 })); sgn.position.set(sd * 1.28, 2.6, -1.2); sgn.rotation.y = sd * Math.PI / 2; g.add(sgn); }
    for (const [z, n] of [[6.9, 1], [4.6, 1], [-4.5, 2], [-5.9, 2]]) for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.45 * n, 16), tyre); w.rotation.z = Math.PI / 2; w.position.set(sd * 1.15, 0.52, z); g.add(w); }
    const lights = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6d8', emissiveIntensity: 2 });
    for (const sd of [-0.85, 0.85]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.05), lights); l.position.set(sd, 1.2, 7.84); g.add(l); }
    g.add(cab, ws, grill, trailer);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(g);
    return g;
  }
  startTeardown() {
    this.phase = 'teardown'; this.t = 0; this.status = 'Vězni odcházejí na oddíly · přijíždí technika';
    for (const f of [...this.all, this.ref]) this.game.scene.remove(f.m);
    if (this.mc && !this.mc.gone) this.game.scene.remove(this.mc.m);
    // diváci a bachaři: každý jde k nejbližším dveřím svého baráku a zaleze dovnitř
    const B = MMA.BARRACKS;
    for (const f of this.fans) { const d = B[Math.floor(Math.random() * B.length)]; f.tx = d[0] + (Math.random() - 0.5) * 2; f.tz = d[1] + (Math.random() - 0.5) * 2; f.sp = 1.3 + Math.random() * 0.6; f.delay = Math.random() * 6; f.gone = false; }
    for (const p of this.guardPos) { const d = B[Math.floor(Math.random() * B.length)]; p.tx = d[0]; p.tz = d[1]; p.sp = 1.5; p.delay = 3 + Math.random() * 5; }
    for (const d of this.dogs) this.game.scene.remove(d.m);
    // dva dlouhé černé kamiony vjedou vjezdem zásobování
    const path = MMA.TRUCK_IN;
    this.trucks = [0, 1].map((k) => ({ m: this.makeTruck(), s: -k * 22, path, stage: 'in', stop: k ? 18 : 0 }));
    this.pathLen = 0; this.pathCum = [0];
    for (let i = 1; i < path.length; i++) { this.pathLen += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); this.pathCum.push(this.pathLen); }
    // díly arény k odnesení (vše kromě světel stožárů, které jdou poslední)
    this.parts = this.group.children.filter((o) => !o.isLight).sort((a, b) => Math.hypot(b.position.x - C.x, b.position.z - C.z) - Math.hypot(a.position.x - C.x, a.position.z - C.z));
    this.workers = null;
  }
  truckAt(s) {
    const P = MMA.TRUCK_IN, cum = this.pathCum;
    s = Math.max(0, Math.min(this.pathLen, s));
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), a = P[i - 1], b = P[i];
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, h: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  teardownStep(dt) {
    const G = this.game, city = G.city, t = this.game.time;
    // rozchod diváků
    let left = 0;
    for (const f of this.fans) {
      if (f.gone) continue;
      if (this.crowd.dead[f.i]) { f.gone = true; continue; }
      left++;
      if ((f.delay -= dt) > 0) { this.crowd.set(f.i, f.x, f.y, f.z, f.h, 0, 'walk', t); continue; }
      const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
      if (d < 1.2 || this.t > 70) { f.gone = true; this.crowd.hide(f.i); continue; }
      f.x += (dx / d) * f.sp * dt; f.z += (dz / d) * f.sp * dt; f.h = Math.atan2(dx, dz); f.y = city.ground(f.x, f.z);
      this.crowd.set(f.i, f.x, f.y, f.z, f.h, f.sp, 'walk', t);
    }
    this.crowd.commit();
    this.guardPos.forEach((p, i) => {
      if (p.gone || this.guards.dead[i]) return;
      if ((p.delay -= dt) > 0) { this.guards.set(i, p.x, p.y, p.z, p.h, 0, 'walk', t); return; }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 1.2 || this.t > 70) { p.gone = true; this.guards.hide(i); return; }
      p.x += (dx / d) * p.sp * dt; p.z += (dz / d) * p.sp * dt; p.h = Math.atan2(dx, dz); p.y = city.ground(p.x, p.z);
      this.guards.set(i, p.x, p.y, p.z, p.h, p.sp, 'walk', t);
    });
    this.guards.commit();
    // kamiony
    let parked = 0;
    for (const tr of this.trucks || []) {
      const end = this.pathLen - tr.stop;
      if (tr.stage === 'in') { tr.s = Math.min(end, tr.s + 6 * dt); if (tr.s >= end - 0.05) { tr.stage = 'park'; } }
      else if (tr.stage === 'out') { tr.s -= 7 * dt; if (tr.s < -30) { tr.stage = 'gone'; G.scene.remove(tr.m); } }
      if (tr.stage === 'park') parked++;
      if (tr.stage !== 'gone') { const q = this.truckAt(tr.s), y = city.ground(q.x, q.z); tr.m.position.set(q.x, y, q.z); tr.m.rotation.y = tr.stage === 'out' ? q.h : q.h; tr.m.visible = tr.s > -1; }
    }
    // dělníci: 20 chlapů v reflexních vestách vyleze z kamionů a nosí díly
    if (parked === 2 && !this.workers) {
      this.status = 'Party rozebírá oktagon a nakládá do kamionů';
      this.wCrowd ||= new Crowd(G.scene, { capacity: 20, shirt: '#f2c230', pants: '#22262c' });
      this.workers = Array.from({ length: 20 }, (_, i) => { const tr = this.trucks[i % 2], back = this.truckAt(this.pathLen - tr.stop - 8); return { i, x: back.x, z: back.z, home: [back.x, back.z], tgt: null, carry: false, sp: 2.4 + Math.random() * 0.6 }; });
    }
    if (this.workers) {
      let busy = false;
      for (const w of this.workers) {
        if (!w.tgt) {
          if (!w.carry && this.parts.length) { w.part = this.parts.pop(); w.tgt = [w.part.position.x + (Math.random() - 0.5), w.part.position.z + (Math.random() - 0.5)]; }
          else if (w.carry) w.tgt = [w.home[0] + (Math.random() - 0.5) * 2, w.home[1] + (Math.random() - 0.5) * 2];
        }
        if (w.tgt) {
          busy = true;
          const dx = w.tgt[0] - w.x, dz = w.tgt[1] - w.z, d = Math.hypot(dx, dz);
          if (d < 0.6) {
            if (!w.carry) { if (w.part) { w.part.visible = false; this.group.remove(w.part); } const extra = this.parts.pop(); if (extra) this.group.remove(extra); w.carry = true; G.audio?.noise?.(0.08, 0.12, 900); }
            else w.carry = false;
            w.tgt = null;
          } else { w.x += (dx / d) * w.sp * dt; w.z += (dz / d) * w.sp * dt; w.h = Math.atan2(dx, dz); }
        }
        this.wCrowd.set(w.i, w.x, city.ground(w.x, w.z), w.z, w.h || 0, w.tgt ? w.sp : 0, w.carry ? 'aim' : 'walk', t);
      }
      this.wCrowd.commit();
      // vše naloženo → zbytek (světla, podium) zmizí, dělníci nasednou a kamiony odjedou
      if (!busy && !this.parts.length && !this.leaving) {
        this.leaving = true; this.status = 'Kamiony odjíždějí';
        this.wCrowd.hideAll(true);
        for (const o of [...this.group.children]) this.group.remove(o);
        for (const tr of this.trucks) tr.stage = 'out';
      }
    }
    if (this.leaving && this.trucks.every((tr) => tr.stage === 'gone')) { this.leaving = false; this.finish(true); this.game.toast?.('Turnaj skončil · areál je uklizený'); }
    if (this.t > 400) this.finish(true); // pojistka
  }
  fadeMusic() {
    const a = this.music; if (!a) return;
    const id = setInterval(() => { a.volume = Math.max(0, a.volume - 0.06); if (a.volume <= 0.01) { a.pause(); clearInterval(id); } }, 120);
  }
  startRound(n) {
    this.round = n; this.clock = ROUND_S; this.phase = 'fight'; this.t = 0;
    for (const f of this.all) if (f.act !== 'ko') { f.act = 'idle'; f.cool = 0.6 + Math.random() * 0.8; }
    this.say(`r${n}`, n === 3 ? 'Třetí a poslední kolo!' : `${n}. kolo!`); this.bell(1);
  }
  bell(times) { for (let k = 0; k < times; k++) setTimeout(() => this.game.audio?.blip?.(1250, 0.6, 'sine', 0.12, -20), k * 260); }
  alive(list) { return list.filter((f) => f.act !== 'ko'); }
  nearestFoe(f) {
    const foes = this.alive(f.team === 'blue' ? this.red : this.blue);
    let best = null, bd = 1e9;
    for (const o of foes) { const d = Math.hypot(o.x - f.x, o.z - f.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  /** Chůze po trase. Vrací true v cíli, false cestou. */
  walk(f, dt) {
    if (f.delay > 0) { f.delay -= dt; return false; }
    f.m.visible = true;
    const p = f.path[f.pi];
    if (!p) { this.idle(f, dt); return true; }
    const dx = p[0] - f.x, dz = p[1] - f.z, d = Math.hypot(dx, dz), v = 2.7; // svižný nástup
    if (d < 0.12) { f.pi++; if (f.pi >= f.path.length) { this.idle(f, dt); return true; } return false; }
    const s = Math.min(d, v * dt);
    f.x += (dx / d) * s; f.z += (dz / d) * s; f.h = Math.atan2(dx, dz);
    // výška: koberec = zem, schůdky = plynule, uvnitř = podlaha
    const gy = this.game.city.ground(f.x, f.z);
    const ST = (f.entry || this).stairTop;
    if (f.pi === 0) f.y = gy; else if (f.pi === 1) { const t = 1 - Math.hypot(ST[0] - f.x, ST[1] - f.z) / 1.9; f.y = gy + DECK * Math.max(0, Math.min(1, t)); } else f.y = this.deckTop;
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    animateHuman(f.m, v, dt); this.applyPose(f, true);
    return false;
  }
  idle(f, dt, celebrate = false) {
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    if (celebrate) { f.act = 'win'; animateHuman(f.m, 0, dt, Math.sin(this.t * 4 + f.x) > 0.4 ? 'air' : null); }
    else animateHuman(f.m, 0, dt);
    this.applyPose(f, this.phase === 'walkBlue' || this.phase === 'walkRed');
  }
  stepTo(f, tx, tz, v, dt) {
    const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const s = Math.min(d, v * dt); f.x += (dx / d) * s; f.z += (dz / d) * s; f.h = Math.atan2(dx, dz); }
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    animateHuman(f.m, d > 0.1 ? v : 0, dt); this.applyPose(f, false);
  }
  keepIn(f) {
    const dx = f.x - C.x, dz = f.z - C.z, d = Math.hypot(dx, dz), lim = R * Math.cos(Math.PI / 8) - 0.55;
    if (d > lim) { f.x = C.x + (dx / d) * lim; f.z = C.z + (dz / d) * lim; }
  }
  separate() {
    const L = this.alive(this.all);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01, min = 0.75;
      if (d < min) { const p = (min - d) / 2; a.x -= (dx / d) * p; a.z -= (dz / d) * p; b.x += (dx / d) * p; b.z += (dz / d) * p; }
    }
  }

  /** Jeden zápasník: AI nebo hráč. */
  fightStep(f, dt) {
    if (f.act === 'ko') { this.updateAnim(f, dt); return; }
    const o = this.nearestFoe(f);
    f.cool -= dt; f.actT += dt;
    if (!o) { this.idle(f, dt); return; }
    const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz) || 0.01, face = Math.atan2(dx, dz);
    let mv = 0, mx = 0, mz = 0;
    if (f.act === 'hit') { if (f.actT > 0.38) f.act = 'idle'; }
    else if (f.act === 'punch' || f.act === 'kick' || f.act === 'stab') {
      // výpad vpřed při úderu (a návrat)
      const lt = f.actT / (f.act === 'kick' ? 0.62 : 0.42), lv = lt < 0.35 ? 1.6 : lt < 0.8 ? -0.9 : 0;
      f.x += (dx / d) * lv * dt; f.z += (dz / d) * lv * dt;
      const impact = f.act === 'kick' ? 0.3 : 0.17, end = f.act === 'kick' ? 0.62 : 0.42, reach = f.act === 'kick' ? 1.7 : f.act === 'stab' ? 1.3 : 1.35;
      if (!f.hitDone && f.actT >= impact) { f.hitDone = true; this.resolve(f, o, f.act, reach); }
      if (f.actT > end) f.act = 'idle';
    }
    const free = f.act === 'idle';
    if (f === this.me) {
      const inp = this.game.input, a = inp.axes();
      const cy = this.camYawNow ?? face, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
      mx = fx * a.y + rx * a.x; mz = fz * a.y + rz * a.x; mv = Math.min(1, Math.hypot(mx, mz)) * 2.5;
      f.block = inp.down('ShiftLeft', 'ShiftRight');
      if (inp.hit('KeyO') && !this.knife) this.drawKnife(f);
      if (free && f.cool <= 0 && !f.block) {
        if (inp.hit('Mouse0') || inp.hit('KeyF') || inp.hit('KeyK')) this.attack(f, this.knife ? 'stab' : 'punch', 0.36);
        else if (inp.hit('KeyG') || inp.hit('KeyQ') || inp.hit('Mouse2')) this.attack(f, 'kick', 0.7);
      }
    } else if (free) {
      f.strafeT -= dt; if (f.strafeT <= 0) { f.strafe = Math.random() < 0.5 ? 1 : -1; f.strafeT = 0.8 + Math.random() * 1.5; }
      const want = 1.25, ux = dx / d, uz = dz / d;
      const fwd = d > want + 0.25 ? 1 : d < want - 0.35 ? -0.6 : 0;
      mx = ux * fwd - uz * f.strafe * 0.55; mz = uz * fwd + ux * f.strafe * 0.55;
      mv = Math.min(1, Math.hypot(mx, mz)) * (fwd > 0 ? 2.0 : 1.3);
      f.block = (o.act === 'punch' || o.act === 'kick' || o.act === 'stab') && (f.block || Math.random() < 0.04);
      if (f.cool <= 0 && d < 1.85) {
        if (d < 1.4 && Math.random() < 0.6) this.attack(f, 'punch', 0.5 + Math.random() * 0.6);
        else this.attack(f, 'kick', 0.85 + Math.random() * 0.7);
      }
    }
    if (mv > 0.05 && f.act !== 'hit') {
      const l = Math.hypot(mx, mz) || 1, sp = f.block ? mv * 0.5 : mv;
      f.x += (mx / l) * sp * dt; f.z += (mz / l) * sp * dt;
    }
    f.h += Math.atan2(Math.sin(face - f.h), Math.cos(face - f.h)) * Math.min(1, dt * 10);
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    this.updateAnim(f, dt, mv);
  }
  attack(f, kind, cool) {
    f.act = kind; f.actT = 0; f.hitDone = false; f.cool = cool;
    if (kind !== 'kick') { f.m.userData.punchNew = true; f.arm = f.arm === 'L' ? 'R' : 'L'; } else f.kickN++;
    f.lunge = 0;
    this.game.audio?.noise?.(0.05, 0.12, 1800);
  }
  resolve(f, o, kind, reach) {
    const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz);
    const facing = Math.cos(Math.atan2(dx, dz) - f.h) > 0.55;
    if (d > reach || !facing || o.act === 'ko') return;
    let chance = kind === 'kick' ? 0.6 : kind === 'stab' ? 0.85 : 0.7;
    if (o.block && kind !== 'stab') chance *= 0.3;
    if (Math.random() > chance) { this.game.audio?.noise?.(0.05, 0.1, 1400); return; }
    let dmg = kind === 'punch' ? 4 + Math.random() * 4 : kind === 'kick' ? 6 + Math.random() * 6 : 14 + Math.random() * 8;
    if (f === this.me) dmg *= 1.15; if (o === this.me) dmg *= 0.85; // hráč je trochu silnější
    if (o.block && kind !== 'stab') dmg *= 0.35;
    o.hp -= dmg; f.landed++;
    o.act = 'hit'; o.actT = 0;
    const ux = dx / (d || 1), uz = dz / (d || 1);
    o.x += ux * (kind === 'kick' ? 0.6 : 0.4); o.z += uz * (kind === 'kick' ? 0.6 : 0.4);
    const hy = o.y + (kind === 'kick' ? (f.kickN % 2 ? 1.0 : 1.45) : 1.55);
    this.impact(o.x - ux * 0.25, hy, o.z - uz * 0.25, dmg >= 9 || kind === 'kick');
    this.flashBody(o);
    this.shake = Math.max(this.shake || 0, dmg / 30);
    const G = this.game;
    G.audio?.noise?.(0.08, kind === 'kick' ? 0.9 : 0.7, kind === 'kick' ? 260 : 340);
    G.audio?.blip?.(80, 0.08, 'square', 0.1, -30);
    // krev: při úderech občas, při noži vždy (kapky + louže na plachtě)
    if (kind === 'stab' || Math.random() < 0.45) {
      G.weapons?.bleed(new THREE.Vector3(o.x, o.y + (kind === 'kick' ? 1.2 : 1.55), o.z), new THREE.Vector3(ux, 0, uz), kind === 'stab' ? 14 : 4);
      if (kind === 'stab' || Math.random() < 0.3) this.bloodPool(o.x + ux * 0.3, o.z + uz * 0.3, kind === 'stab' ? 0.55 : 0.3);
    }
    if (kind === 'stab') this.status = '🔪 Vězeň podvádí! Nůž v kleci!';
    this.hype = 1;
    if (o.hp <= 0) this.ko(f, o);
  }
  bloodPool(x, z, r) {
    this.poolM ||= new THREE.MeshBasicMaterial({ color: '#6a0a0a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const m = new THREE.Mesh(new THREE.CircleGeometry(r * (0.7 + Math.random() * 0.6), 12), this.poolM);
    m.rotation.x = -Math.PI / 2; m.position.set(x, this.deckTop + 0.012, z);
    this.group.add(m); this.pools.push(m);
  }
  drawKnife(f) {
    const k = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: '#d9dde0', metalness: 0.9, roughness: 0.2 }));
    blade.position.z = 0.15;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.11), new THREE.MeshStandardMaterial({ color: '#222' }));
    k.add(blade, handle);
    if (f.bones.fistR) { f.m.updateMatrixWorld(true); const ws = new THREE.Vector3(); f.bones.fistR.getWorldScale(ws); const sc = 1 / (ws.x || 1); f.bones.fistR.add(k); k.scale.setScalar(sc); k.position.set(0, 0.05 * sc, 0); }
    else { k.position.set(0.3, 1.1, 0.3); f.m.add(k); }
    this.knife = k;
    this.game.toast?.('🔪 Vytáhl jsi nůž! Myš / F = bodnout');
    this.say('knife', 'Sakra! On má nůž!');
    this.status = '🔪 Sakra, on má nůž!';
    this.hype = 1;
    this.game.prisonFx?.bark?.();
  }
  updateKnife() { /* nůž je přichycený na pěsti, nic dalšího */ }
  ko(w, l) {
    l.hp = 0; l.act = 'ko'; l.actT = 0;
    this.game.audio?.crash?.(15);
    const foes = this.alive(l.team === 'blue' ? this.blue : this.red);
    if (foes.length) { this.status = `${l.name} je K.O.!`; this.hype = 1; return; }
    this.winTeam = w.team; this.phase = 'end'; this.t = 0;
    const guards = w.team === 'blue';
    this.say(guards ? 'ko_guard' : 'ko_con', `K.O.! Vítězí ${guards ? (this.team ? 'bachaři' : 'bachař Novák') : this.playAs ? 'TY – vězeň z oddílu K' : this.team ? 'vězni' : 'vězeň Kladivo'}!`);
    this.bell(3); this.hype = 1;
    this.game.hud?.bigMsg?.('K.O.!', `Vítězí ${guards ? 'bachaři' : this.playAs ? 'TY' : 'vězni'} v ${this.round}. kole`);
  }
  decision() {
    const sb = this.blue.reduce((s, f) => s + f.landed + Math.max(0, f.hp) * 0.05, 0), sr = this.red.reduce((s, f) => s + f.landed + Math.max(0, f.hp) * 0.05, 0);
    this.winTeam = sb >= sr ? 'blue' : 'red'; this.phase = 'end'; this.t = 0;
    const guards = this.winTeam === 'blue';
    this.say(guards ? 'dec_guard' : 'dec_con', `Po třech kolech vítězí na body ${guards ? 'bachaři' : this.playAs ? 'TY' : 'vězni'}!`);
    this.bell(3);
    this.game.hud?.bigMsg?.('NA BODY', `Vítězí ${guards ? 'bachaři' : this.playAs ? 'TY' : 'vězni'}`);
  }

  updateAnim(f, dt, mv = 0) {
    if (f.act === 'ko') { animateHuman(f.m, 0, dt, 'down'); return; }
    if (f.act === 'punch' || f.act === 'stab') animateHuman(f.m, 0, dt, 'punch');
    else animateHuman(f.m, mv, dt);
    this.applyPose(f, false);
  }
  /** Garda, kopy, reakce na zásah, oslava – natočení kostí po přehrání klipu. */
  applyPose(f, walking) {
    const B = f.bones;
    if (f === this.ref || f === this.mc) return;
    const punching = f.act === 'punch' || f.act === 'stab';
    if (!walking && !punching && f.act !== 'win') {
      if (B.uaL) { B.uaL.rotation.x -= 0.9; B.uaL.rotation.z += f.block ? 0.5 : 0.25; }
      if (B.uaR) { B.uaR.rotation.x -= 0.9; B.uaR.rotation.z -= f.block ? 0.5 : 0.25; }
    }
    if (punching) {
      // úder: paže vystřelí vpřed (rychle tam, pomaleji zpět), trup se protočí, druhá ruka kryje bradu
      const t = f.actT / 0.42, k = t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.65);
      const hit = f.arm === 'L' ? B.uaL : B.uaR, guard = f.arm === 'L' ? B.uaR : B.uaL;
      if (hit) { hit.rotation.x -= 0.9 + 0.85 * k; hit.rotation.z += (f.arm === 'L' ? -0.25 : 0.25) * k; }
      if (guard) { guard.rotation.x -= 1.0; guard.rotation.z += f.arm === 'L' ? -0.4 : 0.4; }
      if (B.torso) { B.torso.rotation.y += (f.arm === 'L' ? -0.55 : 0.55) * k; B.torso.rotation.x += 0.18 * k; }
    }
    if (f.act === 'kick' && B.ulR) {
      const k = Math.sin(Math.min(1, f.actT / 0.62) * Math.PI);
      B.ulR.rotation.x -= k * 1.9; if (B.llR) B.llR.rotation.x += k * (f.kickN % 2 ? 0.1 : 0.7);
      if (B.torso) { B.torso.rotation.x -= k * 0.25; B.torso.rotation.y += k * 0.4; }
    }
    if (f.act === 'hit' && B.torso) {
      // zásah: hlava a trup odletí dozadu, ruce rozhozené
      const k = Math.sin(Math.min(1, f.actT / 0.38) * Math.PI);
      B.torso.rotation.x -= k * 0.85; B.torso.rotation.z += k * 0.25 * (f.x > 0 ? 1 : -1);
      if (B.uaL) B.uaL.rotation.z += k * 0.6; if (B.uaR) B.uaR.rotation.z -= k * 0.6;
    }
    if (f.act === 'win') { if (B.uaL) B.uaL.rotation.x -= 2.6; if (B.uaR) B.uaR.rotation.x -= 2.6; }
  }
  /** Záblesk zásahu: bílo-žlutý výbuch světla, jiskry a kapky potu v místě úderu. */
  impact(x, y, z, big) {
    const G = this.game;
    this.impT ||= (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,150,.95)'); gr.addColorStop(0.6, 'rgba(255,170,40,.35)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.impT, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
    sp.position.set(x, y, z); sp.scale.setScalar(0.2); this.group.add(sp);
    const t0 = performance.now(), size = big ? 1.5 : 0.95;
    const tick = () => { const p = (performance.now() - t0) / 170; if (p >= 1 || !this.active) { this.group.remove(sp); return; } sp.scale.setScalar(0.2 + size * Math.sqrt(p)); sp.material.opacity = 1 - p; sp.material.rotation = p * 0.6; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    for (let k = 0; k < (big ? 14 : 8); k++) G.weapons?.sparks?.emit(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.25, 6);
    // krátký záblesk soupeře
  }
  /** Soupeř po zásahu krátce zčervená (vidět, že dostal). */
  flashBody(o) {
    if (!o.mats) { o.mats = []; o.m.traverse((q) => { if (q.isMesh && q.material?.emissive) { q.material = q.material.clone(); o.mats.push(q.material); } }); }
    for (const m of o.mats) { m.emissive.set('#ff2a10'); m.emissiveIntensity = 0.9; }
    clearTimeout(o.flashTO); o.flashTO = setTimeout(() => { for (const m of o.mats) { m.emissive.set('#000000'); m.emissiveIntensity = 0; } }, 110);
  }

  refStep(dt) {
    const r = this.ref;
    r.y = this.deckTop;
    if (this.phase === 'fight' || this.phase === 'rest') {
      const L = this.alive(this.all);
      let mx = C.x, mz = C.z;
      if (L.length) { mx = L.reduce((s, f) => s + f.x, 0) / L.length; mz = L.reduce((s, f) => s + f.z, 0) / L.length; }
      // drží se 2,3 m stranou od středu dění
      let ax = r.x - mx, az = r.z - mz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      let tx = mx + ax * 2.3, tz = mz + az * 2.3;
      const lim = R - 1.0, ddx = tx - C.x, ddz = tz - C.z, dd = Math.hypot(ddx, ddz);
      if (dd > lim) { tx = C.x + (ddx / dd) * lim; tz = C.z + (ddz / dd) * lim; }
      const ex = tx - r.x, ez = tz - r.z, e = Math.hypot(ex, ez);
      if (e > 0.2) { const s = Math.min(e, 2.2 * dt); r.x += (ex / e) * s; r.z += (ez / e) * s; }
      r.h = Math.atan2(mx - r.x, mz - r.z);
      r.m.position.set(r.x, r.y, r.z); r.m.rotation.y = r.h;
      animateHuman(r.m, e > 0.2 ? 2 : 0, dt);
    } else if (this.phase === 'end') {
      // rozhodčí jde k vítězi a zvedne mu ruku
      const w = (this.winTeam === 'blue' ? this.blue : this.red).find((f) => f.act !== 'ko') || (this.winTeam === 'blue' ? this.blue[0] : this.red[0]);
      const tx = w.x + Math.cos(w.h) * 0.75, tz = w.z - Math.sin(w.h) * 0.75;
      const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
      if (d > 0.15) { const s = Math.min(d, 1.8 * dt); r.x += (dx / d) * s; r.z += (dz / d) * s; r.h = Math.atan2(dx, dz); }
      else r.h = w.h;
      r.m.position.set(r.x, r.y, r.z); r.m.rotation.y = r.h;
      animateHuman(r.m, d > 0.15 ? 1.8 : 0, dt);
      if (d < 0.3) { if (r.bones.uaL) r.bones.uaL.rotation.x -= 2.8; w.act = 'win'; }
    } else if (this.phase === 'intro') { this.stepTo(r, C.x, C.z, 1.8, dt); }
    else { r.m.position.set(r.x, r.y, r.z); r.m.rotation.y = r.h; animateHuman(r.m, 0, dt); }
  }

  updateFans(dt) {
    const Cr = this.crowd, t = this.game.time;
    this.hype = Math.max(0.25, (this.hype || 0.5) - dt * 0.35);
    const roar = this.phase === 'end' || this.phase === 'intro' || this.phase === 'walkBlue' || this.phase === 'walkRed' ? 0.9 : this.hype;
    for (const f of this.fans) {
      if (Cr.dead[f.i]) continue;
      const jump = Math.max(0, Math.sin(t * (5 + f.hype * 3) + f.ph)) * 0.25 * roar * (0.4 + f.hype);
      const cheering = roar * (0.5 + f.hype) > 0.6 || Math.sin(t * 0.7 + f.ph) > 0.6;
      Cr.set(f.i, f.x, f.y + jump, f.z, f.h, 0, cheering ? 'riot' : 'walk', t);
    }
    const gnd = (x, z) => this.game.city.ground(x, z);
    Cr.updateCorpses(dt, gnd, () => {});
    Cr.commit();
    this.guardPos.forEach((p, i) => { if (!this.guards.dead[i]) this.guards.set(i, p.x, p.y, p.z, p.h, 0, p.panic ? 'riot' : 'walk', t); });
    this.guards.updateCorpses(dt, gnd, () => {});
    this.guards.commit();
    for (const d of this.dogs) { d.m.userData.tail.rotation.z = Math.sin(t * 9 + d.ph) * 0.5; if (Math.random() < dt * 0.05) this.game.prisonFx?.bark?.(); }
    this.noiseT = (this.noiseT || 0) - dt;
    if (this.noiseT <= 0) { this.noiseT = 0.25; this.game.audio?.noise?.(0.35, 0.04 + roar * 0.12, 450 + Math.random() * 350); }
  }
  /** Reflektory krouží po kleci, lasery se míhají, barevná světla pulzují. */
  updateLights(dt) {
    const tt = this.game.time;
    for (const T of this.torches || []) {
      if (T.fire) { const f = 1 + Math.sin(tt * 13 + T.ph) * 0.12 + Math.sin(tt * 7.3 + T.ph * 2) * 0.08; T.fire.scale.set(0.6 * f, 0.85 * (2 - f), 1); T.fire.position.y = T.y + Math.sin(tt * 9 + T.ph) * 0.03; }
      if (T.light) T.light.intensity = 5 + Math.sin(tt * 11 + T.ph) * 1.5 + Math.random();
    }
    const t = this.game.time, v = new THREE.Vector3(), up = new THREE.Vector3(0, -1, 0);
    for (const b of this.beams) {
      const tx = C.x + Math.cos(t * 0.6 + b.ph) * 2.2, tz = C.z + Math.sin(t * 0.7 + b.ph) * 2.2, ty = this.deckTop;
      v.set(tx - b.px, ty - b.py, tz - b.pz); const L = v.length();
      b.cone.scale.set(1, L, 1);
      b.cone.quaternion.setFromUnitVectors(up, v.normalize());
    }
    for (const l of this.lasers) {
      const a = t * 1.7 + l.ph, tx = C.x + Math.cos(a) * 12, tz = C.z + Math.sin(a * 1.3) * 12, ty = this.gy + 1 + Math.sin(a * 2) * 3;
      v.set(tx - l.px, ty - l.py, tz - l.pz); const L = v.length();
      l.las.scale.set(1, L, 1);
      l.las.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
      l.las.visible = Math.sin(t * 3 + l.ph) > -0.4;
    }
    this.colorLights.forEach((c, i) => { c.intensity = 10 + Math.sin(t * 4 + i * 3) * 8 + this.hype * 10; c.position.x = C.x + Math.cos(t * 0.8 + i * Math.PI) * 6; c.position.z = C.z + Math.sin(t * 0.8 + i * Math.PI) * 6; });
  }

  /** Kamera: při sledování krouží kolem klece / jde před nastupujícími; při hraní je za hráčem. */
  camera(cam, dt) {
    let tx, ty, tz, px, py, pz;
    const pre = this.phase === 'show' || this.phase === 'walkAll' || this.phase === 'announce';
    if (pre) {
      // úvod: celý oktagon s oběma nástupy, pomalu krouží (při nástupu vidíš obě brány)
      const ang = this.game.time * 0.08 + (this.camAng0 ??= Math.atan2(this.entries.blue.uz, this.entries.blue.ux) + Math.PI / 2);
      tx = C.x; tz = C.z; ty = this.deckTop + 0.8;
      const r0 = this.phase === 'show' ? 13 : 17;
      px = C.x + Math.cos(ang) * r0; pz = C.z + Math.sin(ang) * r0; py = this.gy + (this.phase === 'show' ? 7 : 9);
    } else if (this.me && this.phase !== 'end' && this.me.act !== 'ko') {
      const me = this.me, op = this.nearestFoe(me) || { x: C.x, z: C.z }, dx = me.x - op.x, dz = me.z - op.z, d = Math.hypot(dx, dz) || 1;
      this.camYawNow = Math.atan2(op.x - me.x, op.z - me.z);
      tx = (me.x + op.x) / 2; tz = (me.z + op.z) / 2; ty = me.y + 1.3;
      px = me.x + (dx / d) * 3.8 + (-dz / d) * 0.9; pz = me.z + (dz / d) * 3.8 + (dx / d) * 0.9; py = me.y + 2.6;
    } else {
      const L = this.alive(this.all).length ? this.alive(this.all) : this.all;
      tx = L.reduce((s, f) => s + f.x, 0) / L.length; tz = L.reduce((s, f) => s + f.z, 0) / L.length; ty = this.deckTop + 1.2;
      const ang = this.game.time * 0.12;
      px = C.x + Math.cos(ang) * 10.5; pz = C.z + Math.sin(ang) * 10.5; py = this.gy + 5.5;
    }
    this.camP ||= new THREE.Vector3(px, py, pz);
    this.camP.lerp(new THREE.Vector3(px, py, pz), Math.min(1, dt * 3));
    cam.position.copy(this.camP);
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake * 0.2; cam.position.y += (Math.random() - 0.5) * this.shake * 0.2; this.shake = Math.max(0, this.shake - dt * 3); }
    cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz);
  }
  /** Cíle pro zbraně: diváci a bachaři kolem oktagonu. */
  targets() {
    const out = [];
    if (!this.active) return out;
    for (const Cr of [this.crowd, this.guards]) {
      if (!Cr) continue;
      Cr._uid ||= Math.random().toString(36).slice(2);
      for (let i = 0; i < Cr.cap; i++) {
        if (!Cr.vis[i] || Cr.dead[i]) continue;
        out.push({ key: `${Cr._uid}:${i}`, crowd: Cr, ci: i, mesh: { position: { x: Cr.x[i], y: Cr.y[i], z: Cr.z[i] } }, kill: (dir, boom) => { Cr.kill(i, dir, boom?.vel || null); this.hype = 1; this.status = '🔫 Střelba do diváků!'; } });
      }
    }
    return out;
  }
  focusPt() { const f = this.me || this.red?.[0]; return { x: f ? f.x : C.x, y: f ? f.y : this.gy || 0, z: f ? f.z : C.z, vx: 0, vz: 0, v: 0, h: f ? f.h : 0, hp: 100 }; }

  finish(quiet = false) {
    const G = this.game;
    if (!this.active) return;
    this.active = false;
    G.scene.remove(this.group);
    for (const f of [...(this.all || []), this.ref, this.mc]) if (f) G.scene.remove(f.m);
    this.music?.pause(); this.music = null;
    for (const tr of this.trucks || []) G.scene.remove(tr.m);
    this.trucks = null; this.workers = null; this.leaving = false;
    if (this.wCrowd) { this.wCrowd.hideAll(true); G.scene.remove(this.wCrowd.group); this.wCrowd = null; }
    for (const cr of [this.crowd, this.guards]) if (cr) { cr.hideAll(true); G.scene.remove(cr.group); }
    for (const d of this.dogs || []) G.scene.remove(d.m);
    for (const pr of this.hidden || []) { if (!pr.broken) pr.obj.visible = true; if (pr.obst && pr._r != null) pr.obst.r = pr._r; }
    this.hud?.remove(); this.endBtn?.remove(); this.camBtn?.remove(); this.playBtn?.remove(); document.getElementById('mma-css')?.remove(); document.body.classList.remove('mma-on', 'mma-play');
    PrisonFX.voiceEl()?.pause();
    if (G.mode === 'mma') {
      G.mode = 'foot';
      const s = this.carpetStart;
      Object.assign(G.player, { x: s[0] + 2, z: s[1], y: G.city.ground(s[0] + 2, s[1]), vy: 0 });
    }
    G.player.mesh.visible = true;
    if (!quiet) G.toast?.('Zápas skončil');
    this.playAs = false; this.me = null;
  }
}
