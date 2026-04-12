import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-birincil-zemin text-birincil",
        secondary:
          "border-transparent bg-yuzey text-metin-ikinci",
        success:
          "border-transparent bg-[color:var(--renk-basarili-zemin)] text-[color:var(--renk-basarili)]",
        warning:
          "border-transparent bg-[color:var(--renk-uyari-zemin)] text-[color:var(--renk-uyari)]",
        danger:
          "border-transparent bg-[color:var(--renk-tehlike-zemin)] text-[color:var(--renk-tehlike)]",
        info:
          "border-transparent bg-[color:var(--renk-bilgi-zemin)] text-[color:var(--renk-bilgi)]",
        outline: "border-kenarlik text-metin",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
