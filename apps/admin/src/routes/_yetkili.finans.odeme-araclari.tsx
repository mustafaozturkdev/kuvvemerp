import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Pencil,
  Power,
  Trash2,
  Wallet,
  Banknote,
  Building2,
  CreditCard,
  Smartphone,
  Globe,
  FileText,
  ScrollText,
  ShoppingBag,
  Star,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  FolderKanban,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { ParaTutar } from "@/components/ortak/ParaTutar";
import { HesapFormDrawer } from "@/components/hesap/HesapFormDrawer";
import { HesapGrupModal } from "@/components/hesap/HesapGrupModal";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/finans/odeme-araclari")({
  component: OdemeAraclariSayfa,
});

// ────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────

interface HesapGrup {
  id: string;
  kod: string;
  ad: string;
  ikon: string | null;
  renk: string | null;
}

interface Hesap {
  id: string;
  kod: string;
  ad: string;
  tip: string;
  grupId: string | null;
  paraBirimiKod: string;
  bankaAdi: string | null;
  sube: string | null;
  hesapNo: string | null;
  iban: string | null;
  posSaglayici: string | null;
  posKomisyonOrani: string;
  posBlokeliGun: number;
  baslangicBakiye: string;
  negatifBakiyeIzin: boolean;
  limitTutar: string | null;
  varsayilanMi: boolean;
  sira: number;
  aktifMi: boolean;
  magazalar: { magazaIdler: number[]; varsayilanMagazaId: number | null };
  ayarlar: Record<string, unknown> | null;
  grup: HesapGrup | null;
}

interface HesapCevap {
  veriler: Hesap[];
  meta: { toplam: number; sayfa: number; boyut: number };
}

// ────────────────────────────────────────────────
// Tip meta (ikon + renk)
// ────────────────────────────────────────────────

const TIP_META: Record<string, { ikon: LucideIcon; renk: string; koyuRenk: string }> = {
  kasa:             { ikon: Banknote,     renk: "text-green-600",    koyuRenk: "dark:text-green-400" },
  banka:            { ikon: Building2,    renk: "text-blue-600",     koyuRenk: "dark:text-blue-400" },
  pos:              { ikon: Smartphone,   renk: "text-amber-600",    koyuRenk: "dark:text-amber-400" },
  kredi_karti:      { ikon: CreditCard,   renk: "text-purple-600",   koyuRenk: "dark:text-purple-400" },
  e_cuzdan:         { ikon: Globe,        renk: "text-pink-600",     koyuRenk: "dark:text-pink-400" },
  cek_portfoy:      { ikon: FileText,     renk: "text-cyan-600",     koyuRenk: "dark:text-cyan-400" },
  senet_portfoy:    { ikon: ScrollText,   renk: "text-teal-600",     koyuRenk: "dark:text-teal-400" },
  pazaryeri_alacak: { ikon: ShoppingBag,  renk: "text-orange-600",   koyuRenk: "dark:text-orange-400" },
  diger:            { ikon: Wallet,       renk: "text-gray-600",     koyuRenk: "dark:text-gray-400" },
};

// Liste tab'leri — Tümü hariç hepsi tek bir tip
const TIP_TAB_SIRASI = [
  'kasa', 'banka', 'pos', 'kredi_karti', 'e_cuzdan',
  'cek_portfoy', 'senet_portfoy', 'pazaryeri_alacak', 'diger',
] as const;

// ────────────────────────────────────────────────
// Ana Sayfa
// ────────────────────────────────────────────────

