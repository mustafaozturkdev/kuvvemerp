import { useState, useEffect } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Warehouse,
  FileText,
  BarChart3,
  Settings,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  User,
  UserPlus,
  UserCircle,
  UsersRound,
  CreditCard,
  Wallet,
  Building2,
  Receipt,
  History,
  ArrowLeftRight,
  TrendingDown,
  FolderTree,
  Tag,
  Boxes,
  PackagePlus,
  PackageOpen,
  ClipboardCheck,
  Send,
  Scale,
  Banknote,
  Shield,
  Database,
  Bell,
  Monitor,
  Store,
  Layers,
  X,
  Menu,
  Wrench,
  Globe,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { kullanSidebarStore } from "@/lib/sidebar-store";
import { kullanAuthStore } from "@/lib/auth-store";

// ─── 3-Level Menu Yapisi ───

interface MenuOge {
  baslikKey: string; // i18n anahtarı
  hedef: string;
  ikon: LucideIcon;
  cocuklar?: MenuOge[];
}

const MENU: MenuOge[] = [
  { baslikKey: "menu.ana-sayfa", hedef: "/", ikon: LayoutDashboard },
  {
    baslikKey: "menu.cari",
    hedef: "/cari",
    ikon: Users,
    cocuklar: [
      { baslikKey: "menu.cari-listesi", hedef: "/cari/liste", ikon: UserCircle },
      { baslikKey: "menu.yeni-cari", hedef: "/cari/yeni", ikon: UserPlus },
      { baslikKey: "menu.cari-gruplar", hedef: "/cari/gruplar", ikon: UsersRound },
      { baslikKey: "menu.cari-ice-aktar", hedef: "/cari/ice-aktar", ikon: Upload },
      { baslikKey: "menu.ekstre", hedef: "/cari/ekstre", ikon: FileText },
    ],
  },
  {
    baslikKey: "menu.urun",
    hedef: "/urun",
    ikon: Package,
    cocuklar: [
      { baslikKey: "menu.urun-listesi", hedef: "/urun/liste", ikon: PackageOpen },
      { baslikKey: "menu.yeni-urun", hedef: "/urun/yeni", ikon: PackagePlus },
      {
        baslikKey: "menu.tanimlar",
        hedef: "/urun/tanimlar",
        ikon: FolderTree,
        cocuklar: [
          { baslikKey: "menu.kategoriler", hedef: "/urun/tanimlar/kategoriler", ikon: FolderTree },
          { baslikKey: "menu.markalar", hedef: "/urun/tanimlar/markalar", ikon: Tag },
          { baslikKey: "menu.fiyat-listeleri", hedef: "/urun/tanimlar/fiyat-listeleri", ikon: Layers },
          { baslikKey: "menu.birimler", hedef: "/urun/tanimlar/birimler", ikon: Scale },
        ],
      },
    ],
  },
  {
    baslikKey: "menu.stok",
    hedef: "/stok",
    ikon: Warehouse,
    cocuklar: [
      { baslikKey: "menu.stok-durumu", hedef: "/stok/durum", ikon: Boxes },
      { baslikKey: "menu.transfer", hedef: "/stok/transfer", ikon: Send },
      { baslikKey: "menu.sayim", hedef: "/stok/sayim", ikon: ClipboardCheck },
      { baslikKey: "menu.hareketler", hedef: "/stok/hareketler", ikon: History },
    ],
  },
  {
    baslikKey: "menu.siparis",
    hedef: "/siparis",
    ikon: ShoppingCart,
    cocuklar: [
      { baslikKey: "menu.satis", hedef: "/siparis/satis", ikon: ShoppingCart },
      { baslikKey: "menu.alis", hedef: "/siparis/alis", ikon: PackagePlus },
      { baslikKey: "menu.iade", hedef: "/siparis/iade", ikon: ArrowLeftRight },
    ],
  },
  {
    baslikKey: "menu.finans",
    hedef: "/finans",
    ikon: CreditCard,
    cocuklar: [
      { baslikKey: "menu.odeme-araclari", hedef: "/finans/odeme-araclari", ikon: Wallet },
      { baslikKey: "menu.tahsilat-odeme", hedef: "/finans/tahsilat", ikon: Banknote },
      { baslikKey: "menu.banka", hedef: "/finans/banka", ikon: Building2 },
      { baslikKey: "menu.gider-gelir", hedef: "/finans/gider-gelir", ikon: TrendingDown },
      { baslikKey: "menu.faturalar", hedef: "/finans/faturalar", ikon: Receipt },
    ],
  },
  {
    baslikKey: "menu.muhasebe",
    hedef: "/muhasebe",
    ikon: Scale,
    cocuklar: [
      { baslikKey: "menu.yevmiye-fisleri", hedef: "/muhasebe/yevmiye", ikon: FileText },
      { baslikKey: "menu.mizan", hedef: "/muhasebe/mizan", ikon: BarChart3 },
    ],
  },
  {
    baslikKey: "menu.personel",
    hedef: "/ayarlar/personel",
    ikon: Users,
  },
  { baslikKey: "menu.rapor", hedef: "/rapor", ikon: BarChart3 },
  {
    baslikKey: "menu.ayarlar",
    hedef: "/ayarlar",
    ikon: Settings,
    cocuklar: [
      { baslikKey: "menu.genel", hedef: "/ayarlar/genel", ikon: Settings },
      {
        baslikKey: "menu.firma",
        hedef: "/ayarlar/firma",
        ikon: Building2,
        cocuklar: [
          { baslikKey: "menu.sirket-bilgileri", hedef: "/ayarlar/firma/sirket", ikon: Building2 },
          { baslikKey: "menu.subeler", hedef: "/ayarlar/firma/subeler", ikon: Store },
          { baslikKey: "menu.terminaller", hedef: "/ayarlar/firma/terminaller", ikon: Monitor },
        ],
      },
      { baslikKey: "menu.kullanicilar", hedef: "/ayarlar/kullanicilar", ikon: Users },
      { baslikKey: "menu.roller", hedef: "/ayarlar/roller", ikon: Shield },
      { baslikKey: "menu.entegrasyonlar", hedef: "/ayarlar/entegrasyonlar", ikon: Globe },
      { baslikKey: "menu.bildirimler", hedef: "/ayarlar/bildirimler", ikon: Bell },
      { baslikKey: "menu.sistem", hedef: "/ayarlar/sistem", ikon: Database },
    ],
  },
];

