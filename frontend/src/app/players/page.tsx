import { PlayerSearch } from "@/components/player-search";

export const metadata = {
  title: "Players | PucksStudio",
};

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { q = "", role = "all" } = await searchParams;
  const initialRole = ["all", "skater", "goalie"].includes(role) ? role : "all";
  return <PlayerSearch initialQuery={q} initialRole={initialRole} />;
}
