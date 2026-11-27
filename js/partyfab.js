/*
 * Mobilní ovládání party (návrh B – sloupec): kolečko vpravo dole, po klepnutí nad ním vyjede sloupec skupin
 * (hudba, světla, pódium, hrdina, všichni, brána, Doom) a klepnutí na skupinu vysune doleva řádek jejích akcí.
 * Jen poloprůhledné ikony bez popisků. Velké panely (světelný pult, přehrávač, Avengers) se na mobilu schovají.
 */
const FX_ICONS = { lasers: '🔺', fan: '🪭', ceiling: '🕸️', tunnel: '🌀', heads: '🔦', walls: '🏢', strobe: '💥', led: '📺', flames: '🔥', co2: '💨', confetti: '🎊', ball: '🪩', fog: '🌫️', uv: '🟣', beat: '🥁', rainbow: '🌈', blinders: '☀️', fireworks: '🎆', strings: '💡', mega: '🚨' };
const HERO_ICONS = { iron: '🤖', cap: '🛡️', thor: '⚡', spidey: '🕷️', hulk: '💚' };
const ACT_ICONS = { swapHammer: '🔨⇄', swapAxe: '🪓⇄', fly: '🚀', shoot: '💥', hammer: '🔨', axe: '🪓', pass: '🔨➜', passAxe: '🪓➜', callHammer: '🧲🔨', callAxe: '🧲🪓', bolts: '🌩️', swing: '🕸️', web: '🕷️', smash: '👊', leap: '🦘' };
const GROUPS = [['music', '🎵'], ['light', '💡'], ['stage', '🎪'], ['hero', '🦸'], ['team', '👥'], ['gate', '🌀'], ['doom', '☠️']];
const NUM = ['①', '②', '③', '④', '⑤', '⑥'];

export class PartyFab {
  constructor(party) { this.p = party; this.open = false; this.grp = null; this.heroView = null; }
  get av() { return this.p.av; }

