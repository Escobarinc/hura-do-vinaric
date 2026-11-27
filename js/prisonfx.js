/*
 * Věznice Vinařice – vylepšení vzhledu a života v areálu:
 *  - ostrý povrch (asfalt / beton / tráva podle ortofota, spáry, praskliny, kanály, štěrk u zdí, žlutá čára u plotu),
 *  - noc: reflektory na strážních věžích kmitají po areálu, světelné kužely lamp na zemi,
 *  - ostraha: kamery na zdech a budovách, výstražné cedule na plotech, psovod se psem, hlídka dozorců,
 *  - dvory: fotbal, cvičení na hrazdách, kuřáci u přístřešků, vězni chodí po oválech,
 *  - zvuky: hlášení z rozhlasu, štěkot, vysílačky, klapnutí brány,
 *  - detaily budov: plechové dveře se stříškou u vchodů, okapové svody, technika na plochých střechách,
 *  - efekty: mokro po hašení.
 * Souřadnice světa: x = východ, z = jih.
 */
import * as THREE from 'three';
import { Crowd } from './crowd.js?v=20261127192302';
import { makeHuman, animateHuman } from './entities.js?v=20261127192302';
import { labelTexture } from './textures.js?v=20261127192302';
import { BACKYARD } from './world.js?v=20261127192302';
import { pointInPoly } from './util.js?v=20261127192302';

const AREA = { x0: -462, x1: -42, z0: 988, z1: 1236 }; // obdélník kolem areálu
const DOORS = [ // vchody, odkud vychází oddíly (plechové dveře se stříškou)
  [-174.5, 1046], [-174.5, 1068], [-156, 1094], [-238, 1050.5], [-360, 1065.6], [-350.8, 1116], [-295, 1057.4], [-212.2, 1081], [-233, 1083.7],
];
const UNIFORM = { shirt: '#3f4f63', pants: '#34404f' };

