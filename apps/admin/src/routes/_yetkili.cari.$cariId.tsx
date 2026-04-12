import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone, MapPin, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ParaTutar } from "@/components/ortak/ParaTutar";
import { DurumRozet } from "@/components/ortak/DurumRozet";
import { TarihGosterim } from "@/components/ortak/TarihGosterim";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_yetkili/cari/$cariId")({
  component: CariDetay,
});

function CariDetay() {
  const { cariId } = Route.useParams();
  const { t } = useTranslation();

  // Mock data — gercek API entegrasyonu ileride
  const cari = {
    id: cariId,
    kod: "M-001",
    unvan: "Acme Tekstil Ltd. Sti.",
    telefon: "+90 212 555 1200",
    email: "info@acme.tr",
    adres: "Merkez Mah. Kuvvem Sok. No:5, Istanbul",
    vergiNo: "1234567890",
    bakiye: 12_450,
    acilisTarihi: "2023-06-15T00:00:00Z",
  };

  const hareketler = [
    { id: "h1", tarih: "2026-04-10T10:14:00Z", aciklama: "SIP-2041 Satis", borc: 0, alacak: 12_450, durum: "tamamlandi" as const },
    { id: "h2", tarih: "2026-04-05T14:22:00Z", aciklama: "Tahsilat", borc: 8_000, alacak: 0, durum: "tamamlandi" as const },
    { id: "h3", tarih: "2026-03-28T09:10:00Z", aciklama: "SIP-2012 Satis", borc: 0, alacak: 8_000, durum: "tamamlandi" as const },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/cari">
            <ArrowLeft /> {t("cari.liste-baslik")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6 md:flex-row md:items-start">
          <Avatar adSoyad={cari.unvan} boyut="lg" />
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-metin">
                  {cari.unvan}
                </h1>
                <p className="font-mono text-sm text-metin-ikinci">{cari.kod}</p>
              </div>
              <DurumRozet durum="aktif" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <InfoSatir ikon={Phone} etiket={t("cari.telefon")} deger={cari.telefon} />
              <InfoSatir ikon={Mail} etiket={t("cari.email")} deger={cari.email} />
              <InfoSatir ikon={MapPin} etiket="Adres" deger={cari.adres} />
              <InfoSatir
                ikon={FileText}
                etiket={t("cari.vergi-no")}
                deger={cari.vergiNo}
              />
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-kenarlik bg-yuzey p-4 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
              {t("cari.bakiye")}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              <ParaTutar tutar={cari.bakiye} isaretliRenk />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Son Hareketler</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih</TableHead>
                <TableHead>Aciklama</TableHead>
                <TableHead className="text-right">Borc</TableHead>
                <TableHead className="text-right">Alacak</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hareketler.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>
                    <TarihGosterim tarih={h.tarih} format="kisa" />
                  </TableCell>
                  <TableCell>{h.aciklama}</TableCell>
                  <TableCell className="text-right">
                    <ParaTutar tutar={h.borc} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ParaTutar tutar={h.alacak} />
                  </TableCell>
                  <TableCell>
                    <DurumRozet durum={h.durum} />
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

function InfoSatir({
  ikon: Ikon,
  etiket,
  deger,
}: {
  ikon: React.ComponentType<{ className?: string }>;
  etiket: string;
  deger: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Ikon className="mt-0.5 h-4 w-4 text-metin-pasif" />
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-metin-ikinci">
          {etiket}
        </div>
        <div className="text-metin">{deger}</div>
      </div>
    </div>
  );
}
