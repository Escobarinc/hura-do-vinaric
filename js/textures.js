import * as THREE from 'three';

/*
 * Procedurální textury. Fasáda = 4 × 4 okenní pole (jedno pole ≈ 3 m × 3,1 m).
 * Zdi jsou světlé (barví je vertex color), okna tmavá, aby tónování nepřebarvilo sklo.
 */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function noise(ctx, w, h, amt, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = ((s / 2147483647) - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const T = 128; // px na pole (1 okenní osa × 1 patro)
/*
 * Styly fasád. Zeď je světlá (barví ji vertex color), detaily jsou odstíny šedi, sklo tmavé.
 * win = [x, y, w, h] okna v poli (0–1, y od horního okraje pole).
 */
export const STYLES = {
  // baroko / renesance – vysoká okna se šambránou, štítky nad okny v 1. patře, lizény
  baroque: { wall: '#f1ebe1', win: [0.32, 0.2, 0.36, 0.56], frame: '#fbf8f2', glass: '#28323e', surround: true, pediment: true, pilaster: true, cornice: true, cross: true },
  // historismus 19. stol. – římsy nad okny, kordonové římsy
  grunder: { wall: '#eee8dd', win: [0.3, 0.22, 0.4, 0.56], frame: '#faf6ee', glass: '#2a3440', hood: true, cornice: true, ledge: true, cross: true },
  // secese – segmentově zaklenutá okna, vlys pod korunní římsou
  secession: { wall: '#f0ebe0', win: [0.28, 0.2, 0.44, 0.56], frame: '#fbf7ef', glass: '#2b3542', segment: true, band: true, ledge: true, cross: true },
  // Gočárova cihla (meziválka) – režné zdivo, bílé rámy, betonové nadpraží
  brick: { wall: '#f0e2da', win: [0.18, 0.24, 0.64, 0.5], frame: '#ffffff', glass: '#26303b', brick: true, lintel: true, mullion: true },
  // funkcionalismus – pásová okna, hladká omítka
  functional: { wall: '#f4f2ee', win: [0.0, 0.3, 1.0, 0.4], frame: '#e8e6e1', glass: '#2c3846', ribbon: true, mullion: true },
  // sorela 50. let – pravidelná okna se šambránou
  sorela: { wall: '#ece6da', win: [0.3, 0.25, 0.4, 0.48], frame: '#f7f3ea', glass: '#2a333e', surround: true, ledge: true, cross: true },
  // panelák – pásy oken, spáry panelů, balkony
  panel: { wall: '#e6e3dc', win: [0.14, 0.3, 0.72, 0.4], frame: '#f4f2ec', glass: '#26303a', joints: true, balcony: true },
  // panelák s lodžiemi
  panel2: { wall: '#ebe8e1', win: [0.1, 0.28, 0.8, 0.42], frame: '#f6f4ef', glass: '#27313b', joints: true, loggia: true },
  // rodinné domy
  house: { wall: '#f0ebe2', win: [0.32, 0.28, 0.36, 0.42], frame: '#ffffff', glass: '#2b3540', ledge: true, cross: true },
  house2: { wall: '#f2ede4', win: [0.34, 0.26, 0.32, 0.44], frame: '#ffffff', glass: '#2b3540', shutters: true, sparse: true },
  // úřady, školy
  civic: { wall: '#e9e6df', win: [0.12, 0.2, 0.76, 0.56], frame: '#d9d6cf', glass: '#2f3d4a', mullion: true },
  // moderní kancelářská budova – skleněný plášť
  glass: { wall: '#c9ced3', win: [0.04, 0.06, 0.92, 0.82], frame: '#aab1b8', glass: '#3a5266', mullion: true, curtain: true },
  // průmysl – plech
  industrial: { wall: '#dcdad4', win: [0.2, 0.62, 0.6, 0.16], frame: '#cfcdc6', glass: '#3a444c', ribs: true, sparse: true },
  // kostely – kámen, úzká vysoká okna
  church: { wall: '#ece4d4', win: [0.4, 0.18, 0.2, 0.66], frame: '#e5dccb', glass: '#2a2f3a', arch: true, sparse: true },
  // věznice – hladká omítka, menší okna s mřížemi
  prison: { wall: '#e6e2d8', win: [0.3, 0.3, 0.4, 0.4], frame: '#cfcbc2', glass: '#2a3036', bars: true, ledge: true },
};

function drawFacade(style, lit) {
  const S = T * 4;
  const [c, g] = canvas(S, S);
  g.fillStyle = lit ? '#000' : style.wall;
  g.fillRect(0, 0, S, S);
  if (!lit) {
    if (style.brick) {
      g.fillStyle = 'rgba(0,0,0,.07)';
      for (let y = 0; y < S; y += 8) {
        g.fillRect(0, y, S, 1.5);
        for (let x = ((y / 8) % 2) * 9; x < S; x += 18) g.fillRect(x, y, 1.5, 8);
      }
      noise(g, S, S, 26, 21);
    }
    if (style.ribs) {
      g.fillStyle = 'rgba(0,0,0,.06)';
      for (let x = 0; x < S; x += 12) g.fillRect(x, 0, 5, S);
    }
    if (style.joints) {
      g.fillStyle = 'rgba(0,0,0,.10)';
      for (let i = 0; i <= 4; i++) { g.fillRect(0, i * T - 1, S, 2); g.fillRect(i * T * 2 - 1, 0, 2, S); }
    }
    if (style.pilaster) {
      for (let i = 0; i <= 4; i++) {
        g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(i * T - 9, 0, 18, S);
        g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(i * T + 9, 0, 3, S);
      }
    }
    if (style.cornice || style.ledge) {
      // kordonové římsy mezi patry (světlá hrana + stín)
      for (let i = 0; i < 4; i++) {
        g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, i * T, S, 5);
        g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, i * T + 5, S, 4);
      }
    }
    if (style.band) {
      // secesní vlys v nejvyšším patře
      g.fillStyle = 'rgba(0,0,0,.07)';
      g.fillRect(0, 4, S, 16);
      g.fillStyle = 'rgba(255,255,255,.4)';
      for (let x = 0; x < S; x += 32) { g.beginPath(); g.arc(x + 16, 12, 6, 0, 7); g.fill(); }
    }
    if (!style.brick) noise(g, S, S, 14, 7);
  }
  let seed = 3 + (style.win[0] * 100 | 0);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (style.sparse && (row + col) % 2 === 1) { rnd(); continue; }
      const [wx, wy, ww, wh] = style.win;
      const x = col * T + wx * T, y = row * T + wy * T, w = ww * T, h = wh * T;
      const on = rnd() < 0.33;
      if (lit) {
        if (on) {
          const warm = rnd();
          g.fillStyle = warm < 0.7 ? '#ffd58a' : warm < 0.9 ? '#ffe9c2' : '#bcd6ff';
          g.fillRect(x, y, w, h);
        }
        continue;
      }
      if (style.loggia) {
        // zapuštěná lodžie – tmavý pás se zábradlím
        g.fillStyle = 'rgba(0,0,0,.22)';
        g.fillRect(col * T + 4, row * T + 14, T - 8, T - 22);
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.fillRect(col * T + 4, row * T + T * 0.66, T - 8, T * 0.24);
      }
      if (style.balcony && col % 2 === 0) {
        g.fillStyle = 'rgba(0,0,0,.14)';
        g.fillRect(x - 6, y + h - 4, w + 12, 14);
      }
      if (style.surround) {
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillRect(x - 12, y - 12, w + 24, h + 22);
        g.fillStyle = 'rgba(0,0,0,.10)';
        g.fillRect(x - 12, y + h + 10, w + 24, 4);
      }
      if (style.pediment && row === 1) {
        // trojúhelníkový štítek nad oknem 1. patra
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.beginPath(); g.moveTo(x - 16, y - 14); g.lineTo(x + w / 2, y - 38); g.lineTo(x + w + 16, y - 14); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.stroke();
      } else if (style.hood) {
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillRect(x - 14, y - 18, w + 28, 9);
        g.fillStyle = 'rgba(0,0,0,.14)';
        g.fillRect(x - 12, y - 9, w + 24, 4);
      }
      if (style.lintel) {
        g.fillStyle = '#e9e7e2';
        g.fillRect(x - 6, y - 12, w + 12, 10);
        g.fillRect(x - 6, y + h + 2, w + 12, 7);
      }
      if (style.shutters) {
        g.fillStyle = 'rgba(70,90,70,.55)';
        g.fillRect(x - w * 0.42, y, w * 0.38, h);
        g.fillRect(x + w * 1.04, y, w * 0.38, h);
      }
      g.fillStyle = style.frame;
      if (!style.ribbon && !style.curtain) g.fillRect(x - 5, y - 5, w + 10, h + 10);
      const grd = g.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, style.glass);
      grd.addColorStop(0.55, '#4a5b70');
      grd.addColorStop(1, style.glass);
      g.fillStyle = grd;
      if (style.arch || style.segment) {
        const r = style.arch ? w / 2 : w * 0.7;
        const top = style.arch ? y + w / 2 : y + w * 0.22;
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x, top);
        if (style.arch) g.arc(x + w / 2, top, w / 2, Math.PI, 0);
        else { const a = Math.asin((w / 2) / r); g.arc(x + w / 2, top + r * Math.cos(a), r, -Math.PI / 2 - a, -Math.PI / 2 + a); }
        g.lineTo(x + w, y + h);
        g.closePath();
        g.fill();
        if (style.segment) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 6; g.stroke(); }
      } else g.fillRect(x, y, w, h);
      g.fillStyle = style.frame;
      if (style.curtain) {
        g.fillRect(x, y + h * 0.5 - 2, w, 4);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(x + w * 0.1, y, w * 0.25, h);
      }
      if (style.mullion) for (let m = 1; m < 3; m++) g.fillRect(x + (w * m) / 3 - 1.5, y, 3, h);
      else if (style.cross) { g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.38, w, 4); }
      if (style.bars) {
        // mříže: svislé pruty a dvě příčky
        g.fillStyle = '#3d3f42';
        for (let m = 1; m < 6; m++) g.fillRect(x + (w * m) / 6 - 2, y - 3, 4, h + 6);
        g.fillRect(x - 3, y + h * 0.3 - 2, w + 6, 4);
        g.fillRect(x - 3, y + h * 0.7 - 2, w + 6, 4);
      }
      if (style.ledge) {
        g.fillStyle = 'rgba(0,0,0,.18)';
        g.fillRect(x - 8, y + h + 5, w + 16, 5);
      }
    }
  }
  return toTex(c);
}

