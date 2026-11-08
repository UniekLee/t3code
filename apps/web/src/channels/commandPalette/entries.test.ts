import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildChannelsPaletteEntries, channelsThreadDestination } from "./entries";

const env = EnvironmentId.make("env-1");
const project = ProjectId.make("proj-1");
const otherProject = ProjectId.make("proj-2");
const coordinatorId = ThreadId.make("coord");
const agentThreadId = ThreadId.make("agent-thread");
const childId = ThreadId.make("child");

const channel = {
  environmentId: env,
  projectId: project,
  name: "Web",
  workspaceRoot: "/work/web",
  coordinatorRef: { environmentId: env, threadId: coordinatorId },
};

const agent = {
  id: "agent-1",
  name: "Rummage",
  handle: "rummage",
  emoji: "🦝",
  threadId: agentThreadId,
};

describe("buildChannelsPaletteEntries", () => {
  it("builds a channel entry from the name and workspace path", () => {
    const catalog = buildChannelsPaletteEntries({ channels: [channel], agents: [] });
    expect(catalog.channels).toEqual([
      {
        value: `channels:${env}:${project}`,
        title: "Web",
        description: "/work/web",
        searchTerms: ["Web", "/work/web"],
        destination: { kind: "channel", environmentId: env, projectId: project },
      },
    ]);
  });

  it("builds an agent entry from the name, handle, and emoji", () => {
    const catalog = buildChannelsPaletteEntries({ channels: [], agents: [agent] });
    expect(catalog.agents).toEqual([
      {
        value: "channels-agent:agent-1",
        title: "Rummage",
        description: "@rummage",
        searchTerms: ["Rummage", "rummage", "@rummage", "🦝"],
        emoji: "🦝",
        destination: { kind: "agent", agentId: "agent-1" },
      },
    ]);
  });

  it("jumps to activity, schedules, the board, and each thread state", () => {
    const catalog = buildChannelsPaletteEntries({ channels: [], agents: [] });
    expect(
      Object.fromEntries(catalog.tools.map((entry) => [entry.title, entry.destination])),
    ).toEqual({
      Activity: { kind: "activity" },
      Schedules: { kind: "schedules" },
      Board: { kind: "board" },
      "Threads that need input": { kind: "board", state: "needs-input" },
      "Working threads": { kind: "board", state: "working" },
      "Done threads": { kind: "board", state: "done" },
      "Snoozed threads": { kind: "board", state: "snoozed" },
    });
  });
});

describe("channelsThreadDestination", () => {
  const channels = [channel];
  const agents = [agent];

  it("opens a channel thread on the threads tab", () => {
    expect(
      channelsThreadDestination({
        pathname: "/channels/env-1/proj-1",
        thread: { environmentId: env, id: childId, projectId: project },
        channels,
        agents,
      }),
    ).toEqual({
      kind: "channel",
      environmentId: env,
      projectId: project,
      search: { tab: "threads", thread: childId },
    });
  });

  it("opens an agent thread on the agent", () => {
    expect(
      channelsThreadDestination({
        pathname: "/channels",
        thread: { environmentId: env, id: agentThreadId, projectId: project },
        channels,
        agents,
      }),
    ).toEqual({ kind: "agent", agentId: "agent-1" });
  });

  it("opens a coordinator thread on its channel without a thread search", () => {
    expect(
      channelsThreadDestination({
        pathname: "/channels/activity",
        thread: { environmentId: env, id: coordinatorId, projectId: project },
        channels,
        agents,
      }),
    ).toEqual({ kind: "channel", environmentId: env, projectId: project });
  });

  it("returns null outside channels so the classic route stays", () => {
    expect(
      channelsThreadDestination({
        pathname: `/${env}/${childId}`,
        thread: { environmentId: env, id: childId, projectId: project },
        channels,
        agents,
      }),
    ).toBeNull();
  });

  it("returns null on channels for a thread that belongs to no channel", () => {
    expect(
      channelsThreadDestination({
        pathname: "/channels/board",
        thread: { environmentId: env, id: childId, projectId: otherProject },
        channels,
        agents,
      }),
    ).toBeNull();
  });
});
