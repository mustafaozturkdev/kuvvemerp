import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-kenarlik bg-yuzey-yukseltilmis px-3 py-1 text-sm text-metin shadow-sm transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-metin",
          "placeholder:text-metin-pasif",
          "focus-visible:outline-none focus-visible:border-birincil",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
