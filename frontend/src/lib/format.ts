export function titleCase(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function readableDate(value: string, includeWeekday = false) {
  return new Intl.DateTimeFormat("en-US", {
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function readableDateTime(value: string) {
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const remainder = minutes % 60;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${days} d ${remainder} h` : `${days} d`;
}

export function seasonLabel(season: number) {
  const value = String(season);
  return `${value.slice(0, 4)}–${value.slice(6)}`;
}

export function strengthLabel(value: string) {
  const labels: Record<string, string> = {
    EV: "EV · Even strength",
    PP: "PP · Power play",
    SH: "SH · Shorthanded",
  };
  return labels[value] ?? value;
}
