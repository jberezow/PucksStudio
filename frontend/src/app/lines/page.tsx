import { LineExplorer } from "@/components/line-explorer";

export const metadata = { title: "Line combinations | PucksStudio" };

export default async function LinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = await searchParams;
  const parameters = new URLSearchParams();
  for (const key of [
    "game_id",
    "season",
    "team_id",
    "game_type",
    "date_from",
    "date_to",
  ]) {
    if (typeof values[key] === "string") parameters.set(key, values[key]);
  }
  return (
    <LineExplorer key={parameters.toString()} query={parameters.toString()} />
  );
}
