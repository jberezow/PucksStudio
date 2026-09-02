import { DatasetHealth } from "@/components/dataset-health";

export const metadata = {
  title: "Health | PucksStudio",
};

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season } = await searchParams;
  const initialSeason = season && /^\d{8}$/.test(season) ? Number(season) : null;
  return <DatasetHealth initialSeason={initialSeason} />;
}
