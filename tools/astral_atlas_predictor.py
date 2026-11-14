"""Astral Atlas example: rank resource candidates and compare Marswalk routes.

Run: python3 astral_atlas_predictor.py
Map export: python3 astral_atlas_predictor.py --json

Every coordinate, observation, label, and terrain value below is synthetic.
Replace them with aligned NASA raster data and independently documented labels
before drawing scientific conclusions. The route cost is an illustrative proxy.
Requires Python 3.10+ and only the standard library.
"""

from argparse import ArgumentParser
from collections.abc import Iterator
from dataclasses import dataclass
from heapq import heappop, heappush
from json import dumps
from math import dist, inf

Cell = tuple[int, int]  # row, column on a local metric grid
RESOURCE = "gypsum-bearing rock"


@dataclass(frozen=True)
class Observation:
    # Synthetic indices on a common 0–1 scale.
    sulfate_signal: float
    layered_texture: float

    def features(self) -> tuple[float, float]:
        return self.sulfate_signal, self.layered_texture


@dataclass(frozen=True)
class Terrain:
    slope_degrees: float
    roughness: float  # 0 for smooth ground, 1 for very rough ground


# These thresholds are example settings, not astronaut safety limits.
CELL_METERS = 50
MAX_SLOPE_DEGREES = 18
SLOPE_WEIGHT = 3
ROUGHNESS_WEIGHT = 2
MIN_RESOURCE_SCORE = 0.65

# Nearby documented examples a team could use to build its predictor.
REFERENCE_SITES = {
    (0, 1): (Observation(0.87, 0.82), True),
    (0, 7): (Observation(0.76, 0.71), True),
    (6, 1): (Observation(0.24, 0.32), False),
    (6, 7): (Observation(0.19, 0.57), False),
    (0, 4): (Observation(0.51, 0.34), False),
}

# Keep the answer for this site out of REFERENCE_SITES and any tuning.
HOLDOUT = (1, 2)
HOLDOUT_OBSERVATION = Observation(0.80, 0.77)
HOLDOUT_DOCUMENTED_PRESENT = True

CANDIDATE_OBSERVATIONS = {
    (3, 7): Observation(0.81, 0.76),
    (5, 6): Observation(0.51, 0.52),
    (1, 5): Observation(0.23, 0.59),
    (2, 6): None,  # Too little evidence to score.
}

BASE = (3, 1)


def rank_evidence(
    observation: Observation,
    references: dict[Cell, tuple[Observation, bool]],
) -> tuple[float, list[Cell]]:
    """Compute a weighted vote from the three closest known observations.

    The result is a relative evidence score, not a calibrated probability.
    Terrain is intentionally absent here. Its role is in route planning.
    """
    distances = sorted(
        (dist(observation.features(), known.features()), cell, present)
        for cell, (known, present) in references.items()
    )
    nearest = distances[:3]
    weights = [1 / max(distance, 0.01) ** 2 for distance, _, _ in nearest]
    positive_weight = sum(
        weight for weight, (_, _, present) in zip(weights, nearest) if present
    )
    return positive_weight / sum(weights), [cell for _, cell, _ in nearest]


def make_terrain() -> dict[Cell, Terrain | None]:
    grid: dict[Cell, Terrain | None] = {
        (r, c): Terrain(5, 0.14) for r in range(7) for c in range(9)
    }
    # A direct crossing is possible under the example cap but steep and rough.
    for c in range(3, 6):
        grid[(3, c)] = Terrain(17, 0.68)
    grid[(2, 4)] = None  # Unknown terrain is unavailable for routing.
    grid[(5, 4)] = Terrain(24, 0.70)  # Above the configured slope cap.
    return grid


def neighbors(cell: Cell) -> Iterator[Cell]:
    row, col = cell
    yield row - 1, col
    yield row + 1, col
    yield row, col - 1
    yield row, col + 1


def edge_cost(start: Terrain, end: Terrain) -> float:
    slope = max(start.slope_degrees, end.slope_degrees)
    roughness = (start.roughness + end.roughness) / 2
    return CELL_METERS * (
        1 + SLOPE_WEIGHT * (slope / MAX_SLOPE_DEGREES) ** 2
        + ROUGHNESS_WEIGHT * roughness
    )


