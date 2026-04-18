import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  FileText,
  Building2,
  Loader2,
  Users,
  Calendar,
  Tag,
  CreditCard,
  Percent,
  Clock,
  Pencil,
  Power,
  Plus,
  Trash2,
  Star,
  Smartphone,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { TarihGosterim } from "@/components/ortak/TarihGosterim";
import { CariFormDrawer } from "@/components/cari/CariFormDrawer";
import { toast } from "@/hooks/use-toast";
import { useOnay } from "@/components/ortak/OnayDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/cari/$cariId")({
  component: CariDetay,
});

interface CariAdres {
  id: string;
  baslik: string;
  tip: string;
  adresSatir1: string;
  adresSatir2: string | null;
  ilId: string | null;
  ilceId: string | null;
  postaKodu: string | null;
  yetkiliAdSoyad: string | null;
  yetkiliTelefon: string | null;
  varsayilanFaturaMi: boolean;
  varsayilanSevkMi: boolean;
}

interface CariIletisim {
  id: string;
  tip: string;
  deger: string;
  aciklama: string | null;
  varsayilanMi: boolean;
}

interface CariVeri {
  id: string;
  kod: string;
  tip: string;
  kisiTipi: string;
  ad: string | null;
  soyad: string | null;
  unvan: string | null;
  kisaAd: string | null;
  yetkiliAdSoyad: string | null;
  yetkiliGorev: string | null;
  vergiNo: string | null;
  vergiNoTipi: string | null;
  paraBirimiKod: string;
  iskontoOrani: string;
  vadeGun: number;
  sektor: string | null;
  aktifMi: boolean;
  kvkkOnayMi: boolean;
  riskDurumu: string;
  olusturmaTarihi: string;
  guncellemeTarihi: string;
  adresler: CariAdres[];
  iletisimler: CariIletisim[];
  cariGrup: { id: string; ad: string } | null;
}

const TIP_ETIKET: Record<string, string> = {
  musteri: "cari.tip-musteri",
  tedarikci: "cari.tip-tedarikci",
  her_ikisi: "cari.tip-her-ikisi",
  personel: "cari.tip-personel",
  diger: "cari.tip-diger",
};

const ILETISIM_IKON: Record<string, typeof Phone> = {
  telefon: Phone,
  cep: Smartphone,
  email: Mail,
};

const RISK_RENK: Record<string, string> = {
  normal: "text-[color:var(--renk-basarili)]",
  dikkat: "text-amber-600 dark:text-amber-400",
  riskli: "text-[color:var(--renk-tehlike)]",
  kara_liste: "text-red-700 dark:text-red-400",
};

