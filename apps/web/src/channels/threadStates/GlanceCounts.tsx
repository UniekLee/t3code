import { Link } from "@tanstack/react-router";
import {
  AlarmClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  LayoutGridIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

import type { Channel } from "../types";
import {
  ACTIVE_THREAD_STATES,
  countsForChannel,
  threadStateCountLabel,
  type ActiveThreadState,
  type GlanceThread,
} from "./threadStates";

const STATE_ICON: Record<ActiveThreadState, ComponentType<{ className?: string }>> = {
  "needs-input": CircleAlertIcon,
  working: CircleDashedIcon,
  done: CircleCheckIcon,
  snoozed: AlarmClockIcon,
};

export function ChannelGlanceCounts({
  channel,
  threads,
}: {
  channel: Channel;
  threads: ReadonlyArray<GlanceThread>;
}) {
  const counts = countsForChannel(threads, channel.key);
  const visible = ACTIVE_THREAD_STATES.filter((state) => counts[state] > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 ps-7 pe-2 pb-0.5">
      {visible.map((state) => {
        const Icon = STATE_ICON[state];
        return (
          <Link
            key={state}
            to="/channels/$environmentId/$projectId"
            params={{ environmentId: channel.environmentId, projectId: channel.projectId }}
            search={{ tab: "threads", state }}
            aria-label={threadStateCountLabel(state, counts[state])}
            className={cn(
              "inline-flex h-5 items-center gap-0.5 rounded-sm px-1 text-xs tabular-nums hover:bg-sidebar-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
              state === "needs-input"
                ? "text-warning"
                : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
            )}
          >
            <Icon aria-hidden className="size-3 shrink-0" />
            <span>{counts[state]}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function AgentStateMark({ state }: { state: "needs-input" | "working" }) {
  const Icon = STATE_ICON[state];
  return (
    <Icon
      aria-label={state === "needs-input" ? "Needs input" : "Working"}
      className={cn(
        "size-3 shrink-0",
        state === "needs-input" ? "text-warning" : "text-sidebar-muted-foreground",
      )}
    />
  );
}

export function BoardSidebarLink({ className, count }: { className: string; count: number }) {
  return (
    <Link
      to="/channels/board"
      activeOptions={{ exact: true }}
      className={cn(className, count > 0 && "font-semibold text-sidebar-foreground")}
      activeProps={{ className: "bg-sidebar-row-selected text-sidebar-foreground" }}
    >
      <LayoutGridIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">Board</span>
      {count > 0 ? (
        <Badge variant="warning" size="sm" className="ms-auto">
          {count}
        </Badge>
      ) : null}
    </Link>
  );
}
