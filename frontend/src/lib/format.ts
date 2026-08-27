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
