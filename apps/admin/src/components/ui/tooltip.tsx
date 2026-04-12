import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimum bagimli tooltip — Radix tooltip'e ihtiyac duymadan CSS ile calisir.
 * Hover ve focus durumunda gosterim yapar.
 */
interface TooltipProps {
  icerik: React.ReactNode;
  taraf?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
  className?: string;
}

const TARAF_SINIF: Record<NonNullable<TooltipProps["taraf"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 -translate-y-1 mb-1",
  bottom: "top-full left-1/2 -translate-x-1/2 translate-y-1 mt-1",
  left: "right-full top-1/2 -translate-y-1/2 -translate-x-1 mr-1",
  right: "left-full top-1/2 -translate-y-1/2 translate-x-1 ml-1",
};

export function Tooltip({ icerik, taraf = "top", children, className }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[130] whitespace-nowrap rounded-md border border-kenarlik bg-yuzey-yukseltilmis px-2 py-1 text-[11px] font-medium text-metin opacity-0 shadow-md transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          TARAF_SINIF[taraf],
          className,
        )}
      >
        {icerik}
      </span>
    </span>
  );
}
