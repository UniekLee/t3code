import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import {
  DEFAULT_SERVER_SETTINGS,
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  ScheduledTaskId,
  type EnvironmentId,
  type ProjectId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";
import { useEffect } from "react";

import { publishLoadedSecretRequests } from "~/state/loadedSecretRequests";

import { toastManager } from "~/components/ui/toast";
import { useNowMinute } from "~/hooks/useNowMinute";
import { randomUUID, newMessageId, newThreadId } from "~/lib/utils";
import { resolveProjectDefaultProviderModelSelection } from "~/providerInstances";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  readProject,
  readThreadShell,
  readThreadShells,
  useAllEnvironmentProjectSnapshotsReady,
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useQuietThreadShell,
  useQuietThreadShells,
  useThreadHistory,
  useThreadProjection,
  useThreadStatus,
} from "~/state/entities";
import { environmentServerConfigsAtom, serverEnvironment } from "~/state/server";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";

import {
  childInfoFromShell,
  deriveChannelMessages,
  deriveChannels,
  deriveSubThreads,
  findCoordinatorThread,
  isThreadUnread,
  latestThreadActivityAt,
  type ChildResolver,
} from "./model";
import {
  agentThreadTitle,
  buildAgentBrief,
  buildAgentRoleUpdate,
  buildAgentSweepPrompt,
  buildContextUpdate,
  buildCoordinatorBrief,
  buildMentionForward,
  coordinatorThreadTitle,
  joinWithUserText,
  parseMention,
} from "./prompts";
import { selectChannelConfig, useChannelsStore } from "./store";
import type {
  AgentDraft,
  Channel,
  ChannelAuthor,
  ChannelTimeline,
  CrossChannelAgent,
  SendResult,
  SubThreadSummary,
} from "./types";

export type { AgentDraft } from "./types";

export function useChannels(): { ready: boolean; channels: Channel[] } {
  const projects = useProjects();
  const shells = useQuietThreadShells();
  const shellsReady = useAllEnvironmentShellsBootstrapped();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const configs = useChannelsStore((state) => state.channels);
  const lastSeen = useChannelsStore((state) => state.lastSeen);
  return {
    ready: shellsReady && projectsReady,
    channels: deriveChannels({ projects, shells, configs, lastSeen }),
  };
}

export function useChannel(environmentId: EnvironmentId, projectId: ProjectId): Channel | null {
  const { channels } = useChannels();
  return (
    channels.find(
      (channel) => channel.environmentId === environmentId && channel.projectId === projectId,
    ) ?? null
  );
}

function useChildResolver(environmentId: EnvironmentId | null): ChildResolver {
  const shells = useQuietThreadShells();
  const byId = new Map(
    shells
      .filter((shell) => shell.environmentId === environmentId)
      .map((shell) => [shell.id, shell] as const),
  );
  return (childThreadId) => {
    const shell = byId.get(childThreadId);
    return shell === undefined ? null : childInfoFromShell(shell);
  };
}

export function useChannelTimeline(
  threadRef: ScopedThreadRef | null,
  author: ChannelAuthor,
): ChannelTimeline {
  const detail = useThreadProjection(threadRef);
  const shell = useQuietThreadShell(threadRef);
  const status = useThreadStatus(threadRef);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- shells lack secret requests, so an on-screen channel thread shares its loaded ones with the glance counts
  useEffect(() => {
    publishLoadedSecretRequests(threadRef, detail);
  }, [threadRef, detail]);
  const history = useThreadHistory(threadRef);
  const resolveChild = useChildResolver(threadRef?.environmentId ?? null);
  const now = useNowMinute();
  const loadEarlierHistory = useAtomCommand(threadEnvironment.loadEarlierHistory, {
    label: "load earlier channel history",
    reportFailure: false,
  });

  return {
    loading: threadRef !== null && detail === null && status !== "deleted",
    messages:
      threadRef === null || detail === null
        ? []
        : deriveChannelMessages(detail.projection, {
            environmentId: threadRef.environmentId,
            assistantAuthor: author,
            resolveChild,
            now,
          }),
    working: threadRuntimeIsActive(shell?.runtime ?? null),
    hasMoreHistory: history.hasMoreHistory,
    loadEarlier: () => {
      if (threadRef === null) return;
      void loadEarlierHistory({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId },
      });
    },
  };
}

/** Every delegated thread of the coordinator, newest activity first. */
export function useSubThreads(coordinatorRef: ScopedThreadRef | null): SubThreadSummary[] {
  const detail = useThreadProjection(coordinatorRef);
  const resolveChild = useChildResolver(coordinatorRef?.environmentId ?? null);
  if (coordinatorRef === null || detail === null) return [];
  return deriveSubThreads(detail.projection, {
    environmentId: coordinatorRef.environmentId,
    resolveChild,
  });
}

