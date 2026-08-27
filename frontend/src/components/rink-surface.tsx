import { useId, type ReactNode } from "react";

const WIDTH = 1_000;
const HEIGHT = 425;
const X_SCALE = WIDTH / 200;
const Y_SCALE = HEIGHT / 85;

export function rinkPoint(x: number, y: number) {
  return {
    x: (x + 100) * X_SCALE,
    y: (42.5 - y) * Y_SCALE,
  };
}

export function RinkSurface({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  const id = useId().replaceAll(":", "");
  const clipId = `rink-clip-${id}`;
  const gridId = `ice-grid-${id}`;

  return (
    <svg
      aria-label={ariaLabel}
      className="rink-svg"
      role="img"
      viewBox={`-20 -20 ${WIDTH + 40} ${HEIGHT + 40}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect height={HEIGHT} rx="75" width={WIDTH} />
        </clipPath>
        <pattern height="20" id={gridId} patternUnits="userSpaceOnUse" width="20">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0f2940" strokeWidth="0.7" />
        </pattern>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect className="rink-ice" height={HEIGHT} rx="75" width={WIDTH} />
        <rect fill={`url(#${gridId})`} height={HEIGHT} opacity="0.35" width={WIDTH} />
        <line className="rink-line rink-red" x1="500" x2="500" y1="0" y2={HEIGHT} />
        <line className="rink-line rink-blue" x1="375" x2="375" y1="0" y2={HEIGHT} />
        <line className="rink-line rink-blue" x1="625" x2="625" y1="0" y2={HEIGHT} />
        <line className="rink-line rink-goal-line" x1="55" x2="55" y1="0" y2={HEIGHT} />
        <line className="rink-line rink-goal-line" x1="945" x2="945" y1="0" y2={HEIGHT} />
        <circle className="rink-faceoff-circle" cx="500" cy={HEIGHT / 2} r="75" />
        {[155, 845].flatMap((x) =>
          [102.5, 322.5].map((y) => (
            <g key={`${x}-${y}`}>
              <circle className="rink-faceoff-circle" cx={x} cy={y} r="75" />
              <circle className="rink-faceoff-dot" cx={x} cy={y} r="6" />
            </g>
          )),
        )}
        {[400, 600].flatMap((x) =>
          [102.5, 322.5].map((y) => (
            <circle className="rink-neutral-dot" cx={x} cy={y} key={`${x}-${y}`} r="5" />
          )),
        )}
        <path className="rink-crease" d="M55 177.5 A35 35 0 0 1 55 247.5 Z" />
        <path className="rink-crease" d="M945 177.5 A35 35 0 0 0 945 247.5 Z" />
      </g>
      <rect className="rink-outline" height={HEIGHT} rx="75" width={WIDTH} />
      <path className="rink-net" d="M55 190 H35 V235 H55" />
      <path className="rink-net" d="M945 190 H965 V235 H945" />
      {children}
    </svg>
  );
}