  mount() {
    if (this.el) return;
    if (!document.getElementById('pfab-css')) {
      const css = document.createElement('style'); css.id = 'pfab-css';
      css.textContent = `body.pfab-on #party-panel,body.pfab-on #party-player,body.pfab-on #av-panel{display:none!important}
#pfab{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 192px);z-index:44;pointer-events:none;-webkit-user-select:none;user-select:none}
#pfab button{pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;border-radius:50%;border:1.5px solid rgba(255,255,255,.38);background:rgba(14,16,22,.5);color:#fff;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;cursor:pointer}
#pfab .main{width:52px;height:52px;font-size:24px;background:rgba(255,45,85,.82);border-color:rgba(255,255,255,.6)}
#pfab .col{position:absolute;right:5px;bottom:58px;display:flex;flex-direction:column-reverse;gap:6px;transition:opacity .2s,transform .2s}
#pfab .col button{width:42px;height:42px;font-size:20px}
#pfab .row{position:absolute;right:52px;display:flex;flex-wrap:wrap-reverse;flex-direction:row-reverse;gap:5px;width:max-content;max-width:min(290px,calc(100vw - 80px));padding:4px;border-radius:24px;background:rgba(0,0,0,.28)}
#pfab .row button{width:40px;height:40px;font-size:18px;position:relative}
#pfab .row button.sm{font-size:13px;letter-spacing:-1px}
#pfab button.on{background:rgba(57,255,20,.32);border-color:#39ff14}
#pfab button.sel{background:rgba(255,45,85,.55);border-color:#ff5c7a}
#pfab button.off{opacity:.38}
#pfab button.red{background:rgba(196,22,28,.6);border-color:#ff5c7a}
#pfab .tag{position:absolute;right:-2px;bottom:-2px;font-size:9px;background:#000;border-radius:6px;padding:0 2px}
#pfab:not(.open) .col,#pfab:not(.open) .row{opacity:0;transform:translateY(10px);pointer-events:none}#pfab:not(.open) .col button,#pfab:not(.open) .row button{pointer-events:none}`;
      document.head.appendChild(css);
    }
    const el = document.createElement('div'); el.id = 'pfab'; document.body.appendChild(el); this.el = el;
    document.body.classList.add('pfab-on');
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(ev, stop, { passive: true });
    el.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('button'); if (b) this.tap(b.dataset); });
    this.place(); this._rs = () => this.place(); addEventListener('resize', this._rs);
    this.iv = setInterval(() => { this.place(); if (this.open) this.render(); }, 700); // stav (kdo je na pódiu, Doom…) se mění i bez klepnutí
    this.render();
  }
  /** Kolečko vždy těsně nad mobilními tlačítky (zbraně, skok…), ať se nepřekrývá. */
  place() {
    if (!this.el) return; let top = innerHeight - 190;
    for (const t of document.querySelectorAll('.tbtns, .tbtns-mma')) { const r = t.getBoundingClientRect(); if (r.height && getComputedStyle(t).opacity !== '0') top = Math.min(top, r.top); }
    this.el.style.bottom = `${Math.round(innerHeight - top + 10)}px`;
  }
  unmount() { removeEventListener('resize', this._rs); clearInterval(this.iv); this.el?.remove(); this.el = null; document.body.classList.remove('pfab-on'); this.open = false; this.grp = null; }

  tap(d) {
    const P = this.p, A = this.av;
    if (d.k === 'main') { this.open = !this.open; if (!this.open) { this.grp = null; this.heroView = null; } }
    else if (d.k === 'grp') { this.grp = this.grp === d.v ? null : d.v; this.heroView = null; }
    else if (d.k === 'a') this.run(d.v, d.w);
    this.render();
  }
  run(v, w) {
    const P = this.p, A = this.av;
    switch (v) {
      // hudba
      case 'prev': P.setTrack((P.ti + 4) % 5); break;
      case 'next': P.setTrack((P.ti + 1) % 5); break;
      case 'play': if (P.music) { if (P.music.paused) P.music.play().catch(() => {}); else P.music.pause(); } break;
      case 'track': P.setTrack(+w); break;
      // světla
      case 'fx': P.fx[w] = !P.fx[w]; break;
      case 'color': P.color = (P.color + 1) % 8; P.fx.rainbow = false; break;
      case 'style': P.lightStyle = { auto: 'disco', disco: 'hiphop', hiphop: 'auto' }[P.lightStyle] || 'auto'; this.p.game.toast?.(`Styl světel: ${{ auto: 'AUTO', disco: 'DISKO', hiphop: 'HIP HOP' }[P.lightStyle]}`); break;
      case 'allOn': case 'allOff': case 'rnd': for (const k in P.fx) P.fx[k] = v === 'allOn' ? true : v === 'allOff' ? false : Math.random() < 0.55; break;
      case 'speed': P.speed = P.speed >= 2.5 ? 0.5 : +(P.speed + 0.5).toFixed(1); this.p.game.toast?.(`Rychlost světel ${P.speed}×`); break;
      // pódium
      case 'stage2': P.toggleStage2(); P.syncStage2?.(); break;
      case 'led3': P.led3 = !P.led3; break;
      case 'stairs': A.toggleStairs(); break;
      // hrdina
      case 'heroPick': if (!A.hero(w)) A.summon(w); A.sel = w; this.heroView = w; break;
      case 'heroBack': this.heroView = null; break;
      case 'act': A.act(this.heroView, w); break;
      case 'possess': A.possess(this.heroView); break;
      case 'sumAll': A.summon(); break;
      // všichni
      case 'cmd': A.cmd(w); break;
      // brána
      case 'gate': A.toggleGate(); break;
      case 'exo': A.startExodus(); break;
      case 'ret': A.startReturn(); break;
      // Doom
      case 'doom': A.toggleDoom(); break;
      case 'vs': A.attackDoom(w); break;
    }
  }

  render() {
    const el = this.el; if (!el) return;
    const P = this.p, A = this.av, b = (k, v, ic, cls = '', w = '', tag = '') => `<button data-k="${k}" data-v="${v}"${w !== '' ? ` data-w="${w}"` : ''} class="${cls}" aria-label="${v}">${ic}${tag ? `<span class="tag">${tag}</span>` : ''}</button>`;
    let h = `<div class="col">${GROUPS.map(([g, ic]) => b('grp', g, ic, this.grp === g ? 'sel' : '')).join('')}</div>`;
    if (this.grp) {
      const items = this.items(b);
      const gi = GROUPS.findIndex(([g]) => g === this.grp), bottom = 58 + gi * 48 - 3; // řádek u své skupiny
      h += `<div class="row" style="bottom:${Math.max(0, bottom)}px">${items.join('')}</div>`;
    }
    h += b('main', 'menu', this.open ? '✕' : '🎛️', 'main');
    el.innerHTML = h; el.classList.toggle('open', this.open);
  }
  items(b) {
    const P = this.p, A = this.av, a = (v, ic, cls = '', w = '', tag = '') => b('a', v, ic, cls, w, tag);
    const live = (id) => A.hero(id), heroes = ['iron', 'cap', 'thor', 'spidey', 'hulk'];
    switch (this.grp) {
      case 'music': return [a('prev', '⏮'), a('play', P.music && !P.music.paused ? '⏸' : '▶'), a('next', '⏭'), ...[0, 1, 2, 3, 4].map((i) => a('track', i ? '🎤' : '🎧', P.ti === i ? 'on' : '', i, NUM[i]))];
      case 'light': return [...Object.keys(FX_ICONS).map((k) => a('fx', FX_ICONS[k], P.fx[k] ? 'on' : '', k)), a('color', '🎨'), a('style', '🎚️', '', '', { auto: 'A', disco: 'D', hiphop: 'H' }[P.lightStyle]), a('speed', '⏩', '', '', `${P.speed}`), a('allOn', '✅'), a('allOff', '⛔'), a('rnd', '🎲')];
      case 'stage': return [a('stage2', '🛤️', P.stage2 ? 'on' : ''), a('led3', '📺', P.led3 ? 'on' : '', '', '3'), a('stairs', '🪜', A.stairs?.on ? 'on' : '')];
      case 'hero': {
        if (this.heroView && live(this.heroView)) {
          const H = live(this.heroView), ABIL = { iron: ['fly', 'shoot'], cap: ['swapHammer', 'swapAxe'], thor: ['swapHammer', 'swapAxe', 'bolts'], spidey: ['swing', 'web'], hulk: ['smash', 'leap'] }[H.id];
          return [a('heroBack', HERO_ICONS[H.id], 'sel'), ...ABIL.map((x) => a('act', ACT_ICONS[x], ACT_ICONS[x].length > 2 ? 'sm' : '', x)), a('possess', '🎮', A.ctrl === H ? 'on' : '')];
        }
        return [...heroes.map((id) => a('heroPick', HERO_ICONS[id], live(id) ? (A.ctrl === live(id) ? 'on' : '') : 'off', id, A.ctrl === live(id) ? '🎮' : '')), a('sumAll', '🦸', '', '', '+')];
      }
      case 'team': return [a('cmd', '🛤️', '', 'stage2'), a('cmd', '🏟️', '', 'stage'), a('cmd', '🔨🪓', 'sm', 'duel'), a('cmd', '🎤', A.sing ? 'on' : '', 'sing'), a('cmd', '⚔️', A.attack ? 'on' : 'red', 'attack')];
      case 'gate': {
        const gs = A.gate?.st, up = gs && gs !== 'down' && gs !== 'lower';
        return [a('gate', '🌀', up ? 'on' : ''), a('stairs', '🪜', A.stairs?.on ? 'on' : ''), a('exo', '🚶', A.exodus ? 'on' : '', '', '🌀'), a('ret', '↩️', '', '', '👥'), a('cmd', '🎤', '', 'rapLeave', '✖'), a('cmd', '🎤', '', 'rapBack', '↩'), a('cmd', '🦸', '', 'leave', '✖'), a('cmd', '🦸', '', 'avBack', '↩')];
      }
      case 'doom': {
        const D = A.doom, out = [a('doom', '☠️', D ? 'on' : 'red', '', D ? Math.max(0, Math.ceil(D.hp)) : '')];
        if (D && D.st === 'stand') { for (const id of heroes) if (live(id)) out.push(a('vs', HERO_ICONS[id], live(id).vs ? 'on' : '', id, '⚔')); out.push(a('vs', '⚔️', '', 'all')); }
        return out;
      }
    }
    return [];
  }
}
