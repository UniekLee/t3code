import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import type { Channel, CrossChannelAgent } from "../types";

export type ChannelsThreadState = "needs-input" | "working" | "done" | "snoozed";

export type ChannelsPaletteDestination =
  | {
      readonly kind: "channel";
      readonly environmentId: EnvironmentId;
      readonly projectId: ProjectId;
      readonly search?: { readonly tab: "threads"; readonly thread: string };
    }
  | { readonly kind: "agent"; readonly agentId: string }
  | { readonly kind: "activity" }
  | { readonly kind: "schedules" }
  | { readonly kind: "board"; readonly state?: ChannelsThreadState };

export interface ChannelsPaletteEntry {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
  readonly searchTerms: readonly string[];
  readonly destination: ChannelsPaletteDestination;
  readonly emoji?: string;
}

interface ChannelsPaletteCatalog {
  readonly channels: readonly ChannelsPaletteEntry[];
  readonly agents: readonly ChannelsPaletteEntry[];
  readonly tools: readonly ChannelsPaletteEntry[];
}

export interface ChannelsThreadPick {
  readonly pathname: string;
  readonly thread: {
    readonly environmentId: EnvironmentId;
    readonly id: ThreadId;
    readonly projectId: ProjectId | null;
  };
  readonly channels: ReadonlyArray<Pick<Channel, "environmentId" | "projectId" | "coordinatorRef">>;
  readonly agents: ReadonlyArray<Pick<CrossChannelAgent, "id" | "threadId">>;
}

const STATE_JUMPS: ReadonlyArray<{
  readonly state: ChannelsThreadState;
  readonly title: string;
}> = [
  { state: "needs-input", title: "Threads that need input" },
  { state: "working", title: "Working threads" },
  { state: "done", title: "Done threads" },
  { state: "snoozed", title: "Snoozed threads" },
];

function searchTerms(...values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    terms.push(value);
  }
  return terms;
}

function channelTools(): ChannelsPaletteEntry[] {
  return [
    {
      value: "channels-tool:activity",
      title: "Activity",
      searchTerms: ["Activity", "inbox"],
      destination: { kind: "activity" },
    },
    {
      value: "channels-tool:schedules",
      title: "Schedules",
      searchTerms: ["Schedules", "schedule"],
      destination: { kind: "schedules" },
    },
    {
      value: "channels-tool:board",
      title: "Board",
      searchTerms: ["Board"],
      destination: { kind: "board" },
    },
    ...STATE_JUMPS.map((jump): ChannelsPaletteEntry => ({
      value: `channels-tool:state:${jump.state}`,
      title: jump.title,
      searchTerms: searchTerms(jump.title, jump.state),
      destination: { kind: "board", state: jump.state },
    })),
  ];
}

export function isChannelsPathname(pathname: string): boolean {
  return pathname.startsWith("/channels");
}

export function buildChannelsPaletteEntries(input: {
  readonly channels: ReadonlyArray<
    Pick<Channel, "environmentId" | "projectId" | "name" | "workspaceRoot">
  >;
  readonly agents: ReadonlyArray<Pick<CrossChannelAgent, "id" | "name" | "handle" | "emoji">>;
}): ChannelsPaletteCatalog {
  return {
    channels: input.channels.map((channel) => ({
      value: `channels:${channel.environmentId}:${channel.projectId}`,
      title: channel.name,
      ...(channel.workspaceRoot.length > 0 ? { description: channel.workspaceRoot } : {}),
      searchTerms: searchTerms(channel.name, channel.workspaceRoot),
      destination: {
        kind: "channel",
        environmentId: channel.environmentId,
        projectId: channel.projectId,
      },
    })),
    agents: input.agents.map((agent) => ({
      value: `channels-agent:${agent.id}`,
      title: agent.name,
      ...(agent.handle.length > 0 ? { description: `@${agent.handle}` } : {}),
      searchTerms: searchTerms(
        agent.name,
        agent.handle,
        agent.handle.length > 0 ? `@${agent.handle}` : "",
        agent.emoji,
      ),
      ...(agent.emoji.length > 0 ? { emoji: agent.emoji } : {}),
      destination: { kind: "agent", agentId: agent.id },
    })),
    tools: channelTools(),
  };
}

export function channelsThreadDestination(
  input: ChannelsThreadPick,
): ChannelsPaletteDestination | null {
  if (!isChannelsPathname(input.pathname)) return null;

  const agent = input.agents.find(
    (candidate) => candidate.threadId !== null && candidate.threadId === input.thread.id,
  );
  if (agent) return { kind: "agent", agentId: agent.id };

  const coordinator = input.channels.find(
    (channel) =>
      channel.coordinatorRef !== null &&
      channel.coordinatorRef.environmentId === input.thread.environmentId &&
      channel.coordinatorRef.threadId === input.thread.id,
  );
  if (coordinator) {
    return {
      kind: "channel",
      environmentId: coordinator.environmentId,
      projectId: coordinator.projectId,
    };
  }

  if (input.thread.projectId === null) return null;
  const channel = input.channels.find(
    (candidate) =>
      candidate.environmentId === input.thread.environmentId &&
      candidate.projectId === input.thread.projectId,
  );
  if (!channel) return null;
  return {
    kind: "channel",
    environmentId: channel.environmentId,
    projectId: channel.projectId,
    search: { tab: "threads", thread: input.thread.id },
  };
}
