import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { raise } from '../protection/guard.js';

function buildTile(lines) {
  const w = 340;
  const h = 200;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 9);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.09)';
  ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * 18));
  return { url: canvas.toDataURL('image/png'), size: `${w}px ${h}px` };
}

/** Full-screen traceable watermark: any leaked screenshot shows who, where and when. */
export default function Watermark({ user }) {
  const ref = useRef(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tile = useMemo(
    () =>
      buildTile([
        `${user.displayName} · ${user.username}`,
        `${user.ip} · ${now.toLocaleString('vi-VN')}`,
        'TÀI LIỆU NỘI BỘ – KHÔNG CHIA SẺ',
      ]),
    [user, now],
  );

  useLayoutEffect(() => {
    const check = () => {
      const el = ref.current;
      const cs = el?.isConnected ? getComputedStyle(el) : null;
      if (
        !cs ||
        cs.display === 'none' ||
        cs.visibility !== 'visible' ||
        Number(cs.opacity) < 0.9 ||
        cs.backgroundImage === 'none' ||
        Number(cs.zIndex) < 1000
      ) {
        raise('tamper', { detail: 'watermark' });
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
    const timer = setInterval(check, 2000);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="watermark"
      aria-hidden="true"
      style={{ backgroundImage: `url(${tile.url})`, backgroundSize: tile.size }}
    />
  );
}
