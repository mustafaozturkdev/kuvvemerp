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
  etiketKey: string;
  ikon: LucideIcon;
  grup: KomutGrup;
  grupBaslikKey: string;
  kisayol?: string[];
  izin?: string;
  anahtarKelime?: string[];
  hedef?: string;
  eylem?: "tema-degistir" | "dil-degistir" | "cikis";
}

/**
 * Statik komut tanımları — i18n anahtarlarıyla.
 * Dinamik komutlar (cari arama, urun arama) ayrı bir hook ile gelir.
 */
export const KOMUT_LISTESI: Komut[] = [
  // ── Hızlı eylemler ───────────────────────────
  {
    id: "yeni-satis",
    etiketKey: "komut-paleti.yeni-satis",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslikKey: "komut-paleti.grup-hizli-eylem",
    kisayol: ["N", "S"],
    izin: "siparis.olustur",
    hedef: "/siparis/yeni?tip=satis",
    anahtarKelime: ["satis", "satış", "sale", "yeni", "siparis"],
  },
  {
    id: "yeni-alis",
    etiketKey: "komut-paleti.yeni-alis",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslikKey: "komut-paleti.grup-hizli-eylem",
    kisayol: ["N", "A"],
    izin: "siparis.olustur",
    hedef: "/siparis/yeni?tip=alis",
    anahtarKelime: ["alis", "alış", "purchase"],
  },
  {
    id: "yeni-cari",
    etiketKey: "komut-paleti.yeni-cari",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslikKey: "komut-paleti.grup-hizli-eylem",
    kisayol: ["N", "C"],
    izin: "cari.olustur",
    hedef: "/cari/yeni",
    anahtarKelime: ["cari", "musteri", "müşteri", "customer"],
  },
  {
    id: "yeni-urun",
    etiketKey: "komut-paleti.yeni-urun",
    ikon: Plus,
    grup: "hizli-eylem",
    grupBaslikKey: "komut-paleti.grup-hizli-eylem",
    kisayol: ["N", "U"],
    izin: "urun.olustur",
    hedef: "/urun/yeni",
    anahtarKelime: ["urun", "ürün", "product"],
  },
  {
    id: "yeni-personel",
    etiketKey: "komut-paleti.yeni-personel",
    ikon: UserPlus,
    grup: "hizli-eylem",
    grupBaslikKey: "komut-paleti.grup-hizli-eylem",
    hedef: "/ayarlar/personel",
    izin: "personel.yonet",
    anahtarKelime: ["personel", "calisan", "çalışan", "ekle"],
  },
  {
    id: "yeni-kullanici",
    etiketKey: "komut-paleti.yeni-kullanici",
    ikon: UserPlus,
    grup: "hizli-eylem",
    grupBaslikKey: "komut-paleti.grup-hizli-eylem",
    hedef: "/ayarlar/kullanicilar",
    izin: "kullanici.yonet",
    anahtarKelime: ["kullanici", "kullanıcı", "user", "ekle"],
  },

  // ── Sayfalar ───────────────────────────
  {
    id: "goto-dashboard",
    etiketKey: "komut-paleti.dashboard",
    ikon: LayoutDashboard,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    kisayol: ["G", "D"],
    hedef: "/",
    anahtarKelime: ["anasayfa", "ana sayfa", "home", "dashboard"],
  },
  {
    id: "goto-cari",
    etiketKey: "komut-paleti.cari-sayfa",
    ikon: Users,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    kisayol: ["G", "C"],
    hedef: "/cari/liste",
    anahtarKelime: ["cari", "musteri", "müşteri"],
  },
  {
    id: "goto-urun",
    etiketKey: "komut-paleti.urun",
    ikon: Package,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    kisayol: ["G", "U"],
    hedef: "/urun",
    anahtarKelime: ["urun", "ürün", "product"],
  },
  {
    id: "goto-siparis",
    etiketKey: "komut-paleti.siparis",
    ikon: ShoppingCart,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    kisayol: ["G", "S"],
    hedef: "/siparis",
    anahtarKelime: ["siparis", "sipariş", "order"],
  },
  {
    id: "goto-stok",
    etiketKey: "komut-paleti.stok",
    ikon: Warehouse,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    hedef: "/stok",
    anahtarKelime: ["stok", "stock", "inventory"],
  },
  {
    id: "goto-fatura",
    etiketKey: "komut-paleti.fatura",
    ikon: FileText,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    kisayol: ["G", "F"],
    hedef: "/fatura",
    anahtarKelime: ["fatura", "invoice"],
  },
  {
    id: "goto-personel",
    etiketKey: "komut-paleti.personel",
    ikon: Users,
    grup: "sayfa",
    grupBaslikKey: "komut-paleti.grup-sayfa",
    kisayol: ["G", "P"],
    hedef: "/ayarlar/personel",
    izin: "personel.goruntule",
    anahtarKelime: ["personel", "çalışan", "staff"],
  },

  // ── Sistem ───────────────────────────
  {
    id: "tema-degistir",
    etiketKey: "komut-paleti.tema-degistir",
    ikon: Moon,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    eylem: "tema-degistir",
    anahtarKelime: ["tema", "theme", "dark", "koyu", "açık"],
  },
  {
    id: "dil-degistir",
    etiketKey: "komut-paleti.dil-degistir",
    ikon: Languages,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    eylem: "dil-degistir",
    anahtarKelime: ["dil", "language", "locale"],
  },
  {
    id: "goto-ayarlar",
    etiketKey: "komut-paleti.ayarlar",
    ikon: Settings,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    hedef: "/ayarlar/genel",
    anahtarKelime: ["ayarlar", "settings"],
  },
  {
    id: "goto-kullanicilar",
    etiketKey: "komut-paleti.kullanicilar",
    ikon: Users,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    hedef: "/ayarlar/kullanicilar",
    izin: "kullanici.yonet",
    anahtarKelime: ["kullanici", "kullanıcı", "user"],
  },
  {
    id: "goto-roller",
    etiketKey: "komut-paleti.roller",
    ikon: Shield,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    hedef: "/ayarlar/roller",
    izin: "rol.yonet",
    anahtarKelime: ["rol", "yetki", "izin", "role"],
  },
  {
    id: "goto-sirket",
    etiketKey: "komut-paleti.sirket-bilgileri",
    ikon: Building2,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    hedef: "/ayarlar/firma/sirket",
    izin: "sistem.ayar.goruntule",
    anahtarKelime: ["firma", "şirket", "company"],
  },
  {
    id: "goto-subeler",
    etiketKey: "komut-paleti.subeler",
    ikon: Store,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    hedef: "/ayarlar/firma/subeler",
    izin: "magaza.goruntule",
    anahtarKelime: ["şube", "sube", "magaza", "mağaza", "depo", "branch"],
  },
  {
    id: "sifre-degistir",
    etiketKey: "komut-paleti.sifre-degistir",
    ikon: Key,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    hedef: "/ayarlar/genel",
    anahtarKelime: ["şifre", "sifre", "parola", "password"],
  },
  {
    id: "cikis",
    etiketKey: "komut-paleti.cikis-yap",
    ikon: LogOut,
    grup: "sistem",
    grupBaslikKey: "komut-paleti.grup-sistem",
    eylem: "cikis",
    anahtarKelime: ["çıkış", "cikis", "logout", "exit"],
  },

  // ── Yardım ───────────────────────────
  {
    id: "yardim",
    etiketKey: "komut-paleti.klavye-kisayollari",
    ikon: HelpCircle,
    grup: "yardim",
    grupBaslikKey: "komut-paleti.grup-yardim",
    anahtarKelime: ["yardım", "yardim", "help", "kısayol", "kisayol"],
  },
];

/** Komutları grup başlıklarına göre grupla. Başlık resolvingi çağıranda yapılır. */
export function grupluKomutlar(komutlar: Komut[]): Record<string, Komut[]> {
  return komutlar.reduce<Record<string, Komut[]>>((akum, k) => {
    akum[k.grupBaslikKey] ??= [];
    akum[k.grupBaslikKey].push(k);
    return akum;
  }, {});
}
