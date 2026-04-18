import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Power,
  Upload,
  Tag,
  Store,
  Users,
  Sparkles,
  Flame,
  Eye,
  Filter,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { ParaTutar } from "@/components/ortak/ParaTutar";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { UrunFormDrawer } from "@/components/urun/UrunFormDrawer";

export const Route = createFileRoute("/_yetkili/urun/liste")({
  component: UrunListe,
});

// ────────────────────────────────────────────────────────────
// Tip tanimlari (API response yapisina uygun)
// ────────────────────────────────────────────────────────────

interface FiyatListeVaryant {
  fiyat: string;
  listeFiyati: string | null;
}

interface VaryantStok {
  mevcutMiktar: string;
  rezerveMiktar: string;
  magazaId: string;
}

interface UrunVaryantOzet {
  id: string;
  sku: string;
  barkod: string | null;
  alisFiyati: string | null;
  sonAlisFiyati: string | null;
  satilabilirSonFiyat: string | null;
  kritikStok: string | null;
  paraBirimiKod: string;
  fiyatListeVaryantlar: FiyatListeVaryant[];
  stoklar: VaryantStok[];
}

interface Urun {
  id: string;
  publicId: string;
  kod: string;
  ad: string;
  kisaAciklama: string | null;
  tip: string;
  kategoriId: string | null;
  markaId: string | null;
  anaResimUrl: string | null;
  stokTakibi: boolean;
  aktifMi: boolean;
  eticaretAktif: boolean;
  b2bAktif: boolean;
  pazaryeriAktif: boolean;
  vitrindeGoster: boolean;
  firsatUrun: boolean;
  yeniUrun: boolean;
  primVarYok: boolean;
  ucretsizKargo: boolean;
  sira: number;
  kategori: { id: string; ad: string } | null;
  marka: { id: string; ad: string } | null;
  markaModel: { id: string; ad: string } | null;
  varyantlar: UrunVaryantOzet[];
}

interface UrunListeCevap {
  veriler: Urun[];
  meta: { toplam: number; sayfa: number; boyut: number };
}

interface KategoriSecim {
  id: string;
  ad: string;
}

interface MarkaSecim {
  id: string;
  ad: string;
}

// ────────────────────────────────────────────────────────────
// Yardimci fonksiyonlar
// ────────────────────────────────────────────────────────────

const SAYFA_BOYUT = 20;

function satisFiyati(u: Urun): number | null {
  const v = u.varyantlar[0];
  if (!v) return null;
  const fl = v.fiyatListeVaryantlar[0];
  return fl ? Number(fl.fiyat) : null;
}

function alisFiyati(u: Urun): number | null {
  const v = u.varyantlar[0];
  return v?.alisFiyati ? Number(v.alisFiyati) : null;
}

function toplamStok(u: Urun): number {
  const v = u.varyantlar[0];
  if (!v) return 0;
  return v.stoklar.reduce((t, s) => t + Number(s.mevcutMiktar), 0);
}

