import type { ReactNode } from "react";
import { KuvvemSidebar } from "./KuvvemSidebar";
import { KuvvemTopbar } from "./KuvvemTopbar";
import { kullanSidebarStore } from "@/lib/sidebar-store";
import { cn } from "@/lib/utils";

interface KuvvemLayoutOzellik {
  children: ReactNode;
}

export function KuvvemLayout({ children }: KuvvemLayoutOzellik) {
  const daraltilmis = kullanSidebarStore((s) => s.daraltilmis);
  const geciciAcik = kullanSidebarStore((s) => s.geciciAcik);
  const gercektenAcik = !daraltilmis || geciciAcik;

  return (
    <div className="flex min-h-screen bg-arkaplan text-metin">
      <KuvvemSidebar />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-all duration-300",
          gercektenAcik ? "lg:ml-[280px]" : "lg:ml-[72px]",
        )}
      >
        <KuvvemTopbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
