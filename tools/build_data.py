"""Astral Atlas data build: turns public NASA products into the files the web app loads.

Run:  python3 tools/build_data.py            (needs: numpy scipy pillow tifffile imagecodecs)

Inputs (all downloaded from NASA at run time, nothing is invented here):
  - MRO CTX Jezero DEM, 20 m (USGS Astrogeology, served by NASA Mars Trek)
  - MO THEMIS night / day infrared controlled mosaics, 100 m (Mars Trek tiles)
  - MRO CTX Jezero controlled orthomosaic, 6 m (Mars Trek tiles)
  - Viking colour mosaic, 232 m (Mars Trek tiles) for the landing-page image
  - Mars 2020 traverse and waypoint GeoJSON (mars.nasa.gov)
Outputs:
  js/data/terrain.js   gzip+base64 grids on a 40 m lattice
  js/data/rover.js     offline snapshot of the rover track (the app refreshes it live)
  assets/jezero-hero.jpg, assets/jezero-thumb.jpg
"""
from __future__ import annotations

import base64
import concurrent.futures as cf
import gzip
import io
import json
import math
import os
import sys
import urllib.request

import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.environ.get("ATLAS_CACHE", os.path.join(ROOT, ".cache"))
TREK = "https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}"
DEM_URL = ("https://trek.nasa.gov/mars/TrekWS/rest/cat/data/stream?label="
           "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0")
TRAVERSE_URL = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json"
WAYPOINT_URL = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json"

MARS_R = 3396190.0          # sphere radius used by the DEM projection (m)
DEM_X0 = 4573663.250853     # GeoTIFF tiepoint: west edge (m)
DEM_Y0 = 1109693.140188     # GeoTIFF tiepoint: north edge (m)
DEM_POST = 20.0             # DEM posting (m)
BLOCK = 2                   # 2x2 DEM posts per app cell -> 40 m


