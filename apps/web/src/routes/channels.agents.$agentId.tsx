import { createFileRoute } from "@tanstack/react-router";

import { AgentView } from "~/channels/AgentView";

function AgentRoute() {
  const { agentId } = Route.useParams();
  return <AgentView key={agentId} agentId={agentId} />;
}

export const Route = createFileRoute("/channels/agents/$agentId")({
  component: AgentRoute,
});
