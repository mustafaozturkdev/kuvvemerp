import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Settings,
  Plus,
  FileText,
  Warehouse,
  Moon,
  LogOut,
  HelpCircle,
  Languages,
  Shield,
  Building2,
  Store,
  UserPlus,
  Key,
} from "lucide-react";

export type KomutGrup =
  | "hizli-eylem"
  | "sayfa"
  | "son-musteri"
  | "son-urun"
  | "sistem"
  | "yardim";

export interface Komut {
  id: string;
  etiket: string;
  ikon: LucideIcon;
  grup: KomutGrup;
  grupBaslik: string;
  kisayol?: string[];
  izin?: string;
  anahtarKelime?: string[];
  hedef?: string;
  eylem?: "tema-degistir" | "dil-degistir" | "cikis";
}

/**
 * Statik komut tanimlari — cmd-k-spec.md'ye birebir uyumlu.
 * Dinamik komutlar (cari arama, urun arama) ayri bir hook ile gelecek.
 */
export const KOMUT_LISTESI: Komut[] = [
  // Hizli eylemler
  {
    id: "yeni-satis",
    etiket: "Yeni Satis Siparisi",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslik: "Hizli Eylemler",
    kisayol: ["N", "S"],
    izin: "siparis.olustur",
    hedef: "/siparis/yeni?tip=satis",
    anahtarKelime: ["satis", "sale", "yeni", "siparis"],
  },
  {
    id: "yeni-alis",
    etiket: "Yeni Alis Siparisi",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslik: "Hizli Eylemler",
    kisayol: ["N", "A"],
    izin: "siparis.olustur",
    hedef: "/siparis/yeni?tip=alis",
    anahtarKelime: ["alis", "purchase"],
  },
  {
    id: "yeni-cari",
    etiket: "Yeni Cari / Musteri",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslik: "Hizli Eylemler",
    kisayol: ["N", "C"],
    izin: "cari.olustur",
    hedef: "/cari/yeni",
    anahtarKelime: ["cari", "musteri", "customer"],
  },
  {
    id: "yeni-urun",
    etiket: "Yeni Urun",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslik: "Hizli Eylemler",
    kisayol: ["N", "U"],
    izin: "urun.olustur",
    hedef: "/urun/yeni",
    anahtarKelime: ["urun", "product"],
  },

  // Sayfalar
  {
    id: "goto-dashboard",
    etiket: "Dashboard",
    ikon: LayoutDashboard,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    kisayol: ["G", "D"],
    hedef: "/",
    anahtarKelime: ["anasayfa", "home", "dashboard"],
  },
  {
    id: "goto-cari",
    etiket: "Cariler",
    ikon: Users,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    kisayol: ["G", "C"],
    hedef: "/cari",
    anahtarKelime: ["cari", "musteri"],
  },
  {
    id: "goto-urun",
    etiket: "Urunler",
    ikon: Package,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    kisayol: ["G", "U"],
    hedef: "/urun",
  },
  {
    id: "goto-siparis",
    etiket: "Siparisler",
    ikon: ShoppingCart,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    kisayol: ["G", "S"],
    hedef: "/siparis",
  },
  {
    id: "goto-stok",
    etiket: "Stok",
    ikon: Warehouse,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    hedef: "/stok",
  },
  {
    id: "goto-fatura",
    etiket: "Faturalar",
    ikon: FileText,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    kisayol: ["G", "F"],
    hedef: "/fatura",
  },

  // Personel
  {
    id: "goto-personel",
    etiket: "Personel",
    ikon: Users,
    grup: "sayfa",
    grupBaslik: "Sayfalar",
    kisayol: ["G", "P"],
    hedef: "/ayarlar/personel",
    izin: "personel.goruntule",
    anahtarKelime: ["personel", "calisan", "staff"],
  },
  {
    id: "yeni-personel",
    etiket: "Yeni Personel",
    ikon: UserPlus,
    grup: "hizli-eylem",
    grupBaslik: "Hizli Eylemler",
    hedef: "/ayarlar/personel",
    izin: "personel.yonet",
    anahtarKelime: ["personel", "calisan", "ekle"],
  },

  // Sistem
  {
    id: "tema-degistir",
    etiket: "Tema Degistir (Acik/Koyu/Sistem)",
    ikon: Moon,
    grup: "sistem",
    grupBaslik: "Sistem",
    eylem: "tema-degistir",
    anahtarKelime: ["tema", "theme", "dark", "koyu"],
  },
  {
    id: "dil-degistir",
    etiket: "Dil Degistir (TR/EN)",
    ikon: Languages,
    grup: "sistem",
    grupBaslik: "Sistem",
    eylem: "dil-degistir",
    anahtarKelime: ["dil", "language", "locale"],
  },
  {
    id: "goto-ayarlar",
    etiket: "Ayarlar",
    ikon: Settings,
    grup: "sistem",
    grupBaslik: "Sistem",
    hedef: "/ayarlar/genel",
    anahtarKelime: ["ayarlar", "settings"],
  },
  {
    id: "goto-kullanicilar",
    etiket: "Kullanicilar",
    ikon: Users,
    grup: "sistem",
    grupBaslik: "Sistem",
    hedef: "/ayarlar/kullanicilar",
    izin: "kullanici.yonet",
    anahtarKelime: ["kullanici", "user"],
  },
  {
    id: "yeni-kullanici",
    etiket: "Yeni Kullanici",
    ikon: UserPlus,
    grup: "hizli-eylem",
    grupBaslik: "Hizli Eylemler",
    hedef: "/ayarlar/kullanicilar",
    izin: "kullanici.yonet",
    anahtarKelime: ["kullanici", "user", "ekle"],
  },
  {
    id: "goto-roller",
    etiket: "Roller",
    ikon: Shield,
    grup: "sistem",
    grupBaslik: "Sistem",
    hedef: "/ayarlar/roller",
    izin: "rol.yonet",
    anahtarKelime: ["rol", "yetki", "izin", "role"],
  },
  {
    id: "goto-sirket",
    etiket: "Sirket Bilgileri",
    ikon: Building2,
    grup: "sistem",
    grupBaslik: "Sistem",
    hedef: "/ayarlar/firma/sirket",
    izin: "sistem.ayar.goruntule",
    anahtarKelime: ["firma", "sirket", "company"],
  },
  {
    id: "goto-subeler",
    etiket: "Subeler",
    ikon: Store,
    grup: "sistem",
    grupBaslik: "Sistem",
    hedef: "/ayarlar/firma/subeler",
    izin: "magaza.goruntule",
    anahtarKelime: ["sube", "magaza", "depo", "branch"],
  },
  {
    id: "sifre-degistir",
    etiket: "Sifre Degistir",
    ikon: Key,
    grup: "sistem",
    grupBaslik: "Sistem",
    hedef: "/ayarlar/genel",
    anahtarKelime: ["sifre", "parola", "password"],
  },
  {
    id: "cikis",
    etiket: "Cikis Yap",
    ikon: LogOut,
    grup: "sistem",
    grupBaslik: "Sistem",
    eylem: "cikis",
    anahtarKelime: ["cikis", "logout", "exit"],
  },

  // Yardim
  {
    id: "yardim",
    etiket: "Klavye Kisayollari",
    ikon: HelpCircle,
    grup: "yardim",
    grupBaslik: "Yardim",
    anahtarKelime: ["yardim", "help", "kisayol"],
  },
];

export function grupluKomutlar(komutlar: Komut[]): Record<string, Komut[]> {
  return komutlar.reduce<Record<string, Komut[]>>((akum, k) => {
    akum[k.grupBaslik] ??= [];
    akum[k.grupBaslik].push(k);
    return akum;
  }, {});
}