def fetch(url: str, name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        print("  downloading", name)
        with urllib.request.urlopen(url, timeout=180) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def tile(layer: str, z: int, y: int, x: int, ext: str):
    path = os.path.join(CACHE, "tiles", f"{layer}_{z}_{y}_{x}.{ext}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        try:
            data = urllib.request.urlopen(
                TREK.format(layer=layer, z=z, y=y, x=x, ext=ext), timeout=60).read()
        except Exception:
            data = b""
        with open(path, "wb") as f:
            f.write(data)
    try:
        return Image.open(path).convert("RGBA")
    except Exception:
        return None


def stitch(layer: str, z: int, w: float, s: float, e: float, n: float, ext: str = "png") -> Image.Image:
    """Mosaic Trek tiles (global equirectangular grid, 2x1 tiles at z0) and crop to a bbox."""
    size = 180 / 2 ** z
    x0, x1 = int((w + 180) // size), int((e + 180) // size)
    y0, y1 = int((90 - n) // size), int((90 - s) // size)
    out = Image.new("RGBA", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    jobs = [(y, x) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    with cf.ThreadPoolExecutor(12) as pool:
        for (y, x), t in zip(jobs, pool.map(lambda j: tile(layer, z, j[0], j[1], ext), jobs)):
            if t:
                out.paste(t, ((x - x0) * 256, (y - y0) * 256))
    px = lambda lon: (lon + 180) / size * 256 - x0 * 256
    py = lambda lat: (90 - lat) / size * 256 - y0 * 256
    return out.crop((round(px(w)), round(py(n)), round(px(e)), round(py(s))))


def pack(arr: np.ndarray) -> str:
    return base64.b64encode(gzip.compress(arr.tobytes(), 9)).decode("ascii")


def build_terrain() -> dict:
    print("terrain: CTX DEM")
    dem = tifffile.imread(fetch(DEM_URL, "jezero_ctx_dem_20m.tif")).astype(np.float64)
    rows, cols = dem.shape
    west = math.degrees(DEM_X0 / MARS_R)
    north = math.degrees(DEM_Y0 / MARS_R)
    d20 = math.degrees(DEM_POST / MARS_R)
    lat_mid = north - d20 * rows / 2
    coslat = math.cos(math.radians(lat_mid))

    # Slope over a 40 m baseline (central differences); east-west posts are 20 m * cos(lat) apart.
    gy, gx = np.gradient(dem, DEM_POST, DEM_POST * coslat)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    # Roughness: RMS height (m) about a 60 m smoothed surface, in a 100 m window.
    resid = dem - ndi.gaussian_filter(dem, 3)
    rough = np.sqrt(ndi.uniform_filter(resid ** 2, 5))

    ny, nx = rows // BLOCK, cols // BLOCK
    def blocks(a):
        return a[:ny * BLOCK, :nx * BLOCK].reshape(ny, BLOCK, nx, BLOCK)
    elev = blocks(dem).mean(axis=(1, 3))
    slope_c = blocks(slope).max(axis=(1, 3))      # steepest post in the cell (conservative)
    rough_c = blocks(rough).mean(axis=(1, 3))

    east = west + d20 * BLOCK * nx
    south = north - d20 * BLOCK * ny
    print(f"  grid {nx}x{ny}, bbox W{west:.5f} S{south:.5f} E{east:.5f} N{north:.5f}")

    def raster(layer, z, ext="png"):
        im = stitch(layer, z, west, south, east, north, ext).convert("L")
        return np.asarray(im.resize((nx, ny), Image.LANCZOS), dtype=np.uint8)

    print("terrain: THEMIS night / day IR")
    night = raster("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", 9)
    day = raster("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", 9)
    print("terrain: CTX albedo")
    albedo = raster("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0", 12)

    elev_dm = np.round(elev * 10).astype(np.int16)
    elev_delta = np.diff(elev_dm, axis=1, prepend=0).astype(np.int16)   # row-wise delta
    meta = {
        "nx": nx, "ny": ny, "west": west, "north": north, "east": east, "south": south,
        "cellDeg": d20 * BLOCK, "cellM": DEM_POST * BLOCK, "coslat": coslat, "marsRadiusM": MARS_R,
        "elevScale": 0.1, "slopeScale": 0.25, "roughScale": 0.05,
        "elevMin": float(elev.min()), "elevMax": float(elev.max()),
        "source": {
            "dem": "MRO CTX Jezero DEM 20 m, USGS Astrogeology via NASA Mars Trek (JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m)",
            "thermal": "Mars Odyssey THEMIS night/day IR controlled mosaics 100 m (USGS / ASU) via NASA Mars Trek",
            "albedo": "MRO CTX Jezero controlled orthomosaic 6 m via NASA Mars Trek",
        },
    }
    grids = {
        "elev": pack(elev_delta),
        "slope": pack(np.clip(np.round(slope_c / 0.25), 0, 255).astype(np.uint8)),
        "rough": pack(np.clip(np.round(rough_c / 0.05), 0, 255).astype(np.uint8)),
        "night": pack(night), "day": pack(day), "albedo": pack(albedo),
    }
    stats = {
        "slopePct": {str(p): round(float(np.percentile(slope_c, p)), 2) for p in (50, 75, 90, 95, 99)},
        "roughPct": {str(p): round(float(np.percentile(rough_c, p)), 2) for p in (50, 75, 90, 95, 99)},
        "nightPct": {str(p): int(np.percentile(night, p)) for p in (5, 10, 15, 25, 50, 75, 90)},
    }
    return {"meta": meta, "grids": grids, "stats": stats, "_elev": elev, "_slope": slope_c}


def build_rover(terrain: dict) -> dict:
    print("rover: traverse + waypoints")
    trav = json.load(open(fetch(TRAVERSE_URL, "M20_traverse.json")))
    wps = json.load(open(fetch(WAYPOINT_URL, "M20_waypoints.json")))
    path = []
    for f in trav["features"]:
        sol = f["properties"].get("sol")
        for lon, lat, *_ in f["geometry"]["coordinates"]:
            if path and abs(path[-1][0] - lon) < 4e-5 and abs(path[-1][1] - lat) < 4e-5:
                continue
            path.append([round(lon, 6), round(lat, 6), sol])
    way = [[p["sol"], round(p["lon"], 6), round(p["lat"], 6), round(p["elev_geoid"], 1),
            round(p["dist_km"], 3), round(p.get("tilt") or 0, 1)]
           for p in (f["properties"] for f in wps["features"])]

    # Independent check of the DEM against the rover's own localisation.
    m, elev, slope = terrain["meta"], terrain["_elev"], terrain["_slope"]
    de, pairs = [], []
    for sol, lon, lat, z, _, tilt in way:
        j = (lon - m["west"]) / m["cellDeg"]
        i = (m["north"] - lat) / m["cellDeg"]
        if 1 <= i < m["ny"] - 1 and 1 <= j < m["nx"] - 1:
            de.append(float(ndi.map_coordinates(elev, [[i - 0.5], [j - 0.5]], order=1)[0]) - z)
            pairs.append((float(slope[int(i), int(j)]), tilt))
    de = np.array(de)
    check = {"n": int(len(de)), "meanDiffM": round(float(de.mean()), 2), "stdDiffM": round(float(de.std()), 2),
             "medianAbsDiffM": round(float(np.median(np.abs(de))), 2)}
    print("  DEM vs rover localisation:", check)
    return {"snapshotSol": way[-1][0], "path": path, "waypoints": way, "demCheck": check,
            "source": "NASA/JPL-Caltech Mars 2020 mission, mars.nasa.gov location map (M20_traverse / M20_waypoints)"}


def build_hero() -> None:
    print("hero image: Viking colour x CTX detail")
    w, s, e, n = 76.72, 17.93, 78.62, 19.00
    ctx_rgba = stitch("Jezero_CTX_BlockAdj_dd", 10, w, s, e, n, "png")
    ctx = ctx_rgba.convert("L")
    vik = stitch("Mars_Viking_MDIM21_ClrMosaic_global_232m", 7, w, s, e, n, "jpg").convert("RGB")
    W, H = ctx.size
    vik = np.asarray(vik.resize((W, H), Image.BICUBIC), dtype=np.float64)
    vik = ndi.gaussian_filter(vik, (6, 6, 0))
    c = np.asarray(ctx, dtype=np.float64)
    gap = ndi.binary_dilation((np.asarray(ctx_rgba)[..., 3] < 250) | (c < 4), iterations=3)
    c[gap] = np.median(c[~gap])
    low = ndi.gaussian_filter(c, 14)
    detail = np.clip(c / np.maximum(low, 1.0), 0.5, 1.7)       # CTX high-pass ratio
    detail[gap] = 1.0                                          # no CTX coverage: Viking only
    out = np.clip(vik * detail[..., None] * 1.02, 0, 255).astype(np.uint8)
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    im = Image.fromarray(out)
    im.save(os.path.join(ROOT, "assets", "jezero-hero.jpg"), quality=84, optimize=True, progressive=True)
    im.resize((W // 4, H // 4), Image.LANCZOS).save(os.path.join(ROOT, "assets", "jezero-thumb.jpg"), quality=80)
    print("  hero", im.size)


def build_locator(meta: dict) -> None:
    """Colour-tinted CTX view of the study area for the designer page's start-point picker."""
    print("locator image: CTX study area")
    w, s, e, n = meta["west"], meta["south"], meta["east"], meta["north"]
    ctx = stitch("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0", 12, w, s, e, n, "png").convert("L")
    ctx = ctx.resize((1200, round(1200 * ctx.height / ctx.width)), Image.LANCZOS)
    g = np.asarray(ctx, dtype=np.float64) / 255.0
    g = np.clip((g - 0.18) / 0.62, 0, 1) ** 0.9
    tint = np.array([226, 168, 124], dtype=np.float64)          # mean Viking colour of Jezero's floor and rim
    out = np.clip(g[..., None] * tint * 1.12, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(ROOT, "assets", "jezero-locator.jpg"), quality=82, optimize=True)


def main() -> None:
    if "--images-only" in sys.argv:
        west = math.degrees(DEM_X0 / MARS_R); north = math.degrees(DEM_Y0 / MARS_R); d = math.degrees(DEM_POST / MARS_R) * BLOCK
        build_hero(); build_locator({"west": west, "north": north, "east": west + d * 798, "south": north - d * 756})
        return
    terrain = build_terrain()
    rover = build_rover(terrain)
    out = os.path.join(ROOT, "js", "data")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "terrain.js"), "w") as f:
        f.write("/* Generated by tools/build_data.py from NASA data. Do not edit. */\n")
        f.write("window.ATLAS_TERRAIN = ")
        json.dump({k: v for k, v in terrain.items() if not k.startswith("_")}, f, separators=(",", ":"))
        f.write(";\n")
    with open(os.path.join(out, "rover.js"), "w") as f:
        f.write("/* Offline snapshot from mars.nasa.gov, refreshed live by the app. Generated by tools/build_data.py. */\n")
        f.write("window.ATLAS_ROVER_SNAPSHOT = ")
        json.dump(rover, f, separators=(",", ":"))
        f.write(";\n")
    if "--no-hero" not in sys.argv:
        build_hero()
        build_locator(terrain["meta"])
    for name in ("terrain.js", "rover.js"):
        print(f"  {name}: {os.path.getsize(os.path.join(out, name)) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