export function useUnread(threadRef: ScopedThreadRef | null): boolean {
  const shell = useQuietThreadShell(threadRef);
  const lastSeen = useChannelsStore((state) =>
    threadRef === null ? undefined : state.lastSeen[scopedThreadKey(threadRef)],
  );
  return isThreadUnread(shell, lastSeen);
}

/**
 * Records that everything currently in the thread has been seen, and keeps doing so while the
 * thread stays open. The returned function does the same on demand.
 */
export function useMarkSeen(threadRef: ScopedThreadRef | null): () => void {
  const shell = useQuietThreadShell(threadRef);
  const markSeen = useChannelsStore((state) => state.markSeen);
  const key = threadRef === null ? null : scopedThreadKey(threadRef);
  const at = shell === null ? null : latestThreadActivityAt(shell);
  const mark = () => {
    if (key !== null && at !== null) markSeen(key, at);
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the viewer's read marker to the persisted store while the thread is on screen
  useEffect(() => {
    if (key !== null && at !== null) markSeen(key, at);
  }, [key, at, markSeen]);
  return mark;
}

export function useUpdateChannelContext(channel: Pick<Channel, "key">): (text: string) => void {
  const setContext = useChannelsStore((state) => state.setContext);
  return (text) => setContext(channel.key, text);
}

export function useAgents(): CrossChannelAgent[] {
  return useChannelsStore((state) => state.agents);
}

export function useAgentThreadRef(
  agent: Pick<CrossChannelAgent, "environmentId" | "threadId"> | null,
): ScopedThreadRef | null {
  const ref =
    agent === null || agent.threadId === null
      ? null
      : scopeThreadRef(agent.environmentId, agent.threadId);
  const shell = useQuietThreadShell(ref);
  return shell === null ? null : ref;
}

function describeFailure(result: AtomCommandResult<unknown, unknown>): string {
  if (result._tag !== "Failure") return "Something went wrong.";
  const error = squashAtomCommandFailure(result);
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Something went wrong.";
}

function resolveNewThreadDefaults(project: EnvironmentProject) {
  const config = appAtomRegistry.get(environmentServerConfigsAtom).get(project.environmentId);
  const settings = config?.settings ?? DEFAULT_SERVER_SETTINGS;
  const providers = config?.providers ?? [];
  const projectSettings = resolveProjectSettings(settings, project.id, project);
  const resolved = resolveNewThreadModelSelection({
    defaultSelection:
      projectSettings.settings.defaultModelSelection ??
      resolveProjectDefaultProviderModelSelection(providers, settings, project.id),
    fallbackSelection: settings.fallbackModelSelection ?? null,
    providers,
    settings,
    projectId: project.id,
    now: Date.now(),
  });
  return {
    modelSelection: resolved.selection,
    runtimeMode: projectSettings.settings.defaultRuntimeMode,
  };
}

function useThreadSenders() {
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const deleteThread = useOrchestrationCommand(threadEnvironment.delete, { reportFailure: false });
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });

  /** Creates a thread in the project and sends its first message; removes the thread if that fails. */
  const startNewThread = async (
    project: EnvironmentProject,
    title: string,
    text: string,
  ): Promise<SendResult> => {
    const defaults = resolveNewThreadDefaults(project);
    if (defaults.modelSelection === null) {
      return {
        ok: false,
        error: "No model is available for this project. Check your providers in settings.",
      };
    }
    const { environmentId } = project;
    const threadId = newThreadId();
    const createdAt = new Date().toISOString();
    const created = await createThread({
      environmentId,
      input: {
        threadId,
        projectId: project.id,
        title,
        modelSelection: defaults.modelSelection,
        runtimeMode: defaults.runtimeMode,
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      },
    });
    if (created._tag === "Failure") return { ok: false, error: describeFailure(created) };
    const started = await startTurn({
      environmentId,
      input: {
        threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        modelSelection: defaults.modelSelection,
        runtimeMode: defaults.runtimeMode,
        interactionMode: "default",
        createdAt,
      },
    });
    if (started._tag === "Failure") {
      await deleteThread({ environmentId, input: { threadId } });
      return { ok: false, error: describeFailure(started) };
    }
    return { ok: true, threadRef: scopeThreadRef(environmentId, threadId) };
  };

  /** A follow-up in an existing thread; the server queues or steers it when a run is active. */
  const sendFollowUp = async (ref: ScopedThreadRef, text: string): Promise<SendResult> => {
    const shell = readThreadShell(ref);
    if (shell === null) return { ok: false, error: "This thread is not available." };
    const result = await startTurn({
      environmentId: ref.environmentId,
      input: {
        threadId: ref.threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        modelSelection: shell.modelSelection,
        runtimeMode: shell.runtimeMode,
        interactionMode: shell.interactionMode,
        dispatchMode: "auto",
        createdAt: new Date().toISOString(),
      },
    });
    return result._tag === "Failure"
      ? { ok: false, error: describeFailure(result) }
      : { ok: true, threadRef: ref };
  };

  return { startNewThread, sendFollowUp };
}

