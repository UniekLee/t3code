import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { ThreadCard } from "../ThreadCard";
import type { ScheduledRunThread } from "../schedules/scheduleModel";
import { ScheduledRunThreads } from "../schedules/ScheduledRunThreads";
import type { Channel, SubThreadSummary } from "../types";
import { useGlanceThreads } from "./useGlanceThreads";
import {
  sectionsForState,
  threadStateEmptyLabel,
  threadStateLabel,
  type ActiveThreadState,
  type GlanceThread,
} from "./threadStates";

function UnseenMark() {
  return <span className="shrink-0 font-medium text-primary text-xs">Unseen</span>;
}

function ChannelThreadRow({
  thread,
  subThreads,
  scheduledRuns,
  selected,
  onOpenThread,
}: {
  thread: GlanceThread;
  subThreads: ReadonlyArray<SubThreadSummary>;
  scheduledRuns: ReadonlyArray<ScheduledRunThread>;
  selected: boolean;
  onOpenThread: (threadId: string) => void;
}) {
  const subThread = subThreads.find((item) => item.childRef?.threadId === thread.id);
  const scheduled = scheduledRuns.find((item) => item.shell.id === thread.id);
  const title = thread.title.trim() || "Untitled thread";

  return (
    <div className="flex w-full max-w-md min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        {subThread ? (
          <ThreadCard
            thread={subThread}
            selected={selected}
            onOpenThread={(ref) => onOpenThread(ref.threadId)}
          />
        ) : scheduled ? (
          <ScheduledRunThreads
            runs={[scheduled]}
            selectedThreadId={selected ? thread.id : null}
            onOpenThread={onOpenThread}
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpenThread(thread.id)}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/50",
              selected ? "border-ring bg-accent/40" : "border-border bg-card",
            )}
          >
            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
              {title}
            </span>
            <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>
      {thread.unseen ? <UnseenMark /> : null}
    </div>
  );
}

export function ChannelThreadsTab({
  channel,
  subThreads,
  scheduledRuns,
  openThreadId,
  state,
  onOpenThread,
  onShowAllStates,
}: {
  channel: Channel;
  subThreads: ReadonlyArray<SubThreadSummary>;
  scheduledRuns: ReadonlyArray<ScheduledRunThread>;
  openThreadId: string | null;
  state: ActiveThreadState | null;
  onOpenThread: (threadId: string) => void;
  onShowAllStates: () => void;
}) {
  const threads = useGlanceThreads().filter(
    (thread) => thread.owner.kind === "channel" && thread.owner.key === channel.key,
  );
  const [showSettled, setShowSettled] = useState(false);
  const filtered = state !== null;
  const sections = sectionsForState(threads, {
    state: state ?? "all",
    includeSettled: !filtered && showSettled,
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        {filtered ? (
          <Button variant="ghost-muted" size="compact" onClick={onShowAllStates}>
            Show all states
          </Button>
        ) : (
          <Button
            variant="ghost-muted"
            size="compact"
            onClick={() => setShowSettled((value) => !value)}
          >
            {showSettled ? "Hide settled" : "Show settled"}
          </Button>
        )}
      </div>
      {sections.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {threads.length === 0
            ? "No threads yet. Ask the coordinator to do some work and its tasks will appear here."
            : filtered && state !== null
              ? threadStateEmptyLabel(state)
              : "Settled threads stay hidden until you ask for them."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section
              key={section.state}
              aria-label={threadStateLabel(section.state)}
              className="flex flex-col gap-2"
            >
              <h2 className="font-medium text-muted-foreground text-xs">
                {threadStateLabel(section.state)}
              </h2>
              {section.threads.map((thread) => (
                <ChannelThreadRow
                  key={thread.id}
                  thread={thread}
                  subThreads={subThreads}
                  scheduledRuns={scheduledRuns}
                  selected={thread.id === openThreadId}
                  onOpenThread={onOpenThread}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
