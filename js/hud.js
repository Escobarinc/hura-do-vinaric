import { fmtMoney } from './util.js?v=20261128001937';

const $ = (id) => document.getElementById(id);
const MAP_SCALE = 0.5; // px na metr v předrenderované mapě

export class Hud {
  constructor(city) {
    this.city = city;
    this.el = {
      money: $('money'), clock: $('clock'), wanted: $('wanted'), hp: $('hp'), hpBar: $('hp-bar'),
      locName: $('loc-name'), locSub: $('loc-sub'), locIcon: $('loc-icon'), speedo: $('speedo'), speed: $('speed'),
      dmg: $('dmg-bar'), hint: $('hint'), toast: $('toast'), mission: $('mission'), big: $('big-msg'), keys: $('keys'),
      controls: $('controls'), bigmap: $('bigmap'), bigCanvas: $('bigmap-canvas'), teleport: $('teleport'),
    };
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.renderMap();
    this.locT = 0;
    this._cache = {};
  }

  /** Předkreslí celou mapu do offscreen canvasu. */
  renderMap() {
    const H = this.city.half;
    const S = Math.ceil(H * 2 * MAP_SCALE);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const tx = (x) => (x + H) * MAP_SCALE, tz = (z) => (z + H) * MAP_SCALE;
    g.fillStyle = '#24211e';
    g.fillRect(0, 0, S, S);
    const poly = (p) => {
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, tx(p[i]), tz(p[i + 1]));
      g.closePath();
    };
    g.fillStyle = '#2f4a2c';
    for (const gr of this.city.green) { poly(gr.p); g.fill(); }
    g.fillStyle = '#3d3934';
    for (const p of this.city.plazas) { poly(p.p); g.fill(); }
    g.fillStyle = '#2d5c78';
    for (const w of this.city.water) { poly(w.p); g.fill(); }
    g.strokeStyle = '#2d5c78';
    g.lineCap = g.lineJoin = 'round';
    for (const r of this.city.rivers) {
      g.lineWidth = r.w * MAP_SCALE;
      g.beginPath();
      for (let i = 0; i < r.p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, tx(r.p[i]), tz(r.p[i + 1]));
      g.stroke();
    }
    g.fillStyle = '#3a3531';
    for (const b of this.city.buildings) { poly(b.p); g.fill(); }
    const draw = (filter, color, wmul) => {
      g.strokeStyle = color;
      for (const r of this.city.roads) {
        if (!filter(r)) continue;
        g.lineWidth = Math.max(1, r.w * MAP_SCALE * wmul);
        g.beginPath();
        for (let i = 0; i < r.p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, tx(r.p[i]), tz(r.p[i + 1]));
        g.stroke();
      }
    };
    draw((r) => r.walk && r.t !== 'living_street', '#4a453f', 0.6);
    draw((r) => r.drive && !['primary', 'secondary', 'primary_link', 'secondary_link'].includes(r.t), '#8a857d', 1.2);
    draw((r) => ['primary', 'secondary', 'primary_link', 'secondary_link'].includes(r.t), '#d9a54a', 1.1);
    this.map = c;
    this.mapS = S;
  }

  update(game, dt, clock) {
    const e = this.el;
    this.set('money', fmtMoney(game.money), (v) => (e.money.textContent = v));
    this.set('clock', clock, (v) => (e.clock.textContent = v));
    const hp = Math.round(game.player.hp);
    this.set('hp', hp, (v) => { e.hp.textContent = v; e.hpBar.style.width = v + '%'; e.hpBar.style.background = v < 30 ? '#d9483b' : ''; });
    const wk = game.wanted + (game.seen ? 's' : 'h');
    this.set('wanted', wk, () => {
      e.wanted.innerHTML = Array.from({ length: 5 }, (_, i) => `<b class="${i < game.wanted ? 'on' : ''}">★</b>`).join('');
      e.wanted.classList.toggle('blink', game.wanted > 0 && !game.seen);
    });
    this.set('hint', game.hint(), (v) => { e.hint.hidden = !v; if (v) e.hint.innerHTML = v; });
    this.set('keys', game.mode, (m) => {
      const k = {
        foot: [['Skok', 'Mezerník'], ['Sprint', 'Shift'], ['Navigace', 'N'], ['Přetočit čas', 'P']],
        car: [['Ruční brzda', 'Mezerník'], ['Houkačka', 'H'], ['Navigace', 'N']],
        heli: [['Stoupat', 'Mezerník'], ['Klesat', 'Shift'], ['Otáčení', 'A / D']],
        jet: [['Plyn', 'W'], ['Stoupat', 'Mezerník'], ['Klesat', 'Shift'], ['Kanón / rakety', '1 / 2'], ['Palba', 'F / myš']],
        trolley: [['Vystoupit v zastávce', 'E']],
        mma: [['Rána', 'myš / F'], ['Kop', 'G / Q'], ['Kryt', 'Shift'], ['Nůž', 'O']],
      }[m] || [];
      e.keys.innerHTML = k.map(([a, b]) => `<div>${a} <kbd>${b}</kbd></div>`).join('');
    });
    this.locT -= dt;
    if (this.locT <= 0) {
      this.locT = 0.5;
      const F = game.focus();
      const pl = this.city.placeName(F.x, F.z);
      e.locName.textContent = pl.street || pl.district;
      e.locSub.textContent = pl.street ? pl.district : 'Vinařice';
      e.locIcon.textContent = ({ foot: '⌂', car: '🚗', heli: '✚', jet: '✈', trolley: '🚌', mma: '🥊' }[game.mode] || '⌂');
    }
    this.drawMini(game);
  }

  set(key, val, fn) { if (this._cache[key] !== val) { this._cache[key] = val; fn(val); } }

  setSpeed(kmh, hp, alt) {
    const e = this.el;
    if (kmh == null) { this.set('spd', null, () => (e.speedo.hidden = true)); return; }
    e.speedo.hidden = false;
    const t = Math.round(kmh) + (alt != null ? ' ' + alt : '');
    this.set('spd', t, () => {
      e.speed.textContent = Math.round(kmh);
      e.speedo.querySelector('small').textContent = alt != null ? `km/h · ${alt} m` : 'km/h';
    });
    e.dmg.parentElement.hidden = hp == null;
    if (hp != null) e.dmg.style.width = hp + '%';
  }

  toast(t) { this.el.toast.hidden = !t; if (t) this.el.toast.textContent = t; }
  mission(html) { this.set('mission', html, (v) => { this.el.mission.hidden = !v; if (v) this.el.mission.innerHTML = v; }); }
  marker(m) { this.markerPos = m; }
  bigMsg(title, sub) {
    const b = this.el.big;
    b.innerHTML = `<div>${title}<small>${sub}</small></div>`;
    b.hidden = false;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => (b.hidden = true), 3500);
  }

  drawMini(game) {
    const g = this.mctx, W = this.mini.width, Hh = this.mini.height;
    const F = game.focus();
    const H = this.city.half;
    const zoom = game.mode === 'heli' ? 0.7 : game.mode === 'car' ? 1.1 : 1.8;
    g.save();
    g.fillStyle = '#24211e';
    g.fillRect(0, 0, W, Hh);
    g.translate(W / 2, Hh * 0.6);
    g.rotate(game.camYaw + Math.PI);
    g.scale(zoom, zoom);
    g.drawImage(this.map, -(F.x + H) * MAP_SCALE, -(F.z + H) * MAP_SCALE);
    const w2m = (x, z) => [(x - F.x) * MAP_SCALE, (z - F.z) * MAP_SCALE];
    // trasa GPS
    if (game.gps && game.gps.length > 1) {
      g.strokeStyle = game.mission ? '#5cc27a' : '#b98cff';
      g.lineWidth = 3 / zoom;
      g.beginPath();
      game.gps.forEach(([x, z], i) => { const [a, b] = w2m(x, z); (i ? g.lineTo : g.moveTo).call(g, a, b); });
      g.stroke();
    }
    const dot = (x, z, col, r = 3) => { const [a, b] = w2m(x, z); g.fillStyle = col; g.beginPath(); g.arc(a, b, r / zoom, 0, 7); g.fill(); };
    for (const t of game.trolleys) dot(t.veh.x, t.veh.z, '#ffb020', 2.5);
    if (game.heli && game.mode !== 'heli') dot(game.heli.x, game.heli.z, '#ff4a4a', 3.5);
    const blink = Math.floor(performance.now() / 250) % 2;
    for (const c of game.police) dot(c.veh.x, c.veh.z, blink ? '#3c6cff' : '#ff3c3c', 3.5);
    const m = this.markerPos || game.waypoint;
    if (m) {
      // na okraji, pokud je mimo
      let [a, b] = w2m(m.x, m.z);
      const lim = (Math.min(W, Hh) * 0.46) / zoom;
      const l = Math.hypot(a, b);
      if (l > lim) { a = (a / l) * lim; b = (b / l) * lim; }
      g.fillStyle = this.markerPos ? '#5cc27a' : '#b98cff';
      g.beginPath(); g.arc(a, b, 5 / zoom, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5 / zoom; g.stroke();
    }
    g.restore();
    // hráč (šipka)
    const h = game.mode === 'foot' ? game.player.h : game.mode === 'trolley' ? game.ride.veh.h : (game.vehicle || game.focus?.())?.h || 0;
    g.save();
    g.translate(W / 2, Hh * 0.6);
    g.rotate(game.camYaw - h);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // sever
    g.save();
    g.translate(W / 2, Hh * 0.6);
    g.rotate(game.camYaw + Math.PI);
    g.fillStyle = '#ffd23f';
    g.font = '800 11px "Chakra Petch", sans-serif';
    g.textAlign = 'center';
    const R = Math.min(W, Hh) * 0.5 - 8;
    g.translate(0, -R);
    g.rotate(-(game.camYaw + Math.PI));
    g.fillText('S', 0, 4);
    g.restore();
  }

  /** Velká mapa – klik nastaví cíl. */
  openBigMap(game) {
    const e = this.el;
    e.bigmap.hidden = false;
    const c = e.bigCanvas;
    const size = Math.min(1400, Math.round(Math.min(innerWidth * 0.92, innerHeight * 0.82) * (devicePixelRatio || 1)));
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.drawImage(this.map, 0, 0, size, size);
    const H = this.city.half, k = size / (H * 2);
    const P = game.focus();
    const mark = (x, z, col, r, label) => {
      g.fillStyle = col; g.beginPath(); g.arc((x + H) * k, (z + H) * k, r, 0, 7); g.fill();
      if (label) { g.fillStyle = '#eef2f5'; g.font = `700 ${Math.round(size / 75)}px "Chakra Petch", sans-serif`; g.fillText(label, (x + H) * k + r + 3, (z + H) * k + 4); }
    };
    for (const l of game.landmarks) mark(l.x, l.z, '#ffd23f', size / 260, l.label);
    if (game.waypoint) mark(game.waypoint.x, game.waypoint.z, '#b98cff', size / 120);
    mark(P.x, P.z, '#ffffff', size / 110);
    mark(P.x, P.z, '#39ff14', size / 200);
    c.onclick = (ev) => {
      const r = c.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * H * 2 - H;
      const z = ((ev.clientY - r.top) / r.height) * H * 2 - H;
      game.navTo({ x, z, label: 'Bod na mapě' });
      this.closeBigMap();
    };
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closeBigMap() { this.el.bigmap.hidden = true; }
  get bigMapOpen() { return !this.el.bigmap.hidden; }

  openTeleport(game) {
    const t = this.el.teleport;
    t.innerHTML = '<h3>Kam chceš? <small style="color:#9aa8b6;font-weight:600">(T zavřít)</small></h3>';
    for (const l of game.landmarks) {
      const b = document.createElement('button');
      b.textContent = l.label;
      b.onclick = () => { game.teleport(l); this.closeTeleport(); };
      t.appendChild(b);
    }
    this.closeBtn(t);
    t.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  /** N = navigace: seznam cílů (trasa po silnicích). */
  openNav(game) {
    const t = this.el.teleport;
    t.innerHTML = '<h3>Navigace – kam jedeme? <small style="color:#9aa8b6;font-weight:600">(N zavřít · na mapě M klikni kamkoli)</small></h3>';
    if (game.waypoint) {
      const c = document.createElement('button');
      c.textContent = '✕ Zrušit navigaci';
      c.style.gridColumn = '1 / -1';
      c.onclick = () => { game.navCancel(); this.closeTeleport(); };
      t.appendChild(c);
    }
    for (const l of game.landmarks) {
      const b = document.createElement('button');
      b.textContent = '➜ ' + l.label;
      b.onclick = () => { game.navTo(l); this.closeTeleport(); };
      t.appendChild(b);
    }
    this.closeBtn(t);
    t.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closeBtn(t) {
    const x = document.createElement('button');
    x.className = 'tp-x'; x.textContent = '✕ Zavřít';
    x.onclick = (e) => { e.stopPropagation(); this.closeTeleport(); };
    t.querySelector('h3').after(x);
  }
  closeTeleport() { this.el.teleport.hidden = true; }
  get teleportOpen() { return !this.el.teleport.hidden; }
}
