import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  History,
  Store,
  Star,
  X,
  ArrowUp,
  ArrowDown,
  Package,
  TrendingUp,
  TrendingDown,
  Info,
  ClipboardCheck,
  PackageOpen,
  Pencil,
  Check,
  Truck,
  XCircle,
} from "lucide-react";
import { SayimWizardModal } from "@/components/urun/SayimWizardModal";
import { DevirWizardModal } from "@/components/urun/DevirWizardModal";
import { VirmanWizardModal } from "@/components/urun/VirmanWizardModal";
import { Input } from "@/components/ui/input";
import { useOnay } from "@/components/ortak/OnayDialog";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Tipler
// ────────────────────────────────────────────────────────────

interface VaryantOzet {
  id: string;
  sku: string;
  barkod: string | null;
  varyantAd: string | null;
  varsayilanMi: boolean;
  eksenKombinasyon: Record<string, string>;
  paraBirimiKod: string;
  kritikStok: string | null;
}

interface MagazaOzet {
  id: string;
  ad: string;
}

interface StokSatiri {
  urunVaryantId: string;
  magazaId: string;
  mevcutMiktar: string;
  rezerveMiktar: string;
  yoldaGelenMiktar: string;
  ortalamaMaliyet: string | null;
  sonAlisFiyati: string | null;
  sonAlisTarihi: string | null;
  sonAlisParaBirimi: string | null;
  sonGirisTarihi: string | null;
  sonCikisTarihi: string | null;
  sonSayimTarihi: string | null;
  kritikStok: string | null;
}

interface StokOzetCevap {
  varyantlar: VaryantOzet[];
  magazalar: MagazaOzet[];
  stoklar: StokSatiri[];
}

interface Hareket {
  id: string;
  hareketTipi: string;
  girisMiktar: string;
  cikisMiktar: string;
  oncesiMiktar: string;
  sonrasiMiktar: string;
  birimMaliyet: string | null;
  paraBirimiKod: string | null;
  kaynakBelgeTipi: string | null;
  kaynakBelgeId: string | null;
  aciklama: string | null;
  kullaniciId: string | null;
  olusturmaTarihi: string;
}

interface SubeStokPaneliOzellik {
  urunId: string | null;
}

// ────────────────────────────────────────────────────────────
// Yardımcı
// ────────────────────────────────────────────────────────────

function varyantAd(v: VaryantOzet): string {
  const komb = Object.values(v.eksenKombinasyon ?? {});
  if (komb.length > 0) return komb.join(" / ");
  return v.varyantAd ?? v.sku;
}

