import { createFileRoute, useParams } from "@tanstack/react-router";
import { UrunFormSayfasi } from "@/components/urun/UrunFormSayfasi";

export const Route = createFileRoute("/_yetkili/urun/$urunId")({
  component: UrunDuzenle,
});

function UrunDuzenle() {
  const { urunId } = useParams({ from: "/_yetkili/urun/$urunId" });
  return <UrunFormSayfasi urunId={urunId} />;
}
