import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Power,
  X,
  Loader2,
  FolderOpen,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { useDrawerKapatma } from "@/hooks/use-drawer-kapatma";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/cari/gruplar")({
  component: CariGruplarSayfa,
});

interface CariGrup {
  id: string;
  kod: string;
  ad: string;
  aciklama: string | null;
  varsayilanIskontoOrani: string;
  varsayilanVadeGun: number | null;
  renk: string | null;
  sira: number;
  aktifMi: boolean;
  _count: { cariler: number };
}

function CariGruplarSayfa() {
  const { t } = useTranslation();
  const onay = useOnay();
  const [gruplar, setGruplar] = useState<CariGrup[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [seciliGrup, setSeciliGrup] = useState<CariGrup | null>(null);

  // Form state
  const [formKod, setFormKod] = useState("");
  const [formAd, setFormAd] = useState("");
  const [formAciklama, setFormAciklama] = useState("");
  const [formIskonto, setFormIskonto] = useState("0");
  const [formVade, setFormVade] = useState("");
  const [formSira, setFormSira] = useState("0");
  const [kaydediyor, setKaydediyor] = useState(false);

  // Dirty state takibi (form alanlarını tek obje olarak karşılaştır)
  const formSnapshot = { formKod, formAd, formAciklama, formIskonto, formVade, formSira };
  const { dirty, baslangicAyarla, sifirla } = useDirtyForm(formSnapshot);
  const { guvenlikapat, drawerRef } = useDrawerKapatma({
    acik: drawerAcik,
    kapat: () => setDrawerAcik(false),
    mesgul: kaydediyor,
    dirty,
    onay,
  });

  const yukle = async () => {
    setYukleniyor(true);
    try {
      const res = await apiIstemci.get<CariGrup[]>("/cari-grup");
      setGruplar(res.data);
    } catch {
      toast.hata(t("cari.yuklenemedi"));
    }
    setYukleniyor(false);
  };

  useEffect(() => {
    void yukle();
  }, []);

  const formuSifirla = () => {
    setFormKod("");
    setFormAd("");
    setFormAciklama("");
    setFormIskonto("0");
    setFormVade("");
    setFormSira("0");
    setSeciliGrup(null);
    baslangicAyarla({
      formKod: "",
      formAd: "",
      formAciklama: "",
      formIskonto: "0",
      formVade: "",
      formSira: "0",
    });
  };

  const duzenle = (grup: CariGrup) => {
    setSeciliGrup(grup);
    const yeniSnapshot = {
      formKod: grup.kod,
      formAd: grup.ad,
      formAciklama: grup.aciklama ?? "",
      formIskonto: grup.varsayilanIskontoOrani,
      formVade: grup.varsayilanVadeGun?.toString() ?? "",
      formSira: grup.sira.toString(),
    };
    setFormKod(yeniSnapshot.formKod);
    setFormAd(yeniSnapshot.formAd);
    setFormAciklama(yeniSnapshot.formAciklama);
    setFormIskonto(yeniSnapshot.formIskonto);
    setFormVade(yeniSnapshot.formVade);
    setFormSira(yeniSnapshot.formSira);
    baslangicAyarla(yeniSnapshot);
    setDrawerAcik(true);
  };

  const kaydet = async () => {
    if (!formAd.trim()) {
      toast.hata(t("genel.zorunlu-alan"));
      return;
    }
    setKaydediyor(true);
    try {
      const veri: Record<string, unknown> = {
        ad: formAd.trim(),
        aciklama: formAciklama.trim() || null,
        varsayilanIskontoOrani: Number(formIskonto) || 0,
        varsayilanVadeGun: formVade ? Number(formVade) : null,
        sira: Number(formSira) || 0,
      };
      if (seciliGrup && formKod.trim()) {
        veri.kod = formKod.trim();
      }
      if (seciliGrup) {
        await apiIstemci.patch(`/cari-grup/${seciliGrup.id}`, veri);
        toast.basarili(t("cari-grup.guncellendi"));
      } else {
        await apiIstemci.post("/cari-grup", veri);
        toast.basarili(t("cari-grup.olusturuldu"));
      }
      sifirla();
      setDrawerAcik(false);
      formuSifirla();
      await yukle();
    } catch {
      toast.hata(t("cari.kayit-basarisiz"));
    }
    setKaydediyor(false);
  };

  const aktiflikDegistir = async (grup: CariGrup) => {
    if (grup.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: grup.ad }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/cari-grup/${grup.id}/aktiflik`);
      toast.basarili(`${grup.ad} ${grup.aktifMi ? t("genel.pasife-al").toLowerCase() : t("genel.aktif-et").toLowerCase()}`);
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const silGrup = async (grup: CariGrup) => {
    if (grup._count.cariler > 0) {
      toast.hata(t("cari-grup.bagli-cari-var", { sayi: grup._count.cariler }));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.sil-mesaj", { ad: grup.ad }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    try {
      await apiIstemci.delete(`/cari-grup/${grup.id}`);
      toast.basarili(t("cari-grup.silindi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("cari-grup.baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">
            {t("cari-grup.altyazi")}
          </p>
        </div>
        <Button
          onClick={() => {
            formuSifirla();
            setDrawerAcik(true);
          }}
        >
          <Plus /> {t("cari-grup.yeni-grup")}
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : gruplar.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
              <FolderOpen className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">{t("cari-grup.grup-yok")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("genel.kod")}</TableHead>
                  <TableHead>{t("genel.ad")}</TableHead>
                  <TableHead>{t("genel.aciklama")}</TableHead>
                  <TableHead className="text-center">{t("cari.cari-sayisi")}</TableHead>
                  <TableHead className="text-right">{t("cari-grup.varsayilan-iskonto")}</TableHead>
                  <TableHead className="text-right">{t("cari-grup.varsayilan-vade")}</TableHead>
                  <TableHead>{t("genel.durum")}</TableHead>
                  <TableHead className="text-right">{t("genel.islem")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gruplar.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-metin-ikinci">
                      {g.kod}
                    </TableCell>
                    <TableCell className="font-medium">{g.ad}</TableCell>
                    <TableCell className="text-metin-ikinci text-sm max-w-[200px] truncate">
                      {g.aciklama ?? "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">
                        <Users className="h-3 w-3 mr-1" />
                        {g._count.cariler}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(g.varsayilanIskontoOrani) > 0
                        ? `%${g.varsayilanIskontoOrani}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {g.varsayilanVadeGun ?? "-"}
                    </TableCell>
                    <TableCell>
                      <DurumRozet durum={g.aktifMi ? "aktif" : "pasif"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duzenle(g)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => aktiflikDegistir(g)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Drawer */}
      {drawerAcik && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={guvenlikapat}
          />
          <div ref={drawerRef} className="relative w-full max-w-md bg-arkaplan shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
              <h2 className="text-lg font-semibold text-metin">
                {seciliGrup ? t("cari-grup.grup-duzenle") : t("cari-grup.yeni-grup")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={guvenlikapat}
                disabled={kaydediyor}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {seciliGrup && (
                <div>
                  <label className="text-sm font-medium text-metin">
                    {t("genel.kod")}
                  </label>
                  <Input
                    value={formKod}
                    readOnly
                    className="font-mono bg-yuzey cursor-not-allowed"
                  />
                  <p className="text-xs text-metin-ikinci mt-1">
                    {t("genel.kod-yardim-kilitli")}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-metin">{t("genel.ad")} *</label>
                <Input
                  value={formAd}
                  onChange={(e) => setFormAd(e.target.value)}
                  placeholder={t("cari-grup.grup-ad")}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-metin">
                  {t("genel.aciklama")}
                </label>
                <Input
                  value={formAciklama}
                  onChange={(e) => setFormAciklama(e.target.value)}
                  placeholder={t("genel.aciklama")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-metin">
                    {t("cari-grup.varsayilan-iskonto")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={formIskonto}
                    onChange={(e) => setFormIskonto(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-metin">
                    {t("cari-grup.varsayilan-vade")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={formVade}
                    onChange={(e) => setFormVade(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-metin">
                  {t("genel.siralama")}
                </label>
                <Input
                  type="number"
                  value={formSira}
                  onChange={(e) => setFormSira(e.target.value)}
                />
              </div>
            </div>
            <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
              <Button className="flex-1" onClick={kaydet} disabled={kaydediyor}>
                {kaydediyor && <Loader2 className="h-4 w-4 animate-spin" />}
                {seciliGrup ? t("genel.guncelle") : t("genel.kaydet")}
              </Button>
              <Button
                variant="outline"
                onClick={guvenlikapat}
                disabled={kaydediyor}
              >
                {t("genel.iptal")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
