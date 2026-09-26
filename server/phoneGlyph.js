/**
 * Turns a phone number into a shuffled bag of jittered line segments that the
 * client draws on a canvas. The number never travels as text (not in JSON, not
 * in the DOM), each response is geometrically different, and segment order
 * carries no information about digit order.
 */

// Stroke font on a 6 x 10 grid; each glyph is a list of polylines.
const GLYPHS = {
  0: [[[1, 0], [5, 0], [6, 1], [6, 9], [5, 10], [1, 10], [0, 9], [0, 1], [1, 0]]],
  1: [[[1, 2], [3, 0], [3, 10]], [[1, 10], [5, 10]]],
  2: [[[0, 2], [1, 0], [5, 0], [6, 1], [6, 4], [0, 10], [6, 10]]],
  3: [
    [[0, 1], [1, 0], [5, 0], [6, 1], [6, 4], [5, 5], [2, 5]],
    [[5, 5], [6, 6], [6, 9], [5, 10], [1, 10], [0, 9]],
  ],
  4: [[[5, 10], [5, 0], [0, 7], [6, 7]]],
  5: [[[6, 0], [0, 0], [0, 4], [4, 4], [6, 5.5], [6, 8.5], [4, 10], [0, 10]]],
  6: [[[5, 0], [2, 0], [0, 3], [0, 9], [1, 10], [5, 10], [6, 9], [6, 6], [5, 5], [0, 5]]],
  7: [[[0, 0], [6, 0], [2, 10]]],
  8: [
    [[1, 0], [5, 0], [6, 1], [6, 4], [5, 5], [1, 5], [0, 6], [0, 9], [1, 10], [5, 10], [6, 9], [6, 6], [5, 5]],
    [[1, 5], [0, 4], [0, 1], [1, 0]],
  ],
  9: [[[6, 5], [1, 5], [0, 4], [0, 1], [1, 0], [5, 0], [6, 1], [6, 7], [4, 10], [1, 10]]],
  '+': [[[3, 2], [3, 8]], [[0, 5], [6, 5]]],
};

const rand = (min, max) => min + Math.random() * (max - min);
const r1 = (v) => Math.round(v * 10) / 10;
const group3 = (digits) => digits.match(/.{1,3}/g).join(' ');

export function formatPhone(phone) {
  if (phone.startsWith('+84')) return `+84 ${group3(phone.slice(3))}`;
  if (phone.startsWith('+')) return `+${group3(phone.slice(1))}`;
  if (phone.length === 10) return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  return group3(phone);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function renderPhoneGlyph(phone) {
  const unit = rand(1.75, 2.05);
  const pad = 6;
  const top = pad + 2;
  const jitter = unit * 0.22;
  const segments = [];
  let x = pad;

  for (const ch of formatPhone(phone)) {
    if (ch === ' ') {
      x += unit * rand(3, 4);
      continue;
    }
    const glyph = GLYPHS[ch];
    if (!glyph) continue;

    const sx = unit * rand(0.9, 1.1);
    const angle = rand(-0.09, 0.09);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox = x + 3 * sx;
    const oy = top + 5 * unit + rand(-1.2, 1.2);
    const project = ([gx, gy]) => {
      const lx = (gx - 3) * sx;
      const ly = (gy - 5) * unit;
      return [ox + lx * cos - ly * sin + rand(-jitter, jitter), oy + lx * sin + ly * cos + rand(-jitter, jitter)];
    };

    for (const line of glyph) {
      const pts = line.map(project);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const mx = (x1 + x2) / 2 + rand(-jitter, jitter) * 0.6;
        const my = (y1 + y2) / 2 + rand(-jitter, jitter) * 0.6;
        segments.push([x1, y1, mx, my], [mx, my, x2, y2]);
      }
    }
    x += 6 * sx + unit * rand(2.2, 2.8);
  }

  const width = Math.ceil(x + pad);
  const height = Math.ceil(top + 10 * unit + pad + 2);
  const strokes = shuffle(segments).map((s) =>
    (Math.random() < 0.5 ? s : [s[2], s[3], s[0], s[1]]).map(r1),
  );
  const noise = Array.from({ length: 5 + Math.floor(Math.random() * 4) }, () =>
    [rand(0, width), rand(0, height), rand(0, width), rand(0, height), rand(0, width), rand(0, height)].map(r1),
  );

  return { w: width, h: height, lw: r1(unit * 0.85), s: strokes, n: noise };
}
