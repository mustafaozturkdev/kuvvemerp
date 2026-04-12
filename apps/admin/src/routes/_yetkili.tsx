import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { kullanAuthStore } from "@/lib/auth-store";
import { KuvvemLayout } from "@/components/layout/KuvvemLayout";

export const Route = createFileRoute("/_yetkili")({
  beforeLoad: ({ location }) => {
    const token = kullanAuthStore.getState().accessToken;
    if (!token) {
      throw redirect({
        to: "/giris",
        search: { yonlendir: location.pathname },
      });
    }
  },
  component: YetkiliLayout,
});

function YetkiliLayout() {
  return (
    <KuvvemLayout>
      <Outlet />
    </KuvvemLayout>
  );
}