export function useSendToThread(): (ref: ScopedThreadRef, text: string) => Promise<SendResult> {
  const { sendFollowUp } = useThreadSenders();
  return async (ref, text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return { ok: false, error: "Write a message first." };
    return sendFollowUp(ref, trimmed);
  };
}

function agentThreadRef(agent: CrossChannelAgent): ScopedThreadRef | null {
  if (agent.threadId === null) return null;
  const ref = scopeThreadRef(agent.environmentId, agent.threadId);
  return readThreadShell(ref) === null ? null : ref;
}

/**
 * Sends a channel message to its coordinator. The first send creates the coordinator thread and
 * puts the brief in front of the user's text. A message that starts with an agent's @handle goes
 * to that agent instead.
 */
export function useSendToChannel(
  channel: Pick<Channel, "key" | "name" | "environmentId" | "projectId">,
): (text: string) => Promise<SendResult> {
  const { startNewThread, sendFollowUp } = useThreadSenders();

  return async (text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return { ok: false, error: "Write a message first." };
    const store = useChannelsStore.getState();

    const mention = parseMention(trimmed, store.agents);
    if (mention !== null) {
      if (mention.rest.length === 0) {
        return { ok: false, error: `Tell @${mention.agent.handle} what you need.` };
      }
      const ref = agentThreadRef(mention.agent);
      if (ref === null) {
        return {
          ok: false,
          error: `@${mention.agent.handle} has no thread yet. Open and save the agent first.`,
        };
      }
      const sent = await sendFollowUp(
        ref,
        buildMentionForward({
          channelName: channel.name,
          environmentId: channel.environmentId,
          projectId: channel.projectId,
          text: mention.rest,
        }),
      );
      if (sent.ok) {
        toastManager.add({ type: "success", title: `Sent to @${mention.agent.handle}` });
      }
      return sent;
    }

    const project = readProject(scopeProjectRef(channel.environmentId, channel.projectId));
    if (project === null) return { ok: false, error: "This project is no longer available." };
    const config = selectChannelConfig(channel.key)(store);
    const coordinator = findCoordinatorThread(
      readThreadShells(),
      project,
      config.coordinatorThreadId,
    );

    if (coordinator === null) {
      const brief = buildCoordinatorBrief({
        channelName: channel.name,
        projectTitle: project.title,
        workspaceRoot: project.workspaceRoot,
        context: config.context,
        agents: store.agents,
      });
      const created = await startNewThread(
        project,
        coordinatorThreadTitle(project.title),
        joinWithUserText(brief, trimmed),
      );
      if (created.ok) {
        store.setCoordinator(channel.key, created.threadRef.threadId);
        store.markContextSent(channel.key, config.context);
        store.markSeen(scopedThreadKey(created.threadRef), new Date().toISOString());
      }
      return created;
    }

    const ref = scopeThreadRef(coordinator.environmentId, coordinator.id);
    const contextChanged = (config.contextSentToCoordinator ?? "") !== config.context;
    const outgoing = contextChanged
      ? joinWithUserText(buildContextUpdate(config.context), trimmed)
      : trimmed;
    const sent = await sendFollowUp(ref, outgoing);
    if (sent.ok) {
      store.setCoordinator(channel.key, coordinator.id);
      if (contextChanged) store.markContextSent(channel.key, config.context);
      store.markSeen(scopedThreadKey(ref), new Date().toISOString());
    }
    return sent;
  };
}

