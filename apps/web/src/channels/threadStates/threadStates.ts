import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import {
  filterSidebarV2VisibleThreads,
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
} from "~/components/Sidebar.logic";

import { deriveThreadAttention, type PendingSecretRequest } from "../attention/attention";
import type { LoadedSecretRequest } from "~/state/loadedSecretRequests";
import type { Channel, CrossChannelAgent } from "../types";

/** States a glance row can count. Settled is hidden until the viewer asks. */
export const ACTIVE_THREAD_STATES = ["needs-input", "working", "done", "snoozed"] as const;

export type ActiveThreadState = (typeof ACTIVE_THREAD_STATES)[number];

type ThreadGlanceState = ActiveThreadState | "settled";

export function isActiveThreadState(value: unknown): value is ActiveThreadState {
  return ACTIVE_THREAD_STATES.some((state) => state === value);
}

interface ThreadStateCounts {
  readonly "needs-input": number;
  readonly working: number;
  readonly done: number;
  readonly snoozed: number;
}

/** Fields the classifiers already read. A quiet shell satisfies this. */
export type ChannelThreadShell = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "projectId"
  | "title"
  | "archivedAt"
  | "deletedAt"
  | "lineage"
  | "updatedAt"
  | "runtime"
  | "latestRun"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "pendingUserInputAt"
  | "pendingSubagentRequest"
  | "pendingGuestMessageCount"
  | "settledOverride"
  | "lastVisitedAt"
  | "hasActionableProposedPlan"
  | "interactionMode"
  | "blockedOnThreadWait"
  | "snoozedUntil"
  | "snoozedAt"
  | "latestUserMessageAt"
  | "source"
>;

interface GlanceOwnerChannel {
  readonly kind: "channel";
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly name: string;
}

interface GlanceOwnerAgent {
  readonly kind: "agent";
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
}

export interface GlanceThread {
  readonly id: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly updatedAt: string;
  readonly state: ThreadGlanceState;
  readonly unseen: boolean;
  readonly owner: GlanceOwnerChannel | GlanceOwnerAgent;
}

interface ClassifiedChannelThread {
  readonly state: ThreadGlanceState;
  /** True when a done thread's latest completion is still unseen. */
  readonly unseen: boolean;
}

const NEEDS_INPUT_STATUS = new Set(["approval", "input", "request", "limited"]);

/**
 * One state per thread. Needs input wins, then snooze, working, done, and settled.
 * Needs input includes the statuses the sidebar already treats as attention, plus anything
 * `deriveThreadAttention` would still show (a pending secret, or a failed run that has not
 * been dismissed, visited, or settled).
 */
export function classifyChannelThread(
  shell: ChannelThreadShell,
  options: {
    readonly dismissed: ReadonlySet<string>;
    readonly now: number;
    readonly secrets?: ReadonlyArray<PendingSecretRequest> | undefined;
  },
): ClassifiedChannelThread {
  const status = resolveSidebarThreadStatus(shell);
  const attention = deriveThreadAttention({
    shell,
    owner: {
      kind: "channel",
      key: `${shell.environmentId}:${shell.projectId}`,
      environmentId: shell.environmentId,
      projectId: shell.projectId,
      name: shell.title || "Thread",
      workspaceRoot: "",
    },
    subThread: false,
    dismissed: options.dismissed,
    now: options.now,
    ...(options.secrets === undefined ? {} : { secrets: options.secrets }),
  });
  if (NEEDS_INPUT_STATUS.has(status) || attention.length > 0) {
    return { state: "needs-input", unseen: false };
  }

  const nowIso = Number.isFinite(options.now)
    ? new Date(options.now).toISOString()
    : new Date(0).toISOString();
  if (effectiveSnoozed(shell, { now: nowIso })) {
    return { state: "snoozed", unseen: false };
  }

  if (
    isThreadWorking(shell) ||
    status === "preparing" ||
    status === "working" ||
    status === "waiting"
  ) {
    return { state: "working", unseen: false };
  }

  const unseen = hasUnseenCompletion(shell);
  if (unseen || (shell.latestRun?.status === "completed" && shell.settledOverride !== "settled")) {
    return { state: "done", unseen };
  }
  return { state: "settled", unseen: false };
}

