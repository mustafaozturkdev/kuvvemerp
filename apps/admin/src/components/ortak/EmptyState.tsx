import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateOzellik {
  baslik: string;
  aciklama?: string;
  ikon?: LucideIcon;
  eylem?: {
    etiket: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  baslik,
  aciklama,
  ikon: Ikon = Inbox,
  eylem,
  className,
}: EmptyStateOzellik) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-kenarlik bg-yuzey/30 p-12 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-birincil-zemin text-birincil">
        <Ikon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-metin">{baslik}</h3>
      {aciklama && (
        <p className="max-w-sm text-sm text-metin-ikinci">{aciklama}</p>
      )}
      {eylem && (
        <Button className="mt-2" onClick={eylem.onClick}>
          {eylem.etiket}
        </Button>
      )}
    </div>
  );
}
