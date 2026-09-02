import type { ReactNode } from "react";

import { SiteHeader, type SiteSection, type SiteStatus } from "@/components/site-header";

export function AppShell({
  children,
  current,
  status,
}: {
  children: ReactNode;
  current: SiteSection;
  status?: SiteStatus;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 py-5 sm:px-8 sm:py-6">
      <SiteHeader current={current} status={status} />
      {children}
    </main>
  );
}
