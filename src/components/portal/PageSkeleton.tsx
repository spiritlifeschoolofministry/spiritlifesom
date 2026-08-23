import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  /** Stat cards above the main panel. 0 leaves the row out entirely. */
  stats?: number;
  /** Panels below the stats — the first is tall, the rest are half height. */
  panels?: number;
  /**
   * What the page is waiting on, for the screens where that isn't obvious and
   * the wait is long enough to worry someone (Storage talks to two providers).
   */
  hint?: string;
}

/**
 * The shape a portal page loads into: a title, an optional row of stat cards,
 * and the main panel(s). Pages differ only in how many of each they have, so
 * the whole portal loads one recognisable way instead of a different spinner
 * per screen.
 */
export function PageSkeleton({ stats = 0, panels = 1, hint }: PageSkeletonProps) {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{hint || "Loading"}</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        {hint ? (
          <p className="text-sm text-muted-foreground" aria-hidden="true">
            {hint}
          </p>
        ) : (
          <Skeleton className="h-4 w-80 max-w-full" />
        )}
      </div>

      {/* Two cards means a pair of wide summary panels (Storage's providers);
          three or more means the usual row of small stat tiles. */}
      {stats > 0 && (
        <div
          className={
            stats === 2
              ? "grid gap-4 md:grid-cols-2"
              : "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          }
        >
          {Array.from({ length: stats }, (_, i) => (
            <Skeleton key={i} className={stats === 2 ? "h-40 rounded-xl" : "h-24 rounded-xl"} />
          ))}
        </div>
      )}

      {Array.from({ length: panels }, (_, i) => (
        <Skeleton key={i} className={i === 0 ? "h-96 rounded-xl" : "h-48 rounded-xl"} />
      ))}
    </div>
  );
}

export default PageSkeleton;
