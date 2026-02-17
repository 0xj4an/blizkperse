import { Skeleton } from "@/components/ui/skeleton";

export default function CreatePayoutLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
