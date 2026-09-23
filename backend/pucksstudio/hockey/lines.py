"""Duration-weighted observed combinations. Raw shift rows are never modified."""

from collections import Counter, defaultdict
from itertools import groupby
from typing import Any
from urllib.parse import urlsplit

FIRST_SHIFT_SEASON = 20102011
METHOD_VERSION = "overlap-5v5-v1"
FINAL_STATES = {"OFF", "OVER", "FINAL"}


def headshot_url(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme == "https"
            and parsed.hostname == "assets.nhle.com"
            and not parsed.username
        ):
            return value
    except ValueError:
        pass
    return None


def role(position: str | None) -> str:
    if position in {"C", "L", "R", "LW", "RW", "F"}:
        return "forward"
    if position == "D":
        return "defense"
    if position == "G":
        return "goalie"
    return "unknown"


def analyze_game(game: dict, rows: list[dict], team_id: int) -> tuple[dict, dict]:
    """Sweep both teams' intervals, conservatively excluding ambiguous periods/states."""
    result = {
        "game_id": game["game_id"],
        "game_date": game["game_date"],
        "home_abbrev": game["home_abbrev"],
        "away_abbrev": game["away_abbrev"],
        "status": "available",
        "fetch_status": game.get("fetch_status"),
        "attempted_at": game.get("attempted_at"),
        "snapshot_at": None,
        "raw_rows": len(rows),
        "five_on_five_seconds": 0,
        "classified_seconds": 0,
        "unclassified_seconds": 0,
        "other_strength_seconds": 0,
        "issues": {},
    }
    if game["season"] < FIRST_SHIFT_SEASON or game["game_type"] not in (2, 3):
        result["status"] = "unsupported"
        return result, {}
    if game["game_state"] not in FINAL_STATES:
        result["status"] = "not_final"
        return result, {}
    if not rows:
        result["status"] = (
            game.get("fetch_status")
            if game.get("fetch_status") in {"unavailable", "failed"}
            else "not_loaded"
        )
        return result, {}
    snapshots = [row["ingested_at"] for row in rows if row.get("ingested_at")]
    result["snapshot_at"] = max(snapshots) if snapshots else None
    issues: Counter = Counter()
    periods: dict[int, list] = defaultdict(list)
    unsafe_periods: set[int] = set()
    all_unsafe = False
    metadata: dict[int, dict] = {}
    sides = {game["home_team_id"], game["away_team_id"]}
    for row in rows:
        period = row["period"]
        if not isinstance(period, int) or period < 1 or period > 20:
            issues["invalid_period_rows"] += 1
            all_unsafe = True
            continue
        # Shootouts are not timed shifts. Regular-season OT has a five-minute bound.
        if game["game_type"] == 2 and period > 4:
            issues["excluded_shootout_rows"] += 1
            continue
        start, end = row["start_time_seconds"], row["end_time_seconds"]
        bound = 300 if game["game_type"] == 2 and period == 4 else 1200
        if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start <= end <= bound:
            issues["invalid_interval_rows"] += 1
            unsafe_periods.add(period)
            continue
        if start == end:
            issues["zero_duration_rows"] += 1
            continue
        if row["team_id"] not in sides or row["player_id"] is None:
            issues["unresolved_identity_rows"] += 1
            unsafe_periods.add(period)
            continue
        if row.get("duration_seconds") not in (None, end - start):
            issues["duration_disagreement_rows"] += 1
        pid = row["player_id"]
        player = {
            "player_id": pid,
            "name": row.get("player_name") or f"Player {pid}",
            "role": role(row.get("position")),
            "headshot_url": headshot_url(row.get("headshot_url")),
        }
        identity = (row["team_id"], player["role"])
        if pid in metadata and metadata[pid]["identity"] != identity:
            issues["conflicting_player_rows"] += 1
            all_unsafe = True
        metadata[pid] = {"identity": identity, "player": player}
        if player["role"] == "unknown":
            issues["unknown_role_rows"] += 1
        elif row.get("position_source") == "player":
            issues["position_fallback_rows"] += 1
        periods[period].append((start, end, pid))

    # Merge per-player intervals first: duplicate source IDs/overlaps cannot inflate TOI.
    units: dict[tuple, dict] = {}
    for period in sorted(set(periods) | {1, 2, 3} | unsafe_periods):
        rows_in_period = periods[period]
        bound = 300 if game["game_type"] == 2 and period == 4 else 1200
        period_end = 1200 if period <= 3 else max((r[1] for r in rows_in_period), default=bound)
        if all_unsafe or period in unsafe_periods:
            result["unclassified_seconds"] += period_end
            continue
        by_player: dict[int, list] = defaultdict(list)
        for start, end, pid in rows_in_period:
            by_player[pid].append((start, end))
        boundaries: dict[int, list] = defaultdict(list)
        boundaries[0] = []
        boundaries[period_end] = []
        for pid, intervals in by_player.items():
            merged: list[list[int]] = []
            for start, end in sorted(intervals):
                if merged and start <= merged[-1][1]:
                    if start < merged[-1][1]:
                        issues["overlapping_rows"] += 1
                    merged[-1][1] = max(end, merged[-1][1])
                else:
                    merged.append([start, end])
            for start, end in merged:
                boundaries[start].append((pid, True))
                boundaries[end].append((pid, False))
        active: set[int] = set()
        times = sorted(boundaries)
        for index, start in enumerate(times[:-1]):
            for pid, entering in boundaries[start]:
                if entering:
                    active.add(pid)
                else:
                    active.discard(pid)
            end = times[index + 1]
            seconds = end - start
            groups = {side: defaultdict(list) for side in sides}
            for pid in active:
                side, player_role = metadata[pid]["identity"]
                groups[side][player_role].append(pid)
            valid = all(
                not g["unknown"]
                and len(g["goalie"]) == 1
                and 3 <= len(g["forward"]) + len(g["defense"]) <= 6
                for g in groups.values()
            )
            if not valid:
                result["unclassified_seconds"] += seconds
                continue
            if any(len(g["forward"]) + len(g["defense"]) != 5 for g in groups.values()):
                result["other_strength_seconds"] += seconds
                continue
            result["five_on_five_seconds"] += seconds
            selected = groups[team_id]
            if len(selected["forward"]) != 3 or len(selected["defense"]) != 2:
                # A valid 5v5 state may use four forwards, but it is not a normal trio/pair.
                issues["nonstandard_composition_seconds"] += seconds
                continue
            result["classified_seconds"] += seconds
            for kind, ids in (("forward", selected["forward"]), ("defense", selected["defense"])):
                key = (kind, *sorted(ids))
                unit = units.setdefault(
                    key,
                    {
                        "kind": kind,
                        "players": [metadata[pid]["player"] for pid in sorted(ids)],
                        "seconds": 0,
                        "intervals": [],
                    },
                )
                unit["seconds"] += seconds
                intervals = unit["intervals"]
                if (
                    intervals
                    and intervals[-1]["period"] == period
                    and intervals[-1]["end"] == start
                ):
                    intervals[-1]["end"] = end
                else:
                    intervals.append(
                        {
                            "game_id": game["game_id"],
                            "game_date": game["game_date"],
                            "period": period,
                            "start": start,
                            "end": end,
                        }
                    )
    result["issues"] = dict(issues)
    if not result["classified_seconds"]:
        result["status"] = "insufficient_data"
    elif result["unclassified_seconds"] or any(
        issues[k] for k in ("duration_disagreement_rows", "nonstandard_composition_seconds")
    ):
        result["status"] = "partial"
    return result, units


