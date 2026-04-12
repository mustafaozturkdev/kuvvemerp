import { kullanTemaStore, type Tema } from "@/lib/tema-store";

/**
 * Tema toggle helper — mevcut store'u wrap'ler.
 */
export function kullanTema() {
  const tema = kullanTemaStore((s) => s.tema);
  const temaDegistir = kullanTemaStore((s) => s.temaDegistir);

  const sonraki = (): Tema => {
    if (tema === "acik") return "koyu";
    if (tema === "koyu") return "sistem";
    return "acik";
  };

  return {
    tema,
    temaDegistir,
    temaToggle: () => temaDegistir(sonraki()),
  };
}
