/*
 * MMA zápas ve věznici (zadní dvůr u psince). Tlačítkem se postaví oktagon (osmiúhelník s pletivem), kolem 500 fandících
 * vězňů, 50 bachařů a 10 psovodů se psy, reflektory a lasery, červený koberec se schůdky. Nejdřív nastoupí bachaři,
 * pak vězni, hlasatelka je uvede, rozhodčí odstartuje 3 kola (pěsti a kopy). Varianty 1 na 1 a 3 na 3.
 * Hrát za vězně: WASD pohyb, myš / F rána, G / Q kop, Shift kryt, O = vytáhne nůž (podvod).
 */
import * as THREE from 'three';
import { makeHuman, animateHuman } from './entities.js?v=20261127155453';
import { Crowd } from './crowd.js?v=20261127155453';
import { loadFighterKit, Fighter } from './fighter.js?v=20261127155453';
import { PrisonFX } from './prisonfx.js?v=20261127155453';

const C = { x: -222, z: 1152 }; // střed oktagonu
const R = 5.4; // poloměr oktagonu (k vrcholu)
const DECK = 0.9; // výška podlahy
const ROUND_S = 60, REST_S = 8;
const CARPET_A = Math.PI * 0.82; // směr uličky s kobercem
const VOICE = { // hlášky hlasatelky (nahrané, hrají i na telefonu)
  intro: 'mma_intro', intro3: 'mma_intro3', red: 'mma_red', red_you: 'mma_red_you', red3: 'mma_red3', rules: 'mma_rules',
  r1: 'mma_r1', r2: 'mma_r2', r3: 'mma_r3', e1: 'mma_e1', e2: 'mma_e2',
  knife: 'mma_knife', ko_guard: 'mma_ko_guard', ko_con: 'mma_ko_con', dec_guard: 'mma_dec_guard', dec_con: 'mma_dec_con',
};

