/* Mars clock, Sun position and sunlight model for Jezero.
 *
 * Time and Sun geometry: Allison & McEwen (2000), as published by NASA GISS for the Mars24 Sunclock.
 * Sunlight at the surface: Appelbaum & Flood (1989), "Solar Radiation on Mars", NASA TM-102299
 *   Gob = 590 * [1 + e cos(Ls - 248)]^2 / (1 - e^2)^2   beam irradiance at top of atmosphere, W/m2 (Eq. 4)
 *   Gbh = Gob cos z exp(-tau / cos z)                    direct beam on a horizontal surface (Eq. 18, Beer's law)
 *   Gh  = Gob cos z f(z, tau) / 0.9                      global irradiance, f from Table III (Eq. 17)
 *   Gdh = Gh - Gbh                                       diffuse irradiance (Eq. 16)
 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  const sin = (d) => Math.sin(d * D2R);
  const cos = (d) => Math.cos(d * D2R);
  const mod = (a, n) => ((a % n) + n) % n;

  const SOL_SECONDS = 88775.244;          // mean solar day on Mars
  const TAI_UTC = 37;                     // leap seconds since 2017
  const ECC = 0.093377;                   // orbital eccentricity used in TM-102299
  const OBLIQUITY_SIN = 0.42565;
  const LANDING_LON_E = 77.4298;          // Mars 2020 mission clock reference longitude

  // TM-102299 Table III: normalized net flux function f(z, tau), surface albedo 0.1.
  const F_ZENITH = [0, 10, 20, 30, 40, 50, 60, 70, 80, 85];
  const F_TABLE = [
    [0.1, 0.885, 0.883, 0.882, 0.880, 0.876, 0.870, 0.857, 0.830, 0.755, 0.635],
    [0.2, 0.866, 0.865, 0.860, 0.858, 0.851, 0.836, 0.813, 0.758, 0.640, 0.470],
    [0.3, 0.847, 0.846, 0.841, 0.836, 0.826, 0.806, 0.774, 0.708, 0.562, 0.412],
    [0.4, 0.828, 0.827, 0.821, 0.815, 0.802, 0.778, 0.740, 0.667, 0.502, 0.373],
    [0.5, 0.810, 0.810, 0.802, 0.796, 0.778, 0.752, 0.708, 0.628, 0.452, 0.342],
    [0.6, 0.793, 0.791, 0.785, 0.775, 0.755, 0.725, 0.677, 0.593, 0.414, 0.318],
    [0.7, 0.776, 0.773, 0.766, 0.755, 0.733, 0.700, 0.646, 0.555, 0.383, 0.298],
    [0.8, 0.760, 0.756, 0.750, 0.736, 0.710, 0.675, 0.616, 0.520, 0.360, 0.280],
    [0.9, 0.745, 0.740, 0.733, 0.717, 0.690, 0.650, 0.587, 0.487, 0.336, 0.264],
    [1.0, 0.732, 0.725, 0.717, 0.700, 0.670, 0.628, 0.560, 0.455, 0.317, 0.252],
    [1.1, 0.713, 0.709, 0.700, 0.682, 0.651, 0.604, 0.539, 0.433, 0.300, 0.239],
    [1.2, 0.697, 0.692, 0.683, 0.662, 0.632, 0.585, 0.518, 0.413, 0.288, 0.230],
    [1.3, 0.682, 0.677, 0.667, 0.646, 0.613, 0.567, 0.498, 0.394, 0.273, 0.220],
    [1.4, 0.666, 0.661, 0.650, 0.629, 0.596, 0.546, 0.478, 0.379, 0.262, 0.210],
    [1.5, 0.651, 0.646, 0.633, 0.612, 0.580, 0.530, 0.460, 0.362, 0.251, 0.202],
    [1.6, 0.637, 0.630, 0.618, 0.597, 0.563, 0.512, 0.441, 0.348, 0.240, 0.195],
    [1.7, 0.622, 0.615, 0.601, 0.581, 0.546, 0.494, 0.424, 0.332, 0.232, 0.188],
    [1.8, 0.609, 0.600, 0.586, 0.568, 0.531, 0.480, 0.408, 0.318, 0.224, 0.181],
    [1.9, 0.596, 0.587, 0.571, 0.551, 0.514, 0.464, 0.393, 0.304, 0.217, 0.176],
    [2.0, 0.582, 0.573, 0.558, 0.537, 0.500, 0.448, 0.378, 0.293, 0.208, 0.170],
    [2.25, 0.552, 0.542, 0.522, 0.501, 0.462, 0.410, 0.343, 0.265, 0.190, 0.156],
    [2.5, 0.518, 0.509, 0.492, 0.469, 0.430, 0.378, 0.316, 0.242, 0.174, 0.145],
    [2.75, 0.486, 0.478, 0.462, 0.440, 0.401, 0.353, 0.293, 0.224, 0.158, 0.136],
    [3.0, 0.460, 0.450, 0.434, 0.414, 0.376, 0.330, 0.273, 0.206, 0.150, 0.128],
    [3.25, 0.434, 0.424, 0.410, 0.390, 0.354, 0.308, 0.254, 0.193, 0.140, 0.120],
    [3.5, 0.411, 0.400, 0.387, 0.367, 0.333, 0.290, 0.240, 0.180, 0.132, 0.110],
    [4.0, 0.370, 0.360, 0.347, 0.330, 0.296, 0.258, 0.212, 0.160, 0.118, 0.100],
    [5.0, 0.294, 0.286, 0.275, 0.258, 0.230, 0.203, 0.166, 0.130, 0.094, 0.080],
    [6.0, 0.228, 0.223, 0.215, 0.200, 0.178, 0.153, 0.130, 0.103, 0.080, 0.068],
  ];

  /** Orbital state of Mars at a JavaScript timestamp (ms since Unix epoch, UTC). */
  function orbit(ms) {
    const jdUt = 2440587.5 + ms / 86400000;
    const jdTt = jdUt + (TAI_UTC + 32.184) / 86400;
    const dt = jdTt - 2451545.0;
    const M = 19.3871 + 0.52402073 * dt;                       // mean anomaly
    const aFms = 270.3871 + 0.524038496 * dt;                  // fictitious mean Sun
    const A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
    const T = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
    const P = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
    let pbs = 0;
    for (let i = 0; i < 7; i++) pbs += A[i] * cos((0.985626 * dt) / T[i] + P[i]);
    const nuM = (10.691 + 3.0e-7 * dt) * sin(M) + 0.623 * sin(2 * M) + 0.050 * sin(3 * M)
      + 0.005 * sin(4 * M) + 0.0005 * sin(5 * M) + pbs;       // equation of centre
    const ls = mod(aFms + nuM, 360);
    const eotDeg = 2.861 * sin(2 * ls) - 0.071 * sin(4 * ls) + 0.002 * sin(6 * ls) - nuM;
    const msd = (jdTt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
    const mtc = mod(24 * msd, 24);
    const decl = Math.asin(OBLIQUITY_SIN * sin(ls)) / D2R + 0.25 * sin(ls);
    const rAu = 1.52367934 * (1.00436 - 0.09309 * cos(M) - 0.004336 * cos(2 * M)
      - 0.00031 * cos(3 * M) - 0.00003 * cos(4 * M));
    return { msd, mtc, ls, eotDeg, eotHours: eotDeg / 15, decl, rAu };
  }

  /** Local clocks and Sun elevation at an east longitude / latitude. Hours are Mars hours (1/24 sol). */
  function local(ms, lonE, lat) {
    const o = orbit(ms);
    const lmst = mod(o.mtc + lonE / 15, 24);
    const ltst = mod(lmst + o.eotHours, 24);
    const hourAngle = (ltst - 12) * 15;
    const cosZ = sin(o.decl) * sin(lat) + cos(o.decl) * cos(lat) * cos(hourAngle);
    const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ))) / D2R;
    return Object.assign(o, { lmst, ltst, hourAngle, zenith, sunElevation: 90 - zenith });
  }

  /** Mars 2020 mission sol (sol 0 = landing day, 18 Feb 2021), counted in local mean solar time. */
  const SOL0 = Math.floor(orbit(Date.UTC(2021, 1, 18, 20, 55)).msd + LANDING_LON_E / 360);
  function missionSol(ms) {
    return Math.floor(orbit(ms).msd + LANDING_LON_E / 360) - SOL0;
  }

  /** Sunrise and sunset in local true solar time for a latitude and season (geometric horizon). */
  function daylight(ls, lat) {
    const decl = Math.asin(OBLIQUITY_SIN * sin(ls)) / D2R + 0.25 * sin(ls);
    const x = -Math.tan(lat * D2R) * Math.tan(decl * D2R);
    const h0 = Math.acos(Math.max(-1, Math.min(1, x))) / D2R;
    return { sunrise: 12 - h0 / 15, sunset: 12 + h0 / 15, noonElevation: 90 - Math.abs(lat - decl), decl };
  }

  function sunElevationAt(ltst, ls, lat) {
    const decl = Math.asin(OBLIQUITY_SIN * sin(ls)) / D2R + 0.25 * sin(ls);
    const cosZ = sin(decl) * sin(lat) + cos(decl) * cos(lat) * cos((ltst - 12) * 15);
    return 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / D2R;
  }

  function netFlux(zenith, tau) {
    const t = Math.max(0.1, Math.min(6, tau));
    const z = Math.max(0, Math.min(85, zenith));
    let r = 0;
    while (r < F_TABLE.length - 2 && F_TABLE[r + 1][0] < t) r++;
    let c = 0;
    while (c < F_ZENITH.length - 2 && F_ZENITH[c + 1] < z) c++;
    const tr = (t - F_TABLE[r][0]) / (F_TABLE[r + 1][0] - F_TABLE[r][0]);
    const zr = (z - F_ZENITH[c]) / (F_ZENITH[c + 1] - F_ZENITH[c]);
    const a = F_TABLE[r][c + 1] + (F_TABLE[r][c + 2] - F_TABLE[r][c + 1]) * zr;
    const b = F_TABLE[r + 1][c + 1] + (F_TABLE[r + 1][c + 2] - F_TABLE[r + 1][c + 1]) * zr;
    return a + (b - a) * tr;
  }

  /** Sunlight on level ground (W/m2) for a Sun zenith angle, dust optical depth and season. */
  function irradiance(zenith, tau, ls) {
    const top = 590 * Math.pow(1 + ECC * cos(ls - 248), 2) / Math.pow(1 - ECC * ECC, 2);
    if (zenith >= 90) return { top, direct: 0, diffuse: 0, global: 0 };
    const cz = cos(zenith);
    const direct = top * cz * Math.exp(-tau / Math.max(cz, 0.02));
    // Table III stops at z = 85 deg; beyond that the global term is tapered linearly to zero at the horizon.
    const taper = zenith > 85 ? (90 - zenith) / 5 : 1;
    const global = Math.max(direct, top * cos(Math.min(zenith, 85)) * netFlux(zenith, tau) / 0.9 * taper);
    return { top, direct, diffuse: global - direct, global };
  }

  const fmtClock = (h) => {
    const m = Math.round(mod(h, 24) * 60) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  const api = {
    SOL_SECONDS, MARS_HOUR_SECONDS: SOL_SECONDS / 24, LANDING_LON_E, F_TABLE, F_ZENITH,
    orbit, local, missionSol, daylight, sunElevationAt, netFlux, irradiance, fmtClock,
    /** Earth hours -> Mars clock hours (a Mars "hour" is 61.65 Earth minutes). */
    earthToMarsHours: (h) => h * 3600 / (SOL_SECONDS / 24),
    seasonName(ls) {
      const names = ['Northern spring', 'Northern summer', 'Northern autumn', 'Northern winter'];
      return names[Math.floor(mod(ls, 360) / 90)];
    },
  };
  root.Atlas = root.Atlas || {};
  root.Atlas.MarsTime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