function toTex(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Obchody v přízemí: 4 výlohy / dveře, pás s vývěsním štítem, místy markýzy. */
function drawShops(lit) {
  const W = T * 4, H = T;
  const [c, g] = canvas(W, H);
  g.fillStyle = lit ? '#000' : '#efe9df';
  g.fillRect(0, 0, W, H);
  const signs = ['#7a2c2c', '#1f3f6b', '#2f5d3a', '#3a3a3a', '#8c6a1d', '#5b2f62', '#a0442a', '#215e6b'];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 4; k++) {
    const x = k * T;
    const door = rnd() < 0.3;
    const sc = signs[Math.floor(rnd() * signs.length)];
    const awning = rnd() < 0.35;
    if (lit) {
      g.fillStyle = rnd() < 0.7 ? '#ffe2a8' : '#dff0ff';
      g.fillRect(x + 12, 40, T - 24, H - 46);
      continue;
    }
    // štít
    g.fillStyle = sc; g.fillRect(x + 8, 14, T - 16, 18);
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let t = 0; t < 5; t++) g.fillRect(x + 22 + t * 17, 21, 11, 4);
    // výloha / dveře
    g.fillStyle = '#3b3a38'; g.fillRect(x + 8, 36, T - 16, H - 36);
    const grd = g.createLinearGradient(x, 40, x + T, H);
    grd.addColorStop(0, '#2b3542'); grd.addColorStop(0.5, '#5d6f84'); grd.addColorStop(1, '#2b3542');
    g.fillStyle = grd;
    if (door) { g.fillRect(x + 14, 40, (T - 28) * 0.55, H - 44); g.fillRect(x + 14 + (T - 28) * 0.6, 40, (T - 28) * 0.4, H - 44); }
    else g.fillRect(x + 12, 40, T - 24, H - 50);
    if (awning) {
      for (let st = 0; st < 8; st++) {
        g.fillStyle = st % 2 ? '#f2efe8' : sc;
        g.fillRect(x + 8 + st * ((T - 16) / 8), 32, (T - 16) / 8, 14);
      }
    }
  }
  // sokl
  if (!lit) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, H - 6, W, 6); noise(g, W, H, 10, 5); }
  return toTex(c);
}

