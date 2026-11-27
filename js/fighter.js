/*
 * Bojovník do arény: figurína z Quaternius Universal Animation Library (CC0) s klipy
 * (Idle, chůze, jab, cross, zásah do hlavy / hrudi, pád, kotoul, skok, tanec) a s pohyby
 * dopočítanými natočením kostí (kopy, výskokový kop, salto, kryt, zvedák).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

let SRC = null, LOADING = null;
export function loadFighterKit() {
  if (SRC) return Promise.resolve(SRC);
  LOADING ||= new GLTFLoader().loadAsync('assets/fight/ual.glb').then((g) => {
    const clips = {};
    for (const c of g.animations) clips[c.name] = c;
    // kořenový pohyb: pohyb po scéně řídíme sami → z klipů odstraníme posun kosti root/pelvis v rovině
    for (const c of Object.values(clips)) {
      for (const tr of c.tracks) {
        if (/(^|\.)root\.position$/.test(tr.name)) { const v = tr.values; for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0; } }
        if (/(^|\.)pelvis\.position$/.test(tr.name)) { const v = tr.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
      }
    }
    SRC = { scene: g.scene, clips };
    return SRC;
  });
  return LOADING;
}

const TEAM = {
  blue: { main: '#1f3f8f', joints: '#c9d3e6', glove: '#1a4ed8', shorts: '#0f1d40' },
  red: { main: '#8f1f1f', joints: '#e6cfc9', glove: '#d81a1a', shorts: '#401010' },
  ref: { main: '#e9e9e6', joints: '#1a1a1a', glove: null, shorts: null },
};

export class Fighter {
  constructor(scene, team = 'blue', height = 1.8) {
    const { scene: src, clips } = SRC;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(src);
    const pal = TEAM[team] || TEAM.blue;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const n = o.material?.name || '';
      o.material = o.material.clone();
      if (n === 'M_Main') o.material.color.set(pal.main);
      else if (n === 'M_Joints') o.material.color.set(pal.joints);
      o.material.roughness = 0.55;
    });
    // výška postavy
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model), hh = box.max.y - box.min.y || 1.8;
    this.model.scale.multiplyScalar(height / hh);
    this.root.add(this.model);
    scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [k, c] of Object.entries(clips)) this.actions[k] = this.mixer.clipAction(c);
    for (const k of ['Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Hit_Head', 'Death01', 'Roll', 'Jump_Start', 'Jump_Land', 'Sword_Attack', 'Interact']) {
      const a = this.actions[k]; if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    }
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    // rukavice
    if (pal.glove) {
      const gm = new THREE.MeshStandardMaterial({ color: pal.glove, roughness: 0.4 });
      for (const n of ['hand_l', 'hand_r']) {
        const b = this.bones[n]; if (!b) continue;
        this.model.updateMatrixWorld(true);
        const ws = new THREE.Vector3(); b.getWorldScale(ws);
        const g = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), gm);
        g.scale.set(1 / ws.x, 0.9 / ws.y, 1.15 / ws.z);
        b.add(g);
      }
    }
    this.cur = null;
    this.play('Idle_Loop', 0);
  }
  /** Přehraje klip (crossfade). */
  play(name, fade = 0.15, speed = 1, restart = false) {
    const a = this.actions[name];
    if (!a) return null;
    if (this.cur === a && !restart) { a.timeScale = speed; return a; }
    a.reset(); a.timeScale = speed; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (this.cur && fade > 0) a.crossFadeFrom(this.cur, fade, false); else if (this.cur) this.cur.stop();
    this.cur = a;
    return a;
  }
  clipLen(name) { return this.actions[name]?.getClip().duration || 0.5; }
  update(dt) { this.mixer.update(dt); }
  /** Přidá natočení kosti (po přehrání klipu, v místních osách kosti). */
  rot(name, x = 0, y = 0, z = 0) {
    const b = this.bones[name]; if (!b) return;
    _q.setFromEuler(_e.set(x, y, z));
    b.quaternion.multiply(_q);
  }
  /**
   * Dopočítané pohyby (po klipu). t = 0..1 průběh, k = sin-oblouk síly.
   * Osy kostí figuríny (zjištěno měřením): thigh x− = noha vpřed, thigh_r z+ = noha do strany,
   * calf x+ = pokrčit koleno, spine_01 x+ = předklon, z+ = úklon vpravo, y = rotace trupu.
   */
  pose(kind, t) {
    const k = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI), ext = Math.min(1, Math.max(0, (t - 0.25) / 0.25)) * (t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25);
    switch (kind) {
      case 'guard': // garda: předloktí nahoru k obličeji (upperarm x+ = paže vpřed, lowerarm x+ = pokrčit loket)
        this.rot('upperarm_l', 1.0 * t, 0, 0); this.rot('lowerarm_l', 1.9 * t, 0, 0);
        this.rot('upperarm_r', 0.85 * t, 0, 0); this.rot('lowerarm_r', 2.1 * t, 0, 0);
        break;
      case 'block':
        this.rot('upperarm_l', 1.35 * t, 0, 0); this.rot('lowerarm_l', 2.4 * t, 0, 0);
        this.rot('upperarm_r', 1.35 * t, 0, 0); this.rot('lowerarm_r', 2.4 * t, 0, 0);
        this.rot('spine_01', 0.18 * t, 0, 0);
        break;
      case 'frontKick': // přímý kop (teep) pravou
        this.rot('thigh_r', -1.25 * k, 0, 0); this.rot('calf_r', 1.6 * k * (1 - ext), 0, 0); this.rot('spine_01', -0.25 * k, 0, 0); this.rot('calf_l', 0.25 * k, 0, 0);
        break;
      case 'highKick': // vysoký obloukový kop pravou
        this.rot('spine_01', -0.25 * k, 0.6 * k, -0.35 * k); this.rot('thigh_r', -2.05 * k, 0, 0.25 * k); this.rot('calf_r', 1.3 * k * (1 - ext), 0, 0); this.rot('calf_l', 0.2 * k, 0, 0);
        break;
      case 'lowKick': // nízký kop do stehna
        this.rot('spine_01', -0.1 * k, 0.35 * k, -0.15 * k); this.rot('thigh_r', -0.75 * k, 0, 0.45 * k); this.rot('calf_r', 0.5 * k * (1 - ext), 0, 0);
        break;
      case 'jumpKick': // výskokový kop: přední noha natažená, zadní skrčená
        this.rot('thigh_r', -1.55 * k, 0, 0); this.rot('calf_r', 0.2 * (1 - ext) * k, 0, 0);
        this.rot('thigh_l', -0.6 * k, 0, 0); this.rot('calf_l', 2.0 * k, 0, 0); this.rot('spine_01', -0.3 * k, 0, 0);
        break;
      case 'tuck': // schoulení při saltu
        this.rot('thigh_r', -1.6 * k, 0, 0); this.rot('thigh_l', -1.6 * k, 0, 0); this.rot('calf_r', 2.1 * k, 0, 0); this.rot('calf_l', 2.1 * k, 0, 0); this.rot('spine_01', 0.6 * k, 0, 0);
        break;
      case 'uppercut':
        this.rot('spine_01', 0.2 * (1 - k) - 0.3 * k, -0.45 * k, 0); this.rot('upperarm_r', 0.4 + 1.3 * k, 0, 0); this.rot('lowerarm_r', 2.2 - 0.6 * k, 0, 0);
        break;
      case 'hook':
        this.rot('spine_01', 0, 0.75 * k, 0); this.rot('upperarm_l', 1.0 + 0.4 * k, 0, 1.0 * k); this.rot('lowerarm_l', 1.5, 0, 0);
        break;
      case 'win':
        this.rot('upperarm_l', 2.9 * t, 0, 0); this.rot('upperarm_r', 2.9 * t, 0, 0); this.rot('lowerarm_l', 0.4 * t, 0, 0); this.rot('lowerarm_r', 0.4 * t, 0, 0);
        break;
      default: break;
    }
  }
  dispose(scene) { scene.remove(this.root); }
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
