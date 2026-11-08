import type { ScopedThreadRef } from "@t3tools/contracts";

import type { AttentionOwner } from "./attention";
import { useAttentionItems, useThreadAttentionItems } from "./hooks";
import { NeedsYouCard } from "./NeedsYouCard";
import { ThreadPendingRequests } from "./PendingRequests";

const MAX_SUB_THREAD_CARDS = 3;

/**
 * What an on-screen thread (coordinator, sub-thread or agent) needs from the viewer, placed just
 * above its composer: the live requests plus a card for a failed run. The thread's projection is
 * already loaded because its timeline is on screen.
 */
export function ThreadAttention({
  threadRef,
  owner,
  subThread,
  title,
}: {
  threadRef: ScopedThreadRef | null;
  owner: AttentionOwner;
  subThread: boolean;
  title: string;
}) {
  const items = useThreadAttentionItems(threadRef, owner, subThread);
  if (threadRef === null) return null;
  const failed = items.filter((item) => item.kind === "failed");
  return (
    <div className="flex flex-col gap-2 px-5 pb-2 empty:hidden">
      <ThreadPendingRequests
        threadRef={threadRef}
        title={title}
        cwd={owner.kind === "channel" ? owner.workspaceRoot : undefined}
      />
      {failed.map((item) => (
        <NeedsYouCard key={item.id} item={item} compact showOwner={false} />
      ))}
    </div>
  );
}

/** Compact cards in the channel feed for sub-threads that need the viewer, each linking to its thread. */
export function SubThreadAttention({
  channelKey,
  openThreadId,
  onOpenThread,
}: {
  channelKey: string;
  openThreadId: string | null;
  onOpenThread: (childThreadId: string) => void;
}) {
  const items = useAttentionItems().filter(
    (item) =>
      item.subThread &&
      item.owner.kind === "channel" &&
      item.owner.key === channelKey &&
      item.threadRef.threadId !== openThreadId,
  );
  if (items.length === 0) return null;
  const hidden = items.length - MAX_SUB_THREAD_CARDS;
  return (
    <div className="flex flex-col gap-2 px-5 pb-2">
      {items.slice(0, MAX_SUB_THREAD_CARDS).map((item) => (
        <NeedsYouCard
          key={item.id}
          item={item}
          compact
          showOwner={false}
          onOpen={() => onOpenThread(item.threadRef.threadId)}
        />
      ))}
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">
          {hidden} more {hidden === 1 ? "thread needs" : "threads need"} you. See Activity.
        </p>
      ) : null}
    </div>
  );
}