function glow(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PrisonFX {
  constructor(game) {
    this.game = game;
    this.city = game.city; this.scene = game.scene; this.world = game.world;
    if (!this.city.prison) return;
    this.G = (x, z) => this.city.ground(x, z);
    this.t = 0;
    this.lightPool = glow('rgba(255,236,190,.9)', 'rgba(255,220,160,.35)');
    try { this.buildGround(); } catch (e) { console.warn('povrch věznice', e); }
    this.buildNight();
    this.buildSecurity();
    this.buildDetails();
    this.buildYardLife();
    this.buildPatrols();
    this.world.prisonFx = this;
  }

  /* ---------------- ostrý povrch ---------------- */
  buildGround() {
    const ortho = this.world.ortho;
    if (!ortho || !ortho[2]?.image) return;
    const img = ortho[2].image, S = img.width; // díl x∈[-1600,0], z∈[0,1600]
    const { x0, x1, z0, z1 } = AREA, W = x1 - x0, H = z1 - z0;
    const sx = ((x0 + 1600) / 1600) * S, sy = (z0 / 1600) * S, sw = (W / 1600) * S, sh = (H / 1600) * S;
    const src = document.createElement('canvas'); src.width = Math.round(sw); src.height = Math.round(sh);
    const sg = src.getContext('2d', { willReadFrequently: true });
    sg.drawImage(img, sx, sy, sw, sh, 0, 0, src.width, src.height);
    const sd = sg.getImageData(0, 0, src.width, src.height).data;
    const OW = 2048, OH = Math.round((2048 * H) / W), px = OW / W;
    const out = document.createElement('canvas'); out.width = OW; out.height = OH;
    const og = out.getContext('2d');
    const id = og.createImageData(OW, OH), d = id.data;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < OH; y++) {
      const syy = Math.min(src.height - 1, Math.floor((y / OH) * src.height));
      for (let x = 0; x < OW; x++) {
        const sxx = Math.min(src.width - 1, Math.floor((x / OW) * src.width)), k = (syy * src.width + sxx) * 4;
        const r = sd[k], g = sd[k + 1], b = sd[k + 2], lum = r * 0.3 + g * 0.59 + b * 0.11;
        let R, Gc, B;
        const n = (rnd() - 0.5) * 22;
        if (g > r + 6 && g > b + 3 && lum < 175) { R = 92 + n * 0.6; Gc = 120 + n; B = 70 + n * 0.5; } // tráva
        else if (lum < 112) { R = Gc = B = 88 + n * 0.8 + lum * 0.12; } // asfalt
        else { const c = 158 + n * 0.7 + (lum - 140) * 0.18; R = c; Gc = c - 2; B = c - 6; } // beton
        const o = (y * OW + x) * 4;
        d[o] = R; d[o + 1] = Gc; d[o + 2] = B; d[o + 3] = 255;
      }
    }
    og.putImageData(id, 0, 0);
    const P = (wx, wz) => [(wx - x0) * px, (wz - z0) * px];
    // zadní trojúhelník (psinec): čistý beton a trávníky podle ortofota místo zrnitého rozpoznání z barev
    {
      const poly = (pts, fill) => { og.fillStyle = fill; og.beginPath(); pts.forEach((q, i) => (i ? og.lineTo(...P(q[0], q[1])) : og.moveTo(...P(q[0], q[1])))); og.closePath(); og.fill(); };
      poly(BACKYARD.tri, '#a8a69f');
      for (const l of BACKYARD.lawns) poly(l, '#66884a');
      og.save(); og.beginPath(); BACKYARD.tri.forEach((q, i) => (i ? og.lineTo(...P(q[0], q[1])) : og.moveTo(...P(q[0], q[1])))); og.closePath(); og.clip();
      for (let i = 0; i < 9000; i++) { // zrno betonu a trávy
        const xx = rnd() * OW, yy = rnd() * OH; og.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,36' : '255,255,250'},${(rnd() * 0.12).toFixed(3)})`; og.fillRect(xx, yy, 2, 2);
      }
      og.restore();
    }
    // spáry betonových desek (po 4 m) a praskliny
    og.strokeStyle = 'rgba(40,38,34,.22)'; og.lineWidth = 1.2;
    for (let wx = Math.ceil(x0 / 4) * 4; wx < x1; wx += 4) { og.beginPath(); og.moveTo(...P(wx, z0)); og.lineTo(...P(wx, z1)); og.stroke(); }
    for (let wz = Math.ceil(z0 / 4) * 4; wz < z1; wz += 4) { og.beginPath(); og.moveTo(...P(x0, wz)); og.lineTo(...P(x1, wz)); og.stroke(); }
    og.strokeStyle = 'rgba(30,28,25,.45)'; og.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      let [cx, cz] = [x0 + rnd() * W, z0 + rnd() * H];
      og.beginPath(); og.moveTo(...P(cx, cz));
      for (let k = 0; k < 5; k++) { cx += (rnd() - 0.5) * 2.4; cz += (rnd() - 0.5) * 2.4; og.lineTo(...P(cx, cz)); }
      og.stroke();
    }
    // olejové skvrny (autopark, garáže) a kanálové poklopy
    for (let i = 0; i < 40; i++) {
      const [cx, cz] = P(-260 + (rnd() - 0.5) * 70, 1170 + (rnd() - 0.5) * 40), rr = (0.6 + rnd() * 1.4) * px;
      const gr = og.createRadialGradient(cx, cz, 0, cx, cz, rr); gr.addColorStop(0, 'rgba(20,18,16,.45)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
      og.fillStyle = gr; og.beginPath(); og.arc(cx, cz, rr, 0, 7); og.fill();
    }
    for (let i = 0; i < 34; i++) {
      const [cx, cz] = P(x0 + 20 + rnd() * (W - 40), z0 + 20 + rnd() * (H - 40));
      og.fillStyle = '#3a3936'; og.beginPath(); og.arc(cx, cz, 0.35 * px, 0, 7); og.fill();
      og.strokeStyle = '#555'; og.lineWidth = 2; og.stroke();
    }
    // štěrkový pás podél zdí a žlutá výstražná čára u vnitřních plotů
    const per = this.world.prisonPerimeter || {};
    const line = (pts, w, col, dash = null) => {
      og.strokeStyle = col; og.lineWidth = w * px; og.lineCap = 'round'; og.setLineDash(dash ? dash.map((v) => v * px) : []);
      og.beginPath(); pts.forEach((q, i) => (i ? og.lineTo(...P(q[0], q[1])) : og.moveTo(...P(q[0], q[1])))); og.stroke();
    };
    for (const w of [...(per.walls || []), ...(per.innerWalls || [])]) line(w, 2.2, 'rgba(176,170,158,.95)');
    og.setLineDash([]);
    for (const f of per.innerFences || []) line(f, 0.18, 'rgba(232,196,40,.9)', [1.2, 0.8]);
    og.setLineDash([]);
    // jen uvnitř obvodu areálu
    const mask = document.createElement('canvas'); mask.width = OW; mask.height = OH;
    const mg = mask.getContext('2d');
    mg.beginPath();
    const pr = this.city.prison;
    for (let i = 0; i < pr.length; i += 2) (i ? mg.lineTo : mg.moveTo).call(mg, ...P(pr[i], pr[i + 1]));
    mg.closePath(); mg.clip();
    mg.drawImage(out, 0, 0);
    const tex = new THREE.CanvasTexture(mask);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, this.G(-250, 1100) + 0.03, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /* ---------------- noc: reflektory a světlo lamp ---------------- */
  buildNight() {
    this.search = [];
    const beamMat = () => new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    (this.world.prisonTowers || []).forEach(([x, z], k) => {
      const y = this.G(x, z) + 10.3;
      const L = new THREE.SpotLight('#fff4d6', 0, 170, 0.16, 0.55, 1.2);
      L.position.set(x, y, z);
      L.target.position.set(x, this.G(x, z), z + 20);
      this.scene.add(L, L.target);
      const geo = new THREE.CylinderGeometry(0.15, 5.5, 1, 20, 1, true); geo.translate(0, -0.5, 0);
      const beam = new THREE.Mesh(geo, beamMat());
      this.scene.add(beam);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ map: this.lightPool, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      spot.rotation.x = -Math.PI / 2;
      this.scene.add(spot);
      this.search.push({ L, beam, spot, x, y, z, ph: k * 1.7, sp: 0.18 + k * 0.03 });
    });
    this.pools = [];
    for (const [x, z] of this.world.prisonMasts || []) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(10, 24), new THREE.MeshBasicMaterial({ map: this.lightPool, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, this.G(x, z) + 0.08, z);
      this.scene.add(m); this.pools.push(m);
    }
  }
  updateNight(dt, t, night) {
    const cx = -255, cz = 1095;
    for (const s of this.search) {
      // reflektor kmitá po areálu (ležatá osmička kolem středu)
      const a = t * s.sp + s.ph;
      const tx = cx + Math.sin(a) * 150, tz = cz + Math.sin(a * 2) * 55;
      const ty = this.G(tx, tz);
      s.L.target.position.set(tx, ty, tz);
      s.L.intensity = night * 900;
      const dx = tx - s.x, dy = ty - s.y, dz = tz - s.z, len = Math.hypot(dx, dy, dz);
      s.beam.position.set(s.x, s.y, s.z);
      s.beam.scale.set(1, len, 1);
      s.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());
      s.beam.material.opacity = night * 0.09;
      s.beam.visible = s.spot.visible = night > 0.05;
      s.spot.position.set(tx, ty + 0.1, tz);
      s.spot.material.opacity = night * 0.7;
    }
    for (const m of this.pools) { m.material.opacity = night * 0.55; m.visible = night > 0.05; }
  }

  /* ---------------- ostraha: kamery, cedule ---------------- */
  buildSecurity() {
    const per = this.world.prisonPerimeter || {};
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2e31', metalness: 0.5, roughness: 0.5 });
    const camM = new THREE.MeshStandardMaterial({ color: '#e9e9e6', roughness: 0.5 });
    this.leds = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
    const cams = [];
    const along = (pts, step, fn) => {
      let acc = step / 2;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
        for (; acc < L; acc += step) fn(ax + ((bx - ax) * acc) / L, az + ((bz - az) * acc) / L, (bx - ax) / L, (bz - az) / L);
        acc -= L;
      }
    };
    // kamery na zdech (dívají se dovnitř)
    for (const w of [...(per.walls || []), ...(per.innerWalls || [])]) along(w, 45, (x, z, ux, uz) => {
      let nx = -uz, nz = ux;
      if (!pointInPoly(x + nx * 3, z + nz * 3, this.city.prison)) { nx = -nx; nz = -nz; }
      cams.push([x, this.G(x, z) + 5.6, z, Math.atan2(nx, nz)]);
    });
    // kamery na rozích budov
    for (const b of this.city.buildings) {
      if (!b.inPrison || !b.pb) continue;
      const p = b.p;
      cams.push([p[0], b.h - 0.8, p[1], Math.atan2(b.cx - p[0], b.cz - p[1]) + Math.PI]);
    }
    for (const [x, y, z, h] of cams) {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), dark); arm.position.set(0, 0, 0.25);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.42), camM); body.position.set(0, -0.08, 0.55); body.rotation.x = 0.35;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), this.leds); led.position.set(0.07, -0.02, 0.76);
      g.add(arm, body, led);
      g.position.set(x, y, z); g.rotation.y = h;
      this.scene.add(g);
    }
    // výstražné cedule na plotech
    const signM = new THREE.MeshStandardMaterial({ map: labelTexture('ZAKÁZANÝ PROSTOR', '#f2c200', '#111111', 512, 112), roughness: 0.6, side: THREE.DoubleSide });
    for (const f of [...(per.innerFences || []), ...(per.fences || [])]) along(f, 60, (x, z, ux, uz) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), signM);
      m.position.set(x - uz * 0.08, this.G(x, z) + 1.6, z + ux * 0.08);
      m.rotation.y = Math.atan2(-uz, ux) + Math.PI / 2;
      this.scene.add(m);
    });
  }

  /* ---------------- detaily budov ---------------- */
  buildDetails() {
    const prisonB = this.city.buildings.filter((b) => b.inPrison && b.pb);
    // plechové dveře se stříškou u vchodů oddílů
    const steel = new THREE.MeshStandardMaterial({ color: '#8e979c', metalness: 0.5, roughness: 0.45 });
    const frameM = new THREE.MeshStandardMaterial({ color: '#4c5257', metalness: 0.4, roughness: 0.5 });
    const canopyM = new THREE.MeshStandardMaterial({ color: '#b9bcbc', metalness: 0.3, roughness: 0.6 });
    for (const [px, pz] of DOORS) {
      let best = null;
      for (const b of prisonB) {
        const p = b.p, n = p.length / 2;
        for (let i = 0; i < n; i++) {
          const ax = p[i * 2], az = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], bz = p[((i + 1) % n) * 2 + 1];
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0.08, Math.min(0.92, ((px - ax) * dx + (pz - az) * dz) / l2));
          const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(px - qx, pz - qz);
          if (!best || d < best.d) best = { d, qx, qz, dx, dz, b };
        }
      }
      if (!best || best.d > 6) continue;
      const L = Math.hypot(best.dx, best.dz);
      let nx = best.dz / L, nz = -best.dx / L;
      if (pointInPoly(best.qx + nx * 0.5, best.qz + nz * 0.5, best.b.p)) { nx = -nx; nz = -nz; }
      const g = new THREE.Group();
      const fr = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.45, 0.1), frameM); fr.position.y = 1.22;
      const lf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.3, 0.08), steel); lf.position.set(0, 1.15, 0.05);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), frameM); hd.position.set(0.1, 1.05, 0.12);
      const cp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.3), canopyM); cp.position.set(0, 2.75, 0.6); cp.rotation.x = -0.08;
      g.add(fr, lf, hd, cp);
      g.position.set(best.qx + nx * 0.06, this.G(best.qx, best.qz), best.qz + nz * 0.06);
      g.rotation.y = Math.atan2(nx, nz);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.scene.add(g);
    }
    // okapové svody na rozích a technika na plochých střechách (instance)
    const pipes = [], units = [];
    for (const b of prisonB) {
      const p = b.p, n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], bz = p[((i + 1) % n) * 2 + 1];
        if (Math.hypot(bx - ax, bz - az) < 6) continue;
        pipes.push([ax + (b.cx - ax) * 0.004, b.g, az + (b.cz - az) * 0.004, Math.max(2, (b.roofM?.eave || b.h) - b.g)]);
      }
      if (b.pb.flat || b.r === 'flat') {
        for (let k = 0, tries = 0; k < 3 && tries < 40; tries++) {
          const x = b.minx + Math.random() * (b.maxx - b.minx), z = b.minz + Math.random() * (b.maxz - b.minz);
          if (pointInPoly(x, z, p)) { units.push([x, b.h, z, Math.random() * 6]); k++; }
        }
      }
    }
    const pipeIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), new THREE.MeshStandardMaterial({ color: '#7d8287', metalness: 0.5, roughness: 0.5 }), pipes.length);
    const unitIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), new THREE.MeshStandardMaterial({ color: '#c9cbc9', metalness: 0.3, roughness: 0.6 }), units.length);
    const o = new THREE.Object3D();
    pipes.forEach(([x, y, z, h], i) => { o.position.set(x, y + h / 2, z); o.scale.set(1, h, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); pipeIM.setMatrixAt(i, o.matrix); });
    units.forEach(([x, y, z, r], i) => { o.position.set(x, y + 0.45, z); o.scale.set(1, 1, 1); o.rotation.set(0, r, 0); o.updateMatrix(); unitIM.setMatrixAt(i, o.matrix); });
    unitIM.castShadow = true;
    this.scene.add(pipeIM, unitIM);
  }

  /* ---------------- život na dvorech ---------------- */
  buildYardLife() {
    const frames = this.city.yardFrames || [];
    this.yardCrowd = new Crowd(this.scene, { capacity: 64, shirt: UNIFORM.shirt, pants: UNIFORM.pants });
    this.actors = [];
    let id = 0;
    const court = frames.find((f) => f.type === 'court'), gym = frames.find((f) => f.type === 'gym');
    const ovals = frames.filter((f) => f.type === 'track');
    if (court) {
      // fotbal 5 na 5, dresy oranžové a modré
      this.ball = { lx: 0, lz: 0, vx: 0, vz: 0, f: court, mesh: new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 })) };
      this.ball.mesh.castShadow = true;
      this.scene.add(this.ball.mesh);
      for (let k = 0; k < 10; k++) {
        const team = k < 5 ? 0 : 1;
        this.yardCrowd.setShirt(id, team ? '#2c5fb8' : '#e07a1f');
        this.actors.push({ id: id++, kind: 'ball', team, f: court, lx: (team ? 1 : -1) * (2 + Math.random() * 8), lz: (Math.random() - 0.5) * 8, role: (k % 5) / 4 - 0.5 });
      }
    }
    if (gym) {
      for (const [lx, lz] of [[-gym.W / 2 + 4, -3.5], [-gym.W / 2 + 8, -3.5], [gym.W / 2 - 6, 3.5]]) this.actors.push({ id: id++, kind: 'pullup', f: gym, lx, lz, ph: Math.random() * 6 });
      for (let k = 0; k < 4; k++) this.actors.push({ id: id++, kind: 'idle', f: gym, lx: (Math.random() - 0.5) * gym.W * 0.6, lz: (Math.random() - 0.5) * gym.H * 0.5, h: Math.random() * 6 });
    }
    // telefonují: u každého automatu jeden odsouzený (ruka u ucha)
    for (const ph of this.city.phones || []) this.actors.push({ id: id++, kind: 'phone', x: ph.x, z: ph.z, h: ph.h });
    // kotce u budovy K: pár odsouzených z „díry“ chodí sem a tam
    const pens = this.city.kPens || [];
    const inPen = (pen) => { // náhodný bod uvnitř mnohoúhelníku (trojúhelníky od prvního vrcholu)
      const tris = []; for (let i = 1; i + 1 < pen.length; i++) tris.push([pen[0], pen[i], pen[i + 1]]);
      const [a, b, c] = tris[Math.floor(Math.random() * tris.length)];
      let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const x = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, z = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
      // kousek dovnitř k těžišti, ať nechodí po zdi
      const gx = pen.reduce((s2, q) => s2 + q[0], 0) / pen.length, gz = pen.reduce((s2, q) => s2 + q[1], 0) / pen.length;
      return [x + (gx - x) * 0.25, z + (gz - z) * 0.25];
    };
    this.penPoint = inPen;
    [[0, 1], [1, 1], [2, 2]].forEach(([pi, n]) => { const pen = pens[pi]; if (!pen) return; for (let k = 0; k < n; k++) { const [x, z] = inPen(pen); this.actors.push({ id: id++, kind: 'pen', pen, x, z, t: inPen(pen), h: 0, wait: Math.random() * 3 }); } });
    // psi ve výbězích psince
    this.kennelDogs = (this.city.dogRuns || []).map((r) => { const m = this.makeDog(); const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2; m.position.set(x, r.y, z); return { m, r, x, z, tx: x, tz: z, wait: Math.random() * 4, ph: Math.random() * 6 }; });
    for (const f of ovals) {
      for (let k = 0; k < 7; k++) this.actors.push({ id: id++, kind: 'oval', f, a: (k / 7) * Math.PI * 2, sp: 0.9 + Math.random() * 0.4 });
      // kuřáci u přístřešků
      for (const [hx, hz] of f.huts) for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.random();
        this.actors.push({ id: id++, kind: 'smoke', x: hx + Math.cos(a) * 1.2, z: hz + Math.sin(a) * 1.2, h: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      }
    }
  }
  updateYardLife(dt, t, day, near) {
    const C = this.yardCrowd, G = this.G;
    if (!near || !day) { if (this.yardOn) { C.hideAll(); if (this.ball) this.ball.mesh.visible = false; this.yardOn = false; } return; }
    this.yardOn = true;
    const B = this.ball;
    if (B) {
      const f = B.f, hw = f.W / 2 - 0.8, hh = f.H / 2 - 0.8;
      B.lx += B.vx * dt; B.lz += B.vz * dt; B.vx *= 1 - dt * 0.9; B.vz *= 1 - dt * 0.9;
      if (Math.abs(B.lx) > hw) { B.lx = Math.sign(B.lx) * hw; B.vx *= -0.6; }
      if (Math.abs(B.lz) > hh) { B.lz = Math.sign(B.lz) * hh; B.vz *= -0.6; }
      const [bx, bz] = f.L(B.lx, B.lz);
      B.mesh.visible = true;
      B.mesh.position.set(bx, G(bx, bz) + 0.12, bz);
      B.mesh.rotation.x += B.vx * dt * 3; B.mesh.rotation.z -= B.vz * dt * 3;
    }
    for (const a of this.actors) {
      if (C.dead[a.id]) continue;
      if (a.kind === 'ball') {
        // hráč běží k míči (každý trochu jinam podle pozice), nejbližší kope na branku soupeře
        const tx = B.lx + (a.team ? 1.5 : -1.5) + a.role * 3, tz = B.lz + a.role * 5;
        const dx = tx - a.lx, dz = tz - a.lz, d = Math.hypot(dx, dz);
        const v = d > 0.4 ? Math.min(5, d * 1.5) : 0;
        if (d > 0.01) { a.lx += (dx / d) * v * dt; a.lz += (dz / d) * v * dt; a.h = Math.atan2(dx, dz); }
        if (Math.hypot(B.lx - a.lx, B.lz - a.lz) < 0.7 && Math.hypot(B.vx, B.vz) < 3) {
          const gx = (a.team ? -1 : 1) * (B.f.W / 2), gz = (Math.random() - 0.5) * 3;
          const kx = gx - B.lx, kz = gz - B.lz, kd = Math.hypot(kx, kz) || 1, power = 6 + Math.random() * 8;
          B.vx = (kx / kd) * power; B.vz = (kz / kd) * power;
          if (Math.abs(B.lx - gx) < 2) { B.lx = 0; B.lz = 0; B.vx = B.vz = 0; } // gól – míč na střed
        }
        const [x, z] = a.f.L(a.lx, a.lz);
        const hw = Math.atan2(a.f.ux * Math.sin(a.h) + a.f.vx * Math.cos(a.h), a.f.uz * Math.sin(a.h) + a.f.vz * Math.cos(a.h));
        C.set(a.id, x, G(x, z), z, hw, v, 'walk', t);
      } else if (a.kind === 'pullup') {
        const [x, z] = a.f.L(a.lx, a.lz), up = Math.max(0, Math.sin(t * 2.2 + a.ph)) * 0.45;
        C.set(a.id, x, G(x, z) + 0.15 + up, z, Math.atan2(a.f.vx, a.f.vz), 0, 'hang', t);
      } else if (a.kind === 'idle') {
        const [x, z] = a.f.L(a.lx, a.lz);
        C.set(a.id, x, G(x, z), z, a.h, 0, 'walk', t);
      } else if (a.kind === 'oval') {
        const f = a.f, rx = f.W / 2 - 2.8, rz = f.H / 2 - 2.8;
        a.a += (a.sp / Math.max(rx, rz)) * dt;
        const lx = Math.cos(a.a) * rx, lz = Math.sin(a.a) * rz, [x, z] = f.L(lx, lz);
        const tlx = -Math.sin(a.a) * rx, tlz = Math.cos(a.a) * rz;
        const wx = f.ux * tlx + f.vx * tlz, wz = f.uz * tlx + f.vz * tlz;
        C.set(a.id, x, G(x, z), z, Math.atan2(wx, wz), a.sp, 'walk', t);
      } else if (a.kind === 'smoke') {
        C.set(a.id, a.x, G(a.x, a.z), a.z, a.h, 0, 'smoke', t);
      } else if (a.kind === 'phone') {
        C.set(a.id, a.x, G(a.x, a.z), a.z, a.h, 0, 'smoke', t); // ruka u ucha = sluchátko
      } else if (a.kind === 'pen') {
        let v = 0;
        if (a.wait > 0) a.wait -= dt;
        else {
          const dx = a.t[0] - a.x, dz = a.t[1] - a.z, d = Math.hypot(dx, dz);
          if (d < 0.3) { a.t = this.penPoint(a.pen); a.wait = 1 + Math.random() * 4; }
          else { v = 0.9; a.x += (dx / d) * v * dt; a.z += (dz / d) * v * dt; a.h = Math.atan2(dx, dz); }
        }
        C.set(a.id, a.x, G(a.x, a.z), a.z, a.h, v, 'walk', t);
      }
    }
    C.updateCorpses(dt, (x, z) => G(x, z), () => {});
    C.commit();
    this.updateKennelDogs(dt, t);
  }

  /* ---------------- hlídky: psovod se psem, dva dozorci ---------------- */
  /** Psi ve výbězích: přecházejí, vrtí ocasem, na blízkého hráče štěkají a skáčou na pletivo. */
  updateKennelDogs(dt, t) {
    const P = this.game.focus?.() || this.game.player;
    for (const d of this.kennelDogs || []) {
      const near = Math.hypot(P.x - d.x, P.z - d.z) < 14;
      if (near) { d.tx = Math.max(d.r.x0, Math.min(d.r.x1, P.x)); d.tz = d.r.z1; }
      else if ((d.wait -= dt) <= 0) { d.tx = d.r.x0 + Math.random() * (d.r.x1 - d.r.x0); d.tz = d.r.z0 + Math.random() * (d.r.z1 - d.r.z0); d.wait = 2 + Math.random() * 5; }
      const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz), v = dist > 0.2 ? Math.min(near ? 3 : 1.2, dist * 2) : 0;
      if (dist > 0.05) { d.x += (dx / dist) * v * dt; d.z += (dz / dist) * v * dt; }
      const h = near && dist < 0.3 ? Math.atan2(P.x - d.x, P.z - d.z) : dist > 0.05 ? Math.atan2(dx, dz) : d.m.rotation.y;
      d.m.rotation.y = h;
      const jump = near && dist < 0.3 ? Math.max(0, Math.sin(t * 7 + d.ph)) * 0.35 : 0;
      d.m.position.set(d.x, d.r.y + jump, d.z);
      const sw = v > 0 ? Math.sin(t * 12 + d.ph) * 0.5 : 0;
      d.m.userData.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? sw : -sw)));
      d.m.userData.tail.rotation.z = Math.sin(t * 10 + d.ph) * 0.5;
      if (near && Math.random() < dt * 0.6) this.bark();
    }
  }
  makeDog() {
    const g = new THREE.Group(), fur = new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.9 }), tan = new THREE.MeshStandardMaterial({ color: '#8a5a2e', roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.8), fur); body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.3), tan); head.position.set(0, 0.78, 0.5);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), tan); snout.position.set(0, 0.72, 0.7);
    const ears = [-0.07, 0.07].map((x) => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), fur); e.position.set(x, 0.95, 0.45); return e; });
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.35, 5), fur); tail.position.set(0, 0.65, -0.48); tail.rotation.x = -0.9;
    g.add(body, head, snout, tail, ...ears);
    const legGeo = new THREE.BoxGeometry(0.07, 0.42, 0.07); legGeo.translate(0, -0.21, 0);
    g.userData.legs = [[-0.1, 0.3], [0.1, 0.3], [-0.1, -0.3], [0.1, -0.3]].map(([x, z], i) => { const l = new THREE.Mesh(legGeo, i < 2 ? tan : fur); l.position.set(x, 0.45, z); g.add(l); return l; });
    g.userData.tail = tail;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.scene.add(g);
    return g;
  }
  buildPatrols() {
    const guardC = { shirt: '#1d2633', pants: '#161c26' };
    const mk = () => { const m = makeHuman({ name: 'Worker_Male', female: false, tint: false, uniform: { ...guardC, hat: '#1a2230' } }); this.scene.add(m); return m; };
    const prep = (pts) => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum[cum.length - 1] }; };
    // psovod v pásu mezi severní zdí a plotem, tam a zpět
    this.patrols = [
      { path: prep([[-378, 1027.5], [-287, 1021.2], [-256, 1019], [-69, 1004.5]]), s: 0, dir: 1, v: 1.3, guard: mk(), dog: this.makeDog() },
      { path: prep([[-360, 1067], [-329.5, 1066.6], [-312.5, 1063.6], [-295, 1060.8], [-270, 1057], [-242, 1053]]), s: 40, dir: -1, v: 1.2, guard: mk(), mate: mk() },
    ];
  }
  updatePatrols(dt, t, near) {
    const at = (P, s) => { for (let i = 1; i < P.pts.length; i++) if (s <= P.cum[i]) { const k = (s - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1), a = P.pts[i - 1], b = P.pts[i]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[0] - a[0], b[1] - a[1])]; } const a = P.pts[P.pts.length - 2], b = P.pts[P.pts.length - 1]; return [b[0], b[1], Math.atan2(b[0] - a[0], b[1] - a[1])]; };
    for (const p of this.patrols) {
      const vis = near;
      p.guard.visible = vis || p.guardDead; if (p.dog) p.dog.visible = vis; if (p.mate) p.mate.visible = vis || p.mateDead;
      if (!vis) continue;
      // rvačka s hráčem nebo složený dozorce: hlídka stojí (pozici řídí souboj / leží tělo)
      if (p.stopT > 0 || p.guardDead) { p.stopT = Math.max(0, (p.stopT || 0) - dt); continue; }
      p.s += p.v * p.dir * dt;
      if (p.s > p.path.len) { p.s = p.path.len; p.dir = -1; } else if (p.s < 0) { p.s = 0; p.dir = 1; }
      const [x, z, h0] = at(p.path, p.s), h = p.dir > 0 ? h0 : h0 + Math.PI, nx = Math.cos(h), nz = -Math.sin(h);
      p.guard.position.set(x, this.G(x, z), z); p.guard.rotation.y = h;
      animateHuman(p.guard, p.v, dt, 'walk');
      if (p.mate && !p.mateDead) { const mx = x + nx * 0.9, mz = z + nz * 0.9; p.mate.position.set(mx, this.G(mx, mz), mz); p.mate.rotation.y = h; animateHuman(p.mate, p.v, dt, 'walk'); }
      if (p.dog) {
        const dx = x - nx * 0.9 + Math.sin(h) * 0.6, dz = z - nz * 0.9 + Math.cos(h) * 0.6;
        p.dog.position.set(dx, this.G(dx, dz), dz); p.dog.rotation.y = h;
        p.dog.userData.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 9 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6));
        p.dog.userData.tail.rotation.z = Math.sin(t * 7) * 0.5;
        // štěkot, když je hráč blízko
        const F = this.game.focus() || this.game.player;
        if (Math.hypot(F.x - dx, F.z - dz) < 35) {
          this.barkT = (this.barkT ?? 2) - dt;
          if (this.barkT <= 0) { this.barkT = 4 + Math.random() * 8; this.bark(); }
        }
      }
    }
  }

  /* ---------------- zvuky ---------------- */
  bark() {
    const a = this.game.audio;
    a?.noise?.(0.12, 0.35, 650); setTimeout(() => a?.noise?.(0.1, 0.3, 700), 170);
  }
  radio() {
    const a = this.game.audio;
    a?.blip?.(1450, 0.06, 'square', 0.04); setTimeout(() => a?.noise?.(0.5, 0.06, 2600), 80); setTimeout(() => a?.blip?.(1150, 0.06, 'square', 0.04), 650);
  }
  /** Hlášení z rozhlasu: gong a hlas (česky, pokud je k dispozici). */
  /**
   * Hlášení rozhlasu. Nahrané hlasem Zuzana (assets/voice/*.m4a) – přehrává se přes <audio>, takže hraje i na telefonu
   * (hlasový výstup prohlížeče na mobilech často mlčí). Pro text bez nahrávky se použije hlas prohlížeče.
   */
  announce(text) {
    const a = this.game.audio;
    a?.blip?.(784, 0.5, 'sine', 0.12); setTimeout(() => a?.blip?.(622, 0.7, 'sine', 0.12), 420);
    const file = PrisonFX.VOICE[text];
    const v = PrisonFX.voiceEl();
    if (file && v) {
      clearTimeout(this.voiceT);
      this.voiceT = setTimeout(() => {
        v.pause(); v.src = `assets/voice/${file}.m4a`; v.currentTime = 0; v.muted = false; v.volume = 1;
        v.play().catch(() => this.speak(text));
      }, 1100);
      return;
    }
    this.speak(text);
  }
  speak(text) {
    try {
      const ss = window.speechSynthesis;
      if (!ss) return;
      const u = new SpeechSynthesisUtterance(text);
      const v = ss.getVoices().find((x) => /^cs/i.test(x.lang));
      if (v) u.voice = v;
      u.lang = 'cs-CZ'; u.rate = 0.95; u.pitch = 0.9; u.volume = 0.9;
      if (ss.speaking || ss.pending) ss.cancel(); // (Safari ignoruje speak hned po cancel – proto zrušit předem)
      if (ss.paused) ss.resume();
      setTimeout(() => ss.speak(u), 1100);
    } catch { /* bez hlasu */ }
  }
  static VOICE = {
    'Pozor, požár v budově K. Všichni zůstaňte na celách. Přijíždějí hasiči.': 'pozar',
    'Pozor, vyhlašuji poplach. Všichni odsouzení okamžitě na zem. Zasahuje policie.': 'poplach',
    'Pozor, přijíždí eskorta. Uvolněte vjezd.': 'eskorta',
    'Pozor, pozor. Nástup na oběd. Oddíly se připraví k odchodu do jídelny.': 'obed',
    'Pozor, pozor. Nástup na večeři. Oddíly se připraví k odchodu do jídelny.': 'vecere',
  };
  /** Jeden sdílený přehrávač; na telefonu se musí odemknout dotykem (unlockVoice). */
  static voiceEl() {
    if (!PrisonFX._v && typeof Audio !== 'undefined') {
      const v = document.createElement('audio');
      v.preload = 'auto'; v.setAttribute('playsinline', '');
      PrisonFX._v = v;
    }
    return PrisonFX._v;
  }
  /** Volá se při dotyku: přehraje nahrávku potichu a zastaví ji – od té chvíle smí přehrávač hrát i bez dotyku. */
  static unlockVoice() {
    const v = PrisonFX.voiceEl();
    if (!v || PrisonFX._unlocked) return;
    PrisonFX._unlocked = true;
    v.src = 'assets/voice/eskorta.m4a'; v.muted = true;
    const p = v.play();
    if (p) p.then(() => { v.pause(); v.currentTime = 0; v.muted = false; }).catch(() => { PrisonFX._unlocked = false; v.muted = false; });
  }


  /* ---------------- mokro po hašení ---------------- */
  wetGround(b) {
    const m = new THREE.MeshStandardMaterial({ color: '#2c2f33', roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const patches = [];
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
      const x = b.cx + Math.cos(a) * ((b.maxx - b.minx) / 2 + r * 0.5), z = b.cz + Math.sin(a) * ((b.maxz - b.minz) / 2 + r * 0.5);
      if (this.city.buildingAt(x, z)) continue;
      const pm = new THREE.Mesh(new THREE.CircleGeometry(2 + Math.random() * 4, 18), m);
      pm.rotation.x = -Math.PI / 2; pm.position.set(x, this.G(x, z) + 0.05, z); pm.scale.set(1, 0.6 + Math.random() * 0.8, 1);
      this.scene.add(pm); patches.push(pm);
    }
    this.wet = { m, patches, t: 0 };
  }

  update(dt, t, night) {
    if (!this.city.prison) return;
    this.t += dt;
    const F = this.game.focus() || this.game.player;
    const near = Math.hypot(F.x + 255, F.z - 1095) < 420;
    const h = this.game.hour ?? 15, day = h > 7 && h < 19.5 && !(h >= 10.5 && h < 12.6) && !(h >= 15.5 && h < 17.6);
    this.updateNight(dt, t, night);
    this.updateYardLife(dt, t, day && !this.game.prisonLife?.riot, near);
    this.updatePatrols(dt, t, near);
    this.leds.color.set(Math.floor(t * 1.2) % 2 ? '#ff2a1a' : '#3a0805');
    // vysílačky a klapnutí bran
    if (near) {
      this.radioT = (this.radioT ?? 15) - dt;
      if (this.radioT <= 0) { this.radioT = 20 + Math.random() * 30; this.radio(); }
      for (const g of this.world.prisonGates || []) {
        if (g.open > 0.02 && !g._clank) { g._clank = true; this.game.audio?.noise?.(0.3, 0.3, 280); }
        if (g.open < 0.01) g._clank = false;
      }
    }
    if (this.wet) {
      this.wet.t += dt;
      this.wet.m.opacity = 0.45 * Math.max(0, 1 - this.wet.t / 120);
      if (this.wet.t > 120) { for (const p of this.wet.patches) this.scene.remove(p); this.wet = null; }
    }
  }
}
