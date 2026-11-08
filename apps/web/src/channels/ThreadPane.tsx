import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Button } from "~/components/ui/button";
import { useQuietThreadShell } from "~/state/entities";
import { ChannelComposer } from "./ChannelComposer";
import { authorLabel } from "./ChannelAvatar";
import { MessageList } from "./MessageList";
import { ThreadStatusChip } from "./ThreadCard";
import { useChannelTimeline, useSendToThread } from "./hooks";
import type { Channel, ChannelMessage, SubThreadSummary } from "./types";

export function ThreadPane({
  channel,
  childThreadId,
  thread,
  parentMessage,
  onClose,
}: {
  channel: Channel;
  childThreadId: string;
  /** Summary from the channel's sub-thread list, when it has loaded. */
  thread: SubThreadSummary | null;
  /** The coordinator message that spawned this thread. */
  parentMessage: Extract<ChannelMessage, { kind: "message" }> | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const childRef = scopeThreadRef(channel.environmentId, ThreadId.make(childThreadId));
  const shell = useQuietThreadShell(childRef);
  const title = thread?.title ?? shell?.title ?? "Thread";
  const timeline = useChannelTimeline(childRef, { kind: "worker", title });
  const sendToThread = useSendToThread();

  return (
    <aside className="flex h-full min-w-0 flex-col border-border border-l bg-background">
      <header className="flex items-center gap-2 border-border border-b px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-semibold text-sm">{title}</span>
            {thread ? <ThreadStatusChip status={thread.status} /> : null}
          </span>
          <span className="text-muted-foreground text-xs">Thread in #{channel.name}</span>
        </div>
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            void navigate({
              to: "/$environmentId/$threadId",
              params: { environmentId: childRef.environmentId, threadId: childRef.threadId },
            })
          }
        >
          <ExternalLinkIcon />
          Open in classic view
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Close thread" onClick={onClose}>
          <XIcon />
        </Button>
      </header>
      {parentMessage ? (
        <div className="border-border border-b bg-muted/40 px-4 py-2 text-xs">
          <div className="font-medium text-foreground">{authorLabel(parentMessage.author)}</div>
          <p className="line-clamp-3 text-muted-foreground">{parentMessage.text}</p>
        </div>
      ) : null}
      <MessageList
        key={childThreadId}
        timeline={timeline}
        environmentId={channel.environmentId}
        workspaceRoot={channel.workspaceRoot}
        threadRef={childRef}
        workingLabel={`${title} is working`}
        onOpenThread={() => {}}
      />
      <ChannelComposer
        key={childThreadId}
        placeholder="Reply in thread"
        onSend={(text) => sendToThread(childRef, text)}
      />
    </aside>
  );
}
