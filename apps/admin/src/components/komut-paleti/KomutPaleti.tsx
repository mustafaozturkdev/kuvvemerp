import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import { kullanCmdKStore, kullanCmdKKisayol } from "@/hooks/use-cmd-k";
import { KOMUT_LISTESI, grupluKomutlar, type Komut } from "./komut-listesi";
import { yetkiVarMi } from "@/lib/yetki";
import { kullanTema } from "@/hooks/use-tema";
import { kullanKullanici } from "@/hooks/use-kullanici";
import { toast } from "@/hooks/use-toast";

export function KomutPaleti() {
  kullanCmdKKisayol();

  const acik = kullanCmdKStore((s) => s.acik);
  const degistir = kullanCmdKStore((s) => s.degistir);
  const kapat = kullanCmdKStore((s) => s.kapat);
  const deger = kullanCmdKStore((s) => s.deger);
  const degerAyarla = kullanCmdKStore((s) => s.degerAyarla);
  const gecmisEkle = kullanCmdKStore((s) => s.gecmisEkle);
  const gecmis = kullanCmdKStore((s) => s.gecmis);

  const yonlendir = useNavigate();
  const { temaToggle } = kullanTema();
  const { cikis, girisYapilmis } = kullanKullanici();
  const { i18n } = useTranslation();

  const gorunurKomutlar = useMemo(() => {
    return KOMUT_LISTESI.filter((k) => {
      if (!k.izin) return true;
      // Auth yoksa sistem komutlari gozukmesin
      if (!girisYapilmis) return false;
      return yetkiVarMi(k.izin);
    });
  }, [girisYapilmis]);

  const gruplu = useMemo(() => grupluKomutlar(gorunurKomutlar), [gorunurKomutlar]);

  const sonKullanilanlar = useMemo(() => {
    return gecmis
      .map((id) => gorunurKomutlar.find((k) => k.id === id))
      .filter((k): k is Komut => Boolean(k))
      .slice(0, 5);
  }, [gecmis, gorunurKomutlar]);

  const calistir = (komut: Komut) => {
    gecmisEkle(komut.id);
    kapat();

    if (komut.hedef) {
      void yonlendir({ to: komut.hedef });
      return;
    }
    switch (komut.eylem) {
      case "tema-degistir":
        temaToggle();
        toast.bilgi("Tema degistirildi");
        break;
      case "dil-degistir": {
        const sonraki = i18n.language === "tr" ? "en" : "tr";
        void i18n.changeLanguage(sonraki);
        toast.bilgi(`Dil: ${sonraki.toUpperCase()}`);
        break;
      }
      case "cikis":
        cikis();
        void yonlendir({ to: "/giris" });
        break;
    }
  };

  return (
    <CommandDialog open={acik} onOpenChange={degistir}>
      <CommandInput
        placeholder="Ne yapmak istersin?"
        value={deger}
        onValueChange={degerAyarla}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-6">
            <span className="text-3xl" aria-hidden="true">🤔</span>
            <p className="text-sm text-metin-ikinci">
              "{deger}" icin sonuc bulunamadi
            </p>
          </div>
        </CommandEmpty>

        {!deger && sonKullanilanlar.length > 0 && (
          <>
            <CommandGroup heading="Son Kullanilanlar">
              {sonKullanilanlar.map((k) => (
                <KomutSatir key={`son-${k.id}`} komut={k} onSec={() => calistir(k)} />
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {Object.entries(gruplu).map(([baslik, komutlar]) => (
          <CommandGroup key={baslik} heading={baslik}>
            {komutlar.map((k) => (
              <KomutSatir key={k.id} komut={k} onSec={() => calistir(k)} />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-3 border-t border-kenarlik px-3 py-2 text-[11px] text-metin-pasif">
        <span>
          <kbd className="rounded border border-kenarlik bg-yuzey px-1">↑</kbd>
          <kbd className="ml-1 rounded border border-kenarlik bg-yuzey px-1">↓</kbd>
          <span className="ml-1">gezin</span>
        </span>
        <span>
          <kbd className="rounded border border-kenarlik bg-yuzey px-1">↵</kbd>
          <span className="ml-1">sec</span>
        </span>
        <span className="ml-auto">
          <kbd className="rounded border border-kenarlik bg-yuzey px-1">Esc</kbd>
          <span className="ml-1">kapat</span>
        </span>
      </div>
    </CommandDialog>
  );
}

function KomutSatir({ komut, onSec }: { komut: Komut; onSec: () => void }) {
  const Ikon = komut.ikon;
  const arama = [komut.etiket, ...(komut.anahtarKelime ?? [])].join(" ");
  return (
    <CommandItem
      value={`${komut.id} ${arama}`}
      onSelect={onSec}
      aria-label={komut.etiket}
    >
      <Ikon />
      <span>{komut.etiket}</span>
      {komut.kisayol && (
        <CommandShortcut>
          {komut.kisayol.map((t) => (
            <kbd
              key={t}
              className="rounded border border-kenarlik bg-yuzey px-1.5 py-0.5 text-[10px]"
            >
              {t}
            </kbd>
          ))}
        </CommandShortcut>
      )}
    </CommandItem>
  );
}