def find_route(
    grid: dict[Cell, Terrain | None],
    start: Cell,
    goal: Cell,
    *,
    minimize_exposure: bool,
) -> list[Cell] | None:
    """Use Dijkstra's algorithm on four-connected, passable grid cells."""
    passable = {
        cell: terrain for cell, terrain in grid.items()
        if terrain is not None and terrain.slope_degrees <= MAX_SLOPE_DEGREES
    }
    if start not in passable or goal not in passable:
        return None

    frontier = [(0.0, start)]
    best = {start: 0.0}
    previous: dict[Cell, Cell] = {}
    while frontier:
        cost, cell = heappop(frontier)
        if cost > best[cell]:
            continue
        if cell == goal:
            path = [goal]
            while path[-1] != start:
                path.append(previous[path[-1]])
            return path[::-1]

        for neighbor in neighbors(cell):
            if neighbor not in passable:
                continue
            step = (
                edge_cost(passable[cell], passable[neighbor])
                if minimize_exposure
                else CELL_METERS
            )
            new_cost = cost + step
            if new_cost < best.get(neighbor, inf):
                best[neighbor] = new_cost
                previous[neighbor] = cell
                heappush(frontier, (new_cost, neighbor))
    return None


def route_summary(grid: dict[Cell, Terrain | None], path: list[Cell]) -> dict:
    terrain = [grid[cell] for cell in path]
    # find_route admits only cells with known terrain.
    assert all(tile is not None for tile in terrain)
    tiles = [tile for tile in terrain if tile is not None]
    distance = (len(path) - 1) * CELL_METERS
    return {
        "path": path,
        "return_path": path[::-1],  # Same route back in this symmetric example.
        "one_way_m": distance,
        "round_trip_m": 2 * distance,
        "max_slope_degrees": max(tile.slope_degrees for tile in tiles),
        "terrain_weighted_cost": round(
            sum(edge_cost(a, b) for a, b in zip(tiles, tiles[1:])), 1
        ),
    }


def run_demo() -> dict:
    grid = make_terrain()
    candidates = []
    for cell, observation in CANDIDATE_OBSERVATIONS.items():
        if observation is None:
            candidates.append({"cell": cell, "evidence_score": None})
            continue
        score, sources = rank_evidence(observation, REFERENCE_SITES)
        candidates.append({
            "cell": cell,
            "evidence_score": score,
            "observations": {
                "sulfate_signal": observation.sulfate_signal,
                "layered_texture": observation.layered_texture,
            },
            "reference_cells": sources,
        })
    candidates.sort(
        key=lambda candidate: candidate["evidence_score"]
        if candidate["evidence_score"] is not None else -1,
        reverse=True,
    )

    # Consider resource candidates in ranked order and skip unreachable ones.
    selected = None
    routes = {}
    for candidate in candidates:
        score = candidate["evidence_score"]
        if score is None or score < MIN_RESOURCE_SCORE:
            break
        cell = candidate["cell"]
        detour = find_route(grid, BASE, cell, minimize_exposure=True)
        if detour is None:
            continue
        direct = find_route(grid, BASE, cell, minimize_exposure=False)
        assert direct is not None  # Both searches use the same passable cells.
        selected = cell
        routes = {
            "shortest_passable": route_summary(grid, direct),
            "lowest_modeled_risk": route_summary(grid, detour),
        }
        break

    holdout_score, _ = rank_evidence(HOLDOUT_OBSERVATION, REFERENCE_SITES)
    predicted = holdout_score >= MIN_RESOURCE_SCORE
    return {
        "data_kind": "synthetic_demo",
        "resource": RESOURCE,
        "cell_size_m": CELL_METERS,
        "base": BASE,
        "selected_candidate": selected,
        "candidate_scores": candidates,
        "held_out_check": {
            "cell": HOLDOUT,
            "predicted_present": predicted,
            "documented_present_in_demo": HOLDOUT_DOCUMENTED_PRESENT,
            "matches": predicted == HOLDOUT_DOCUMENTED_PRESENT,
        },
        "unknown_terrain": [cell for cell, tile in grid.items() if tile is None],
        "routes": routes,
    }


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit map-ready JSON")
    args = parser.parse_args()
    result = run_demo()
    if args.json:
        print(dumps(result, indent=2))
        return

    print(f"Synthetic Astral Atlas example | Target: {result['resource']}")
    for candidate in result["candidate_scores"]:
        score = candidate["evidence_score"]
        label = f"evidence score {score:.2f}" if score is not None else "insufficient data"
        print(f"  {candidate['cell']}: {label}")

    check = result["held_out_check"]
    print(
        f"Illustrative held-out check at {check['cell']}: "
        f"predicted present={check['predicted_present']}, "
        f"known present={check['documented_present_in_demo']}."
    )
    if result["selected_candidate"] is None:
        print("No above-threshold candidate had a passable route.")
        return
    print(f"Selected site: {result['selected_candidate']}")
    for name, route in result["routes"].items():
        print(
            f"  {name.replace('_', ' ')}: {route['one_way_m']} m one way, "
            f"{route['round_trip_m']} m round trip, max slope "
            f"{route['max_slope_degrees']}°, modeled cost {route['terrain_weighted_cost']}"
        )


if __name__ == "__main__":
    main()