function OdemeAraclariSayfa() {
  const { t } = useTranslation();
  const onay = useOnay();

  const [hesaplar, setHesaplar] = useState<Hesap[]>([]);
  const [gruplar, setGruplar] = useState<HesapGrup[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Filtreler
  const [aktifTip, setAktifTip] = useState<string>(""); // "" = tümü
  const [arama, setArama] = useState("");
  const [aramaGecikme, setAramaGecikme] = useState("");
  const [grupFiltre, setGrupFiltre] = useState<string>("");
  const [gorunum, setGorunum] = useState<"kart" | "liste">("kart");

  // Drawer state
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [duzenlenecekId, setDuzenlenecekId] = useState<string | null>(null);
  const [grupModalAcik, setGrupModalAcik] = useState(false);

  // Arama debounce
  useEffect(() => {
    const zamanlayici = setTimeout(() => setAramaGecikme(arama), 300);
    return () => clearTimeout(zamanlayici);
  }, [arama]);

  // Veri yükle
  const yukle = async () => {
    setYukleniyor(true);
    try {
      const params: Record<string, string | number> = { boyut: 200 };
      if (aktifTip) params.tip = aktifTip;
      if (aramaGecikme) params.arama = aramaGecikme;
      if (grupFiltre) params.grupId = Number(grupFiltre);

      const [hRes, gRes] = await Promise.all([
        apiIstemci.get<HesapCevap>("/hesap", { params }),
        apiIstemci.get<HesapGrup[]>("/hesap-grup", { params: { aktifMi: "true" } }),
      ]);
      setHesaplar(hRes.data.veriler);
      setGruplar(gRes.data);
    } catch {
      toast.hata(t("odeme-araci.yuklenemedi"));
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifTip, aramaGecikme, grupFiltre]);

  // Tip bazlı sayılar (tab rozetleri için)
  const tipSayilari = useMemo(() => {
    const sayim: Record<string, number> = {};
    for (const h of hesaplar) sayim[h.tip] = (sayim[h.tip] ?? 0) + 1;
    return sayim;
  }, [hesaplar]);

  // Grup bazlı grupla (kart görünümünde)
  const gruplanmisHesaplar = useMemo(() => {
    const sonuc: { grup: HesapGrup | null; hesaplar: Hesap[] }[] = [];
    const grupMap = new Map<string, Hesap[]>();
    const grupsuz: Hesap[] = [];

    for (const h of hesaplar) {
      if (h.grup) {
        const list = grupMap.get(h.grup.id) ?? [];
        list.push(h);
        grupMap.set(h.grup.id, list);
      } else {
        grupsuz.push(h);
      }
    }

    // Gruplar sıraya göre
    for (const g of gruplar) {
      const list = grupMap.get(g.id);
      if (list && list.length > 0) {
        sonuc.push({ grup: g, hesaplar: list });
      }
    }
    if (grupsuz.length > 0) {
      sonuc.push({ grup: null, hesaplar: grupsuz });
    }
    return sonuc;
  }, [hesaplar, gruplar]);

  // İşlemler
  const aktiflikDegistir = async (h: Hesap) => {
    // Pasife alma riskli — onay iste; aktif etme risksiz, doğrudan
    if (h.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: h.ad }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/hesap/${h.id}/aktiflik`);
      toast.basarili(h.aktifMi ? t("odeme-araci.pasifleyor") : t("odeme-araci.aktifleyor"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const hesapSil = async (h: Hesap) => {
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.sil-mesaj", { ad: h.ad }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    try {
      await apiIstemci.delete(`/hesap/${h.id}`);
      toast.basarili(t("odeme-araci.silindi"));
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? t("genel.hata"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("odeme-araci.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci mt-1">
            {t("odeme-araci.altyazi")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setGrupModalAcik(true)}>
            <FolderKanban className="h-4 w-4" /> {t("hesap-grup.baslik")}
          </Button>
          <Button
            onClick={() => {
              setDuzenlenecekId(null);
              setDrawerAcik(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t("odeme-araci.yeni-ekle")}
          </Button>
        </div>
      </header>

      {/* Filtre Bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3">
            {/* Tip Tab'leri */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                onClick={() => setAktifTip("")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  aktifTip === ""
                    ? "bg-birincil-zemin text-birincil"
                    : "text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin",
                )}
              >
                {t("genel.hepsi")} ({hesaplar.length})
              </button>
              {TIP_TAB_SIRASI.map((tip) => {
                const meta = TIP_META[tip];
                const Ikon = meta.ikon;
                const sayi = tipSayilari[tip] ?? 0;
                const aktif = aktifTip === tip;
                if (sayi === 0 && aktifTip !== tip) return null;
                return (
                  <button
                    key={tip}
                    onClick={() => setAktifTip(tip)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      aktif
                        ? "bg-birincil-zemin text-birincil"
                        : "text-metin-ikinci hover:bg-yuzey-yukseltilmis hover:text-metin",
                    )}
                  >
                    <Ikon className={cn("h-3.5 w-3.5", meta.renk, meta.koyuRenk)} />
                    {t(`odeme-araci-tip.${tip}`)} ({sayi})
                  </button>
                );
              })}
            </div>

            {/* Arama + Grup + Görünüm */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative max-w-sm flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif pointer-events-none" />
                <Input
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder={t("odeme-araci.arama-placeholder")}
                  className="pl-9"
                />
              </div>

              <select
                value={grupFiltre}
                onChange={(e) => setGrupFiltre(e.target.value)}
                className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm text-metin"
              >
                <option value="">{t("odeme-araci.tum-gruplar")}</option>
                {gruplar.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.ad}
                  </option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-1 rounded-md border border-kenarlik bg-yuzey p-0.5">
                <button
                  onClick={() => setGorunum("kart")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    gorunum === "kart"
                      ? "bg-arkaplan text-birincil shadow-sm"
                      : "text-metin-pasif hover:text-metin",
                  )}
                  title={t("odeme-araci.kart-gorunum")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setGorunum("liste")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    gorunum === "liste"
                      ? "bg-arkaplan text-birincil shadow-sm"
                      : "text-metin-pasif hover:text-metin",
                  )}
                  title={t("odeme-araci.liste-gorunum")}
                >
                  <ListIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* İçerik */}
      {yukleniyor ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
        </div>
      ) : hesaplar.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
            <Wallet className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">{t("odeme-araci.kayit-yok")}</p>
            <Button
              className="mt-4"
              onClick={() => {
                setDuzenlenecekId(null);
                setDrawerAcik(true);
              }}
            >
              <Plus className="h-4 w-4" /> {t("odeme-araci.yeni-ekle")}
            </Button>
          </CardContent>
        </Card>
      ) : gorunum === "kart" ? (
        <KartGorunum
          gruplanmis={gruplanmisHesaplar}
          onDuzenle={(id) => { setDuzenlenecekId(id); setDrawerAcik(true); }}
          onAktiflik={aktiflikDegistir}
          onSil={hesapSil}
        />
      ) : (
        <ListeGorunum
          hesaplar={hesaplar}
          onDuzenle={(id) => { setDuzenlenecekId(id); setDrawerAcik(true); }}
          onAktiflik={aktiflikDegistir}
          onSil={hesapSil}
        />
      )}

      {/* Drawer + Grup Modal */}
      <HesapFormDrawer
        acik={drawerAcik}
        kapat={() => setDrawerAcik(false)}
        hesapId={duzenlenecekId}
        gruplar={gruplar}
        onKaydet={() => void yukle()}
      />

      <HesapGrupModal
        acik={grupModalAcik}
        kapat={() => setGrupModalAcik(false)}
        onDegisti={() => void yukle()}
      />
    </div>
  );
}

// ────────────────────────────────────────────────
// Kart Görünümü
// ────────────────────────────────────────────────

function KartGorunum({
  gruplanmis,
  onDuzenle,
  onAktiflik,
  onSil,
}: {
  gruplanmis: { grup: HesapGrup | null; hesaplar: Hesap[] }[];
  onDuzenle: (id: string) => void;
  onAktiflik: (h: Hesap) => void;
  onSil: (h: Hesap) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {gruplanmis.map(({ grup, hesaplar }) => (
        <div key={grup?.id ?? "grupsuz"}>
          <div className="flex items-center gap-2 mb-3">
            {grup?.renk && (
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: grup.renk }}
              />
            )}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-metin-ikinci">
              {grup?.ad ?? t("odeme-araci.grupsuz")}
            </h2>
            <span className="text-xs text-metin-pasif">({hesaplar.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hesaplar.map((h) => (
              <HesapKart
                key={h.id}
                hesap={h}
                onDuzenle={onDuzenle}
                onAktiflik={onAktiflik}
                onSil={onSil}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HesapKart({
  hesap,
  onDuzenle,
  onAktiflik,
  onSil,
}: {
  hesap: Hesap;
  onDuzenle: (id: string) => void;
  onAktiflik: (h: Hesap) => void;
  onSil: (h: Hesap) => void;
}) {
  const { t } = useTranslation();
  const meta = TIP_META[hesap.tip] ?? TIP_META.diger;
  const Ikon = meta.ikon;

  return (
    <Card className={cn("group relative overflow-hidden transition-all hover:shadow-md", !hesap.aktifMi && "opacity-60")}>
      {hesap.varsayilanMi && (
        <div className="absolute top-2 right-2 z-10">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-400" />
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
            "bg-yuzey dark:bg-yuzey-yukseltilmis",
          )}>
            <Ikon className={cn("h-5 w-5", meta.renk, meta.koyuRenk)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-metin truncate">{hesap.ad}</div>
            <div className="text-xs font-mono text-metin-pasif">{hesap.kod}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-metin-ikinci">
          <Badge variant="outline" className="text-[10px]">
            {hesap.paraBirimiKod}
          </Badge>
          <DurumRozet durum={hesap.aktifMi ? "aktif" : "pasif"} />
        </div>

        {/* Tipe göre alt bilgi */}
        {hesap.bankaAdi && (
          <div className="mt-2 text-xs text-metin-ikinci truncate">
            {hesap.bankaAdi}{hesap.sube ? ` — ${hesap.sube}` : ""}
          </div>
        )}
        {hesap.iban && (
          <div className="mt-1 text-[11px] font-mono text-metin-pasif truncate">
            {hesap.iban}
          </div>
        )}
        {hesap.posSaglayici && (
          <div className="mt-2 text-xs text-metin-ikinci">
            {hesap.posSaglayici} · %{hesap.posKomisyonOrani}
          </div>
        )}

        {/* Başlangıç Bakiye */}
        {Number(hesap.baslangicBakiye) !== 0 && (
          <div className="mt-3 pt-3 border-t border-kenarlik">
            <div className="text-[10px] uppercase tracking-wider text-metin-pasif">
              {t("odeme-araci.baslangic-bakiye")}
            </div>
            <div className="font-semibold text-metin">
              <ParaTutar tutar={Number(hesap.baslangicBakiye)} paraBirimi={hesap.paraBirimiKod} />
            </div>
          </div>
        )}

        {/* Aksiyon butonları */}
        <div className="mt-3 pt-3 border-t border-kenarlik flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuzenle(hesap.id)}
            title={t("genel.duzenle")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAktiflik(hesap)}
            title={hesap.aktifMi ? t("genel.pasife-al") : t("genel.aktif-et")}
          >
            <Power className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSil(hesap)}
            title={t("genel.sil")}
            className="ml-auto hover:text-[color:var(--renk-tehlike)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────
// Liste Görünümü
// ────────────────────────────────────────────────

function ListeGorunum({
  hesaplar,
  onDuzenle,
  onAktiflik,
  onSil,
}: {
  hesaplar: Hesap[];
  onDuzenle: (id: string) => void;
  onAktiflik: (h: Hesap) => void;
  onSil: (h: Hesap) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-yuzey border-b border-kenarlik">
            <tr>
              <th className="w-10 px-3 py-2.5"></th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("odeme-araci.kod")}
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("odeme-araci.ad")}
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("odeme-araci.tip")}
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("odeme-araci.grup")}
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("odeme-araci.doviz")}
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("odeme-araci.baslangic-bakiye")}
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("genel.durum")}
              </th>
              <th className="w-24 px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                {t("genel.islem")}
              </th>
            </tr>
          </thead>
          <tbody>
            {hesaplar.map((h) => {
              const meta = TIP_META[h.tip] ?? TIP_META.diger;
              const Ikon = meta.ikon;
              return (
                <tr key={h.id} className={cn("border-b border-kenarlik/50 hover:bg-yuzey/50 transition-colors group", !h.aktifMi && "opacity-60")}>
                  <td className="px-3 py-2.5">
                    <Ikon className={cn("h-4 w-4", meta.renk, meta.koyuRenk)} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-metin-ikinci">{h.kod}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {h.varsayilanMi && <Star className="h-3 w-3 fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-400" />}
                      <span className="font-medium text-metin">{h.ad}</span>
                    </div>
                    {h.bankaAdi && (
                      <div className="text-xs text-metin-pasif">{h.bankaAdi}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-metin-ikinci">
                    {t(`odeme-araci-tip.${h.tip}`)}
                  </td>
                  <td className="px-3 py-2.5 text-metin-ikinci">{h.grup?.ad ?? "-"}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px]">
                      {h.paraBirimiKod}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right text-metin-ikinci">
                    <ParaTutar tutar={Number(h.baslangicBakiye)} paraBirimi={h.paraBirimiKod} />
                  </td>
                  <td className="px-3 py-2.5">
                    <DurumRozet durum={h.aktifMi ? "aktif" : "pasif"} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => onDuzenle(h.id)} title={t("genel.duzenle")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onAktiflik(h)}>
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onSil(h)} className="hover:text-[color:var(--renk-tehlike)]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
