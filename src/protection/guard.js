import { useSyncExternalStore } from 'react';

/**
 * Client-side protection layer. Keeps a set of active "conceal reasons"; while
 * any is active every phone canvas is wiped and protected areas are blurred.
 */

export const REASON_LABELS = {
  blur: 'Cửa sổ mất focus',
  hidden: 'Tab đang bị ẩn',
  'pointer-out': 'Con trỏ đã rời khỏi trang',
  devtools: 'Phát hiện DevTools đang mở',
  screenshot: 'Phát hiện thao tác chụp màn hình',
  shortcut: 'Phím tắt bị chặn',
  print: 'Không cho phép in trang',
  tamper: 'Phát hiện can thiệp giao diện — hãy tải lại trang',
};

const reasons = new Map();
const listeners = new Set();
let snapshot = { concealed: false, reasons: [] };
let reporter = () => {};

function emit() {
  const list = [...reasons.keys()];
  snapshot = { concealed: list.length > 0, reasons: list };
  document.documentElement.classList.toggle('ac-concealed', snapshot.concealed);
  listeners.forEach((fn) => fn());
}

export function conceal(reason, ms) {
  const until = ms ? Date.now() + ms : Infinity;
  if ((reasons.get(reason) ?? 0) >= until) return;
  reasons.set(reason, until);
  if (ms) {
    setTimeout(() => {
      if (reasons.get(reason) === until) {
        reasons.delete(reason);
        emit();
      }
    }, ms);
  }
  emit();
}

export function unconceal(reason) {
  if (reasons.delete(reason)) emit();
}

export const isConcealed = () => snapshot.concealed;

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useGuard = () => useSyncExternalStore(subscribe, () => snapshot);

const lastReported = new Map();
/** Conceal and report a security event to the server (deduplicated per 5s). */
export function raise(kind, { reason = kind, ms, detail = '' } = {}) {
  if (reason) conceal(reason, ms);
  const now = Date.now();
  if (now - (lastReported.get(kind) ?? 0) < 5000) return;
  lastReported.set(kind, now);
  reporter(kind, detail);
}

function debuggerTrap() {
  // eslint-disable-next-line no-debugger
  debugger;
}

const toElement = (t) => (t instanceof Element ? t : t?.parentElement ?? null);
const inProtected = (t) => !!toElement(t)?.closest('.ac-protected');
const isEditable = (t) => !!toElement(t)?.closest('input, textarea, select, [contenteditable="true"]');

function wipeClipboard() {
  navigator.clipboard?.writeText?.('Nội dung được bảo vệ').catch(() => {});
}

function keyName(e) {
  const code = e.code || '';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return (e.key || '').toLowerCase();
}

export function installGuard(report) {
  reporter = report;
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  // --- Copy / select / drag / context menu ---
  const selectionTouchesProtected = () => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) return false;
    return [...document.querySelectorAll('.ac-protected')].some((el) => sel.containsNode(el, true));
  };
  const blockCopy = (e) => {
    if (inProtected(e.target) || selectionTouchesProtected()) {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', '');
    }
  };
  on(document, 'copy', blockCopy);
  on(document, 'cut', blockCopy);
  on(document, 'contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
  on(document, 'selectstart', (e) => {
    if (inProtected(e.target)) e.preventDefault();
  });
  on(document, 'dragstart', (e) => {
    if (inProtected(e.target) || e.target instanceof HTMLCanvasElement) e.preventDefault();
  });

  // --- Keyboard: screenshot keys, DevTools / view-source / save / print shortcuts ---
  const screenshotHit = (detail) => {
    wipeClipboard();
    raise('screenshot-key', { reason: 'screenshot', ms: 4000, detail });
  };
  on(
    window,
    'keydown',
    (e) => {
      const key = keyName(e);
      const mod = e.ctrlKey || e.metaKey;
      if (key === 'printscreen' || (e.metaKey && e.shiftKey && ['s', '3', '4', '5'].includes(key))) {
        screenshotHit(key);
        return;
      }
      // The OS usually swallows Win+Shift+S / Cmd+Shift+4, but the modifier itself reaches us first.
      if (key === 'meta' || key === 'os') {
        conceal('screenshot', 1500);
        return;
      }
      const devtools =
        key === 'f12' ||
        (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(key));
      if (devtools || (mod && ['u', 's', 'p'].includes(key))) {
        e.preventDefault();
        e.stopPropagation();
        const combo = `${e.ctrlKey ? 'Ctrl+' : ''}${e.metaKey ? 'Meta+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${key}`;
        raise(mod && key === 'p' ? 'print' : 'blocked-shortcut', { reason: 'shortcut', ms: 1500, detail: combo });
      }
    },
    true,
  );
  on(
    window,
    'keyup',
    (e) => {
      if (e.key === 'PrintScreen') screenshotHit('printscreen-up');
    },
    true,
  );

  // --- Focus / visibility / pointer: snipping tools & app switchers steal focus ---
  on(window, 'blur', () => conceal('blur'));
  on(window, 'focus', () => unconceal('blur'));
  on(document, 'visibilitychange', () => (document.hidden ? conceal('hidden') : unconceal('hidden')));
  on(document.documentElement, 'mouseleave', () => conceal('pointer-out'));
  on(document.documentElement, 'mouseenter', () => unconceal('pointer-out'));
  if (!document.hasFocus()) conceal('blur');

  // --- Print ---
  on(window, 'beforeprint', () => raise('print', { reason: 'print' }));
  on(window, 'afterprint', () => unconceal('print'));

  // --- DevTools detection: docked-panel size heuristic + debugger timing (production) ---
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  let devtoolsOpen = false;
  const timer = setInterval(() => {
    let open = false;
    let how = '';
    if (!coarsePointer && window.outerWidth > 0) {
      const w = window.outerWidth - window.innerWidth;
      const h = window.outerHeight - window.innerHeight;
      if (w > 160 || h > 220) {
        open = true;
        how = `size ${w}x${h}`;
      }
    }
    if (import.meta.env.PROD) {
      const t = performance.now();
      debuggerTrap();
      if (performance.now() - t > 100) {
        open = true;
        how = 'debugger';
      }
    }
    if (open !== devtoolsOpen) {
      devtoolsOpen = open;
      if (open) raise('devtools', { detail: how });
      else unconceal('devtools');
    }
  }, 1000);
  cleanups.push(() => clearInterval(timer));

  // --- Canvas read-back: block toDataURL / toBlob / getImageData on protected canvases ---
  const patch = (proto, name) => {
    const original = proto[name];
    if (!original) return;
    proto[name] = function patched(...args) {
      const canvas = this instanceof HTMLCanvasElement ? this : this.canvas;
      if (canvas?.dataset?.acProtected !== undefined) {
        raise('canvas-read', { reason: 'tamper', detail: name });
        throw new DOMException('Blocked by content protection', 'SecurityError');
      }
      return original.apply(this, args);
    };
    cleanups.push(() => {
      proto[name] = original;
    });
  };
  patch(HTMLCanvasElement.prototype, 'toDataURL');
  patch(HTMLCanvasElement.prototype, 'toBlob');
  patch(CanvasRenderingContext2D.prototype, 'getImageData');

  return () => {
    cleanups.forEach((fn) => fn());
    reporter = () => {};
    reasons.clear();
    emit();
  };
}