// ─── 3-Level NavItem ───

function NavItem({
  oge,
  seviye,
  acik,
  ikonModu,
  yol,
  aciklar,
  acikToggle,
  onNavigate,
  onIkonTik,
}: {
  oge: MenuOge;
  seviye: number; // 0=root, 1=child, 2=grandchild
  acik: boolean;
  ikonModu: boolean;
  yol: string;
  aciklar: string[];
  acikToggle: (baslik: string) => void;
  onNavigate?: () => void;
  onIkonTik?: () => void;
}) {
  const { t } = useTranslation();
  const baslik = t(oge.baslikKey);
  const aktif = oge.cocuklar
    ? yol === oge.hedef
    : yol === oge.hedef || yol.startsWith(oge.hedef + "/");
  const genislemis = aciklar.includes(oge.baslikKey);
  const Ikon = oge.ikon;

  // Seviyeye gore boyut
  const ikonBoyut = seviye === 0 ? "h-5 w-5" : seviye === 1 ? "h-4 w-4" : "h-3.5 w-3.5";
  const satirPadding = seviye === 0 ? "px-3 py-2.5" : seviye === 1 ? "px-3 py-2" : "px-3 py-1.5";
  const yaziSinif = seviye === 0 ? "text-sm font-medium" : "text-sm";

  // Alt menulu
  if (oge.cocuklar) {
    // Root seviye: sidebar-item class'i, alt seviyeler: inline stil
    if (seviye === 0) {
      return (
        <li>
          <button
            onClick={() => {
              if (ikonModu && !acik && onIkonTik) onIkonTik();
              if (acik) acikToggle(oge.baslikKey);
            }}
            className={cn(
              "sidebar-item w-full",
              !acik && "justify-center px-0",
              aktif && "active",
            )}
            title={!acik ? baslik : undefined}
          >
            <Ikon className={cn(ikonBoyut, "shrink-0", !acik && "mx-auto")} />
            {acik && (
              <>
                <span className="flex-1 text-left">{baslik}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", genislemis && "rotate-180")} />
              </>
            )}
          </button>
          {genislemis && acik && (
            <ul className="mt-1 ml-4 space-y-0.5 border-l-2 border-kenarlik pl-3">
              {oge.cocuklar.map((cocuk) => (
                <NavItem
                  key={cocuk.hedef}
                  oge={cocuk}
                  seviye={1}
                  acik={acik}
                  ikonModu={ikonModu}
                  yol={yol}
                  aciklar={aciklar}
                  acikToggle={acikToggle}
                  onNavigate={onNavigate}
                  onIkonTik={onIkonTik}
                />
              ))}
            </ul>
          )}
        </li>
      );
    }

    // Level 1-2: alt menu butonu
    return (
      <li>
        <button
          onClick={() => acikToggle(oge.baslikKey)}
          className={cn(
            "flex items-center gap-2 rounded-lg w-full transition-all duration-200",
            satirPadding,
            yaziSinif,
            aktif
              ? "bg-birincil-zemin text-birincil font-medium"
              : "text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin",
          )}
        >
          <Ikon className={ikonBoyut} />
          <span className="flex-1 text-left">{baslik}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", genislemis && "rotate-180")} />
        </button>
        {genislemis && (
          <ul className="mt-1 ml-4 space-y-0.5 border-l border-kenarlik/50 pl-3">
            {oge.cocuklar.map((cocuk) => (
              <NavItem
                key={cocuk.hedef}
                oge={cocuk}
                seviye={seviye + 1}
                acik={acik}
                ikonModu={ikonModu}
                yol={yol}
                aciklar={aciklar}
                acikToggle={acikToggle}
                onNavigate={onNavigate}
                onIkonTik={onIkonTik}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // Yaprak (cocuksuz)
  if (seviye === 0) {
    return (
      <li>
        <Link
          to={oge.hedef}
          onClick={onNavigate}
          className={cn("sidebar-item", !acik && "justify-center px-0", aktif && "active")}
          title={!acik ? baslik : undefined}
        >
          <Ikon className={cn(ikonBoyut, "shrink-0", !acik && "mx-auto")} />
          {acik && <span>{baslik}</span>}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={oge.hedef}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 rounded-lg transition-all duration-200",
          satirPadding,
          yaziSinif,
          aktif
            ? "bg-birincil-zemin text-birincil font-medium"
            : "text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin",
        )}
      >
        <Ikon className={ikonBoyut} />
        {baslik}
      </Link>
    </li>
  );
}

// ─── Desktop Sidebar ───

function DesktopSidebar() {
  const { t } = useTranslation();
  const yol = useRouterState({ select: (s) => s.location.pathname });
  const yonlendir = useNavigate();
  const { daraltilmis, geciciAcik, daraltToggle, geciciGenislet, navigasyonSonrasi } =
    kullanSidebarStore();
  const kullanici = kullanAuthStore((s) => s.kullanici);
  const cikis = kullanAuthStore((s) => s.cikis);
  const [aciklar, setAciklar] = useState<string[]>([]);
  const [kullaniciPopover, setKullaniciPopover] = useState(false);

  const gercektenAcik = !daraltilmis || geciciAcik;

  const acikToggle = (baslik: string) =>
    setAciklar((prev) =>
      prev.includes(baslik) ? prev.filter((x) => x !== baslik) : [...prev, baslik],
    );

  const handleCikis = () => {
    cikis();
    void yonlendir({ to: "/giris" });
  };

  return (
    <aside
      className={cn(
        "hidden lg:flex fixed left-0 top-0 z-40 h-screen border-r border-kenarlik bg-yuzey flex-col transition-all duration-300 ease-in-out",
        gercektenAcik ? "w-[280px]" : "w-[72px]",
      )}
    >
      {/* Logo + Toggle */}
      <div className="relative flex items-center border-b border-kenarlik h-16 px-3">
        <Link to="/" onClick={() => navigasyonSonrasi()} className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-birincil text-white text-lg font-bold">
            K
          </div>
          {gercektenAcik && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-metin">Kuvvem</span>
              <span className="text-[10px] uppercase tracking-wider text-metin-ikinci">ERP v2</span>
            </div>
          )}
        </Link>
        <button
          onClick={daraltToggle}
          className={cn(
            "absolute right-0 translate-x-1/2 p-1.5 rounded-full border border-kenarlik bg-yuzey shadow-sm hover:bg-yuzey-yukseltilmis transition-colors z-10",
            geciciAcik && "bg-birincil-zemin border-birincil/30",
          )}
          title={daraltilmis ? t("menu.menuyu-genislet") : t("menu.icon-moduna-gec")}
        >
          {daraltilmis ? <PanelLeft className="w-4 h-4 text-metin-ikinci" /> : <PanelLeftClose className="w-4 h-4 text-metin-ikinci" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <ul className="space-y-1">
          {MENU.map((oge) => (
            <NavItem
              key={oge.baslikKey}
              oge={oge}
              seviye={0}
              acik={gercektenAcik}
              ikonModu={daraltilmis}
              yol={yol}
              aciklar={aciklar}
              acikToggle={acikToggle}
              onNavigate={() => navigasyonSonrasi()}
              onIkonTik={() => geciciGenislet()}
            />
          ))}
        </ul>
      </nav>

      {/* User */}
      <div className={cn("border-t border-kenarlik p-3", !gercektenAcik && "flex flex-col items-center")}>
        <div className="relative">
          <button
            onClick={() => setKullaniciPopover(!kullaniciPopover)}
            className={cn(
              "flex items-center gap-3 w-full p-2 rounded-xl bg-yuzey-yukseltilmis hover:bg-yuzey-batik transition-all duration-200",
              !gercektenAcik && "justify-center p-2",
            )}
          >
            <div className="w-9 h-9 rounded-full bg-birincil-zemin flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-birincil" />
            </div>
            {gercektenAcik && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium truncate text-metin">{kullanici?.adSoyad || kullanici?.email || t("menu.kullanici")}</p>
                <p className="text-xs text-metin-ikinci truncate">{kullanici?.rol ?? ""}</p>
              </div>
            )}
          </button>
          {kullaniciPopover && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setKullaniciPopover(false)} />
              <div className="absolute z-50 bottom-full mb-2 left-0 bg-yuzey-yukseltilmis border border-kenarlik rounded-xl shadow-xl p-3 w-64">
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-kenarlik">
                  <div className="w-10 h-10 rounded-full bg-birincil-zemin flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-birincil" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-metin">{kullanici?.adSoyad || kullanici?.email}</p>
                    <p className="text-xs text-metin-ikinci truncate">{kullanici?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setKullaniciPopover(false); handleCikis(); }}
                  className="flex items-center gap-3 w-full p-2 rounded-lg text-sm text-metin-ikinci hover:text-tehlike hover:bg-tehlike-zemin transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t("menu.cikis-yap")}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile Sidebar ───

function MobileSidebar() {
  const { t } = useTranslation();
  const yol = useRouterState({ select: (s) => s.location.pathname });
  const yonlendir = useNavigate();
  const { mobilAcik, mobilKapat } = kullanSidebarStore();
  const kullanici = kullanAuthStore((s) => s.kullanici);
  const cikis = kullanAuthStore((s) => s.cikis);
  const [aciklar, setAciklar] = useState<string[]>([]);

  const acikToggle = (baslik: string) =>
    setAciklar((prev) =>
      prev.includes(baslik) ? prev.filter((x) => x !== baslik) : [...prev, baslik],
    );

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") mobilKapat(); };
    if (mobilAcik) { document.addEventListener("keydown", esc); document.body.style.overflow = "hidden"; }
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [mobilAcik, mobilKapat]);

  return (
    <>
      <div
        className={cn("lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300", mobilAcik ? "opacity-100" : "opacity-0 pointer-events-none")}
        onClick={mobilKapat}
      />
      <aside className={cn("lg:hidden fixed left-0 top-0 z-50 h-screen w-[280px] bg-yuzey border-r border-kenarlik shadow-2xl flex flex-col transition-transform duration-300 ease-in-out", mobilAcik ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between border-b border-kenarlik h-16 px-4">
          <Link to="/" className="flex items-center gap-3" onClick={mobilKapat}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-birincil text-white text-lg font-bold">K</div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-metin">Kuvvem</span>
              <span className="text-[10px] uppercase tracking-wider text-metin-ikinci">ERP v2</span>
            </div>
          </Link>
          <button onClick={mobilKapat} className="p-2 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors">
            <X className="w-5 h-5 text-metin-ikinci" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          <ul className="space-y-1">
            {MENU.map((oge) => (
              <NavItem key={oge.baslikKey} oge={oge} seviye={0} acik={true} ikonModu={false} yol={yol} aciklar={aciklar} acikToggle={acikToggle} onNavigate={mobilKapat} />
            ))}
          </ul>
        </nav>
        <div className="border-t border-kenarlik p-3 space-y-2">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-yuzey-yukseltilmis">
            <div className="w-9 h-9 rounded-full bg-birincil-zemin flex items-center justify-center shrink-0"><User className="w-4 h-4 text-birincil" /></div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate text-metin">{kullanici?.adSoyad || kullanici?.email}</p><p className="text-xs text-metin-ikinci truncate">{kullanici?.email}</p></div>
          </div>
          <button onClick={() => { cikis(); mobilKapat(); void yonlendir({ to: "/giris" }); }} className="flex items-center gap-3 w-full p-2 rounded-xl text-sm text-metin-ikinci hover:text-tehlike hover:bg-tehlike-zemin transition-all duration-200">
            <LogOut className="w-5 h-5" /><span>{t("menu.cikis-yap")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export function MobilMenuButon() {
  const { t } = useTranslation();
  const toggle = kullanSidebarStore((s) => s.mobilToggle);
  return (
    <button onClick={toggle} className="lg:hidden p-2 rounded-lg hover:bg-yuzey-yukseltilmis transition-colors" aria-label={t("menu.menuyu-genislet")}>
      <Menu className="w-5 h-5 text-metin" />
    </button>
  );
}

export function KuvvemSidebar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (<><DesktopSidebar /><MobileSidebar /></>);
}
