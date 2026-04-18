/**
 * HesapGrupModal — Ödeme aracı gruplarını yönetmek için modal.
 * CRUD + ikon + renk seçimi.
 */
import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Power,
  Loader2,
  Banknote,
  Building2,
  CreditCard,
  Smartphone,
  Globe,
  Wallet,
  Landmark,
  FileText,
  ScrollText,
  ShoppingBag,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { useDrawerKapatma } from "@/hooks/use-drawer-kapatma";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { useFormHatalari } from "@/hooks/use-form-hatalari";
import { FormAlani } from "@/components/ortak/FormAlani";
import { cn } from "@/lib/utils";

interface Grup {
  id: string;
  kod: string;
  ad: string;
  aciklama: string | null;
  ikon: string | null;
  renk: string | null;
  sira: number;
  aktifMi: boolean;
  _count: { hesaplar: number };
}

// Kullanılabilir ikon listesi
const IKON_SECIM: Array<{ ad: string; bilesen: LucideIcon }> = [
  { ad: "Banknote", bilesen: Banknote },
  { ad: "Building2", bilesen: Building2 },
  { ad: "CreditCard", bilesen: CreditCard },
  { ad: "Smartphone", bilesen: Smartphone },
  { ad: "Globe", bilesen: Globe },
  { ad: "Wallet", bilesen: Wallet },
  { ad: "Landmark", bilesen: Landmark },
  { ad: "FileText", bilesen: FileText },
  { ad: "ScrollText", bilesen: ScrollText },
  { ad: "ShoppingBag", bilesen: ShoppingBag },
  { ad: "Package", bilesen: Package },
];

// Hazır renk paleti
const RENK_PALETI = [
  "#22C55E", "#3B82F6", "#A855F7", "#F59E0B", "#EC4899",
  "#06B6D4", "#14B8A6", "#F97316", "#8B5CF6", "#EF4444",
  "#6366F1", "#84CC16", "#78716C", "#64748B",
];

interface HesapGrupModalOzellik {
  acik: boolean;
  kapat: () => void;
  onDegisti?: () => void;
}

