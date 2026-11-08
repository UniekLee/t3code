import {
  scopedProjectKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  threadRuntimeIsActive,
  type EnvironmentProject,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  isListedThreadLineage,
  type EnvironmentId,
  type OrchestrationV2ThreadProjection,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { classifyOutgoingText, coordinatorThreadTitle, slugifyChannelName } from "./prompts";
import type {
  Channel,
  ChannelAuthor,
  ChannelConfig,
  ChannelMessage,
  SubThreadStatus,
  SubThreadSummary,
} from "./types";

type Timestamp = string | DateTime.Utc;

function toIso(value: Timestamp): string {
  return typeof value === "string" ? value : DateTime.formatIso(value);
}

function toMillis(value: string | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  return Date.parse(value);
}

/** What the timeline needs to know about a delegated child thread, read from its shell. */
export interface ChildThreadInfo {
  readonly title: string;
  readonly updatedAt: string;
  readonly visibleItemCount: number;
  readonly active: boolean;
  readonly needsAttention: boolean;
}

export type ChildResolver = (childThreadId: ThreadId) => ChildThreadInfo | null;

export function childInfoFromShell(
  shell: Pick<
    EnvironmentThreadShell,
    | "title"
    | "updatedAt"
    | "visibleItemCount"
    | "runtime"
    | "hasPendingApprovals"
    | "hasPendingUserInput"
  >,
): ChildThreadInfo {
  return {
    title: shell.title,
    updatedAt: shell.updatedAt,
    visibleItemCount: shell.visibleItemCount,
    active: threadRuntimeIsActive(shell.runtime),
    needsAttention: shell.hasPendingApprovals || shell.hasPendingUserInput,
  };
}

type ProjectionSubagent = OrchestrationV2ThreadProjection["subagents"][number];

function truncateLine(text: string, max: number): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length <= max ? line : `${line.slice(0, max - 3).trimEnd()}...`;
}

function subThreadStatus(
  subagent: ProjectionSubagent,
  child: ChildThreadInfo | null,
): SubThreadStatus {
  if (child?.needsAttention) return "waiting";
  if (child?.active) return "running";
  return subagent.status;
}

function buildSubThread(
  environmentId: EnvironmentId,
  subagent: ProjectionSubagent,
  resolveChild: ChildResolver,
): SubThreadSummary {
  const childThreadId = subagent.childThreadId;
  const child = childThreadId === null ? null : resolveChild(childThreadId);
  const title =
    (subagent.title !== null && subagent.title.trim().length > 0 ? subagent.title.trim() : null) ??
    (child !== null && child.title.trim().length > 0 ? child.title.trim() : null) ??
    (truncateLine(subagent.prompt, 60) || "Untitled task");
  const lastActivityAt =
    child?.updatedAt ??
    (subagent.completedAt !== null ? toIso(subagent.completedAt) : null) ??
    toIso(subagent.updatedAt);
  return {
    subagentId: subagent.id,
    childRef: childThreadId === null ? null : scopeThreadRef(environmentId, childThreadId),
    title,
    prompt: subagent.prompt,
    status: subThreadStatus(subagent, child),
    result: subagent.result,
    // The shell has no message count; visible items minus the opening prompt is the closest cheap signal.
    replyCount: child === null ? 0 : Math.max(0, child.visibleItemCount - 1),
    lastActivityAt,
    needsAttention: child?.needsAttention === true || subagent.status === "waiting",
  };
}

/** Every delegated (app owned) thread of a thread, newest activity first. */
export function deriveSubThreads(
  projection: Pick<OrchestrationV2ThreadProjection, "subagents">,
  opts: { readonly environmentId: EnvironmentId; readonly resolveChild: ChildResolver },
): SubThreadSummary[] {
  return projection.subagents
    .filter((subagent) => subagent.origin === "app_owned" && subagent.childThreadId !== null)
    .map((subagent) => buildSubThread(opts.environmentId, subagent, opts.resolveChild))
    .toSorted((a, b) => (toMillis(b.lastActivityAt) || 0) - (toMillis(a.lastActivityAt) || 0));
}

