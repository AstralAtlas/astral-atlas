/* Mission map page: full-screen NASA imagery with hazard, science and route layers, live conditions and the EVA plan. */
(async function () {
  'use strict';
  const { data, ui, MarsTime: MT, Live, Predictor: P, Terrain } = window.Atlas;
  const { h, icon, fmt } = ui;
  const $ = (id) => document.getElementById(id);
  const NF = P.FEATURES.length, WALK_KMH = data.MOBILITY.foot.speedKmh;
  const TREK = (id, ext) => `https://trek.nasa.gov/tiles/Mars/EQ/${id}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`;

  const cfg = data.parseConfig(location.search);
  const mob = data.MOBILITY[cfg.mode];
  const st = {
    cfg, layers: new Set(cfg.layers), tab: 'targets', kind: 'risk', tinted: true,
    tau: cfg.tau != null ? cfg.tau : (MT.orbit(Date.now()).ls >= 180 ? 1.0 : 0.5),
    depart: { mode: 'now', ltst: 9 }, targets: [], far: [], sel: null, routes: null,
    rover: null, meda: null, sw: null, checks: [], verdict: null,
  };
  $('backLink').href = 'index.html?' + data.serializeConfig(cfg);
  $('icBack').innerHTML = icon('arrowLeft'); $('icCond').innerHTML = icon('chevDown');
  $('condClose').innerHTML = icon('x'); $('dockToggle').innerHTML = icon('chevLeft'); $('planToggle').innerHTML = icon('chevRight');
  $('zIn').innerHTML = icon('plus'); $('zOut').innerHTML = icon('minus'); $('zHome').innerHTML = icon('home'); $('zRover').innerHTML = icon('rover');

  /* ---------- loader ---------- */
  const STEPS = ['NASA Mars Trek imagery', 'CTX elevation, slope and roughness', 'THEMIS thermal and soft ground', 'Perseverance track and explored corridor',
    'Evidence ranking for your objective', 'Reach and routes from your start', 'Live conditions'];
  const stepEls = STEPS.map((s) => h('li', {}, h('span', { class: 'mini-spin', style: { visibility: 'hidden' } }), s));
  $('loaderSteps').append(...stepEls);
  const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  async function step(i) {
    stepEls.forEach((el, k) => {
      if (k < i) { el.className = 'ok'; el.firstChild.outerHTML = icon('check'); }
      else if (k === i) { el.className = 'on'; if (el.firstChild.style) el.firstChild.style.visibility = 'visible'; }
    });
    await paint();
  }
  function toast(msg, ms) {
    const el = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(el);
    setTimeout(() => el.remove(), ms || 4200);
  }

  /* ---------- map ---------- */
  await step(0);
  const S = data.STUDY;
  const map = L.map('map', {
    crs: L.CRS.EPSG4326, zoomControl: false, attributionControl: false, minZoom: 7, maxZoom: 19, zoomSnap: 1, zoomDelta: 1,   // whole zoom levels: no seams between tiles
    wheelPxPerZoomLevel: 110, maxBounds: [[16.4, 75.6], [20.4, 79.4]], maxBoundsViscosity: 0.9, preferCanvas: true,
  });
  map.createPane('gray').style.zIndex = 210; map.getPane('gray').classList.add('tinted');
  map.createPane('thermal').style.zIndex = 220;
  map.createPane('raster').style.zIndex = 300;
  map.createPane('labels').style.zIndex = 620; map.getPane('labels').style.pointerEvents = 'none';
  map.fitBounds([[18.40, 77.24], [18.54, 77.47]]);
  const jz = [[S.south, S.west], [S.north, S.east]];
  L.tileLayer(TREK('Mars_Viking_MDIM21_ClrMosaic_global_232m', 'jpg'), { maxNativeZoom: 7, maxZoom: 11, noWrap: true }).addTo(map);
  L.tileLayer(TREK('Jezero_CTX_BlockAdj_dd', 'png'), { pane: 'gray', minZoom: 8, maxNativeZoom: 12, maxZoom: 19, bounds: [[15.9058, 75.1538], [19.4453, 78.8717]] }).addTo(map);
  L.tileLayer(TREK('JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0', 'png'), { pane: 'gray', minZoom: 11, maxNativeZoom: 13, maxZoom: 19, bounds: [[18.2110, 77.1605], [18.7212, 77.6992]] }).addTo(map);
  L.tileLayer(TREK('JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd', 'png'), { pane: 'gray', minZoom: 13, maxNativeZoom: 17, maxZoom: 19, bounds: [[18.3068, 77.2229], [18.6693, 77.5840]] }).addTo(map);
  const thermalTiles = L.tileLayer(TREK('THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', 'png'), { pane: 'thermal', maxNativeZoom: 9, maxZoom: 19, opacity: 0.8 });
  $('zIn').onclick = () => map.zoomIn(1); $('zOut').onclick = () => map.zoomOut(1);

  /* ---------- terrain ---------- */
  await step(1);
  const t = await Terrain.load(window.ATLAS_TERRAIN, null);
  await step(2);
  const feat = P.buildFeatures(t);
  const mPerDeg = t.cellM / t.cellDeg;

  const png = (w, hgt, fill) => {
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, hgt); fill(img.data); ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };
  const overlay = (url, opacity) => L.imageOverlay(url, jz, { pane: 'raster', opacity: opacity == null ? 1 : opacity, className: 'ov', interactive: false });
  const put = (d, k, r, g, b, a) => { const o = k * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a; };

  const LY = {};   // id -> Leaflet layer
  function setLayer(id, layer) {
    if (LY[id]) map.removeLayer(LY[id]);
    LY[id] = layer;
    if (layer && st.layers.has(id)) layer.addTo(map);
  }
  /* Overlays are painted at 20 m with soft edges; region boundaries are drawn as smooth vector outlines. */
  const CT = window.Atlas.Contour, F2 = 2, W2 = t.nx * F2, H2 = t.ny * F2;
  const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  map.createPane('outlines').style.zIndex = 350; map.getPane('outlines').style.pointerEvents = 'none';
  const outlineRenderer = L.canvas({ pane: 'outlines' });
  function outline(field, w, hgt, level, cellDeg, minPts, styles) {
    const lines = CT.isolines(field, w, hgt, level).filter((l) => l.length >= minPts)
      .map((l) => CT.smooth(l, 1).map(([x, y]) => [t.north - (y + 0.5) * cellDeg, t.west + (x + 0.5) * cellDeg]));
    return styles.map((s) => L.polyline(lines, Object.assign({ interactive: false, renderer: outlineRenderer, lineJoin: 'round' }, s)));
  }
  function buildSlope() {
    const lim = cfg.maxSlope, up = CT.upsample(t.slope, t.nx, t.ny, F2);
    const blocked = new Float32Array(t.n);
    for (let k = 0; k < t.n; k++) blocked[k] = t.slope[k] > lim ? 1 : 0;
    const upB = CT.upsample(blocked, t.nx, t.ny, F2);
    setLayer('slope', overlay(png(W2, H2, (d) => {
      for (let k = 0; k < up.length; k++) {
        const b = upB[k], a = Math.max(ramp(up[k], lim * 0.62, lim * 0.78) * 76, b * 150);
        if (a < 2) continue;
        put(d, k, Math.round(247 - 15 * b), Math.round(150 - 92 * b), 50, Math.round(a));
      }
    })));
  }
  function buildSand() {
    const up = CT.upsample(t.soft, t.nx, t.ny, F2);
    setLayer('sand', overlay(png(W2, H2, (d) => {
      for (let k = 0; k < up.length; k++) { const a = ramp(up[k], 0.4, 0.95) * 84; if (a >= 2) put(d, k, 60, 214, 220, Math.round(a)); }
    })));
  }
  function buildContours() {
    const f = 2, w = t.nx * f, hh = t.ny * f, e = new Float32Array(w * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const gx = Math.max(0, Math.min(t.nx - 1.001, (x + 0.5) / f - 0.5)), gy = Math.max(0, Math.min(t.ny - 1.001, (y + 0.5) / f - 0.5));
      const j = Math.floor(gx), i = Math.floor(gy), fx = gx - j, fy = gy - i, k = i * t.nx + j;
      e[y * w + x] = (t.elev[k] * (1 - fx) + t.elev[k + 1] * fx) * (1 - fy) + (t.elev[k + t.nx] * (1 - fx) + t.elev[k + t.nx + 1] * fx) * fy;
    }
    setLayer('contours', overlay(png(w, hh, (d) => {
      for (let y = 0; y < hh - 1; y++) for (let x = 0; x < w - 1; x++) {
        const k = y * w + x, a = Math.floor(e[k] / 25), b = Math.floor(e[k + 1] / 25), c = Math.floor(e[k + w] / 25);
        if (a !== b || a !== c) { const idx = (Math.max(a, b, c) % 4 + 4) % 4 === 0; put(d, k, 255, 244, 224, idx ? 215 : 105); }
      }
    })));
  }

  /* ---------- rover, explored corridor, references ---------- */
  await step(3);
  st.rover = { source: 'snapshot', path: window.ATLAS_ROVER_SNAPSHOT.path, waypoints: window.ATLAS_ROVER_SNAPSHOT.waypoints };
  st.rover.latest = (() => { const w = st.rover.waypoints[st.rover.waypoints.length - 1]; return { sol: w[0], lon: w[1], lat: w[2], elev: w[3], distKm: w[4] }; })();
  let R, near, dist;
  async function buildRover() {
    const r = st.rover, line = r.path.map((p) => [p[1], p[0]]);
    setLayer('track', L.layerGroup([
      L.polyline(line, { color: '#0b0908', weight: 5.5, opacity: 0.6, interactive: false }),
      L.polyline(line, { color: '#ffffff', weight: 2.2, opacity: 0.95, interactive: false }),
      L.marker([r.latest.lat, r.latest.lon], { icon: L.divIcon({ className: 'mk', html: '<div class="mk-rover"></div>', iconSize: [18, 18] }), zIndexOffset: 500 })
        .bindTooltip(`Perseverance · sol ${r.latest.sol}${r.source === 'live' ? ' (live)' : ' (saved copy)'}`, { className: 'tag', direction: 'top', offset: [0, -10] }),
    ]));
    dist = t.distanceField(t.rasterise(r.path));
    const near2 = new Float32Array(t.n);
    for (let k = 0; k < t.n; k++) near2[k] = Math.min(dist[k], 400);
    const upD = CT.upsample(near2, t.nx, t.ny, F2);
    setLayer('explored', overlay(png(W2, H2, (d) => {
      for (let k = 0; k < upD.length; k++) { const a = (1 - ramp(upD[k], 85, 175)) * 78; if (a >= 2) put(d, k, 127, 227, 176, Math.round(a)); }
    })));
    R = P.buildReferences(feat, r.waypoints, data.campaignOf);
    near = await P.nearestGrid(feat, R);
  }
  await buildRover();

  /* ---------- evidence ranking ---------- */
  await step(4);
  const objective = () => data.OBJECTIVES.find((o) => o.id === cfg.objective);
  function buildScore() {
    const o = objective();
    st.score = P.scoreGrid(feat, R, near, o.positives);
    st.hold = P.holdout(t, R, o.positives);
    const mask = new Float32Array(feat.an);
    for (let c = 0; c < feat.an; c++) mask[c] = st.score[c] >= P.MIN_RESOURCE_SCORE ? 1 : 0;
    const soft = CT.blur(mask, feat.anx, feat.any), up = CT.upsample(soft, feat.anx, feat.any, F2);
    const fill = overlay(png(feat.anx * F2, feat.any * F2, (d) => {
      for (let k = 0; k < up.length; k++) { const a = ramp(up[k], 0.3, 0.7) * 40; if (a >= 2) put(d, k, 255, 95, 165, Math.round(a)); }
    }));
    setLayer('predict', L.layerGroup([fill].concat(outline(soft, feat.anx, feat.any, 0.5, t.cellDeg * feat.factor, 16,
      [{ color: '#2a0716', weight: 3.4, opacity: 0.45 }, { color: '#ff7db6', weight: 1.6, opacity: 0.95 }]))));
  }
  buildScore();

  /* ---------- start, reach, targets ---------- */
  await step(5);
  const siteMin = cfg.siteMinutes;
  const budget = cfg.mode === 'rover'
    ? (cfg.evaHours - siteMin / 60) / (1 / mob.speedKmh + 1 / WALK_KMH) * 1000      // must be able to walk back from the far point
    : (cfg.evaHours - siteMin / 60) / 2 * mob.speedKmh * 1000;
  const minutes = (effortM) => effortM / 1000 / mob.speedKmh * 60;

  function resolveStart() {
    let sp;
    if (cfg.start === 'custom' && cfg.lon != null) sp = { name: 'Your start point', lon: cfg.lon, lat: cfg.lat };
    else if (cfg.start === 'rover') sp = { name: 'Perseverance', lon: st.rover.latest.lon, lat: st.rover.latest.lat };
    else sp = data.START_POINTS.find((s) => s.id === cfg.start) || data.START_POINTS[0];
    const k = P.snap(t, t.index(sp.lon, sp.lat), cfg.maxSlope, 8);
    if (k < 0) { toast('That start point is outside the elevation model or on ground steeper than your limit. Using Three Forks instead.', 7000); const d = data.START_POINTS[0]; return { name: d.name, lon: d.lon, lat: d.lat, k: t.index(d.lon, d.lat) }; }
    const [lon, lat] = t.lonLat(k);
    return { name: sp.name, lon, lat, k };
  }
  const bearing = (lon1, lat1, lon2, lat2) => {
    const a = Math.atan2((lon2 - lon1) * t.coslat, lat2 - lat1) * 180 / Math.PI;
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((a + 360) % 360) / 45) % 8];
  };
  function nearestSite(lon, lat) {
    let best = null, bd = Infinity;
    for (const s of data.SITES) { const d = t.distance(lon, lat, s.lon, s.lat); if (d < bd) { bd = d; best = s; } }
    return { site: best, d: bd };
  }
  const whereText = (lon, lat) => { const n = nearestSite(lon, lat); return n.d < 120 ? `At ${n.site.name}` : `${fmt.km(n.d)} ${bearing(n.site.lon, n.site.lat, lon, lat)} of ${n.site.name}`; };
  const isPos = (r) => objective().positives.includes(r.unit);

  function plan() {
    st.start = resolveStart();
    st.field = P.search(t, st.start.k, null, { maxSlope: cfg.maxSlope, budget });
    const cost = st.field.cost;
    const reach = new Uint8Array(t.n);
    for (let k = 0; k < t.n; k++) reach[k] = cost[k] <= budget ? 1 : 0;
    const inside = CT.blur(CT.fillHoles(reach, t.nx, t.ny), t.nx, t.ny), upR = CT.upsample(inside, t.nx, t.ny, F2);
    const veil = overlay(png(W2, H2, (d) => {
      for (let k = 0; k < upR.length; k++) { const a = (1 - ramp(upR[k], 0.3, 0.7)) * 84; if (a >= 2) put(d, k, 6, 5, 4, Math.round(a)); }
    }));
    setLayer('range', L.layerGroup([veil].concat(outline(inside, t.nx, t.ny, 0.5, t.cellDeg, 24,
      [{ color: '#0b0908', weight: 4.2, opacity: 0.5 }, { color: '#d3ebff', weight: 1.8, opacity: 0.95, dashArray: '7 6' }]))));
    const unexplored = (cells) => cells.every((k) => dist[k] >= 400);
    const mk = (c, far) => {
      const cells = feat.terrainCells(c.cell).filter((k) => t.slope[k] <= cfg.maxSlope);
      const goal = far ? cells.sort((a, b) => t.slope[a] - t.slope[b])[0] : cells.filter((k) => cost[k] <= budget).sort((a, b) => cost[a] - cost[b])[0];
      const ev = P.rankEvidence(feat.Z, c.cell * NF, R, isPos);
      const match = ev.sources.find((s) => s.positive) || ev.sources[0];
      return Object.assign(c, { goal, far, ev, where: whereText(c.lon, c.lat), match: nearestSite(match.ref.lon, match.ref.lat).site,
        similarity: Math.max(0, 1 - ev.nearest / P.MAX_ANALOG_DISTANCE),
        effortM: far ? null : cost[goal], oneWayMin: far ? null : minutes(cost[goal]) });
    };
    st.targets = P.candidates(feat, t, st.score, (c) => { const cs = feat.terrainCells(c); return unexplored(cs) && cs.some((k) => t.slope[k] <= cfg.maxSlope && cost[k] <= budget); }, 5, 700).map((c) => mk(c, false));
    st.far = P.candidates(feat, t, st.score, (c) => { const cs = feat.terrainCells(c); return unexplored(cs) && cs.some((k) => t.slope[k] <= cfg.maxSlope) && !cs.some((k) => cost[k] <= budget); }, 3, 1500).map((c) => mk(c, true));
    st.targets.sort((a, b) => Math.round(b.support * 5) - Math.round(a.support * 5) || a.effortM - b.effortM);
    st.targets.forEach((x, i) => { x.label = String(i + 1); });
    st.far.forEach((x, i) => { x.label = String.fromCharCode(65 + i); });
    drawMarkers();
    select(st.targets[0] || null, true);
  }

  const routeGroup = L.layerGroup().addTo(map), markerGroup = L.layerGroup().addTo(map), hoverGroup = L.layerGroup().addTo(map);
  function drawMarkers() {
    markerGroup.clearLayers();
    L.marker([st.start.lat, st.start.lon], { icon: L.divIcon({ className: 'mk', html: `<div class="mk-base">${icon('home')}</div>`, iconSize: [34, 34] }), zIndexOffset: 900 })
      .bindTooltip(`Start: ${st.start.name}`, { className: 'tag', direction: 'top', offset: [0, -16] }).addTo(markerGroup);
    for (const x of st.targets.concat(st.far, st.custom ? [st.custom] : [])) {
      L.marker([x.lat, x.lon], { icon: L.divIcon({ className: 'mk', html: `<div class="mk-cand ${x.far ? 'far' : ''} ${st.sel === x ? 'sel' : ''}">${x.label}</div>`, iconSize: [30, 30] }), zIndexOffset: st.sel === x ? 800 : 600 })
        .bindTooltip(x.custom ? 'Your destination' : `Target ${x.label}: evidence ${x.score.toFixed(2)}`, { className: 'tag', direction: 'top', offset: [0, -14] })
        .on('click', () => { select(x); setTab('route'); }).addTo(markerGroup);
    }
  }

  function select(x, quiet) {
    st.sel = x; st.routes = null; routeGroup.clearLayers();
    if (x && x.goal != null) {
      const o = { maxSlope: cfg.maxSlope };
      const riskPath = st.field.cost[x.goal] <= budget ? P.trace(st.field, x.goal) : P.findRoute(t, st.start.k, x.goal, Object.assign({ minimizeExposure: true }, o));
      const shortPath = P.findRoute(t, st.start.k, x.goal, Object.assign({ minimizeExposure: false }, o));
      if (riskPath && shortPath) {
        st.routes = { risk: P.routeSummary(t, riskPath, o), short: P.routeSummary(t, shortPath, o) };
        for (const r of Object.values(st.routes)) { r.outMin = minutes(r.terrainWeightedCost); r.totalMin = 2 * r.outMin + siteMin; }
      }
    }
    drawRoutes(); drawMarkers(); chooseDeparture(); assess(); renderPlan();
    if (!quiet && st.routes) map.flyToBounds(L.latLngBounds(st.routes.risk.line).pad(0.35), { duration: 0.6, maxZoom: 16 });
  }
  function drawRoutes() {
    routeGroup.clearLayers();
    if (!st.routes) return;
    const a = CT.smooth(st.routes[st.kind].line, 2), b = CT.smooth(st.routes[st.kind === 'risk' ? 'short' : 'risk'].line, 2);
    L.polyline(b, { color: '#0b0908', weight: 4.5, opacity: 0.45, interactive: false }).addTo(routeGroup);
    L.polyline(b, { color: '#d7ecff', weight: 2, opacity: 0.9, dashArray: '2 7', interactive: false }).addTo(routeGroup);
    L.polyline(a, { color: '#0b0908', weight: 8, opacity: 0.55, interactive: false }).addTo(routeGroup);
    L.polyline(a, { color: '#58aefc', weight: 4.2, opacity: 1, interactive: false }).addTo(routeGroup);
  }

  /* ---------- time, conditions, go / no-go ---------- */
  const here = () => MT.local(Date.now(), st.start.lon, st.start.lat);
  function chooseDeparture() {
    const l = here(), day = MT.daylight(l.ls, st.start.lat);
    const need = st.routes ? MT.earthToMarsHours(st.routes[st.kind].totalMin / 60) : 2;
    const ok = l.ltst >= day.sunrise + 0.5 && l.ltst + need <= day.sunset - 1;
    if (st.depart.user) return;
    st.depart = ok ? { mode: 'now', ltst: l.ltst } : { mode: 'set', ltst: Math.min(9, Math.max(day.sunrise + 1, 7)) };
  }
  function timeline() {
    if (!st.routes) return null;
    const r = st.routes[st.kind], l = here(), day = MT.daylight(l.ls, st.start.lat);
    const dep = st.depart.mode === 'now' ? l.ltst : st.depart.ltst;
    const mh = (min) => MT.earthToMarsHours(min / 60);
    const arrive = dep + mh(r.outMin), leave = arrive + mh(siteMin), back = leave + mh(r.outMin);
    const waitMarsH = st.depart.mode === 'now' ? 0 : ((dep - l.ltst) % 24 + 24) % 24;
    const departMs = Date.now() + waitMarsH * MT.MARS_HOUR_SECONDS * 1000;
    return { r, dep, arrive, leave, back, day, departMs, backMs: departMs + r.totalMin * 60000, latestBack: day.sunset - 1, waitMarsH, ls: l.ls };
  }

  function assess() {
    const C = [], tl = timeline(), add = (level, title, value, text) => C.push({ level, title, value, text });
    if (!st.sel) add('serious', 'No target in range', '', 'No unvisited ground above the evidence threshold can be reached and returned from inside your limits. Move the start, allow more time, or use the crew rover.');
    else if (!st.routes) add('critical', 'No passable route', '', `Every way to this point crosses ground steeper than ${cfg.maxSlope}° or leaves the elevation model.`);
    if (tl) {
      const r = tl.r, over = r.totalMin / 60 - cfg.evaHours;
      add(over > 0 ? 'critical' : over > -0.75 ? 'warning' : 'good', 'Time outside', fmt.dur(r.totalMin),
        over > 0 ? `Over your ${cfg.evaHours} h limit by ${fmt.dur(over * 60)}. Shorten the science stop or pick a closer target.` : `Inside your ${cfg.evaHours} h limit with ${fmt.dur(-over * 60)} in reserve.`);
      const lateBy = tl.back - tl.latestBack, early = tl.dep < tl.day.sunrise + 0.5;
      add(lateBy > 0 || early ? 'critical' : lateBy > -1 ? 'warning' : 'good', 'Daylight', `back ${MT.fmtClock(tl.back)}`,
        early ? `Departure is before full daylight. Sunrise is ${MT.fmtClock(tl.day.sunrise)}.` : lateBy > 0 ? `You would be back after ${MT.fmtClock(tl.latestBack)}, the latest safe return (one hour before the ${MT.fmtClock(tl.day.sunset)} sunset).` : `Sunset ${MT.fmtClock(tl.day.sunset)}. You are back ${fmt.dur(-lateBy * 61.65)} before the one-hour margin.`);
      const frac = r.maxSlope / cfg.maxSlope;
      add(frac > 0.85 ? 'serious' : frac > 0.6 ? 'warning' : 'good', 'Steepest ground', fmt.deg(r.maxSlope),
        `Your limit is ${cfg.maxSlope}°. ${r.steepM > 0 ? fmt.km(r.steepM) + ' of the route is within 30% of it.' : 'No part of the route comes close to it.'}`);
      const sandShare = r.sandM / Math.max(1, r.oneWayM);
      add(sandShare > 0.25 ? 'serious' : r.sandM > 80 ? 'warning' : 'good', 'Loose sand', fmt.km(r.sandM),
        r.sandM > 80 ? 'Stretches of likely sand or dust on the way. Slower going and more dust on suits and seals.' : 'The route stays on ground that holds heat at night, which means firm surface.');
      if (cfg.mode === 'rover') {
        const walk = r.terrainWeightedCost / 1000 / WALK_KMH * 60, worst = r.outMin + siteMin + walk;
        add(worst / 60 > cfg.evaHours ? 'critical' : 'good', 'Walk-back', fmt.dur(walk), `If the rover fails at the target the crew walks home: ${fmt.dur(worst)} outside in total, against a ${cfg.evaHours} h limit.`);
      }
      const devil = tl.dep < 13 && tl.back > 12;
      add(devil ? 'warning' : 'good', 'Dust-devil hour', '12:00 to 13:00', devil ? 'You are outside during the hour after local noon, when more than one whirlwind an hour passed Perseverance. Face away, protect visors and seals.' : 'Your walk avoids the hour after local noon, when whirlwinds peak in Jezero.');
    }
    const tauL = st.tau >= 3 ? 'critical' : st.tau >= 1.5 ? 'serious' : st.tau >= 0.9 ? 'warning' : 'good';
    add(tauL, 'Dust in the sky', `τ ${st.tau.toFixed(1)}`, st.tau >= 3 ? 'Dust-storm sky. Landmarks vanish and sunlight collapses. Stay in.' : st.tau >= 1.5 ? 'Heavy haze. Navigation by sight is poor and solar power is cut sharply.' : st.tau >= 0.9 ? 'Hazy. Distant landmarks fade; expect less direct sunlight.' : 'Clear-season sky. Good visibility.');
    if (st.sw) {
      const from = tl ? tl.departMs : Date.now(), to = tl ? tl.backMs : Date.now() + cfg.evaHours * 3600000;
      const a = Live.assess(st.sw, from, to); st.storm = a;
      let text;
      if (a.hits.length) { const e = a.hits[a.hits.length - 1]; text = `NASA’s WSA-ENLIL model ${e.t < Date.now() ? 'put' : 'puts'} a solar eruption${e.glancing ? ' (glancing blow)' : ''} at Mars ${fmt.utc(e.t)}${e.speed ? `, launched at ${Math.round(e.speed)} km/s` : ''}. The rule here keeps crews inside from ${a.leadH} h before to ${a.tailH} h after an arrival.`; }
      else if (a.stale) text = 'The live feed could not be reached and the saved copy is too old to clear today. Check DONKI before leaving.';
      else text = a.upcoming ? `Next predicted arrival at Mars is in ${fmt.until(a.upcoming.t)}, outside this EVA.` : `No eruption is predicted to reach Mars during this EVA${a.last ? `. Last arrival was ${fmt.ago(a.last.t)}` : ''}.`;
      add(a.level, 'Space weather', a.label, text);
    } else add('warning', 'Space weather', 'checking', 'Waiting for NASA DONKI.');
    st.checks = C;
    const worst = C.some((c) => c.level === 'critical') ? 'critical' : C.some((c) => c.level === 'serious') ? 'serious' : 'good';
    const first = C.find((c) => c.level === worst && worst !== 'good');
    st.verdict = { level: worst, word: worst === 'critical' ? 'NO-GO' : worst === 'serious' ? 'CAUTION' : 'GO', why: first ? first.title : (tl ? (st.depart.mode === 'set' ? `Leave at ${MT.fmtClock(tl.dep)} local` : 'All checks pass') : '') };
    const g = $('goBadge'); g.className = `bar go s-${worst}`;
    $('goWord').textContent = st.verdict.word; $('goWhy').textContent = st.verdict.why;
  }

  const LV_ICON = { good: 'check', warning: 'info', serious: 'alert', critical: 'stop' };
  const lvIcon = (lv) => h('span', { class: `s-${lv}`, html: icon(LV_ICON[lv]) });

  /* ---------- plan panel ---------- */
  function setTab(tab) {
    st.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('plan').classList.remove('collapsed'); renderPlan();
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  function targetRow(x) {
    const over = !x.far && !x.custom && (2 * x.oneWayMin + siteMin) / 60 > cfg.evaHours;
    return h('button', { class: `target ${st.sel === x ? 'sel-t' : ''} ${x.far ? 'far' : ''}`, onclick: () => { select(x); setTab('route'); } },
      h('span', { class: 'num' }, x.label),
      h('span', {},
        h('span', { class: 'target-title' }, x.where),
        h('span', { class: 'target-sub' }, x.custom ? 'Your own destination' : `Closest verified match: ${x.match.name}`),
        x.score != null && !Number.isNaN(x.score) ? h('span', { class: 'meter' }, 'Evidence',
          h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: fmt.pct(x.score) } }), h('span', { class: 'mark', style: { left: '65%' } })),
          h('b', {}, x.score.toFixed(2))) : null,
        h('span', { class: 'target-foot' },
          x.far ? h('span', { class: 'status s-muted' }, h('span', { class: 'dot' }), 'Beyond range')
            : [x.similarity != null ? [h('span', { class: 'mono' }, fmt.pct(x.similarity)), 'similar \u00b7'] : null,
              h('span', { class: 'mono' }, fmt.dur(x.oneWayMin)), 'each way', over ? h('span', { class: 'status s-critical' }, h('span', { class: 'dot' }), 'Too long') : null])));
  }

  function renderTargets(body) {
    const o = objective(), hd = st.hold;
    body.append(h('div', { class: 'sect' },
      h('h4', {}, 'Science objective'),
      h('select', { class: 'sel', id: 'objSelect', 'aria-label': 'Science objective', onchange: (e) => { cfg.objective = e.target.value; history.replaceState(null, '', '?' + data.serializeConfig(cfg)); $('backLink').href = 'index.html?' + data.serializeConfig(cfg); buildScore(); plan(); renderDock(); } },
        ...data.OBJECTIVES.map((x) => h('option', { value: x.id, selected: x.id === o.id || null }, x.name))),
      h('p', { style: { marginTop: '8px' } }, o.why),
      h('div', { class: 'fact-line', html: icon('sparkle') }, h('span', {},
        `Blind test on ${hd.total} rover-verified cells: ${fmt.pct(hd.precision || 0)} of predicted matches were right, and ${fmt.pct(hd.recall || 0)} of real ones were found (each tested with everything within 1 km hidden).`))));
    const list = h('div', { class: 'sect' }, h('h4', {}, `Unvisited targets within reach of ${st.start.name}`));
    if (st.targets.length) list.append(...st.targets.map(targetRow));
    else list.append(h('div', { class: 'empty' }, `Nothing above the evidence threshold can be reached and returned from in ${cfg.evaHours} h ${cfg.mode === 'foot' ? 'on foot' : 'by rover'}. Click the map to move your start, or go back to the designer for more time or the crew rover.`));
    if (st.custom) list.append(h('h4', { style: { marginTop: '12px' } }, 'Your destination'), targetRow(st.custom));
    body.append(list);
    if (st.far.length) body.append(h('div', { class: 'sect' }, h('h4', {}, 'Strong matches beyond this EVA'), ...st.far.map(targetRow),
      h('p', { class: 'src-note' }, 'Out of reach inside your time limit from this start. Shown so a later EVA or a closer base can plan for them.')));
    body.append(h('p', { class: 'src-note' }, `Evidence is a weighted vote of the three most similar rover-verified cells across six NASA measurements. It ranks ground; it is not a probability. The line on each bar is the ${P.MIN_RESOURCE_SCORE} threshold.`));
  }

  function renderRoute(body) {
    if (!st.sel) { body.append(h('div', { class: 'empty' }, 'Pick a target, or click anywhere on the map and choose "Route here".')); return; }
    if (!st.routes) { body.append(h('div', { class: 'empty' }, `No passable route to this point with slopes capped at ${cfg.maxSlope}°.`)); return; }
    const R2 = st.routes, tl = timeline();
    const card = (k, name, dash) => { const r = R2[k]; return h('button', { class: 'opt', 'aria-pressed': String(st.kind === k), onclick: () => { st.kind = k; drawRoutes(); assess(); renderPlan(); } },
      h('span', { class: 'opt-name' }, h('i', { class: dash ? 'dash' : '' }), name),
      h('dl', {}, h('dt', {}, 'One way'), h('dd', {}, fmt.km(r.oneWayM)), h('dt', {}, 'Travel'), h('dd', {}, fmt.dur(r.outMin)),
        h('dt', {}, 'Steepest'), h('dd', {}, fmt.deg(r.maxSlope)), h('dt', {}, 'Climb'), h('dd', {}, fmt.m(r.ascentM)), h('dt', {}, 'Effort'), h('dd', {}, (r.terrainWeightedCost / 1000).toFixed(1)))); };
    const saved = R2.short.outMin - R2.risk.outMin, extra = R2.risk.oneWayM - R2.short.oneWayM;
    body.append(h('div', { class: 'sect' },
      h('h3', {}, `${st.sel.custom ? 'Your destination' : 'Target ' + st.sel.label}: ${st.sel.where}`),
      h('p', { style: { marginBottom: '10px' } }, st.sel.custom ? fmt.coord(st.sel.lon, st.sel.lat) : `Evidence ${st.sel.score.toFixed(2)}. Closest verified match: ${st.sel.match.name}. ${st.sel.match.note}`),
      h('div', { class: 'compare' }, card('risk', 'Lowest risk', false), card('short', 'Shortest', true)),
      h('p', { class: 'verdict' }, Math.abs(extra) < 40 && Math.abs(saved) < 2 ? 'Both searches found nearly the same line: the direct way is also the easy way.'
        : `The lowest-risk line is ${fmt.km(Math.max(0, extra))} longer but ${saved > 0 ? fmt.dur(saved) + ' faster' : 'about as fast'} each way, because it trades distance for gentler, firmer ground. "Effort" is distance in km weighted by slope, roughness and sand.`)));
    const chartHost = h('div', {});
    body.append(h('div', { class: 'sect' }, h('h4', {}, `Elevation along the ${st.kind === 'risk' ? 'lowest-risk' : 'shortest'} route (m)`), chartHost));
    const r = R2[st.kind];
    ui.profileChart(chartHost, r, { maxSlope: cfg.maxSlope, onHover: (p) => { hoverGroup.clearLayers(); if (p) L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'mk', html: '<div class="mk-hover"></div>', iconSize: [14, 14] }), interactive: false }).addTo(hoverGroup); } });
    if (r.stretches.length) {
      body.append(h('div', { class: 'sect' }, h('h4', {}, 'Hazards on this route'), ...r.stretches.slice(0, 6).map((s) =>
        h('button', { class: 'hz', onclick: () => map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), 16), { duration: 0.6 }) },
          lvIcon(s.key === 'slope' && s.peak > cfg.maxSlope * 0.85 ? 'serious' : 'warning'),
          h('span', {}, h('b', {}, `${s.label}: ${fmt.km(s.to - s.from)} starting ${fmt.km(s.from)} from base`),
            h('span', {}, s.key === 'slope' ? `Up to ${fmt.deg(s.peak)}. Slow down and keep loads low.` : s.key === 'sand' ? 'Cold at night in infrared: sand or dust. Expect sinking and slower steps.' : `Relief up to ±${s.peak.toFixed(1)} m in 100 m. Blocks, scarps or crater rim.`))))));
    } else body.append(h('div', { class: 'sect' }, h('h4', {}, 'Hazards on this route'), h('p', {}, 'No steep, sandy or rough stretch longer than 60 m on this line.')));
    // cuff checklist
    const dep = h('div', { class: 'depart' }, 'Leave at',
      h('input', { type: 'range', min: 6, max: 17, step: 0.25, value: tl.dep.toFixed(2), id: 'departRange', 'aria-label': 'Departure time, local solar time',
        oninput: (e) => { st.depart = { mode: 'set', ltst: +e.target.value, user: true }; $('departOut').textContent = MT.fmtClock(+e.target.value); },
        onchange: () => { assess(); renderPlan(); if (!$('condCard').hidden) renderConditions(); } }),
      h('output', { id: 'departOut' }, MT.fmtClock(tl.dep)),
      h('button', { class: 'btn btn-sm', onclick: () => { st.depart = { mode: 'now', ltst: here().ltst, user: true }; assess(); renderPlan(); } }, 'Now'));
    const li = (time, text, d, cls) => h('li', { class: cls || '' }, h('time', {}, MT.fmtClock(time)), h('span', {}, text), h('span', { class: 'd' }, d || ''));
    body.append(h('div', { class: 'sect' }, h('h4', {}, 'EVA checklist, local solar time'), dep,
      h('ol', { class: 'cuff' },
        li(tl.dep, `Leave ${st.start.name}`, st.depart.mode === 'now' ? 'now' : `in ${fmt.dur(tl.waitMarsH * 61.65)}`),
        li(tl.arrive, `Arrive target ${st.sel.label}`, '+' + fmt.dur(tl.r.outMin)),
        li(tl.leave, 'Science stop ends, turn for home', '+' + fmt.dur(siteMin)),
        li(tl.back, 'Back at start', '+' + fmt.dur(tl.r.outMin)),
        li(tl.latestBack, 'Hard limit: be inside by', 'sunset − 1 h', 'rule')),
      h('p', { class: 'src-note' }, `Speed ${mob.speedKmh} km/h on firm flat ground (planning assumption). The return uses the same line.`)));
  }

  function renderSafety(body) {
    const v = st.verdict;
    body.append(h('div', { class: `verdict-box s-${v.level}` }, h('span', { html: icon(LV_ICON[v.level]) }),
      h('div', {}, h('b', {}, v.word), h('span', {}, v.level === 'good' ? 'Every check passes for this plan. Advisories below.' : v.level === 'serious' ? 'Can go, with the cautions below briefed first.' : 'Do not leave on this plan. Fix the red items.'))));
    body.append(h('div', { class: 'sect' }, ...st.checks.map((c) => h('div', { class: 'check' }, lvIcon(c.level),
      h('div', {}, h('b', {}, c.title, h('em', {}, c.value)), h('span', {}, c.text))))));
    const tl = timeline();
    if (tl) {
      const hrs = tl.r.totalMin / 60, dose = hrs * data.DOSE_MSV_PER_DAY / 24;
      body.append(h('div', { class: 'sect' }, h('h4', {}, 'Radiation dose for this EVA'),
        h('div', { class: 'grid2' },
          h('div', { class: 'tile' }, h('small', {}, 'Quiet-Sun estimate'), h('b', {}, dose.toFixed(2) + ' mSv'), h('span', {}, `${fmt.dur(tl.r.totalMin)} at 0.67 mSv per day`)),
          h('div', { class: 'tile' }, h('small', {}, 'Largest storm measured'), h('b', {}, '8.1 mGy'), h('span', {}, 'RAD, 20 May 2024: about 30 chest X-rays'))),
        h('p', { class: 'src-note' }, 'Mars has no global magnetic field, so the baseline is steady cosmic rays and the danger is a solar storm. Cliffs and caves give partial shielding. Sources: ',
          h('a', { href: data.SOURCES.rad.url, target: '_blank', rel: 'noopener' }, 'Curiosity RAD'), ', ', h('a', { href: data.SOURCES.storm2024.url, target: '_blank', rel: 'noopener' }, 'May 2024 storm'), '.')));
    }
    body.append(h('div', { class: 'sect' }, h('h4', {}, 'At the sampling site'),
      h('p', {}, 'Jezero soil carries perchlorate salts (about 0.5% by weight) and very fine silica and iron-oxide dust. Keep samples sealed, brush suits down before going inside, and do not let dust reach the cabin air.'),
      h('p', { class: 'src-note' }, 'These checks use planning assumptions you set in the designer. They are not NASA flight rules.')));
  }

  function renderPlan() {
    const body = $('planBody'); body.replaceChildren(); ui.tooltip(null);
    $('nTargets').textContent = st.targets.length;
    ({ targets: renderTargets, route: renderRoute, safety: renderSafety })[st.tab](body);
  }

  /* ---------- layer dock ---------- */
  const SW = {
    slope: ['linear-gradient(90deg,#f79632,#e83c34)', ''], sand: ['#3cd6dc', ''], range: ['#bee2ff', 'line'], predict: ['#ff5fa5', ''],
    explored: ['#7fe3b0', ''], track: ['#ffffff', 'line'], sites: ['#f7f0e5', 'dot'], contours: ['#fff4e0', 'line'], thermal: ['linear-gradient(90deg,#111,#eee)', ''],
    places: ['#ffffff', 'line'], grid: ['#f7f0e5', 'line'],
  };
  function renderDock() {
    const body = $('dockBody'); body.replaceChildren();
    for (const g of [...new Set(data.LAYERS.map((l) => l.group))]) {
      const box = h('div', { class: 'dock-group' }, h('h3', {}, g));
      for (const l of data.LAYERS.filter((x) => x.group === g)) {
        const [col, shape] = SW[l.id];
        box.append(h('label', { class: `lyr ${st.layers.has(l.id) ? '' : 'off'}`, title: l.desc },
          h('input', { type: 'checkbox', id: `ly-${l.id}`, checked: st.layers.has(l.id) || null, onchange: (e) => toggleLayer(l.id, e.target.checked) }),
          h('span', { class: `sw ${shape}`, style: shape === 'line' ? { borderTopColor: col } : { background: col } }),
          h('span', { class: 'lyr-name' }, l.name), h('span', { class: 'tgl' })));
        if (l.id === 'slope' && st.layers.has('slope')) box.append(h('div', { class: 'lyr-key' }, h('i', { style: { background: '#f28446' } }), `over ${Math.round(cfg.maxSlope * 0.7)}°`, h('i', { style: { background: '#e8463e' } }), `over ${cfg.maxSlope}°, blocked`));
        if (l.id === 'predict' && st.layers.has('predict')) box.append(h('div', { class: 'lyr-key' }, `Pink outline: ground that looks like rover-verified "${objective().short.toLowerCase()}" sites. Numbered pins are the best unvisited patches.`));
        if (l.id === 'range' && st.layers.has('range')) box.append(h('div', { class: 'lyr-key' }, `Dashed line: furthest you can go and still be back in ${cfg.evaHours} h. Dimmed ground is out of reach.`));
      }
      body.append(box);
    }
    body.append(h('div', { class: 'dock-group' }, h('h3', {}, 'Imagery'),
      h('label', { class: `lyr ${st.tinted ? '' : 'off'}`, title: 'HiRISE and CTX are black-and-white cameras. This tint is cosmetic.' },
        h('input', { type: 'checkbox', id: 'ly-tint', checked: st.tinted || null, onchange: (e) => { st.tinted = e.target.checked; map.getPane('gray').classList.toggle('tinted', st.tinted); renderDock(); } }),
        h('span', { class: 'sw', style: { background: 'linear-gradient(90deg,#6b4a33,#e2a87c)' } }), h('span', { class: 'lyr-name' }, 'Mars colour tint'), h('span', { class: 'tgl' }))));
  }
  function toggleLayer(id, on) {
    if (on) st.layers.add(id); else st.layers.delete(id);
    if (id === 'contours' && on && !LY.contours) buildContours();
    if (LY[id]) { if (on) LY[id].addTo(map); else map.removeLayer(LY[id]); }
    if (id === 'grid') drawGrat();
    renderDock();
  }
  $('dockToggle').onclick = () => { const c = $('dock').classList.toggle('collapsed'); $('dockToggle').innerHTML = icon(c ? 'layers' : 'chevLeft'); };
  $('planToggle').onclick = () => { const c = $('plan').classList.toggle('collapsed'); $('planToggle').innerHTML = icon(c ? 'route' : 'chevRight'); };
  if (window.innerWidth < 900) { $('dock').classList.add('collapsed'); $('dockToggle').innerHTML = icon('layers'); }

  /* ---------- sites, place names, graticule ---------- */
  function buildSites() {
    const g = L.layerGroup();
    for (const s of data.SITES) {
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'mk', html: `<div class="mk-site ${s.kind === 'sample' ? '' : 'landmark'}"></div>`, iconSize: [12, 12] }), zIndexOffset: 300 })
        .bindTooltip(s.name, { className: 'tag', direction: 'top', offset: [0, -8] })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); inspect(s.lon, s.lat, s); }).addTo(g);
    }
    setLayer('sites', g);
    setLayer('thermal', thermalTiles);
  }
  const placeGroup = L.layerGroup();
  function drawPlaces() {
    placeGroup.clearLayers();
    const z = map.getZoom(), add = (lat, lon, text, cls) => L.marker([lat, lon], { pane: 'labels', interactive: false, icon: L.divIcon({ className: '', html: `<div class="place ${cls}">${text}</div>`, iconSize: [0, 0] }) }).addTo(placeGroup);
    for (const p of data.PLACES) if (p.rank === 1 ? z < 15 : z >= 12.5) add(p.lat, p.lon, p.name, p.rank === 2 ? 'r2' : '');
    if (z >= 14.5 && st.layers.has('sites')) for (const s of data.SITES) add(s.lat, s.lon, s.name, 'site');
  }
  setLayer('places', placeGroup);
  const gratGroup = L.layerGroup().addTo(map);
  function drawGrat() {
    gratGroup.clearLayers(); const box = $('grat'); box.replaceChildren();
    if (!st.layers.has('grid')) return;
    const b = map.getBounds(), span = b.getEast() - b.getWest();
    const stepDeg = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005].find((s) => span / s >= 4) || 0.0005;
    const dec = Math.max(0, Math.ceil(-Math.log10(stepDeg)) + (String(stepDeg).includes('5') && stepDeg < 1 ? 0 : 0));
    const style = { color: '#f7f0e5', weight: 1, opacity: 0.2, interactive: false };
    const size = map.getSize();
    for (let lon = Math.ceil(b.getWest() / stepDeg) * stepDeg; lon <= b.getEast(); lon += stepDeg) {
      L.polyline([[b.getSouth(), lon], [b.getNorth(), lon]], style).addTo(gratGroup);
      const x = map.latLngToContainerPoint([b.getSouth(), lon]).x;
      if (x > 300 && x < size.x - 420) box.append(h('span', { style: { left: x + 4 + 'px', bottom: '52px' } }, lon.toFixed(dec) + '°E'));
    }
    for (let lat = Math.ceil(b.getSouth() / stepDeg) * stepDeg; lat <= b.getNorth(); lat += stepDeg) {
      L.polyline([[lat, b.getWest()], [lat, b.getEast()]], style).addTo(gratGroup);
      const y = map.latLngToContainerPoint([lat, b.getWest()]).y;
      if (y > 130 && y < size.y - 110) box.append(h('span', { style: { left: '274px', top: y - 15 + 'px' } }, lat.toFixed(dec) + '°N'));
    }
  }
  function drawScale() {
    const z = map.getZoom(), mPerPx = 180 / (256 * Math.pow(2, z)) * mPerDeg * t.coslat;
    const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter((v) => v / mPerPx <= 120).pop() || 5;
    $('scaleBar').style.width = Math.round(nice / mPerPx) + 'px'; $('scaleText').textContent = nice >= 1000 ? nice / 1000 + ' km' : nice + ' m';
    $('resNote').textContent = z >= 13 && map.getBounds().intersects([[18.3068, 77.2229], [18.6693, 77.5840]]) ? `HiRISE 25 cm imagery · ${mPerPx < 1 ? (mPerPx * 100).toFixed(0) + ' cm' : mPerPx.toFixed(1) + ' m'} per pixel`
      : z >= 8 ? `CTX ${z >= 11 ? '6 m' : 'context'} imagery · ${mPerPx.toFixed(0)} m per pixel` : `Viking colour mosaic · ${mPerPx.toFixed(0)} m per pixel`;
  }
  const fadeRaster = () => { const z = map.getZoom(); map.getPane('raster').style.opacity = String(Math.max(0.35, Math.min(1, 1 - (z - 13.5) * 0.2))); };
  map.on('moveend zoomend', () => { drawGrat(); drawScale(); drawPlaces(); fadeRaster(); });
  map.on('mousemove', (e) => {
    const k = t.index(e.latlng.lng, e.latlng.lat);
    $('roPos').replaceChildren(h('b', {}, fmt.coord(e.latlng.lng, e.latlng.lat)), k >= 0 ? `  elev ${Math.round(t.elev[k]).toLocaleString('en-US')} m  slope ${t.slope[k].toFixed(0)}°` : '  outside elevation model');
  });

  /* ---------- site inspector ---------- */
  const probe = L.layerGroup().addTo(map);
  function inspect(lon, lat, site) {
    probe.clearLayers();
    L.marker([lat, lon], { icon: L.divIcon({ className: 'mk', html: '<div class="mk-probe"></div>', iconSize: [22, 22] }), interactive: false }).addTo(probe);
    const k = t.index(lon, lat), box = h('div', { class: 'insp' });
    box.append(h('h3', {}, site ? site.name : (k >= 0 ? whereText(lon, lat) : 'Outside the study area')), h('div', { class: 'where' }, fmt.coord(lon, lat)));
    if (site) box.append(h('div', { class: 'row' }, h('span', { class: 's-muted', html: icon('flag') }), h('div', {}, h('b', {}, site.samples ? `Samples: ${site.samples.join(', ')}` : site.kind === 'depot' ? 'Sample depot' : 'Landmark'),
      h('span', {}, `${site.note}${site.rock ? ' Rock type: ' + site.rock + '.' : ''} Sol ${site.sol}.`))));
    if (k < 0) {
      box.append(h('div', { class: 'row' }, lvIcon('warning'), h('div', {}, h('b', {}, 'Imagery only'), h('span', {}, 'This point is outside the 20 m elevation model, so there is no slope, hazard, prediction or route data for it.'))));
    } else {
      const d = t.describe(k, { maxSlope: cfg.maxSlope });
      box.append(h('div', { class: 'insp-facts' },
        h('div', {}, h('small', {}, 'Elevation'), h('b', {}, Math.round(d.elev).toLocaleString('en-US') + ' m')),
        h('div', {}, h('small', {}, 'Slope'), h('b', {}, fmt.deg(d.slope))),
        h('div', {}, h('small', {}, 'Relief in 100 m'), h('b', {}, '±' + d.rough.toFixed(1) + ' m'))));
      if (d.hazards.length) for (const hz of d.hazards) box.append(h('div', { class: 'row' }, lvIcon(hz.level), h('div', {}, h('b', {}, hz.title), h('span', {}, hz.text))));
      else box.append(h('div', { class: 'row' }, lvIcon('good'), h('div', {}, h('b', {}, 'No terrain hazard flagged'), h('span', {}, 'Gentle slope, firm at night in infrared, and smooth at the 20 m scale. Small rocks below that scale still need eyes on the ground.'))));
      // explored?
      let bw = null, bd = Infinity;
      for (const w of st.rover.waypoints) { const dd = t.distance(lon, lat, w[1], w[2]); if (dd < bd) { bd = dd; bw = w; } }
      box.append(h('div', { class: 'row' }, h('span', { style: { color: 'var(--explored)' }, html: icon('track') }), h('div', {},
        h('b', {}, dist[k] <= 100 ? 'Ground-truthed by Perseverance' : 'Never visited'),
        h('span', {}, dist[k] <= 100 ? `The rover drove within ${Math.round(dist[k])} m of here around sol ${bw[0]} (${data.campaignOf(bw[0]) ? data.campaignOf(bw[0]).name : 'recent drive'}).` : `Closest rover approach is ${fmt.km(dist[k])} away (sol ${bw[0]}). Everything known here comes from orbit.`))));
      // evidence
      const c = feat.cellOf(lon, lat), ev = P.rankEvidence(feat.Z, c * NF, R, isPos);
      const names = [...new Set(ev.sources.map((s) => nearestSite(s.ref.lon, s.ref.lat).site.name))].slice(0, 2).join(' and ');
      box.append(h('div', { class: 'row' }, h('span', { style: { color: 'var(--predict)' }, html: icon('sparkle') }), h('div', {},
        h('b', {}, ev.scorable ? `${objective().short} evidence ${ev.score.toFixed(2)}${ev.score >= P.MIN_RESOURCE_SCORE ? ' (above threshold)' : ''}` : 'Too little evidence to score'),
        h('span', {}, ev.scorable ? `Most similar rover-verified ground: near ${names} (${ev.sources[0].ref.campaign}).` : 'Nothing the rover has tested looks like this from orbit, so the model does not guess.'))));
      // reach
      const cost = st.field.cost[k], pass = t.slope[k] <= cfg.maxSlope;
      box.append(h('div', { class: 'row' }, h('span', { class: pass && cost <= budget ? 's-good' : 's-serious', html: icon('range') }), h('div', {},
        h('b', {}, !pass ? 'Blocked by slope' : cost <= budget ? `In range: ${fmt.dur(minutes(cost))} from ${st.start.name}` : 'Beyond this EVA’s range'),
        h('span', {}, !pass ? 'Routes cannot end here. The nearest passable ground will be used.' : cost <= budget ? `Round trip with a ${fmt.dur(siteMin)} stop: ${fmt.dur(2 * minutes(cost) + siteMin)}.` : `Too far to reach and return from in ${cfg.evaHours} h.`))));
      // conditions at this moment
      const nowL = MT.local(Date.now(), lon, lat), nowIrr = MT.irradiance(nowL.zenith, st.tau, nowL.ls), bad = st.checks.filter((c) => ['Space weather', 'Dust in the sky'].includes(c.title) && c.level !== 'good');
      const nowLevel = nowL.sunElevation <= 0 ? 'critical' : bad.some((c) => c.level === 'critical') ? 'critical' : bad.length ? 'serious' : 'good';
      box.append(h('div', { class: 'row' }, lvIcon(nowLevel), h('div', {},
        h('b', {}, nowL.sunElevation <= 0 ? 'Right now: dark' : `Right now: Sun ${nowL.sunElevation.toFixed(0)}\u00b0 up, ${Math.round(nowIrr.global)} W/m\u00b2`),
        h('span', {}, nowL.sunElevation <= 0 ? `Night at ${MT.fmtClock(nowL.ltst)} local time. No EVA until after sunrise at ${MT.fmtClock(MT.daylight(nowL.ls, lat).sunrise)}.`
          : bad.length ? bad.map((c) => `${c.title}: ${c.value}.`).join(' ') + ' Open Safety for details.' : `${MT.fmtClock(nowL.ltst)} local time, sky opacity \u03c4 ${st.tau.toFixed(1)}, no solar storm flagged.`))));
      box.append(h('div', { class: 'insp-actions' },
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => { routeTo(lon, lat); map.closePopup(); } }, 'Route here'),
        h('button', { class: 'btn btn-sm', onclick: () => { startFrom(lon, lat); map.closePopup(); } }, 'Start from here')));
    }
    L.popup({ maxWidth: 330, autoPanPaddingTopLeft: [280, 80], autoPanPaddingBottomRight: [410, 30] }).setLatLng([lat, lon]).setContent(box).openOn(map);
  }
  map.on('click', (e) => inspect(e.latlng.lng, e.latlng.lat));
  map.on('popupclose', () => probe.clearLayers());
  function routeTo(lon, lat) {
    const goal = P.snap(t, t.index(lon, lat), cfg.maxSlope, 8);
    if (goal < 0) { toast('No passable ground near that point.'); return; }
    const [glon, glat] = t.lonLat(goal), c = feat.cellOf(glon, glat), ev = P.rankEvidence(feat.Z, c * NF, R, isPos);
    const cost = st.field.cost[goal];
    st.custom = { custom: true, label: '★', lon: glon, lat: glat, goal, score: ev.scorable ? ev.score : NaN, where: whereText(glon, glat), ev,
      match: nearestSite(ev.sources[0].ref.lon, ev.sources[0].ref.lat).site, effortM: Number.isFinite(cost) ? cost : null, oneWayMin: Number.isFinite(cost) ? minutes(cost) : 0, far: false };
    select(st.custom, true);
    if (st.routes) { st.custom.oneWayMin = st.routes.risk.outMin; st.custom.effortM = st.routes.risk.terrainWeightedCost; }
    setTab('route');
  }
  function startFrom(lon, lat) {
    cfg.start = 'custom'; cfg.lon = lon; cfg.lat = lat; st.custom = null; st.depart = { mode: 'now', ltst: 9 };
    history.replaceState(null, '', '?' + data.serializeConfig(cfg)); $('backLink').href = 'index.html?' + data.serializeConfig(cfg);
    plan(); setTab('targets'); toast(`Start moved. ${st.targets.length} target${st.targets.length === 1 ? '' : 's'} within reach.`);
  }

  /* ---------- conditions ---------- */
  function tickBar() {
    const l = here(), irr = MT.irradiance(l.zenith, st.tau, l.ls);
    $('cSol').textContent = `Sol ${MT.missionSol(Date.now())}`; $('cClock').textContent = `${MT.fmtClock(l.ltst)} local`;
    $('cSun').textContent = l.sunElevation > 0 ? `Sun ${l.sunElevation.toFixed(0)}°` : 'Night'; $('cIrr').textContent = l.sunElevation > 0 ? `${Math.round(irr.global)} W/m²` : `sunrise ${MT.fmtClock(MT.daylight(l.ls, st.start.lat).sunrise)}`;
    if (st.meda && st.meda.temp) { $('cTemp').textContent = `${Math.round(st.meda.temp.minC)} to ${Math.round(st.meda.temp.maxC)} °C`; $('cTempNote').textContent = `MEDA sol ${st.meda.temp.sol}`; }
    if (st.storm) { $('cStorm').className = `status s-${st.storm.level}`; $('cStorm').replaceChildren(h('span', { class: 'dot' }), st.storm.label === 'Quiet' ? 'Sun quiet' : st.storm.label); }
    $('cDot').className = 'live-dot' + (st.rover && st.rover.source === 'live' ? '' : ' off');
  }
  function renderConditions() {
    const body = $('condBody'), l = here(), day = MT.daylight(l.ls, st.start.lat), irr = MT.irradiance(l.zenith, st.tau, l.ls), tl = timeline();
    const chart = h('div', {});
    body.replaceChildren(
      h('div', { class: 'grid2' },
        h('div', { class: 'tile' }, h('small', {}, 'Local solar time at your start'), h('b', {}, `${MT.fmtClock(l.ltst)} · Sol ${MT.missionSol(Date.now())}`), h('span', {}, `${MT.seasonName(l.ls)}, Ls ${l.ls.toFixed(0)}°. Day ${MT.fmtClock(day.sunrise)} to ${MT.fmtClock(day.sunset)}`)),
        h('div', { class: 'tile' }, h('small', {}, 'Sunlight on level ground now'), h('b', {}, l.sunElevation > 0 ? `${Math.round(irr.global)} W/m²` : 'Night'), h('span', {}, l.sunElevation > 0 ? `${Math.round(irr.direct)} direct + ${Math.round(irr.diffuse)} scattered by dust` : 'Sun below the horizon')),
        h('div', { class: 'tile' }, h('small', {}, 'Air temperature, last report'), h('b', {}, st.meda && st.meda.temp ? `${st.meda.temp.minC.toFixed(0)} to ${st.meda.temp.maxC.toFixed(0)} °C` : 'no data'), h('span', {}, st.meda && st.meda.temp ? `MEDA sol ${st.meda.temp.sol} (${st.meda.temp.date}), ${st.meda.temp.season}` : '')),
        h('div', { class: 'tile' }, h('small', {}, 'Air pressure, last report'), h('b', {}, st.meda && st.meda.pressure ? `${Math.round(st.meda.pressure.pressurePa)} Pa` : 'no data'), h('span', {}, 'Under 1% of Earth sea level: suit pressure is life support'))),
      st.meda && st.meda.temp ? h('p', { class: 'src-note' }, `NASA’s public MEDA feed last carried measurements on sol ${st.meda.temp.sol}. They show the range to expect, not this sol’s weather.`) : null,
      h('div', { class: 'sect' }, h('h4', {}, `Sunlight through the day, W/m² (dust opacity τ ${st.tau.toFixed(1)})`), chart,
        h('div', { class: 'seg-s', style: { marginTop: '10px' } }, ...[[0.4, 'Clear'], [0.5, 'Seasonal'], [1.0, 'Hazy'], [2.5, 'Dusty'], [4, 'Storm']].map(([v, name]) =>
          h('button', { 'aria-pressed': String(Math.abs(st.tau - v) < 0.01), onclick: () => { st.tau = v; assess(); tickBar(); renderConditions(); renderPlan(); } }, `${name} τ ${v}`))),
        h('p', { class: 'src-note' }, 'Beer’s law for the direct beam plus the NASA TM-102299 net-flux table for scattered light. Set τ from the sky you see: no public feed reports it live.')),
      h('div', { class: 'sect' }, h('h4', {}, `Solar storms predicted to reach Mars (${st.sw ? (st.sw.source === 'live' ? 'live from NASA DONKI' : 'saved copy of ' + st.sw.snapshotDate) : 'loading'})`),
        ...(st.sw ? (st.sw.events.length ? st.sw.events.slice(-5).reverse().map((e) => h('div', { class: 'ev' }, lvIcon(e.t > Date.now() - 36 * 3600000 ? (e.glancing || e.minor ? 'serious' : 'critical') : 'good'),
          h('div', {}, h('b', {}, fmt.utc(e.t)), h('span', {}, ` ${e.t > Date.now() ? 'arrives in ' + fmt.until(e.t) : 'arrived ' + fmt.ago(e.t)}. ${e.glancing ? 'Glancing blow' : e.minor ? 'Minor impact' : 'Direct hit'}${e.speed ? `, ${Math.round(e.speed)} km/s at launch` : ''}.`))))
          : [h('p', {}, `None in the ${st.sw.simulations} simulations NASA ran from ${st.sw.range[0]} to ${st.sw.range[1]}.`)]) : [h('p', {}, 'Contacting NASA.')]),
        h('p', { class: 'src-note' }, 'From WSA-ENLIL heliosphere simulations. Arrival times are forecasts with several hours of uncertainty.')),
      h('div', { class: 'sect' }, h('h4', {}, 'Perseverance'),
        h('p', {}, `${st.rover.source === 'live' ? 'Live from NASA' : 'Saved copy'}: last drive ended sol ${st.rover.latest.sol} at ${fmt.coord(st.rover.latest.lon, st.rover.latest.lat)}, ${st.rover.latest.distKm.toFixed(2)} km driven since landing.${st.rover.modified ? ' NASA file updated ' + st.rover.modified.replace(' GMT', ' UTC') + '.' : ''}`)));
    ui.sunChart(chart, { ls: l.ls, lat: st.start.lat, tau: st.tau, now: l.ltst, eva: tl ? { start: tl.dep, end: tl.back } : null });
  }
  const toggleCond = (open) => { $('condCard').hidden = !open; $('condBar').setAttribute('aria-expanded', String(open)); if (open) renderConditions(); else ui.tooltip(null); };
  $('condBar').onclick = () => toggleCond($('condCard').hidden); $('condClose').onclick = () => toggleCond(false);
  $('goBadge').onclick = () => setTab('safety');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleCond(false); });

  /* ---------- assemble ---------- */
  buildSlope(); buildSand(); buildSites();
  if (st.layers.has('contours')) buildContours();
  plan();
  const fitAll = () => { const pts = [[st.start.lat, st.start.lon]].concat(st.targets.map((x) => [x.lat, x.lon])); map.flyToBounds(L.latLngBounds(pts).pad(0.5), { duration: 0.6, maxZoom: 15, paddingTopLeft: [270, 70], paddingBottomRight: [400, 20] }); };
  map.fitBounds(L.latLngBounds([[st.start.lat, st.start.lon]].concat(st.targets.map((x) => [x.lat, x.lon]))).pad(0.5), { maxZoom: 15, paddingTopLeft: [270, 70], paddingBottomRight: [400, 20] });
  $('zHome').onclick = fitAll; $('zRover').onclick = () => map.flyTo([st.rover.latest.lat, st.rover.latest.lon], 16, { duration: 0.8 });
  renderDock(); drawGrat(); drawScale(); drawPlaces(); tickBar();
  await step(6);
  stepEls.forEach((el) => { el.className = 'ok'; if (el.firstChild.tagName !== 'svg') el.firstChild.outerHTML = icon('check'); });
  setTimeout(() => $('loader').classList.add('done'), 250);

  /* ---------- live feeds ---------- */
  async function refreshRover() {
    const before = st.rover.waypoints.length, r = await Live.rover();
    st.rover = r;
    if (r.source === 'live' && (r.waypoints.length !== before || r.path !== window.ATLAS_ROVER_SNAPSHOT.path)) {
      await buildRover(); buildScore();
      if (r.waypoints.length !== before || cfg.start === 'rover') { const keep = st.depart; plan(); st.depart = keep; toast(`Perseverance track updated from NASA: now at sol ${r.latest.sol}.`); }
    } else await buildRover();
    tickBar(); if (!$('condCard').hidden) renderConditions();
  }
  Live.meda().then((m) => { st.meda = m; tickBar(); if (!$('condCard').hidden) renderConditions(); });
  const refreshStorm = () => Live.spaceWeather().then((sw) => { st.sw = sw; assess(); tickBar(); renderPlan(); if (!$('condCard').hidden) renderConditions(); });
  refreshStorm(); refreshRover();
  const C = window.ATLAS_CONFIG || {};
  setInterval(refreshRover, (C.ROVER_REFRESH_MIN || 15) * 60000);
  setInterval(refreshStorm, (C.SPACE_WEATHER_REFRESH_MIN || 60) * 60000);
  setInterval(() => { tickBar(); if (st.depart.mode === 'now') { assess(); if (st.tab !== 'targets') { const sc = $('planBody').scrollTop; if (!document.activeElement || document.activeElement.id !== 'departRange') { renderPlan(); $('planBody').scrollTop = sc; } } } }, 30000);
  window.__atlas = { st, map, t };
})().catch((err) => {
  console.error(err);
  const sub = document.getElementById('loaderSub');
  if (sub) sub.textContent = 'Something went wrong while building the map: ' + (err && err.message ? err.message : err);
});
