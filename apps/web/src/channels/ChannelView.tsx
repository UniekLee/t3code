import { toastManager } from "~/components/ui/toast";
import { ChannelComposer } from "./ChannelComposer";
import { ChannelHeader } from "./ChannelHeader";
import { channelOwner } from "./attention/attention";
import { SubThreadAttention, ThreadAttention } from "./attention/Inline";
import { NewChannelEmptyState } from "./EmptyStates";
import { MessageList } from "./MessageList";
import { ThreadPane } from "./ThreadPane";
import { ChannelThreadsTab } from "./threadStates/ChannelThreadsTab";
import type { ActiveThreadState } from "./threadStates/threadStates";
import { useGlanceThreads } from "./threadStates/useGlanceThreads";
import {
  useAgents,
  useChannelTimeline,
  useMarkSeen,
  useSendToChannel,
  useSubThreads,
} from "./hooks";
import { parseMention } from "./prompts";
import { ChannelSchedules, channelScheduleEntries } from "./schedules/ChannelSchedules";
import { useScheduledRunThreads, useScheduledTasks } from "./schedules/useScheduledTasks";
import type { Channel } from "./types";

export function ChannelView({
  channel,
  tab,
  openThreadId,
  state,
  onTabChange,
  onOpenThread,
  onCloseThread,
  onShowAllStates,
}: {
  channel: Channel;
  tab: "messages" | "threads" | "schedules";
  openThreadId: string | null;
  state: ActiveThreadState | null;
  onTabChange: (tab: "messages" | "threads" | "schedules") => void;
  onOpenThread: (childThreadId: string) => void;
  onCloseThread: () => void;
  onShowAllStates: () => void;
}) {
  const timeline = useChannelTimeline(channel.coordinatorRef, { kind: "coordinator" });
  const subThreads = useSubThreads(channel.coordinatorRef);
  const agents = useAgents();
  const schedules = useScheduledTasks();
  const channelSchedules = channelScheduleEntries(schedules.entries, channel);
  const scheduledRuns = useScheduledRunThreads(channelSchedules);
  const channelThreadCount = useGlanceThreads().filter(
    (thread) =>
      thread.owner.kind === "channel" &&
      thread.owner.key === channel.key &&
      thread.state !== "settled",
  ).length;
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
          threadCount={channelThreadCount}
          scheduleCount={channelSchedules.length}
        />
        {tab === "messages" ? (
          <>
            <MessageList
              key={`messages:${channel.key}`}
              timeline={timeline}
              environmentId={channel.environmentId}
              workspaceRoot={channel.workspaceRoot}
              threadRef={channel.coordinatorRef}
              workingLabel="Coordinator is working"
              empty={<NewChannelEmptyState channelName={channel.name} />}
              selectedThreadId={openThreadId}
              onOpenThread={(ref) => onOpenThread(ref.threadId)}
            />
            <ThreadAttention
              threadRef={channel.coordinatorRef}
              owner={channelOwner(channel)}
              subThread={false}
              title="Coordinator"
            />
            <SubThreadAttention
              channelKey={channel.key}
              openThreadId={openThreadId}
              onOpenThread={onOpenThread}
            />
            <ChannelComposer
              key={`composer:${channel.key}`}
              placeholder={`Message #${channel.name}`}
              agents={agents}
              onSend={send}
            />
          </>
        ) : tab === "schedules" ? (
          <ChannelSchedules
            channel={channel}
            entries={channelSchedules}
            loading={schedules.loading}
          />
        ) : (
          <ChannelThreadsTab
            channel={channel}
            subThreads={subThreads}
            scheduledRuns={scheduledRuns}
            openThreadId={openThreadId}
            state={state}
            onOpenThread={onOpenThread}
            onShowAllStates={onShowAllStates}
          />
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
