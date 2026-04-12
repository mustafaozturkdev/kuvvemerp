import { Toaster as SonnerToaster, type ToasterProps } from "sonner";
import { kullanTemaStore } from "@/lib/tema-store";

/**
 * Kuvvem toaster — sonner wrapper, tema senkronu.
 */
export function KuvvemToaster(props: ToasterProps) {
  const tema = kullanTemaStore((s) => s.tema);
  const cozulmusTema: "light" | "dark" =
    tema === "koyu"
      ? "dark"
      : tema === "acik"
        ? "light"
        : typeof window !== "undefined" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

  return (
    <SonnerToaster
      theme={cozulmusTema}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "border border-kenarlik bg-yuzey-yukseltilmis text-metin shadow-lg",
          description: "text-metin-ikinci",
          actionButton: "bg-birincil text-white",
          cancelButton: "bg-yuzey text-metin-ikinci",
        },
      }}
      {...props}
    />
  );
}