function sayi(val: string | null | undefined): number {
  if (val === null || val === undefined || val === "") return 0;
  return Number(val);
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function SubeStokPaneli({ urunId }: SubeStokPaneliOzellik) {
  const { t, i18n } = useTranslation();
  const sayiFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const paraFormat = (deger: string | null, para: string | null) => {
    if (!deger) return "—";
    return `${sayiFormat.format(Number(deger))} ${para ?? ""}`.trim();
  };

  const [ozet, setOzet] = useState<StokOzetCevap | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [genisVaryantlar, setGenisVaryantlar] = useState<Set<string>>(new Set());

  // Hareketler drawer
  const [hareketDrawer, setHareketDrawer] = useState<{
    varyantId: string;
    magazaId: string;
    varyantAd: string;
    magazaAd: string;
  } | null>(null);

  const onay = useOnay();

  // Sayım + Devir + Virman modalları
  const [sayimAcik, setSayimAcik] = useState(false);
  const [devirAcik, setDevirAcik] = useState(false);
  const [virmanAcik, setVirmanAcik] = useState(false);

  // Yolda transferler
  const [yoldaTransferler, setYoldaTransferler] = useState<any[]>([]);
  const [transferIslemde, setTransferIslemde] = useState<string | null>(null);

  // Ortalama maliyet inline edit state
  const [maliyetEditKey, setMaliyetEditKey] = useState<string | null>(null);
  const [maliyetDeger, setMaliyetDeger] = useState("");
  const [maliyetAciklama, setMaliyetAciklama] = useState("");
  const [maliyetKaydediyor, setMaliyetKaydediyor] = useState(false);

  const yukle = useCallback(async () => {
    if (!urunId) return;
    setYukleniyor(true);
    try {
      const [stokRes, transferRes] = await Promise.all([
        apiIstemci.get<StokOzetCevap>(`/urun/${urunId}/stok`),
        apiIstemci.get<{ veriler: any[] }>(`/urun/${urunId}/transfer?durum=yolda&boyut=20`),
      ]);
      setOzet(stokRes.data);
      setYoldaTransferler(transferRes.data.veriler ?? []);
      // İlk varyantı default açık yap
      if (stokRes.data.varyantlar.length > 0 && genisVaryantlar.size === 0) {
        setGenisVaryantlar(new Set([stokRes.data.varyantlar[0].id]));
      }
    } catch {
      toast.hata(t("urun.stok-yuklenemedi"));
    }
    setYukleniyor(false);
  }, [urunId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  // Yeni ürün modu
  if (!urunId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-kenarlik rounded-lg">
        <AlertTriangle className="h-12 w-12 text-amber-500 mb-3" />
        <h3 className="font-medium text-metin">{t("urun.stok-once-kaydet-baslik")}</h3>
        <p className="text-sm text-metin-ikinci mt-1 max-w-md">{t("urun.stok-once-kaydet")}</p>
      </div>
    );
  }

  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
      </div>
    );
  }

  if (!ozet || ozet.varyantlar.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-metin-pasif">
        <Package className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-sm">{t("urun.stok-varyant-yok")}</p>
      </div>
    );
  }

  const varyantToggle = (id: string) => {
    const yeni = new Set(genisVaryantlar);
    if (yeni.has(id)) yeni.delete(id); else yeni.add(id);
    setGenisVaryantlar(yeni);
  };

  const varyantStoklari = (varyantId: string) =>
    ozet.stoklar.filter((s) => s.urunVaryantId === varyantId);

  const toplamMevcut = (varyantId: string) =>
    varyantStoklari(varyantId).reduce((t, s) => t + sayi(s.mevcutMiktar), 0);

  const toplamRezerve = (varyantId: string) =>
    varyantStoklari(varyantId).reduce((t, s) => t + sayi(s.rezerveMiktar), 0);

  const magazaAd = (id: string) =>
    ozet.magazalar.find((m) => m.id === id)?.ad ?? "—";

  const maliyetEditAc = (varyantId: string, magazaId: string, mevcut: string | null) => {
    setMaliyetEditKey(`${varyantId}_${magazaId}`);
    setMaliyetDeger(mevcut ?? "");
    setMaliyetAciklama("");
  };

  const maliyetKaydet = async (varyantId: string, magazaId: string) => {
    const yeni = Number(maliyetDeger);
    if (isNaN(yeni) || yeni < 0) {
      toast.hata(t("urun.maliyet-gecersiz"));
      return;
    }
    if (!maliyetAciklama.trim()) {
      toast.hata(t("urun.maliyet-aciklama-zorunlu"));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("urun.maliyet-onay-baslik"),
      mesaj: t("urun.maliyet-onay-mesaj", { yeni: yeni.toString() }),
      varyant: "uyari",
      onayMetni: t("urun.maliyet-onay-btn"),
    });
    if (!tamam) return;

    setMaliyetKaydediyor(true);
    try {
      await apiIstemci.patch(`/urun/${urunId}/stok/ortalama-maliyet`, {
        urunVaryantId: Number(varyantId),
        magazaId: Number(magazaId),
        yeniMaliyet: yeni,
        aciklama: maliyetAciklama.trim(),
      });
      toast.basarili(t("urun.maliyet-basarili"));
      setMaliyetEditKey(null);
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
    }
    setMaliyetKaydediyor(false);
  };

  return (
    <div className="space-y-4">
      {/* Bilgi kartı + aksiyonlar */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 md:p-4 flex flex-col md:flex-row items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-metin-ikinci flex-1">
          <p className="font-medium text-metin mb-1">{t("urun.stok-disiplini-baslik")}</p>
          <p>{t("urun.stok-disiplini-aciklama")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full md:w-auto shrink-0">
          <Button
            variant="outline"
            onClick={() => setDevirAcik(true)}
            className="min-h-[44px] sm:min-h-[36px]"
          >
            <PackageOpen className="h-4 w-4" />
            {t("urun.devir-baslat")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setVirmanAcik(true)}
            className="min-h-[44px] sm:min-h-[36px]"
          >
            <Truck className="h-4 w-4" />
            {t("urun.virman-baslat")}
          </Button>
          <Button
            onClick={() => setSayimAcik(true)}
            className="min-h-[44px] sm:min-h-[36px]"
          >
            <ClipboardCheck className="h-4 w-4" />
            {t("urun.sayim-baslat")}
          </Button>
        </div>
      </div>

      {/* Yolda transferler */}
      {yoldaTransferler.length > 0 && (
        <div className="rounded-lg border border-blue-500/40 bg-blue-500/5 overflow-hidden">
          <div className="px-3 md:px-4 py-2 border-b border-blue-500/20 bg-blue-500/10 flex items-center gap-2">
            <Truck className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-metin text-sm">
              {t("urun.virman-yolda-baslik", { sayi: yoldaTransferler.length })}
            </span>
          </div>
          <div className="divide-y divide-blue-500/20">
            {yoldaTransferler.map((tr) => {
              const kaynakAd = ozet.magazalar.find((m) => m.id === String(tr.kaynakMagazaId))?.ad ?? "—";
              const hedefAd = ozet.magazalar.find((m) => m.id === String(tr.hedefMagazaId))?.ad ?? "—";
              const toplamMiktar = (tr.kalemler ?? []).reduce(
                (a: number, k: any) => a + Number(k.gonderilenMiktar ?? 0),
                0,
              );
              return (
                <div key={tr.id} className="p-3 md:p-4 flex items-start justify-between gap-3 flex-col sm:flex-row">
                  <div className="min-w-0 flex-1 w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-metin">{tr.transferNo}</span>
                      <span className="text-sm text-metin-ikinci">
                        {kaynakAd}
                      </span>
                      <ArrowUp className="h-3 w-3 rotate-90 text-metin-pasif" />
                      <span className="text-sm text-metin-ikinci">{hedefAd}</span>
                    </div>
                    <div className="text-xs text-metin-pasif mt-1 flex items-center gap-3 flex-wrap tabular-nums">
                      <span>{(tr.kalemler ?? []).length} {t("urun.virman-kalem")}</span>
                      <span>{sayiFormat.format(toplamMiktar)} {t("urun.virman-adet")}</span>
                      {tr.gonderimTarihi && (
                        <span>{new Date(tr.gonderimTarihi).toLocaleDateString(i18n.language)}</span>
                      )}
                      {tr.kargoFirma && <span>· {tr.kargoFirma}</span>}
                      {tr.kargoTakipNo && <span>· {tr.kargoTakipNo}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const tamam = await onay.goster({
                          baslik: t("urun.virman-iptal-baslik"),
                          mesaj: t("urun.virman-iptal-mesaj", { no: tr.transferNo }),
                          varyant: "tehlike",
                          onayMetni: t("urun.virman-iptal-btn"),
                        });
                        if (!tamam) return;
                        setTransferIslemde(tr.id);
                        try {
                          await apiIstemci.patch(`/urun/${urunId}/transfer/${tr.id}/iptal`, {
                            aciklama: "Yoldan iptal edildi",
                          });
                          toast.basarili(t("urun.virman-iptal-basarili"));
                          await yukle();
                        } catch (err: any) {
                          toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
                        }
                        setTransferIslemde(null);
                      }}
                      disabled={transferIslemde === tr.id}
                      className="min-h-[40px]"
                    >
                      {transferIslemde === tr.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="hidden sm:inline">{t("urun.virman-iptal")}</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        const tamam = await onay.goster({
                          baslik: t("urun.virman-teslim-baslik"),
                          mesaj: t("urun.virman-teslim-mesaj", { no: tr.transferNo }),
                          varyant: "bilgi",
                          onayMetni: t("urun.virman-teslim-btn"),
                        });
                        if (!tamam) return;
                        setTransferIslemde(tr.id);
                        try {
                          await apiIstemci.patch(`/urun/${urunId}/transfer/${tr.id}/teslim-al`, {});
                          toast.basarili(t("urun.virman-teslim-basarili"));
                          await yukle();
                        } catch (err: any) {
                          toast.hata(err?.response?.data?.hata?.mesaj ?? t("genel.hata"));
                        }
                        setTransferIslemde(null);
                      }}
                      disabled={transferIslemde === tr.id}
                      className="min-h-[40px]"
                    >
                      {transferIslemde === tr.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {t("urun.virman-teslim")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Varyant listesi — her biri collapsible */}
      {ozet.varyantlar.map((v) => {
        const acik = genisVaryantlar.has(v.id);
        const mevcut = toplamMevcut(v.id);
        const rezerve = toplamRezerve(v.id);
        const paraBirimi = v.paraBirimiKod;
        return (
          <div
            key={v.id}
            className={cn(
              "rounded-lg border bg-arkaplan overflow-hidden",
              v.varsayilanMi ? "border-birincil/40" : "border-kenarlik",
            )}
          >
            {/* Varyant başlık — tıklanabilir */}
            <button
              type="button"
              onClick={() => varyantToggle(v.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 md:p-4 text-left transition-colors",
                "hover:bg-yuzey/50 active:bg-yuzey",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {v.varsayilanMi && (
                    <Badge className="bg-birincil text-white text-[10px]">
                      <Star className="h-2.5 w-2.5" />
                      {t("urun.varsayilan")}
                    </Badge>
                  )}
                  <span className="font-mono text-sm text-metin">{v.sku}</span>
                  <span className="text-sm text-metin-ikinci">— {varyantAd(v)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm">
                  <span className="text-metin">
                    {t("urun.stok-toplam")}: <strong className="tabular-nums">{sayiFormat.format(mevcut)}</strong>
                  </span>
                  {rezerve > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {t("urun.stok-rezerve")}: <span className="tabular-nums">{sayiFormat.format(rezerve)}</span>
                    </span>
                  )}
                </div>
              </div>
              {acik ? <ArrowUp className="h-4 w-4 text-metin-pasif shrink-0" /> : <ArrowDown className="h-4 w-4 text-metin-pasif shrink-0" />}
            </button>

            {/* Detay tablosu */}
            {acik && (
              <div className="border-t border-kenarlik overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-yuzey/50 text-left">
                      <th className="px-3 md:px-4 py-2 font-medium text-metin-ikinci text-xs uppercase">
                        {t("urun.stok-magaza")}
                      </th>
                      <th className="px-3 md:px-4 py-2 font-medium text-metin-ikinci text-xs uppercase text-right">
                        {t("urun.stok-mevcut")}
                      </th>
                      <th className="px-3 md:px-4 py-2 font-medium text-metin-ikinci text-xs uppercase text-right hidden sm:table-cell">
                        {t("urun.stok-rezerve-kisa")}
                      </th>
                      <th className="px-3 md:px-4 py-2 font-medium text-metin-ikinci text-xs uppercase text-right hidden md:table-cell">
                        {t("urun.stok-yolda")}
                      </th>
                      <th className="px-3 md:px-4 py-2 font-medium text-metin-ikinci text-xs uppercase text-right hidden md:table-cell">
                        {t("urun.stok-ortalama-maliyet")}
                      </th>
                      <th className="px-3 md:px-4 py-2 font-medium text-metin-ikinci text-xs uppercase text-right hidden lg:table-cell">
                        {t("urun.stok-son-alis")}
                      </th>
                      <th className="px-3 md:px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {varyantStoklari(v.id).map((s) => {
                      const stokMiktar = sayi(s.mevcutMiktar);
                      const kritik = s.kritikStok ? sayi(s.kritikStok) : 0;
                      const kritikte = kritik > 0 && stokMiktar <= kritik && stokMiktar > 0;
                      const tukenmis = stokMiktar === 0;
                      return (
                        <tr key={`${s.urunVaryantId}_${s.magazaId}`} className="border-t border-kenarlik">
                          <td className="px-3 md:px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Store className="h-3.5 w-3.5 text-metin-pasif" />
                              <span className="text-metin">{magazaAd(s.magazaId)}</span>
                            </div>
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right tabular-nums">
                            {tukenmis ? (
                              <Badge variant="danger" className="text-[10px]">
                                {t("urun.tukendi")}
                              </Badge>
                            ) : kritikte ? (
                              <Badge variant="warning" className="text-[10px] tabular-nums">
                                {sayiFormat.format(stokMiktar)}
                              </Badge>
                            ) : (
                              <span className="font-medium text-metin">{sayiFormat.format(stokMiktar)}</span>
                            )}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right hidden sm:table-cell tabular-nums">
                            {sayi(s.rezerveMiktar) > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {sayiFormat.format(sayi(s.rezerveMiktar))}
                              </span>
                            ) : (
                              <span className="text-metin-pasif">—</span>
                            )}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right hidden md:table-cell tabular-nums">
                            {sayi(s.yoldaGelenMiktar) > 0 ? (
                              <span className="text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                {sayiFormat.format(sayi(s.yoldaGelenMiktar))}
                              </span>
                            ) : (
                              <span className="text-metin-pasif">—</span>
                            )}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right hidden md:table-cell tabular-nums">
                            {maliyetEditKey === `${s.urunVaryantId}_${s.magazaId}` ? (
                              <div className="flex flex-col gap-1">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  min="0"
                                  value={maliyetDeger}
                                  onChange={(e) => setMaliyetDeger(e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  className="text-right text-sm tabular-nums min-h-[36px]"
                                  autoFocus
                                />
                                <Input
                                  value={maliyetAciklama}
                                  onChange={(e) => setMaliyetAciklama(e.target.value)}
                                  placeholder={t("urun.maliyet-sebep-ph")}
                                  className="text-sm min-h-[36px]"
                                />
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => maliyetKaydet(s.urunVaryantId, s.magazaId)}
                                    disabled={maliyetKaydediyor}
                                    className="flex-1"
                                  >
                                    {maliyetKaydediyor ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setMaliyetEditKey(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="group flex items-center justify-end gap-1">
                                <span className="text-metin-ikinci">
                                  {paraFormat(s.ortalamaMaliyet, paraBirimi)}
                                </span>
                                {Number(s.mevcutMiktar) > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => maliyetEditAc(s.urunVaryantId, s.magazaId, s.ortalamaMaliyet)}
                                    className="opacity-0 group-hover:opacity-100 md:opacity-0 transition-opacity h-6 w-6"
                                    title={t("urun.maliyet-duzelt")}
                                  >
                                    <Pencil className="h-3 w-3 text-metin-pasif" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right hidden lg:table-cell tabular-nums">
                            <span className="text-metin-ikinci text-xs">
                              {paraFormat(s.sonAlisFiyati, s.sonAlisParaBirimi ?? paraBirimi)}
                            </span>
                          </td>
                          <td className="px-3 md:px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setHareketDrawer({
                                  varyantId: v.id,
                                  magazaId: s.magazaId,
                                  varyantAd: varyantAd(v),
                                  magazaAd: magazaAd(s.magazaId),
                                })
                              }
                              title={t("urun.stok-hareketleri")}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Hareketler Drawer */}
      {hareketDrawer && (
        <StokHareketDrawer
          urunId={urunId}
          varyantId={hareketDrawer.varyantId}
          magazaId={hareketDrawer.magazaId}
          varyantAd={hareketDrawer.varyantAd}
          magazaAd={hareketDrawer.magazaAd}
          kapat={() => setHareketDrawer(null)}
        />
      )}

      {/* Sayım Wizard */}
      <SayimWizardModal
        acik={sayimAcik}
        kapat={() => setSayimAcik(false)}
        urunId={urunId}
        onKaydet={() => void yukle()}
      />

      {/* Devir Wizard */}
      <DevirWizardModal
        acik={devirAcik}
        kapat={() => setDevirAcik(false)}
        urunId={urunId}
        onKaydet={() => void yukle()}
      />

      {/* Virman Wizard */}
      <VirmanWizardModal
        acik={virmanAcik}
        kapat={() => setVirmanAcik(false)}
        urunId={urunId}
        onKaydet={() => void yukle()}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Hareket Drawer
// ────────────────────────────────────────────────────────────

interface DrawerOzellik {
  urunId: string;
  varyantId: string;
  magazaId: string;
  varyantAd: string;
  magazaAd: string;
  kapat: () => void;
}

function StokHareketDrawer({ urunId, varyantId, magazaId, varyantAd, magazaAd, kapat }: DrawerOzellik) {
  const { t, i18n } = useTranslation();
  const sayiFormat = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const tarihFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    apiIstemci
      .get<{ veriler: Hareket[]; meta: { toplam: number } }>(
        `/urun/${urunId}/varyant/${varyantId}/stok-hareket?magazaId=${magazaId}&boyut=100`,
      )
      .then((res) => setHareketler(res.data.veriler))
      .catch(() => toast.hata(t("genel.hata")))
      .finally(() => setYukleniyor(false));
  }, [urunId, varyantId, magazaId]);

  const tipEtiket = (tip: string) => {
    const map: Record<string, { label: string; renk: string; ikon: React.ReactNode }> = {
      giris: { label: t("urun.hareket-giris"), renk: "text-green-600", ikon: <TrendingUp className="h-3.5 w-3.5" /> },
      cikis: { label: t("urun.hareket-cikis"), renk: "text-red-600", ikon: <TrendingDown className="h-3.5 w-3.5" /> },
      sayim: { label: t("urun.hareket-sayim"), renk: "text-amber-600", ikon: <Package className="h-3.5 w-3.5" /> },
      transfer_giris: { label: t("urun.hareket-transfer-giris"), renk: "text-blue-600", ikon: <TrendingUp className="h-3.5 w-3.5" /> },
      transfer_cikis: { label: t("urun.hareket-transfer-cikis"), renk: "text-blue-600", ikon: <TrendingDown className="h-3.5 w-3.5" /> },
      iade: { label: t("urun.hareket-iade"), renk: "text-purple-600", ikon: <TrendingUp className="h-3.5 w-3.5" /> },
      devir: { label: t("urun.hareket-devir"), renk: "text-gray-600", ikon: <History className="h-3.5 w-3.5" /> },
    };
    return map[tip] ?? { label: tip, renk: "text-metin", ikon: <History className="h-3.5 w-3.5" /> };
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={kapat} />
      <div className="relative w-full max-w-2xl bg-arkaplan shadow-xl flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-kenarlik px-4 md:px-6 py-3 md:py-4">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-metin truncate">
              {t("urun.stok-hareket-baslik")}
            </h2>
            <p className="text-xs md:text-sm text-metin-ikinci truncate mt-0.5">
              {varyantAd} · {magazaAd}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={kapat} className="shrink-0 h-10 w-10">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : hareketler.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-metin-pasif">
              <History className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">{t("urun.hareket-yok")}</p>
              <p className="text-xs mt-1">{t("urun.hareket-yok-aciklama")}</p>
            </div>
          ) : (
            <div className="divide-y divide-kenarlik">
              {hareketler.map((h) => {
                const tip = tipEtiket(h.hareketTipi);
                const giris = sayi(h.girisMiktar);
                const cikis = sayi(h.cikisMiktar);
                return (
                  <div key={h.id} className="p-3 md:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1", tip.renk)}>
                          {tip.ikon}
                          <span className="font-medium text-[15px] sm:text-sm">{tip.label}</span>
                        </span>
                        {h.kaynakBelgeTipi && (
                          <Badge variant="outline" className="text-[10px]">
                            {h.kaynakBelgeTipi}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-metin-pasif whitespace-nowrap">
                        {tarihFormat.format(new Date(h.olusturmaTarihi))}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
                      {giris > 0 && (
                        <span className="text-green-700 dark:text-green-400 tabular-nums">
                          +{sayiFormat.format(giris)}
                        </span>
                      )}
                      {cikis > 0 && (
                        <span className="text-red-700 dark:text-red-400 tabular-nums">
                          -{sayiFormat.format(cikis)}
                        </span>
                      )}
                      <span className="text-xs text-metin-ikinci tabular-nums">
                        {sayiFormat.format(sayi(h.oncesiMiktar))} → {sayiFormat.format(sayi(h.sonrasiMiktar))}
                      </span>
                      {h.birimMaliyet && (
                        <span className="text-xs text-metin-pasif tabular-nums">
                          @ {sayiFormat.format(sayi(h.birimMaliyet))} {h.paraBirimiKod ?? ""}
                        </span>
                      )}
                    </div>
                    {h.aciklama && (
                      <p className="mt-1 text-sm text-metin-ikinci">{h.aciklama}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
