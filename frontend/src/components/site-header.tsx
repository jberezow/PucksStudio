import Link from "next/link";

type SiteHeaderProps = {
  current: "games" | "players";
};

export function SiteHeader({ current }: SiteHeaderProps) {
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
      </nav>
      <div className="site-status">
        <span className="status-dot" />
        Read-only explorer
      </div>
    </header>
  );
}