function kritikMi(u: Urun): boolean {
  const v = u.varyantlar[0];
  if (!v || !v.kritikStok) return false;
  return toplamStok(u) <= Number(v.kritikStok) && toplamStok(u) > 0;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

function UrunListe() {
  const { t, i18n } = useTranslation();
  const onay = useOnay();
  const sayiFormat = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2 });

  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [toplam, setToplam] = useState(0);
  const [sayfa, setSayfa] = useState(1);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Filtreler
  const [arama, setArama] = useState("");
  const [aramaGecikme, setAramaGecikme] = useState("");
  const [kategoriFiltre, setKategoriFiltre] = useState("");
  const [markaFiltre, setMarkaFiltre] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<string>("true");
  const [eticaretFiltre, setEticaretFiltre] = useState<string>("");
  const [b2bFiltre, setB2bFiltre] = useState<string>("");
  const [bayrakFiltre, setBayrakFiltre] = useState<string>(""); // '', 'yeni', 'firsat', 'vitrin'
  const [siralama, setSiralama] = useState<string>("sira-asc");
  const [gelismisFiltreAcik, setGelismisFiltreAcik] = useState(false);

  // Secim (toplu islem)
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set());

  // Drawer state
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [duzenlenecekUrunId, setDuzenlenecekUrunId] = useState<string | null>(null);

  // Dropdown kaynaklari
  const [kategoriler, setKategoriler] = useState<KategoriSecim[]>([]);
  const [markalar, setMarkalar] = useState<MarkaSecim[]>([]);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const params: Record<string, string | number> = {
        sayfa,
        boyut: SAYFA_BOYUT,
        siralama,
      };
      if (aramaGecikme) params.arama = aramaGecikme;
      if (durumFiltre) params.aktifMi = durumFiltre;
      if (kategoriFiltre) params.kategoriId = Number(kategoriFiltre);
      if (markaFiltre) params.markaId = Number(markaFiltre);
      if (eticaretFiltre) params.eticaretAktif = eticaretFiltre;
      if (b2bFiltre) params.b2bAktif = b2bFiltre;
      if (bayrakFiltre === "yeni") params.yeniUrun = "true";
      if (bayrakFiltre === "firsat") params.firsatUrun = "true";
      if (bayrakFiltre === "vitrin") params.vitrindeGoster = "true";

      const res = await apiIstemci.get<UrunListeCevap>("/urun", { params });
      setUrunler(res.data.veriler);
      setToplam(res.data.meta.toplam);
      setSeciliIds(new Set()); // sayfa/filtre degisiminde secimi sifirla
    } catch {
      toast.hata(t("urun.yuklenemedi"));
    }
    setYukleniyor(false);
  }, [sayfa, aramaGecikme, durumFiltre, kategoriFiltre, markaFiltre, eticaretFiltre, b2bFiltre, bayrakFiltre, siralama]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Kategori + Marka yukle (tek seferlik)
  useEffect(() => {
    apiIstemci
      .get<{ veriler: KategoriSecim[] } | KategoriSecim[]>("/kategori", { params: { boyut: 200 } })
      .then((res) => {
        const liste = Array.isArray(res.data) ? res.data : res.data.veriler;
        setKategoriler(liste);
      })
      .catch(() => {});
    apiIstemci
      .get<{ veriler: MarkaSecim[] } | MarkaSecim[]>("/marka", { params: { boyut: 200 } })
      .then((res) => {
        const liste = Array.isArray(res.data) ? res.data : res.data.veriler;
        setMarkalar(liste);
      })
      .catch(() => {});
  }, []);

  // Debounce arama
  useEffect(() => {
    const zamanlayici = setTimeout(() => {
      setAramaGecikme(arama);
      setSayfa(1);
    }, 400);
    return () => clearTimeout(zamanlayici);
  }, [arama]);

  const toplamSayfa = Math.ceil(toplam / SAYFA_BOYUT);

  const aktiflikDegistir = async (u: Urun) => {
    if (u.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: u.ad }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/urun/${u.id}/aktiflik`);
      toast.basarili(`${u.ad} ${u.aktifMi ? t("genel.pasife-al").toLowerCase() : t("genel.aktif-et").toLowerCase()}`);
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const topluAktiflikDegistir = async (aktifMi: boolean) => {
    if (seciliIds.size === 0) return;
    const onayli = await onay.goster({
      baslik: aktifMi ? t("urun.toplu-aktif-baslik") : t("urun.toplu-pasif-baslik"),
      mesaj: t(aktifMi ? "urun.toplu-aktif-mesaj" : "urun.toplu-pasif-mesaj", { sayi: seciliIds.size }),
      varyant: aktifMi ? "bilgi" : "uyari",
      onayMetni: aktifMi ? t("genel.aktif-et") : t("genel.pasife-al"),
    });
    if (!onayli) return;

    try {
      const res = await apiIstemci.patch<{ etkilenen: number }>("/urun/toplu/aktiflik", {
        ids: Array.from(seciliIds).map((i) => Number(i)),
        aktifMi,
      });
      toast.basarili(t("urun.toplu-islem-basarili", { sayi: res.data.etkilenen }));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const tumunuSec = () => {
    if (seciliIds.size === urunler.length) {
      setSeciliIds(new Set());
    } else {
      setSeciliIds(new Set(urunler.map((u) => u.id)));
    }
  };

  const tekiliSec = (id: string) => {
    const yeni = new Set(seciliIds);
    if (yeni.has(id)) yeni.delete(id); else yeni.add(id);
    setSeciliIds(yeni);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("urun.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">
            {yukleniyor ? "..." : t("urun.toplam-kayit", { sayi: toplam })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled title={t("urun.ice-aktar-yakinda")}>
            <Upload />
            {t("urun.ice-aktar")}
          </Button>
          <Button
            onClick={() => {
              setDuzenlenecekUrunId(null);
              setDrawerAcik(true);
            }}
          >
            <Plus />
            {t("urun.yeni-ekle")}
          </Button>
        </div>
      </header>

      {/* ─── Filtre Kartı ─── */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="sr-only">{t("urun.liste-baslik")}</CardTitle>

            {/* Arama */}
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
              <Input
                placeholder={t("urun.arama-placeholder")}
                className="pl-9"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
              />
            </div>

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

            {/* Bayrak hizli filtre */}
            <div className="flex gap-1.5">
              {[
                { val: "", icon: null, label: t("genel.hepsi") },
                { val: "vitrin", icon: <Eye className="h-3 w-3" />, label: t("urun.vitrin") },
                { val: "yeni", icon: <Sparkles className="h-3 w-3" />, label: t("urun.yeni") },
                { val: "firsat", icon: <Flame className="h-3 w-3" />, label: t("urun.firsat") },
              ].map((b) => (
                <Button
                  key={b.val}
                  variant={bayrakFiltre === b.val ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setBayrakFiltre(b.val); setSayfa(1); }}
                >
                  {b.icon}
                  {b.label}
                </Button>
              ))}
            </div>

            {/* Gelismis filtre toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGelismisFiltreAcik((v) => !v)}
            >
              <Filter className="h-4 w-4" />
              {t("urun.gelismis-filtre")}
            </Button>

            {/* Siralama */}
            <select
              value={siralama}
              onChange={(e) => { setSiralama(e.target.value); setSayfa(1); }}
              className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm ml-auto"
            >
              <option value="sira-asc">{t("urun.siralama-sira")}</option>
              <option value="ad-asc">{t("urun.siralama-ad-asc")}</option>
              <option value="ad-desc">{t("urun.siralama-ad-desc")}</option>
              <option value="kod-asc">{t("urun.siralama-kod-asc")}</option>
              <option value="kod-desc">{t("urun.siralama-kod-desc")}</option>
              <option value="yeni-once">{t("urun.siralama-yeni")}</option>
              <option value="eski-once">{t("urun.siralama-eski")}</option>
            </select>
          </div>

          {/* Gelismis filtre paneli */}
          {gelismisFiltreAcik && (
            <div className="flex items-center gap-3 flex-wrap border-t border-kenarlik pt-3">
              <select
                value={kategoriFiltre}
                onChange={(e) => { setKategoriFiltre(e.target.value); setSayfa(1); }}
                className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
              >
                <option value="">{t("urun.tum-kategoriler")}</option>
                {kategoriler.map((k) => (
                  <option key={k.id} value={k.id}>{k.ad}</option>
                ))}
              </select>

              <select
                value={markaFiltre}
                onChange={(e) => { setMarkaFiltre(e.target.value); setSayfa(1); }}
                className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
              >
                <option value="">{t("urun.tum-markalar")}</option>
                {markalar.map((m) => (
                  <option key={m.id} value={m.id}>{m.ad}</option>
                ))}
              </select>

              <select
                value={eticaretFiltre}
                onChange={(e) => { setEticaretFiltre(e.target.value); setSayfa(1); }}
                className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
              >
                <option value="">{t("urun.eticaret-hepsi")}</option>
                <option value="true">{t("urun.eticaret-aktif")}</option>
                <option value="false">{t("urun.eticaret-pasif")}</option>
              </select>

              <select
                value={b2bFiltre}
                onChange={(e) => { setB2bFiltre(e.target.value); setSayfa(1); }}
                className="rounded-md border border-kenarlik bg-arkaplan px-3 py-1.5 text-sm"
              >
                <option value="">{t("urun.b2b-hepsi")}</option>
                <option value="true">{t("urun.b2b-aktif")}</option>
                <option value="false">{t("urun.b2b-pasif")}</option>
              </select>

              {(kategoriFiltre || markaFiltre || eticaretFiltre || b2bFiltre) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKategoriFiltre("");
                    setMarkaFiltre("");
                    setEticaretFiltre("");
                    setB2bFiltre("");
                    setSayfa(1);
                  }}
                >
                  {t("genel.temizle")}
                </Button>
              )}
            </div>
          )}

          {/* Toplu islem cubugu */}
          {seciliIds.size > 0 && (
            <div className="flex items-center gap-2 bg-birincil/5 border border-birincil/20 rounded-md px-3 py-2">
              <span className="text-sm text-birincil font-medium">
                {t("urun.secili-sayi", { sayi: seciliIds.size })}
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => topluAktiflikDegistir(true)}>
                  {t("genel.aktif-et")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => topluAktiflikDegistir(false)}>
                  {t("genel.pasife-al")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSeciliIds(new Set())}>
                  {t("genel.iptal")}
                </Button>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : urunler.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
              <Package className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">{t("genel.kayit-bulunamadi")}</p>
              <p className="text-sm mt-1">
                {aramaGecikme ? `"${aramaGecikme}" ${t("genel.kayit-bulunamadi").toLowerCase()}` : t("urun.ilk-urun-ekle")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={seciliIds.size === urunler.length && urunler.length > 0}
                      onChange={tumunuSec}
                      className="rounded border-kenarlik"
                    />
                  </TableHead>
                  <TableHead>{t("urun.kod")}</TableHead>
                  <TableHead>{t("urun.ad")}</TableHead>
                  <TableHead>{t("urun.kategori-marka")}</TableHead>
                  <TableHead className="text-right">{t("urun.stok")}</TableHead>
                  <TableHead className="text-right">{t("urun.fiyat")}</TableHead>
                  <TableHead>{t("urun.kanallar")}</TableHead>
                  <TableHead>{t("genel.durum")}</TableHead>
                  <TableHead className="text-right">{t("genel.islem")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {urunler.map((u) => {
                  const stok = toplamStok(u);
                  const satis = satisFiyati(u);
                  const alis = alisFiyati(u);
                  const kritik = kritikMi(u);
                  const paraBirimi = u.varyantlar[0]?.paraBirimiKod ?? "TRY";
                  const secili = seciliIds.has(u.id);
                  return (
                    <TableRow key={u.id} className={cn("group", secili && "bg-birincil/5")}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={secili}
                          onChange={() => tekiliSec(u.id)}
                          className="rounded border-kenarlik"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-metin-ikinci text-xs">
                        {u.kod}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-yuzey overflow-hidden">
                            {u.anaResimUrl ? (
                              <img src={u.anaResimUrl} alt={u.ad} className="h-full w-full object-cover" />
                            ) : (
                              <Package className="h-5 w-5 text-metin-ikinci" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-metin truncate flex items-center gap-1.5">
                              {u.ad}
                              {u.yeniUrun && <Sparkles className="h-3 w-3 text-blue-500" aria-label={t("urun.yeni")} />}
                              {u.firsatUrun && <Flame className="h-3 w-3 text-orange-500" aria-label={t("urun.firsat")} />}
                              {u.vitrindeGoster && <Eye className="h-3 w-3 text-purple-500" aria-label={t("urun.vitrin")} />}
                            </div>
                            {u.varyantlar[0]?.barkod && (
                              <div className="text-[11px] text-metin-pasif font-mono">
                                {u.varyantlar[0].barkod}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-metin-ikinci">
                        <div>{u.kategori?.ad ?? "-"}</div>
                        <div className="text-[11px] text-metin-pasif">{u.marka?.ad ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {!u.stokTakibi ? (
                          <span className="text-xs text-metin-pasif">{t("urun.stok-takibi-yok")}</span>
                        ) : stok === 0 ? (
                          <Badge variant="danger">{t("urun.tukendi")}</Badge>
                        ) : kritik ? (
                          <Badge variant="warning">{stok}</Badge>
                        ) : (
                          <span className="tabular-nums">{stok}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {satis !== null ? (
                          <div>
                            <ParaTutar tutar={satis} paraBirimi={paraBirimi} />
                            {alis !== null && (
                              <div className="text-[11px] text-metin-pasif">
                                {t("urun.alis")}: {sayiFormat.format(alis)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-metin-pasif">{t("urun.fiyat-yok")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {u.eticaretAktif && (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" title={t("urun.eticaret-aktif")}>
                              <Store className="h-2.5 w-2.5" /> {t("urun.kanal-eticaret-kisa")}
                            </Badge>
                          )}
                          {u.b2bAktif && (
                            <Badge variant="outline" className="text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800" title={t("urun.b2b-aktif")}>
                              <Users className="h-2.5 w-2.5" /> {t("urun.kanal-b2b-kisa")}
                            </Badge>
                          )}
                          {u.pazaryeriAktif && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" title={t("urun.pazaryeri-aktif")}>
                              <Tag className="h-2.5 w-2.5" /> {t("urun.kanal-pazaryeri-kisa")}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DurumRozet durum={u.aktifMi ? "aktif" : "pasif"} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              setDuzenlenecekUrunId(u.id);
                              setDrawerAcik(true);
                            }}
                            title={t("urun.duzenle")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              aktiflikDegistir(u);
                            }}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination + Drawer */}
          {toplamSayfa > 1 && (
            <div className="flex items-center justify-between border-t border-kenarlik px-4 py-3">
              <p className="text-sm text-metin-ikinci">
                {(sayfa - 1) * SAYFA_BOYUT + 1}-{Math.min(sayfa * SAYFA_BOYUT, toplam)} / {toplam}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={sayfa === 1} onClick={() => setSayfa((s) => s - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={sayfa === toplamSayfa} onClick={() => setSayfa((s) => s + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ürün Form Drawer */}
      <UrunFormDrawer
        acik={drawerAcik}
        kapat={() => setDrawerAcik(false)}
        urunId={duzenlenecekUrunId}
        onKaydet={() => void yukle()}
      />
    </div>
  );
}
