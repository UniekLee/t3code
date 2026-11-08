import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, LayoutGridIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";

import { useGlanceThreads } from "./useGlanceThreads";
import {
  ACTIVE_THREAD_STATES,
  groupSectionByOwner,
  sectionsForState,
  threadStateEmptyLabel,
  threadStateLabel,
  type ActiveThreadState,
  type GlanceThread,
} from "./threadStates";

function threadTitle(thread: GlanceThread): string {
  const title = thread.title.trim();
  return title.length > 0 ? title : "Untitled thread";
}

function ownerName(thread: GlanceThread): string {
  return thread.owner.kind === "agent"
    ? `${thread.owner.emoji} ${thread.owner.name}`
    : `#${thread.owner.name}`;
}

function BoardThreadLink({ thread }: { thread: GlanceThread }) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-foreground text-sm">
            {threadTitle(thread)}
          </span>
          {thread.unseen ? (
            <span className="shrink-0 font-medium text-primary text-xs">Unseen</span>
          ) : null}
        </span>
        <span className="truncate text-muted-foreground text-xs">{ownerName(thread)}</span>
      </span>
      <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </>
  );
  const className =
    "flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70";
  if (thread.owner.kind === "agent") {
    return (
      <Link
        to="/channels/agents/$agentId"
        params={{ agentId: thread.owner.id }}
        className={className}
      >
        {body}
      </Link>
    );
  }
  return (
    <Link
      to="/channels/$environmentId/$projectId"
      params={{ environmentId: thread.owner.environmentId, projectId: thread.owner.projectId }}
      search={{ tab: "threads", thread: thread.id }}
      className={className}
    >
      {body}
    </Link>
  );
}

export function ThreadStateBoard({
  state,
  onStateChange,
}: {
  state: ActiveThreadState | "all";
  onStateChange: (state: ActiveThreadState | "all") => void;
}) {
  const threads = useGlanceThreads();
  const [showSettled, setShowSettled] = useState(false);
  const filtered = state !== "all";
  const sections = sectionsForState(threads, {
    state,
    includeSettled: !filtered && showSettled,
  });
  const filters = ["all", ...ACTIVE_THREAD_STATES] as const;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-border border-b px-5 py-3">
        <LayoutGridIcon aria-hidden className="size-4 text-muted-foreground" />
        <h1 className="font-semibold text-sm">Board</h1>
        <div role="tablist" aria-label="Thread state" className="flex flex-wrap items-center gap-1">
          {filters.map((filter) => (
            <Button
              key={filter}
              role="tab"
              aria-selected={state === filter}
              variant={state === filter ? "secondary" : "ghost-muted"}
              size="compact"
              onClick={() => onStateChange(filter)}
            >
              {threadStateLabel(filter)}
            </Button>
          ))}
        </div>
        {filtered ? null : (
          <Button
            variant="ghost-muted"
            size="compact"
            onClick={() => setShowSettled((value) => !value)}
          >
            {showSettled ? "Hide settled" : "Show settled"}
          </Button>
        )}
      </header>
      {sections.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutGridIcon />
            </EmptyMedia>
            <EmptyTitle>
              {threads.length === 0
                ? "No threads yet"
                : filtered
                  ? threadStateLabel(state)
                  : "All settled"}
            </EmptyTitle>
            <EmptyDescription>
              {threads.length === 0
                ? "Threads from your channels and agents will show up here."
                : filtered
                  ? threadStateEmptyLabel(state)
                  : "Settled threads stay hidden until you ask for them."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-4">
            {sections.map((section) => (
              <section
                key={section.state}
                aria-label={threadStateLabel(section.state)}
                className="flex flex-col gap-3"
              >
                <h2 className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
                  {threadStateLabel(section.state)}
                  <Badge
                    variant={section.state === "needs-input" ? "warning" : "secondary"}
                    size="sm"
                  >
                    {section.threads.length}
                  </Badge>
                </h2>
                {groupSectionByOwner(section.threads).map((group) => (
                  <div key={group.key} className="flex flex-col gap-2">
                    <h3 className="font-medium text-foreground text-sm">{group.label}</h3>
                    {group.threads.map((thread) => (
                      <BoardThreadLink
                        key={`${thread.environmentId}:${thread.id}`}
                        thread={thread}
                      />
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
