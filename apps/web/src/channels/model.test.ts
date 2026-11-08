import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  assignUniqueNames,
  deriveChannelMessages,
  deriveChannels,
  deriveSubThreads,
  findCoordinatorThread,
  type ShellLike,
  formatDayLabel,
  isThreadUnread,
  type ChildThreadInfo,
} from "./model";
import {
  buildContextUpdate,
  buildCoordinatorBrief,
  classifyOutgoingText,
  joinWithUserText,
  parseMention,
  slugifyChannelName,
} from "./prompts";

const env = EnvironmentId.make("env-1");
const project = ProjectId.make("proj-1");
const T = (n: number) => `2026-11-08T10:0${n}:00.000Z`;

type Projection = Parameters<typeof deriveChannelMessages>[0];

const userItem = (position: number, id: string) => ({
  position,
  item: {
    type: "user_message",
    id,
    messageId: id,
    runId: "run-1",
    startedAt: null,
    updatedAt: T(position),
    text: "",
  },
});
const assistantItem = (position: number, id: string, runId = "run-1", streaming = false) => ({
  position,
  item: {
    type: "assistant_message",
    id,
    messageId: id,
    runId,
    startedAt: null,
    updatedAt: T(position),
    text: "",
    streaming,
  },
});
const toolItem = (position: number, id: string, toolName = "Read") => ({
  position,
  item: {
    type: "dynamic_tool",
    id,
    runId: "run-1",
    toolName,
    startedAt: null,
    updatedAt: T(position),
  },
});
const subagentItem = (position: number, id: string, subagentId: string) => ({
  position,
  item: {
    type: "subagent",
    id,
    subagentId,
    origin: "app_owned",
    childThreadId: `child-${subagentId}`,
    runId: "run-1",
    startedAt: null,
    updatedAt: T(position),
  },
});
const message = (id: string, role: string, text: string, extra: object = {}) => ({
  id,
  role,
  text,
  streaming: false,
  createdAt: T(1),
  ...extra,
});
const subagent = (id: string, status = "running", extra: object = {}) => ({
  id,
  origin: "app_owned",
  childThreadId: `child-${id}`,
  title: `Task ${id}`,
  prompt: "do it",
  status,
  result: null,
  startedAt: null,
  completedAt: null,
  updatedAt: T(2),
  ...extra,
});
const projection = (parts: { items: unknown[]; messages: unknown[]; subagents?: unknown[] }) =>
  ({
    visibleTurnItems: parts.items,
    messages: parts.messages,
    subagents: parts.subagents ?? [],
  }) as unknown as Projection;

const child: ChildThreadInfo = {
  title: "Child",
  updatedAt: T(5),
  visibleItemCount: 6,
  active: false,
  needsAttention: false,
};
const opts = {
  environmentId: env,
  assistantAuthor: { kind: "coordinator" } as const,
  resolveChild: () => child,
  timeZone: "UTC",
};

