import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { HashIcon } from "lucide-react";

import { useChannel, useChannels } from "~/channels/hooks";
import { ChannelView } from "~/channels/ChannelView";
import { isActiveThreadState, type ActiveThreadState } from "~/channels/threadStates/threadStates";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";

type ChannelTab = "messages" | "threads" | "schedules";

interface ChannelSearch {
  thread?: string;
  tab?: ChannelTab;
  state?: ActiveThreadState;
}

function ChannelRoute() {
  const { environmentId, projectId } = Route.useParams();
  const { thread, tab, state } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { ready } = useChannels();
  const channel = useChannel(EnvironmentId.make(environmentId), ProjectId.make(projectId));

  if (!channel) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">{ready ? <HashIcon /> : <Spinner />}</EmptyMedia>
          <EmptyTitle>{ready ? "Channel not found" : "Loading channel"}</EmptyTitle>
          <EmptyDescription>
            {ready
              ? "This project is not available in any connected environment."
              : "Connecting to your environments."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ChannelView
      key={channel.key}
      channel={channel}
      openThreadId={thread ?? null}
      tab={tab ?? "messages"}
      state={state ?? null}
      onOpenThread={(childThreadId) =>
        void navigate({ search: (prev) => ({ ...prev, thread: childThreadId }) })
      }
      onCloseThread={() =>
        void navigate({
          search: (prev) => ({
            ...(prev.tab ? { tab: prev.tab } : {}),
            ...(prev.state ? { state: prev.state } : {}),
          }),
        })
      }
      onShowAllStates={() =>
        void navigate({
          search: (prev) => ({
            ...(prev.thread ? { thread: prev.thread } : {}),
            ...(prev.tab ? { tab: prev.tab } : {}),
          }),
        })
      }
      onTabChange={(next) =>
        void navigate({
          search: (prev) => ({
            ...(prev.thread ? { thread: prev.thread } : {}),
            ...(prev.state ? { state: prev.state } : {}),
            ...(next !== "messages" ? { tab: next } : {}),
          }),
        })
      }
    />
  );
}

export const Route = createFileRoute("/channels/$environmentId/$projectId")({
  validateSearch: (raw: Record<string, unknown>): ChannelSearch => ({
    ...(typeof raw.thread === "string" && raw.thread ? { thread: raw.thread } : {}),
    ...(raw.tab === "threads" || raw.tab === "schedules" ? { tab: raw.tab } : {}),
    ...(isActiveThreadState(raw.state) ? { state: raw.state } : {}),
  }),
  component: ChannelRoute,
});
