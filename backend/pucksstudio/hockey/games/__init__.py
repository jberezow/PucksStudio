"""Game-level presentation and analytical transformations."""

from pucksstudio.hockey.games.events import describe_event, present_events
from pucksstudio.hockey.games.playoffs import PlayoffContext, parse_playoff_context
from pucksstudio.hockey.games.summary import GameAnalytics, summarize_game

__all__ = [
    "GameAnalytics",
    "PlayoffContext",
    "describe_event",
    "parse_playoff_context",
    "present_events",
    "summarize_game",
]