export function useSaveAgent(): (draft: AgentDraft) => Promise<SendResult> {
  const { startNewThread, sendFollowUp } = useThreadSenders();
  const upsertTask = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    label: "save agent sweep",
    reportFailure: false,
  });
  const deleteTask = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "remove agent sweep",
    reportFailure: false,
  });

  return async (draft) => {
    const store = useChannelsStore.getState();
    const existing = store.agents.find((agent) => agent.id === draft.id) ?? null;
    const project = readProject(scopeProjectRef(draft.environmentId, draft.homeProjectId));
    if (project === null) return { ok: false, error: "The home project is no longer available." };

    let agent: CrossChannelAgent = {
      id: draft.id ?? existing?.id ?? randomUUID(),
      preset: draft.preset,
      name: draft.name.trim() || "Agent",
      handle: draft.handle,
      emoji: draft.emoji,
      role: draft.role,
      environmentId: draft.environmentId,
      homeProjectId: draft.homeProjectId,
      threadId: existing?.threadId ?? draft.threadId ?? null,
      sweepEveryMinutes: draft.sweepEveryMinutes,
      scheduledTaskId: existing?.scheduledTaskId ?? draft.scheduledTaskId ?? null,
      createdAt: existing?.createdAt ?? draft.createdAt ?? new Date().toISOString(),
    };

    let threadRef = agentThreadRef(agent);
    if (threadRef === null) {
      const created = await startNewThread(
        project,
        agentThreadTitle(agent),
        buildAgentBrief(agent, { homeProjectTitle: project.title }),
      );
      if (!created.ok) return created;
      threadRef = created.threadRef;
      agent = { ...agent, threadId: threadRef.threadId };
      store.markSeen(scopedThreadKey(threadRef), new Date().toISOString());
    } else if (
      existing !== null &&
      (existing.role !== agent.role ||
        existing.name !== agent.name ||
        existing.handle !== agent.handle ||
        existing.emoji !== agent.emoji)
    ) {
      await sendFollowUp(threadRef, buildAgentRoleUpdate(agent));
    }
    store.upsertAgent(agent);

    const everyMs = agent.sweepEveryMinutes === null ? null : agent.sweepEveryMinutes * 60_000;
    if (everyMs !== null && everyMs >= MIN_SCHEDULED_TASK_INTERVAL_MS) {
      const defaults = resolveNewThreadDefaults(project);
      if (defaults.modelSelection === null) {
        return { ok: false, error: "No model is available to schedule sweeps." };
      }
      const saved = await upsertTask({
        environmentId: agent.environmentId,
        input: {
          ...(agent.scheduledTaskId === null
            ? {}
            : { id: ScheduledTaskId.make(agent.scheduledTaskId) }),
          title: `${agent.name} sweep`,
          prompt: buildAgentSweepPrompt(agent),
          enabled: true,
          schedule: { type: "interval", everyMs },
          projectId: agent.homeProjectId,
          threadId: threadRef.threadId,
          threadMode: "continue",
          workspaceStrategy: { type: "root" },
          modelSelection: defaults.modelSelection,
          runtimeMode: defaults.runtimeMode,
          interactionMode: "default",
          creationSource: "web",
        },
      });
      if (saved._tag === "Failure") return { ok: false, error: describeFailure(saved) };
      agent = { ...agent, scheduledTaskId: saved.value.task.id };
      store.upsertAgent(agent);
    } else if (agent.scheduledTaskId !== null) {
      const removed = await deleteTask({
        environmentId: agent.environmentId,
        input: { id: ScheduledTaskId.make(agent.scheduledTaskId) },
      });
      if (removed._tag === "Failure") return { ok: false, error: describeFailure(removed) };
      agent = { ...agent, scheduledTaskId: null };
      store.upsertAgent(agent);
    }

    return { ok: true, threadRef };
  };
}

/** Removes the agent and its sweep schedule. Its thread stays as ordinary history. */
export function useRemoveAgent(): (
  agentId: string,
) => Promise<{ ok: true } | { ok: false; error: string }> {
  const deleteTask = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "remove agent sweep",
    reportFailure: false,
  });
  return async (agentId) => {
    const store = useChannelsStore.getState();
    const agent = store.agents.find((candidate) => candidate.id === agentId);
    if (agent === undefined) return { ok: true };
    if (agent.scheduledTaskId !== null) {
      const removed = await deleteTask({
        environmentId: agent.environmentId,
        input: { id: ScheduledTaskId.make(agent.scheduledTaskId) },
      });
      if (removed._tag === "Failure") return { ok: false, error: describeFailure(removed) };
    }
    store.removeAgent(agentId);
    return { ok: true };
  };
}

export function useRunAgentNow(): (agent: CrossChannelAgent) => Promise<SendResult> {
  const sendToAgent = useSendToAgent();
  return (agent) => sendToAgent(agent, buildAgentSweepPrompt(agent));
}

/** Sends to an agent's thread, creating it (brief first, then the text) when the agent has none yet. */
export function useSendToAgent(): (agent: CrossChannelAgent, text: string) => Promise<SendResult> {
  const { startNewThread, sendFollowUp } = useThreadSenders();
  return async (agent, text) => {
    const ref = agentThreadRef(agent);
    if (ref !== null) return sendFollowUp(ref, text);
    const project = readProject(scopeProjectRef(agent.environmentId, agent.homeProjectId));
    if (project === null)
      return { ok: false, error: "The agent's home project is no longer available." };
    const created = await startNewThread(
      project,
      agentThreadTitle(agent),
      joinWithUserText(buildAgentBrief(agent, { homeProjectTitle: project.title }), text),
    );
    if (!created.ok) return created;
    const store = useChannelsStore.getState();
    const latest = store.agents.find((candidate) => candidate.id === agent.id) ?? agent;
    store.upsertAgent({ ...latest, threadId: created.threadRef.threadId });
    return created;
  };
}