export class MMA {
  constructor(game) { this.game = game; this.active = false; loadFighterKit().then(() => (this.kitReady = true)).catch((e) => console.warn('zápasníci', e)); }

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
    cg.fillStyle = '#1b1b1b'; cg.font = 'bold 118px sans-serif'; cg.textAlign = 'center'; cg.fillText('VINAŘICE', 512, 500);
    cg.fillStyle = '#b11d1d'; cg.font = 'bold 70px sans-serif'; cg.fillText('FIGHT NIGHT', 512, 590);
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
    this.verts = []; this.cage = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; this.verts.push([C.x + Math.sin(a) * R, C.z + Math.cos(a) * R]); }
    let door = 0, bd = 9;
    for (let k = 0; k < 8; k++) {
      const [ax, az] = this.verts[k], [bx, bz] = this.verts[(k + 1) % 8], mx = (ax + bx) / 2 - C.x, mz = (az + bz) / 2 - C.z;
      const a = Math.atan2(mz, mx), d = Math.abs(Math.atan2(Math.sin(a - CARPET_A), Math.cos(a - CARPET_A)));
      if (d < bd) { bd = d; door = k; }
    }
    for (let k = 0; k < 8; k++) {
      const [ax, az] = this.verts[k], [bx, bz] = this.verts[(k + 1) % 8], L = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
      const isDoor = k === door, w = isDoor ? L * 0.45 : L;
      const mx = isDoor ? ax + (bx - ax) * 0.775 : (ax + bx) / 2, mz = isDoor ? az + (bz - az) * 0.775 : (az + bz) / 2;
      const pm = new THREE.MeshStandardMaterial({ map: mt.clone(), alphaTest: 0.3, transparent: true, side: THREE.DoubleSide, roughness: 0.6 });
      pm.map.needsUpdate = true; pm.map.repeat.set(w / 0.35, H / 0.35);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, H), pm); panel.position.set(mx, top + H / 2, mz); panel.rotation.y = rot; g.add(panel);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, 0.22), pad); rail.position.set((ax + bx) / 2, top + H + 0.09, (az + bz) / 2); rail.rotation.y = rot; g.add(rail);
      (this.cage ||= []).push({ meshes: [panel, rail], cx: (ax + bx) / 2, cz: (az + bz) / 2 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, H + 0.4, 10), k === 1 ? padBlue : k === 5 ? padRed : pad);
      post.position.set(ax, top + (H + 0.4) / 2, az); g.add(post);
      this.cage.push({ meshes: [post], cx: ax, cz: az });
    }
    const [dax, daz] = this.verts[door], [dbx, dbz] = this.verts[(door + 1) % 8];
    const dmx = dax + (dbx - dax) * 0.27, dmz = daz + (dbz - daz) * 0.27, ux0 = dmx - C.x, uz0 = dmz - C.z, ul = Math.hypot(ux0, uz0);
    const ux = ux0 / ul, uz = uz0 / ul;
    this.doorPt = [C.x + ux * (ul - 0.3), C.z + uz * (ul - 0.3)];
    const stepM = mat('#262626');
    for (let s = 0; s < 4; s++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.5, DECK * (s + 1) / 4, 0.42), stepM);
      const d = ul + 0.25 + (3 - s) * 0.42;
      st.position.set(C.x + ux * d, gy + (DECK * (s + 1) / 4) / 2, C.z + uz * d); st.rotation.y = Math.atan2(ux, uz); g.add(st);
    }
    this.stairFoot = [C.x + ux * (ul + 2.1), C.z + uz * (ul + 2.1)];
    this.stairTop = [C.x + ux * (ul + 0.2), C.z + uz * (ul + 0.2)];
    // červený koberec, sloupky s lanem, vstupní brána
    const carpetLen = 13;
    this.carpetStart = [this.stairFoot[0] + ux * carpetLen, this.stairFoot[1] + uz * carpetLen];
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, carpetLen), mat('#9c1010', { roughness: 0.95 }));
    carpet.rotation.set(-Math.PI / 2, 0, -Math.atan2(ux, uz) + Math.PI, 'YXZ');
    carpet.rotation.order = 'YXZ'; carpet.rotation.y = Math.atan2(ux, uz); carpet.rotation.x = -Math.PI / 2; carpet.rotation.z = 0;
    carpet.position.set((this.stairFoot[0] + this.carpetStart[0]) / 2, gy + 0.03, (this.stairFoot[1] + this.carpetStart[1]) / 2);
    g.add(carpet);
    const brass = mat('#c9a43a', { metalness: 0.8, roughness: 0.3 });
    for (const sd of [-1, 1]) for (let k = 0; k <= 5; k++) {
      const d = (k / 5) * carpetLen, px = this.stairFoot[0] + ux * d - uz * sd * 1.1, pz = this.stairFoot[1] + uz * d + ux * sd * 1.1;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 8), brass); p.position.set(px, gy + 0.5, pz); g.add(p);
    }
    const arch = new THREE.Group(), archM = mat('#111');
    for (const sd of [-1, 1]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.3, 0.3), archM); col.position.set(sd * 1.5, 1.65, 0); arch.add(col); }
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128;
    const sg = sc.getContext('2d'); sg.fillStyle = '#0d0d0d'; sg.fillRect(0, 0, 512, 128); sg.fillStyle = '#f0c53a'; sg.font = 'bold 52px sans-serif'; sg.textAlign = 'center'; sg.fillText('BACHAŘI vs VĚZNI', 256, 82);
    const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace;
    const signM = new THREE.MeshStandardMaterial({ map: stx, emissive: '#ffffff', emissiveMap: stx, emissiveIntensity: 0.6 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.85, 0.2), [archM, archM, archM, archM, signM, signM]); sign.position.y = 3.4; arch.add(sign);
    arch.position.set(this.carpetStart[0], gy, this.carpetStart[1]); arch.rotation.y = Math.atan2(ux, uz);
    g.add(arch);
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
    // fanoušci: 500 vězňů kolem klece (mimo uličku)
    this.crowd = new Crowd(scene, { capacity: 500, shirt: '#3f4f63', pants: '#34404f' });
    this.fans = [];
    const aisle = (a, rr) => Math.abs(Math.atan2(Math.sin(a - CARPET_A), Math.cos(a - CARPET_A))) < 0.25 + 1.5 / rr;
    let n = 0;
    for (let ring = 0; n < 500 && ring < 14; ring++) {
      const rr = 8.6 + ring * 0.8, cnt = Math.floor((2 * Math.PI * rr) / 0.75);
      for (let k = 0; k < cnt && n < 500; k++) {
        const a = (k / cnt) * Math.PI * 2 + (ring % 2) * 0.2;
        if (aisle(a, rr)) continue;
        const x = C.x + Math.cos(a) * rr + (Math.random() - 0.5) * 0.3, z = C.z + Math.sin(a) * rr + (Math.random() - 0.5) * 0.3;
        this.fans.push({ i: n++, x, z, y: city.ground(x, z), h: Math.atan2(C.x - x, C.z - z), ph: Math.random() * 6, hype: Math.random() });
      }
    }
    // 50 bachařů v kruhu mezi klecí a diváky + 10 psovodů se psy u uličky a na okraji
    this.guards = new Crowd(scene, { capacity: 60, shirt: '#1d2633', pants: '#161c26', helmet: '#1d2633', baton: true });
    this.guardPos = [];
    for (let k = 0; k < 50; k++) {
      const a = (k / 50) * Math.PI * 2; if (aisle(a, 7.3)) continue;
      const x = C.x + Math.cos(a) * 7.3, z = C.z + Math.sin(a) * 7.3;
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
    // dočasně schovat drobnosti v prostoru arény
    this.hidden = [];
    for (const pr of city.props || []) if (Math.hypot(pr.x - C.x, pr.z - C.z) < 22 && pr.obj.visible) { pr.obj.visible = false; this.hidden.push(pr); if (pr.obst) { pr._r = pr.obst.r; pr.obst.r = 0; } }
    this.pools = [];
  }

  /* ---------------- postavy ---------------- */
  fighter(opts, name, team) {
    if (team) { // zápasník: figurína s klipy a dopočítanými pohyby (fighter.js)
      const rig = new Fighter(this.game.scene, team, 1.82);
      return { rig, m: rig.root, name, team, x: 0, z: 0, y: 0, h: 0, yOff: 0, hp: 100, st: 100, act: 'idle', actT: 0, move: null, cool: 0.5, combo: 0, comboT: 0, buf: null,
        hitDone: false, landed: 0, downs: 0, block: false, path: null, pi: 0, delay: 0, ai: { t: 0, strafe: 1 }, spin: 0, bones: { fistR: rig.bones.hand_r } };
    }
    const m = makeHuman({ ...opts, scale: 1.05, tint: false });
    this.game.scene.add(m);
    const bone = (n) => { const n2 = n.replace(/\./g, ''); let b = null; m.traverse((o) => { if (!b && (o.name === n || o.name === n2)) b = o; }); return b; };
    return { m, name, team, x: 0, z: 0, y: 0, h: 0, hp: 100, act: 'idle', actT: 0, bones: { uaL: bone('UpperArm.L'), uaR: bone('UpperArm.R') }, path: null, pi: 0, delay: 0 };
  }

  /** mode: 'watch' | 'play' (1 na 1, hráč = vězeň) | 'team' (3 na 3) | 'teamPlay' (3 na 3, hráč = vězeň) */
  start(mode = 'watch') {
    if (!this.kitReady) { this.game.toast?.('Načítám zápasníky…'); loadFighterKit().then(() => { this.kitReady = true; this.start(mode); }); return; }
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
    this.cinematic = !this.playAs ? false : true; // divák: normální pohled ze hry (V = kamera arény)
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
    this.place(this.ref, C.x, C.z, Math.PI); this.ref.y = this.deckTop; this.ref.m.position.y = this.ref.y;
    // nástupní trasy: koberec → schůdky → vstup → roh (bachaři modrý roh, vězni červený)
    const corner = (team, k) => { const a = (team === 'blue' ? 1 : 5) / 8 * Math.PI * 2, cx = C.x + Math.sin(a) * (R - 1.3), cz = C.z + Math.cos(a) * (R - 1.3); return [cx + (k - (N - 1) / 2) * 1.0 * Math.cos(a), cz - (k - (N - 1) / 2) * 1.0 * Math.sin(a)]; };
    for (const [list, team] of [[this.blue, 'blue'], [this.red, 'red']]) list.forEach((f, k) => {
      const [cx, cz] = corner(team, k);
      f.path = [[this.stairFoot[0], this.stairFoot[1]], [this.stairTop[0], this.stairTop[1]], [this.doorPt[0], this.doorPt[1]], [cx, cz]];
      f.pi = 0; f.delay = k * 0.8; f.corner = [cx, cz];
      this.place(f, this.carpetStart[0], this.carpetStart[1], 0); f.m.visible = false;
    });
    this.phase = 'walkBlue'; this.t = 0; this.round = 0; this.clock = ROUND_S;
    this.makeHud();
    this.say(this.team ? 'intro3' : 'intro', this.team ? 'Vítejte na Vinařice Fight Night! Tři na tři! V modrém rohu… tým bachařů!' : 'Vítejte na Vinařice Fight Night! V modrém rohu… bachař Novák!');
    G.toast?.(this.playAs ? this.controlsText() : '🥊 Zápas za tmy · V = kamera arény / pohled ze hry');
    this.timeScale = 1; this.hitStop = 0; this.slowMo = 0;
    this.knife = null;
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
#mma-hud .st2{margin-top:3px}#mma-hud .sbar{flex:1;height:5px;background:rgba(0,0,0,.6);border-radius:3px;overflow:hidden;display:flex}#mma-hud .sbar.r{justify-content:flex-end}#mma-hud .sbar i{display:block;height:100%;background:#ffd84a;transition:width .1s}
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
    d.innerHTML = '<div class="row"><div class="bar b"><i id="mma-b"></i></div><div class="mid" id="mma-mid"></div><div class="bar r"><i id="mma-r"></i></div></div><div class="row st2"><div class="sbar"><i id="mma-bs"></i></div><div style="min-width:96px"></div><div class="sbar r"><i id="mma-rs"></i></div></div><div class="nm"><span id="mma-bn"></span><span id="mma-rn"></span></div><div class="st" id="mma-st"></div>';
    document.body.appendChild(d); this.hud = d;
    const b = document.createElement('button'); b.id = 'mma-end'; b.textContent = '✕ Ukončit zápas';
    b.addEventListener('click', (e) => { e.stopPropagation(); this.finish(); });
    document.body.appendChild(b); this.endBtn = b;
    if (!this.playAs) {
      const c = document.createElement('button'); c.id = 'mma-cam'; c.textContent = '🎥 Kamera arény (V)';
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
    G.toast?.(this.controlsText());
  }
  controlsText() { return '🥊 A/D pohyb · W skok · S kryt · F pěst (kombo) · G kop (+S nízký, +W výskokový) · Q salto (+vpřed salto kop) · O nůž'; }
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
    const tst = (L) => L.reduce((s2, f) => s2 + (f.st ?? 100), 0) / L.length;
    $('mma-bs').style.width = `${tst(this.blue)}%`; $('mma-rs').style.width = `${tst(this.red)}%`;
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
    // zpomalení při K.O. a krátké zastavení při silném zásahu
    if (this.slowMo > 0) { this.slowMo -= dt; dt *= 0.3; }
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    this.t += dt;
    const ph = this.phase;
    if (ph === 'walkBlue' || ph === 'walkRed') {
      const list = ph === 'walkBlue' ? this.blue : this.red;
      let done = true;
      for (const f of list) { if (this.walk(f, dt) === false) done = false; }
      for (const f of this.all) if (!list.includes(f) && f.m.visible) this.idle(f, dt);
      if (done) {
        if (ph === 'walkBlue') {
          this.phase = 'walkRed'; this.t = 0;
          if (this.team) this.say('red3', 'A v červeném rohu… tým vězňů!');
          else if (this.playAs) this.say('red_you', 'A v červeném rohu… vyzyvatel z oddílu K… TY!');
          else this.say('red', 'A v červeném rohu… vězeň Kladivo!');
        } else { this.phase = 'intro'; this.t = 0; this.say('rules', 'Pravidla znáte. Pěsti a kopy. Ťukněte si… a bojujte!'); }
      }
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
        if (f.act === 'ko') { this.place3(f); this.animF(f, dt); continue; }
        f.act = 'idle'; f.block = false;
        this.stepTo(f, f.corner[0], f.corner[1], 1.6, dt); f.hp = Math.min(100, f.hp + dt * 0.8);
      }
      if (this.t > REST_S) this.startRound(this.round + 1);
    } else if (ph === 'end') {
      for (const f of this.all) { f.yOff = 0; f.spin = 0; this.place3(f); if (f.act === 'ko') this.animF(f, dt); else if (f.team === this.winTeam) this.idle(f, dt, true); else { f.act = 'idle'; this.idle(f, dt); } }
      if (this.t > 16) this.finish();
    }
    this.refStep(dt);
    this.updateFans(dt);
    this.updateLights(dt);
    this.updateHud();
  }

  startRound(n) {
    this.round = n; this.clock = ROUND_S; this.phase = 'fight'; this.t = 0;
    for (const f of this.all) if (f.act !== 'ko') { f.act = 'idle'; f.move = null; f.yOff = 0; f.spin = 0; f.cool = 0.9 + Math.random() * 0.6; f.st = 100; f.downs = 0; }
    this.say(`r${n}`, n === 3 ? 'Třetí a poslední kolo!' : `${n}. kolo!`); this.bell(1);
    this.flash(`KOLO ${n}`, '#ffffff', null, true);
    setTimeout(() => { if (this.active && this.phase === 'fight') this.flash('FIGHT!', '#39ff14', null, true); }, 1300);
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
    if (f.pi === 0) f.y = gy; else if (f.pi === 1) { const t = 1 - Math.hypot(this.stairTop[0] - f.x, this.stairTop[1] - f.z) / 1.9; f.y = gy + DECK * Math.max(0, Math.min(1, t)); } else f.y = this.deckTop;
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    this.animF(f, dt, v);
    return false;
  }
  idle(f, dt, celebrate = false) {
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    if (celebrate) f.act = 'win';
    this.animF(f, dt, 0);
  }
  stepTo(f, tx, tz, v, dt) {
    const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const s = Math.min(d, v * dt); f.x += (dx / d) * s; f.z += (dz / d) * s; f.h = Math.atan2(dx, dz); }
    f.m.position.set(f.x, f.y, f.z); f.m.rotation.y = f.h;
    this.animF(f, dt, d > 0.1 ? v : 0);
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

  /* ================= bojový systém (pohled z boku, jako bojovky) ================= */
  /**
   * Tahy: clip = klip figuríny, pose = dopočítaný pohyb, dur = délka, imp = okamžik zásahu,
   * reach = dosah, dmg = poškození, st = výdrž, lvl = výška (low se nedá krýt horním krytem),
   * push = odhození, air = výskok (výška, posun), flip = salto (otočky, směr), kd = šance na knockdown.
   */
  static MOVES = {
    jab: { clip: 'Punch_Jab', speed: 1.7, dur: 0.34, imp: 0.13, reach: 1.25, dmg: 4, st: 5, lvl: 'high', push: 0.15 },
    cross: { clip: 'Punch_Cross', speed: 1.6, dur: 0.42, imp: 0.18, reach: 1.3, dmg: 7, st: 8, lvl: 'high', push: 0.25 },
    hook: { pose: 'hook', dur: 0.45, imp: 0.22, reach: 1.15, dmg: 9, st: 11, lvl: 'high', push: 0.35, kd: 0.08 },
    uppercut: { clip: 'Punch_Cross', speed: 1.2, pose: 'uppercut', dur: 0.5, imp: 0.24, reach: 1.05, dmg: 11, st: 13, lvl: 'high', push: 0.5, kd: 0.25, lift: 0.35 },
    lowKick: { pose: 'lowKick', dur: 0.48, imp: 0.24, reach: 1.45, dmg: 6, st: 9, lvl: 'low', push: 0.15 },
    frontKick: { pose: 'frontKick', dur: 0.55, imp: 0.27, reach: 1.6, dmg: 8, st: 12, lvl: 'mid', push: 1.1 },
    highKick: { pose: 'highKick', dur: 0.68, imp: 0.34, reach: 1.7, dmg: 13, st: 17, lvl: 'high', push: 0.6, kd: 0.3 },
    jumpKick: { clip: 'Jump_Loop', pose: 'jumpKick', dur: 0.8, imp: 0.42, reach: 1.55, dmg: 15, st: 20, lvl: 'high', push: 1.0, kd: 0.45, air: [1.1, 2.4] },
    flipKick: { clip: 'Jump_Loop', pose: 'tuck', dur: 0.9, imp: 0.72, reach: 1.5, dmg: 18, st: 24, lvl: 'high', push: 1.2, kd: 0.6, air: [1.5, 1.8], flip: 1 },
    jump: { clip: 'Jump_Loop', dur: 0.7, imp: 9, reach: 0, dmg: 0, st: 4, air: [1.0, 0.6] },
    salto: { clip: 'Jump_Loop', pose: 'tuck', dur: 0.85, imp: 9, reach: 0, dmg: 0, st: 12, air: [1.5, -2.2], flip: -1, dodge: true },
    roll: { clip: 'Roll', speed: 1.4, dur: 0.6, imp: 9, reach: 0, dmg: 0, st: 8, slide: -2.0, dodge: true },
    stab: { clip: 'Punch_Jab', speed: 1.5, dur: 0.38, imp: 0.15, reach: 1.25, dmg: 16, st: 6, lvl: 'mid', push: 0.2, blood: 1 },
  };
  static COMBO = ['jab', 'cross', 'hook', 'uppercut'];

  /** Animace figuríny / rozhodčího podle stavu. */
  animF(f, dt, speed = 0) {
    if (!f.rig) { animateHuman(f.m, speed, dt); return; }
    const R = f.rig, walking = this.phase === 'walkBlue' || this.phase === 'walkRed';
    const M = f.move ? MMA.MOVES[f.move] : null;
    if (f.act === 'ko') R.play('Death01', 0.12, 1.2);
    else if (f.act === 'down') R.play('Death01', 0.12, f.actT < 1.6 ? 1.4 : -1.2); // pád a zvednutí (klip pozpátku)
    else if (f.act === 'hit') R.play(f.hitHigh ? 'Hit_Head' : 'Hit_Chest', 0.06, 1.6);
    else if (f.act === 'win') R.play('Dance_Loop', 0.3);
    else if (f.act === 'attack' && M?.clip) R.play(M.clip, 0.05, M.speed || 1);
    else if (Math.abs(speed) > 2.2) R.play('Jog_Fwd_Loop', 0.15, Math.abs(speed) / 3);
    else if (Math.abs(speed) > 0.15) R.play('Walk_Loop', 0.15, Math.max(0.8, Math.abs(speed) / 1.3) * Math.sign(speed || 1));
    else R.play('Idle_Loop', 0.2);
    R.update(dt);
    // dopočítané pózy po klipu
    if (f.act === 'attack' && M?.pose) R.pose(M.pose, f.actT / M.dur);
    else if (f.act === 'win') R.pose('win', Math.min(1, this.t));
    else if (f.block) R.pose('block', 1);
    else if (!walking && f.act !== 'ko' && f.act !== 'down' && f.act !== 'hit') R.pose('guard', 1);
  }

  /** Jeden zápasník za snímek: hráč nebo AI. */
  fightStep(f, dt) {
    f.actT += dt; f.cool -= dt; f.comboT -= dt;
    if (f.act === 'ko') { this.place3(f); this.animF(f, dt); return; }
    const o = this.nearestFoe(f);
    // výdrž se doplňuje (rychleji, když neútočí)
    f.st = Math.min(100, f.st + dt * (f.act === 'attack' ? 4 : f.block ? 9 : 16));
    if (f.act === 'down') {
      if (f.actT > 2.6) { f.act = 'idle'; f.actT = 0; f.cool = 0.4; }
      this.place3(f); this.animF(f, dt); return;
    }
    if (!o) { f.act = 'win'; this.place3(f); this.animF(f, dt); return; }
    const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz) || 0.01, ux = dx / d, uz = dz / d;
    const face = Math.atan2(dx, dz);
    let mv = 0; // rychlost k soupeři (+) / od soupeře (−)
    // probíhající tah
    if (f.act === 'hit' && f.actT > 0.42) { f.act = 'idle'; f.actT = 0; }
    if (f.act === 'attack') {
      const M = MMA.MOVES[f.move], t = f.actT;
      if (M.air) { // výskok: oblouk a posun
        const p = Math.min(1, t / M.dur);
        f.yOff = Math.sin(p * Math.PI) * M.air[0];
        const step = (M.air[1] / M.dur) * dt; f.x += ux * step; f.z += uz * step;
        f.spin = M.flip ? M.flip * p * Math.PI * 2 : 0;
      }
      if (M.slide) { const step = (M.slide / M.dur) * dt; f.x += ux * step; f.z += uz * step; }
      if (!f.hitDone && t >= M.imp) { f.hitDone = true; this.resolve(f, o, f.move); }
      if (t >= M.dur) {
        f.act = 'idle'; f.actT = 0; f.yOff = 0; f.spin = 0;
        if (f.buf) { const b = f.buf; f.buf = null; this.startMove(f, b); }
      }
    }
    const free = f.act === 'idle';
    if (f === this.me) mv = this.playerInput(f, o, d, free, dt);
    else if (free || f.act === 'hit') mv = this.aiStep(f, o, d, free, dt);
    if (f.act === 'idle' || f.act === 'hit') {
      const sp = f.block ? mv * 0.45 : mv;
      f.x += ux * sp * dt; f.z += uz * sp * dt;
    }
    f.h += Math.atan2(Math.sin(face - f.h), Math.cos(face - f.h)) * Math.min(1, dt * 12);
    this.place3(f);
    this.animF(f, dt, f.act === 'idle' ? mv : 0);
  }
  place3(f) {
    f.m.position.set(f.x, f.y + (f.yOff || 0), f.z);
    f.m.rotation.set(0, f.h, 0);
    if (f.spin) { f.m.rotateX(f.spin); }
  }
  /** Zahájí tah (kontrola výdrže; při nízké výdrži slabší a pomalejší). */
  startMove(f, kind) {
    const M = MMA.MOVES[kind]; if (!M) return;
    f.weak = f.st < M.st;
    f.st = Math.max(0, f.st - M.st);
    f.move = kind; f.act = 'attack'; f.actT = 0; f.hitDone = false; f.block = false;
    f.cool = M.dur * (f.weak ? 1.25 : 1);
    if (M.clip) f.rig.play(M.clip, 0.05, M.speed || 1, true);
    if (M.air || M.flip) this.game.audio?.noise?.(0.12, 0.2, 900);
    else this.game.audio?.noise?.(0.05, 0.12, 1900);
  }
  /** Ovládání hráče (pohled z boku): A/D = vlevo/vpravo na obrazovce, W skok, S kryt, F pěst, G kop, Q salto, O nůž. */
  playerInput(f, o, d, free, dt) {
    const inp = this.game.input, a = inp.axes();
    // směr „k soupeři“ na obrazovce: soupeř je vpravo, když kamera vidí osu zleva doprava
    const sr = this.screenRight || { x: 1, z: 0 }, toward = Math.sign(((o.x - f.x) * sr.x + (o.z - f.z) * sr.z) || 1);
    const horiz = a.x * toward; // + = k soupeři
    const up = inp.down('KeyW', 'ArrowUp', 'Space') || a.y > 0.6, down = inp.down('KeyS', 'ArrowDown', 'ShiftLeft', 'ShiftRight') || a.y < -0.6;
    f.block = free && down && !inp.down('KeyG', 'KeyK');
    if (inp.hit('KeyO') && !this.knife) this.drawKnife(f);
    const punch = inp.hit('Mouse0') || inp.hit('KeyF') || inp.hit('KeyJ'), kick = inp.hit('KeyG') || inp.hit('KeyK') || inp.hit('Mouse2'), special = inp.hit('KeyQ') || inp.hit('KeyL');
    let want = null;
    if (punch) { if (this.knife) want = 'stab'; else { f.combo = f.comboT > 0 ? (f.combo + 1) % MMA.COMBO.length : 0; want = MMA.COMBO[f.combo]; f.comboT = 0.9; } }
    else if (kick) want = up ? 'jumpKick' : down ? 'lowKick' : horiz > 0.3 ? 'frontKick' : 'highKick';
    else if (special) want = horiz > 0.3 ? 'flipKick' : 'salto';
    else if (inp.hit('KeyW') || inp.hit('ArrowUp') || inp.hit('Space')) want = 'jump';
    // kop ve skoku = výskokový kop
    if (kick && f.act === 'attack' && f.move === 'jump') { f.move = 'jumpKick'; f.hitDone = false; f.actT = Math.min(f.actT, 0.3); return 0; }
    if (want) { if (free && f.cool <= 0) this.startMove(f, want); else if (f.act === 'attack' && !MMA.MOVES[f.move].air) f.buf = want; }
    return horiz * (Math.abs(horiz) > 0.1 ? 2.6 : 0);
  }
  /** AI: drží vzdálenost, útočí kombinacemi, kryje se, uhýbá saltem, občas výskokový kop. */
  aiStep(f, o, d, free, dt) {
    const A = f.ai, lvl = this.playAs ? 0.75 : 1; // proti hráči o chlup mírnější
    A.t -= dt;
    // reakce na útok soupeře: kryt / salto
    const threat = o.act === 'attack' && !o.hitDone && MMA.MOVES[o.move]?.dmg > 0 && d < 2.2;
    if (threat && free) {
      if (A.react == null) A.react = Math.random();
      if (A.react < 0.42 * lvl) f.block = true;
      else if (A.react > 0.93 && f.st > 20) { this.startMove(f, 'salto'); A.react = null; return 0; }
    } else { A.react = null; if (f.block && Math.random() < dt * 4) f.block = false; }
    if (!free || f.block) return d > 1.4 ? 0.8 : 0;
    // plán: přiblížit / držet / ustoupit
    if (A.t <= 0) { A.t = 0.6 + Math.random() * 1.2; A.strafe = Math.random() < 0.3 ? -1 : 1; }
    const tired = f.st < 25;
    let mv = 0;
    if (tired) mv = d < 2.2 ? -1.6 : 0; // vydýchat se
    else if (d > 1.45) mv = d > 3 ? 2.6 : 1.8;
    else if (d < 0.95) mv = -1.4;
    else mv = Math.sin(this.game.time * 2 + f.x) * 0.6 * A.strafe;
    if (f.cool <= 0 && !tired) {
      const r = Math.random();
      if (d > 2.0 && d < 3.0 && r < 0.03) this.startMove(f, 'jumpKick');
      else if (d < 1.5 && r < 0.04 * lvl + 0.02) {
        const pick = Math.random();
        if (pick < 0.45) { f.combo = 0; this.startMove(f, 'jab'); if (Math.random() < 0.7) f.buf = Math.random() < 0.6 ? 'cross' : 'hook'; }
        else if (pick < 0.6) this.startMove(f, 'lowKick');
        else if (pick < 0.75) this.startMove(f, 'highKick');
        else if (pick < 0.85) this.startMove(f, 'uppercut');
        else if (pick < 0.93) this.startMove(f, 'frontKick');
        else this.startMove(f, 'flipKick');
      }
    }
    return mv;
  }
  /** Vyhodnocení zásahu: dosah, směr, kryt (nízký kop krytem neprojde), salto = úhyb. */
  resolve(f, o, kind) {
    const M = MMA.MOVES[kind];
    if (!M.dmg || o.act === 'ko' || o.act === 'down') return;
    const dx = o.x - f.x, dz = o.z - f.z, d = Math.hypot(dx, dz);
    const facing = Math.cos(Math.atan2(dx, dz) - f.h) > 0.5;
    const dodging = o.act === 'attack' && MMA.MOVES[o.move]?.dodge;
    if (d > M.reach || !facing || dodging) { this.game.audio?.noise?.(0.05, 0.1, 1400); return; }
    const blocked = o.block && M.lvl !== 'low' && kind !== 'stab';
    let dmg = M.dmg * (0.85 + Math.random() * 0.3) * (f.weak ? 0.55 : 1);
    if (f === this.me) dmg *= 1.15; if (o === this.me) dmg *= 0.85; // hráč je o chlup silnější
    const ux = dx / (d || 1), uz = dz / (d || 1), G = this.game;
    if (blocked) {
      dmg *= 0.15; o.st = Math.max(0, o.st - M.st * 0.6);
      o.x += ux * M.push * 0.4; o.z += uz * M.push * 0.4;
      G.audio?.noise?.(0.06, 0.4, 700);
      o.hp -= dmg;
      this.flash('KRYT', '#7fd3ff', o);
      if (o.hp <= 0) this.ko(f, o);
      return;
    }
    o.hp -= dmg; f.landed++;
    o.act = 'hit'; o.actT = 0; o.move = null; o.buf = null; o.hitHigh = M.lvl === 'high'; o.yOff = 0; o.spin = 0; o.block = false;
    o.x += ux * M.push; o.z += uz * M.push;
    // zvuk, otřes, krátké zastavení (hit-stop), krev
    G.audio?.noise?.(0.09, M.dmg > 10 ? 1.0 : 0.75, M.dmg > 10 ? 220 : 330);
    G.audio?.blip?.(70, 0.09, 'square', 0.12, -30);
    this.hitStop = M.dmg >= 11 ? 0.11 : 0.05;
    this.shake = Math.max(this.shake || 0, M.dmg / 40);
    if (M.blood || Math.random() < 0.35 + M.dmg / 40) {
      G.weapons?.bleed(new THREE.Vector3(o.x, o.y + (M.lvl === 'low' ? 0.6 : M.lvl === 'mid' ? 1.15 : 1.6), o.z), new THREE.Vector3(ux, 0, uz), M.blood ? 14 : 4 + M.dmg / 3);
      if (M.blood || Math.random() < 0.25) this.bloodPool(o.x + ux * 0.3, o.z + uz * 0.3, M.blood ? 0.55 : 0.3);
    }
    if (kind === 'stab') this.status = '🔪 Vězeň podvádí! Nůž v kleci!';
    this.hype = 1;
    if (M.dmg >= 13) this.flash(kind === 'flipKick' ? 'SALTO KOP!' : kind === 'jumpKick' ? 'VÝSKOKOVÝ KOP!' : 'ZÁSAH!', '#ffe14a', o);
    if (o.hp <= 0) { this.ko(f, o); return; }
    // knockdown: silná rána na unaveného / zraněného
    if (M.kd && Math.random() < M.kd * (o.hp < 40 ? 1.6 : 0.6)) {
      o.act = 'down'; o.actT = 0; o.downs++;
      this.flash('KNOCKDOWN!', '#ff5a3a', o);
      G.audio?.crash?.(12);
      if (o.downs >= 3) { o.hp = 0; this.ko(f, o, 'TKO'); }
    }
  }
  /** Velký nápis přes obrazovku (KOLO, FIGHT, K.O., ZÁSAH…). */
  flash(text, color = '#fff', who = null, big = false) {
    let el = document.getElementById('mma-flash');
    if (!el) {
      el = document.createElement('div'); el.id = 'mma-flash';
      el.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:42;pointer-events:none;font:400 64px "Bungee",sans-serif;text-align:center;text-shadow:0 4px 0 #000,0 0 24px rgba(0,0,0,.6);white-space:nowrap';
      document.body.appendChild(el);
    }
    if (!big && who && who !== this.me && this.me && who.team === this.me.team) return; // drobné nápisy jen u hráčova soupeře
    el.textContent = text; el.style.color = color; el.style.fontSize = big ? 'min(14vw,120px)' : 'min(9vw,54px)';
    el.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(2.2)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.18 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }], { duration: big ? 1600 : 900, easing: 'ease-out', fill: 'forwards' });
  }
  bloodPool(x, z, r) {
    this.poolM ||= new THREE.MeshBasicMaterial({ color: '#6a0a0a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const m = new THREE.Mesh(new THREE.CircleGeometry(r * (0.7 + Math.random() * 0.6), 12), this.poolM);
    m.rotation.x = -Math.PI / 2; m.position.set(x, this.deckTop + 0.012, z);
    this.group.add(m); this.pools.push(m);
  }
  drawKnife(f) {
    const k = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.26), new THREE.MeshStandardMaterial({ color: '#d9dde0', metalness: 0.9, roughness: 0.2 }));
    blade.position.z = 0.16;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.11), new THREE.MeshStandardMaterial({ color: '#222' }));
    k.add(blade, handle);
    const hb = f.rig?.bones.hand_r;
    if (hb) { f.m.updateMatrixWorld(true); const ws = new THREE.Vector3(); hb.getWorldScale(ws); const sc = 1 / (ws.x || 1); hb.add(k); k.scale.setScalar(sc); }
    else { k.position.set(0.3, 1.1, 0.3); f.m.add(k); }
    this.knife = k;
    this.game.toast?.('🔪 Vytáhl jsi nůž! F = bodnout');
    this.say('knife', 'Sakra! On má nůž!');
    this.status = '🔪 Sakra, on má nůž!';
    this.hype = 1;
    this.game.prisonFx?.bark?.();
  }
  updateKnife() { /* nůž drží pravá ruka */ }
  updateAnim(f, dt) { this.animF(f, dt); }
  ko(w, l, kind = 'K.O.') {
    l.hp = 0; l.act = 'ko'; l.actT = 0; l.yOff = 0; l.spin = 0; l.block = false;
    this.game.audio?.crash?.(18);
    this.slowMo = 1.6; // zpomalený záběr
    const foes = this.alive(l.team === 'blue' ? this.blue : this.red);
    if (foes.length) { this.status = `${l.name} je ${kind}!`; this.flash(kind + '!', '#ff3b30', null, true); this.hype = 1; return; }
    this.winTeam = w.team; this.phase = 'end'; this.t = 0;
    const guards = w.team === 'blue';
    this.say(guards ? 'ko_guard' : 'ko_con', `${kind}! Vítězí ${guards ? (this.team ? 'bachaři' : 'bachař Novák') : this.playAs ? 'TY – vězeň z oddílu K' : this.team ? 'vězni' : 'vězeň Kladivo'}!`);
    this.bell(3); this.hype = 1;
    this.flash(kind + '!', '#ff3b30', null, true);
    this.game.hud?.bigMsg?.(kind + '!', `Vítězí ${guards ? 'bachaři' : this.playAs ? 'TY' : 'vězni'} v ${this.round}. kole`);
  }
  decision() {
    const sb = this.blue.reduce((s, f) => s + f.landed + Math.max(0, f.hp) * 0.05, 0), sr = this.red.reduce((s, f) => s + f.landed + Math.max(0, f.hp) * 0.05, 0);
    this.winTeam = sb >= sr ? 'blue' : 'red'; this.phase = 'end'; this.t = 0;
    for (const f of this.all) if (f.act !== 'ko') { f.act = 'idle'; f.move = null; f.yOff = 0; f.spin = 0; }
    const guards = this.winTeam === 'blue';
    this.say(guards ? 'dec_guard' : 'dec_con', `Po třech kolech vítězí na body ${guards ? 'bachaři' : this.playAs ? 'TY' : 'vězni'}!`);
    this.bell(3);
    this.flash('NA BODY', '#ffe14a', null, true);
    this.game.hud?.bigMsg?.('NA BODY', `Vítězí ${guards ? 'bachaři' : this.playAs ? 'TY' : 'vězni'}`);
  }

  refStep(dt) {
    const r = this.ref;
    r.y = this.deckTop;
    if (this.phase === 'fight' || this.phase === 'rest') {
      const L = this.alive(this.all);
      let mx = C.x, mz = C.z;
      if (L.length) { mx = L.reduce((s, f) => s + f.x, 0) / L.length; mz = L.reduce((s, f) => s + f.z, 0) / L.length; }
      // drží se 2,3 m stranou od středu dění – na opačné straně než kamera (nezakrývá souboj)
      let ax = r.x - mx, az = r.z - mz;
      if (this.camP && (this.cinematic || this.playAs)) { ax = mx - this.camP.x; az = mz - this.camP.z; }
      const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
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
    } else { r.m.position.set(r.x, r.y, r.z); r.m.rotation.y = r.h; animateHuman(r.m, 0, dt); }
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

  /**
   * Kamera: nástup = před zápasníky; zápas = z boku na dvojici (jako bojovky), kolmo na spojnici,
   * vzdálenost podle rozestupu; 3 na 3 při sledování krouží kolem klece.
   */
  camera(cam, dt) {
    let tx, ty, tz, px, py, pz;
    const walking = this.phase === 'walkBlue' || this.phase === 'walkRed';
    let a = null, b = null;
    if (!walking) {
      if (this.me) { a = this.me; b = this.nearestFoe(this.me) || this.blue.find((q) => q.act !== 'ko') || this.blue[0]; }
      else if (!this.team) { a = this.red[0]; b = this.blue[0]; }
    }
    if (walking) {
      const list = this.phase === 'walkBlue' ? this.blue : this.red, f = list.find((q) => q.m.visible && q.pi < q.path.length) || list[0];
      tx = f.x; ty = f.y + 1.4; tz = f.z;
      px = f.x + Math.sin(f.h) * 4.8; pz = f.z + Math.cos(f.h) * 4.8; py = f.y + 2.3;
    } else if (a && b) {
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, dx = b.x - a.x, dz = b.z - a.z, sep = Math.hypot(dx, dz) || 1;
      let nx = -dz / sep, nz = dx / sep;
      // strana kamery: ta, kde už je (aby nepřeskakovala), jinak blíž ke středu klece
      const prev = this.camP || new THREE.Vector3(mx + nx, 0, mz + nz);
      if ((prev.x - mx) * nx + (prev.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
      const dist = 3.0 + sep * 0.6;
      tx = mx; tz = mz; ty = this.deckTop + 1.05 + Math.max(a.yOff || 0, b.yOff || 0) * 0.4;
      px = mx + nx * dist; pz = mz + nz * dist; py = this.deckTop + 1.55;
      // vektor „vpravo na obrazovce“ pro ovládání A/D
      this.screenRight = { x: -nz, z: nx };
    } else {
      const L = this.alive(this.all).length ? this.alive(this.all) : this.all;
      tx = L.reduce((s2, f) => s2 + f.x, 0) / L.length; tz = L.reduce((s2, f) => s2 + f.z, 0) / L.length; ty = this.deckTop + 1.2;
      const ang = this.game.time * 0.12;
      px = C.x + Math.cos(ang) * 10.5; pz = C.z + Math.sin(ang) * 10.5; py = this.gy + 5.5;
    }
    this.camP ||= new THREE.Vector3(px, py, pz);
    this.camP.lerp(new THREE.Vector3(px, py, pz), Math.min(1, dt * 4));
    cam.position.copy(this.camP);
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake * 0.25; cam.position.y += (Math.random() - 0.5) * this.shake * 0.25; this.shake = Math.max(0, this.shake - dt * 3); }
    cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz);
    // stěny klece mezi kamerou a zápasníky schovat (jinak zakrývají souboj)
    const cx = cam.position.x - C.x, cz = cam.position.z - C.z, cl = Math.hypot(cx, cz) || 1, outside = cl > R * 0.75 && cam.position.y < this.deckTop + 3;
    for (const c of this.cage || []) {
      const px2 = c.cx - C.x, pz2 = c.cz - C.z, pl = Math.hypot(px2, pz2) || 1;
      const hide = outside && (px2 * cx + pz2 * cz) / (pl * cl) > 0.72;
      for (const m of c.meshes) m.visible = !hide;
    }
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
    for (const f of [...(this.all || []), this.ref]) if (f) G.scene.remove(f.m);
    document.getElementById('mma-flash')?.remove();
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
