import { PlayerProfile } from "@/components/player-profile";

export const metadata = {
  title: "Player profile | PucksStudio",
};

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ from?: string; role?: string }>;
}) {
  const { playerId } = await params;
  const { from = "", role = "all" } = await searchParams;
  const fromRole = ["all", "skater", "goalie"].includes(role) ? role : "all";
  return <PlayerProfile fromQuery={from} fromRole={fromRole} playerId={playerId} />;
}