export interface DeriveMessagesOptions {
  readonly environmentId: EnvironmentId;
  /** Who assistant messages in this thread are from. */
  readonly assistantAuthor: ChannelAuthor;
  readonly resolveChild: ChildResolver;
  /** IANA zone for day dividers; defaults to the viewer's zone. */
  readonly timeZone?: string;
  /** ISO time used to label dividers "Today" and "Yesterday"; absolute dates when omitted. */
  readonly now?: string;
}

type ProjectionForMessages = Pick<
  OrchestrationV2ThreadProjection,
  "messages" | "visibleTurnItems" | "subagents"
>;
type ProjectionMessage = OrchestrationV2ThreadProjection["messages"][number];

const DELEGATED_SOURCE_KINDS = new Set(["delegated_task", "subagent"]);

function isWakeMessage(message: ProjectionMessage): boolean {
  return (
    message.delegatedCompletion !== undefined ||
    (message.notification !== undefined &&
      DELEGATED_SOURCE_KINDS.has(message.notification.source.kind))
  );
}

const WAKE_TEXT_PATTERN = /^Delegated task .*\[([a-z_]+)\]/;

function wakeOutcome(
  message: ProjectionMessage,
): Extract<ChannelMessage, { kind: "thread-event" }>["outcome"] {
  if (message.notification !== undefined) return message.notification.outcome;
  const status = WAKE_TEXT_PATTERN.exec(message.text)?.[1];
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "unknown";
}

function wakeSummary(message: ProjectionMessage, subThread: SubThreadSummary | null): string {
  if (message.notification !== undefined) return message.notification.summary;
  if (subThread !== null) return subThread.title;
  return truncateLine(message.text, 120);
}

function findWakeSubagent(
  message: ProjectionMessage,
  subagents: ReadonlyArray<ProjectionSubagent>,
): ProjectionSubagent | undefined {
  const source = message.notification?.source;
  const childThreadId =
    source !== undefined && "childThreadId" in source ? source.childThreadId : undefined;
  if (childThreadId !== undefined) {
    const byChild = subagents.find((subagent) => subagent.childThreadId === childThreadId);
    if (byChild !== undefined) return byChild;
  }
  const taskId = message.delegatedCompletion?.taskIds[0];
  return taskId === undefined ? undefined : subagents.find((subagent) => subagent.id === taskId);
}

interface Bubble {
  id: string;
  runId: string | null;
  createdAt: string;
  parts: string[];
  streaming: boolean;
  toolCallCount: number;
  threads: SubThreadSummary[];
}

type MessageEntry = Exclude<ChannelMessage, { kind: "day-divider" }>;

