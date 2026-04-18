import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Bildirim {
  id: string;
  baslik: string;
  metin: string;
  okundu: boolean;
  tarih: string;
}

const ORNEK_BILDIRIMLER: Bildirim[] = [
  {
    id: "b1",
    baslik: "Yeni sipariş",
    metin: "Acme Tekstil'den 12 kalem sipariş alındı.",
    okundu: false,
    tarih: "Biraz önce",
  },
  {
    id: "b2",
    baslik: "Stok uyarısı",
    metin: "3 ürün kritik stok altında.",
    okundu: false,
    tarih: "15 dk önce",
  },
];

export function KuvvemBildirimMenu() {
  const { t } = useTranslation();
  const okunmamisSayi = ORNEK_BILDIRIMLER.filter((b) => !b.okundu).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-metin-ikinci hover:bg-yuzey hover:text-metin"
        aria-label={t("bildirim.baslik")}
      >
        <Bell className="h-4 w-4" />
        {okunmamisSayi > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-tehlike px-1 text-[10px] font-semibold text-white">
            {okunmamisSayi}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("bildirim.baslik")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {ORNEK_BILDIRIMLER.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-metin-ikinci">
              {t("bildirim.bildirim-yok")}
            </div>
          ) : (
            ORNEK_BILDIRIMLER.map((b) => (
              <div
                key={b.id}
                className="flex flex-col gap-0.5 border-b border-kenarlik px-3 py-2.5 text-left last:border-0 hover:bg-yuzey"
              >
                <div className="flex items-center gap-2">
                  {!b.okundu && (
                    <span className="h-1.5 w-1.5 rounded-full bg-birincil" aria-hidden />
                  )}
                  <span className="text-[13px] font-semibold text-metin">
                    {b.baslik}
                  </span>
                  <span className="ml-auto text-[11px] text-metin-pasif">
                    {b.tarih}
                  </span>
                </div>
                <p className="text-[12px] text-metin-ikinci">{b.metin}</p>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
