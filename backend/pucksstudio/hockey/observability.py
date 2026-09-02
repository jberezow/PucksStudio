"""Dataset health assessment derived from PucksData's observability views.

The views report completeness (every completed game has events, every goal has
a shots row). They cannot report freshness, because a failed pipeline run
leaves ``sync_state`` untouched, and they count gaps the pipeline has already
acknowledged as permanent. This module layers both judgements on top of the
raw view rows without a database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

Verdict = Literal["healthy", "known_gaps", "sync_overdue", "attention"]
Severity = Literal["info", "warning", "critical"]
GapKind = Literal["actionable", "acknowledged"]

ACKNOWLEDGED_BACKFILL_STATUSES = frozenset({"done", "skipped"})

_VERDICT_RANK: dict[Verdict, int] = {
    "healthy": 0,
    "known_gaps": 1,
    "sync_overdue": 2,
    "attention": 3,
}


@dataclass(frozen=True)
class HealthReason:
    code: str
    severity: Severity
    message: str
    count: int | None = None


@dataclass(frozen=True)
class GapCounts:
    acknowledged: int = 0
    actionable: int = 0


@dataclass(frozen=True)
class Assessment:
    verdict: Verdict
    sync_age_seconds: float | None
    reasons: list[HealthReason] = field(default_factory=list)


def classify_gap(backfill_status: str | None) -> GapKind:
    """Mirror PucksData's sync rule: done or skipped checkpoints are never retried."""

    if backfill_status in ACKNOWLEDGED_BACKFILL_STATUSES:
        return "acknowledged"
    return "actionable"


def gap_counts_by_season(rows: list[dict[str, Any]]) -> dict[int, GapCounts]:
    return {
        int(row["season"]): GapCounts(
            acknowledged=int(row.get("acknowledged_gaps") or 0),
            actionable=int(row.get("actionable_gaps") or 0),
        )
        for row in rows
    }


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def _sync_age_seconds(last_sync_at: datetime | None, now: datetime) -> float | None:
    if last_sync_at is None:
        return None
    if last_sync_at.tzinfo is None:
        last_sync_at = last_sync_at.replace(tzinfo=UTC)
    return max(0.0, (now - last_sync_at).total_seconds())


def assess(
    summary: dict[str, Any],
    gap_counts: dict[int, GapCounts],
    *,
    now: datetime,
    sync_overdue_hours: float,
) -> Assessment:
    """Combine the dataset view row with freshness and gap classification."""

    reasons: list[HealthReason] = []
    verdict: Verdict = "healthy"

    def escalate(candidate: Verdict) -> None:
        nonlocal verdict
        if _VERDICT_RANK[candidate] > _VERDICT_RANK[verdict]:
            verdict = candidate

    sync_age = _sync_age_seconds(summary.get("last_sync_at"), now)
    overdue_seconds = sync_overdue_hours * 3600
    if sync_age is None:
        reasons.append(
            HealthReason(
                code="sync_never",
                severity="warning",
                message="No successful sync has been recorded",
            )
        )
        escalate("sync_overdue")
    elif sync_age >= overdue_seconds:
        overdue_hours = (sync_age - overdue_seconds) / 3600
        reasons.append(
            HealthReason(
                code="sync_overdue",
                severity="warning",
                message=f"Sync overdue by {overdue_hours:.0f} h",
                count=round(sync_age / 3600),
            )
        )
        escalate("sync_overdue")

    actionable = sum(counts.actionable for counts in gap_counts.values())
    acknowledged = sum(counts.acknowledged for counts in gap_counts.values())
    if actionable:
        seasons = sum(1 for counts in gap_counts.values() if counts.actionable)
        reasons.append(
            HealthReason(
                code="actionable_gaps",
                severity="warning",
                message=(
                    f"{_plural(actionable, 'completed game')} without events across "
                    f"{_plural(seasons, 'season')}"
                ),
                count=actionable,
            )
        )
        escalate("attention")
    if acknowledged:
        seasons = sum(1 for counts in gap_counts.values() if counts.acknowledged)
        reasons.append(
            HealthReason(
                code="acknowledged_gaps",
                severity="info",
                message=(
                    f"{_plural(acknowledged, 'known gap')} the pipeline will not retry across "
                    f"{_plural(seasons, 'season')}"
                ),
                count=acknowledged,
            )
        )
        escalate("known_gaps")

    goals_missing_shots = int(summary.get("goals_missing_shots") or 0)
    if goals_missing_shots:
        reasons.append(
            HealthReason(
                code="goals_missing_shots",
                severity="critical",
                message=f"{_plural(goals_missing_shots, 'goal')} without a shots row",
                count=goals_missing_shots,
            )
        )
        escalate("attention")

    backfill_failed = int(summary.get("backfill_failed") or 0)
    if backfill_failed:
        reasons.append(
            HealthReason(
                code="backfill_failed",
                severity="critical",
                message=f"{_plural(backfill_failed, 'failed backfill')}",
                count=backfill_failed,
            )
        )
        escalate("attention")

    backfill_pending = int(summary.get("backfill_pending") or 0)
    if backfill_pending:
        reasons.append(
            HealthReason(
                code="backfill_pending",
                severity="warning",
                message=f"{_plural(backfill_pending, 'backfill')} still pending",
                count=backfill_pending,
            )
        )
        escalate("attention")

    latest_completed = summary.get("latest_completed_game_date")
    latest_event = summary.get("latest_event_game_date")
    if latest_completed and (latest_event is None or latest_event < latest_completed):
        lag_days = (latest_completed - latest_event).days if latest_event else None
        reasons.append(
            HealthReason(
                code="events_behind_schedule",
                severity="warning",
                message=(
                    f"Events trail the schedule by {_plural(lag_days, 'day')}"
                    if lag_days is not None
                    else "No completed game has events yet"
                ),
                count=lag_days,
            )
        )
        escalate("attention")

    return Assessment(verdict=verdict, sync_age_seconds=sync_age, reasons=reasons)