/** Podloubí: pilíře a oblouky, ve stínu výlohy. */
function drawArcade(lit) {
  const W = T * 4, H = T;
  const [c, g] = canvas(W, H);
  g.fillStyle = lit ? '#000' : '#f1ebe0';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) {
    const x = k * T + 14, w = T - 28, top = 26, r = w / 2;
    g.beginPath();
    g.moveTo(x, H); g.lineTo(x, top + r); g.arc(x + r, top + r, r, Math.PI, 0); g.lineTo(x + w, H); g.closePath();
    if (lit) { g.fillStyle = '#ffd99a'; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; continue; }
    const grd = g.createLinearGradient(0, top, 0, H);
    grd.addColorStop(0, '#2a2622'); grd.addColorStop(1, '#4a443d');
    g.fillStyle = grd; g.fill();
    // výloha v hloubi podloubí
    g.fillStyle = 'rgba(120,150,175,.35)';
    g.fillRect(x + 10, top + r * 0.9, w - 20, H - top - r * 0.9 - 8);
    // klenák a profil oblouku
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 5;
    g.beginPath(); g.arc(x + r, top + r, r + 2, Math.PI, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + r - 4, top - 6, 8, 10);
  }
  if (!lit) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, H - 5, W, 5); noise(g, W, H, 10, 3); }
  return toTex(c);
}