export function deriveChannelMessages(
  projection: ProjectionForMessages,
  opts: DeriveMessagesOptions,
): ChannelMessage[] {
  const messagesById = new Map(projection.messages.map((message) => [message.id, message]));
  const entries: MessageEntry[] = [];
  let bubble: Bubble | null = null;
  const seenSubagents = new Set<string>();

  const flush = () => {
    if (bubble === null) return;
    const text = bubble.parts.join("\n\n");
    if (text.trim().length > 0 || bubble.toolCallCount > 0 || bubble.threads.length > 0) {
      entries.push({
        kind: "message",
        id: bubble.id,
        author: opts.assistantAuthor,
        text,
        streaming: bubble.streaming,
        createdAt: bubble.createdAt,
        threads: bubble.threads,
        toolCallCount: bubble.toolCallCount,
      });
    }
    bubble = null;
  };

  const ensureBubble = (itemId: string, runId: string | null, createdAt: string): Bubble => {
    if (bubble !== null && bubble.runId === runId) return bubble;
    flush();
    bubble = {
      id: itemId,
      runId,
      createdAt,
      parts: [],
      streaming: false,
      toolCallCount: 0,
      threads: [],
    };
    return bubble;
  };

  const pushSystem = (id: string, createdAt: string, text: string) => {
    entries.push({
      kind: "message",
      id,
      author: { kind: "system" },
      text,
      streaming: false,
      createdAt,
      threads: [],
      toolCallCount: 0,
    });
  };

  const ordered = projection.visibleTurnItems.toSorted((a, b) => a.position - b.position);
  for (const projected of ordered) {
    const item = projected.item;
    const itemCreatedAt = toIso(item.startedAt ?? item.updatedAt);
    switch (item.type) {
      case "user_message": {
        flush();
        const message = messagesById.get(item.messageId);
        const createdAt = toIso(message?.createdAt ?? itemCreatedAt);
        if (message !== undefined && isWakeMessage(message)) {
          const subagent = findWakeSubagent(message, projection.subagents);
          const subThread =
            subagent === undefined
              ? null
              : buildSubThread(opts.environmentId, subagent, opts.resolveChild);
          entries.push({
            kind: "thread-event",
            id: item.id,
            createdAt,
            subThread,
            outcome: wakeOutcome(message),
            summary: wakeSummary(message, subThread),
          });
          break;
        }
        const rawText = message?.text ?? item.text;
        const { kind, body } = classifyOutgoingText(rawText);
        if (kind === "sweep") {
          pushSystem(item.id, createdAt, "Sweep started");
          break;
        }
        if (kind === "context-update")
          pushSystem(`${item.id}:context`, createdAt, "Channel context updated");
        if (kind === "role-update") pushSystem(`${item.id}:role`, createdAt, "Agent role updated");
        if (kind === "plain" && (message?.scheduledTaskId ?? item.scheduledTaskId) !== undefined) {
          pushSystem(item.id, createdAt, "Scheduled run started");
          break;
        }
        if (body.trim().length > 0) {
          entries.push({
            kind: "message",
            id: item.id,
            author: { kind: "user" },
            text: body,
            streaming: false,
            createdAt,
            threads: [],
            toolCallCount: 0,
          });
        }
        break;
      }
      case "assistant_message": {
        const message = messagesById.get(item.messageId);
        const text = message?.text ?? item.text;
        const current = ensureBubble(
          item.id,
          item.runId,
          toIso(message?.createdAt ?? itemCreatedAt),
        );
        if (text.trim().length > 0) current.parts.push(text.trim());
        if (item.streaming || message?.streaming === true) current.streaming = true;
        break;
      }
      case "command_execution":
      case "file_change":
      case "file_search":
      case "web_search":
        ensureBubble(item.id, item.runId, itemCreatedAt).toolCallCount += 1;
        break;
      case "dynamic_tool":
        if (!(item.toolName ?? "").endsWith("delegate_task")) {
          ensureBubble(item.id, item.runId, itemCreatedAt).toolCallCount += 1;
        }
        break;
      case "subagent": {
        if (
          item.origin !== "app_owned" ||
          item.childThreadId === null ||
          seenSubagents.has(item.subagentId)
        ) {
          break;
        }
        const subagent = projection.subagents.find((candidate) => candidate.id === item.subagentId);
        if (subagent === undefined) break;
        seenSubagents.add(item.subagentId);
        ensureBubble(item.id, item.runId, itemCreatedAt).threads.push(
          buildSubThread(opts.environmentId, subagent, opts.resolveChild),
        );
        break;
      }
      case "error":
        flush();
        pushSystem(item.id, itemCreatedAt, `Run failed: ${item.failure.message}`);
        break;
      default:
        break;
    }
  }
  flush();

  return insertDayDividers(entries, opts);
}