function CariDetay() {
  const { cariId } = Route.useParams();
  const { t } = useTranslation();
  const onay = useOnay();
  const [cari, setCari] = useState<CariVeri | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aktifTab, setAktifTab] = useState<"detay" | "adresler" | "iletisim" | "hareketler">("detay");
  const [drawerAcik, setDrawerAcik] = useState(false);

  // Yeni iletişim ekleme
  const [yeniIletisimAcik, setYeniIletisimAcik] = useState(false);
  const [yeniIletisimTip, setYeniIletisimTip] = useState("cep");
  const [yeniIletisimDeger, setYeniIletisimDeger] = useState("");

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const res = await apiIstemci.get<CariVeri>(`/cari/${cariId}`);
      setCari(res.data);
    } catch {
      toast.hata(t("cari.bilgi-yuklenemedi"));
    }
    setYukleniyor(false);
  }, [cariId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const aktiflikDegistir = async () => {
    if (!cari) return;
    if (cari.aktifMi) {
      const cariAdGecici = cari.unvan ?? [cari.ad, cari.soyad].filter(Boolean).join(" ") ?? cari.kod;
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: cariAdGecici }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/cari/${cariId}/aktiflik`);
      toast.basarili(cari.aktifMi ? t("genel.pasife-al") : t("genel.aktif-et"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const iletisimEkle = async () => {
    if (!yeniIletisimDeger.trim()) return;
    try {
      await apiIstemci.post(`/cari/${cariId}/iletisim`, {
        tip: yeniIletisimTip,
        deger: yeniIletisimDeger.trim(),
        varsayilanMi: false,
      });
      toast.basarili(t("cari.iletisim-eklendi"));
      setYeniIletisimAcik(false);
      setYeniIletisimDeger("");
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const iletisimSil = async (iletisimId: string) => {
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.iletisim-sil-mesaj"),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    try {
      await apiIstemci.delete(`/cari/${cariId}/iletisim/${iletisimId}`);
      toast.basarili(t("cari.iletisim-silindi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  if (yukleniyor) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
      </div>
    );
  }

  if (!cari) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-metin-ikinci">
        <Users className="h-12 w-12 mb-3 opacity-30" />
        <p className="font-medium">{t("cari.bulunamadi")}</p>
        <Button asChild variant="ghost" size="sm" className="mt-3">
          <Link to="/cari/liste" className="flex items-center gap-1">
            <ArrowLeft /> {t("cari.listeye-don")}
          </Link>
        </Button>
      </div>
    );
  }

  const cariAd = cari.unvan ?? [cari.ad, cari.soyad].filter(Boolean).join(" ") ?? cari.kod;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/cari/liste" className="flex items-center gap-1">
            <ArrowLeft /> {t("cari.liste-baslik")}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrawerAcik(true)}>
            <Pencil className="h-3.5 w-3.5" /> {t("genel.duzenle")}
          </Button>
          <Button variant="outline" size="sm" onClick={aktiflikDegistir}>
            <Power className="h-3.5 w-3.5" /> {cari.aktifMi ? t("genel.pasife-al") : t("genel.aktif-et")}
          </Button>
        </div>
      </div>

      {/* Başlık kartı */}
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6 md:flex-row md:items-start">
          <Avatar adSoyad={cariAd} boyut="lg" />
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-metin">{cariAd}</h1>
                <p className="font-mono text-sm text-metin-ikinci">{cari.kod}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t(TIP_ETIKET[cari.tip] ?? cari.tip)}</Badge>
                <DurumRozet durum={cari.aktifMi ? "aktif" : "pasif"} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
              {cari.vergiNo && (
                <InfoSatir ikon={FileText} etiket={cari.vergiNoTipi === "TCKN" ? "TC Kimlik No" : "Vergi No"} deger={cari.vergiNo} />
              )}
              {cari.sektor && <InfoSatir ikon={Building2} etiket={t("cari.sektor")} deger={cari.sektor} />}
              {cari.cariGrup && <InfoSatir ikon={Tag} etiket={t("cari.grup")} deger={cari.cariGrup.ad} />}
              <InfoSatir ikon={CreditCard} etiket={t("cari.para-birimi")} deger={cari.paraBirimiKod} />
              {Number(cari.iskontoOrani) > 0 && <InfoSatir ikon={Percent} etiket={t("cari.iskonto")} deger={`%${cari.iskontoOrani}`} />}
              {cari.vadeGun > 0 && <InfoSatir ikon={Clock} etiket={t("cari.vade-gun")} deger={`${cari.vadeGun} ${t("cari.vade-gun").toLowerCase()}`} />}
              {/* İletişimler */}
              {cari.iletisimler?.slice(0, 3).map((il) => {
                const Ikon = ILETISIM_IKON[il.tip] ?? Phone;
                return <InfoSatir key={il.id} ikon={Ikon} etiket={il.tip} deger={il.deger} />;
              })}
              <InfoSatir ikon={Calendar} etiket={t("cari.kayit-tarihi")} deger="" tarih={cari.olusturmaTarihi} />
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-kenarlik bg-yuzey p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">Risk Durumu</div>
            <div className={cn("mt-1 text-lg font-semibold capitalize", RISK_RENK[cari.riskDurumu] ?? "text-metin")}>
              {cari.riskDurumu}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab seçimi */}
      <div className="flex gap-1 border-b border-kenarlik">
        {(["detay", "adresler", "iletisim", "hareketler"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setAktifTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              aktifTab === tab
                ? "border-birincil text-birincil"
                : "border-transparent text-metin-ikinci hover:text-metin",
            )}
          >
            {tab === "detay" ? t("genel.detay") : tab === "adresler" ? `${t("cari.adresler")} (${cari.adresler.length})` : tab === "iletisim" ? `${t("cari.iletisim")} (${cari.iletisimler.length})` : t("cari.hareketler")}
          </button>
        ))}
      </div>

      {aktifTab === "detay" && (
        <Card>
          <CardHeader><CardTitle>Genel Bilgiler</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <DetayAlani etiket={t("cari.kisi-tipi")} deger={cari.kisiTipi === "gercek" ? t("cari.kisi-tipi-gercek") : t("cari.kisi-tipi-tuzel")} />
              <DetayAlani etiket={t("cari.tip")} deger={t(TIP_ETIKET[cari.tip])} />
              {cari.yetkiliAdSoyad && <DetayAlani etiket={t("cari.yetkili")} deger={`${cari.yetkiliAdSoyad}${cari.yetkiliGorev ? ` (${cari.yetkiliGorev})` : ""}`} />}
              <DetayAlani etiket={t("cari.kvkk-onay")} deger={cari.kvkkOnayMi ? t("genel.evet") : t("genel.hayir")} />
              <DetayAlani etiket={t("cari.son-guncelleme")} deger="" tarih={cari.guncellemeTarihi} />
            </div>
          </CardContent>
        </Card>
      )}

      {aktifTab === "adresler" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Adresler</CardTitle>
          </CardHeader>
          <CardContent>
            {cari.adresler.length === 0 ? (
              <p className="text-sm text-metin-ikinci py-8 text-center">Kayıtlı adres yok</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {cari.adresler.map((adres) => (
                  <div
                    key={adres.id}
                    className={cn(
                      "rounded-lg border border-kenarlik p-4",
                      (adres.varsayilanFaturaMi || adres.varsayilanSevkMi) && "ring-2 ring-birincil/30",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm">{adres.baslik}</span>
                      {adres.varsayilanFaturaMi && <Badge variant="outline" className="text-[10px]">Fatura</Badge>}
                      {adres.varsayilanSevkMi && <Badge variant="outline" className="text-[10px]">Sevk</Badge>}
                    </div>
                    <p className="text-sm text-metin-ikinci">{adres.adresSatir1}</p>
                    {adres.adresSatir2 && <p className="text-sm text-metin-ikinci">{adres.adresSatir2}</p>}
                    {adres.yetkiliAdSoyad && (
                      <p className="text-xs text-metin-pasif mt-2">Yetkili: {adres.yetkiliAdSoyad} {adres.yetkiliTelefon ? `- ${adres.yetkiliTelefon}` : ""}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aktifTab === "iletisim" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4" /> İletişim Bilgileri</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setYeniIletisimAcik(!yeniIletisimAcik)}>
              <Plus className="h-3.5 w-3.5" /> Ekle
            </Button>
          </CardHeader>
          <CardContent>
            {yeniIletisimAcik && (
              <div className="flex items-end gap-3 mb-4 p-3 rounded-lg bg-yuzey border border-kenarlik">
                <div>
                  <label className="text-xs font-medium text-metin">Tip</label>
                  <select
                    value={yeniIletisimTip}
                    onChange={(e) => setYeniIletisimTip(e.target.value)}
                    className="mt-1 block rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm"
                  >
                    <option value="cep">Cep</option>
                    <option value="telefon">Telefon</option>
                    <option value="email">E-posta</option>
                    <option value="faks">Faks</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-metin">Değer</label>
                  <Input className="mt-1" value={yeniIletisimDeger} onChange={(e) => setYeniIletisimDeger(e.target.value)} placeholder="05XX XXX XX XX" />
                </div>
                <Button size="sm" onClick={iletisimEkle}>{t("genel.kaydet")}</Button>
              </div>
            )}
            {cari.iletisimler.length === 0 ? (
              <p className="text-sm text-metin-ikinci py-8 text-center">Kayıtlı iletişim bilgisi yok</p>
            ) : (
              <div className="space-y-2">
                {cari.iletisimler.map((il) => {
                  const Ikon = ILETISIM_IKON[il.tip] ?? Phone;
                  return (
                    <div key={il.id} className="flex items-center justify-between py-2 border-b border-kenarlik last:border-0">
                      <div className="flex items-center gap-3">
                        <Ikon className="h-4 w-4 text-metin-pasif" />
                        <div>
                          <div className="text-sm font-medium text-metin">{il.deger}</div>
                          <div className="text-xs text-metin-ikinci capitalize">{il.tip}{il.varsayilanMi ? " (varsayılan)" : ""}</div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => iletisimSil(il.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-metin-pasif" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {aktifTab === "hareketler" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">Cari hareketleri</p>
            <p className="text-sm mt-1">Borç/alacak hareketleri hesaplar tamamlanınca eklenecek</p>
          </CardContent>
        </Card>
      )}

      {/* Düzenleme Drawer */}
      <CariFormDrawer
        acik={drawerAcik}
        kapat={() => setDrawerAcik(false)}
        cariId={cariId}
        onKaydet={() => void yukle()}
      />
    </div>
  );
}

function InfoSatir({ ikon: Ikon, etiket, deger, tarih }: { ikon: React.ComponentType<{ className?: string }>; etiket: string; deger: string; tarih?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Ikon className="mt-0.5 h-4 w-4 text-metin-pasif" />
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">{etiket}</div>
        {tarih ? <TarihGosterim tarih={tarih} format="kisa" /> : <div className="text-metin">{deger}</div>}
      </div>
    </div>
  );
}

function DetayAlani({ etiket, deger, tarih }: { etiket: string; deger: string; tarih?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">{etiket}</div>
      {tarih ? <TarihGosterim tarih={tarih} format="kisa" /> : <div className="text-metin">{deger}</div>}
    </div>
  );
}