/** Counts of the four visible states. Settled and agent threads are left out. */
export function countThreadStates(
  threads: ReadonlyArray<{ readonly state: ThreadGlanceState; readonly agent: boolean }>,
): ThreadStateCounts {
  const counts: Record<ActiveThreadState, number> = {
    "needs-input": 0,
    working: 0,
    done: 0,
    snoozed: 0,
  };
  for (const thread of threads) {
    if (thread.agent || thread.state === "settled") continue;
    counts[thread.state] += 1;
  }
  return counts;
}

export function countsForChannel(
  threads: ReadonlyArray<GlanceThread>,
  channelKey: string,
): ThreadStateCounts {
  return countThreadStates(
    threads.flatMap((thread) =>
      thread.owner.kind === "channel" && thread.owner.key === channelKey
        ? [{ state: thread.state, agent: false as const }]
        : [],
    ),
  );
}

export function agentGlanceMark(
  threads: ReadonlyArray<GlanceThread>,
  agentId: string,
): "needs-input" | "working" | null {
  const thread = threads.find((item) => item.owner.kind === "agent" && item.owner.id === agentId);
  if (thread?.state === "needs-input" || thread?.state === "working") return thread.state;
  return null;
}

/** Needs-input threads on the board, including agent threads. */
export function totalNeedsInput(threads: ReadonlyArray<GlanceThread>): number {
  return threads.reduce((count, thread) => count + (thread.state === "needs-input" ? 1 : 0), 0);
}

function agentByThreadKey(
  agents: ReadonlyArray<
    Pick<CrossChannelAgent, "id" | "name" | "emoji" | "environmentId" | "threadId">
  >,
): Map<string, Pick<CrossChannelAgent, "id" | "name" | "emoji" | "environmentId" | "threadId">> {
  const byThread = new Map<
    string,
    Pick<CrossChannelAgent, "id" | "name" | "emoji" | "environmentId" | "threadId">
  >();
  for (const agent of agents) {
    if (agent.threadId === null) continue;
    byThread.set(`${agent.environmentId}:${agent.threadId}`, agent);
  }
  return byThread;
}

function placeThread(
  shell: ChannelThreadShell,
  owner: GlanceOwnerChannel | GlanceOwnerAgent,
  options: {
    readonly dismissed: ReadonlySet<string>;
    readonly now: number;
    readonly secrets?: ReadonlyArray<PendingSecretRequest> | undefined;
  },
): GlanceThread {
  const classified = classifyChannelThread(shell, options);
  return {
    id: shell.id,
    environmentId: shell.environmentId,
    projectId: shell.projectId,
    title: shell.title,
    updatedAt: shell.updatedAt,
    state: classified.state,
    unseen: classified.unseen,
    owner,
  };
}

/**
 * Listed, non-deleted threads for every channel, plus each agent's own thread.
 * Agent threads are owned by the agent, so channel counts skip them. The coordinator stays
 * in its channel.
 */
export function buildGlanceThreads(input: {
  readonly shells: ReadonlyArray<ChannelThreadShell>;
  readonly channels: ReadonlyArray<Pick<Channel, "key" | "name" | "environmentId" | "projectId">>;
  readonly agents: ReadonlyArray<
    Pick<CrossChannelAgent, "id" | "name" | "emoji" | "environmentId" | "threadId">
  >;
  readonly delegatedUnderParent: ReadonlySet<string>;
  readonly dismissed: ReadonlySet<string>;
  readonly now: number;
  /** Pending secrets from projections already loaded. Keyed by environment id and thread id. */
  readonly secretsByThread?: ReadonlyMap<string, readonly LoadedSecretRequest[]>;
}): GlanceThread[] {
  const agents = agentByThreadKey(input.agents);
  const options = { dismissed: input.dismissed, now: input.now };
  const placed = new Map<string, GlanceThread>();
  const living = input.shells.filter((shell) => shell.deletedAt === null);

  for (const channel of input.channels) {
    const visible = filterSidebarV2VisibleThreads(
      living,
      new Set([`${channel.environmentId}:${channel.projectId}`]),
      input.delegatedUnderParent,
    );
    for (const shell of visible) {
      const key = `${shell.environmentId}:${shell.id}`;
      const agent = agents.get(key);
      const owner: GlanceOwnerChannel | GlanceOwnerAgent =
        agent === undefined
          ? {
              kind: "channel",
              key: channel.key,
              environmentId: channel.environmentId,
              projectId: channel.projectId,
              name: channel.name,
            }
          : { kind: "agent", id: agent.id, name: agent.name, emoji: agent.emoji };
      placed.set(
        key,
        placeThread(shell, owner, { ...options, secrets: input.secretsByThread?.get(key) }),
      );
    }
  }

  for (const agent of input.agents) {
    if (agent.threadId === null) continue;
    const key = `${agent.environmentId}:${agent.threadId}`;
    if (placed.has(key)) continue;
    const shell = living.find(
      (item) => item.environmentId === agent.environmentId && item.id === agent.threadId,
    );
    if (shell === undefined || shell.archivedAt !== null) continue;
    placed.set(
      key,
      placeThread(
        shell,
        { kind: "agent", id: agent.id, name: agent.name, emoji: agent.emoji },
        { ...options, secrets: input.secretsByThread?.get(key) },
      ),
    );
  }

  return [...placed.values()];
}