function dayKey(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function formatDayLabel(iso: string, opts: { timeZone?: string; now?: string }): string {
  if (opts.now !== undefined) {
    const key = dayKey(iso, opts.timeZone);
    if (key === dayKey(opts.now, opts.timeZone)) return "Today";
    const yesterday = new Date(new Date(opts.now).getTime() - 24 * 60 * 60 * 1000).toISOString();
    if (key === dayKey(yesterday, opts.timeZone)) return "Yesterday";
  }
  const sameYear =
    opts.now !== undefined &&
    new Intl.DateTimeFormat("en-US", { timeZone: opts.timeZone, year: "numeric" }).format(
      new Date(iso),
    ) ===
      new Intl.DateTimeFormat("en-US", { timeZone: opts.timeZone, year: "numeric" }).format(
        new Date(opts.now),
      );
  return new Intl.DateTimeFormat("en-US", {
    timeZone: opts.timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(iso));
}

function insertDayDividers(
  entries: ReadonlyArray<MessageEntry>,
  opts: Pick<DeriveMessagesOptions, "timeZone" | "now">,
): ChannelMessage[] {
  const out: ChannelMessage[] = [];
  let previousKey: string | null = null;
  for (const entry of entries) {
    if (Number.isNaN(Date.parse(entry.createdAt))) {
      out.push(entry);
      continue;
    }
    const key = dayKey(entry.createdAt, opts.timeZone);
    if (key !== previousKey) {
      out.push({
        kind: "day-divider",
        id: `day:${key}`,
        label: formatDayLabel(entry.createdAt, opts),
      });
      previousKey = key;
    }
    out.push(entry);
  }
  return out;
}

export type ShellLike = Pick<
  EnvironmentThreadShell,
  | "environmentId"
  | "id"
  | "projectId"
  | "title"
  | "createdAt"
  | "updatedAt"
  | "archivedAt"
  | "deletedAt"
  | "lineage"
  | "runtime"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
> & {
  readonly source: {
    readonly latestVisibleMessage: { readonly role: string; readonly updatedAt: Timestamp } | null;
  };
};

/** A live, top level thread: not archived or deleted, and not a subagent or side chat. */
function isChannelListedThread(
  shell: Pick<EnvironmentThreadShell, "archivedAt" | "deletedAt" | "lineage">,
): boolean {
  return (
    shell.archivedAt === null && shell.deletedAt === null && isListedThreadLineage(shell.lineage)
  );
}

/** The stored coordinator if it still exists, else the oldest listed thread titled like one. */
export function findCoordinatorThread<
  T extends Pick<
    EnvironmentThreadShell,
    | "environmentId"
    | "id"
    | "projectId"
    | "title"
    | "createdAt"
    | "archivedAt"
    | "deletedAt"
    | "lineage"
  >,
>(
  shells: ReadonlyArray<T>,
  project: Pick<EnvironmentProject, "environmentId" | "id" | "title">,
  storedId: ThreadId | null,
): T | null {
  const inProject = shells.filter(
    (shell) =>
      shell.environmentId === project.environmentId &&
      shell.projectId === project.id &&
      isChannelListedThread(shell),
  );
  if (storedId !== null) {
    const stored = inProject.find((shell) => shell.id === storedId);
    if (stored !== undefined) return stored;
  }
  const title = coordinatorThreadTitle(project.title);
  return (
    inProject
      .filter((shell) => shell.title === title)
      .toSorted((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))[0] ?? null
  );
}

/** Unseen assistant output or a pending question, measured against the last time the viewer looked. */
export function isThreadUnread(
  shell: Pick<ShellLike, "hasPendingApprovals" | "hasPendingUserInput" | "source"> | null,
  lastSeen: string | undefined,
): boolean {
  if (shell === null) return false;
  if (shell.hasPendingApprovals || shell.hasPendingUserInput) return true;
  const latest = shell.source.latestVisibleMessage;
  if (latest === null || latest.role !== "assistant" || lastSeen === undefined) return false;
  return toMillis(toIso(latest.updatedAt)) > toMillis(lastSeen);
}

/** The time to record when the viewer has seen everything the shell shows. */
export function latestThreadActivityAt(shell: Pick<ShellLike, "updatedAt" | "source">): string {
  const latest = shell.source.latestVisibleMessage;
  const messageAt = latest === null ? shell.updatedAt : toIso(latest.updatedAt);
  return toMillis(messageAt) > toMillis(shell.updatedAt) ? messageAt : shell.updatedAt;
}

export type ChannelProjectLike = Pick<
  EnvironmentProject,
  "environmentId" | "id" | "title" | "workspaceRoot"
> & {
  readonly archivedAt?: unknown;
  readonly isScratch?: boolean;
  readonly pinnedAt?: unknown;
};

/** Slugs for each key, with `-2`, `-3` appended on collisions so mentions and names stay unique. */
export function assignUniqueNames(
  entries: ReadonlyArray<{ readonly key: string; readonly title: string }>,
): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const entry of entries) {
    const base = slugifyChannelName(entry.title);
    let name = base;
    for (let suffix = 2; used.has(name); suffix += 1) name = `${base}-${suffix}`;
    used.add(name);
    names.set(entry.key, name);
  }
  return names;
}

