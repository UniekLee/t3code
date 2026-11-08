import { isListedThreadLineage, type EnvironmentId, type ScheduledTask } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import type { Channel, CrossChannelAgent } from "../types";

export interface ScheduleEntry {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask;
  readonly channel: Channel | null;
  /** The agent whose thread (or sweep) this task drives. */
  readonly agent: CrossChannelAgent | null;
}

export interface ScheduledRunThread {
  readonly shell: EnvironmentThreadShell;
  readonly entry: ScheduleEntry;
}

function findTaskAgent(
  agents: ReadonlyArray<CrossChannelAgent>,
  environmentId: EnvironmentId,
  task: Pick<ScheduledTask, "id" | "threadId">,
): CrossChannelAgent | null {
  return (
    agents.find(
      (agent) =>
        agent.environmentId === environmentId &&
        (agent.scheduledTaskId === task.id ||
          (task.threadId !== null && agent.threadId === task.threadId)),
    ) ?? null
  );
}

export function buildScheduleEntries(input: {
  readonly tasksByEnvironment: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly tasks: ReadonlyArray<ScheduledTask>;
  }>;
  readonly channels: ReadonlyArray<Channel>;
  readonly agents: ReadonlyArray<CrossChannelAgent>;
}): ScheduleEntry[] {
  return input.tasksByEnvironment.flatMap(({ environmentId, tasks }) =>
    tasks.map((task) => ({
      key: `${environmentId}:${task.id}`,
      environmentId,
      task,
      channel:
        input.channels.find(
          (channel) =>
            channel.environmentId === environmentId && channel.projectId === task.projectId,
        ) ?? null,
      agent: findTaskAgent(input.agents, environmentId, task),
    })),
  );
}

/**
 * Thread shells carry no scheduledTaskId (it lives on the first user message), so runs are
 * recognised from shell data alone: the bound thread of a continue-mode task, or a thread in the
 * task's project that is titled like the task, created after it, by the same actor and source.
 * Agent threads are skipped; they have their own view.
 */
export function detectScheduledRunThreads(
  shells: ReadonlyArray<EnvironmentThreadShell>,
  entries: ReadonlyArray<ScheduleEntry>,
): ScheduledRunThread[] {
  const found: ScheduledRunThread[] = [];
  for (const shell of shells) {
    if (shell.archivedAt !== null || !isListedThreadLineage(shell.lineage)) continue;
    const entry = entries.find(({ environmentId, task, agent }) => {
      if (environmentId !== shell.environmentId || task.projectId !== shell.projectId) return false;
      if (agent !== null) return false;
      if (task.threadId !== null) return task.threadId === shell.id;
      return (
        shell.title === task.title &&
        shell.createdAt >= task.createdAt &&
        shell.source.createdBy === task.createdBy &&
        shell.source.creationSource === task.creationSource
      );
    });
    if (entry) found.push({ shell, entry });
  }
  return found.toSorted((left, right) => right.shell.updatedAt.localeCompare(left.shell.updatedAt));
}

export function groupSchedulesByOwner(entries: ReadonlyArray<ScheduleEntry>): Array<{
  readonly key: string;
  readonly label: string;
  readonly kind: "channel" | "agent" | "other";
  readonly entries: ScheduleEntry[];
}> {
  const groups = new Map<
    string,
    { key: string; label: string; kind: "channel" | "agent" | "other"; entries: ScheduleEntry[] }
  >();
  for (const entry of entries) {
    const [key, label, kind] = entry.agent
      ? ([`agent:${entry.agent.id}`, entry.agent.name, "agent"] as const)
      : entry.channel
        ? ([`channel:${entry.channel.key}`, entry.channel.name, "channel"] as const)
        : ([`other:${entry.task.projectId}`, "Other projects", "other"] as const);
    const group = groups.get(key) ?? { key, label, kind, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].toSorted((a, b) => a.label.localeCompare(b.label));
}
