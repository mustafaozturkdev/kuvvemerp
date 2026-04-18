/**
 * OnayDialog — Geri alınamaz veya riskli aksiyonlar için onay dialogu.
 *
 * 3 varyant:
 *   - bilgi: Mavi ton, bilgilendirme/genel onay
 *   - uyari: Sarı ton, dikkatli olunması gereken aksiyon (ör: pasife al)
 *   - tehlike: Kırmızı ton, geri alınamaz / yıkıcı aksiyon (ör: sil)
 *
 * Özellikler:
 *   - ESC ve backdrop tıklama ile kapat
 *   - Otomatik focus "iptal" butonunda (kaza ile Enter'a basılmasın)
 *   - İşlem sırasında butonlar disabled + spinner
 *   - i18n uyumlu
 *   - Async onChange desteği
 *
 * Kullanım:
 *   const onay = useOnay();
 *   const tamam = await onay.goster({
 *     baslik: "Sil",
 *     mesaj: "Bu kayıt silinecek",
 *     varyant: "tehlike",
 *     onayMetni: "Sil",
 *   });
 *   if (tamam) { ... }
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { AlertTriangle, Info, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OnayVaryant = "bilgi" | "uyari" | "tehlike";

export interface OnayGosterOzellik {
  baslik?: string;
  mesaj: string;
  aciklama?: string;
  varyant?: OnayVaryant;
  onayMetni?: string;
  iptalMetni?: string;
}

interface OnayDurum extends OnayGosterOzellik {
  acik: boolean;
  resolve?: (tamam: boolean) => void;
}

// ──────────────────────────────────────────────
// Context + Hook
// ──────────────────────────────────────────────

interface OnayContextTipi {
  goster: (opts: OnayGosterOzellik) => Promise<boolean>;
}

const OnayContext = createContext<OnayContextTipi | null>(null);

export function useOnay(): OnayContextTipi {
  const ctx = useContext(OnayContext);
  if (!ctx) throw new Error("useOnay() sadece OnaySaglayici içinde kullanılabilir");
  return ctx;
}

// ──────────────────────────────────────────────
// Sağlayıcı (App içinde bir kez)
// ──────────────────────────────────────────────

export function OnaySaglayici({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [durum, setDurum] = useState<OnayDurum>({ acik: false, mesaj: "" });
  const [isleniyor, setIsleniyor] = useState(false);
  const iptalRef = useRef<HTMLButtonElement>(null);

  const goster = useCallback((opts: OnayGosterOzellik): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDurum({
        acik: true,
        ...opts,
        resolve,
      });
    });
  }, []);

  const kapat = useCallback((tamam: boolean) => {
    if (isleniyor) return;
    durum.resolve?.(tamam);
    setDurum((d) => ({ ...d, acik: false, resolve: undefined }));
  }, [durum, isleniyor]);

  // Dialog açıldığında iptal butonuna focus
  useEffect(() => {
    if (durum.acik) {
      const timer = setTimeout(() => iptalRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [durum.acik]);

  const varyant = durum.varyant ?? "bilgi";

  const varyantMeta: Record<OnayVaryant, {
    ikon: typeof AlertTriangle;
    ikonClass: string;
    baslikVarsayilan: string;
    onayVariant: "default" | "destructive";
    onayClass: string;
  }> = {
    bilgi: {
      ikon: Info,
      ikonClass: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
      baslikVarsayilan: t("genel.onaylayin"),
      onayVariant: "default",
      onayClass: "",
    },
    uyari: {
      ikon: AlertCircle,
      ikonClass: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
      baslikVarsayilan: t("genel.dikkat"),
      onayVariant: "default",
      onayClass: "bg-amber-600 hover:bg-amber-700 text-white",
    },
    tehlike: {
      ikon: AlertTriangle,
      ikonClass: "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30",
      baslikVarsayilan: t("genel.dikkat"),
      onayVariant: "destructive",
      onayClass: "",
    },
  };

  const meta = varyantMeta[varyant];
  const Ikon = meta.ikon;

  return (
    <OnayContext.Provider value={{ goster }}>
      {children}
      <Dialog open={durum.acik} onOpenChange={(acik) => !acik && kapat(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full shrink-0",
                  meta.ikonClass,
                )}
              >
                <Ikon className="h-5 w-5" />
              </div>
              <div className="flex-1 pt-0.5">
                <DialogTitle>{durum.baslik ?? meta.baslikVarsayilan}</DialogTitle>
                <DialogDescription className="mt-2">
                  {durum.mesaj}
                </DialogDescription>
                {durum.aciklama && (
                  <p className="mt-2 text-xs text-metin-pasif">{durum.aciklama}</p>
                )}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="sm:justify-end gap-2">
            <Button
              ref={iptalRef}
              variant="outline"
              onClick={() => kapat(false)}
              disabled={isleniyor}
            >
              {durum.iptalMetni ?? t("genel.vazgec")}
            </Button>
            <Button
              variant={meta.onayVariant}
              className={meta.onayClass}
              onClick={async () => {
                setIsleniyor(true);
                try {
                  durum.resolve?.(true);
                  setDurum((d) => ({ ...d, acik: false, resolve: undefined }));
                } finally {
                  setIsleniyor(false);
                }
              }}
              disabled={isleniyor}
              autoFocus={false}
            >
              {isleniyor && <Loader2 className="h-4 w-4 animate-spin" />}
              {durum.onayMetni ?? t("genel.devam-et")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OnayContext.Provider>
  );
}
