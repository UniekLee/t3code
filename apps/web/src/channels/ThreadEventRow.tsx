import { CheckCircle2Icon, CircleDotIcon, XCircleIcon } from "lucide-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { RelativeTime } from "~/components/RelativeTime";
import { Button } from "~/components/ui/button";
import type { ChannelMessage } from "./types";

type ThreadEvent = Extract<ChannelMessage, { kind: "thread-event" }>;

function EventIcon({ outcome }: { outcome: ThreadEvent["outcome"] }) {
  if (outcome === "completed") return <CheckCircle2Icon className="size-3.5 text-success" />;
  if (outcome === "failed") return <XCircleIcon className="size-3.5 text-destructive" />;
  return <CircleDotIcon className="size-3.5" />;
}

export function ThreadEventRow({
  event,
  onOpenThread,
}: {
  event: ThreadEvent;
  onOpenThread: (childRef: ScopedThreadRef) => void;
}) {
  const childRef = event.subThread?.childRef ?? null;
  return (
    <div className="flex items-center gap-2 px-5 py-1 text-muted-foreground text-xs">
      <span className="flex w-9 shrink-0 justify-center">
        <EventIcon outcome={event.outcome} />
      </span>
      <span className="min-w-0 truncate">{event.summary}</span>
      {childRef ? (
        <Button variant="link" size="xs" onClick={() => onOpenThread(childRef)}>
          View thread
        </Button>
      ) : null}
      <span className="shrink-0">
        <RelativeTime timestamp={event.createdAt} />
      </span>
    </div>
  );
}
