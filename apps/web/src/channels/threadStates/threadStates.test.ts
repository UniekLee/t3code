import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  agentGlanceMark,
  buildGlanceThreads,
  classifyChannelThread,
  countsForChannel,
  countThreadStates,
  type ChannelThreadShell,
} from "./threadStates";

const env = EnvironmentId.make("env-1");
const project = ProjectId.make("proj-1");
const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const FUTURE = "2026-11-08T13:00:00.000Z";
const RECENT = "2026-11-08T11:50:00.000Z";
const EARLIER = "2026-11-08T11:00:00.000Z";
const FAILED_AT = "2026-11-08T10:00:00.000Z";

function shell(id: string, patch: Partial<ChannelThreadShell> = {}): ChannelThreadShell {
  return {
    environmentId: env,
    id: ThreadId.make(id),
    projectId: project,
    title: `Title ${id}`,
    archivedAt: null,
    deletedAt: null,
    lineage: {
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: ThreadId.make(id),
    },
    updatedAt: RECENT,
    runtime: null,
    latestRun: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingUserInputAt: null,
    pendingSubagentRequest: null,
    pendingGuestMessageCount: 0,
    settledOverride: null,
    lastVisitedAt: null,
    hasActionableProposedPlan: false,
    interactionMode: "default",
    blockedOnThreadWait: false,
    snoozedUntil: null,
    snoozedAt: null,
    latestUserMessageAt: null,
    source: { pendingRuntimeRequest: null },
    ...patch,
  } as ChannelThreadShell;
}

function completedRun(completedAt: string): ChannelThreadShell["latestRun"] {
  return {
    runId: RunId.make("run-done"),
    status: "completed",
    requestedAt: completedAt,
    startedAt: completedAt,
    completedAt,
    assistantMessageId: null,
  };
}

function failedRun(): ChannelThreadShell["latestRun"] {
  return {
    runId: RunId.make("run-1"),
    status: "failed",
    requestedAt: FAILED_AT,
    startedAt: FAILED_AT,
    completedAt: FAILED_AT,
    assistantMessageId: null,
  };
}

function runningRuntime(): ChannelThreadShell["runtime"] {
  return {
    status: "running",
    activeRunId: RunId.make("run-live"),
    providerInstanceId: ProviderInstanceId.make("provider"),
    providerName: null,
    lastError: null,
    updatedAt: RECENT,
  };
}

const classify = (value: ChannelThreadShell, dismissed: ReadonlySet<string> = new Set()) =>
  classifyChannelThread(value, { dismissed, now: NOW });

describe("classifyChannelThread", () => {
  it("picks one state, with snooze ahead of working and working ahead of done", () => {
    expect(classify(shell("ask", { hasPendingUserInput: true })).state).toBe("needs-input");
    expect(classify(shell("guest", { pendingGuestMessageCount: 1 })).state).toBe("needs-input");
    expect(
      classify(
        shell("snoozed-run", {
          runtime: runningRuntime(),
          snoozedUntil: FUTURE,
          snoozedAt: EARLIER,
        }),
      ).state,
    ).toBe("snoozed");
    expect(
      classify(
        shell("busy", {
          runtime: runningRuntime(),
          latestRun: completedRun(EARLIER),
          lastVisitedAt: FAILED_AT,
        }),
      ).state,
    ).toBe("working");
    expect(classify(shell("idle")).state).toBe("settled");
  });

  it("lets a failed run that attention still shows beat a later snooze", () => {
    const snoozedFailure = shell("child", {
      latestRun: failedRun(),
      snoozedUntil: FUTURE,
      snoozedAt: EARLIER,
    });
    expect(classify(snoozedFailure).state).toBe("needs-input");
    expect(classify(snoozedFailure, new Set(["env-1:child:failed:run-1"])).state).toBe("snoozed");
  });

  it("flags an unseen completion as done, and a settled visit as settled", () => {
    const unseen = classify(
      shell("done", {
        latestRun: completedRun(RECENT),
        lastVisitedAt: EARLIER,
      }),
    );
    expect(unseen).toEqual({ state: "done", unseen: true });

    const seen = classify(
      shell("seen", {
        latestRun: completedRun(EARLIER),
        lastVisitedAt: RECENT,
      }),
    );
    expect(seen).toEqual({ state: "done", unseen: false });

    const settled = classify(
      shell("settled", {
        latestRun: completedRun(EARLIER),
        lastVisitedAt: RECENT,
        settledOverride: "settled",
      }),
    );
    expect(settled).toEqual({ state: "settled", unseen: false });

    const unseenDespiteSettle = classify(
      shell("late", {
        latestRun: completedRun(RECENT),
        lastVisitedAt: EARLIER,
        settledOverride: "settled",
      }),
    );
    expect(unseenDespiteSettle).toEqual({ state: "done", unseen: true });
  });

  it("treats a pending secret the attention inbox would show as needs input", () => {
    expect(
      classifyChannelThread(shell("secret"), {
        dismissed: new Set(),
        now: NOW,
        secrets: [{ id: "s1", label: "GitHub token", createdAt: RECENT }],
      }).state,
    ).toBe("needs-input");
  });
});

