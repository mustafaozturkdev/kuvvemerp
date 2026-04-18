import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import {
  Upload,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  AlertTriangle,
  FileSpreadsheet,
  Link2,
  Eye,
  Loader2,
  Download,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/cari/ice-aktar")({
  component: CariIceAktar,
});

// ── Tipler ────────────────────────────────────

interface ImportAlani {
  anahtar: string;
  etiket: string;
  zorunluGrup: string | null;
}

type Adim = "yukle" | "esle" | "onizle" | "sonuc";

// Adım etiketleri i18n anahtarları ile render sırasında çözülür
const ADIM_ANAHTARLARI: Array<{ anahtar: Adim; etiketKey: string; ikon: typeof Upload }> = [
  { anahtar: "yukle", etiketKey: "ice-aktar.adim-yukle", ikon: Upload },
  { anahtar: "esle", etiketKey: "ice-aktar.adim-esle", ikon: Link2 },
  { anahtar: "onizle", etiketKey: "ice-aktar.adim-onizle", ikon: Eye },
  { anahtar: "sonuc", etiketKey: "ice-aktar.adim-sonuc", ikon: Check },
];

function CariIceAktar() {
  const { t } = useTranslation();
  const dosyaRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [adim, setAdim] = useState<Adim>("yukle");

  // Upload state
  const [yukluyor, setYukluyor] = useState(false);
  const [kolonlar, setKolonlar] = useState<string[]>([]);
  const [satirlar, setSatirlar] = useState<Array<Record<string, string | number | null>>>([]);
  const [importAlanlari, setImportAlanlari] = useState<ImportAlani[]>([]);

  // Eşleştirme
  const [eslestirme, setEslestirme] = useState<Record<string, string>>({}); // { excelKolonIdx: cariAlanAnahtar }
  const [seciliAlan, setSeciliAlan] = useState<string | null>(null);

  // Toplu ayarlar
  const [firmaTuru, setFirmaTuru] = useState("musteri");

  // Satır bazlı cari grup (opsiyonel)
  const [satirGruplari, setSatirGruplari] = useState<Record<number, string>>({});

  // Aktarım
  const [aktariyor, setAktariyor] = useState(false);
  const [sonuc, setSonuc] = useState<{ basarili: number; hatali: number; hatalar: Array<{ satirIndex: number; mesaj: string }> } | null>(null);

  // ── Dosya Yükle ────────────────────────────────

  const dosyaYukle = async (dosya: File) => {
    setYukluyor(true);
    try {
      const formData = new FormData();
      formData.append("file", dosya);
      const res = await apiIstemci.post("/cari/import/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const veri = res.data as any;
      if (veri.hata) {
        toast.hata(veri.hata.mesaj);
        return;
      }
      setKolonlar(veri.kolonlar);
      setSatirlar(veri.satirlar);
      setImportAlanlari(veri.importAlanlari);
      setEslestirme({});
      setSeciliAlan(null);
      toast.basarili(`${veri.toplamSatir} ${t("ice-aktar.satir-yuklendi")}`);
      setAdim("esle");
    } catch (err: any) {
      toast.hata(err?.response?.data?.mesaj ?? t("ice-aktar.dosya-yuklenemedi"));
    }
    setYukluyor(false);
  };

  // ── Kolon Eşleştirme ────────────────────────────

  const alanSec = (alan: string) => {
    setSeciliAlan(seciliAlan === alan ? null : alan);
  };

  const kolonEsle = (kolonIdx: number) => {
    if (!seciliAlan) return;
    // Önceki eşleştirmeyi temizle (aynı alan başka kolona eşlenmiş olabilir)
    const yeni = { ...eslestirme };
    for (const [key, val] of Object.entries(yeni)) {
      if (val === seciliAlan) delete yeni[key];
    }
    yeni[kolonIdx.toString()] = seciliAlan;
    setEslestirme(yeni);
    setSeciliAlan(null);
  };

  const eslestirmeyiKaldir = (kolonIdx: number) => {
    const yeni = { ...eslestirme };
    delete yeni[kolonIdx.toString()];
    setEslestirme(yeni);
  };

  const eslenmisAlanlar = new Set(Object.values(eslestirme));
  const zorunluTamam =
    eslenmisAlanlar.has("unvan") || eslenmisAlanlar.has("ad");

  // ── Aktarım ────────────────────────────────

  const aktarimiBaslat = async () => {
    if (!zorunluTamam) {
      toast.hata(t("ice-aktar.zorunlu-eksik"));
      return;
    }
    setAktariyor(true);
    try {
      const gonderilecekSatirlar = satirlar.map((s, idx) => ({
        ...s,
        _satirIndex: idx,
        _cariGrupId: satirGruplari[idx] ? Number(satirGruplari[idx]) : null,
        _firmaTuru: firmaTuru,
      }));

      const res = await apiIstemci.post("/cari/import/execute", {
        satirlar: gonderilecekSatirlar,
        eslestirme,
        varsayilanlar: { tip: firmaTuru, kisiTipi: "tuzel" },
      });

      const veri = res.data as any;
      if (veri.hata) {
        toast.hata(veri.hata.mesaj);
      } else {
        setSonuc(veri);
        setAdim("sonuc");
        if (veri.hatali === 0) {
          toast.basarili(`${veri.basarili} ${t("ice-aktar.cari-aktarildi")}`);
        } else {
          toast.bilgi?.(`${veri.basarili} ${t("genel.basarili").toLowerCase()}, ${veri.hatali} ${t("ice-aktar.hatali").toLowerCase()}`);
        }
      }
    } catch (err: any) {
      toast.hata(err?.response?.data?.mesaj ?? t("ice-aktar.aktarim-basarisiz"));
    }
    setAktariyor(false);
  };

  // ── Render ────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/cari/liste" className="flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-metin">
              {t("ice-aktar.baslik")}
            </h1>
            <p className="text-sm text-metin-ikinci">
              {t("ice-aktar.altyazi")}
            </p>
          </div>
        </div>
      </header>

      {/* Adım göstergesi */}
      <div className="flex items-center gap-2">
        {ADIM_ANAHTARLARI.map((a, idx) => {
          const aktifIdx = ADIM_ANAHTARLARI.findIndex((x) => x.anahtar === adim);
          const tamamlandi = idx < aktifIdx;
          const aktif = idx === aktifIdx;
          const Ikon = a.ikon;
          return (
            <div key={a.anahtar} className="flex items-center gap-2">
              {idx > 0 && <div className={cn("h-px w-8", tamamlandi ? "bg-birincil" : "bg-kenarlik")} />}
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  aktif && "bg-birincil text-white",
                  tamamlandi && "bg-birincil/10 text-birincil",
                  !aktif && !tamamlandi && "bg-yuzey text-metin-pasif",
                )}
              >
                {tamamlandi ? <Check className="h-3.5 w-3.5" /> : <Ikon className="h-3.5 w-3.5" />}
                {t(a.etiketKey)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ADIM 1: Dosya Yükle ──────────────────── */}
      {adim === "yukle" && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-birincil-zemin mb-6">
                <FileSpreadsheet className="h-10 w-10 text-birincil" />
              </div>
              <h2 className="text-xl font-semibold text-metin">{t("ice-aktar.dosya-yukle-baslik")}</h2>
              <p className="text-sm text-metin-ikinci mt-2 max-w-md">
                {t("ice-aktar.dosya-yukle-aciklama")}
              </p>
              <input
                ref={dosyaRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const dosya = e.target.files?.[0];
                  if (dosya) void dosyaYukle(dosya);
                }}
              />
              <Button className="mt-6" size="lg" onClick={() => dosyaRef.current?.click()} disabled={yukluyor}>
                {yukluyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {yukluyor ? t("genel.yukleniyor") : t("ice-aktar.dosya-sec")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ADIM 2: Kolon Eşleştirme ──────────────────── */}
      {adim === "esle" && (
        <>
          {/* Talimatlar */}
          <div className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-700 p-4 text-white">
            <h3 className="font-semibold">{t("ice-aktar.eslestirme-baslik")}</h3>
            <ol className="mt-2 text-sm space-y-1 opacity-90">
              <li>{t("ice-aktar.eslestirme-adim1")}</li>
              <li>{t("ice-aktar.eslestirme-adim2")}</li>
              <li>{t("ice-aktar.eslestirme-adim3")}</li>
            </ol>
          </div>

          {/* Eşleştirme alanları */}
          <Card>
            <CardHeader>
              <CardTitle>{t("ice-aktar.cari-alanlari")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {importAlanlari.map((alan) => {
                  const eslenmis = eslenmisAlanlar.has(alan.anahtar);
                  const secili = seciliAlan === alan.anahtar;
                  const zorunlu = alan.zorunluGrup === "kimlik";
                  return (
                    <button
                      key={alan.anahtar}
                      onClick={() => !eslenmis && alanSec(alan.anahtar)}
                      disabled={eslenmis}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium border transition-all",
                        eslenmis && "bg-green-100 border-green-300 text-green-700 opacity-60 cursor-not-allowed dark:bg-green-900/30 dark:text-green-400",
                        secili && "bg-green-500 border-green-500 text-white scale-105 shadow-md",
                        !eslenmis && !secili && zorunlu && "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400",
                        !eslenmis && !secili && !zorunlu && "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400",
                      )}
                    >
                      {eslenmis && <Check className="inline h-3 w-3 mr-1" />}
                      {alan.etiket}
                      {zorunlu && !eslenmis && " *"}
                    </button>
                  );
                })}
              </div>
              <div className={cn("mt-3 rounded-lg px-4 py-2 text-sm font-medium", zorunluTamam ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400")}>
                {zorunluTamam
                  ? `✓ ${t("ice-aktar.zorunlu-tamam")}`
                  : `⚠ ${t("ice-aktar.zorunlu-eksik")}`}
              </div>
            </CardContent>
          </Card>

          {/* Toplu ayarlar */}
          <Card>
            <CardHeader><CardTitle>{t("ice-aktar.toplu-ayarlar")}</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-sm font-medium text-metin">{t("cari.tip")}</label>
                  <select
                    value={firmaTuru}
                    onChange={(e) => setFirmaTuru(e.target.value)}
                    className="mt-1 block rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm"
                  >
                    <option value="musteri">{t("cari.tip-musteri")}</option>
                    <option value="tedarikci">{t("cari.tip-tedarikci")}</option>
                    <option value="her_ikisi">{t("cari.tip-her-ikisi")}</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Veri tablosu */}
          <Card>
            <CardHeader>
              <CardTitle>{t("ice-aktar.veri-onizleme")} ({satirlar.length} {t("ice-aktar.satir")})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-yuzey border-b border-kenarlik">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-metin-ikinci w-[40px]">#</th>
                    {kolonlar.map((kolon, idx) => {
                      const eslenmisMi = eslestirme[idx.toString()];
                      const eslenmisBilgi = eslenmisMi
                        ? importAlanlari.find((a) => a.anahtar === eslenmisMi)
                        : null;
                      return (
                        <th
                          key={idx}
                          className={cn(
                            "px-3 py-2 text-left text-xs font-semibold cursor-pointer transition-colors min-w-[120px]",
                            eslenmisMi && "bg-green-50 dark:bg-green-900/20",
                            seciliAlan && !eslenmisMi && "bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100",
                            !seciliAlan && !eslenmisMi && "text-metin-ikinci",
                          )}
                          onClick={() => kolonEsle(idx)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{kolon}</span>
                            {eslenmisBilgi && (
                              <Badge
                                variant="outline"
                                className="bg-green-100 text-green-700 text-[10px] shrink-0 dark:bg-green-900/30 dark:text-green-400"
                              >
                                {eslenmisBilgi.etiket}
                                <button
                                  className="ml-1 hover:text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    eslestirmeyiKaldir(idx);
                                  }}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </Badge>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {satirlar.slice(0, 50).map((satir, idx) => (
                    <tr key={idx} className="border-b border-kenarlik/50 hover:bg-yuzey/50">
                      <td className="px-3 py-1.5 text-xs text-metin-pasif">{idx + 1}</td>
                      {kolonlar.map((_, kIdx) => (
                        <td key={kIdx} className="px-3 py-1.5 text-metin-ikinci truncate max-w-[200px]">
                          {satir[kIdx.toString()] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {satirlar.length > 50 && (
                <div className="px-4 py-2 text-sm text-metin-pasif text-center border-t border-kenarlik">
                  {t("ice-aktar.ilk-50-satir")} {t("genel.toplam")}: {satirlar.length} {t("ice-aktar.satir")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigasyon */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setAdim("yukle")}>
              <ArrowLeft className="h-4 w-4" /> {t("genel.geri-don")}
            </Button>
            <Button onClick={() => setAdim("onizle")} disabled={!zorunluTamam}>
              {t("ice-aktar.adim-onizle")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* ── ADIM 3: Önizle ──────────────────── */}
      {adim === "onizle" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("ice-aktar.aktarim-ozeti")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-yuzey p-4 text-center">
                  <div className="text-3xl font-bold text-metin">{satirlar.length}</div>
                  <div className="text-sm text-metin-ikinci mt-1">{t("ice-aktar.toplam-satir")}</div>
                </div>
                <div className="rounded-lg bg-yuzey p-4 text-center">
                  <div className="text-3xl font-bold text-birincil">{Object.keys(eslestirme).length}</div>
                  <div className="text-sm text-metin-ikinci mt-1">{t("ice-aktar.eslesmis-alan")}</div>
                </div>
                <div className="rounded-lg bg-yuzey p-4 text-center">
                  <div className="text-3xl font-bold text-metin">{t(`cari.tip-${firmaTuru}`)}</div>
                  <div className="text-sm text-metin-ikinci mt-1">{t("cari.tip")}</div>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-semibold text-metin mb-2">{t("ice-aktar.eslestirme-haritasi")}</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(eslestirme).map(([excelIdx, cariAlan]) => {
                    const alan = importAlanlari.find((a) => a.anahtar === cariAlan);
                    return (
                      <div key={excelIdx} className="flex items-center gap-1.5 rounded-lg border border-kenarlik px-3 py-1.5 text-sm">
                        <span className="text-metin-ikinci">{kolonlar[Number(excelIdx)]}</span>
                        <ArrowRight className="h-3 w-3 text-metin-pasif" />
                        <span className="font-medium text-birincil">{alan?.etiket ?? cariAlan}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigasyon */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setAdim("esle")}>
              <ArrowLeft className="h-4 w-4" /> {t("genel.geri-don")}
            </Button>
            <Button onClick={aktarimiBaslat} disabled={aktariyor}>
              {aktariyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {aktariyor ? t("ice-aktar.aktariliyor") : `${satirlar.length} ${t("ice-aktar.cariyi-aktar")}`}
            </Button>
          </div>
        </>
      )}

      {/* ── ADIM 4: Sonuç ──────────────────── */}
      {adim === "sonuc" && sonuc && (
        <>
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center">
                {sonuc.hatali === 0 ? (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                    <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
                    <AlertTriangle className="h-10 w-10 text-amber-600 dark:text-amber-400" />
                  </div>
                )}
                <h2 className="text-xl font-semibold text-metin">
                  {sonuc.hatali === 0 ? t("ice-aktar.tamamlandi") : t("ice-aktar.kismen-tamamlandi")}
                </h2>
                <div className="mt-4 flex gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">{sonuc.basarili}</div>
                    <div className="text-sm text-metin-ikinci">{t("genel.basarili")}</div>
                  </div>
                  {sonuc.hatali > 0 && (
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600 dark:text-red-400">{sonuc.hatali}</div>
                      <div className="text-sm text-metin-ikinci">{t("ice-aktar.hatali")}</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hata detayları */}
          {sonuc.hatalar.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="h-4 w-4" /> {t("ice-aktar.hatali-kayitlar")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sonuc.hatalar.map((hata, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-lg bg-red-50 dark:bg-red-900/10 px-4 py-2 text-sm">
                      <span className="font-mono text-red-600 dark:text-red-400">{t("ice-aktar.satir")} {hata.satirIndex + 1}</span>
                      <span className="text-metin-ikinci">{hata.mesaj}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link to="/cari/liste">{t("cari.listeye-don")}</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAdim("yukle");
                setSatirlar([]);
                setKolonlar([]);
                setEslestirme({});
                setSonuc(null);
              }}
            >
              {t("ice-aktar.yeni-aktarim")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
