import { XIcon } from "lucide-react";
import { ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Button } from "~/components/ui/button";
import { useQuietThreadShell } from "~/state/entities";
import { ChannelComposer } from "./ChannelComposer";
import { ExpandWorkspaceButton } from "./ExpandWorkspaceButton";
import { authorLabel } from "./ChannelAvatar";
import { channelOwner } from "./attention/attention";
import { ThreadAttention } from "./attention/Inline";
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
        <ExpandWorkspaceButton
          environmentId={channel.environmentId}
          projectId={channel.projectId}
          threadId={childRef.threadId}
          fromThread={childRef.threadId}
          size="icon-xs"
        />
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
        key={`messages:${childThreadId}`}
        timeline={timeline}
        environmentId={channel.environmentId}
        workspaceRoot={channel.workspaceRoot}
        threadRef={childRef}
        workingLabel={`${title} is working`}
        onOpenThread={() => {}}
      />
      <ThreadAttention threadRef={childRef} owner={channelOwner(channel)} subThread title={title} />
      <ChannelComposer
        key={`composer:${childThreadId}`}
        placeholder="Reply in thread"
        onSend={(text) => sendToThread(childRef, text)}
      />
    </aside>
  );
}
