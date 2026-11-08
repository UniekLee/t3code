import { PencilIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { useProjects } from "~/state/entities";
import { AgentDialog } from "./AgentDialog";
import { ChannelAvatar } from "./ChannelAvatar";
import { agentOwner } from "./attention/attention";
import { ThreadAttention } from "./attention/Inline";
import { ChannelComposer } from "./ChannelComposer";
import { ExpandWorkspaceButton } from "./ExpandWorkspaceButton";
import { AgentNoThreadEmptyState, AgentNotFoundEmptyState } from "./EmptyStates";
import { MessageList } from "./MessageList";
import {
  useAgents,
  useAgentThreadRef,
  useChannelTimeline,
  useMarkSeen,
  useRunAgentNow,
  useSendToAgent,
} from "./hooks";
import type { CrossChannelAgent } from "./types";

function AgentConversation({ agent }: { agent: CrossChannelAgent }) {
  const threadRef = useAgentThreadRef(agent);
  const timeline = useChannelTimeline(threadRef, {
    kind: "agent",
    agentId: agent.id,
    name: agent.name,
    emoji: agent.emoji,
  });
  const sendToAgent = useSendToAgent();
  const runAgentNow = useRunAgentNow();
  const projects = useProjects();
  const [editing, setEditing] = useState(false);
  useMarkSeen(threadRef);

  const workspaceRoot =
    projects.find(
      (project) =>
        project.environmentId === agent.environmentId && project.id === agent.homeProjectId,
    )?.workspaceRoot ?? "";

  const runSweep = async () => {
    const result = await runAgentNow(agent);
    if (result.ok)
      toastManager.add({ type: "success", title: `Sweep started for @${agent.handle}` });
    else
      toastManager.add({
        type: "error",
        title: "Could not start sweep",
        description: result.error,
      });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-border border-b px-5 py-3">
        <ChannelAvatar
          author={{ kind: "agent", agentId: agent.id, name: agent.name, emoji: agent.emoji }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="font-semibold text-sm">{agent.name}</span>
            <span className="text-muted-foreground text-xs">@{agent.handle}</span>
          </span>
          <span className="truncate text-muted-foreground text-xs">{agent.role}</span>
        </div>
        {threadRef ? (
          <ExpandWorkspaceButton
            environmentId={agent.environmentId}
            projectId={agent.homeProjectId}
            threadId={threadRef.threadId}
            fromAgent={agent.id}
          />
        ) : null}
        <Button variant="outline" size="xs" onClick={() => void runSweep()}>
          <PlayIcon />
          Run sweep now
        </Button>
        <Button variant="outline" size="xs" onClick={() => setEditing(true)}>
          <PencilIcon />
          Edit
        </Button>
      </header>
      <MessageList
        key={agent.id}
        timeline={timeline}
        environmentId={agent.environmentId}
        workspaceRoot={workspaceRoot}
        threadRef={threadRef}
        workingLabel={`${agent.name} is working`}
        empty={<AgentNoThreadEmptyState name={agent.name} />}
        onOpenThread={() => {}}
      />
      <ThreadAttention
        threadRef={threadRef}
        owner={agentOwner(agent)}
        subThread={false}
        title={agent.name}
      />
      <ChannelComposer
        key={`composer:${agent.id}`}
        placeholder={`Message @${agent.handle}`}
        onSend={(text) => sendToAgent(agent, text)}
      />
      <AgentDialog open={editing} onOpenChange={setEditing} agent={agent} />
    </div>
  );
}

export function AgentView({ agentId }: { agentId: string }) {
  const agents = useAgents();
  const agent = agents.find((candidate) => candidate.id === agentId);
  if (!agent) return <AgentNotFoundEmptyState />;
  return <AgentConversation agent={agent} />;
}
