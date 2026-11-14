/* Raster helpers for map overlays: smooth outlines (marching squares) and soft-edged fills. */
(function (root) {
  'use strict';
  const Atlas = (root.Atlas = root.Atlas || {});

  /** 3x3 box blur of a w*h field (edges clamp). */
  function blur(field, w, h) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      tmp[k] = (field[y * w + Math.max(0, x - 1)] + field[k] + field[y * w + Math.min(w - 1, x + 1)]) / 3;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      out[k] = (tmp[Math.max(0, y - 1) * w + x] + tmp[k] + tmp[Math.min(h - 1, y + 1) * w + x]) / 3;
    }
    return out;
  }

  /** Bilinear upsample by an integer factor. */
  function upsample(field, w, h, f) {
    const W = w * f, H = h * f, out = new Float32Array(W * H);
    for (let Y = 0; Y < H; Y++) {
      const gy = Math.max(0, Math.min(h - 1.001, (Y + 0.5) / f - 0.5)), i = Math.floor(gy), fy = gy - i;
      for (let X = 0; X < W; X++) {
        const gx = Math.max(0, Math.min(w - 1.001, (X + 0.5) / f - 0.5)), j = Math.floor(gx), fx = gx - j, k = i * w + j;
        out[Y * W + X] = (field[k] * (1 - fx) + field[k + 1] * fx) * (1 - fy) + (field[k + w] * (1 - fx) + field[k + w + 1] * fx) * fy;
      }
    }
    return out;
  }

  /** Turn enclosed "outside" pockets of a 0/1 mask into "inside", so an outline has no pinholes. */
  function fillHoles(mask, w, h) {
    const out = new Uint8Array(w * h), stack = [];
    const push = (k) => { if (!mask[k] && !out[k]) { out[k] = 1; stack.push(k); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = (k - x) / w;
      if (x > 0) push(k - 1); if (x < w - 1) push(k + 1); if (y > 0) push(k - w); if (y < h - 1) push(k + w);
    }
    const filled = new Float32Array(w * h);
    for (let k = 0; k < w * h; k++) filled[k] = out[k] ? 0 : 1;      // not reachable from the border = inside
    return filled;
  }

  /** Marching squares: iso-lines of `field` at `level`, as polylines in cell-centre grid coordinates. */
  function isolines(field, w, h, level) {
    const sx = [], sy = [], ex = [], ey = [];
    const seg = (p, q) => { sx.push(p[0]); sy.push(p[1]); ex.push(q[0]); ey.push(q[1]); };
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const k = y * w + x, a = field[k], b = field[k + 1], c = field[k + w + 1], d = field[k + w];
        const idx = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const t = (p, q) => (level - p) / (q - p);
        const top = () => [x + t(a, b), y], right = () => [x + 1, y + t(b, c)], bottom = () => [x + t(d, c), y + 1], left = () => [x, y + t(a, d)];
        switch (idx) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 6: case 9: seg(top(), bottom()); break;
          case 7: case 8: seg(left(), top()); break;
          case 5: seg(left(), top()); seg(bottom(), right()); break;
          case 10: seg(top(), right()); seg(left(), bottom()); break;
        }
      }
    }
    const key = (px, py) => Math.round(px * 1024) * 2097152 + Math.round(py * 1024);
    const ends = new Map(), n = sx.length, used = new Uint8Array(n);
    const link = (kk, i) => { const v = ends.get(kk); if (v) v.push(i); else ends.set(kk, [i]); };
    for (let i = 0; i < n; i++) { link(key(sx[i], sy[i]), i); link(key(ex[i], ey[i]), i); }
    const lines = [];
    const extend = (line, px, py, atEnd) => {
      for (;;) {
        const cand = ends.get(key(px, py)); let next = -1;
        if (cand) for (const i of cand) if (!used[i]) { next = i; break; }
        if (next < 0) return;
        used[next] = 1;
        const fromStart = key(sx[next], sy[next]) === key(px, py);
        px = fromStart ? ex[next] : sx[next]; py = fromStart ? ey[next] : sy[next];
        if (atEnd) line.push([px, py]); else line.unshift([px, py]);
      }
    };
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const line = [[sx[i], sy[i]], [ex[i], ey[i]]];
      extend(line, ex[i], ey[i], true);
      extend(line, sx[i], sy[i], false);
      lines.push(line);
    }
    return lines;
  }

  /** Chaikin corner cutting, for rounder outlines. */
  function smooth(line, rounds) {
    let pts = line;
    for (let r = 0; r < (rounds || 1); r++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  Atlas.Contour = { blur, upsample, fillHoles, isolines, smooth };
  if (typeof module !== 'undefined' && module.exports) module.exports = Atlas.Contour;
})(typeof window !== 'undefined' ? window : globalThis);
