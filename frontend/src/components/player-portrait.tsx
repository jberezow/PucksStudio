"use client";
import { useState } from "react";

export function PlayerPortrait({
  name,
  url,
}: {
  name: string;
  url: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  let safe = false;
  try {
    const parsed = new URL(url ?? "");
    safe =
      parsed.protocol === "https:" &&
      parsed.hostname === "assets.nhle.com" &&
      !parsed.username;
  } catch {
    /* Missing and historical portraits use initials. */
  }
  return (
    <span className="player-portrait" aria-hidden="true">
      {safe && url && failed !== url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" loading="lazy" src={url} onError={() => setFailed(url)} />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
      )}
    </span>
  );
}
