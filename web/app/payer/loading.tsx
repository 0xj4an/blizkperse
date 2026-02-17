import { Skeleton } from "@/components/ui/skeleton";

export default function PayerLoading() {
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Table header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Table */}
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
