/* Terrain model: decodes the NASA-derived grids in js/data/terrain.js and answers "what is the ground like here?".
 * Grids are 40 m cells on the CTX DEM lattice (equirectangular, lon/lat linear). */
(function (root) {
  'use strict';
  const Atlas = (root.Atlas = root.Atlas || {});

  async function inflate(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  class Terrain {
    constructor(meta, stats) {
      Object.assign(this, meta);
      this.stats = stats;
      this.n = this.nx * this.ny;
      this.dyM = this.cellM;                       // north-south cell size on the ground
      this.dxM = this.cellM * this.coslat;         // east-west cell size on the ground
      this.diagM = Math.hypot(this.dxM, this.dyM);
      this.bounds = [[this.south, this.west], [this.north, this.east]];
    }

    static async load(src, onStep) {
      const t = new Terrain(src.meta, src.stats);
      const step = (label) => onStep && onStep(label);
      step('Decoding CTX elevation model');
      const raw = await inflate(src.grids.elev);
      const delta = new Int16Array(raw.buffer, raw.byteOffset, t.n);
      t.elev = new Float32Array(t.n);
      for (let i = 0; i < t.ny; i++) {
        let acc = 0;
        for (let j = 0, k = i * t.nx; j < t.nx; j++, k++) { acc += delta[k]; t.elev[k] = acc * t.elevScale; }
      }
      step('Decoding slope and roughness');
      const slope = await inflate(src.grids.slope);
      const rough = await inflate(src.grids.rough);
      t.slope = new Float32Array(t.n);
      t.rough = new Float32Array(t.n);
      for (let k = 0; k < t.n; k++) { t.slope[k] = slope[k] * t.slopeScale; t.rough[k] = rough[k] * t.roughScale; }
      step('Decoding THEMIS thermal and CTX brightness');
      t.night = await inflate(src.grids.night);
      t.day = await inflate(src.grids.day);
      t.albedo = await inflate(src.grids.albedo);

      // Soft-ground index from night-time infrared: the coldest ground at night has the lowest thermal
      // inertia, i.e. loose sand or dust. 1 = coldest 5 % of the area, 0 = warmer than the lower quartile.
      const p = t.stats.nightPct;
      t.softLo = p['5']; t.softHi = p['25'];
      t.soft = new Float32Array(t.n);
      for (let k = 0; k < t.n; k++) {
        t.soft[k] = Math.max(0, Math.min(1, (t.softHi - t.night[k]) / (t.softHi - t.softLo)));
      }
      // Roughness index 0..1 for the route cost (1 = RMS relief of 5 m or more inside 100 m).
      t.roughIdx = new Float32Array(t.n);
      for (let k = 0; k < t.n; k++) t.roughIdx[k] = Math.min(1, t.rough[k] / 5);
      return t;
    }

    col(lon) { return Math.floor((lon - this.west) / this.cellDeg); }
    row(lat) { return Math.floor((this.north - lat) / this.cellDeg); }
    lonOf(j) { return this.west + (j + 0.5) * this.cellDeg; }
    latOf(i) { return this.north - (i + 0.5) * this.cellDeg; }
    inside(lon, lat) { return lon >= this.west && lon < this.east && lat > this.south && lat <= this.north; }
    index(lon, lat) {
      if (!this.inside(lon, lat)) return -1;
      const j = Math.min(this.nx - 1, this.col(lon)), i = Math.min(this.ny - 1, this.row(lat));
      return i * this.nx + j;
    }
    lonLat(k) { return [this.lonOf(k % this.nx), this.latOf(Math.floor(k / this.nx))]; }

    /** Bilinear elevation (m) at a point, or null outside the DEM. */
    elevationAt(lon, lat) {
      if (!this.inside(lon, lat)) return null;
      const x = Math.max(0, Math.min(this.nx - 1.001, (lon - this.west) / this.cellDeg - 0.5));
      const y = Math.max(0, Math.min(this.ny - 1.001, (this.north - lat) / this.cellDeg - 0.5));
      const j = Math.floor(x), i = Math.floor(y), fx = x - j, fy = y - i, k = i * this.nx + j;
      const e = this.elev;
      return (e[k] * (1 - fx) + e[k + 1] * fx) * (1 - fy) + (e[k + this.nx] * (1 - fx) + e[k + this.nx + 1] * fx) * fy;
    }

    /** Ground distance in metres between two lon/lat points (small-area equirectangular). */
    distance(lon1, lat1, lon2, lat2) {
      const mPerDeg = this.cellM / this.cellDeg;
      return Math.hypot((lon2 - lon1) * mPerDeg * this.coslat, (lat2 - lat1) * mPerDeg);
    }

    /** Distance (m) from every cell to the nearest cell in `seeds`, by a two-pass chamfer transform. */
    distanceField(seeds) {
      const { nx, ny, n, dxM, dyM, diagM } = this;
      const d = new Float32Array(n).fill(1e9);
      for (const k of seeds) if (k >= 0) d[k] = 0;
      for (let i = 0; i < ny; i++) {
        for (let j = 0; j < nx; j++) {
          const k = i * nx + j; let v = d[k];
          if (j > 0) v = Math.min(v, d[k - 1] + dxM);
          if (i > 0) {
            v = Math.min(v, d[k - nx] + dyM);
            if (j > 0) v = Math.min(v, d[k - nx - 1] + diagM);
            if (j < nx - 1) v = Math.min(v, d[k - nx + 1] + diagM);
          }
          d[k] = v;
        }
      }
      for (let i = ny - 1; i >= 0; i--) {
        for (let j = nx - 1; j >= 0; j--) {
          const k = i * nx + j; let v = d[k];
          if (j < nx - 1) v = Math.min(v, d[k + 1] + dxM);
          if (i < ny - 1) {
            v = Math.min(v, d[k + nx] + dyM);
            if (j < nx - 1) v = Math.min(v, d[k + nx + 1] + diagM);
            if (j > 0) v = Math.min(v, d[k + nx - 1] + diagM);
          }
          d[k] = v;
        }
      }
      return d;
    }

    /** Cells crossed by a lon/lat polyline (used to rasterise the rover track). */
    rasterise(points) {
      const cells = new Set();
      const step = this.cellDeg * 0.5;
      for (let p = 0; p < points.length; p++) {
        const [lon, lat] = points[p];
        const k = this.index(lon, lat);
        if (k >= 0) cells.add(k);
        if (p === 0) continue;
        const [lon0, lat0] = points[p - 1];
        const len = Math.hypot(lon - lon0, lat - lat0);
        if (len > 0.004) continue;                         // gap between drives, not a driven segment
        const m = Math.ceil(len / step);
        for (let s = 1; s < m; s++) {
          const q = this.index(lon0 + (lon - lon0) * s / m, lat0 + (lat - lat0) * s / m);
          if (q >= 0) cells.add(q);
        }
      }
      return cells;
    }

    /** Hazard read-out for one cell: what is wrong here, in words an EVA crew can act on. */
    describe(k, limits) {
      const slope = this.slope[k], rough = this.rough[k], soft = this.soft[k];
      const hazards = [];
      if (slope > limits.maxSlope) {
        hazards.push({
          level: 'critical', key: 'slope', title: `Steep slope ${slope.toFixed(0)}°`,
          text: `Steeper than your ${limits.maxSlope}° limit. Risk of falls and sliding on loose regolith, and a hard climb in a pressurised suit. Routes are not allowed to cross this cell.`,
        });
      } else if (slope > limits.maxSlope * 0.7) {
        hazards.push({
          level: 'serious', key: 'slope', title: `Slope ${slope.toFixed(0)}°, near your limit`,
          text: `Within ${Math.round(limits.maxSlope - slope)}° of your ${limits.maxSlope}° limit. Expect slow, tiring progress. Keep three points of contact and avoid carrying loads across the slope.`,
        });
      } else if (slope > 8) {
        hazards.push({
          level: 'warning', key: 'slope', title: `Moderate slope ${slope.toFixed(0)}°`,
          text: 'Walkable, but footing and energy use get worse. The route cost rises with the square of the slope.',
        });
      }
      if (soft >= 0.6) {
        hazards.push({
          level: 'serious', key: 'sand', title: 'Loose sand or dust likely',
          text: 'Among the coldest ground at night in THEMIS infrared, which means low thermal inertia: unconsolidated sand or dust. Boots and wheels can sink. NASA routed Perseverance around the Séítah dune field for this reason.',
        });
      } else if (soft >= 0.25) {
        hazards.push({
          level: 'warning', key: 'sand', title: 'Possible loose surface',
          text: 'Cooler than most of the area at night in THEMIS infrared. Expect patches of sand or dust cover over rock.',
        });
      }
      if (rough >= 3.5) {
        hazards.push({
          level: 'serious', key: 'rough', title: `Very rough ground (±${rough.toFixed(1)} m relief)`,
          text: 'Blocky or broken terrain inside a 100 m window: scarps, boulders or crater rims. Plan extra time and watch for trip and suit-puncture hazards.',
        });
      } else if (rough >= 2) {
        hazards.push({
          level: 'warning', key: 'rough', title: `Rough ground (±${rough.toFixed(1)} m relief)`,
          text: 'Uneven surface inside a 100 m window. Pick your line; the direct path will not be the fastest.',
        });
      }
      const order = { critical: 3, serious: 2, warning: 1 };
      hazards.sort((a, b) => order[b.level] - order[a.level]);
      return { slope, rough, soft, elev: this.elev[k], night: this.night[k], hazards, worst: hazards.length ? hazards[0].level : 'good' };
    }
  }

  Atlas.Terrain = Terrain;
})(typeof window !== 'undefined' ? window : globalThis);
