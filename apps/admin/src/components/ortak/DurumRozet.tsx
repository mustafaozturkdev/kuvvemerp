import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export type DurumAnahtar =
  | "taslak"
  | "onaylandi"
  | "beklemede"
  | "tamamlandi"
  | "iptal"
  | "gonderildi"
  | "aktif"
  | "pasif";

interface DurumTanim {
  etiketKey: string;
  ikon: LucideIcon;
  variant: "default" | "secondary" | "success" | "warning" | "danger" | "info" | "outline";
}

const DURUM_HARITA: Record<DurumAnahtar, DurumTanim> = {
  taslak: { etiketKey: "durum.taslak", ikon: Clock, variant: "secondary" },
  beklemede: { etiketKey: "durum.beklemede", ikon: Clock, variant: "warning" },
  onaylandi: { etiketKey: "durum.onaylandi", ikon: CheckCircle2, variant: "info" },
  gonderildi: { etiketKey: "durum.gonderildi", ikon: Package, variant: "info" },
  tamamlandi: { etiketKey: "durum.tamamlandi", ikon: CheckCircle2, variant: "success" },
  iptal: { etiketKey: "durum.iptal", ikon: XCircle, variant: "danger" },
  aktif: { etiketKey: "durum.aktif", ikon: CheckCircle2, variant: "success" },
  pasif: { etiketKey: "durum.pasif", ikon: AlertCircle, variant: "secondary" },
};

interface DurumRozetOzellik {
  durum: DurumAnahtar;
  ozelEtiket?: string;
  className?: string;
}

export function DurumRozet({ durum, ozelEtiket, className }: DurumRozetOzellik) {
  const { t } = useTranslation();
  const tanim = DURUM_HARITA[durum];
  const Ikon = tanim.ikon;
  return (
    <Badge variant={tanim.variant} className={className}>
      <Ikon className="h-3 w-3" />
      {ozelEtiket ?? t(tanim.etiketKey)}
    </Badge>
  );
}
