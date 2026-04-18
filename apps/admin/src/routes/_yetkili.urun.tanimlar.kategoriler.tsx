import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  X,
  Loader2,
  FolderTree,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Search,
  ShoppingBag,
  Building2,
  FolderPlus,
  Package,
  Maximize2,
  Move,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiIstemci } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useOnay } from "@/components/ortak/OnayDialog";
import { toast } from "@/hooks/use-toast";
import { useDrawerKapatma } from "@/hooks/use-drawer-kapatma";
import { useDirtyForm } from "@/hooks/use-dirty-form";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_yetkili/urun/tanimlar/kategoriler")({
  component: KategorilerSayfa,
});

const MAKS_DERINLIK = 5;

interface KategoriDuz {
  id: string;
  kod: string;
  ad: string;
  aciklama: string | null;
  ustKategoriId: string | null;
  resimUrl: string | null;
  bannerUrl: string | null;
  ikon: string | null;
  renk: string | null;
  icerik: string | null;
  seoBaslik: string | null;
  seoAciklama: string | null;
  seoAnahtarKelimeler: string[];
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  eticaretAktif: boolean;
  b2bAktif: boolean;
  aktifMi: boolean;
  sira: number;
  seviye: number;
  _count?: { altKategoriler: number; urunler: number };
}

interface KategoriAgac extends KategoriDuz {
  altKategoriler: KategoriAgac[];
}

type Sekme = "temel" | "gorsel" | "seo" | "yayin" | "icerik";

const BOS_FORM = {
  kod: "",
  ad: "",
  aciklama: "",
  ustKategoriId: null as string | null,
  resimUrl: "",
  bannerUrl: "",
  ikon: "",
  renk: "#3B82F6",
  icerik: "",
  seoBaslik: "",
  seoAciklama: "",
  seoAnahtarKelimeler: "",
  ogImageUrl: "",
  canonicalUrl: "",
  eticaretAktif: false,
  b2bAktif: false,
  sira: "0",
};

