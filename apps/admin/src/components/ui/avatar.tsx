import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  adSoyad?: string;
  boyut?: "sm" | "md" | "lg";
}

function bashHarfler(isim?: string): string {
  if (!isim) return "?";
  const parcalar = isim.trim().split(/\s+/);
  if (parcalar.length === 1) return parcalar[0].slice(0, 2).toUpperCase();
  return (parcalar[0][0] + parcalar[parcalar.length - 1][0]).toUpperCase();
}

const BOYUT_SINIF: Record<Required<AvatarProps>["boyut"], string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, adSoyad, boyut = "md", ...props }, ref) => {
    const { t } = useTranslation();
    const [hata, setHata] = React.useState(false);
    const gosterimResim = src && !hata;
    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-birincil-zemin font-semibold text-birincil",
          BOYUT_SINIF[boyut],
          className,
        )}
        aria-label={adSoyad ?? t("menu.kullanici")}
        {...props}
      >
        {gosterimResim ? (
          <img
            src={src}
            alt={adSoyad ?? ""}
            className="h-full w-full object-cover"
            onError={() => setHata(true)}
          />
        ) : (
          <span>{bashHarfler(adSoyad)}</span>
        )}
      </div>
    );
  },
);
Avatar.displayName = "Avatar";

export { Avatar };
