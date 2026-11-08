import type { EnvironmentId, ProjectId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";

/** A channel is one project. Its key is `scopedProjectKey({ environmentId, projectId })`. */
export interface Channel {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly workspaceRoot: string;
  readonly context: string;
  readonly coordinatorRef: ScopedThreadRef | null;
  readonly unread: boolean;
  readonly active: boolean;
  readonly openThreadCount: number;
}

/** Client-persisted per-channel config. */
export interface ChannelConfig {
  readonly context: string;
  readonly coordinatorThreadId: ThreadId | null;
  /** Context text the coordinator was last told about, so edits can be sent as an update. */
  readonly contextSentToCoordinator: string | null;
}

export type AgentPresetId = "rummage" | "social" | "custom";

/** A cross-channel agent. It lives in one home project's thread and reads every channel through T3 MCP tools. */
export interface CrossChannelAgent {
  readonly id: string;
  readonly preset: AgentPresetId;
  readonly name: string;
  /** Lowercase, no spaces; used for @mentions in channels. */
  readonly handle: string;
  readonly emoji: string;
  readonly role: string;
  readonly environmentId: EnvironmentId;
  readonly homeProjectId: ProjectId;
  readonly threadId: ThreadId | null;
  /** Minutes between sweeps across channels; null means only on demand. */
  readonly sweepEveryMinutes: number | null;
  readonly scheduledTaskId: string | null;
  readonly createdAt: string;
}

export type ChannelAuthor =
  | { readonly kind: "user" }
  | { readonly kind: "coordinator" }
  | {
      readonly kind: "agent";
      readonly agentId: string | null;
      readonly name: string;
      readonly emoji: string;
    }
  | { readonly kind: "worker"; readonly title: string }
  | { readonly kind: "system" };

export type SubThreadStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "idle";

/** A delegated task, shown as a Slack-style thread hanging off the coordinator message that started it. */
export interface SubThreadSummary {
  readonly subagentId: string;
  readonly childRef: ScopedThreadRef | null;
  readonly title: string;
  readonly prompt: string;
  readonly status: SubThreadStatus;
  readonly result: string | null;
  readonly replyCount: number;
  readonly lastActivityAt: string | null;
  readonly needsAttention: boolean;
}

export type ChannelMessage =
  | {
      readonly kind: "message";
      readonly id: string;
      readonly author: ChannelAuthor;
      readonly text: string;
      readonly streaming: boolean;
      readonly createdAt: string;
      /** Sub-threads this message spawned (delegate_task calls in the same assistant run). */
      readonly threads: ReadonlyArray<SubThreadSummary>;
      /** Count of tool calls folded into this message, shown as a muted "used N tools" line. */
      readonly toolCallCount: number;
    }
  | {
      /** A child finished and woke the coordinator; rendered as a compact system line. */
      readonly kind: "thread-event";
      readonly id: string;
      readonly createdAt: string;
      readonly subThread: SubThreadSummary | null;
      readonly outcome: "completed" | "failed" | "cancelled" | "updated" | "unknown";
      readonly summary: string;
    }
  | { readonly kind: "day-divider"; readonly id: string; readonly label: string };

export interface ChannelTimeline {
  readonly loading: boolean;
  readonly messages: ReadonlyArray<ChannelMessage>;
  /** True while the coordinator (or agent) has an active run. */
  readonly working: boolean;
  readonly hasMoreHistory: boolean;
  readonly loadEarlier: () => void;
}

export type SendResult =
  | { readonly ok: true; readonly threadRef: ScopedThreadRef }
  | { readonly ok: false; readonly error: string };

/** Input to `useSaveAgent`: a new agent, or an existing one with edits. Server-assigned fields are optional. */
export type AgentDraft = Omit<
  CrossChannelAgent,
  "id" | "threadId" | "scheduledTaskId" | "createdAt"
> &
  Partial<Pick<CrossChannelAgent, "id" | "threadId" | "scheduledTaskId" | "createdAt">>;
