import { createFileRoute } from "@tanstack/react-router";

import { ChannelWorkspace } from "~/channels/ChannelWorkspace";

interface WorkspaceSearch {
  /** Thread pane to reopen on the channel when going back. */
  thread?: string;
  /** Agent whose conversation this was expanded from; going back returns there. */
  agent?: string;
}

// `_` after $projectId keeps this out of the channel route's outlet, which has none; the URL is
// /channels/$environmentId/$projectId/workspace/$threadKey. threadKey is the raw thread id.
function WorkspaceRoute() {
  const { environmentId, projectId, threadKey } = Route.useParams();
  const { thread, agent } = Route.useSearch();
  return (
    <ChannelWorkspace
      environmentId={environmentId}
      projectId={projectId}
      threadKey={threadKey}
      fromThread={thread ?? null}
      fromAgent={agent ?? null}
    />
  );
}

export const Route = createFileRoute("/channels/$environmentId/$projectId_/workspace/$threadKey")({
  validateSearch: (raw: Record<string, unknown>): WorkspaceSearch => ({
    ...(typeof raw.thread === "string" && raw.thread ? { thread: raw.thread } : {}),
    ...(typeof raw.agent === "string" && raw.agent ? { agent: raw.agent } : {}),
  }),
  component: WorkspaceRoute,
});
