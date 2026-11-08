import { ChevronRightIcon, MessageSquareIcon } from "lucide-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { RelativeTime } from "~/components/RelativeTime";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { SubThreadStatus, SubThreadSummary } from "./types";

type BadgeVariant = "info" | "warning" | "success" | "error" | "secondary";

const STATUS_CHIP: Record<SubThreadStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Queued", variant: "secondary" },
  running: { label: "Working", variant: "info" },
  waiting: { label: "Waiting", variant: "warning" },
  completed: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "error" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  interrupted: { label: "Interrupted", variant: "secondary" },
  idle: { label: "Idle", variant: "secondary" },
};

export function ThreadStatusChip({ status }: { status: SubThreadStatus }) {
  const chip = STATUS_CHIP[status];
  return (
    <Badge variant={chip.variant} size="sm">
      {chip.label}
    </Badge>
  );
}

export function ThreadCard({
  thread,
  selected = false,
  onOpenThread,
}: {
  thread: SubThreadSummary;
  selected?: boolean;
  onOpenThread: (childRef: ScopedThreadRef) => void;
}) {
  const childRef = thread.childRef;
  return (
    <button
      type="button"
      disabled={childRef === null}
      onClick={() => {
        if (childRef) onOpenThread(childRef);
      }}
      className={cn(
        "flex w-full max-w-md min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent",
        thread.needsAttention
          ? "border-warning/48 bg-warning/8"
          : selected
            ? "border-ring bg-accent/40"
            : "border-border bg-card",
      )}
    >
      <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-sm text-foreground">
            {thread.title}
          </span>
          <ThreadStatusChip status={thread.status} />
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span>
            {thread.needsAttention
              ? "Needs your attention"
              : thread.replyCount > 0
                ? `${thread.replyCount} ${thread.replyCount === 1 ? "reply" : "replies"}`
                : "View thread"}
          </span>
          {thread.lastActivityAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                last reply <RelativeTime timestamp={thread.lastActivityAt} />
              </span>
            </>
          ) : null}
        </span>
      </span>
      {childRef ? <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" /> : null}
    </button>
  );
}
