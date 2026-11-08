import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronRightIcon, HashIcon } from "lucide-react";

import { ThreadRouteView } from "~/components/ThreadRouteView";
import { Button } from "~/components/ui/button";
import { ThreadRouteOverrideContext } from "~/hooks/useThreadRouteTarget";
import { useQuietThreadShell } from "~/state/entities";
import { useAgents, useChannel } from "./hooks";

/**
 * The classic workspace for one thread (ChatView plus every right panel) inside the Channels shell.
 * `fromThread` restores the channel's thread pane on return; `fromAgent` returns to that agent instead.
 */
export function ChannelWorkspace({
  environmentId,
  projectId,
  threadKey,
  fromThread,
  fromAgent,
}: {
  environmentId: string;
  projectId: string;
  threadKey: string;
  fromThread: string | null;
  fromAgent: string | null;
}) {
  const navigate = useNavigate();
  const channel = useChannel(EnvironmentId.make(environmentId), ProjectId.make(projectId));
  const agent = useAgents().find((candidate) => candidate.id === fromAgent) ?? null;
  const threadRef = scopeThreadRef(EnvironmentId.make(environmentId), ThreadId.make(threadKey));
  const shell = useQuietThreadShell(threadRef);
  const title = shell?.title ?? "Thread";

  const backLabel = agent ? `Back to ${agent.name}` : `Back to #${channel?.name ?? "channel"}`;
  const goBack = () =>
    agent
      ? void navigate({ to: "/channels/agents/$agentId", params: { agentId: agent.id } })
      : void navigate({
          to: "/channels/$environmentId/$projectId",
          params: { environmentId, projectId },
          search: fromThread ? { thread: fromThread } : {},
        });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-border border-b px-4 py-2">
        <Button variant="ghost" size="xs" onClick={goBack}>
          <ArrowLeftIcon />
          {backLabel}
        </Button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <HashIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <Link
            to="/channels/$environmentId/$projectId"
            params={{ environmentId, projectId }}
            search={fromThread ? { thread: fromThread } : {}}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {channel?.name ?? "channel"}
          </Link>
          <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium text-foreground">{title}</span>
        </nav>
      </header>
      {/* ThreadRouteView sizes itself to the viewport; inside this shell it must fill what is left. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col *:h-auto! *:min-h-0">
        <ThreadRouteOverrideContext value={threadRef}>
          <ThreadRouteView key={threadKey} target={{ kind: "server", threadRef }} />
        </ThreadRouteOverrideContext>
      </div>
    </div>
  );
}
