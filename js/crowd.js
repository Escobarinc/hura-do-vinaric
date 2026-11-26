/*
 * Hromadný dav: tisíce jednoduchých postav vykreslených instancemi (trup, hlava, nohy, ruce, volitelně helma a obušek).
 * Každá postava má polohu, natočení a pózu (chůze, mávání, bití obuškem, ležení). Slouží pro vězně na jídle,
 * vzpouru a policejní zásah. Plné animované postavy (s kostrou) by v takovém počtu hru zastavily.
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _p = new THREE.Matrix4(), _r = new THREE.Matrix4(), _l = new THREE.Matrix4();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const im0 = (im, i) => im.setMatrixAt(i, HIDE);

export class Crowd {
  /**
   * @param {object} o { shirt, pants, skin, helmet?, baton?, capacity }
   */
  constructor(scene, o) {
    this.cap = o.capacity;
    const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
    const leg = new THREE.BoxGeometry(0.17, 0.86, 0.17); leg.translate(0, -0.43, 0);
    const arm = new THREE.BoxGeometry(0.11, 0.62, 0.11); arm.translate(0, -0.31, 0);
    const parts = {
      torso: [new THREE.BoxGeometry(0.46, 0.62, 0.26), mat(o.shirt)],
      head: [new THREE.SphereGeometry(0.13, 10, 8), mat(o.skin || '#e8bf9c', { roughness: 0.7 })],
      legL: [leg, mat(o.pants)], legR: [leg, mat(o.pants)],
      armL: [arm, mat(o.shirt)], armR: [arm, mat(o.shirt)],
    };
    if (o.helmet) parts.helmet = [new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(o.helmet, { roughness: 0.3, metalness: 0.3 })];
    if (o.baton) { const bt = new THREE.BoxGeometry(0.045, 0.6, 0.045); bt.translate(0, -0.85, 0.12); parts.baton = [bt, mat('#111', { roughness: 0.4 })]; }
    this.parts = {};
    this.group = new THREE.Group();
    for (const [k, [geo, m]] of Object.entries(parts)) {
      const im = new THREE.InstancedMesh(geo, m, this.cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = k === 'torso';
      for (let i = 0; i < this.cap; i++) im.setMatrixAt(i, HIDE);
      this.parts[k] = im;
      this.group.add(im);
    }
    scene.add(this.group);
    // stav postav: x, y, z, h (natočení), viditelnost, mrtvý
    this.x = new Float32Array(this.cap); this.y = new Float32Array(this.cap); this.z = new Float32Array(this.cap);
    this.h = new Float32Array(this.cap); this.vis = new Uint8Array(this.cap); this.dead = new Uint8Array(this.cap);
    this.phase = new Float32Array(this.cap).map(() => Math.random() * 6.28);
    // mrtvá těla: 1 = padá, 2 = letí (výbuch), 3 = leží
    this.cor = new Uint8Array(this.cap); this.cT = new Float32Array(this.cap);
    this.cv = new Float32Array(this.cap * 3); this.spin = new Float32Array(this.cap);
    this.corpseList = [];
    this.dirty = true;
  }

  /** Zabití postavy: pád ve směru střely, nebo odlet od výbuchu (vel = {x, y, z}). */
  kill(i, dir, vel = null) {
    if (this.dead[i]) return;
    this.dead[i] = 1;
    this.h[i] = Math.atan2(-dir.x, -dir.z); // čelem ke střelci → padá dozadu
    this.cT[i] = 0;
    if (vel) { this.cor[i] = 2; this.cv.set([vel.x, vel.y, vel.z], i * 3); this.spin[i] = (Math.random() - 0.5) * 9; }
    else { this.cor[i] = 1; this.cv.set([dir.x * 1.6, 0, dir.z * 1.6], i * 3); }
    this.corpseList.push(i);
  }
  /** Pohyb padajících a letících těl; onLand(x, z) = místo dopadu (kaluž krve). */
  updateCorpses(dt, ground, onLand) {
    for (let k = this.corpseList.length - 1; k >= 0; k--) {
      const i = this.corpseList[k];
      this.cT[i] += dt;
      const v = i * 3;
      if (this.cor[i] === 1) {
        const f = Math.min(1, this.cT[i] / 0.55);
        const sl = Math.max(0, 1 - this.cT[i] / 0.45);
        this.x[i] += this.cv[v] * sl * dt; this.z[i] += this.cv[v + 2] * sl * dt;
        this.y[i] = ground(this.x[i], this.z[i]);
        this.setCorpse(i, f * f, 0);
        if (f >= 1) { this.cor[i] = 3; this.corpseList.splice(k, 1); onLand?.(this.x[i], this.z[i]); }
      } else if (this.cor[i] === 2) {
        this.cv[v + 1] -= 9.8 * dt;
        this.x[i] += this.cv[v] * dt; this.y[i] += this.cv[v + 1] * dt; this.z[i] += this.cv[v + 2] * dt;
        const gy = ground(this.x[i], this.z[i]);
        const roll = this.cT[i] * this.spin[i];
        if (this.y[i] <= gy && this.cv[v + 1] < 0) {
          this.y[i] = gy;
          if (this.cv[v + 1] < -4) { this.cv[v + 1] *= -0.25; this.cv[v] *= 0.5; this.cv[v + 2] *= 0.5; }
          else { this.cor[i] = 3; this.setCorpse(i, 1, 0); this.corpseList.splice(k, 1); onLand?.(this.x[i], this.z[i]); continue; }
        }
        this.setCorpse(i, Math.min(1, this.cT[i] * 1.5) + Math.sin(roll) * 0.3, roll);
      }
    }
    if (this.corpseList.length) this.dirty = true;
  }
  setCorpse(i, tilt, roll) {
    const P = this.parts;
    _b.makeRotationY(this.h[i]); _b.setPosition(this.x[i], this.y[i] + 0.16 * Math.min(1, tilt), this.z[i]);
    _l.makeRotationX(-Math.PI / 2 * tilt); _b.multiply(_l);
    if (roll) { _l.makeRotationY(roll); _b.multiply(_l); }
    const put = (im, ox, oy, oz, ax, az = 0) => {
      _p.makeTranslation(ox, oy, oz);
      if (ax) { _r.makeRotationX(ax); _p.multiply(_r); }
      if (az) { _r.makeRotationZ(az); _p.multiply(_r); }
      _m.multiplyMatrices(_b, _p);
      im.setMatrixAt(i, _m);
    };
    put(P.torso, 0, 1.22, 0, 0); put(P.head, 0, 1.68, 0, 0);
    if (P.helmet) put(P.helmet, 0, 1.72, 0, 0);
    put(P.legL, -0.11, 0.9, 0, 0.15); put(P.legR, 0.11, 0.9, 0, -0.1);
    put(P.armL, -0.3, 1.5, 0, Math.PI * 0.8 * tilt, 0.4); put(P.armR, 0.3, 1.5, 0, Math.PI * 0.7 * tilt, -0.5);
    if (P.baton) im0(P.baton, i);
    this.vis[i] = 1;
    this.dirty = true;
  }

  hide(i, force = false) {
    if (!this.vis[i]) return;
    if (this.cor[i] && !force) return; // mrtvá těla zůstávají ležet
    this.vis[i] = 0;
    for (const im of Object.values(this.parts)) im.setMatrixAt(i, HIDE);
    this.dirty = true;
  }

  /**
   * Nastaví postavu i. pose: { speed (m/s), mode: 'walk' | 'riot' | 'beat' | 'lie' | 'kneel', t (čas) }
   */
  set(i, x, y, z, h, speed, mode, t) {
    this.vis[i] = 1; this.x[i] = x; this.y[i] = y; this.z[i] = z; this.h[i] = h;
    const P = this.parts, ph = this.phase[i] + t * (speed > 0.1 ? 2.2 + speed * 2.4 : 0);
    _b.makeRotationY(h); _b.setPosition(x, y, z);
    if (mode === 'lie') { _l.makeRotationX(-Math.PI / 2); _l.setPosition(0, 0.16, 0); _b.multiply(_l); }
    else if (mode === 'kneel') { _l.makeTranslation(0, -0.45, 0); _b.multiply(_l); }
    const put = (im, ox, oy, oz, ax, az = 0) => {
      _p.makeTranslation(ox, oy, oz);
      if (ax) { _r.makeRotationX(ax); _p.multiply(_r); }
      if (az) { _r.makeRotationZ(az); _p.multiply(_r); }
      _m.multiplyMatrices(_b, _p);
      im.setMatrixAt(i, _m);
    };
    const sw = mode === 'lie' ? 0 : Math.sin(ph) * Math.min(0.75, speed * 0.32);
    put(P.torso, 0, 1.22, 0, 0);
    put(P.head, 0, 1.68, 0, 0);
    if (P.helmet) put(P.helmet, 0, 1.72, 0, 0);
    put(P.legL, -0.11, 0.9, 0, mode === 'kneel' ? -1.4 : sw);
    put(P.legR, 0.11, 0.9, 0, mode === 'kneel' ? -1.4 : -sw);
    let aL = -sw * 0.9, aR = sw * 0.9, zL = 0.06, zR = -0.06;
    if (mode === 'riot') { // ruce nahoře, mávají
      aL = Math.PI - 0.3 + Math.sin(t * 9 + this.phase[i]) * 0.35; aR = Math.PI - 0.3 + Math.sin(t * 9 + this.phase[i] + 1.7) * 0.35; zL = 0.25; zR = -0.25;
    } else if (mode === 'beat') { // pravá ruka s obuškem bije shora
      aR = 2.3 + Math.sin(t * 13 + this.phase[i]) * 1.1; aL = 0.4;
    } else if (mode === 'hang') { aL = aR = Math.PI; zL = 0.12; zR = -0.12; // visí na hrazdě
    } else if (mode === 'smoke') { aL = -0.1; aR = 2.2 + Math.max(0, Math.sin(t * 0.7 + this.phase[i])) * 0.6; zR = -0.35; // ruka s cigaretou k puse
    } else if (mode === 'aim') { aL = aR = Math.PI / 2 + 0.05; zL = -0.35; zR = 0.1; // obě ruce vpřed – míří samopalem
    } else if (mode === 'kneel') { aL = aR = -0.3; zL = 0.5; zR = -0.5; } // ruce za hlavou
    else if (mode === 'lie') { aL = aR = Math.PI; } // ruce natažené nad hlavou
    put(P.armL, -0.3, 1.5, 0, aL, zL);
    put(P.armR, 0.3, 1.5, 0, aR, zR);
    if (P.baton) put(P.baton, 0.3, 1.5, 0, aR, zR);
    this.dirty = true;
  }

  /** Barva trupu jedné postavy (dresy při fotbale). */
  setShirt(i, hex) {
    const im = this.parts.torso;
    this._c ||= new THREE.Color();
    im.setColorAt(i, this._c.set(hex));
    im.instanceColor.needsUpdate = true;
  }

  commit() {
    if (!this.dirty) return;
    for (const im of Object.values(this.parts)) im.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
  hideAll(force = false) {
    for (let i = 0; i < this.cap; i++) this.hide(i, force);
    if (force) { this.cor.fill(0); this.dead.fill(0); this.corpseList.length = 0; }
    this.commit();
  }
}