function KategorilerSayfa() {
  const { t } = useTranslation();
  const onay = useOnay();

  const [agac, setAgac] = useState<KategoriAgac[]>([]);
  const [duzListe, setDuzListe] = useState<KategoriDuz[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [arama, setArama] = useState("");
  const [acikNodlar, setAcikNodlar] = useState<Set<string>>(new Set());
  const [sadeceAktif, setSadeceAktif] = useState(false);

  const [modalAcik, setModalAcik] = useState(false);
  const [seciliKat, setSeciliKat] = useState<KategoriDuz | null>(null);
  const [aktifSekme, setAktifSekme] = useState<Sekme>("temel");

  const [form, setForm] = useState({ ...BOS_FORM });
  const [kaydediyor, setKaydediyor] = useState(false);
  const [kodDuzenle, setKodDuzenle] = useState(false);

  const { dirty, baslangicAyarla, sifirla } = useDirtyForm(form);
  const { guvenlikapat, drawerRef } = useDrawerKapatma({
    acik: modalAcik,
    kapat: () => setModalAcik(false),
    mesgul: kaydediyor,
    dirty,
    onay,
  });

  // Taşıma modalı
  const [tasiModal, setTasiModal] = useState<{
    acik: boolean;
    kategori: KategoriDuz | null;
  }>({ acik: false, kategori: null });
  const [tasiHedef, setTasiHedef] = useState<string | null>(null);

  const agaciDuzles = (nodlar: KategoriAgac[]): KategoriDuz[] => {
    const cikti: KategoriDuz[] = [];
    const dolas = (n: KategoriAgac) => {
      const { altKategoriler, ...rest } = n;
      cikti.push(rest);
      altKategoriler?.forEach(dolas);
    };
    nodlar.forEach(dolas);
    return cikti;
  };

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const res = await apiIstemci.get<KategoriAgac[]>(
        `/kategori/agac${sadeceAktif ? "?sadeceAktif=true" : ""}`,
      );
      const veri = Array.isArray(res.data) ? res.data : [];
      setAgac(veri);
      setDuzListe(agaciDuzles(veri));
    } catch {
      toast.hata(t("kategori.agac-yuklenemedi"));
    }
    setYukleniyor(false);
  }, [sadeceAktif, t]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const tumuAc = () => {
    setAcikNodlar(new Set(duzListe.map((k) => k.id)));
  };
  const tumuKapat = () => setAcikNodlar(new Set());
  const nodAcKapa = (id: string) => {
    setAcikNodlar((s) => {
      const y = new Set(s);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });
  };

  // Arama highlight — sadece eşleşenleri ve atalarını göster
  const aramaSonucu = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    if (!q) return null;
    const eslesen = new Set<string>();
    const yollar = new Set<string>();
    const dolas = (node: KategoriAgac, atalar: string[]) => {
      const adMatch = node.ad.toLocaleLowerCase("tr-TR").includes(q);
      const kodMatch = node.kod.toLocaleLowerCase("tr-TR").includes(q);
      if (adMatch || kodMatch) {
        eslesen.add(node.id);
        atalar.forEach((a) => yollar.add(a));
      }
      node.altKategoriler?.forEach((alt) => dolas(alt, [...atalar, node.id]));
    };
    agac.forEach((n) => dolas(n, []));
    return { eslesen, yollar };
  }, [arama, agac]);

  // Ata yollarını otomatik aç (arama sonucu için)
  useEffect(() => {
    if (aramaSonucu) {
      setAcikNodlar((s) => new Set([...s, ...aramaSonucu.yollar]));
    }
  }, [aramaSonucu]);

  // ─── Form açma ───────────────────────────────────────
  const yeniModal = (ustId: string | null = null) => {
    setSeciliKat(null);
    const yeni = { ...BOS_FORM, ustKategoriId: ustId };
    setForm(yeni);
    baslangicAyarla(yeni);
    setAktifSekme("temel");
    setKodDuzenle(false);
    setModalAcik(true);
  };

  const duzenle = (k: KategoriDuz) => {
    setSeciliKat(k);
    const y = {
      kod: k.kod,
      ad: k.ad,
      aciklama: k.aciklama ?? "",
      ustKategoriId: k.ustKategoriId,
      resimUrl: k.resimUrl ?? "",
      bannerUrl: k.bannerUrl ?? "",
      ikon: k.ikon ?? "",
      renk: k.renk ?? "#3B82F6",
      icerik: k.icerik ?? "",
      seoBaslik: k.seoBaslik ?? "",
      seoAciklama: k.seoAciklama ?? "",
      seoAnahtarKelimeler: (k.seoAnahtarKelimeler ?? []).join(", "),
      ogImageUrl: k.ogImageUrl ?? "",
      canonicalUrl: k.canonicalUrl ?? "",
      eticaretAktif: k.eticaretAktif,
      b2bAktif: k.b2bAktif,
      sira: String(k.sira ?? 0),
    };
    setForm(y);
    baslangicAyarla(y);
    setAktifSekme("temel");
    setKodDuzenle(false);
    setModalAcik(true);
  };

  const kaydet = async () => {
    if (!form.ad.trim()) {
      toast.hata(t("kategori.ad") + " " + t("genel.zorunlu-alan"));
      return;
    }
    setKaydediyor(true);
    try {
      const anahtarlar = form.seoAnahtarKelimeler
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const veri: any = {
        ad: form.ad.trim(),
        aciklama: form.aciklama.trim() || null,
        resimUrl: form.resimUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        ikon: form.ikon.trim() || null,
        renk: form.renk.trim() || null,
        icerik: form.icerik || null,
        seoBaslik: form.seoBaslik.trim() || null,
        seoAciklama: form.seoAciklama.trim() || null,
        seoAnahtarKelimeler: anahtarlar,
        ogImageUrl: form.ogImageUrl.trim() || null,
        canonicalUrl: form.canonicalUrl.trim() || null,
        eticaretAktif: form.eticaretAktif,
        b2bAktif: form.b2bAktif,
        sira: Number(form.sira) || 0,
      };
      if (seciliKat && kodDuzenle && form.kod.trim()) {
        veri.kod = form.kod.trim();
      }
      if (seciliKat) {
        await apiIstemci.patch(`/kategori/${seciliKat.id}`, veri);
        toast.basarili(t("kategori.guncellendi"));
      } else {
        veri.ustKategoriId = form.ustKategoriId;
        await apiIstemci.post("/kategori", veri);
        toast.basarili(t("kategori.olusturuldu"));
      }
      sifirla();
      setModalAcik(false);
      await yukle();
    } catch (err: any) {
      const mesaj = err?.response?.data?.message;
      if (typeof mesaj === "string" && mesaj.toLowerCase().includes("unique")) {
        toast.hata(t("kategori.kod-benzersiz"));
      } else {
        toast.hata(mesaj || t("genel.hata"));
      }
    }
    setKaydediyor(false);
  };

  const aktiflikDegistir = async (k: KategoriDuz) => {
    if (k.aktifMi) {
      const tamam = await onay.goster({
        baslik: t("genel.pasife-al-baslik"),
        mesaj: t("genel.pasife-al-mesaj", { ad: k.ad }),
        varyant: "uyari",
        onayMetni: t("genel.pasife-al"),
      });
      if (!tamam) return;
    }
    try {
      await apiIstemci.patch(`/kategori/${k.id}/aktiflik`);
      toast.basarili(t("kategori.aktiflik-degistirildi"));
      await yukle();
    } catch {
      toast.hata(t("genel.hata"));
    }
  };

  const silKat = async (k: KategoriDuz) => {
    if ((k._count?.altKategoriler ?? 0) > 0) {
      toast.hata(
        t("kategori.silme-engeli-alt", { sayi: k._count!.altKategoriler }),
      );
      return;
    }
    if ((k._count?.urunler ?? 0) > 0) {
      toast.hata(t("kategori.silme-engeli-urun", { sayi: k._count!.urunler }));
      return;
    }
    const tamam = await onay.goster({
      baslik: t("genel.sil-baslik"),
      mesaj: t("genel.sil-mesaj", { ad: k.ad }),
      varyant: "tehlike",
      onayMetni: t("genel.sil"),
    });
    if (!tamam) return;
    try {
      await apiIstemci.delete(`/kategori/${k.id}`);
      toast.basarili(t("kategori.silindi"));
      await yukle();
    } catch (err: any) {
      toast.hata(err?.response?.data?.message || t("genel.hata"));
    }
  };

  // ─── Yayın kanal toggle (e-ticaret / b2b) ────────────
  const kanalToggle = async (
    k: KategoriDuz,
    alan: "eticaretAktif" | "b2bAktif",
  ) => {
    const yeni = !(alan === "eticaretAktif" ? k.eticaretAktif : k.b2bAktif);
    // Optimistik
    const guncelleNode = (nodlar: KategoriAgac[]): KategoriAgac[] =>
      nodlar.map((n) =>
        n.id === k.id
          ? { ...n, [alan]: yeni }
          : n.altKategoriler?.length
            ? { ...n, altKategoriler: guncelleNode(n.altKategoriler) }
            : n,
      );
    setAgac((prev) => guncelleNode(prev));
    try {
      await apiIstemci.patch(`/kategori/${k.id}`, { [alan]: yeni });
    } catch {
      toast.hata(t("genel.hata"));
      await yukle();
    }
  };

  // ─── Drag-drop (aynı level'da sıralama) ──────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const siblingSirala = async (
    ustKategoriId: string | null,
    yeniSiralama: KategoriAgac[],
  ) => {
    try {
      await apiIstemci.post("/kategori/sirala", {
        ustKategoriId,
        siralama: yeniSiralama.map((k, idx) => ({ id: k.id, sira: idx })),
      });
      toast.basarili(t("kategori.siralama-guncellendi"));
      // Optimistik: ağacı yerel güncelle
      setAgac((onceki) => guncelleSeviye(onceki, ustKategoriId, yeniSiralama));
    } catch {
      toast.hata(t("genel.hata"));
      await yukle();
    }
  };

  const guncelleSeviye = (
    nodlar: KategoriAgac[],
    ustId: string | null,
    yeni: KategoriAgac[],
  ): KategoriAgac[] => {
    if (ustId === null) return yeni;
    return nodlar.map((n) => {
      if (n.id === ustId) return { ...n, altKategoriler: yeni };
      if (n.altKategoriler?.length)
        return { ...n, altKategoriler: guncelleSeviye(n.altKategoriler, ustId, yeni) };
      return n;
    });
  };

  // ─── Taşıma ──────────────────────────────────────────
  const tasiAc = (k: KategoriDuz) => {
    setTasiHedef(k.ustKategoriId);
    setTasiModal({ acik: true, kategori: k });
  };

  // Cycle: k'nın tüm alt ağacındaki id'leri dışla
  const altAgacIdleri = (id: string): Set<string> => {
    const ids = new Set<string>();
    const bul = (node: KategoriAgac): boolean => {
      if (node.id === id) {
        const topla = (n: KategoriAgac) => {
          ids.add(n.id);
          n.altKategoriler?.forEach(topla);
        };
        topla(node);
        return true;
      }
      return node.altKategoriler?.some(bul) ?? false;
    };
    agac.forEach(bul);
    return ids;
  };

  const tasimayiUygula = async () => {
    if (!tasiModal.kategori) return;
    try {
      await apiIstemci.patch(`/kategori/${tasiModal.kategori.id}/tasi`, {
        yeniUstKategoriId: tasiHedef,
        yeniSira: 0,
      });
      toast.basarili(t("kategori.tasindi"));
      setTasiModal({ acik: false, kategori: null });
      await yukle();
    } catch (err: any) {
      const mesaj = err?.response?.data?.message;
      if (typeof mesaj === "string" && mesaj.toLowerCase().includes("cycle"))
        toast.hata(t("kategori.tasima-cycle"));
      else if (
        typeof mesaj === "string" &&
        mesaj.toLowerCase().includes("derinlik")
      )
        toast.hata(t("kategori.tasima-derinlik", { maks: MAKS_DERINLIK }));
      else toast.hata(mesaj || t("genel.hata"));
    }
  };

  // ─── Node render ─────────────────────────────────────
  const NodeSortable: React.FC<{
    node: KategoriAgac;
    derinlik: number;
  }> = ({ node, derinlik }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: node.id });
    const acikMi = acikNodlar.has(node.id);
    const altSayisi = node._count?.altKategoriler ?? node.altKategoriler?.length ?? 0;
    const urunSayisi = node._count?.urunler ?? 0;
    const vurgu =
      aramaSonucu?.eslesen.has(node.id) ||
      aramaSonucu?.yollar.has(node.id);
    const gizli = arama && aramaSonucu && !vurgu;
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };
    if (gizli) return null;

    return (
      <div className="select-none">
        <div
          ref={setNodeRef}
          style={{ ...style, paddingLeft: `${derinlik * 20 + 8}px` }}
          className={cn(
            "group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-yuzey",
            !node.aktifMi && "opacity-60",
            aramaSonucu?.eslesen.has(node.id) && "bg-birincil-zemin/30",
          )}
        >
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-metin-pasif hover:text-metin"
            title={t("kategori.surukle-birak-ipucu")}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {altSayisi > 0 ? (
            <button
              type="button"
              onClick={() => nodAcKapa(node.id)}
              className="text-metin-ikinci hover:text-metin"
              title={acikMi ? t("kategori.daralt") : t("kategori.genislet")}
            >
              {acikMi ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {node.resimUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={node.resimUrl}
              alt={node.ad}
              className="h-6 w-6 rounded object-cover"
            />
          ) : (
            <div
              className="h-6 w-6 rounded flex items-center justify-center text-xs"
              style={{ backgroundColor: node.renk ?? "#e5e7eb" }}
            >
              <FolderTree className="h-3.5 w-3.5 text-white" />
            </div>
          )}

          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-medium text-metin truncate">{node.ad}</span>
            <span className="font-mono text-xs text-metin-pasif">
              {node.kod}
            </span>
            {urunSayisi > 0 && (
              <Badge variant="outline" className="h-5 text-xs">
                <Package className="h-3 w-3 mr-1" />
                {urunSayisi}
              </Badge>
            )}
            <button
              type="button"
              onClick={() => kanalToggle(node, "eticaretAktif")}
              title={t("kategori.eticaret-aktif")}
              className={cn(
                "rounded p-1 transition-colors",
                node.eticaretAktif
                  ? "bg-basarili-zemin text-basarili"
                  : "text-metin-pasif hover:text-metin hover:bg-yuzey",
              )}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => kanalToggle(node, "b2bAktif")}
              title={t("kategori.b2b-aktif")}
              className={cn(
                "rounded p-1 transition-colors",
                node.b2bAktif
                  ? "bg-bilgi-zemin text-bilgi"
                  : "text-metin-pasif hover:text-metin hover:bg-yuzey",
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
            </button>
            {!node.aktifMi && (
              <Badge variant="secondary" className="h-5 text-xs">
                {t("genel.pasif")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {derinlik + 1 < MAKS_DERINLIK && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAcikNodlar((s) => new Set([...s, node.id]));
                  yeniModal(node.id);
                }}
                title={t("kategori.yeni-alt-kategori")}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => tasiAc(node)}
              title={t("genel.degistir")}
            >
              <Move className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => duzenle(node)}
              title={t("genel.duzenle")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => aktiflikDegistir(node)}
              title={
                node.aktifMi ? t("genel.pasife-al") : t("genel.aktif-et")
              }
            >
              <Power className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => silKat(node)}
              title={t("genel.sil")}
            >
              <Trash2 className="h-3.5 w-3.5 text-tehlike" />
            </Button>
          </div>
        </div>

        {acikMi && node.altKategoriler && node.altKategoriler.length > 0 && (
          <Seviye nodlar={node.altKategoriler} derinlik={derinlik + 1} />
        )}
      </div>
    );
  };

  const Seviye: React.FC<{
    nodlar: KategoriAgac[];
    derinlik: number;
  }> = ({ nodlar, derinlik }) => {
    const ustId = nodlar[0]?.ustKategoriId ?? null;
    const ids = nodlar.map((n) => n.id);

    const handleDragEnd = (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const eski = ids.findIndex((x) => String(x) === String(active.id));
      const yeni = ids.findIndex((x) => String(x) === String(over.id));
      if (eski < 0 || yeni < 0) return;
      const yeniSira = arrayMove(nodlar, eski, yeni);
      void siblingSirala(ustId, yeniSira);
    };

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {nodlar.map((n) => (
            <NodeSortable key={n.id} node={n} derinlik={derinlik} />
          ))}
        </SortableContext>
      </DndContext>
    );
  };

  const tasiHedefSecenekleri = useMemo(() => {
    if (!tasiModal.kategori) return [] as KategoriDuz[];
    const haric = altAgacIdleri(tasiModal.kategori.id);
    haric.add(tasiModal.kategori.id);
    return duzListe.filter((k) => !haric.has(k.id));
  }, [tasiModal.kategori, duzListe, agac]);

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("kategori.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">{t("kategori.altyazi")}</p>
        </div>
        <Button onClick={() => yeniModal(null)}>
          <Plus /> {t("kategori.yeni-ekle")}
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-metin-pasif" />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder={t("kategori.arama-placeholder")}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-metin-ikinci cursor-pointer">
          <input
            type="checkbox"
            checked={sadeceAktif}
            onChange={(e) => setSadeceAktif(e.target.checked)}
            className="h-4 w-4"
          />
          {t("kategori.sadece-aktif")}
        </label>
        <Button variant="outline" size="sm" onClick={tumuAc}>
          {t("kategori.tumu-ac")}
        </Button>
        <Button variant="outline" size="sm" onClick={tumuKapat}>
          {t("kategori.tumu-kapat")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          {yukleniyor ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-metin-pasif" />
            </div>
          ) : agac.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-metin-ikinci">
              <FolderTree className="h-12 w-12 mb-3 opacity-30" />
              <p className="font-medium">{t("kategori.agac-bos")}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              <Seviye nodlar={agac} derinlik={0} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full-screen modal */}
      {modalAcik && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/50" onClick={guvenlikapat} />
          <div
            ref={drawerRef}
            className="relative w-full max-w-5xl h-[90vh] bg-arkaplan rounded-lg shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
              <div className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4 text-metin-ikinci" />
                <h2 className="text-lg font-semibold text-metin">
                  {seciliKat ? t("kategori.duzenle") : t("kategori.yeni-kayit")}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={guvenlikapat}
                disabled={kaydediyor}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex border-b border-kenarlik px-6 overflow-x-auto">
              {(
                [
                  { key: "temel", label: t("kategori.temel-bilgiler") },
                  { key: "gorsel", label: t("kategori.gorseller-stil") },
                  { key: "seo", label: t("kategori.seo-og") },
                  { key: "yayin", label: t("kategori.yayin-kanallari") },
                  { key: "icerik", label: t("kategori.icerik-bolum") },
                ] as { key: Sekme; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setAktifSekme(s.key)}
                  className={cn(
                    "px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap",
                    aktifSekme === s.key
                      ? "border-birincil text-birincil"
                      : "border-transparent text-metin-ikinci hover:text-metin",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {aktifSekme === "temel" && (
                <div className="space-y-4 max-w-2xl">
                  {seciliKat && (
                    <div>
                      <label className="text-sm font-medium text-metin flex items-center justify-between">
                        <span>{t("kategori.kod")}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setKodDuzenle((v) => !v)}
                        >
                          {kodDuzenle ? t("genel.kilitle") : t("genel.degistir")}
                        </Button>
                      </label>
                      <Input
                        value={form.kod}
                        onChange={(e) =>
                          setForm({ ...form, kod: e.target.value })
                        }
                        readOnly={!kodDuzenle}
                        className={cn(
                          "font-mono",
                          !kodDuzenle && "bg-yuzey cursor-not-allowed",
                        )}
                      />
                      <p className="text-xs text-metin-ikinci mt-1">
                        {kodDuzenle
                          ? t("genel.kod-yardim-duzenle")
                          : t("genel.kod-yardim-kilitli")}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("genel.siralama")}
                    </label>
                    <Input
                      type="number"
                      value={form.sira}
                      onChange={(e) =>
                        setForm({ ...form, sira: e.target.value })
                      }
                      className="max-w-[200px]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("kategori.ad")} *
                    </label>
                    <Input
                      value={form.ad}
                      onChange={(e) => setForm({ ...form, ad: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("kategori.aciklama")}
                    </label>
                    <textarea
                      value={form.aciklama}
                      onChange={(e) =>
                        setForm({ ...form, aciklama: e.target.value })
                      }
                      rows={3}
                      className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin focus:outline-none focus:ring-2 focus:ring-birincil"
                    />
                  </div>
                  {!seciliKat && (
                    <div>
                      <label className="text-sm font-medium text-metin">
                        {t("kategori.ust-kategori")}
                      </label>
                      <select
                        value={form.ustKategoriId ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            ustKategoriId: e.target.value || null,
                          })
                        }
                        className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin focus:outline-none focus:ring-2 focus:ring-birincil"
                      >
                        <option value="">{t("kategori.ust-kategori-yok")}</option>
                        {duzListe
                          .filter((k) => k.seviye < MAKS_DERINLIK)
                          .map((k) => (
                            <option key={k.id} value={k.id}>
                              {"— ".repeat(k.seviye - 1)}
                              {k.ad}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {aktifSekme === "gorsel" && (
                <div className="space-y-4 max-w-2xl">
                  <ImageUpload
                    value={form.resimUrl}
                    onChange={(url) =>
                      setForm({ ...form, resimUrl: url ?? "" })
                    }
                    endpoint="/upload/kategori"
                    label={t("kategori.resim")}
                  />
                  <ImageUpload
                    value={form.bannerUrl}
                    onChange={(url) =>
                      setForm({ ...form, bannerUrl: url ?? "" })
                    }
                    endpoint="/upload/kategori"
                    label={t("kategori.banner")}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-metin">
                        {t("kategori.ikon")}
                      </label>
                      <Input
                        value={form.ikon}
                        onChange={(e) =>
                          setForm({ ...form, ikon: e.target.value })
                        }
                        placeholder={t("kategori.ikon-placeholder")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-metin">
                        {t("kategori.renk")}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.renk}
                          onChange={(e) =>
                            setForm({ ...form, renk: e.target.value })
                          }
                          className="h-9 w-12 rounded border border-kenarlik cursor-pointer"
                        />
                        <Input
                          value={form.renk}
                          onChange={(e) =>
                            setForm({ ...form, renk: e.target.value })
                          }
                          className="font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {aktifSekme === "seo" && (
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("kategori.seo-baslik")}
                    </label>
                    <Input
                      value={form.seoBaslik}
                      onChange={(e) =>
                        setForm({ ...form, seoBaslik: e.target.value })
                      }
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("kategori.seo-aciklama")}
                    </label>
                    <textarea
                      value={form.seoAciklama}
                      onChange={(e) =>
                        setForm({ ...form, seoAciklama: e.target.value })
                      }
                      rows={3}
                      className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin focus:outline-none focus:ring-2 focus:ring-birincil"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("kategori.seo-anahtar-kelimeler")}
                    </label>
                    <Input
                      value={form.seoAnahtarKelimeler}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          seoAnahtarKelimeler: e.target.value,
                        })
                      }
                      placeholder={t("marka.seo-anahtar-placeholder")}
                    />
                  </div>
                  <ImageUpload
                    value={form.ogImageUrl}
                    onChange={(url) =>
                      setForm({ ...form, ogImageUrl: url ?? "" })
                    }
                    endpoint="/upload/kategori"
                    label={t("kategori.og-image")}
                  />
                  <div>
                    <label className="text-sm font-medium text-metin">
                      {t("kategori.canonical-url")}
                    </label>
                    <Input
                      value={form.canonicalUrl}
                      onChange={(e) =>
                        setForm({ ...form, canonicalUrl: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              {aktifSekme === "yayin" && (
                <div className="space-y-4 max-w-2xl">
                  <label className="flex items-center gap-3 rounded-md border border-kenarlik p-3 cursor-pointer hover:bg-yuzey">
                    <input
                      type="checkbox"
                      checked={form.eticaretAktif}
                      onChange={(e) =>
                        setForm({ ...form, eticaretAktif: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    <ShoppingBag className="h-4 w-4 text-metin-ikinci" />
                    <span className="text-sm font-medium text-metin">
                      {t("kategori.eticaret-aktif")}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 rounded-md border border-kenarlik p-3 cursor-pointer hover:bg-yuzey">
                    <input
                      type="checkbox"
                      checked={form.b2bAktif}
                      onChange={(e) =>
                        setForm({ ...form, b2bAktif: e.target.checked })
                      }
                      className="h-4 w-4"
                    />
                    <Building2 className="h-4 w-4 text-metin-ikinci" />
                    <span className="text-sm font-medium text-metin">
                      {t("kategori.b2b-aktif")}
                    </span>
                  </label>
                </div>
              )}

              {aktifSekme === "icerik" && (
                <div className="max-w-4xl">
                  <RichTextEditor
                    value={form.icerik}
                    onChange={(html) => setForm({ ...form, icerik: html })}
                    placeholder={t("kategori.icerik-placeholder")}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
              <Button className="flex-1" onClick={kaydet} disabled={kaydediyor}>
                {kaydediyor && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                {seciliKat ? t("genel.guncelle") : t("genel.kaydet")}
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

      {/* Taşıma modalı */}
      {tasiModal.acik && tasiModal.kategori && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setTasiModal({ acik: false, kategori: null })}
          />
          <div className="relative w-full max-w-md bg-arkaplan rounded-lg shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-kenarlik px-6 py-4">
              <h3 className="text-base font-semibold text-metin">
                {t("genel.degistir")}: {tasiModal.kategori.ad}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTasiModal({ acik: false, kategori: null })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-3">
              <label className="text-sm font-medium text-metin">
                {t("kategori.ust-kategori")}
              </label>
              <select
                value={tasiHedef ?? ""}
                onChange={(e) =>
                  setTasiHedef(e.target.value || null)
                }
                className="w-full rounded-md border border-kenarlik bg-arkaplan px-3 py-2 text-sm text-metin focus:outline-none focus:ring-2 focus:ring-birincil"
              >
                <option value="">{t("kategori.ust-kategori-yok")}</option>
                {tasiHedefSecenekleri.map((k) => (
                  <option key={k.id} value={k.id}>
                    {"— ".repeat(Math.max(0, k.seviye - 1))}
                    {k.ad}
                  </option>
                ))}
              </select>
            </div>
            <div className="border-t border-kenarlik px-6 py-4 flex gap-3">
              <Button className="flex-1" onClick={tasimayiUygula}>
                {t("genel.kaydet")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setTasiModal({ acik: false, kategori: null })}
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
