import Link from "next/link";

export type SiteSection = "games" | "players" | "health";
export type StatusTone = "ok" | "info" | "warn" | "bad";
export type SiteStatus = { label: string; tone: StatusTone };

type SiteHeaderProps = {
  current: SiteSection;
  status?: SiteStatus;
};

const defaultStatus: SiteStatus = { label: "Read-only explorer", tone: "ok" };

export function SiteHeader({ current, status = defaultStatus }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        <span className="eyebrow">PucksData analytics</span>
        <strong>PucksStudio</strong>
      </Link>
      <nav aria-label="Primary navigation" className="site-nav">
        <Link aria-current={current === "games" ? "page" : undefined} href="/">
          Games
        </Link>
        <Link aria-current={current === "players" ? "page" : undefined} href="/players">
          Players
        </Link>
        <Link aria-current={current === "health" ? "page" : undefined} href="/health">
          Health
        </Link>
      </nav>
      <div className="site-status">
        <span className={`status-dot status-dot-${status.tone}`} />
        {status.label}
      </div>
    </header>
  );
}
