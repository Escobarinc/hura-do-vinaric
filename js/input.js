/** Klávesnice, myš a dotykové ovládání. */
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.joy = { x: 0, y: 0, active: false };
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.canvas = canvas;

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Tab', 'Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.touch && this.enabled && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* např. ve vloženém okně */ }
      }
    });
    // bez zamčení myši: otáčení tažením
    let drag = false;
    canvas.addEventListener('mousedown', (e) => {
      drag = true;
      // střelba levým tlačítkem (i bez zamčené myši – v panelu aplikace zamčení nemusí jít)
      if (e.button === 0) { this.mouseBtn = true; this.pressed.add('Mouse0'); }
    });
    addEventListener('mouseup', (e) => { drag = false; if (e.button === 0) this.mouseBtn = false; });
    // kolečko myši – přepínání zbraní
    this.wheel = 0;
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || drag) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });

    if (this.touch) this.setupTouch();
  }

  setupTouch() {
    const joy = document.getElementById('joy');
    const knob = document.getElementById('joy-knob');
    let jid = null, cx = 0, cy = 0;
    joy.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      jid = t.identifier;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this.joy.active = true;
      e.preventDefault();
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) if (t.identifier === jid) {
        let dx = (t.clientX - cx) / 50, dy = (t.clientY - cy) / 50;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        this.joy.x = dx; this.joy.y = dy;
        knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === jid) {
        jid = null; this.joy.x = this.joy.y = 0; this.joy.active = false;
        knob.style.transform = '';
      }
    };
    joy.addEventListener('touchmove', move, { passive: true });
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);

    // otáčení kamery tahem po pravé části obrazovky
    let cid = null, lx = 0, ly = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) if (cid === null) { cid = t.identifier; lx = t.clientX; ly = t.clientY; }
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === cid) {
        this.mouseDX += (t.clientX - lx) * 2.2; this.mouseDY += (t.clientY - ly) * 2.2;
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: true });
    const cend = (e) => { for (const t of e.changedTouches) if (t.identifier === cid) cid = null; };
    this.canvas.addEventListener('touchend', cend);
    this.canvas.addEventListener('touchcancel', cend);

    for (const b of document.querySelectorAll('.tb')) {
      const k = b.dataset.k;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys.add(k); this.pressed.add(k); b.classList.add('active'); }, { passive: false });
      const up = () => { this.keys.delete(k); b.classList.remove('active'); };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
    }
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }

  /** Osy pohybu (-1..1): x = doprava, y = dopředu */
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}
