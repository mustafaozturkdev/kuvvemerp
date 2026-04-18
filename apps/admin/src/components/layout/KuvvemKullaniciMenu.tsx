import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Moon, Sun, LogOut, Settings, User as UserIcon, Languages } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { kullanKullanici } from "@/hooks/use-kullanici";
import { kullanTema } from "@/hooks/use-tema";

export function KuvvemKullaniciMenu() {
  const { kullanici, cikis } = kullanKullanici();
  const { tema, temaToggle } = kullanTema();
  const yonlendir = useNavigate();
  const { i18n, t } = useTranslation();

  const cikisYap = () => {
    cikis();
    void yonlendir({ to: "/giris" });
  };

  const dilDegistir = () => {
    void i18n.changeLanguage(i18n.language === "tr" ? "en" : "tr");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md p-1 hover:bg-yuzey"
        aria-label={`${t("menu.kullanici")} ${t("genel.detay")}`}
      >
        <Avatar adSoyad={kullanici?.adSoyad} src={kullanici?.avatarUrl} boyut="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-metin">
              {kullanici?.adSoyad ?? t("menu.misafir")}
            </span>
            <span className="text-[11px] font-normal normal-case tracking-normal text-metin-ikinci">
              {kullanici?.email ?? ""}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => yonlendir({ to: "/ayarlar" })}>
          <UserIcon />
          <span>{t("menu.profil")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => yonlendir({ to: "/ayarlar" })}>
          <Settings />
          <span>{t("menu.ayarlar")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={temaToggle}>
          {tema === "koyu" ? <Sun /> : <Moon />}
          <span>{tema === "koyu" ? t("menu.koyu-tema") : t("menu.acik-tema")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={dilDegistir}>
          <Languages />
          <span>{t("menu.dil")}: {i18n.language.toUpperCase()}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={cikisYap}
          className="text-tehlike focus:text-tehlike"
        >
          <LogOut />
          <span>{t("menu.cikis-yap")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
