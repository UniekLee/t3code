import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { Channel, CrossChannelAgent } from "../types";

export type AttentionKind = "approval" | "question" | "secret" | "failed";

/** Who a thread belongs to: a channel (coordinator or sub-thread) or a cross-channel agent. */
export type AttentionOwner =
  | {
      readonly kind: "channel";
      readonly key: string;
      readonly environmentId: EnvironmentId;
      readonly projectId: ProjectId;
      readonly name: string;
      readonly workspaceRoot: string;
    }
  | {
      readonly kind: "agent";
      readonly key: string;
      readonly name: string;
      readonly emoji: string;
    };

export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  readonly threadRef: ScopedThreadRef;
  readonly owner: AttentionOwner;
  /** A delegated sub-thread of the owner's coordinator, as opposed to the coordinator or agent thread. */
  readonly subThread: boolean;
  readonly title: string;
  readonly detail: string;
  readonly createdAt: string;
}

/** A failed run stops asking for attention once it is this old, so history does not flood the inbox. */
const FAILED_RUN_ATTENTION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type ShellForAttention = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "title"
  | "updatedAt"
  | "archivedAt"
  | "deletedAt"
  | "runtime"
  | "latestRun"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "pendingUserInputAt"
  | "settledOverride"
  | "lastVisitedAt"
> & {
  readonly source: {
    readonly lastError?: string | null | undefined;
    readonly pendingRuntimeRequest: {
      readonly kind: string;
      readonly createdAt: DateTime.Utc | string;
    } | null;
  };
};

export interface PendingSecretRequest {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
}

function millis(value: string | null | undefined): number {
  return value === null || value === undefined ? Number.NaN : Date.parse(value);
}

function isoOf(value: DateTime.Utc | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : DateTime.formatIso(value);
}

const REQUEST_KIND_LABEL: Record<string, string> = {
  command: "Run a command",
  "file-read": "Read files",
  "file-change": "Change files",
  "mcp-elicitation": "Tool request",
  permission: "Grant a permission",
  dynamic_tool_call: "Tool call",
};

/** The attention items one thread contributes, newest concern first. */
export function deriveThreadAttention(input: {
  readonly shell: ShellForAttention;
  readonly owner: AttentionOwner;
  readonly subThread: boolean;
  /** Ids of failed-run items the viewer already dismissed. */
  readonly dismissed: ReadonlySet<string>;
  readonly now: number;
  readonly secrets?: ReadonlyArray<PendingSecretRequest> | undefined;
}): AttentionItem[] {
  const { shell, owner, subThread, dismissed, now } = input;
  if (shell.archivedAt !== null || shell.deletedAt !== null) return [];
  const threadRef = scopeThreadRef(shell.environmentId, shell.id);
  const threadKey = scopedThreadKey(threadRef);
  const title = subThread ? shell.title : owner.kind === "agent" ? owner.name : "Coordinator";
  const base = { threadRef, owner, subThread, title };
  const items: AttentionItem[] = [];

  const request = shell.source.pendingRuntimeRequest;
  if (shell.hasPendingUserInput) {
    items.push({
      ...base,
      id: `${threadKey}:question`,
      kind: "question",
      detail: "Asked you a question",
      createdAt: shell.pendingUserInputAt ?? isoOf(request?.createdAt) ?? shell.updatedAt,
    });
  } else if (shell.hasPendingApprovals) {
    items.push({
      ...base,
      id: `${threadKey}:approval`,
      kind: "approval",
      detail: request ? (REQUEST_KIND_LABEL[request.kind] ?? "Needs approval") : "Needs approval",
      createdAt: isoOf(request?.createdAt) ?? shell.updatedAt,
    });
  }

  for (const secret of input.secrets ?? []) {
    items.push({
      ...base,
      id: `${threadKey}:secret:${secret.id}`,
      kind: "secret",
      detail: secret.label,
      createdAt: secret.createdAt,
    });
  }

  const run = shell.latestRun;
  if (items.length === 0 && run?.status === "failed" && !threadRuntimeIsActive(shell.runtime)) {
    const failedAt = run.completedAt ?? run.startedAt ?? run.requestedAt ?? shell.updatedAt;
    const failedMs = millis(failedAt);
    const id = `${threadKey}:failed:${run.runId}`;
    const handled =
      dismissed.has(id) ||
      shell.settledOverride === "settled" ||
      millis(shell.lastVisitedAt) >= failedMs;
    if (!handled && now - failedMs <= FAILED_RUN_ATTENTION_WINDOW_MS) {
      items.push({
        ...base,
        id,
        kind: "failed",
        detail: shell.source.lastError?.trim() || "The last run failed",
        createdAt: failedAt,
      });
    }
  }
  return items;
}

