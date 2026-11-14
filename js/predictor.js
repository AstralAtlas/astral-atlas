/* Browser port of the team's astral_atlas_predictor.py, running on real NASA terrain instead of the synthetic demo.
 *
 * Kept from the Python:
 *   rank_evidence  inverse-square weighted vote of the 3 nearest known observations (a relative evidence
 *                  score, not a calibrated probability), MIN_RESOURCE_SCORE = 0.65, a held-out check
 *   edge_cost      distance * (1 + SLOPE_WEIGHT * (slope / max_slope)^2 + ROUGHNESS_WEIGHT * roughness)
 *   find_route     least-cost search over passable cells; "shortest passable" versus "lowest modelled risk"
 *   route_summary  one-way and round-trip distance, max slope, terrain-weighted cost
 * Changed for real data:
 *   observations   six co-registered NASA measurements per cell instead of two synthetic indices
 *   references     Perseverance waypoints labelled by mission campaign instead of five made-up sites
 *   held-out check spatially blocked: every reference within 1 km of the tested point is hidden
 *   search         8-connected grid (the Python used 4), Dijkstra flood plus A*, optional soft-sand term
 */
(function (root) {
  'use strict';
  const Atlas = (root.Atlas = root.Atlas || {});

  const P = {
    SLOPE_WEIGHT: 3,
    ROUGHNESS_WEIGHT: 2,
    SOFT_WEIGHT: 1.5,            // extension: loose sand from THEMIS night IR
    MIN_RESOURCE_SCORE: 0.65,
    K: 3,
    FACTOR: 2,                   // analysis cells are 2x2 terrain cells (80 m), close to THEMIS resolution
    MAX_ANALOG_DISTANCE: 1.25,   // further than this from every reference: "too little evidence to score"
    HOLDOUT_BLOCK_M: 1000,
    FEATURES: ['Elevation', 'Slope', 'Roughness', 'Night temperature', 'Day temperature', 'Brightness'],
  };
  const NF = P.FEATURES.length;

  /** Six standardised observations per 80 m analysis cell. */
  function buildFeatures(t) {
    const f = P.FACTOR, anx = Math.floor(t.nx / f), any = Math.floor(t.ny / f), an = anx * any;
    const Z = new Float32Array(an * NF);
    const grids = [t.elev, t.slope, t.rough, t.night, t.day, t.albedo];
    for (let ai = 0; ai < any; ai++) {
      for (let aj = 0; aj < anx; aj++) {
        const c = (ai * anx + aj) * NF;
        for (let g = 0; g < NF; g++) {
          let s = 0;
          for (let di = 0; di < f; di++) for (let dj = 0; dj < f; dj++) s += grids[g][(ai * f + di) * t.nx + aj * f + dj];
          Z[c + g] = s / (f * f);
        }
      }
    }
    const mean = new Float64Array(NF), sd = new Float64Array(NF);
    for (let c = 0; c < an; c++) for (let g = 0; g < NF; g++) mean[g] += Z[c * NF + g];
    for (let g = 0; g < NF; g++) mean[g] /= an;
    for (let c = 0; c < an; c++) for (let g = 0; g < NF; g++) sd[g] += (Z[c * NF + g] - mean[g]) ** 2;
    for (let g = 0; g < NF; g++) sd[g] = Math.sqrt(sd[g] / an) || 1;
    for (let c = 0; c < an; c++) for (let g = 0; g < NF; g++) Z[c * NF + g] = (Z[c * NF + g] - mean[g]) / sd[g];
    return {
      Z, anx, any, an, mean, sd, factor: f,
      cellOf(lon, lat) {
        if (!t.inside(lon, lat)) return -1;
        const aj = Math.min(anx - 1, Math.floor(t.col(lon) / f)), ai = Math.min(any - 1, Math.floor(t.row(lat) / f));
        return ai * anx + aj;
      },
      lonLat(c) {
        const ai = Math.floor(c / anx), aj = c % anx;
        return [t.west + (aj + 0.5) * f * t.cellDeg, t.north - (ai + 0.5) * f * t.cellDeg];
      },
      /** Terrain cells (40 m) inside analysis cell c. */
      terrainCells(c) {
        const ai = Math.floor(c / anx), aj = c % anx, out = [];
        for (let di = 0; di < f; di++) for (let dj = 0; dj < f; dj++) out.push((ai * f + di) * t.nx + aj * f + dj);
        return out;
      },
    };
  }

  /** Known observations: one per analysis cell the rover stopped in, labelled by the campaign it belonged to. */
  function buildReferences(feat, waypoints, campaignOf) {
    const seen = new Map();
    for (const w of waypoints) {
      const sol = w[0], lon = w[1], lat = w[2];
      const camp = campaignOf(sol);
      if (!camp) continue;
      const c = feat.cellOf(lon, lat);
      if (c < 0 || seen.has(c)) continue;
      seen.set(c, { cell: c, sol, lon, lat, unit: camp.unit, campaign: camp.name });
    }
    const refs = Array.from(seen.values());
    const X = new Float32Array(refs.length * NF);
    refs.forEach((r, i) => { for (let g = 0; g < NF; g++) X[i * NF + g] = feat.Z[r.cell * NF + g]; });
    return { refs, X, n: refs.length };
  }

  /**
   * rank_evidence: weighted vote from the K closest known observations.
   * `skip(i)` lets the held-out check hide references. Returns null when nothing is close enough to judge.
   */
  function rankEvidence(obs, off, R, isPositive, skip) {
    const best = [], K = P.K;
    for (let i = 0; i < R.n; i++) {
      if (skip && skip(i)) continue;
      let d = 0;
      for (let g = 0; g < NF; g++) { const x = obs[off + g] - R.X[i * NF + g]; d += x * x; }
      if (best.length < K || d < best[K - 1].d2) {
        best.push({ i, d2: d });
        best.sort((a, b) => a.d2 - b.d2);
        if (best.length > K) best.pop();
      }
    }
    if (!best.length) return null;
    let pos = 0, tot = 0;
    const sources = best.map((b) => {
      const distance = Math.sqrt(b.d2);
      const weight = 1 / Math.max(distance, 0.01) ** 2;
      const positive = isPositive(R.refs[b.i]);
      tot += weight; if (positive) pos += weight;
      return { ref: R.refs[b.i], distance, weight, positive };
    });
    sources.forEach((s) => { s.share = s.weight / tot; });
    return { score: pos / tot, sources, nearest: sources[0].distance, scorable: sources[0].distance <= P.MAX_ANALOG_DISTANCE };
  }

  /** K nearest references for every analysis cell (done once; each objective then just re-labels them). */
  async function nearestGrid(feat, R, onProgress) {
    const { Z, an, anx, any } = feat, K = P.K, n = R.n, X = R.X;
    const nn = new Int16Array(an * K).fill(-1), nd = new Float32Array(an * K).fill(Infinity);
    let lastYield = Date.now();
    for (let ai = 0; ai < any; ai++) {
      for (let aj = 0; aj < anx; aj++) {
        const c = ai * anx + aj, o = c * NF;
        const z0 = Z[o], z1 = Z[o + 1], z2 = Z[o + 2], z3 = Z[o + 3], z4 = Z[o + 4], z5 = Z[o + 5];
        let d1 = Infinity, d2 = Infinity, d3 = Infinity, i1 = -1, i2 = -1, i3 = -1;
        for (let i = 0, x = 0; i < n; i++, x += NF) {
          let d = (z0 - X[x]) ** 2 + (z3 - X[x + 3]) ** 2;
          if (d >= d3) continue;
          d += (z1 - X[x + 1]) ** 2 + (z2 - X[x + 2]) ** 2 + (z4 - X[x + 4]) ** 2 + (z5 - X[x + 5]) ** 2;
          if (d >= d3) continue;
          if (d < d1) { d3 = d2; i3 = i2; d2 = d1; i2 = i1; d1 = d; i1 = i; }
          else if (d < d2) { d3 = d2; i3 = i2; d2 = d; i2 = i; }
          else { d3 = d; i3 = i; }
        }
        const k = c * K;
        nn[k] = i1; nn[k + 1] = i2; nn[k + 2] = i3;
        nd[k] = Math.sqrt(d1); nd[k + 1] = Math.sqrt(d2); nd[k + 2] = Math.sqrt(d3);
      }
      if (Date.now() - lastYield > 40) {
        if (onProgress) onProgress(ai / any);
        await new Promise((r) => setTimeout(r, 0));
        lastYield = Date.now();
      }
    }
    return { nn, nd };
  }

  /** Evidence score per analysis cell for one objective. NaN = no close analog among rover-verified terrain. */
  function scoreGrid(feat, R, near, positives) {
    const K = P.K, score = new Float32Array(feat.an), pos = new Uint8Array(R.n);
    R.refs.forEach((r, i) => { pos[i] = positives.includes(r.unit) ? 1 : 0; });
    for (let c = 0; c < feat.an; c++) {
      const k = c * K;
      if (near.nn[k] < 0 || near.nd[k] > P.MAX_ANALOG_DISTANCE) { score[c] = NaN; continue; }
      let p = 0, tot = 0;
      for (let q = 0; q < K; q++) {
        const i = near.nn[k + q];
        if (i < 0) continue;
        const w = 1 / Math.max(near.nd[k + q], 0.01) ** 2;
        tot += w; if (pos[i]) p += w;
      }
      score[c] = p / tot;
    }
    return score;
  }

  /** Held-out check: hide every reference within `blockM` of each known point, then predict it from the rest. */
  function holdout(t, R, positives, blockM) {
    const block = blockM || P.HOLDOUT_BLOCK_M;
    let tp = 0, fp = 0, fn = 0, tn = 0, unscored = 0;
    const isPos = (r) => positives.includes(r.unit);
    for (let n = 0; n < R.n; n++) {
      const a = R.refs[n];
      const res = rankEvidence(R.X, n * NF, R, isPos, (i) => t.distance(a.lon, a.lat, R.refs[i].lon, R.refs[i].lat) <= block);
      if (!res) { unscored++; continue; }
      const predicted = res.score >= P.MIN_RESOURCE_SCORE, truth = isPos(a);
      if (predicted && truth) tp++; else if (predicted) fp++; else if (truth) fn++; else tn++;
    }
    const total = tp + fp + fn + tn;
    return {
      tp, fp, fn, tn, total, unscored, blockM: block,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      accuracy: total ? (tp + tn) / total : null,
    };
  }

  /**
   * Candidate sites: the centres of the largest consistent high-evidence patches, at least `sepM` apart.
   * `allow(c)` filters analysis cells (unexplored, passable, in range ...).
   */
  function candidates(feat, t, score, allow, count, sepM) {
    const { anx, any, an } = feat, W = 3;
    const support = new Float32Array(an);
    for (let ai = 0; ai < any; ai++) {
      for (let aj = 0; aj < anx; aj++) {
        const c = ai * anx + aj, s = score[c];
        if (!(s >= P.MIN_RESOURCE_SCORE) || !allow(c)) continue;
        let sum = 0, m = 0;
        for (let di = -W; di <= W; di++) {
          const i = ai + di; if (i < 0 || i >= any) continue;
          for (let dj = -W; dj <= W; dj++) {
            const j = aj + dj; if (j < 0 || j >= anx) continue;
            const v = score[i * anx + j]; m++;
            if (v >= P.MIN_RESOURCE_SCORE) sum += v;
          }
        }
        support[c] = sum / m;
      }
    }
    const order = [];
    for (let c = 0; c < an; c++) if (support[c] > 0) order.push(c);
    order.sort((a, b) => support[b] - support[a] || score[b] - score[a]);
    const picked = [];
    for (const c of order) {
      const [lon, lat] = feat.lonLat(c);
      if (picked.some((p) => t.distance(lon, lat, p.lon, p.lat) < sepM)) continue;
      picked.push({ cell: c, lon, lat, score: score[c], support: support[c] });
      if (picked.length >= count) break;
    }
    return picked;
  }

  /* ---------- route search ---------- */

  class Heap {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= key) break;
        k[i] = k[p]; v[i] = v[p]; i = p;
      }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, topV = v[0], topK = k[0], lastK = k.pop(), lastV = v.pop(), n = k.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lastK) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lastK; v[i] = lastV;
      }
      this.topKey = topK;
      return topV;
    }
  }

  function costModel(t, o) {
    const maxSlope = o.maxSlope, sw = o.slopeWeight ?? P.SLOPE_WEIGHT, rw = o.roughWeight ?? P.ROUGHNESS_WEIGHT;
    const fw = o.softWeight ?? P.SOFT_WEIGHT, exposure = o.minimizeExposure !== false;
    const { slope, roughIdx, soft } = t;
    return {
      passable: (k) => slope[k] <= maxSlope,
      /** edge_cost from the Python, in "effort metres": equals plain distance on firm, flat, smooth ground. */
      edge(a, b, dist) {
        if (!exposure) return dist;
        const s = Math.max(slope[a], slope[b]) / maxSlope;
        return dist * (1 + sw * s * s + rw * (roughIdx[a] + roughIdx[b]) / 2 + fw * (soft[a] + soft[b]) / 2);
      },
    };
  }

  const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  /** Least-cost search from one cell. With `goal` it is A* and stops there; without, it floods out to `budget`. */
  function search(t, start, goal, o) {
    const { nx, ny, n, dxM, dyM, diagM } = t, model = costModel(t, o);
    if (start < 0 || !model.passable(start) || (goal != null && (goal < 0 || !model.passable(goal)))) return null;
    const cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const budget = o.budget ?? Infinity;
    const gi = goal != null ? Math.floor(goal / nx) : 0, gj = goal != null ? goal % nx : 0;
    const h = goal != null ? (k) => Math.hypot(((k % nx) - gj) * dxM, (Math.floor(k / nx) - gi) * dyM) : () => 0;
    const heap = new Heap();
    cost[start] = 0; heap.push(h(start), start);
    while (heap.size) {
      const k = heap.pop(), c = cost[k];
      if (heap.topKey - h(k) > c + 1e-6) continue;        // stale entry
      if (k === goal) break;
      if (c > budget) break;
      const i = Math.floor(k / nx), j = k % nx;
      for (let s = 0; s < 8; s++) {
        const di = STEPS[s][0], dj = STEPS[s][1], ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= ny || nj >= nx) continue;   // beyond the DEM: unknown terrain is unavailable
        const m = ni * nx + nj;
        if (!model.passable(m)) continue;
        if (s >= 4 && (!model.passable(i * nx + nj) || !model.passable(ni * nx + j))) continue;  // no corner cutting
        const dist = s >= 4 ? diagM : (di ? dyM : dxM);
        const nc = c + model.edge(k, m, dist);
        if (nc < cost[m]) { cost[m] = nc; prev[m] = k; heap.push(nc + h(m), m); }
      }
    }
    return { cost, prev, start };
  }

  function trace(field, goal) {
    if (!field || goal < 0 || !Number.isFinite(field.cost[goal])) return null;
    const path = [goal];
    while (path[path.length - 1] !== field.start) {
      const p = field.prev[path[path.length - 1]];
      if (p < 0) return null;
      path.push(p);
    }
    return path.reverse();
  }

  /** find_route from the Python: shortest passable (minimizeExposure false) or lowest modelled risk (true). */
  function findRoute(t, start, goal, o) {
    return trace(search(t, start, goal, o), goal);
  }

  /** Nearest passable cell to k within `radius` cells, so a click on a steep cell still gets a usable endpoint. */
  function snap(t, k, maxSlope, radius) {
    if (k < 0) return -1;
    if (t.slope[k] <= maxSlope) return k;
    const i0 = Math.floor(k / t.nx), j0 = k % t.nx; let best = -1, bd = Infinity;
    for (let di = -radius; di <= radius; di++) for (let dj = -radius; dj <= radius; dj++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= t.ny || j >= t.nx) continue;
      const m = i * t.nx + j, d = di * di + dj * dj;
      if (t.slope[m] <= maxSlope && d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** route_summary from the Python, plus an elevation profile and the hazard stretches along the way. */
  function routeSummary(t, path, o) {
    const model = costModel(t, Object.assign({}, o, { minimizeExposure: true }));
    const { nx, dxM, dyM, diagM } = t, limit = o.maxSlope;
    const profile = []; let dist = 0, cost = 0, up = 0, down = 0, maxSlope = 0, slopeSum = 0;
    let steepM = 0, sandM = 0, roughM = 0;
    for (let p = 0; p < path.length; p++) {
      const k = path[p];
      if (p > 0) {
        const a = path[p - 1], di = Math.abs(Math.floor(k / nx) - Math.floor(a / nx)), dj = Math.abs((k % nx) - (a % nx));
        const d = di && dj ? diagM : (di ? dyM : dxM);
        dist += d; cost += model.edge(a, k, d);
        const dz = t.elev[k] - t.elev[a];
        if (dz > 0) up += dz; else down -= dz;
        if (Math.max(t.slope[a], t.slope[k]) > limit * 0.7) steepM += d;
        if ((t.soft[a] + t.soft[k]) / 2 >= 0.6) sandM += d;
        if ((t.rough[a] + t.rough[k]) / 2 >= 2) roughM += d;
      }
      maxSlope = Math.max(maxSlope, t.slope[k]); slopeSum += t.slope[k];
      const [lon, lat] = t.lonLat(k);
      profile.push({ d: dist, cost, elev: t.elev[k], slope: t.slope[k], soft: t.soft[k], rough: t.rough[k], lon, lat, k });
    }
    // Contiguous hazard stretches, for "what is wrong on this route and where".
    const stretches = [];
    const scan = (key, test, label) => {
      let open = null;
      profile.forEach((pt, i) => {
        const hit = test(pt);
        if (hit && !open) open = { key, label, from: pt.d, i0: i, peak: 0 };
        if (open && hit) { open.to = pt.d; open.i1 = i; open.peak = Math.max(open.peak, key === 'slope' ? pt.slope : key === 'sand' ? pt.soft : pt.rough); }
        if (open && (!hit || i === profile.length - 1)) {
          if (open.to - open.from >= 60) { const mid = profile[(open.i0 + open.i1) >> 1]; open.lon = mid.lon; open.lat = mid.lat; stretches.push(open); }
          open = null;
        }
      });
    };
    scan('slope', (pt) => pt.slope > limit * 0.7, 'Steep');
    scan('sand', (pt) => pt.soft >= 0.6, 'Loose sand');
    scan('rough', (pt) => pt.rough >= 2.5, 'Rough ground');
    stretches.sort((a, b) => a.from - b.from);
    return {
      path, profile, stretches,
      oneWayM: dist, roundTripM: 2 * dist, maxSlope, meanSlope: slopeSum / path.length,
      ascentM: up, descentM: down, terrainWeightedCost: cost, steepM, sandM, roughM,
      line: profile.map((pt) => [pt.lat, pt.lon]),
    };
  }

  Atlas.Predictor = Object.assign(P, {
    buildFeatures, buildReferences, rankEvidence, nearestGrid, scoreGrid, holdout, candidates,
    search, trace, findRoute, snap, routeSummary, costModel,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = Atlas.Predictor;
})(typeof window !== 'undefined' ? window : globalThis);
