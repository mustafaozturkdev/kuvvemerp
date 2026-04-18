/**
 * CariSecimModal — Global cari seçim / listeleme modalı.
 *
 * Kullanım:
 *   <CariSecimModal acik={acik} kapat={kapat} onSec={(cari) => ...} />
 *   <CariSecimModal acik={acik} kapat={kapat} sadeceListe />  // seçim yok, sadece yönetim
 *
 * Özellikler:
 *   - Full-screen modal
 *   - Server-side sayfalama + arama (debounce)
 *   - Tip / Grup / Durum filtreleri
 *   - Kolon göster/gizle (localStorage persist)
 *   - Excel export
 *   - Yeni cari ekleme (CariFormDrawer)
 *   - Satıra tıklayınca seçim veya detay
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Search,
  Plus,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Power,
  Eye,
  Columns3,
  Filter,
  Check,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { CariFormDrawer } from "./CariFormDrawer";
import { toast } from "@/hooks/use-toast";
import { useOnay } from "@/components/ortak/OnayDialog";
import { useDrawerKapatma } from "@/hooks/use-drawer-kapatma";
import { cn } from "@/lib/utils";

// ── Tipler ────────────────────────────────────────────

interface CariIletisim {
  id: string;
  tip: string;
  deger: string;
}

interface CariSatir {
  id: string;
  kod: string;
  tip: string;
  kisiTipi: string;
  ad: string | null;
  soyad: string | null;
  unvan: string | null;
  kisaAd: string | null;
  vergiNo: string | null;
  vergiNoTipi: string | null;
  sektor: string | null;
  paraBirimiKod: string;
  iskontoOrani: string;
  vadeGun: number;
  aktifMi: boolean;
  olusturmaTarihi: string;
  cariGrup: { id: string; ad: string; kod: string } | null;
  iletisimler: CariIletisim[];
}

interface CariGrupSecim {
  id: string;
  ad: string;
}

interface CariCevap {
  veriler: CariSatir[];
  meta: { toplam: number; sayfa: number; boyut: number };
}

// ── Kolon tanımları ────────────────────────────────

interface Kolon {
  anahtar: string;
  etiketAnahtar: string;
  varsayilanGorunur: boolean;
  genislik?: string;
  hizalama?: "left" | "center" | "right";
}

const KOLONLAR: Kolon[] = [
  { anahtar: "kod", etiketAnahtar: "cari.kod", varsayilanGorunur: true, genislik: "w-[100px]" },
  { anahtar: "unvan", etiketAnahtar: "cari.unvan", varsayilanGorunur: true },
  { anahtar: "tip", etiketAnahtar: "cari.tip", varsayilanGorunur: true, genislik: "w-[120px]" },
  { anahtar: "grup", etiketAnahtar: "cari.grup", varsayilanGorunur: true, genislik: "w-[140px]" },
  { anahtar: "telefon", etiketAnahtar: "cari.telefon", varsayilanGorunur: true, genislik: "w-[140px]" },
  { anahtar: "email", etiketAnahtar: "cari.email", varsayilanGorunur: true, genislik: "w-[180px]" },
  { anahtar: "vergiNo", etiketAnahtar: "cari.vergi-no", varsayilanGorunur: false, genislik: "w-[130px]" },
  { anahtar: "sektor", etiketAnahtar: "cari.sektor", varsayilanGorunur: false, genislik: "w-[120px]" },
  { anahtar: "doviz", etiketAnahtar: "cari.doviz", varsayilanGorunur: false, genislik: "w-[80px]" },
  { anahtar: "iskonto", etiketAnahtar: "cari.iskonto", varsayilanGorunur: false, genislik: "w-[80px]", hizalama: "right" },
  { anahtar: "vade", etiketAnahtar: "cari.vade-gun", varsayilanGorunur: false, genislik: "w-[80px]", hizalama: "right" },
  { anahtar: "durum", etiketAnahtar: "genel.durum", varsayilanGorunur: true, genislik: "w-[80px]" },
];

const TIP_HARITA: Record<string, string> = {
  musteri: "cari.tip-musteri",
  tedarikci: "cari.tip-tedarikci",
  her_ikisi: "cari.tip-her-ikisi",
  personel: "cari.tip-personel",
  diger: "cari.tip-diger",
};

const TIP_RENK: Record<string, string> = {
  musteri: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  tedarikci: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  her_ikisi: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  personel: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  diger: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const LS_KOLON_KEY = "kuvvem-cari-modal-kolonlar";
const SAYFA_BOYUT = 25;

// ── Props ────────────────────────────────────────────

interface CariSecimModalOzellik {
  acik: boolean;
  kapat: () => void;
  onSec?: (cari: CariSatir) => void;
  sadeceListe?: boolean;
  varsayilanTip?: string;
}

export function CariSecimModal({
  acik,
  kapat,
  onSec,
  sadeceListe = false,
  varsayilanTip,
}: CariSecimModalOzellik) {
  const { t } = useTranslation();
  const onay = useOnay();
  const { drawerRef } = useDrawerKapatma({ acik, kapat });

  // Veri
  const [cariler, setCariler] = useState<CariSatir[]>([]);
  const [toplam, setToplam] = useState(0);
  const [sayfa, setSayfa] = useState(1);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gruplar, setGruplar] = useState<CariGrupSecim[]>([]);

  // Filtreler
  const [arama, setArama] = useState("");
  const [aramaGecikme, setAramaGecikme] = useState("");
  const [tipFiltre, setTipFiltre] = useState(varsayilanTip ?? "");
  const [grupFiltre, setGrupFiltre] = useState("");
  const [durumFiltre, setDurumFiltre] = useState("true");

  // Kolon görünürlüğü
  const [gorunurKolonlar, setGorunurKolonlar] = useState<Record<string, boolean>>(() => {
    try {
      const kayitli = localStorage.getItem(LS_KOLON_KEY);
      if (kayitli) return JSON.parse(kayitli);
    } catch {}
    return Object.fromEntries(KOLONLAR.map((k) => [k.anahtar, k.varsayilanGorunur]));
  });
  const [kolonMenuAcik, setKolonMenuAcik] = useState(false);

  // Drawer
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [duzenlenecekCariId, setDuzenlenecekCariId] = useState<string | null>(null);

  const aramaRef = useRef<HTMLInputElement>(null);

  // ── Veri yükle ────────────────────────────────

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const params: Record<string, string | number> = { sayfa, boyut: SAYFA_BOYUT };
      if (aramaGecikme) params.arama = aramaGecikme;
      if (tipFiltre) params.tip = tipFiltre;
      if (grupFiltre) params.grupId = Number(grupFiltre);
      if (durumFiltre) params.aktifMi = durumFiltre;

      const res = await apiIstemci.get<CariCevap>("/cari", { params });
      setCariler(res.data.veriler);
      setToplam(res.data.meta.toplam);
    } catch {
      toast.hata(t("cari.yuklenemedi"));
    }
    setYukleniyor(false);
  }, [sayfa, aramaGecikme, tipFiltre, grupFiltre, durumFiltre, t]);

  useEffect(() => {
    if (!acik) return;
    void yukle();
  }, [acik, yukle]);

  // Grupları yükle
  useEffect(() => {
    if (!acik) return;
    apiIstemci
      .get<CariGrupSecim[]>("/cari-grup", { params: { aktifMi: "true" } })
      .then((res) => setGruplar(res.data))
      .catch(() => {});
  }, [acik]);

  // Debounce arama
  useEffect(() => {
    const zamanlayici = setTimeout(() => {
      setAramaGecikme(arama);
      setSayfa(1);
    }, 400);
    return () => clearTimeout(zamanlayici);
  }, [arama]);

  // Focus arama input
  useEffect(() => {
    if (acik) setTimeout(() => aramaRef.current?.focus(), 100);
  }, [acik]);

  // Kolon kaydet
  useEffect(() => {
    localStorage.setItem(LS_KOLON_KEY, JSON.stringify(gorunurKolonlar));
  }, [gorunurKolonlar]);

  // ── Aksiyonlar ────────────────────────────────

  const aktiflikDegistir = async (c: CariSatir) => {
    if (c.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: cariAd(c) }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/cari/${c.id}/aktiflik`);
      toast.basarili(`${cariAd(c)} ${c.aktifMi ? t("genel.pasife-al") : t("genel.aktif-et")}`);
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const excelExport = () => {
    // CSV export (basit ama etkili)
    const basliklar = gorunurKolonlarListesi.map((k) => t(k.etiketAnahtar));
    const satirlar = cariler.map((c) =>
      gorunurKolonlarListesi.map((k) => hucreDeger(c, k.anahtar)).join("\t"),
    );
    const icerik = [basliklar.join("\t"), ...satirlar].join("\n");
    const blob = new Blob(["\uFEFF" + icerik], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cariler-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast.basarili(t("genel.excel-aktar"));
  };

  // ── Yardımcılar ────────────────────────────────

  const cariAd = (c: CariSatir) =>
    c.unvan ?? [c.ad, c.soyad].filter(Boolean).join(" ") ?? c.kod;

  const cariIletisim = (c: CariSatir, tip: string) =>
    c.iletisimler?.find((i) => i.tip === tip)?.deger ?? "";

  const hucreDeger = (c: CariSatir, kolon: string): string => {
    switch (kolon) {
      case "kod": return c.kod;
      case "unvan": return cariAd(c);
      case "tip": return t(TIP_HARITA[c.tip] ?? c.tip);
      case "grup": return c.cariGrup?.ad ?? "-";
      case "telefon": return cariIletisim(c, "cep") || cariIletisim(c, "telefon") || "-";
      case "email": return cariIletisim(c, "email") || "-";
      case "vergiNo": return c.vergiNo ?? "-";
      case "sektor": return c.sektor ?? "-";
      case "doviz": return c.paraBirimiKod;
      case "iskonto": return Number(c.iskontoOrani) > 0 ? `%${c.iskontoOrani}` : "-";
      case "vade": return c.vadeGun > 0 ? `${c.vadeGun}` : "-";
      case "durum": return c.aktifMi ? t("genel.aktif") : t("genel.pasif");
      default: return "";
    }
  };

  const gorunurKolonlarListesi = KOLONLAR.filter((k) => gorunurKolonlar[k.anahtar]);
  const toplamSayfa = Math.ceil(toplam / SAYFA_BOYUT);

  const filtreTemizle = () => {
    setArama("");
    setTipFiltre(varsayilanTip ?? "");
    setGrupFiltre("");
    setDurumFiltre("true");
    setSayfa(1);
  };

  const filtreAktifMi =
    arama || tipFiltre !== (varsayilanTip ?? "") || grupFiltre || durumFiltre !== "true";

  if (!acik) return null;

  return (
    <div ref={drawerRef} className="fixed inset-0 z-50 flex flex-col bg-arkaplan" role="dialog" aria-modal="true">
      {/* ── Üst Bar ──────────────────────────── */}
      <div className="flex items-center justify-between border-b border-kenarlik px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-metin">
            {sadeceListe ? t("cari.liste-baslik") : t("cari.secim-baslik")}
          </h1>
          <span className="text-sm text-metin-ikinci">
            {t("cari.toplam-kayit", { sayi: toplam })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={excelExport}>
            <Download className="h-3.5 w-3.5" /> {t("genel.excel-aktar")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDuzenlenecekCariId(null);
              setDrawerAcik(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> {t("cari.yeni-ekle")}
          </Button>
          <Button variant="ghost" size="sm" onClick={kapat}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Filtre Bar ──────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-kenarlik px-6 py-2.5 flex-wrap shrink-0">
        {/* Arama */}
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
          <Input
            ref={aramaRef}
            placeholder={t("cari.arama-placeholder")}
            className="pl-9"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
          />
        </div>

        {/* Tip */}
        <select
          value={tipFiltre}
          onChange={(e) => { setTipFiltre(e.target.value); setSayfa(1); }}
          className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
        >
          <option value="">{t("genel.hepsi")} — {t("cari.tip")}</option>
          <option value="musteri">{t("cari.tip-musteri")}</option>
          <option value="tedarikci">{t("cari.tip-tedarikci")}</option>
          <option value="her_ikisi">{t("cari.tip-her-ikisi")}</option>
        </select>

        {/* Grup */}
        {gruplar.length > 0 && (
          <select
            value={grupFiltre}
            onChange={(e) => { setGrupFiltre(e.target.value); setSayfa(1); }}
            className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
          >
            <option value="">{t("cari.tum-gruplar")}</option>
            {gruplar.map((g) => (
              <option key={g.id} value={g.id}>{g.ad}</option>
            ))}
          </select>
        )}

        {/* Durum */}
        <select
          value={durumFiltre}
          onChange={(e) => { setDurumFiltre(e.target.value); setSayfa(1); }}
          className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
        >
          <option value="">{t("genel.hepsi")}</option>
          <option value="true">{t("genel.aktif")}</option>
          <option value="false">{t("genel.pasif")}</option>
        </select>

        {/* Filtre temizle */}
        {filtreAktifMi && (
          <Button variant="ghost" size="sm" onClick={filtreTemizle}>
            <Filter className="h-3.5 w-3.5" /> {t("genel.temizle")}
          </Button>
        )}

        {/* Kolon toggle */}
        <div className="ml-auto relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setKolonMenuAcik(!kolonMenuAcik)}
          >
            <Columns3 className="h-3.5 w-3.5" /> {t("genel.kolon-goster-gizle")}
          </Button>
          {kolonMenuAcik && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setKolonMenuAcik(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-kenarlik bg-arkaplan shadow-lg p-2">
                {KOLONLAR.map((k) => (
                  <label
                    key={k.anahtar}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-yuzey cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={gorunurKolonlar[k.anahtar] ?? false}
                      onChange={(e) =>
                        setGorunurKolonlar((prev) => ({
                          ...prev,
                          [k.anahtar]: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-kenarlik"
                    />
                    {t(k.etiketAnahtar)}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Tablo ──────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {yukleniyor ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
          </div>
        ) : cariler.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-metin-ikinci">
            <Search className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">{t("genel.kayit-bulunamadi")}</p>
            {arama && (
              <p className="text-sm mt-1">"{arama}" {t("genel.kayit-bulunamadi").toLowerCase()}</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-yuzey border-b border-kenarlik z-10">
              <tr>
                {!sadeceListe && (
                  <th className="w-[50px] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                    {t("genel.sec")}
                  </th>
                )}
                {gorunurKolonlarListesi.map((k) => (
                  <th
                    key={k.anahtar}
                    className={cn(
                      "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci",
                      k.genislik,
                      k.hizalama === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {t(k.etiketAnahtar)}
                  </th>
                ))}
                <th className="w-[80px] px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
                  {t("genel.islem")}
                </th>
              </tr>
            </thead>
            <tbody>
              {cariler.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    "border-b border-kenarlik/50 transition-colors group",
                    !sadeceListe && "cursor-pointer hover:bg-birincil-zemin/30",
                    sadeceListe && "hover:bg-yuzey/50",
                  )}
                  onClick={() => {
                    if (!sadeceListe && onSec) {
                      onSec(c);
                      kapat();
                    }
                  }}
                >
                  {!sadeceListe && (
                    <td className="px-3 py-2.5">
                      <div className="h-5 w-5 rounded border border-kenarlik group-hover:border-birincil group-hover:bg-birincil/10 flex items-center justify-center">
                        <Check className="h-3 w-3 text-birincil opacity-0 group-hover:opacity-100" />
                      </div>
                    </td>
                  )}
                  {gorunurKolonlarListesi.map((k) => (
                    <td
                      key={k.anahtar}
                      className={cn(
                        "px-3 py-2.5",
                        k.hizalama === "right" && "text-right",
                      )}
                    >
                      {k.anahtar === "kod" ? (
                        <span className="font-mono text-xs text-metin-ikinci">{c.kod}</span>
                      ) : k.anahtar === "unvan" ? (
                        <div className="flex items-center gap-2.5">
                          <Avatar adSoyad={cariAd(c)} boyut="sm" />
                          <div>
                            <div className="font-medium text-metin">{cariAd(c)}</div>
                            {c.kisaAd && <div className="text-[11px] text-metin-ikinci">{c.kisaAd}</div>}
                          </div>
                        </div>
                      ) : k.anahtar === "tip" ? (
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-medium", TIP_RENK[c.tip])}
                        >
                          {t(TIP_HARITA[c.tip] ?? c.tip)}
                        </Badge>
                      ) : k.anahtar === "durum" ? (
                        <DurumRozet durum={c.aktifMi ? "aktif" : "pasif"} />
                      ) : (
                        <span className="text-metin-ikinci">{hucreDeger(c, k.anahtar)}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDuzenlenecekCariId(c.id);
                          setDrawerAcik(true);
                        }}
                        title={t("genel.duzenle")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          aktiflikDegistir(c);
                        }}
                        title={c.aktifMi ? t("genel.pasife-al") : t("genel.aktif-et")}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Alt Bar — Sayfalama ──────────────────────────── */}
      <div className="flex items-center justify-between border-t border-kenarlik px-6 py-2.5 shrink-0">
        <p className="text-sm text-metin-ikinci">
          {toplam > 0
            ? `${(sayfa - 1) * SAYFA_BOYUT + 1}–${Math.min(sayfa * SAYFA_BOYUT, toplam)} / ${toplam} ${t("genel.kayit")}`
            : t("genel.kayit-bulunamadi")}
        </p>
        <div className="flex items-center gap-2">
          {/* Sayfa boyutu — sabit 25 şimdilik */}
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={sayfa === 1}
              onClick={() => setSayfa(1)}
            >
              {t("ice-aktar.ilk")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={sayfa === 1}
              onClick={() => setSayfa((s) => s - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-3 text-sm text-metin">
              {sayfa} / {toplamSayfa || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={sayfa >= toplamSayfa}
              onClick={() => setSayfa((s) => s + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={sayfa >= toplamSayfa}
              onClick={() => setSayfa(toplamSayfa)}
            >
              {t("ice-aktar.son")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── CariFormDrawer ──────────────────────────── */}
      <CariFormDrawer
        acik={drawerAcik}
        kapat={() => setDrawerAcik(false)}
        cariId={duzenlenecekCariId}
        varsayilanTip={varsayilanTip}
        onKaydet={() => void yukle()}
      />
    </div>
  );
}
