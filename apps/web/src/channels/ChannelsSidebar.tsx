import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon, HashIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { Channel, CrossChannelAgent } from "./types";
import { AgentDialog } from "./AgentDialog";
import { useAgents, useAgentThreadRef, useChannels, useUnread } from "./hooks";
import { connectionPhaseDotClassName, ConnectionStatusDot } from "~/components/ConnectionStatusDot";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Spinner } from "~/components/ui/spinner";
import { CollapsibleSectionHeader } from "~/components/ui/collapsible-section-header";
import { isElectron } from "~/env";
import { useEnvironments } from "~/state/environments";
import { cn } from "~/lib/utils";

const ROW_CLASS =
  "flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70";

function UnreadDot() {
  return <span aria-label="Unread" className="ms-auto size-2 shrink-0 rounded-full bg-primary" />;
}

function ChannelRow({ channel, selected }: { channel: Channel; selected: boolean }) {
  return (
    <Link
      to="/channels/$environmentId/$projectId"
      params={{ environmentId: channel.environmentId, projectId: channel.projectId }}
      aria-current={selected ? "page" : undefined}
      className={cn(
        ROW_CLASS,
        selected && "bg-sidebar-row-selected text-sidebar-foreground",
        channel.unread && !selected && "font-semibold text-sidebar-foreground",
      )}
    >
      <HashIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{channel.name}</span>
      {channel.active ? (
        <Spinner aria-label="Coordinator working" size="xs" className="ms-auto shrink-0" />
      ) : channel.unread ? (
        <UnreadDot />
      ) : null}
    </Link>
  );
}

function AgentRow({ agent, selected }: { agent: CrossChannelAgent; selected: boolean }) {
  const unread = useUnread(useAgentThreadRef(agent));
  return (
    <Link
      to="/channels/agents/$agentId"
      params={{ agentId: agent.id }}
      aria-current={selected ? "page" : undefined}
      className={cn(
        ROW_CLASS,
        selected && "bg-sidebar-row-selected text-sidebar-foreground",
        unread && !selected && "font-semibold text-sidebar-foreground",
      )}
    >
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center text-sm leading-none"
      >
        {agent.emoji}
      </span>
      <span className="min-w-0 truncate">{agent.name}</span>
      {unread ? <UnreadDot /> : null}
    </Link>
  );
}

function Section({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5">
      <CollapsibleSectionHeader expanded={expanded} onClick={onToggle}>
        {label}
      </CollapsibleSectionHeader>
      {expanded ? children : null}
    </section>
  );
}

function WorkspaceHeader() {
  const { environments } = useEnvironments();
  const environment = environments[0];
  return (
    <div
      className={cn(
        "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-2 border-b border-sidebar-border px-3",
        isElectron && "drag-region pl-20",
      )}
    >
      <span className="min-w-0 truncate text-sm font-semibold text-sidebar-foreground">
        {environment?.label ?? "Channels"}
      </span>
      {environment ? (
        <ConnectionStatusDot
          tooltipText={`Connection: ${environment.connection.phase}`}
          dotClassName={connectionPhaseDotClassName(environment.connection.phase)}
        />
      ) : null}
    </div>
  );
}

export function ChannelsSidebar() {
  const { ready, channels } = useChannels();
  const agents = useAgents();
  const params = useParams({ strict: false });
  const [query, setQuery] = useState("");
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [addAgentOpen, setAddAgentOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const visibleChannels = needle
    ? channels.filter((channel) => channel.name.toLowerCase().includes(needle))
    : channels;
  const visibleAgents = needle
    ? agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(needle) || agent.handle.toLowerCase().includes(needle),
      )
    : agents;

  return (
    <aside
      aria-label="Channels"
      className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-64"
    >
      <WorkspaceHeader />
      <div className="shrink-0 px-2 pt-2">
        <Input
          type="search"
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Jump to..."
          aria-label="Jump to channel or agent"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-2 p-2">
          <Section
            label="Channels"
            expanded={channelsOpen}
            onToggle={() => setChannelsOpen((value) => !value)}
          >
            {visibleChannels.map((channel) => (
              <ChannelRow
                key={channel.key}
                channel={channel}
                selected={
                  params.environmentId === channel.environmentId &&
                  params.projectId === channel.projectId
                }
              />
            ))}
            {visibleChannels.length === 0 ? (
              <p className="px-2 py-1 text-xs text-sidebar-muted-foreground">
                {!ready ? "Loading..." : needle ? "No matching channels" : "No channels yet"}
              </p>
            ) : null}
          </Section>
          <Section
            label="Agents"
            expanded={agentsOpen}
            onToggle={() => setAgentsOpen((value) => !value)}
          >
            {visibleAgents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} selected={params.agentId === agent.id} />
            ))}
            <button type="button" className={ROW_CLASS} onClick={() => setAddAgentOpen(true)}>
              <PlusIcon aria-hidden className="size-3.5 shrink-0" />
              <span>Add agent</span>
            </button>
          </Section>
        </nav>
      </ScrollArea>
      <footer className="flex shrink-0 items-center gap-1 border-t border-sidebar-border p-2">
        <Link to="/" className={cn(ROW_CLASS, "flex-1")}>
          <ArrowLeftIcon aria-hidden className="size-3.5 shrink-0" />
          <span>Classic view</span>
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          className={cn(ROW_CLASS, "w-auto shrink-0 justify-center px-1.5")}
        >
          <SettingsIcon aria-hidden className="size-3.5" />
        </Link>
      </footer>
      <AgentDialog open={addAgentOpen} onOpenChange={setAddAgentOpen} agent={null} />
    </aside>
  );
}
