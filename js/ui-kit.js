/* Small UI toolkit: icons, DOM helper, number formatting and the two charts (route profile, sunlight curve).
 * Chart series colours were checked with a colour-vision-deficiency validator against the dark card surface. */
(function (root) {
  'use strict';
  const Atlas = (root.Atlas = root.Atlas || {});
  const SVG = 'http://www.w3.org/2000/svg';

  const ICONS = {
    arrowRight: 'M5 12h14M13 6l6 6-6 6', arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
    check: 'M5 12.5l4.5 4.5L19 7.5', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
    alert: 'M12 4l9 16H3zM12 10v4M12 17.3v.2', info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 11v5M12 7.7v.2',
    stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8zM12 8v5M12 16.3v.2',
    waves: 'M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
    layers: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
    flame: 'M12 3c1 3 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2 0 2 1 3 2 3 0-3-1-5.300 1-9.300z',
    mountain: 'M3 19l6-11 4 6 2-3 6 8z',
    pin: 'M12 21s-6-5.500-6-10.500a6 6 0 0 1 12 0C18 15.500 12 21 12 21zM12 8.300a2.200 2.200 0 1 0 0 4.400a2.200 2.200 0 0 0 0-4.400z',
    person: 'M12 3a2 2 0 1 0 0 4a2 2 0 0 0 0-4zM12 8v6M8 11l4-2 4 2M12 14l-3 6M12 14l3 6',
    rover: 'M4 11h13l3 3v2H4zM8 11V7h4M8 16a2 2 0 1 0 0 4a2 2 0 0 0 0-4zM16 16a2 2 0 1 0 0 4a2 2 0 0 0 0-4z',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2.500M12 19.500V22M2 12h2.500M19.500 12H22M4.900 4.900l1.800 1.800M17.300 17.300l1.800 1.800M4.900 19.100l1.800-1.800M17.300 6.700l1.800-1.800',
    shield: 'M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z', zap: 'M13 3L5 14h6l-1 7 8-11h-6z',
    wind: 'M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6',
    thermo: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z', clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7v5l3 2',
    target: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 1.500v4M12 18.500v4M1.500 12h4M18.500 12h4M12 10.500a1.500 1.500 0 1 0 0 3a1.500 1.500 0 0 0 0-3z',
    route: 'M6 15.500a2.500 2.500 0 1 0 0 5a2.500 2.500 0 0 0 0-5zM18 3.500a2.500 2.500 0 1 0 0 5a2.500 2.500 0 0 0 0-5zM8.500 18H14a3.500 3.500 0 0 0 0-7h-4a3.500 3.500 0 0 1 0-7h5.500',
    chevDown: 'M6 9l6 6 6-6', chevUp: 'M6 15l6-6 6 6', chevRight: 'M9 6l6 6-6 6', chevLeft: 'M15 6l-6 6 6 6',
    orbit: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM3 12c0-3 4-5 9-5s9 2 9 5-4 5-9 5-9-2-9-5z',
    pulse: 'M3 12h4l3-8 4 16 3-8h4', flag: 'M5 21V4M5 4h12l-2.500 4L17 12H5',
    sliders: 'M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2M14 4v4M8 10v4M16 16v4',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14', home: 'M4 11l8-7 8 7M6 10v9h12v-9',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5', sparkle: 'M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 16v4M17 18h4',
    track: 'M4 19c3-7 6 2 9-4s3-7 7-9', grid: 'M4 4h16v16H4zM4 12h16M12 4v16', contour: 'M3 17c3-6 6-9 9-9s6 3 9 9M7 20c1.700-3 3.300-4.500 5-4.500s3.300 1.500 5 4.500M5 9c2-3 4.300-4.500 7-4.500S17 6 19 9',
    moon: 'M20 14a8 8 0 1 1-9.500-10 6.500 6.500 0 0 0 9.500 10z', eye: 'M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
    type: 'M5 6V4h14v2M12 4v16M9 20h6', table: 'M4 5h16v14H4zM4 10h16M10 5v14', refresh: 'M20 11a8 8 0 0 0-14-4.500L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.500L20 15M20 20v-5h-5',
    range: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 12l5-3M12 12v.010',
  };

  /** Inline SVG icon markup. */
  function icon(name, cls) {
    const d = ICONS[name] || ICONS.info;
    return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  /** Element builder: h('div', {class:'a', onclick: fn}, child, 'text', ...). Strings become text nodes. */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;                 // trusted, app-authored markup only (icons)
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const fmt = {
    km(m) { return m >= 950 ? (m / 1000).toFixed(m >= 9950 ? 0 : 1) + ' km' : Math.round(m / 10) * 10 + ' m'; },
    m(v) { return Math.round(v).toLocaleString('en-US') + ' m'; },
    deg(v, d) { return v.toFixed(d == null ? 0 : d) + '°'; },
    dur(min) {
      const t = Math.max(0, Math.round(min)), hh = Math.floor(t / 60), mm = t % 60;
      return hh ? `${hh} h ${String(mm).padStart(2, '0')} min` : `${mm} min`;
    },
    coord(lon, lat) { return `${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E`; },
    ago(ms) {
      const d = (Date.now() - ms) / 1000;
      if (d < 90) return 'just now';
      if (d < 5400) return Math.round(d / 60) + ' min ago';
      if (d < 129600) return Math.round(d / 3600) + ' h ago';
      return Math.round(d / 86400) + ' days ago';
    },
    until(ms) {
      const d = (ms - Date.now()) / 3600000;
      return Math.abs(d) < 48 ? `${Math.abs(d).toFixed(0)} h` : `${(Math.abs(d) / 24).toFixed(1)} days`;
    },
    utc(ms) { return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; },
    pct(v) { return Math.round(v * 100) + '%'; },
  };

  function niceTicks(lo, hi, count) {
    const span = hi - lo || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /* One shared tooltip. Values lead, labels follow. */
  let tip;
  function tooltip(rows, x, y) {
    if (!tip) { tip = h('div', { class: 'viz-tip', role: 'status' }); document.body.append(tip); }
    if (!rows) { tip.hidden = true; return; }
    tip.replaceChildren(...rows.map((r) => h('div', { class: 'viz-tip-row' },
      r.key ? h('span', { class: 'viz-key', style: { background: r.key } }) : null,
      h('strong', {}, r.value), h('span', {}, r.label))));
    tip.hidden = false;
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px';
    tip.style.top = Math.max(8, y - hgt - 12) + 'px';
  }

  const SERIES = { blue: '#3987e5', yellow: '#c98500' };
  const SLOPE_COLORS = { good: '#45c277', warning: '#f5b63a', serious: '#f08a5d', critical: '#e85a52' };

  /**
   * Elevation profile along a route. One series, so no legend box: the title names it.
   * A thin strip under the plot shows slope class along the way (status colours with a text key).
   */
  function profileChart(host, summary, opts) {
    const W = host.clientWidth || 340, H = 150, m = { l: 44, r: 10, t: 10, b: 38 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, pts = summary.profile, total = summary.oneWayM || 1;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { lo = Math.min(lo, p.elev); hi = Math.max(hi, p.elev); }
    const pad = Math.max(6, (hi - lo) * 0.12); lo -= pad; hi += pad;
    const x = (d) => m.l + (d / total) * pw, y = (e) => m.t + (1 - (e - lo) / (hi - lo)) * ph;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz', role: 'img',
      'aria-label': `Elevation along the route, ${fmt.km(total)} one way, from ${Math.round(pts[0].elev)} to ${Math.round(pts[pts.length - 1].elev)} metres` });
    for (const tv of niceTicks(lo, hi, 3)) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: 'viz-grid' }),
        s('text', { x: m.l - 6, y: y(tv) + 3.5, class: 'viz-tick', 'text-anchor': 'end' }, tv.toLocaleString('en-US')));
    }
    const xt = niceTicks(0, total / 1000, 4);
    for (const tv of xt) svg.append(s('text', { x: x(tv * 1000), y: H - 6, class: 'viz-tick', 'text-anchor': tv === 0 ? 'start' : 'middle' }, tv === 0 ? '0 km' : String(tv)));
    const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p.elev).toFixed(1)).join('');
    svg.append(s('path', { d: `${line}L${x(total).toFixed(1)} ${m.t + ph}L${m.l} ${m.t + ph}Z`, fill: SERIES.blue, 'fill-opacity': 0.12 }),
      s('path', { d: line, fill: 'none', stroke: SERIES.blue, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // slope strip
    const cls = (sl) => (sl > opts.maxSlope ? 'critical' : sl > opts.maxSlope * 0.7 ? 'serious' : sl > 8 ? 'warning' : 'good');
    const sy = m.t + ph + 5;
    for (let i = 1; i < pts.length; i++) {
      const c = cls(Math.max(pts[i - 1].slope, pts[i].slope));
      svg.append(s('rect', { x: x(pts[i - 1].d).toFixed(1), y: sy, width: Math.max(0.6, x(pts[i].d) - x(pts[i - 1].d) + 0.4).toFixed(1), height: 5, fill: SLOPE_COLORS[c] }));
    }
    svg.append(s('circle', { cx: x(total), cy: y(pts[pts.length - 1].elev), r: 4, fill: SERIES.blue, stroke: '#16120f', 'stroke-width': 2 }));
    const cross = s('line', { y1: m.t, y2: m.t + ph + 10, class: 'viz-cross', visibility: 'hidden' });
    const dot = s('circle', { r: 4, fill: '#f7f0e5', stroke: '#16120f', 'stroke-width': 2, visibility: 'hidden' });
    const hit = s('rect', { x: m.l, y: 0, width: pw, height: H, fill: 'transparent', tabindex: 0, 'aria-label': 'Route profile. Move the pointer or use arrow keys to read values.' });
    svg.append(cross, dot, hit);
    let idx = 0;
    const show = (i, cx, cy) => {
      idx = Math.max(0, Math.min(pts.length - 1, i));
      const p = pts[idx], px = x(p.d);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', y(p.elev)); dot.setAttribute('visibility', 'visible');
      const box = svg.getBoundingClientRect();
      tooltip([
        { value: fmt.km(p.d), label: 'from start' },
        { value: Math.round(p.elev).toLocaleString('en-US') + ' m', label: 'elevation', key: SERIES.blue },
        { value: fmt.deg(p.slope), label: 'slope', key: SLOPE_COLORS[cls(p.slope)] },
        { value: p.soft >= 0.6 ? 'loose sand likely' : p.rough >= 2.5 ? 'rough ground' : 'firm ground', label: 'surface' },
      ], cx == null ? box.left + px : cx, cy == null ? box.top + m.t : cy);
      if (opts.onHover) opts.onHover(p);
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tooltip(null); if (opts.onHover) opts.onHover(null); };
    hit.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect(), d = ((e.clientX - box.left) / box.width * W - m.l) / pw * total;
      let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].d - d) < Math.abs(pts[best].d - d)) best = i;
      show(best, e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
    hit.addEventListener('focus', () => show(idx));
    hit.addEventListener('keydown', (e) => {
      const step = Math.max(1, Math.round(pts.length / 40));
      if (e.key === 'ArrowRight') { show(idx + step); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(idx - step); e.preventDefault(); }
    });
    const key = h('div', { class: 'viz-legend' }, h('span', { class: 'viz-legend-title' }, 'Slope along route'),
      ...[['good', 'under 8°'], ['warning', '8° and up'], ['serious', 'near limit']].map(([c, label]) =>
        h('span', { class: 'viz-legend-item' }, h('i', { style: { background: SLOPE_COLORS[c] } }), label)));
    host.replaceChildren(svg, key);
  }

  /**
   * Sunlight through the Jezero day (Appelbaum & Flood model), with the EVA window and the current time.
   * Two series (total, direct beam) on one axis, so a legend is always shown.
   */
  function sunChart(host, o) {
    const MT = Atlas.MarsTime, W = host.clientWidth || 340, H = 170, m = { l: 40, r: 12, t: 22, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, t0 = 5, t1 = 19;
    const rows = [];
    for (let t = t0; t <= t1 + 1e-9; t += 0.1) {
      const el = MT.sunElevationAt(t, o.ls, o.lat), irr = MT.irradiance(90 - el, o.tau, o.ls);
      rows.push({ t, el, g: irr.global, b: irr.direct });
    }
    const peak = Math.max(...rows.map((r) => r.g)), hi = Math.max(100, Math.ceil(peak / 100) * 100);
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * pw, y = (v) => m.t + (1 - v / hi) * ph;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz', role: 'img',
      'aria-label': `Sunlight on level ground through the day at dust opacity ${o.tau}. Peak ${Math.round(peak)} watts per square metre near local noon.` });
    for (const tv of niceTicks(0, hi, 3)) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: 'viz-grid' }),
        s('text', { x: m.l - 6, y: y(tv) + 3.5, class: 'viz-tick', 'text-anchor': 'end' }, tv));
    }
    for (const tv of [6, 9, 12, 15, 18]) svg.append(s('text', { x: x(tv), y: H - 6, class: 'viz-tick', 'text-anchor': 'middle' }, String(tv).padStart(2, '0') + ':00'));
    if (o.eva && o.eva.end > o.eva.start) {
      const a = Math.max(t0, o.eva.start), b = Math.min(t1, o.eva.end);
      if (b > a) svg.append(s('rect', { x: x(a), y: m.t, width: x(b) - x(a), height: ph, fill: '#7cc0f2', 'fill-opacity': 0.13 }),
        s('text', { x: (x(a) + x(b)) / 2, y: m.t - 7, class: 'viz-note', 'text-anchor': 'middle' }, 'EVA window'));
    }
    const path = (k) => rows.map((r, i) => (i ? 'L' : 'M') + x(r.t).toFixed(1) + ' ' + y(r[k]).toFixed(1)).join('');
    svg.append(s('path', { d: `${path('g')}L${x(t1)} ${y(0)}L${x(t0)} ${y(0)}Z`, fill: SERIES.yellow, 'fill-opacity': 0.1 }),
      s('path', { d: path('g'), fill: 'none', stroke: SERIES.yellow, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      s('path', { d: path('b'), fill: 'none', stroke: SERIES.blue, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    if (o.now != null && o.now >= t0 && o.now <= t1) {
      const el = MT.sunElevationAt(o.now, o.ls, o.lat), irr = MT.irradiance(90 - el, o.tau, o.ls);
      svg.append(s('line', { x1: x(o.now), x2: x(o.now), y1: m.t, y2: m.t + ph, stroke: '#f7f0e5', 'stroke-width': 1 }),
        s('circle', { cx: x(o.now), cy: y(irr.global), r: 4.5, fill: '#f7f0e5', stroke: '#16120f', 'stroke-width': 2 }));
    }
    const cross = s('line', { y1: m.t, y2: m.t + ph, class: 'viz-cross', visibility: 'hidden' });
    const hit = s('rect', { x: m.l, y: 0, width: pw, height: H, fill: 'transparent', tabindex: 0, 'aria-label': 'Sunlight curve. Move the pointer or use arrow keys to read values.' });
    svg.append(cross, hit);
    let idx = Math.round(rows.length / 2);
    const show = (i, cx, cy) => {
      idx = Math.max(0, Math.min(rows.length - 1, i));
      const r = rows[idx], px = x(r.t), box = svg.getBoundingClientRect();
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      tooltip([
        { value: MT.fmtClock(r.t), label: 'local solar time' },
        { value: Math.round(r.g) + ' W/m²', label: 'total sunlight', key: SERIES.yellow },
        { value: Math.round(r.b) + ' W/m²', label: 'direct beam', key: SERIES.blue },
        { value: r.el > 0 ? fmt.deg(r.el) : 'below horizon', label: 'Sun height' },
      ], cx == null ? box.left + px : cx, cy == null ? box.top + m.t : cy);
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); tooltip(null); };
    hit.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect(), t = t0 + ((e.clientX - box.left) / box.width * W - m.l) / pw * (t1 - t0);
      show(Math.round((t - t0) / 0.1), e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
    hit.addEventListener('focus', () => show(idx));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { show(idx + 3); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(idx - 3); e.preventDefault(); }
    });
    const legend = h('div', { class: 'viz-legend' },
      h('span', { class: 'viz-legend-item' }, h('i', { class: 'line', style: { background: SERIES.yellow } }), 'Total sunlight'),
      h('span', { class: 'viz-legend-item' }, h('i', { class: 'line', style: { background: SERIES.blue } }), 'Direct beam'),
      o.now != null ? h('span', { class: 'viz-legend-item' }, h('i', { class: 'dotkey' }), 'Now') : null);
    host.replaceChildren(svg, legend);
    return { peak };
  }

  Atlas.ui = { icon, h, s, fmt, tooltip, profileChart, sunChart, niceTicks, SERIES, SLOPE_COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
