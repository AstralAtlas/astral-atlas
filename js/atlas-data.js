/* Static mission knowledge for Astral Atlas. Every fact here traces to a NASA or USGS source listed in SOURCES.
 * Site coordinates are Perseverance's own localisations (mars.nasa.gov waypoint log) on the sols it worked each site. */
(function (root) {
  'use strict';
  const Atlas = (root.Atlas = root.Atlas || {});

  const SOURCES = {
    trek: { label: 'NASA Mars Trek (imagery and elevation tiles)', url: 'https://trek.nasa.gov/mars/' },
    hirise: { label: 'MRO HiRISE Jezero mosaic, controlled, 25 cm/px (USGS Astrogeology via Mars Trek)', url: 'https://trek.nasa.gov/mars/' },
    ctx: { label: 'MRO CTX Jezero mosaic 6 m/px and DEM 20 m (USGS Astrogeology via Mars Trek)', url: 'https://trek.nasa.gov/mars/' },
    themis: { label: 'Mars Odyssey THEMIS day and night infrared mosaics, 100 m/px (via Mars Trek)', url: 'https://trek.nasa.gov/mars/' },
    rover: { label: 'Mars 2020 rover traverse and waypoints (NASA/JPL-Caltech, mars.nasa.gov)', url: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json' },
    samples: { label: 'NASA: Perseverance Mars Rock Samples', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/' },
    meda: { label: 'MEDA weather reports (NASA/JPL-Caltech/CAB), mars.nasa.gov feed', url: 'https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html' },
    donki: { label: 'NASA CCMC DONKI: WSA-ENLIL solar-storm simulations', url: 'https://api.nasa.gov/' },
    tm102299: { label: 'Appelbaum & Flood (1989), Solar Radiation on Mars, NASA TM-102299', url: 'https://ntrs.nasa.gov/api/citations/19890018252/downloads/19890018252.pdf' },
    mars24: { label: 'NASA GISS Mars24 Sunclock algorithm (Allison & McEwen 2000)', url: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html' },
    rad: { label: 'NASA/JPL: Curiosity RAD surface radiation, 0.67 mSv per day', url: 'https://www.jpl.nasa.gov/news/data-from-nasa-rovers-voyage-to-mars-aids-planning/' },
    storm2024: { label: 'NASA/JPL: Mars lights up during epic solar storm (May 2024)', url: 'https://www.jpl.nasa.gov/news/nasa-watches-mars-light-up-during-epic-solar-storm/' },
    solarmax: { label: 'NASA: Scientists gear up for solar storms at Mars', url: 'https://www.nasa.gov/solar-system/planets/mars/nasa-scientists-gear-up-for-solar-storms-at-mars/' },
    winds: { label: 'NASA: Perseverance studies the wild winds of Jezero Crater', url: 'https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-studies-the-wild-winds-of-jezero-crater/' },
    rim: { label: 'NASA/JPL PIA26402: Perseverance at the base of Jezero Crater’s rim', url: 'https://www.jpl.nasa.gov/images/pia26402-perseverances-location-at-the-base-of-jezero-craters-rim/' },
    elevation: { label: 'NASA/JPL PIA26476: Jezero Crater elevation graph', url: 'https://www.jpl.nasa.gov/images/pia26476-jezero-crater-elevation-graph/' },
    hazardmap: { label: 'NASA: Jezero’s hazard map', url: 'https://science.nasa.gov/photojournal/jezeros-hazard-map/' },
    biosig: { label: 'NASA/JPL: Mars rover discovered potential biosignature', url: 'https://www.jpl.nasa.gov/news/nasa-says-mars-rover-discovered-potential-biosignature-last-year/' },
    water: { label: 'NASA: Discovery reveals complex water systems on early Mars', url: 'https://www.nasa.gov/missions/mars-2020-perseverance/nasa-discovery-reveals-complex-water-systems-on-early-mars/' },
    usgsfloor: { label: 'USGS: Aqueously altered igneous rocks sampled on the floor of Jezero crater', url: 'https://www.usgs.gov/publications/aqueously-altered-igneous-rocks-sampled-floor-jezero-crater-mars' },
  };

  /* Mission campaigns: which geologic setting the rover was working in on each sol.
   * These label the rover's waypoints as ground truth for the predictor. */
  const CAMPAIGNS = [
    { from: 0, to: 418, unit: 'floor', name: 'Crater floor', detail: 'Máaz lava plains and Séítah olivine-rich rocks' },
    { from: 419, to: 707, unit: 'delta', name: 'Delta front', detail: 'Base and front of the western fan' },
    { from: 708, to: 905, unit: 'delta', name: 'Upper fan', detail: 'River deposits on top of the delta' },
    { from: 906, to: 1140, unit: 'margin', name: 'Margin unit', detail: 'Carbonate-bearing rocks along the inner crater edge' },
    { from: 1141, to: 1250, unit: 'inlet', name: 'Neretva Vallis', detail: 'Inlet river channel, Bright Angel' },
    { from: 1251, to: 1354, unit: 'rim', name: 'Crater rim climb', detail: 'Inner rim wall up to Lookout Hill' },
    { from: 1355, to: 2022, unit: 'rim', name: 'Crater rim', detail: 'Witch Hazel Hill, Krokodillen and the outer rim' },
  ];
  const campaignOf = (sol) => CAMPAIGNS.find((c) => sol >= c.from && sol <= c.to) || null;

  /* Science objectives. `positives` are the campaign units whose rover-verified terrain counts as a match. */
  const OBJECTIVES = [
    {
      id: 'carbonate', suggestedStart: 'margin', name: 'Shoreline carbonates', short: 'Carbonates',
      positives: ['margin'], icon: 'waves',
      pitch: 'Carbonate and silica rocks along the ancient lake edge. On Earth this setting builds stromatolites and preserves microbial fossils.',
      evidence: 'Matches terrain like Bunsen Peak, where Perseverance cored silica-cemented carbonate (sample Comet Geyser).',
      why: 'Carbonates record the CO₂ and water chemistry of the lake, and fine silica is one of the best fossil-preserving materials known.',
      src: ['samples', 'water'],
    },
    {
      id: 'delta', suggestedStart: 'threeforks', name: 'Delta and inlet sediments', short: 'Delta sediments',
      positives: ['delta', 'inlet'], icon: 'layers',
      pitch: 'Sandstone and mudstone laid down by the river and lake. Fine-grained layers concentrate and protect organic molecules.',
      evidence: 'Matches terrain like Wildcat Ridge and Bright Angel, where the Cheyava Falls rock holds a potential biosignature.',
      why: 'Layered sediments are the mission’s prime place to look for signs of ancient microbial life.',
      src: ['samples', 'biosig'],
    },
    {
      id: 'igneous', suggestedStart: 'oeb', name: 'Igneous crater floor', short: 'Igneous floor',
      positives: ['floor'], icon: 'flame',
      pitch: 'Lava and olivine-rich rocks of the crater floor. They can be dated in a lab, and their olivine reacted with water to make carbonate.',
      evidence: 'Matches terrain like Rochette and Brac, the first igneous cores collected on Mars.',
      why: 'An absolute age for the floor pins down when Jezero’s lake existed. Olivine plus water also yields hydrogen, an energy source for microbes.',
      src: ['samples', 'usgsfloor'],
    },
    {
      id: 'crust', suggestedStart: 'rover', name: 'Ancient rim crust', short: 'Rim crust',
      positives: ['rim'], icon: 'mountain',
      pitch: 'Blocks of Mars’ earliest crust lifted by the Jezero impact, with serpentine and other minerals formed by hot water.',
      evidence: 'Matches terrain like Witch Hazel Hill, where Perseverance cored Silver Mountain and the serpentinite Green Gardens.',
      why: 'These are among the oldest rocks reachable on Mars and may hold evidence of hydrothermal systems.',
      src: ['samples', 'rim'],
    },
  ];

  /* Places Perseverance worked, from NASA's sample table. `sol` is the sol the first sample there was sealed. */
  const SITES = [
    { id: 'oeb', name: 'Octavia E. Butler Landing', lon: 77.45089, lat: 18.44463, sol: 0, kind: 'landing', unit: 'floor',
      note: 'Perseverance touchdown point, 18 Feb 2021. Flat, proven landing ground on the crater floor.' },
    { id: 'roubion', name: 'Roubion', lon: 77.45165, lat: 18.42769, sol: 164, kind: 'sample', unit: 'floor', rock: 'Atmospheric sample',
      samples: ['Roubion'], note: 'First coring attempt. The rock crumbled, so the tube holds Martian atmosphere.' },
    { id: 'rochette', name: 'Rochette', lon: 77.44437, lat: 18.43074, sol: 194, kind: 'sample', unit: 'floor', rock: 'Igneous',
      samples: ['Montdenier', 'Montagnac'], note: 'First rock cores collected on Mars: lava altered by water, with salts.' },
    { id: 'brac', name: 'Brac (Séítah)', lon: 77.44302, lat: 18.43396, sol: 262, kind: 'sample', unit: 'floor', rock: 'Igneous',
      samples: ['Salette', 'Coulettes'], note: 'Olivine-rich igneous rock, partly altered to carbonate by water.' },
    { id: 'issole', name: 'Issole (Séítah)', lon: 77.44137, lat: 18.43266, sol: 298, kind: 'sample', unit: 'floor', rock: 'Igneous',
      samples: ['Robine', 'Malay'], note: 'Second Séítah sampling stop, same olivine-rich formation.' },
    { id: 'sid', name: 'Sid', lon: 77.45243, lat: 18.4439, sol: 371, kind: 'sample', unit: 'floor', rock: 'Igneous',
      samples: ['Ha’ahóni', 'Atsá'], note: 'Crater-floor lava sampled next to the landing site.' },
    { id: 'skinner', name: 'Skinner Ridge', lon: 77.40617, lat: 18.4589, sol: 490, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Swift Run', 'Skyland'], note: 'First sedimentary cores: sandstone at the foot of the delta.' },
    { id: 'wildcat', name: 'Wildcat Ridge', lon: 77.40592, lat: 18.45865, sol: 509, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Hazeltop', 'Bearwallow'], note: 'Fine-grained lake mudstone; the rover detected organic molecules here.' },
    { id: 'amalik', name: 'Amalik', lon: 77.40144, lat: 18.45073, sol: 575, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Shuyak', 'Mageik'], note: 'Fine-grained sedimentary rock at the delta base.' },
    { id: 'hidden', name: 'Hidden Harbor', lon: 77.39915, lat: 18.45364, sol: 631, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Kukaklek'], note: 'Sedimentary rock at Yori Pass on the delta front.' },
    { id: 'obsmtn', name: 'Observation Mountain', lon: 77.40126, lat: 18.45133, sol: 634, kind: 'sample', unit: 'delta', rock: 'Regolith',
      samples: ['Atmo Mountain', 'Crosswind Lake'], note: 'Two regolith samples: mixed sedimentary and igneous grains.' },
    { id: 'threeforks', name: 'Three Forks sample depot', lon: 77.4081, lat: 18.4528, sol: 653, kind: 'depot', unit: 'delta',
      note: 'Ten sealed sample tubes were laid out here as a backup cache. Flat ground at the foot of the delta.' },
    { id: 'berea', name: 'Berea', lon: 77.38399, lat: 18.47021, sol: 749, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Melyn'], note: 'River-deposited rock on the upper fan.' },
    { id: 'emerald', name: 'Emerald Lake', lon: 77.36819, lat: 18.48299, sol: 832, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Otis Peak'], note: 'Conglomerate: pebbles carried in by the ancient river, on the rim of Belva Crater.' },
    { id: 'dreamlake', name: 'Dream Lake', lon: 77.36051, lat: 18.48381, sol: 913, kind: 'sample', unit: 'delta', rock: 'Sedimentary',
      samples: ['Pilot Mountain'], note: 'Sandstone from the upper fan.' },
    { id: 'hans', name: 'Hans Amundsen Memorial Workspace', lon: 77.35069, lat: 18.48344, sol: 923, kind: 'sample', unit: 'margin', rock: 'Sedimentary',
      samples: ['Pelican Point'], note: 'First margin-unit core, from the carbonate-bearing band on the crater edge.' },
    { id: 'turquoise', name: 'Turquoise Bay', lon: 77.34704, lat: 18.48871, sol: 949, kind: 'sample', unit: 'margin', rock: 'Sedimentary',
      samples: ['Lefroy Bay'], note: 'Margin-unit rock rich in fine silica, a material that preserves fossils on Earth.' },
    { id: 'bunsen', name: 'Bunsen Peak', lon: 77.32722, lat: 18.49182, sol: 1088, kind: 'sample', unit: 'margin', rock: 'Silica-cemented carbonate',
      samples: ['Comet Geyser'], note: 'Silica-cemented carbonate: rock that sat in water for a long time.' },
    { id: 'cheyava', name: 'Cheyava Falls (Bright Angel)', lon: 77.30519, lat: 18.49748, sol: 1215, kind: 'sample', unit: 'inlet', rock: 'Sedimentary',
      samples: ['Sapphire Canyon'], note: 'Mudstone with "leopard spots" and organic compounds: a potential biosignature.' },
    { id: 'lookout', name: 'Lookout Hill', lon: 77.26853, lat: 18.45753, sol: 1354, kind: 'landmark', unit: 'rim',
      note: 'Top of the crater rim, reached in December 2024 after a climb with slopes up to 23°.' },
    { id: 'shallowbay', name: 'Shallow Bay (Witch Hazel Hill)', lon: 77.26475, lat: 18.46055, sol: 1401, kind: 'sample', unit: 'rim', rock: 'Ancient crust',
      samples: ['Silver Mountain'], note: 'First core of very old rim bedrock, likely lifted from deep in the crust by an ancient impact.' },
    { id: 'tablelands', name: 'Tablelands', lon: 77.2592, lat: 18.46141, sol: 1433, kind: 'sample', unit: 'rim', rock: 'Serpentinite',
      samples: ['Green Gardens'], note: 'Serpentinite: rock transformed by water, a reaction that releases hydrogen.' },
    { id: 'broom', name: 'Broom Point', lon: 77.2585, lat: 18.46173, sol: 1441, kind: 'sample', unit: 'rim', rock: 'Igneous',
      samples: ['Main River'], note: 'Igneous rock from the crater rim.' },
    { id: 'pinepond', name: 'Pine Pond', lon: 77.25793, lat: 18.46223, sol: 1497, kind: 'sample', unit: 'rim', rock: 'Igneous / impactite',
      samples: ['Bell Island'], note: 'Rock that may have been melted or shattered by an impact.' },
    { id: 'krokodillen', name: 'Krokodillen', lon: 77.25592, lat: 18.45391, sol: 1524, kind: 'landmark', unit: 'rim',
      note: 'Plateau of ancient rocks on the outer rim where sample Gallants was collected (position approximate).' },
  ];

  /* Landforms located on NASA imagery and the CTX elevation model (not rover-visited unless noted). */
  const PLACES = [
    { name: 'Western delta', lon: 77.385, lat: 18.512, rank: 1 },
    { name: 'Neretva Vallis', lon: 77.275, lat: 18.508, rank: 1 },
    { name: 'Crater floor', lon: 77.53, lat: 18.43, rank: 1 },
    { name: 'Crater rim', lon: 77.255, lat: 18.395, rank: 1 },
    { name: 'Séítah dunes', lon: 77.4335, lat: 18.4425, rank: 2 },
    { name: 'Belva Crater', lon: 77.3815, lat: 18.481, rank: 2 },
    { name: 'Kodiak butte', lon: 77.4083, lat: 18.439, rank: 2 },
    { name: 'Northern fan deposits', lon: 77.50, lat: 18.59, rank: 1 },
  ];

  const START_POINTS = [
    { id: 'threeforks', name: 'Three Forks', lon: 77.4081, lat: 18.4528,
      blurb: 'Foot of the delta beside the sample depot. Flat ground between crater floor and fan.' },
    { id: 'oeb', name: 'Octavia E. Butler Landing', lon: 77.45089, lat: 18.44463,
      blurb: 'Perseverance’s touchdown point. Proven flat landing ground on the crater floor.' },
    { id: 'margin', name: 'Margin camp (Turquoise Bay)', lon: 77.34704, lat: 18.48871,
      blurb: 'On the carbonate band where the fan meets the crater edge, near the mouth of Neretva Vallis.' },
    { id: 'rover', name: 'Perseverance, live position', live: true,
      blurb: 'Start beside the rover wherever NASA last reported it. Updates from the mission feed.' },
  ];

  /* EVA planning assumptions. These are adjustable planning inputs, not NASA flight rules. */
  const MOBILITY = {
    foot: { id: 'foot', name: 'On foot', speedKmh: 2.5, maxSlope: 20, blurb: 'Suited walk. 2.5 km/h on firm flat ground, slower on slopes, sand and rubble.' },
    rover: { id: 'rover', name: 'Crew rover', speedKmh: 8, maxSlope: 15, blurb: 'Open rover in the class of the Apollo LRV. 8 km/h on firm flat ground, with a walk-back check.' },
  };

  const LAYERS = [
    { id: 'slope', name: 'Slope hazard', group: 'Hazards', kind: 'Topographic', desc: 'Steepness from the 20 m CTX elevation model', on: true },
    { id: 'sand', name: 'Loose sand', group: 'Hazards', kind: 'Thermal', desc: 'Cold-at-night ground in THEMIS infrared', on: true },
    { id: 'range', name: 'EVA range limit', group: 'Hazards', kind: 'Model', desc: 'How far you can go and still get back in time', on: true },
    { id: 'predict', name: 'Predicted science', group: 'Science', kind: 'Prediction', desc: 'Unvisited ground that matches rover-verified sites', on: true },
    { id: 'explored', name: 'Explored corridor', group: 'Science', kind: 'Ground truth', desc: 'Within 100 m of Perseverance’s wheels', on: true },
    { id: 'track', name: 'Rover track', group: 'Science', kind: 'Ground truth', desc: 'Live Perseverance traverse and position', on: true },
    { id: 'sites', name: 'Sample sites', group: 'Science', kind: 'Ground truth', desc: 'Where NASA’s sample tubes were filled', on: true },
    { id: 'contours', name: 'Contours', group: 'Reference', kind: 'Topographic', desc: 'Elevation lines every 25 m', on: false },
    { id: 'thermal', name: 'Night infrared', group: 'Reference', kind: 'Thermal', desc: 'Raw THEMIS night-time temperature image', on: false },
    { id: 'places', name: 'Place names', group: 'Reference', kind: 'Labels', desc: 'Landforms and rover-named sites', on: true },
    { id: 'grid', name: 'Coordinate grid', group: 'Reference', kind: 'Labels', desc: 'Latitude and longitude lines', on: true },
  ];

  const DEFAULTS = {
    objective: 'carbonate', start: 'margin', mode: 'foot',
    maxSlope: 20, evaHours: 8, siteMinutes: 60, tau: null,
    layers: LAYERS.filter((l) => l.on).map((l) => l.id),
    lon: null, lat: null,
  };

  /** Mission config <-> URL query string, so the designer page can hand the plan to the map page. */
  function parseConfig(search) {
    const q = new URLSearchParams(search || '');
    const c = Object.assign({}, DEFAULTS, { layers: DEFAULTS.layers.slice() });
    const num = (k, lo, hi) => {
      if (!q.has(k)) return;
      const v = parseFloat(q.get(k));
      if (Number.isFinite(v)) c[k] = Math.max(lo, Math.min(hi, v));
    };
    if (OBJECTIVES.some((o) => o.id === q.get('objective'))) c.objective = q.get('objective');
    if (q.get('start') === 'custom' || START_POINTS.some((s) => s.id === q.get('start'))) c.start = q.get('start');
    if (MOBILITY[q.get('mode')]) { c.mode = q.get('mode'); c.maxSlope = MOBILITY[c.mode].maxSlope; }
    num('maxSlope', 5, 30); num('evaHours', 1, 10); num('siteMinutes', 0, 240); num('tau', 0.1, 6);
    num('lon', 77.0, 78.0); num('lat', 18.0, 19.0);
    if (q.has('layers')) {
      const ids = q.get('layers').split(',').filter((id) => LAYERS.some((l) => l.id === id));
      c.layers = ids;
    }
    return c;
  }
  function serializeConfig(c) {
    const q = new URLSearchParams();
    q.set('objective', c.objective); q.set('start', c.start); q.set('mode', c.mode);
    q.set('maxSlope', c.maxSlope); q.set('evaHours', c.evaHours); q.set('siteMinutes', c.siteMinutes);
    if (c.tau != null) q.set('tau', c.tau);
    if (c.start === 'custom' && c.lon != null) { q.set('lon', (+c.lon).toFixed(5)); q.set('lat', (+c.lat).toFixed(5)); }
    q.set('layers', c.layers.join(','));
    return q.toString();
  }

  Atlas.data = {
    SOURCES, CAMPAIGNS, campaignOf, OBJECTIVES, SITES, PLACES, START_POINTS, MOBILITY, LAYERS, DEFAULTS,
    parseConfig, serializeConfig,
    JEZERO: { lon: 77.45, lat: 18.44, name: 'Jezero Crater' },
    /* Extent of the CTX elevation model: the area the planner can reason about. */
    STUDY: { west: 77.16046545922367, east: 77.69897516629472, south: 18.211027390963398, north: 18.721194481872804 },
    /* Ionising radiation baseline at the surface: NASA/JPL, Curiosity RAD, Aug 2012 to Jun 2013. */
    DOSE_MSV_PER_DAY: 0.67,
    /* Largest surface storm dose RAD has recorded (20 May 2024), in micrograys. */
    STORM_DOSE_UGY: 8100,
  };
})(typeof window !== 'undefined' ? window : globalThis);