export function facadeTextures() {
  const out = {};
  for (const k of Object.keys(STYLES)) out[k] = { map: drawFacade(STYLES[k], false), emissive: drawFacade(STYLES[k], true) };
  out.shop = { map: drawShops(false), emissive: drawShops(true) };
  out.arcade = { map: drawArcade(false), emissive: drawArcade(true) };
  return out;
}

export function asphaltTexture(marked) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#5a5b5e';
  g.fillRect(0, 0, 128, 256);
  noise(g, 128, 256, 22, marked ? 11 : 5);
  if (marked) {
    g.fillStyle = '#e9e6dc';
    g.fillRect(62, 0, 4, 150);
    g.fillStyle = 'rgba(233,230,220,.85)';
    g.fillRect(4, 0, 3, 256);
    g.fillRect(121, 0, 3, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function pavingTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#b7afa3';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,.12)';
  g.lineWidth = 2;
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 128; x += 32) g.strokeRect(x + ((y / 16) % 2) * 16, y, 32, 16);
  }
  noise(g, 128, 128, 18, 9);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function groundTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#93917f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const gr = Math.random() < 0.5;
    g.fillStyle = gr
      ? `rgba(${95 + Math.random() * 30},${110 + Math.random() * 30},${70 + Math.random() * 20},.22)`
      : `rgba(${130 + Math.random() * 30},${125 + Math.random() * 25},${110 + Math.random() * 20},.25)`;
    const r = 4 + Math.random() * 18;
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, 7); g.fill();
  }
  noise(g, 256, 256, 18, 13);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function grassTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roofTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,.10)';
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2);
  noise(g, 64, 64, 20, 17);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function waterTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.3})`;
    g.fillStyle = `rgba(200,220,235,${Math.random() * 0.4})`;
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillRect(x, y, 10 + Math.random() * 30, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Text na tabuli (pro cedule). */
export function labelTexture(text, bg = '#1f4f9a', fg = '#fff', w = 512, h = 128) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `800 ${Math.round(h * 0.52)}px "Manrope", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Betonová zeď z panelů (1 dlaždice = 1 panel ~3 m): spáry, stékající šmouhy. */
export function prisonWallTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#d9d6ce';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 16, 11);
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(80,76,70,${0.03 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, 10, 2 + Math.random() * 6, 80 + Math.random() * 160);
  }
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(0, 0, 3, 256);
  g.fillRect(253, 0, 3, 256);
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.fillRect(0, 128, 256, 2);
  g.fillStyle = 'rgba(60,70,60,.25)';
  g.fillRect(0, 236, 256, 20); // vlhko u paty zdi
  return toTex(c);
}

/** Pletivo (kosočtverce) s průhledností. */
export function chainLinkTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(190,196,200,1)';
  g.lineWidth = 2.2;
  for (let i = -128; i < 256; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Žiletkový drát (smyčky) na válci – průhledná textura. */
export function razorWireTexture() {
  const [c, g] = canvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(205,210,214,1)';
  g.lineWidth = 3;
  for (let x = -40; x < 300; x += 22) {
    g.beginPath(); g.ellipse(x, 64, 30, 58, 0.5, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = 'rgba(230,234,236,1)';
  for (let i = 0; i < 90; i++) g.fillRect(Math.random() * 256, Math.random() * 128, 5, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
