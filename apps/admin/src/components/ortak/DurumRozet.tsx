import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Package,
  type LucideIcon,
} from "lucide-react";
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
  etiket: string;
  ikon: LucideIcon;
  variant: "default" | "secondary" | "success" | "warning" | "danger" | "info" | "outline";
}

const DURUM_HARITA: Record<DurumAnahtar, DurumTanim> = {
  taslak: { etiket: "Taslak", ikon: Clock, variant: "secondary" },
  beklemede: { etiket: "Beklemede", ikon: Clock, variant: "warning" },
  onaylandi: { etiket: "Onaylandi", ikon: CheckCircle2, variant: "info" },
  gonderildi: { etiket: "Gonderildi", ikon: Package, variant: "info" },
  tamamlandi: { etiket: "Tamamlandi", ikon: CheckCircle2, variant: "success" },
  iptal: { etiket: "Iptal", ikon: XCircle, variant: "danger" },
  aktif: { etiket: "Aktif", ikon: CheckCircle2, variant: "success" },
  pasif: { etiket: "Pasif", ikon: AlertCircle, variant: "secondary" },
};

interface DurumRozetOzellik {
  durum: DurumAnahtar;
  ozelEtiket?: string;
  className?: string;
}

export function DurumRozet({ durum, ozelEtiket, className }: DurumRozetOzellik) {
  const tanim = DURUM_HARITA[durum];
  const Ikon = tanim.ikon;
  return (
    <Badge variant={tanim.variant} className={className}>
      <Ikon className="h-3 w-3" />
      {ozelEtiket ?? tanim.etiket}
    </Badge>
  );
}
