import { AlarmClockIcon, ChevronRightIcon } from "lucide-react";

import { RelativeTime } from "~/components/RelativeTime";
import { cn } from "~/lib/utils";

import type { ScheduledRunThread } from "./scheduleModel";

/** Threads that scheduled tasks created, listed beside the coordinator's sub-threads. */
export function ScheduledRunThreads({
  runs,
  selectedThreadId,
  onOpenThread,
}: {
  runs: ReadonlyArray<ScheduledRunThread>;
  selectedThreadId: string | null;
  onOpenThread: (threadId: string) => void;
}) {
  return (
    <>
      {runs.map(({ shell, entry }) => (
        <button
          key={shell.id}
          type="button"
          onClick={() => onOpenThread(shell.id)}
          className={cn(
            "flex w-full max-w-md min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/50",
            shell.id === selectedThreadId ? "border-ring bg-accent/40" : "border-border bg-card",
          )}
        >
          <AlarmClockIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="min-w-0 truncate font-medium text-sm text-foreground">
              {shell.title || entry.task.title}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <span className="truncate">Scheduled: {entry.task.title}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                <RelativeTime timestamp={shell.updatedAt} />
              </span>
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </>
  );
}
