import { toastManager } from "~/components/ui/toast";
import { ChannelComposer } from "./ChannelComposer";
import { ChannelHeader } from "./ChannelHeader";
import { NewChannelEmptyState } from "./EmptyStates";
import { MessageList } from "./MessageList";
import { ThreadCard } from "./ThreadCard";
import { ThreadPane } from "./ThreadPane";
import {
  useAgents,
  useChannelTimeline,
  useMarkSeen,
  useSendToChannel,
  useSubThreads,
} from "./hooks";
import { parseMention } from "./prompts";
import type { Channel } from "./types";

export function ChannelView({
  channel,
  tab,
  openThreadId,
  onTabChange,
  onOpenThread,
  onCloseThread,
}: {
  channel: Channel;
  tab: "messages" | "threads";
  openThreadId: string | null;
  onTabChange: (tab: "messages" | "threads") => void;
  onOpenThread: (childThreadId: string) => void;
  onCloseThread: () => void;
}) {
  const timeline = useChannelTimeline(channel.coordinatorRef, { kind: "coordinator" });
  const subThreads = useSubThreads(channel.coordinatorRef);
  const agents = useAgents();
  const sendToChannel = useSendToChannel(channel);
  useMarkSeen(channel.coordinatorRef);

  const openThread =
    openThreadId === null
      ? null
      : (subThreads.find((thread) => thread.childRef?.threadId === openThreadId) ?? null);
  const parentMessage =
    openThreadId === null
      ? null
      : (timeline.messages.find(
          (message) =>
            message.kind === "message" &&
            message.threads.some((thread) => thread.childRef?.threadId === openThreadId),
        ) ?? null);

  const send = async (text: string) => {
    const result = await sendToChannel(text);
    if (result.ok) {
      const mention = parseMention(text, agents);
      if (mention) toastManager.add({ type: "success", title: `Sent to @${mention.agent.handle}` });
    }
    return result;
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChannelHeader
          channel={channel}
          tab={tab}
          onTabChange={onTabChange}
          threadCount={subThreads.length}
        />
        {tab === "messages" ? (
          <>
            <MessageList
              key={channel.key}
              timeline={timeline}
              environmentId={channel.environmentId}
              workspaceRoot={channel.workspaceRoot}
              threadRef={channel.coordinatorRef}
              workingLabel="Coordinator is working"
              empty={<NewChannelEmptyState channelName={channel.name} />}
              selectedThreadId={openThreadId}
              onOpenThread={(ref) => onOpenThread(ref.threadId)}
            />
            <ChannelComposer
              key={channel.key}
              placeholder={`Message #${channel.name}`}
              agents={agents}
              onSend={send}
            />
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {subThreads.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No threads yet. Ask the coordinator to do some work and its tasks will appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {subThreads.map((thread) => (
                  <ThreadCard
                    key={thread.subagentId}
                    thread={thread}
                    selected={thread.childRef?.threadId === openThreadId}
                    onOpenThread={(ref) => onOpenThread(ref.threadId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {openThreadId !== null ? (
        <div className={"absolute inset-0 z-20 lg:static lg:inset-auto lg:w-105 lg:shrink-0"}>
          <ThreadPane
            channel={channel}
            childThreadId={openThreadId}
            thread={openThread}
            parentMessage={parentMessage?.kind === "message" ? parentMessage : null}
            onClose={onCloseThread}
          />
        </div>
      ) : null}
    </div>
  );
}
