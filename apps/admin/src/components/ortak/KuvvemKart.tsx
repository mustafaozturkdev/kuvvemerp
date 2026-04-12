import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface KuvvemKartOzellik extends React.HTMLAttributes<HTMLDivElement> {
  baslik?: string;
  altBaslik?: string;
  surukleTutamak?: boolean;
  secili?: boolean;
}

/**
 * Trello/Linear stili, surukle-birak tutamakli kart.
 * Gercek drag backend'i (dnd-kit) ayri bir story — bu component sadece
 * tutamak UI'i + hover etkilesimi saglar.
 */
export const KuvvemKart = React.forwardRef<HTMLDivElement, KuvvemKartOzellik>(
  (
    { baslik, altBaslik, surukleTutamak = false, secili = false, className, children, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        tabIndex={0}
        className={cn(
          "group relative flex flex-col gap-1 rounded-md border bg-yuzey-yukseltilmis p-3 text-left shadow-sm transition-all",
          "hover:-translate-y-0.5 hover:border-kenarlik-guclu hover:shadow-md",
          "focus-visible:border-birincil",
          secili ? "border-birincil ring-1 ring-birincil/40" : "border-kenarlik",
          className,
        )}
        {...props}
      >
        {surukleTutamak && (
          <GripVertical
            className="absolute left-1 top-1 h-4 w-4 text-metin-pasif opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
        {baslik && (
          <h4 className="text-sm font-semibold leading-tight text-metin">{baslik}</h4>
        )}
        {altBaslik && (
          <p className="text-[13px] text-metin-ikinci">{altBaslik}</p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    );
  },
);
KuvvemKart.displayName = "KuvvemKart";
