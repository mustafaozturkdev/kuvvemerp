import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { ParaTutar } from "@/components/ortak/ParaTutar";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { Avatar } from "@/components/ui/avatar";

export const Route = createFileRoute("/_yetkili/cari/")({
  component: CariListe,
});

interface Cari {
  id: string;
  kod: string;
  unvan: string;
  telefon: string;
  email: string;
  bakiye: number;
  durum: "aktif" | "pasif";
}

const ORNEK_CARI: Cari[] = [
  { id: "c1", kod: "M-001", unvan: "Acme Tekstil Ltd.", telefon: "0212 555 1200", email: "info@acme.tr", bakiye: 12_450, durum: "aktif" },
  { id: "c2", kod: "M-002", unvan: "Mavi Deniz A.S.", telefon: "0216 555 3400", email: "muhasebe@maviderniz.tr", bakiye: -2_350, durum: "aktif" },
  { id: "c3", kod: "M-003", unvan: "Demir Insaat", telefon: "0312 555 7800", email: "info@demir.tr", bakiye: 58_700, durum: "aktif" },
  { id: "c4", kod: "M-004", unvan: "Gunes Market", telefon: "0224 555 6100", email: "satis@gunes.com", bakiye: 0, durum: "pasif" },
  { id: "c5", kod: "M-005", unvan: "Yildiz Elektronik", telefon: "0232 555 9300", email: "info@yildiz.tr", bakiye: 9_600, durum: "aktif" },
];

function CariListe() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-metin">
            {t("cari.liste-baslik")}
          </h1>
          <p className="text-sm text-metin-ikinci">
            {ORNEK_CARI.length} kayit
          </p>
        </div>
        <Button>
          <Plus />
          {t("cari.yeni-ekle")}
        </Button>
      </header>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="sr-only">Musteri listesi</CardTitle>
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-metin-pasif" />
              <Input placeholder={`${t("genel.ara")}...`} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("cari.kod")}</TableHead>
                <TableHead>{t("cari.unvan")}</TableHead>
                <TableHead>{t("cari.telefon")}</TableHead>
                <TableHead className="text-right">{t("cari.bakiye")}</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ORNEK_CARI.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell className="font-mono text-metin-ikinci">
                    {c.kod}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/cari/$cariId"
                      params={{ cariId: c.id }}
                      className="flex items-center gap-3"
                    >
                      <Avatar adSoyad={c.unvan} boyut="sm" />
                      <div>
                        <div className="font-medium text-metin group-hover:text-birincil">
                          {c.unvan}
                        </div>
                        <div className="text-[12px] text-metin-ikinci">
                          {c.email}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-metin-ikinci">{c.telefon}</TableCell>
                  <TableCell className="text-right">
                    <ParaTutar tutar={c.bakiye} isaretliRenk />
                  </TableCell>
                  <TableCell>
                    <DurumRozet durum={c.durum} />
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