def summarize_lines(games: list[dict], rows: list[dict], team_id: int, limit: int = 12) -> dict:
    """Aggregate per-game units, keeping missing games outside usage denominators."""
    by_game = {
        game_id: list(group)
        for game_id, group in groupby(
            sorted(rows, key=lambda row: row["game_id"]), key=lambda row: row["game_id"]
        )
    }
    results = []
    evidence_limit = 100 if len(games) == 1 else 12
    combined: dict[tuple, dict[str, Any]] = {}
    for game in games:
        result, units = analyze_game(game, by_game.get(game["game_id"], []), team_id)
        results.append(result)
        for key, unit in units.items():
            target = combined.setdefault(
                key,
                {
                    "kind": unit["kind"],
                    "players": unit["players"],
                    "seconds": 0,
                    "games": [],
                    "deployments": 0,
                    "evidence": [],
                },
            )
            target["seconds"] += unit["seconds"]
            target["deployments"] += len(unit["intervals"])
            target["games"].append(
                {
                    "game_id": game["game_id"],
                    "game_date": game["game_date"],
                    "seconds": unit["seconds"],
                }
            )
            # Bound response size while preserving all-game totals and game links.
            target["evidence"].extend(
                unit["intervals"][: max(0, evidence_limit - len(target["evidence"]))]
            )
    total = sum(g["five_on_five_seconds"] for g in results)
    units = sorted(
        combined.values(), key=lambda u: (-u["seconds"], [p["player_id"] for p in u["players"]])
    )
    for unit in units:
        unit["share"] = unit["seconds"] / total if total else None
        unit["appearances"] = len(unit["games"])
        unit["seconds_per_appearance"] = unit["seconds"] / unit["appearances"]
        unit["evidence_truncated"] = unit["deployments"] > len(unit["evidence"])
    usable = sum(g["classified_seconds"] > 0 for g in results)
    if not results:
        status = "no_games"
    elif all(g["status"] == "unsupported" for g in results):
        status = "unsupported"
    elif usable == 0:
        status = "unavailable"
    elif usable < len(results) or any(g["status"] == "partial" for g in results):
        status = "partial"
    else:
        status = "available"
    return {
        "method": METHOD_VERSION,
        "status": status,
        "team_id": team_id,
        "expected_games": len(games),
        "loaded_games": sum(bool(g["raw_rows"]) for g in results),
        "usable_games": usable,
        "five_on_five_seconds": total,
        "classified_seconds": sum(g["classified_seconds"] for g in results),
        "unclassified_seconds": sum(g["unclassified_seconds"] for g in results),
        "forward_trios": [u for u in units if u["kind"] == "forward"][:limit],
        "defense_pairs": [u for u in units if u["kind"] == "defense"][:limit],
        "total_forward_trios": sum(u["kind"] == "forward" for u in units),
        "total_defense_pairs": sum(u["kind"] == "defense" for u in units),
        "games": results,
    }
