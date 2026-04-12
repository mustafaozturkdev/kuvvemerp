import type { ReactNode } from "react";
import { KuvvemSidebar } from "./KuvvemSidebar";
import { KuvvemTopbar } from "./KuvvemTopbar";

interface KuvvemLayoutOzellik {
  children: ReactNode;
}

/**
 * Linear/Stripe tarzi, sidebar + topbar + content layout.
 * 1024px alti icin sadece kucuk ekran optimize degildir — sidebar gizlenir.
 */
export function KuvvemLayout({ children }: KuvvemLayoutOzellik) {
  return (
    <div className="flex min-h-screen bg-arkaplan text-metin">
      <div className="hidden lg:block">
        <KuvvemSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <KuvvemTopbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