export function HesapGrupModal({ acik, kapat, onDegisti }: HesapGrupModalOzellik) {
  const { t } = useTranslation();
  const onay = useOnay();
  const [gruplar, setGruplar] = useState<Grup[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [form, setForm] = useState<Grup | null>(null);
  const [kaydediyor, setKaydediyor] = useState(false);
  const { dirty, baslangicAyarla, sifirla } = useDirtyForm(form);
  const { hatalar, hataAyarla, hataTemizle, temizle: hataTemizleHepsi } = useFormHatalari();
  const { guvenlikapat, drawerRef } = useDrawerKapatma({
    acik,
    kapat,
    mesgul: kaydediyor,
    dirty,
    onay,
  });

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const res = await apiIstemci.get<Grup[]>("/hesap-grup");
      setGruplar(res.data);
    } catch {
      toast.hata(t("genel.hata"));
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    if (acik) void yukle();
  }, [acik]);

  const yeniForm = () => {
    const bos: Grup = {
      id: "",
      kod: "",
      ad: "",
      aciklama: null,
      ikon: "Wallet",
      renk: RENK_PALETI[0],
      sira: gruplar.length + 1,
      aktifMi: true,
      _count: { hesaplar: 0 },
    };
    setForm(bos);
    baslangicAyarla(bos);
    hataTemizleHepsi();
  };

  const duzenle = (g: Grup) => {
    const kopya = { ...g };
    setForm(kopya);
    baslangicAyarla(kopya);
    hataTemizleHepsi();
  };

  const kaydet = async () => {
    if (!form) return;

    // Inline validation
    hataTemizleHepsi();
    let gecerli = true;
    if (!form.kod.trim()) {
      hataAyarla("kod", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    if (!form.ad.trim()) {
      hataAyarla("ad", t("genel.zorunlu-alan"));
      gecerli = false;
    }
    if (!gecerli) return;

    setKaydediyor(true);
    try {
      const veri = {
        kod: form.kod.trim(),
        ad: form.ad.trim(),
        aciklama: form.aciklama?.trim() || null,
        ikon: form.ikon ?? null,
        renk: form.renk ?? null,
        sira: form.sira,
      };
      if (form.id) {
        await apiIstemci.patch(`/hesap-grup/${form.id}`, veri);
        toast.basarili(t("hesap-grup.guncellendi"));
      } else {
        await apiIstemci.post("/hesap-grup", veri);
        toast.basarili(t("hesap-grup.olusturuldu"));
      }
      sifirla();
      setForm(null);
      await yukle();
      onDegisti?.();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? t("genel.hata");
      toast.hata(mesaj);
    }
    setKaydediyor(false);
  };

  const aktiflikDegistir = async (g: Grup) => {
    if (g.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: g.ad }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/hesap-grup/${g.id}/aktiflik`);
      await yukle();
      onDegisti?.();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const sil = async (g: Grup) => {
    if (g._count.hesaplar > 0) {
      toast.hata(t("hesap-grup.silme-engeli", { sayi: g._count.hesaplar }));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.sil-mesaj", { ad: g.ad }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    try {
      await apiIstemci.delete(`/hesap-grup/${g.id}`);
      toast.basarili(t("hesap-grup.silindi"));
      await yukle();
      onDegisti?.();
    } catch (err: any) {
      const mesaj = err?.response?.data?.hata?.mesaj ?? err?.response?.data?.mesaj ?? t("genel.hata");
      toast.hata(mesaj);
    }
  };

  if (!acik) return null;

  const ikonBilesen = (ad: string | null): LucideIcon => {
    const match = IKON_SECIM.find((i) => i.ad === ad);
    return match?.bilesen ?? Wallet;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={guvenlikapat} />
      <div ref={drawerRef} className="relative w-full max-w-3xl max-h-[90vh] bg-arkaplan rounded-lg shadow-xl flex flex-col">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-metin">{t("hesap-grup.baslik")}</h2>
            <p className="text-xs text-metin-ikinci mt-0.5">{t("hesap-grup.altyazi")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={guvenlikapat} disabled={kaydediyor}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Sol: Grup listesi */}
          <div className="w-1/2 border-r border-kenarlik flex flex-col">
            <div className="p-4 border-b border-kenarlik">
              <Button onClick={yeniForm} className="w-full" size="sm">
                <Plus className="h-4 w-4" /> {t("hesap-grup.yeni-grup")}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {yukleniyor ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-metin-pasif" />
                </div>
              ) : gruplar.length === 0 ? (
                <p className="text-sm text-metin-pasif py-8 text-center">
                  {t("hesap-grup.grup-yok")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {gruplar.map((g) => {
                    const Ikon = ikonBilesen(g.ikon);
                    const secili = form?.id === g.id;
                    return (
                      <div
                        key={g.id}
                        onClick={() => duzenle(g)}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors group",
                          secili
                            ? "bg-birincil-zemin border border-birincil/30"
                            : "hover:bg-yuzey border border-transparent",
                          !g.aktifMi && "opacity-60",
                        )}
                      >
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
                          style={{ backgroundColor: (g.renk ?? "#6B7280") + "22" }}
                        >
                          <Ikon className="h-4 w-4" style={{ color: g.renk ?? "#6B7280" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-metin truncate">{g.ad}</div>
                          <div className="text-xs text-metin-pasif">
                            {g._count.hesaplar} {t("odeme-araci.liste-baslik").toLowerCase()}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              aktiflikDegistir(g);
                            }}
                          >
                            <Power className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              sil(g);
                            }}
                            className="hover:text-[color:var(--renk-tehlike)]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sağ: Form */}
          <div className="w-1/2 flex flex-col">
            {!form ? (
              <div className="flex-1 flex flex-col items-center justify-center text-metin-pasif p-6 text-center">
                <Pencil className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">{t("hesap-grup.secim-yonergesi")}</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-metin">
                    {form.id ? t("hesap-grup.grup-duzenle") : t("hesap-grup.yeni-grup")}
                  </h3>

                  <FormAlani.Metin
                    etiket={t("genel.kod")}
                    zorunlu
                    deger={form.kod}
                    onChange={(v) => {
                      setForm({ ...form, kod: v.toUpperCase() });
                      if (hatalar.kod) hataTemizle("kod");
                    }}
                    placeholder="NAKIT"
                    disabled={!!form.id}
                    hata={hatalar.kod}
                    yardim={form.id ? "Mevcut grupların kodu değiştirilemez" : "Tekil tanımlayıcı, büyük harf"}
                  />

                  <FormAlani.Metin
                    etiket={t("hesap-grup.grup-ad")}
                    zorunlu
                    deger={form.ad}
                    onChange={(v) => {
                      setForm({ ...form, ad: v });
                      if (hatalar.ad) hataTemizle("ad");
                    }}
                    placeholder="Nakit"
                    hata={hatalar.ad}
                  />

                  <FormAlani.Metin
                    etiket={t("genel.aciklama")}
                    deger={form.aciklama ?? ""}
                    onChange={(v) => setForm({ ...form, aciklama: v })}
                  />

                  {/* İkon seçimi */}
                  <div>
                    <label className="text-sm font-medium text-metin">{t("hesap-grup.ikon")}</label>
                    <div className="mt-1 grid grid-cols-6 gap-2">
                      {IKON_SECIM.map((i) => {
                        const Ikon = i.bilesen;
                        const secili = form.ikon === i.ad;
                        return (
                          <button
                            key={i.ad}
                            type="button"
                            onClick={() => setForm({ ...form, ikon: i.ad })}
                            className={cn(
                              "flex h-10 items-center justify-center rounded-md border transition-colors",
                              secili
                                ? "border-birincil bg-birincil-zemin text-birincil"
                                : "border-kenarlik text-metin-ikinci hover:bg-yuzey hover:text-metin",
                            )}
                          >
                            <Ikon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Renk seçimi */}
                  <div>
                    <label className="text-sm font-medium text-metin">{t("hesap-grup.renk")}</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {RENK_PALETI.map((renk) => {
                        const secili = form.renk === renk;
                        return (
                          <button
                            key={renk}
                            type="button"
                            onClick={() => setForm({ ...form, renk })}
                            className={cn(
                              "h-8 w-8 rounded-full transition-transform flex items-center justify-center",
                              secili && "ring-2 ring-offset-2 ring-offset-arkaplan scale-110",
                            )}
                            style={{ backgroundColor: renk, ["--tw-ring-color" as any]: renk }}
                          >
                            {secili && <span className="text-white text-xs font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <FormAlani.Sayi
                    etiket={t("genel.siralama")}
                    deger={String(form.sira)}
                    onChange={(v) => setForm({ ...form, sira: Number(v) || 0 })}
                  />
                </div>

                <div className="border-t border-kenarlik px-5 py-3 flex gap-2">
                  <Button onClick={kaydet} disabled={kaydediyor} className="flex-1">
                    {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
                    {form.id ? t("genel.guncelle") : t("genel.kaydet")}
                  </Button>
                  <Button variant="outline" onClick={() => setForm(null)}>
                    {t("genel.iptal")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
