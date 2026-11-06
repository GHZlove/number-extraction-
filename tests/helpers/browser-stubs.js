// DOM/Canvas contract doubles for Node tests; these do not verify browser layout,
// native event defaults, accessibility or real device compatibility.
import { readFileSync } from 'node:fs';

export function browserStubs(t) {
  const ids = new Map(), all = [], frames = [], drawCalls = [];
  const originals = new Map();
  function install(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const contextMethods = new Set(['beginPath','arc','fill','stroke','fillRect','strokeRect','clearRect','moveTo','lineTo',
    'save','restore','translate','rotate','scale','setTransform','roundRect','setLineDash','fillText','createLinearGradient','createRadialGradient']);
  function context() {
    const state = {};
    return new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        if (!contextMethods.has(key)) throw new Error(`Unexpected Canvas method: ${String(key)}`);
        return (...args) => {
          for (const arg of args.flat()) if (typeof arg === 'number' && !Number.isFinite(arg)) throw new Error(`Non-finite Canvas argument: ${key}`);
          drawCalls.push({ method: key, args, strokeStyle: target.strokeStyle });
          if (key === 'createLinearGradient'||key==='createRadialGradient') return { addColorStop() {} };
        };
      },
    });
  }
  class Element {
    constructor(tagName = 'DIV') {
      this.tagName = tagName; this.listeners = new Map(); this.dataset = {}; this.children = [];
      this.clientWidth = 900; this.clientHeight = 600; this.style = { setProperty(key, value) { this[key] = value; } };
      const classes = new Set();
      this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x),
        toggle: (x, force) => { const add = force ?? !classes.has(x); if (add) classes.add(x); else classes.delete(x); return add; } };
      all.push(this);
    }
    addEventListener(type, fn) { const handlers = this.listeners.get(type) || []; handlers.push(fn); this.listeners.set(type, handlers); }
    dispatch(type, extra = {}) {
      const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const handler of this.listeners.get(type) || []) handler(event);
      this['on'+type]?.(event); return event;
    }
    setAttribute(name, value) { this[name] = value; if (name === 'id') ids.set(value, this); }
    setPointerCapture() {}
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { left: 100, top: 80, width: this.clientWidth, height: this.clientHeight }; }
    getContext() { return this.context ||= context(); }
    closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; }
    set innerHTML(value) {
      this.html = value; this.children = [];
      for (const match of value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const button = new Element('BUTTON');
        button.disabled = /\bdisabled\b/.test(match[1]); button.textContent = match[2];
        for (const attr of match[1].matchAll(/data-(action|key)="([^"]*)"/g)) button.dataset[attr[1]] = attr[2];
        this.children.push(button);
      }
    }
    get innerHTML() { return this.html || ''; }
    querySelectorAll(selector) {
      if (selector === 'span') return this.spans ||= Array.from({ length: 5 }, () => new Element('SPAN'));
      if (selector === 'button:not(:disabled),a[href]') return this.children.filter(child => !child.disabled);
      throw new Error(`Unexpected element selector: ${selector}`);
    }
    querySelector(selector) {
      if (selector === 'button:not(:disabled)') return this.children.find(child => !child.disabled) || null;
      const action=selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      if(action)return this.children.find(child=>child.dataset.action===action)||null;
      throw new Error(`Unexpected element selector: ${selector}`);
    }
  }
  const html = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    if (ids.has(match[3])) throw new Error(`Duplicate HTML id: ${match[3]}`);
    const element = new Element(match[1].toUpperCase()); element.id = match[3]; ids.set(match[3], element);
    if (element.tagName === 'CANVAS') {
      element.width = Number(match[2].match(/\bwidth="(\d+)"/)?.[1] || 300);
      element.height = Number(match[2].match(/\bheight="(\d+)"/)?.[1] || 150);
    }
  }
  const controls = [];
  for (const match of html.matchAll(/<button\b([^>]*\bdata-control="([^"]+)"[^>]*)>/g)) {
    const button = new Element('BUTTON'); button.dataset.control = match[2]; button.small = new Element('SMALL');
    button.touch = /touch-button/.test(match[1]); controls.push(button);
  }
  const document = new Element(); document.hidden = false;document.body=new Element('BODY');document.body.dataset.screen='shelter';
  document.getElementById = id => ids.get(id) || null;
  document.querySelectorAll = selector => {
    if (selector === '[data-control]') return controls;
    if (selector === '.held') return all.filter(element => element.classList.contains('held'));
    throw new Error(`Unexpected document selector: ${selector}`);
  };
  document.querySelector = selector => {
    const code = selector.match(/^\.touch-actions \[data-control="([^"]+)"\] small$/)?.[1];
    if (code) {
      const button = controls.find(element => element.touch && element.dataset.control === code);
      if (!button) throw new Error(`Missing touch control in index.html: ${code}`);
      return button.small;
    }
    if (selector === '#dialog h1') return ids.get('dialog').innerHTML.includes('<h1>') ? new Element('H1') : null;
    throw new Error(`Unexpected document selector: ${selector}`);
  };
  const storageData=new Map();
  const window = new Element(); window.localStorage = { getItem: key => storageData.get(key) ?? null, setItem(key,value) {storageData.set(key,String(value));} };
  const canvas = ids.get('game-canvas'); canvas.parentElement = ids.get('arena');
  install('window', window); install('document', document); install('innerWidth', 1280); install('devicePixelRatio', 2);
  install('matchMedia', () => ({ matches: false }));
  install('ResizeObserver', class { observe() {} });
  install('requestAnimationFrame', fn => { frames.push(fn); return frames.length; });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { ids, window, document, canvas, controls, frames, drawCalls };
}