interface ThreadStateSection<T extends { readonly state: ThreadGlanceState }> {
  readonly state: ThreadGlanceState;
  readonly threads: ReadonlyArray<T>;
}

const SECTION_ORDER: ReadonlyArray<ThreadGlanceState> = [
  "needs-input",
  "working",
  "done",
  "snoozed",
  "settled",
];

/** Non-empty state groups, newest thread first. Settled stays out until asked. */
export function sectionsForState<
  T extends { readonly state: ThreadGlanceState; readonly updatedAt: string },
>(
  threads: ReadonlyArray<T>,
  options: { readonly state: ActiveThreadState | "all"; readonly includeSettled: boolean },
): Array<ThreadStateSection<T>> {
  const states =
    options.state === "all"
      ? SECTION_ORDER.filter((state) => state !== "settled" || options.includeSettled)
      : [options.state];
  return states.flatMap((state) => {
    const group = threads
      .filter((thread) => thread.state === state)
      .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return group.length === 0 ? [] : [{ state, threads: group }];
  });
}

interface OwnerGroup<T> {
  readonly key: string;
  readonly label: string;
  readonly threads: ReadonlyArray<T>;
}

/** Channel groups in encounter order, then one Agents group. */
export function groupSectionByOwner(
  threads: ReadonlyArray<GlanceThread>,
): Array<OwnerGroup<GlanceThread>> {
  const channels = new Map<string, { key: string; label: string; threads: GlanceThread[] }>();
  const agents: GlanceThread[] = [];
  for (const thread of threads) {
    if (thread.owner.kind === "agent") {
      agents.push(thread);
      continue;
    }
    const existing = channels.get(thread.owner.key);
    if (existing === undefined) {
      channels.set(thread.owner.key, {
        key: thread.owner.key,
        label: `#${thread.owner.name}`,
        threads: [thread],
      });
    } else {
      existing.threads.push(thread);
    }
  }
  return [
    ...channels.values(),
    ...(agents.length === 0 ? [] : [{ key: "agents", label: "Agents", threads: agents }]),
  ];
}

export function threadStateLabel(state: ThreadGlanceState | "all"): string {
  switch (state) {
    case "all":
      return "All";
    case "needs-input":
      return "Needs input";
    case "working":
      return "Working";
    case "done":
      return "Done";
    case "snoozed":
      return "Snoozed";
    case "settled":
      return "Settled";
  }
}

export function threadStateCountLabel(state: ActiveThreadState, count: number): string {
  const threads = count === 1 ? "thread" : "threads";
  switch (state) {
    case "needs-input":
      return count === 1 ? "1 thread needs input" : `${count} threads need input`;
    case "working":
      return `${count} working ${threads}`;
    case "done":
      return `${count} done ${threads}`;
    case "snoozed":
      return `${count} snoozed ${threads}`;
  }
}

export function threadStateEmptyLabel(state: ActiveThreadState): string {
  switch (state) {
    case "needs-input":
      return "No threads need input.";
    case "working":
      return "No working threads.";
    case "done":
      return "No done threads.";
    case "snoozed":
      return "No snoozed threads.";
  }
}
