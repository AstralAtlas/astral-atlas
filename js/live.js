/* Live NASA feeds for Jezero, each with a bundled snapshot so the app still works offline.
 *   rover          mars.nasa.gov Mars 2020 traverse + waypoints (Perseverance's real position)
 *   meda           mars.nasa.gov MEDA weather feed (air temperature, pressure, sunrise/sunset)
 *   spaceWeather   NASA CCMC DONKI WSA-ENLIL simulations, filtered to predicted impacts at Mars
 * Every result says whether it is `live` or a `snapshot`, and how old it is. Nothing is simulated. */
(function (root) {
  'use strict';
  const Atlas = (root.Atlas = root.Atlas || {});
  const cfg = () => root.ATLAS_CONFIG || {};
  const ROVER = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/';
  const MEDA = 'https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json';
  const DONKI = 'https://api.nasa.gov/DONKI/WSAEnlilSimulations';

  async function getJson(url, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 15000);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { json: await res.json(), modified: res.headers.get('last-modified') };
    } finally { clearTimeout(timer); }
  }

  const store = {
    get(key, maxAgeMin) {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        return v && Date.now() - v.t < maxAgeMin * 60000 ? v.d : null;
      } catch (e) { return null; }
    },
    set(key, d) { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* storage blocked */ } },
  };

  function latestOf(waypoints) {
    const w = waypoints[waypoints.length - 1];
    return { sol: w[0], lon: w[1], lat: w[2], elev: w[3], distKm: w[4], tilt: w[5] };
  }

  /** Perseverance's track. Resolves quickly with the live waypoints; `path` is live too when the big file arrives. */
  async function rover(opts) {
    const snap = root.ATLAS_ROVER_SNAPSHOT;
    const out = { source: 'snapshot', path: snap.path, waypoints: snap.waypoints, demCheck: snap.demCheck, fetchedAt: null, modified: null };
    try {
      const wp = await getJson(ROVER + 'M20_waypoints.json', 20000);
      const way = wp.json.features.map((f) => {
        const p = f.properties;
        return [p.sol, +p.lon, +p.lat, +p.elev_geoid, +p.dist_km, +(p.tilt || 0)];
      }).filter((w) => Number.isFinite(w[1]) && Number.isFinite(w[2]));
      if (way.length < snap.waypoints.length - 5) throw new Error('short waypoint file');
      out.waypoints = way; out.source = 'live'; out.fetchedAt = Date.now(); out.modified = wp.modified;
      if (opts && opts.track === false) { out.latest = latestOf(way); return out; }
      try {
        const tr = await getJson(ROVER + 'M20_traverse.json', 30000);
        const path = [];
        for (const f of tr.json.features) {
          const sol = f.properties.sol;
          for (const c of f.geometry.coordinates) {
            const last = path[path.length - 1];
            if (last && Math.abs(last[0] - c[0]) < 4e-5 && Math.abs(last[1] - c[1]) < 4e-5) continue;
            path.push([c[0], c[1], sol]);
          }
        }
        if (path.length > 1000) out.path = path;
      } catch (e) { out.pathNote = 'Track line from bundled snapshot; position is live.'; }
    } catch (e) { out.error = String(e.message || e); }
    out.latest = latestOf(out.waypoints);
    return out;
  }

  function parseMeda(sols) {
    const num = (v) => (v === '--' || v == null || v === '' ? null : +v);
    const rows = sols.map((s) => ({
      sol: +s.sol, date: s.terrestrial_date, ls: +s.ls, season: s.season,
      minC: num(s.min_temp), maxC: num(s.max_temp), pressurePa: num(s.pressure),
      sunrise: s.sunrise, sunset: s.sunset,
    })).sort((a, b) => a.sol - b.sol);
    const pick = (k) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i][k] != null) return rows[i]; return null; };
    const t = pick('minC'), p = pick('pressurePa');
    return { rows, latest: rows[rows.length - 1], temp: t, pressure: p };
  }

  async function meda() {
    const snap = root.ATLAS_CONDITIONS_SNAPSHOT;
    try {
      const r = await getJson(MEDA, 12000);
      if (!r.json.sols || !r.json.sols.length) throw new Error('empty feed');
      return Object.assign(parseMeda(r.json.sols), { source: 'live', fetchedAt: Date.now() });
    } catch (e) {
      return Object.assign(parseMeda(snap.meda), { source: 'snapshot', snapshotDate: snap.fetched, error: String(e.message || e) });
    }
  }

  const parseUtc = (s) => Date.parse(s.length === 17 ? s.replace('Z', ':00Z') : s);

  function marsImpacts(sims) {
    const ev = [];
    for (const s of sims) {
      for (const i of s.impactList || []) {
        if (i.location !== 'Mars') continue;
        const c = (s.cmeInputs || []).reduce((a, b) => ((b.speed || 0) > (a.speed || 0) ? b : a), {});
        ev.push({ arrival: i.arrivalTime, glancing: !!i.isGlancingBlow, minor: !!i.isMinorImpact, speed: c.speed || null,
          cmeStart: c.cmeStartTime || null, sim: s.simulationID, modelled: s.modelCompletionTime, link: s.link });
      }
    }
    return ev;
  }

  /** One row per predicted arrival time (several model runs often describe the same storm). */
  function dedupe(events) {
    const byTime = new Map();
    for (const e of events) {
      const t = parseUtc(e.arrival);
      const key = Math.round(t / (6 * 3600000));
      const cur = byTime.get(key);
      if (!cur || parseUtc(e.modelled) > parseUtc(cur.modelled)) byTime.set(key, Object.assign({}, e, { t, runs: (cur ? cur.runs : 0) + 1 }));
      else cur.runs++;
    }
    return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  }

  async function spaceWeather() {
    const snap = root.ATLAS_CONDITIONS_SNAPSHOT.spaceWeather;
    const cached = store.get('atlas.donki', cfg().SPACE_WEATHER_REFRESH_MIN || 60);
    if (cached) return Object.assign(cached, { events: dedupe(cached.raw), cachedCopy: true });
    const day = (ms) => new Date(ms).toISOString().slice(0, 10);
    const now = Date.now(), start = day(now - 16 * 86400000), end = day(now + 86400000);
    try {
      const key = encodeURIComponent(cfg().NASA_API_KEY || 'DEMO_KEY');
      const r = await getJson(`${DONKI}?startDate=${start}&endDate=${end}&api_key=${key}`, 20000);
      if (!Array.isArray(r.json)) throw new Error('unexpected response');
      const data = { source: 'live', fetchedAt: now, range: [start, end], simulations: r.json.length, raw: marsImpacts(r.json) };
      store.set('atlas.donki', data);
      return Object.assign(data, { events: dedupe(data.raw) });
    } catch (e) {
      return { source: 'snapshot', snapshotDate: root.ATLAS_CONDITIONS_SNAPSHOT.fetched, range: snap.range, simulations: snap.simulations,
        raw: snap.events, events: dedupe(snap.events), error: String(e.message || e) };
    }
  }

  /* Shelter rule used by the planner (a planning assumption, stated in the UI): a coronal mass ejection predicted
   * to reach Mars makes the window from 12 h before to 36 h after its predicted arrival a no-go for EVA.
   * WSA-ENLIL arrival times carry an uncertainty of several hours, hence the early start. */
  const LEAD_H = 12, TAIL_H = 36;
  function assess(sw, fromMs, toMs) {
    const H = 3600000;
    const hits = sw.events.filter((e) => e.t - LEAD_H * H <= toMs && e.t + TAIL_H * H >= fromMs);
    const upcoming = sw.events.filter((e) => e.t > fromMs).sort((a, b) => a.t - b.t)[0] || null;
    const last = sw.events.filter((e) => e.t <= fromMs).sort((a, b) => b.t - a.t)[0] || null;
    // A snapshot can only clear the present if it is recent enough to have seen storms now in transit (2 to 5 days).
    const stale = sw.source !== 'live' && Date.now() - Date.parse(sw.snapshotDate + 'T00:00:00Z') > 2 * 86400000;
    let level = 'good', label = 'Quiet';
    if (hits.length) { level = hits.every((e) => e.glancing || e.minor) ? 'serious' : 'critical'; label = hits.every((e) => e.glancing || e.minor) ? 'Storm watch' : 'Solar storm'; }
    else if (stale) { level = 'warning'; label = 'Unverified'; }
    return { level, label, hits, upcoming, last, stale, leadH: LEAD_H, tailH: TAIL_H };
  }

  Atlas.Live = { rover, meda, spaceWeather, assess, parseUtc };
})(typeof window !== 'undefined' ? window : globalThis);