describe("deriveChannelMessages", () => {
  it("strips the brief, merges a run, folds tools, and attaches delegated threads", () => {
    const brief = joinWithUserText(
      buildCoordinatorBrief({
        channelName: "app",
        projectTitle: "App",
        workspaceRoot: "/w",
        context: "",
        agents: [],
      }),
      "fix the bug",
    );
    const messages = deriveChannelMessages(
      projection({
        items: [
          userItem(0, "m1"),
          assistantItem(1, "a1"),
          toolItem(2, "t1"),
          toolItem(3, "t2", "mcp__t3_code__delegate_task"),
          subagentItem(4, "s1", "sub-1"),
          assistantItem(5, "a2"),
        ],
        messages: [
          message("m1", "user", brief),
          message("a1", "assistant", "On it."),
          message("a2", "assistant", "Started a task."),
        ],
        subagents: [subagent("sub-1")],
      }),
      opts,
    );
    const real = messages.filter((m) => m.kind !== "day-divider");
    expect(messages[0]).toMatchObject({ kind: "day-divider", id: "day:2026-11-08" });
    expect(real).toHaveLength(2);
    expect(real[0]).toMatchObject({
      kind: "message",
      author: { kind: "user" },
      text: "fix the bug",
    });
    expect(real[1]).toMatchObject({
      kind: "message",
      text: "On it.\n\nStarted a task.",
      toolCallCount: 1,
      threads: [{ subagentId: "sub-1", title: "Task sub-1", replyCount: 5, status: "running" }],
    });
  });

  it("renders delegated completions as thread events and sweeps and context updates as system lines", () => {
    const messages = deriveChannelMessages(
      projection({
        items: [userItem(0, "w1"), userItem(1, "c1"), userItem(2, "s1")],
        messages: [
          message("w1", "user", "Delegated task sub-1 (Task) [completed]:\nok", {
            delegatedCompletion: { parentRunId: "run-1", generation: 1, taskIds: ["sub-1"] },
          }),
          message("c1", "user", joinWithUserText(buildContextUpdate("New goal"), "hello")),
          message("s1", "user", "[T3 Channels: sweep]\nRun your sweep now"),
        ],
        subagents: [subagent("sub-1", "completed")],
      }),
      opts,
    ).filter((m) => m.kind !== "day-divider");
    expect(messages[0]).toMatchObject({
      kind: "thread-event",
      outcome: "completed",
      subThread: { subagentId: "sub-1" },
    });
    expect(messages[1]).toMatchObject({
      author: { kind: "system" },
      text: "Channel context updated",
    });
    expect(messages[2]).toMatchObject({ author: { kind: "user" }, text: "hello" });
    expect(messages[3]).toMatchObject({ author: { kind: "system" }, text: "Sweep started" });
  });

  it("splits runs into separate bubbles and marks streaming", () => {
    const messages = deriveChannelMessages(
      projection({
        items: [assistantItem(0, "a1", "run-1"), assistantItem(1, "a2", "run-2", true)],
        messages: [
          message("a1", "assistant", "first"),
          message("a2", "assistant", "second", { streaming: true }),
        ],
      }),
      opts,
    ).filter((m) => m.kind === "message");
    expect(messages.map((m) => m.kind === "message" && [m.text, m.streaming])).toEqual([
      ["first", false],
      ["second", true],
    ]);
  });
});

describe("deriveSubThreads", () => {
  it("prefers waiting and running child state and sorts by newest activity", () => {
    const threads = deriveSubThreads(
      projection({
        items: [],
        messages: [],
        subagents: [subagent("a", "completed"), subagent("b", "completed")],
      }),
      {
        environmentId: env,
        resolveChild: (id) =>
          id === ("child-a" as ThreadId)
            ? { ...child, updatedAt: T(3), active: true }
            : { ...child, updatedAt: T(4), needsAttention: true },
      },
    );
    expect(threads.map((t) => [t.subagentId, t.status, t.needsAttention])).toEqual([
      ["b", "waiting", true],
      ["a", "running", false],
    ]);
  });
});

const shell = (id: string, extra: object = {}): ShellLike =>
  ({
    environmentId: env,
    id: ThreadId.make(id),
    projectId: project,
    title: "Thread",
    createdAt: T(0),
    updatedAt: T(1),
    archivedAt: null,
    deletedAt: null,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: id },
    runtime: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    source: { latestVisibleMessage: null },
    ...extra,
  }) as unknown as ShellLike;

