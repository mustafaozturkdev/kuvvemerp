import { useRouterState } from "@tanstack/react-router";
import { Search, Command as CmdIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { kullanCmdKStore } from "@/hooks/use-cmd-k";
import { MobilMenuButon } from "./KuvvemSidebar";
import { KuvvemKullaniciMenu } from "./KuvvemKullaniciMenu";
import { KuvvemBildirimMenu } from "./KuvvemBildirimMenu";

export function KuvvemTopbar() {
  const { t } = useTranslation();
  const yol = useRouterState({ select: (s) => s.location.pathname });
  const ac = kullanCmdKStore((s) => s.ac);
  const parcalar = yol.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-[30] flex h-14 items-center gap-3 border-b border-kenarlik bg-yuzey/80 px-4 backdrop-blur-md">
      {/* Mobile hamburger */}
      <MobilMenuButon />

      {/* Breadcrumb */}
      <nav aria-label="Konum" className="flex items-center gap-1.5 text-[13px]">
        <span className="text-metin-ikinci">Kuvvem</span>
        {parcalar.length === 0 ? (
          <>
            <span className="text-metin-pasif">/</span>
            <span className="font-medium text-metin">{t("menu.anasayfa")}</span>
          </>
        ) : (
          parcalar.map((p, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-metin-pasif">/</span>
              <span
                className={
                  i === parcalar.length - 1
                    ? "font-medium text-metin"
                    : "text-metin-ikinci"
                }
              >
                {p}
              </span>
            </span>
          ))
        )}
      </nav>

      {/* Arama (Cmd+K) */}
      <button
        type="button"
        onClick={ac}
        className="ml-auto flex h-9 items-center gap-2 rounded-md border border-kenarlik bg-yuzey px-3 text-[13px] text-metin-ikinci transition-colors hover:border-kenarlik-guclu hover:text-metin md:w-72"
        aria-label={t("genel.ara")}
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">{t("genel.ara")}...</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-kenarlik bg-yuzey-yukseltilmis px-1.5 py-0.5 font-mono text-[10px] md:inline-flex">
          <CmdIcon className="h-3 w-3" />K
        </kbd>
      </button>

      <KuvvemBildirimMenu />
      <KuvvemKullaniciMenu />
    </header>
  );
}
