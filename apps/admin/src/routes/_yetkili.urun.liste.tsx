import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { ParaTutar } from "@/components/ortak/ParaTutar";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_yetkili/urun/liste")({
  component: UrunListe,
});

interface Urun {
  id: string;
  kod: string;
  ad: string;
  kategori: string;
  stok: number;
  fiyat: number;
  durum: "aktif" | "pasif";
}

const ORNEK_URUN: Urun[] = [
  { id: "u1", kod: "URN-1001", ad: "Erkek Klasik Gomlek Beyaz", kategori: "Tekstil", stok: 48, fiyat: 459.90, durum: "aktif" },
  { id: "u2", kod: "URN-1002", ad: "Kadin Yazlik Elbise", kategori: "Tekstil", stok: 12, fiyat: 899.00, durum: "aktif" },
  { id: "u3", kod: "URN-1003", ad: "Bluetooth Kulaklik", kategori: "Elektronik", stok: 3, fiyat: 1_299.00, durum: "aktif" },
  { id: "u4", kod: "URN-1004", ad: "Deri Kemer Kahve", kategori: "Aksesuar", stok: 0, fiyat: 349.90, durum: "aktif" },
  { id: "u5", kod: "URN-1005", ad: "Termos 1 Litre", kategori: "Ev", stok: 67, fiyat: 229.00, durum: "pasif" },
];

function UrunListe() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("urun.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">{ORNEK_URUN.length} urun</p>
        </div>
        <Button>
          <Plus />
          {t("urun.yeni-ekle")}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
            <Input placeholder={`${t("genel.ara")}...`} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("urun.kod")}</TableHead>
                <TableHead>{t("urun.ad")}</TableHead>
                <TableHead>{t("urun.kategori")}</TableHead>
                <TableHead className="text-right">{t("urun.stok")}</TableHead>
                <TableHead className="text-right">{t("urun.fiyat")}</TableHead>
                <TableHead>{t("urun.durum")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ORNEK_URUN.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-metin-ikinci">{u.kod}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-yuzey">
                        <Package className="h-4 w-4 text-metin-ikinci" />
                      </div>
                      <span className="font-medium text-metin">{u.ad}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{u.kategori}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.stok === 0 ? (
                      <Badge variant="danger">Tükendi</Badge>
                    ) : u.stok < 5 ? (
                      <Badge variant="warning">{u.stok} adet</Badge>
                    ) : (
                      <span className="tabular-nums">{u.stok}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ParaTutar tutar={u.fiyat} />
                  </TableCell>
                  <TableCell>
                    <DurumRozet durum={u.durum} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