export function deriveChannels(input: {
  readonly projects: ReadonlyArray<ChannelProjectLike>;
  readonly shells: ReadonlyArray<ShellLike>;
  readonly configs: Readonly<Record<string, ChannelConfig>>;
  readonly lastSeen: Readonly<Record<string, string>>;
}): Channel[] {
  const eligible = input.projects
    .filter((project) => !project.archivedAt && project.isScratch !== true)
    .toSorted((a, b) => {
      const pinned = Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt));
      return pinned !== 0 ? pinned : a.title.localeCompare(b.title);
    });

  const shellsByProject = new Map<string, ShellLike[]>();
  for (const shell of input.shells) {
    const key = scopedProjectKey({
      environmentId: shell.environmentId,
      projectId: shell.projectId,
    });
    const list = shellsByProject.get(key);
    if (list === undefined) shellsByProject.set(key, [shell]);
    else list.push(shell);
  }

  const seen = new Set<string>();
  const keyed = eligible
    .map((project) => ({
      project,
      key: scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }),
    }))
    // The project list can carry the same project twice (e.g. an MCP-created project mid-sync).
    .filter(({ key }) => !seen.has(key) && Boolean(seen.add(key)));
  const names = assignUniqueNames(keyed.map(({ project, key }) => ({ key, title: project.title })));

  return keyed.map(({ project, key }) => {
    const config = input.configs[key];
    const projectShells = shellsByProject.get(key) ?? [];
    const coordinator = findCoordinatorThread(
      projectShells,
      project,
      config?.coordinatorThreadId ?? null,
    );
    const coordinatorRef =
      coordinator === null ? null : scopeThreadRef(coordinator.environmentId, coordinator.id);
    const children =
      coordinator === null
        ? []
        : projectShells.filter(
            (shell) => shell.lineage.parentThreadId === coordinator.id && shell.archivedAt === null,
          );
    return {
      key,
      environmentId: project.environmentId,
      projectId: project.id,
      name: names.get(key) ?? slugifyChannelName(project.title),
      workspaceRoot: project.workspaceRoot,
      context: config?.context ?? "",
      coordinatorRef,
      unread:
        coordinatorRef !== null &&
        isThreadUnread(coordinator, input.lastSeen[scopedThreadKey(coordinatorRef)]),
      active: coordinator !== null && threadRuntimeIsActive(coordinator.runtime),
      openThreadCount: children.filter(
        (child) =>
          threadRuntimeIsActive(child.runtime) ||
          child.hasPendingApprovals ||
          child.hasPendingUserInput,
      ).length,
    };
  });
}