/**
 * Every thing waiting on the viewer across channels, their sub-threads and agent threads, newest
 * first. Reads quiet shell state only; `secrets` is the optional detail from loaded projections.
 */
export function deriveAttentionItems(input: {
  readonly shells: ReadonlyArray<
    ShellForAttention & {
      readonly lineage: { readonly parentThreadId?: string | null | undefined };
    }
  >;
  readonly channels: ReadonlyArray<
    Pick<
      Channel,
      "key" | "name" | "workspaceRoot" | "coordinatorRef" | "environmentId" | "projectId"
    >
  >;
  readonly agents: ReadonlyArray<
    Pick<CrossChannelAgent, "id" | "name" | "emoji" | "environmentId" | "threadId">
  >;
  readonly dismissed: ReadonlySet<string>;
  readonly now: number;
  readonly secretsByThread?: ReadonlyMap<string, ReadonlyArray<PendingSecretRequest>>;
}): AttentionItem[] {
  const coordinators = new Map<string, AttentionOwner>();
  for (const channel of input.channels) {
    if (channel.coordinatorRef === null) continue;
    coordinators.set(
      `${channel.environmentId}:${channel.coordinatorRef.threadId}`,
      channelOwner(channel),
    );
  }
  const agentThreads = new Map<string, AttentionOwner>();
  for (const agent of input.agents) {
    if (agent.threadId === null) continue;
    agentThreads.set(`${agent.environmentId}:${agent.threadId}`, agentOwner(agent));
  }

  const items: AttentionItem[] = [];
  for (const shell of input.shells) {
    const own = `${shell.environmentId}:${shell.id}`;
    const parent =
      shell.lineage.parentThreadId == null
        ? null
        : `${shell.environmentId}:${shell.lineage.parentThreadId}`;
    const coordinator = coordinators.get(own);
    const agent = agentThreads.get(own);
    const parentOwner = parent === null ? undefined : coordinators.get(parent);
    const owner = coordinator ?? agent ?? parentOwner;
    if (owner === undefined) continue;
    const threadKey = scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
    items.push(
      ...deriveThreadAttention({
        shell,
        owner,
        subThread: coordinator === undefined && agent === undefined,
        dismissed: input.dismissed,
        now: input.now,
        ...(input.secretsByThread?.get(threadKey)
          ? { secrets: input.secretsByThread.get(threadKey) }
          : {}),
      }),
    );
  }
  return items.toSorted((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

/** Items grouped by owner, groups ordered by their newest item. */
export function groupAttentionByOwner(
  items: ReadonlyArray<AttentionItem>,
): Array<{ owner: AttentionOwner; items: AttentionItem[] }> {
  const groups = new Map<string, { owner: AttentionOwner; items: AttentionItem[] }>();
  for (const item of items) {
    const key = `${item.owner.kind}:${item.owner.key}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { owner: item.owner, items: [item] });
    else group.items.push(item);
  }
  return [...groups.values()];
}

export function ownerLabel(owner: AttentionOwner): string {
  return owner.kind === "channel" ? `#${owner.name}` : owner.name;
}

export function channelOwner(
  channel: Pick<Channel, "key" | "environmentId" | "projectId" | "name" | "workspaceRoot">,
): AttentionOwner {
  return {
    kind: "channel",
    key: channel.key,
    environmentId: channel.environmentId,
    projectId: channel.projectId,
    name: channel.name,
    workspaceRoot: channel.workspaceRoot,
  };
}

export function agentOwner(
  agent: Pick<CrossChannelAgent, "id" | "name" | "emoji">,
): AttentionOwner {
  return { kind: "agent", key: agent.id, name: agent.name, emoji: agent.emoji };
}
