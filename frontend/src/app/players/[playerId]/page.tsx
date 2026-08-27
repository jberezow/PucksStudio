import { PlayerProfile } from "@/components/player-profile";

export const metadata = {
  title: "Player profile | PucksStudio",
};

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  return <PlayerProfile playerId={playerId} />;
}
