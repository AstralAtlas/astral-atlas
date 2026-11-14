/* Mission designer page: collects the four choices and hands them to map.html in the URL. */
(function () {
  'use strict';
  const { data, ui, MarsTime: MT, Live } = window.Atlas;
  const { h, icon, fmt } = ui;
  const $ = (id) => document.getElementById(id);
  const S = data.STUDY;

  let cfg;
  try { cfg = data.parseConfig(location.search.length > 1 ? location.search : (localStorage.getItem('atlas.mission') || '')); }
  catch (e) { cfg = data.parseConfig(''); }
  let startTouched = location.search.length > 1;
  let roverPos = (() => { const w = window.ATLAS_ROVER_SNAPSHOT.waypoints; const l = w[w.length - 1]; return { sol: l[0], lon: l[1], lat: l[2] }; })();

  $('icObjective').innerHTML = icon('target'); $('icStart').innerHTML = icon('pin');
  $('icCrew').innerHTML = icon('sliders'); $('icLayers').innerHTML = icon('layers'); $('icGo').innerHTML = icon('arrowRight');

  /* ---------- objective ---------- */
  function optionCard(name, value, checked, body) {
    return h('label', { class: 'option' },
      h('input', { type: 'radio', name, value, checked: checked || null, id: `${name}-${value}` }),
      h('span', { class: 'option-body' }, ...body),
      h('span', { class: 'option-check', html: icon('check') }));
  }
  $('objectiveOptions').append(...data.OBJECTIVES.map((o) => optionCard('objective', o.id, o.id === cfg.objective, [
    h('span', { class: 'option-icon', html: icon(o.icon) }),
    h('span', {}, h('span', { class: 'option-title' }, o.name), h('span', { class: 'option-text' }, o.pitch),
      h('span', { class: 'option-evidence', html: icon('sparkle') }, h('span', {}, o.evidence))),
  ])));

  /* ---------- start point ---------- */
  const LETTERS = ['A', 'B', 'C', 'R'];
  const xy = (lon, lat) => [((lon - S.west) / (S.east - S.west)) * 100, ((S.north - lat) / (S.north - S.south)) * 100];
  const startPos = (sp) => (sp.live ? roverPos : sp);

  function renderStart() {
    const list = $('startOptions'), pins = $('locatorPins');
    list.replaceChildren(...data.START_POINTS.map((sp, i) => optionCard('start', sp.id, sp.id === cfg.start, [
      h('span', { class: 'option-icon' }, LETTERS[i]),
      h('span', {}, h('span', { class: 'option-title' }, sp.name),
        h('span', { class: 'option-text' }, sp.live ? `${sp.blurb} Now at ${fmt.coord(roverPos.lon, roverPos.lat)}.` : sp.blurb)),
    ])));
    if (cfg.start === 'custom' && cfg.lon != null) {
      list.append(optionCard('start', 'custom', true, [
        h('span', { class: 'option-icon' }, '+'),
        h('span', {}, h('span', { class: 'option-title' }, 'Your own start point'),
          h('span', { class: 'option-text mono' }, fmt.coord(cfg.lon, cfg.lat))),
      ]));
    }
    const mk = (lon, lat, label, id, cls) => {
      const [x, y] = xy(lon, lat);
      return h('button', { type: 'button', class: `pin ${cls || ''} ${cfg.start === id ? 'sel' : ''}`, style: { left: x + '%', top: y + '%' },
        'aria-label': `Start at ${label}`, title: label, onclick: (e) => { e.stopPropagation(); setStart(id); } }, id === 'custom' ? '+' : LETTERS[data.START_POINTS.findIndex((s) => s.id === id)]);
    };
    pins.replaceChildren(...data.START_POINTS.map((sp) => { const p = startPos(sp); return mk(p.lon, p.lat, sp.name, sp.id, sp.live ? 'rover' : ''); }),
      cfg.start === 'custom' && cfg.lon != null ? mk(cfg.lon, cfg.lat, 'your own start point', 'custom') : null);
  }
  function setStart(id) { cfg.start = id; startTouched = true; renderStart(); refresh(); }

  $('locator').addEventListener('click', (e) => {
    const box = $('locator').getBoundingClientRect();
    cfg.lon = S.west + ((e.clientX - box.left) / box.width) * (S.east - S.west);
    cfg.lat = S.north - ((e.clientY - box.top) / box.height) * (S.north - S.south);
    setStart('custom');
  });
  (function drawTrack() {
    const pts = window.ATLAS_ROVER_SNAPSHOT.path.filter((_, i) => i % 6 === 0).map((p) => { const [x, y] = xy(p[0], p[1]); return `${(x * 10).toFixed(1)},${(y * 9.475).toFixed(1)}`; });
    $('locatorTrack').innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="#0b0908" stroke-width="5" stroke-linejoin="round" opacity="0.55"/><polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="2.200" stroke-linejoin="round"/>`;
  })();

  /* ---------- crew ---------- */
  $('modeOptions').append(...Object.values(data.MOBILITY).map((m) => optionCard('mode', m.id, m.id === cfg.mode, [
    h('span', { class: 'option-icon', html: icon(m.id === 'foot' ? 'person' : 'rover') }),
    h('span', {}, h('span', { class: 'option-title' }, m.name), h('span', { class: 'option-text' }, m.blurb)),
  ])));
  const seasonalTau = () => { const ls = MT.orbit(Date.now()).ls; return ls >= 180 ? 1.0 : 0.5; };
  const TAUS = [['auto', () => `Seasonal default (τ ${seasonalTau().toFixed(1)})`], ['0.4', () => 'Clear (τ 0.4)'], ['1', () => 'Hazy (τ 1.0)'], ['2.5', () => 'Dusty (τ 2.5)']];
  const tauValue = cfg.tau == null ? 'auto' : String(cfg.tau);
  $('tauOptions').append(...TAUS.map(([v, label]) => h('label', {},
    h('input', { type: 'radio', name: 'tau', value: v, checked: v === tauValue || null, id: `tau-${v}` }), h('span', {}, label()))));

  const sliders = {
    maxSlope: (v) => `${v}°`,
    evaHours: (v) => `${v} h`,
    siteMinutes: (v) => fmt.dur(v),
  };
  for (const [id, show] of Object.entries(sliders)) {
    const el = $(id); el.value = cfg[id];
    const sync = () => { cfg[id] = +el.value; $(id + 'Out').textContent = show(+el.value); };
    el.addEventListener('input', () => { sync(); refresh(); }); sync();
  }

  /* ---------- layers ---------- */
  const groups = [...new Set(data.LAYERS.map((l) => l.group))];
  $('layerGroups').append(...groups.map((g) => h('div', { class: 'layer-group' }, h('h4', {}, g),
    ...data.LAYERS.filter((l) => l.group === g).map((l) => h('label', { class: 'layer-toggle' },
      h('input', { type: 'checkbox', name: 'layer', value: l.id, checked: cfg.layers.includes(l.id) || null, id: `layer-${l.id}` }),
      h('span', {}, h('b', {}, l.name), h('small', {}, l.desc)),
      h('span', { class: 'layer-kind' }, l.kind))))));

  /* ---------- state ---------- */
  $('designer').addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'objective') {
      cfg.objective = t.value;
      if (!startTouched) { cfg.start = data.OBJECTIVES.find((o) => o.id === t.value).suggestedStart; renderStart(); }
    }
    if (t.name === 'start') { cfg.start = t.value; startTouched = true; renderStart(); }
    if (t.name === 'mode') { cfg.mode = t.value; cfg.maxSlope = data.MOBILITY[t.value].maxSlope; $('maxSlope').value = cfg.maxSlope; $('maxSlopeOut').textContent = sliders.maxSlope(cfg.maxSlope); }
    if (t.name === 'tau') cfg.tau = t.value === 'auto' ? null : +t.value;
    if (t.name === 'layer') cfg.layers = Array.from(document.querySelectorAll('input[name=layer]:checked')).map((i) => i.value);
    refresh();
  });

  function refresh() {
    const o = data.OBJECTIVES.find((x) => x.id === cfg.objective);
    const sp = data.START_POINTS.find((x) => x.id === cfg.start);
    const from = cfg.start === 'custom' ? 'your own start point' : sp.name;
    $('planSummary').replaceChildren(h('b', {}, o.name), ` from ${from}, `, h('b', {}, data.MOBILITY[cfg.mode].name.toLowerCase()),
      `, back within ${cfg.evaHours} h, slopes up to ${cfg.maxSlope}°, ${cfg.layers.length} map layers.`);
    try { localStorage.setItem('atlas.mission', data.serializeConfig(cfg)); } catch (e) { /* storage blocked */ }
  }

  $('designer').addEventListener('submit', (e) => {
    e.preventDefault();
    $('launch').hidden = false;
    const steps = ['Loading NASA terrain for Jezero', 'Reading Perseverance’s track', 'Ranking unexplored targets'];
    let i = 0; const timer = setInterval(() => { i++; if (steps[i]) $('launchText').textContent = steps[i]; }, 260);
    setTimeout(() => { clearInterval(timer); location.href = 'map.html?' + data.serializeConfig(cfg); }, 700);
  });
  window.addEventListener('pageshow', () => { $('launch').hidden = true; });

  /* ---------- live strip ---------- */
  function tick() {
    const now = Date.now(), l = MT.local(now, data.JEZERO.lon, data.JEZERO.lat), day = MT.daylight(l.ls, data.JEZERO.lat);
    $('liveClock').textContent = `Sol ${MT.missionSol(now)} · ${MT.fmtClock(l.ltst)} local solar time`;
    $('liveSun').replaceChildren('Sun ', h('b', {}, l.sunElevation > 0 ? `${l.sunElevation.toFixed(0)}° up, sets ${MT.fmtClock(day.sunset)}` : `down, rises ${MT.fmtClock(day.sunrise)}`));
  }
  tick(); setInterval(tick, 5000);

  Live.rover({ track: false }).then((r) => {
    roverPos = { sol: r.latest.sol, lon: r.latest.lon, lat: r.latest.lat };
    $('liveRover').replaceChildren(r.source === 'live' ? h('span', { class: 'live-dot' }) : h('span', { class: 'live-dot off' }), 'Perseverance ',
      h('b', {}, `${fmt.coord(r.latest.lon, r.latest.lat)}`), ` · sol ${r.latest.sol}${r.source === 'live' ? '' : ' (saved copy)'}`);
    $('roverKm').textContent = r.latest.distKm.toFixed(1);
    renderStart();
  });
  Live.spaceWeather().then((sw) => {
    const a = Live.assess(sw, Date.now(), Date.now() + 8 * 3600000);
    let text = 'no storm headed for Mars';
    if (a.hits.length) text = `${a.label.toLowerCase()}: arrival at Mars predicted ${fmt.utc(a.hits[a.hits.length - 1].t)}`;
    else if (a.upcoming) text = `next arrival in ${fmt.until(a.upcoming.t)}`;
    else if (a.last) text = `quiet, last arrival ${fmt.ago(a.last.t)}`;
    $('liveStorm').replaceChildren(h('span', { class: `status s-${a.level}` }, h('span', { class: 'dot' })), 'Space weather ', h('b', {}, text),
      sw.source === 'live' ? '' : ' (saved copy)');
  });

  const check = window.ATLAS_ROVER_SNAPSHOT.demCheck;
  $('demN').textContent = check.n; $('demErr').textContent = Math.abs(check.meanDiffM).toFixed(1);
  const want = ['trek', 'rover', 'samples', 'tm102299', 'mars24', 'donki', 'rad', 'winds', 'rim', 'biosig', 'usgsfloor'];
  $('sourceList').append(...want.map((k) => h('li', {}, h('a', { href: data.SOURCES[k].url, target: '_blank', rel: 'noopener' }, data.SOURCES[k].label))));

  renderStart(); refresh();
})();
