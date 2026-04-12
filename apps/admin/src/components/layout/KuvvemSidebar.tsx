import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Warehouse,
  FileText,
  BarChart3,
  Settings,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

interface MenuOge {
  anahtar: string;
  etiket: string;
  hedef: string;
  ikon: LucideIcon;
}

export function KuvvemSidebar() {
  const { t } = useTranslation();
  const [daraltilmis, setDaraltilmis] = useState(false);
  const yol = useRouterState({ select: (s) => s.location.pathname });

  const menu: MenuOge[] = [
    { anahtar: "anasayfa", etiket: t("menu.anasayfa"), hedef: "/", ikon: LayoutDashboard },
    { anahtar: "cari", etiket: t("menu.cari"), hedef: "/cari", ikon: Users },
    { anahtar: "urun", etiket: t("menu.urun"), hedef: "/urun", ikon: Package },
    { anahtar: "siparis", etiket: t("menu.siparis"), hedef: "/siparis", ikon: ShoppingCart },
    { anahtar: "stok", etiket: t("menu.stok"), hedef: "/stok", ikon: Warehouse },
    { anahtar: "muhasebe", etiket: t("menu.muhasebe"), hedef: "/muhasebe", ikon: FileText },
    { anahtar: "rapor", etiket: t("menu.rapor"), hedef: "/rapor", ikon: BarChart3 },
    { anahtar: "ayarlar", etiket: t("menu.ayarlar"), hedef: "/ayarlar", ikon: Settings },
  ];

  return (
    <aside
      className={cn(
        "relative flex h-screen shrink-0 flex-col border-r border-kenarlik bg-yuzey transition-[width] duration-200",
        daraltilmis ? "w-16" : "w-60",
      )}
      aria-label="Ana navigasyon"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-kenarlik px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-birincil text-white font-bold">
          K
        </div>
        {!daraltilmis && (
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-metin">Kuvvem</span>
            <span className="text-[10px] uppercase tracking-wider text-metin-ikinci">
              ERP v2
            </span>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-0.5 px-2">
          {menu.map((oge) => {
            const aktif =
              oge.hedef === "/" ? yol === "/" : yol.startsWith(oge.hedef);
            const Ikon = oge.ikon;
            const baglanti = (
              <Link
                to={oge.hedef}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  aktif
                    ? "bg-birincil-zemin text-birincil"
                    : "text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin",
                )}
                aria-current={aktif ? "page" : undefined}
              >
                <Ikon className="h-4 w-4 shrink-0" />
                {!daraltilmis && <span className="truncate">{oge.etiket}</span>}
              </Link>
            );
            return (
              <li key={oge.anahtar}>
                {daraltilmis ? (
                  <Tooltip icerik={oge.etiket} taraf="right">
                    {baglanti}
                  </Tooltip>
                ) : (
                  baglanti
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Daralt/Aç toggle */}
      <button
        type="button"
        onClick={() => setDaraltilmis((x) => !x)}
        className="flex items-center justify-center gap-2 border-t border-kenarlik py-2 text-xs text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin"
        aria-label={daraltilmis ? "Sidebar'i genislet" : "Sidebar'i daralt"}
      >
        <ChevronLeft
          className={cn("h-4 w-4 transition-transform", daraltilmis && "rotate-180")}
        />
        {!daraltilmis && <span>Daralt</span>}
      </button>
    </aside>
  );
}
