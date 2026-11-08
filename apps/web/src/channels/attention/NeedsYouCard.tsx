import {
  ChevronRightIcon,
  KeyRoundIcon,
  MessageCircleQuestionIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { RelativeTime } from "~/components/RelativeTime";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { ownerLabel, type AttentionItem, type AttentionKind } from "./attention";
import { useDismissAttention } from "./hooks";
import { ThreadPendingRequests } from "./PendingRequests";

const KIND: Record<
  AttentionKind,
  { label: string; Icon: ComponentType<{ className?: string }>; failed: boolean }
> = {
  approval: { label: "Approval", Icon: ShieldAlertIcon, failed: false },
  question: { label: "Question", Icon: MessageCircleQuestionIcon, failed: false },
  secret: { label: "Secret", Icon: KeyRoundIcon, failed: false },
  failed: { label: "Failed", Icon: TriangleAlertIcon, failed: true },
};

/**
 * A thing waiting on the viewer. Approvals, questions and secrets embed the classic answering
 * components (live, so mount it only where the thread is on screen); a failed run offers dismiss.
 * `compact` drops the answering body and just links through `onOpen`.
 */
export function NeedsYouCard({
  item,
  onOpen,
  compact = false,
  showOwner = true,
  cwd,
}: {
  item: AttentionItem;
  onOpen?: (() => void) | undefined;
  compact?: boolean;
  showOwner?: boolean;
  cwd?: string | undefined;
}) {
  const dismiss = useDismissAttention();
  const { label, Icon, failed } = KIND[item.kind];
  return (
    <section
      aria-label={`${label}: ${item.title}`}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-2",
        failed ? "border-destructive/32 bg-destructive/8" : "border-warning/48 bg-warning/8",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn("size-4 shrink-0", failed ? "text-destructive" : "text-warning")} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-medium text-foreground text-sm">
              {item.title}
            </span>
            <Badge variant={failed ? "error" : "warning"} size="sm">
              {label}
            </Badge>
          </span>
          <span className="truncate text-muted-foreground text-xs">
            {showOwner ? `${ownerLabel(item.owner)} · ` : ""}
            {item.detail} · <RelativeTime timestamp={item.createdAt} />
          </span>
        </span>
        {failed ? (
          <Button variant="ghost" size="xs" onClick={() => dismiss(item.id)}>
            Dismiss
          </Button>
        ) : null}
        {onOpen ? (
          <Button variant="outline" size="xs" onClick={onOpen}>
            Open
            <ChevronRightIcon />
          </Button>
        ) : null}
      </div>
      {!failed && !compact ? (
        <ThreadPendingRequests threadRef={item.threadRef} title={item.title} cwd={cwd} />
      ) : null}
    </section>
  );
}
