import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveAttentionItems, groupAttentionByOwner } from "./attention";

const env = EnvironmentId.make("env-1");
const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const T = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

type Input = Parameters<typeof deriveAttentionItems>[0];
type Shell = Input["shells"][number];

function shell(id: string, parent: string | null, patch: Partial<Shell> = {}): Shell {
  return {
    environmentId: env,
    id: ThreadId.make(id),
    title: `Title ${id}`,
    updatedAt: T(30),
    archivedAt: null,
    deletedAt: null,
    runtime: null,
    latestRun: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingUserInputAt: null,
    settledOverride: null,
    lastVisitedAt: null,
    lineage: { parentThreadId: parent },
    source: { pendingRuntimeRequest: null },
    ...patch,
  } as Shell;
}

const failedRun = (completedAt: string) =>
  ({
    runId: "run-1",
    status: "failed",
    requestedAt: null,
    startedAt: null,
    completedAt,
    assistantMessageId: null,
  }) as unknown as Shell["latestRun"];

const channels: Input["channels"] = [
  {
    key: "ch-a",
    name: "alpha",
    workspaceRoot: "/a",
    projectId: ProjectId.make("proj-1"),
    environmentId: env,
    coordinatorRef: { environmentId: env, threadId: ThreadId.make("coord") },
  },
];
const agents: Input["agents"] = [
  { id: "ag-1", name: "Rummage", emoji: "R", environmentId: env, threadId: ThreadId.make("agent") },
];

const derive = (shells: Shell[], dismissed: string[] = []) =>
  deriveAttentionItems({ shells, channels, agents, dismissed: new Set(dismissed), now: NOW });

describe("deriveAttentionItems", () => {
  it("covers coordinator, sub-thread and agent threads, newest first, ignoring unrelated threads", () => {
    const items = derive([
      shell("coord", null, {
        hasPendingApprovals: true,
        source: { pendingRuntimeRequest: { kind: "command", createdAt: T(10) } },
      }),
      shell("child", "coord", { hasPendingUserInput: true, pendingUserInputAt: T(5) }),
      shell("agent", null, {
        hasPendingApprovals: true,
        source: { pendingRuntimeRequest: { kind: "permission", createdAt: T(20) } },
      }),
      shell("other", null, { hasPendingApprovals: true }),
    ]);
    expect(items.map((item) => [item.kind, item.threadRef.threadId, item.subThread])).toEqual([
      ["question", "child", true],
      ["approval", "coord", false],
      ["approval", "agent", false],
    ]);
    expect(items[1]?.detail).toBe("Run a command");
    expect(items[0]?.title).toBe("Title child");
  });

  it("skips archived threads and prefers a pending request over a failed run", () => {
    const items = derive([
      shell("child", "coord", { archivedAt: T(1), hasPendingUserInput: true }),
      shell("child2", "coord", {
        hasPendingApprovals: true,
        latestRun: failedRun(T(40)),
      }),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["approval"]);
  });

  it("flags a recent failed run until it is dismissed, visited, settled or stale", () => {
    const failed = (patch: Partial<Shell> = {}) =>
      shell("child", "coord", { latestRun: failedRun(T(60)), ...patch });
    expect(derive([failed()]).map((item) => item.kind)).toEqual(["failed"]);
    expect(derive([failed()], ["env-1:child:failed:run-1"])).toEqual([]);
    expect(derive([failed({ lastVisitedAt: T(10) })])).toEqual([]);
    expect(derive([failed({ settledOverride: "settled" })])).toEqual([]);
    expect(derive([failed({ latestRun: failedRun(T(60 * 24 * 4)) })])).toEqual([]);
  });

  it("surfaces pending secret requests from loaded projections", () => {
    const items = deriveAttentionItems({
      shells: [shell("child", "coord")],
      channels,
      agents,
      dismissed: new Set<string>(),
      now: NOW,
      secretsByThread: new Map([
        ["env-1:child", [{ id: "s1", label: "GitHub token", createdAt: T(3) }]],
      ]),
    });
    expect(items.map((item) => [item.kind, item.detail])).toEqual([["secret", "GitHub token"]]);
  });
});

describe("groupAttentionByOwner", () => {
  it("groups by owner in order of the newest item", () => {
    const groups = groupAttentionByOwner(
      derive([
        shell("agent", null, { hasPendingUserInput: true, pendingUserInputAt: T(1) }),
        shell("child", "coord", { hasPendingUserInput: true, pendingUserInputAt: T(2) }),
        shell("child2", "coord", { hasPendingUserInput: true, pendingUserInputAt: T(3) }),
      ]),
    );
    expect(groups.map((group) => [group.owner.name, group.items.length])).toEqual([
      ["Rummage", 1],
      ["alpha", 2],
    ]);
  });
});