describe("channels", () => {
  const proj = { environmentId: env, id: project, title: "My App", workspaceRoot: "/w" };

  it("finds the stored coordinator, else the oldest title match, ignoring archived and subagent threads", () => {
    const title = "Coordinator · My App";
    const shells = [
      shell("old", { title, createdAt: T(0) }),
      shell("new", { title, createdAt: T(3) }),
      shell("gone", { title, archivedAt: T(2) }),
    ];
    expect(findCoordinatorThread(shells, proj, ThreadId.make("new"))?.id).toBe("new");
    expect(findCoordinatorThread(shells, proj, ThreadId.make("gone"))?.id).toBe("old");
    expect(
      findCoordinatorThread(
        [
          shell("x", {
            title,
            lineage: { parentThreadId: "p", relationshipToParent: "subagent", rootThreadId: "p" },
          }),
        ],
        proj,
        null,
      ),
    ).toBeNull();
  });

  it("derives channels with unique names, pinned first, unread and open thread counts", () => {
    const coordinator = shell("coord", {
      title: "Coordinator · My App",
      source: { latestVisibleMessage: { role: "assistant", updatedAt: T(4) } },
    });
    const worker = shell("w1", {
      lineage: { parentThreadId: "coord", relationshipToParent: "subagent", rootThreadId: "coord" },
      hasPendingUserInput: true,
    });
    const channels = deriveChannels({
      projects: [
        proj,
        { ...proj, id: ProjectId.make("proj-2"), title: "my app!" },
        { ...proj, id: ProjectId.make("proj-3"), title: "Zed", pinnedAt: T(0) },
        { ...proj, id: ProjectId.make("proj-4"), title: "Scratch", isScratch: true },
        { ...proj, id: ProjectId.make("proj-5"), title: "Old", archivedAt: T(0) },
      ],
      shells: [coordinator, worker],
      configs: {
        "env-1:proj-1": {
          context: "goals",
          coordinatorThreadId: null,
          contextSentToCoordinator: null,
        },
      },
      lastSeen: { "env-1:coord": T(2) },
    });
    expect(channels.map((c) => c.name)).toEqual(["zed", "my-app", "my-app-2"]);
    const first = channels.find((c) => c.projectId === project);
    expect(first).toMatchObject({ unread: true, openThreadCount: 1, context: "goals" });
    expect(first?.coordinatorRef?.threadId).toBe("coord");
  });

  it("is unread only for newer assistant output or pending questions", () => {
    const withMessage = (role: string, at: string) => ({
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      source: { latestVisibleMessage: { role, updatedAt: at } },
    });
    expect(isThreadUnread(withMessage("assistant", T(3)), T(2))).toBe(true);
    expect(isThreadUnread(withMessage("assistant", T(3)), T(3))).toBe(false);
    expect(isThreadUnread(withMessage("user", T(3)), T(2))).toBe(false);
    expect(isThreadUnread(withMessage("assistant", T(3)), undefined)).toBe(false);
  });

  it("makes names unique", () => {
    expect([
      ...assignUniqueNames([
        { key: "a", title: "X" },
        { key: "b", title: "x" },
      ]).values(),
    ]).toEqual(["x", "x-2"]);
  });
});

describe("prompts helpers", () => {
  it("slugifies, parses mentions, and classifies outgoing text", () => {
    expect(slugifyChannelName("  Café Rewrite! v2 ")).toBe("cafe-rewrite-v2");
    expect(slugifyChannelName("***")).toBe("channel");
    const agents = [{ handle: "rummage" }];
    expect(parseMention("@Rummage: file this", agents)).toEqual({
      agent: agents[0],
      rest: "file this",
    });
    expect(parseMention("@rummages file", agents)).toBeNull();
    expect(parseMention("hi @rummage", agents)).toBeNull();
    expect(classifyOutgoingText("plain")).toEqual({ kind: "plain", body: "plain" });
  });

  it("labels days relative to now", () => {
    const now = "2026-11-08T12:00:00.000Z";
    expect(formatDayLabel("2026-11-08T01:00:00.000Z", { timeZone: "UTC", now })).toBe("Today");
    expect(formatDayLabel("2026-11-07T23:00:00.000Z", { timeZone: "UTC", now })).toBe("Yesterday");
    expect(formatDayLabel("2026-11-03T10:00:00.000Z", { timeZone: "UTC", now })).toBe(
      "Tuesday, November 3",
    );
  });
});
