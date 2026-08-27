import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

export function AppShell({
  children,
  current,
}: {
  children: ReactNode;
  current: "games" | "players";
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-5 sm:px-8 sm:py-6">
      <SiteHeader current={current} />
      {children}
    </main>
  );
}
