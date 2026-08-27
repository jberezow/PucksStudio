"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiUrl } from "@/lib/api";
import { readableDate } from "@/lib/format";

type TeamOption = {
  team_id: number;
  abbreviation: string;
  name: string;
};

type CalendarDay = {
  game_date: string;
  game_count: number;
  played_count: number;
};

type CalendarResponse = {
  month: string;
  team: string | null;
  days: CalendarDay[];
};

type SchedulePickerProps = {
  date: string;
  previousDate: string | null;
  nextDate: string | null;
  team: string;
  loading: boolean;
  onDateChange: (date: string) => void;
  onTeamChange: (team: string) => void;
};

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return shifted.toISOString().slice(0, 7);
}

function calendarCells(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from<null>({ length: firstWeekday }).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
}

export function SchedulePicker({
  date,
  previousDate,
  nextDate,
  team,
  loading,
  onDateChange,
  onTeamChange,
}: SchedulePickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    date ? date.slice(0, 7) : new Date().toISOString().slice(0, 7),
  );
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/api/v1/games/teams`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: TeamOption[]) => setTeams(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({ month: `${visibleMonth}-01` });
    if (team) parameters.set("team", team);
    fetch(`${apiUrl}/api/v1/games/calendar?${parameters}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: CalendarResponse) => setCalendarDays(data.days))
      .catch(() => {
        if (!controller.signal.aborted) setCalendarDays([]);
      });
    return () => controller.abort();
  }, [open, team, visibleMonth]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const daysByDate = useMemo(
    () => new Map(calendarDays.map((calendarDay) => [calendarDay.game_date, calendarDay])),
    [calendarDays],
  );
  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);

  function selectDate(selectedDate: string) {
    setOpen(false);
    onDateChange(selectedDate);
  }

  return (
    <div className="schedule-controls">
      <label className="team-filter">
        <span>Team</span>
        <select
          aria-label="Filter schedule by team"
          disabled={loading}
          onChange={(event) => onTeamChange(event.target.value)}
          value={team}
        >
          <option value="">All teams</option>
          {teams.map((option) => (
            <option key={option.team_id} value={option.abbreviation}>
              {option.name} ({option.abbreviation})
            </option>
          ))}
        </select>
      </label>

      <div className="calendar-picker" ref={root}>
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="calendar-trigger"
          disabled={loading}
          onClick={() => {
            if (date) setVisibleMonth(date.slice(0, 7));
            setOpen((current) => !current);
          }}
        >
          <span>
            <small>Date</small>
            <strong>{date ? readableDate(date, true) : "Choose a date"}</strong>
          </span>
          <span aria-hidden="true">▾</span>
        </button>

        {open && (
          <div aria-label="Choose a game date" className="calendar-popover" role="dialog">
            <div className="calendar-header">
              <button aria-label="Previous month" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}>
                ←
              </button>
              <strong>{monthLabel(visibleMonth)}</strong>
              <button aria-label="Next month" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}>
                →
              </button>
            </div>
            <div className="calendar-grid calendar-weekdays">
              {weekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {cells.map((day, index) => {
                if (day === null) return <span key={`empty-${index}`} />;
                const fullDate = `${visibleMonth}-${String(day).padStart(2, "0")}`;
                const calendarDay = daysByDate.get(fullDate);
                const selected = fullDate === date;
                return (
                  <button
                    aria-label={
                      calendarDay
                        ? `${readableDate(fullDate, true)}, ${calendarDay.game_count} games`
                        : `${readableDate(fullDate, true)}, no games`
                    }
                    className={`${selected ? "calendar-day-selected" : ""} ${
                      calendarDay ? "calendar-day-active" : ""
                    }`}
                    disabled={!calendarDay}
                    key={fullDate}
                    onClick={() => selectDate(fullDate)}
                  >
                    {day}
                    {calendarDay && (
                      <i className={calendarDay.played_count > 0 ? "calendar-dot-played" : ""} />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="calendar-legend">
              <span><i className="calendar-dot-played" /> Played</span>
              <span><i /> Scheduled only</span>
            </div>
          </div>
        )}
      </div>

      <div className="game-day-buttons">
        <button
          disabled={!previousDate || loading}
          onClick={() => previousDate && onDateChange(previousDate)}
          title="Previous game day"
        >
          ← <span>Previous</span>
        </button>
        <button
          disabled={!nextDate || loading}
          onClick={() => nextDate && onDateChange(nextDate)}
          title="Next game day"
        >
          <span>Next</span> →
        </button>
      </div>
    </div>
  );
}
