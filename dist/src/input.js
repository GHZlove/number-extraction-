export class Input {
  constructor(canvas, onPause, onInventory = () => {}) {
    this.keys = new Set(); this.pressed = new Set(); this.touchKeys = new Map();
    this.joy = { x: 0, y: 0 }; this.active = false;
    this.pointer = null; this.mouseAttack = false;
    const typing = target => /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName) || target?.isContentEditable;
    const controlled = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyR', 'KeyE', 'KeyF', 'KeyG', 'ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2']);
    window.addEventListener('keydown', event => {
      if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape' && !event.repeat) { onPause(); return; }
      if (event.code === 'KeyB' && !event.repeat) { event.preventDefault(); onInventory(); return; }
      if (!this.active || /^(BUTTON|A)$/.test(event.target?.tagName)) return;
      if (controlled.has(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    const aim = event => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') this.pointer = { x: event.clientX, y: event.clientY };
    };
    canvas.addEventListener('pointermove', aim);
    canvas.addEventListener('pointerdown', event => {
      aim(event);
      if (event.pointerType === 'mouse' && this.active && event.button === 0) {
        canvas.focus(); canvas.setPointerCapture(event.pointerId); this.mouseAttack = true;
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      window.addEventListener(type, () => { this.mouseAttack = false; });
    }
    canvas.addEventListener('pointerleave', () => { if (!this.mouseAttack) this.pointer = null; });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    for (const button of document.querySelectorAll('[data-control]')) {
      const code = button.dataset.control;
      button.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (!this.active) return;
        button.setPointerCapture(event.pointerId);
        this.touchKeys.set(event.pointerId, code); this.pressed.add(code); button.classList.add('held');
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
        this.touchKeys.delete(event.pointerId);
        if (![...this.touchKeys.values()].includes(code)) button.classList.remove('held');
      });
    }
    const joystick = document.getElementById('joystick'), knob = document.getElementById('joystick-knob');
    let pointerId = null;
    const update = event => {
      const rect = joystick.getBoundingClientRect();
      const dx = event.clientX-rect.left-rect.width/2, dy = event.clientY-rect.top-rect.height/2;
      const length = Math.hypot(dx, dy) || 1, amount = Math.min(length, 37);
      this.joy = { x: dx/length*amount/37, y: dy/length*amount/37 };
      knob.style.transform = `translate(${this.joy.x*37}px,${this.joy.y*37}px)`;
    };
    joystick.addEventListener('pointerdown', event => {
      event.preventDefault(); if (!this.active || pointerId !== null) return;
      pointerId = event.pointerId; joystick.setPointerCapture(pointerId); update(event);
    });
    joystick.addEventListener('pointermove', event => { if (event.pointerId === pointerId) update(event); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(type, event => {
      if (event.pointerId === pointerId) { pointerId = null; this.joy = { x: 0, y: 0 }; knob.style.transform = ''; }
    });
    this.resetJoystick = () => { pointerId = null; knob.style.transform = ''; };
  }
  clear() {
    this.keys.clear(); this.pressed.clear(); this.touchKeys.clear();
    this.mouseAttack = false; this.pointer = null; this.joy = { x: 0, y: 0 };
    this.resetJoystick?.(); document.querySelectorAll('.held').forEach(element => element.classList.remove('held'));
  }
  consume() {
    const touch = code => [...this.touchKeys.values()].includes(code);
    const held = code => this.keys.has(code) || touch(code);
    const state = {
      x: (held('KeyD') || held('ArrowRight') ? 1 : 0)-(held('KeyA') || held('ArrowLeft') ? 1 : 0)+this.joy.x,
      y: (held('KeyS') || held('ArrowDown') ? 1 : 0)-(held('KeyW') || held('ArrowUp') ? 1 : 0)+this.joy.y,
      attack: held('Space') || this.mouseAttack, autoAim: touch('Space'),
      interact: held('KeyE'), divide: this.pressed.has('KeyQ'), heal: this.pressed.has('KeyR'),
      dash: this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'), pickup: this.pressed.has('KeyF'), overload: this.pressed.has('KeyG'),
      slot: this.pressed.has('Digit1') ? 0 : this.pressed.has('Digit2') ? 1 : undefined,
      pointer: this.pointer ? { ...this.pointer } : null,
    };
    this.pressed.clear(); return state;
  }
}
