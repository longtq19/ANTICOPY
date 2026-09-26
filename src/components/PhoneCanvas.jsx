import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { isConcealed, useGuard } from '../protection/guard.js';

function draw(canvas, g) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(g.w * dpr);
  canvas.height = Math.round(g.h * dpr);
  canvas.style.width = `${g.w}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
  ctx.lineWidth = 1;
  for (const [x1, y1, cx, cy, x2, y2] of g.n) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
  }

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = g.lw;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of g.s) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

function wipe(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/** Press-and-hold to view. The number is drawn from server-sent vector strokes, never as text. */
export default function PhoneCanvas({ customerId }) {
  const canvasRef = useRef(null);
  const hold = useRef({ active: false, req: 0, timer: 0 });
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const { concealed } = useGuard();

  const hide = useCallback(() => {
    const h = hold.current;
    h.active = false;
    h.req += 1;
    clearTimeout(h.timer);
    wipe(canvasRef.current);
    setState((s) => (s === 'error' ? s : 'idle'));
  }, []);

  const start = async () => {
    if (isConcealed()) return;
    const h = hold.current;
    h.active = true;
    const req = ++h.req;
    setState('loading');
    try {
      const glyph = await api.phoneGlyph(customerId);
      if (!h.active || req !== h.req || isConcealed()) return;
      draw(canvasRef.current, glyph);
      setState('shown');
      h.timer = setTimeout(hide, glyph.ttl);
    } catch (err) {
      if (req !== h.req) return;
      h.active = false;
      setError(err.message);
      setState('error');
      h.timer = setTimeout(() => setState('idle'), 3000);
    }
  };

  useEffect(() => {
    if (concealed) hide();
  }, [concealed, hide]);
  useEffect(() => hide, [hide]);

  const onKeyDown = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      start();
    }
  };
  const onKeyUp = (e) => {
    if (e.key === ' ' || e.key === 'Enter') hide();
  };

  return (
    <div className="phone ac-protected" data-state={state}>
      <div className="phone-view" title={state === 'error' ? error : undefined}>
        <canvas ref={canvasRef} data-ac-protected="1" aria-hidden="true" className="phone-canvas" />
        {state !== 'shown' && (
          <span className="phone-mask">
            {state === 'loading' ? 'Đang tải…' : state === 'error' ? error : '•••• ••• •••'}
          </span>
        )}
      </div>
      <button
        type="button"
        className="phone-btn"
        disabled={concealed}
        onPointerDown={(e) => {
          e.preventDefault();
          start();
        }}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={hide}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Nhấn giữ để xem số điện thoại"
      >
        {concealed ? 'Đã ẩn' : 'Giữ để xem'}
      </button>
    </div>
  );
}
