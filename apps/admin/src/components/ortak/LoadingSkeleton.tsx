import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingSkeletonOzellik {
  tip?: "tablo" | "kart" | "satir" | "kpi";
  satirSayisi?: number;
  className?: string;
}

export function LoadingSkeleton({
  tip = "satir",
  satirSayisi = 5,
  className,
}: LoadingSkeletonOzellik) {
  if (tip === "kpi") {
    return (
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-kenarlik bg-yuzey-yukseltilmis p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (tip === "kart") {
    return (
      <div className={cn("rounded-lg border border-kenarlik bg-yuzey-yukseltilmis p-5", className)}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-5/6" />
      </div>
    );
  }

  if (tip === "tablo") {
    return (
      <div className={cn("rounded-lg border border-kenarlik bg-yuzey-yukseltilmis", className)}>
        <div className="flex items-center gap-4 border-b border-kenarlik px-4 py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: satirSayisi }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-kenarlik px-4 py-3 last:border-0"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: satirSayisi }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