describe("countThreadStates", () => {
  it("omits settled threads and agent threads", () => {
    expect(
      countThreadStates([
        { state: "needs-input", agent: true },
        { state: "needs-input", agent: false },
        { state: "settled", agent: false },
        { state: "done", agent: false },
        { state: "snoozed", agent: true },
        { state: "working", agent: false },
      ]),
    ).toEqual({ "needs-input": 1, working: 1, done: 1, snoozed: 0 });
  });
});

describe("buildGlanceThreads", () => {
  it("keeps the coordinator in the channel and parks the agent thread on the agent", () => {
    const threads = buildGlanceThreads({
      shells: [
        shell("coord", { hasPendingApprovals: true }),
        shell("worker", { runtime: runningRuntime() }),
        shell("agent", { title: "Rummage", hasPendingUserInput: true }),
        shell("child", {
          lineage: {
            parentThreadId: ThreadId.make("coord"),
            relationshipToParent: "subagent",
            rootThreadId: ThreadId.make("coord"),
          },
        }),
        shell("gone", { deletedAt: EARLIER, hasPendingApprovals: true }),
        shell("boxed", { archivedAt: EARLIER, hasPendingApprovals: true }),
      ],
      channels: [
        {
          key: `${env}:${project}`,
          name: "alpha",
          environmentId: env,
          projectId: project,
        },
      ],
      agents: [
        {
          id: "ag-1",
          name: "Rummage",
          emoji: "R",
          environmentId: env,
          threadId: ThreadId.make("agent"),
        },
      ],
      delegatedUnderParent: new Set(),
      dismissed: new Set(),
      now: NOW,
    });

    const channelKey = `${env}:${project}`;
    expect(countsForChannel(threads, channelKey)).toEqual({
      "needs-input": 1,
      working: 1,
      done: 0,
      snoozed: 0,
    });
    expect(
      threads.filter((thread) => thread.owner.kind === "channel").map((thread) => thread.id),
    ).toEqual([ThreadId.make("coord"), ThreadId.make("worker")]);
    expect(agentGlanceMark(threads, "ag-1")).toBe("needs-input");
    expect(threads.find((thread) => thread.id === "agent")?.owner).toMatchObject({
      kind: "agent",
      id: "ag-1",
    });
  });

  it("counts a pending secret from a projection already loaded as needs input", () => {
    const key = `${env}:${ThreadId.make("coord")}`;
    const threads = buildGlanceThreads({
      shells: [shell("coord")],
      channels: [
        {
          key: `${env}:${project}`,
          name: "alpha",
          environmentId: env,
          projectId: project,
        },
      ],
      agents: [],
      delegatedUnderParent: new Set(),
      dismissed: new Set(),
      now: NOW,
      secretsByThread: new Map([[key, [{ id: "s1", label: "GitHub token", createdAt: RECENT }]]]),
    });

    expect(threads.find((thread) => thread.id === ThreadId.make("coord"))?.state).toBe(
      "needs-input",
    );
    expect(countsForChannel(threads, `${env}:${project}`)).toEqual({
      "needs-input": 1,
      working: 0,
      done: 0,
      snoozed: 0,
    });
  });
});
