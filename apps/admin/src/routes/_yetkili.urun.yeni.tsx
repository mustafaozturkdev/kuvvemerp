import { createFileRoute } from "@tanstack/react-router";
import { UrunFormSayfasi } from "@/components/urun/UrunFormSayfasi";

export const Route = createFileRoute("/_yetkili/urun/yeni")({
  component: () => <UrunFormSayfasi />,
});
