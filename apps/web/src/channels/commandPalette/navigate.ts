import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import { useRightPanelStore } from "~/rightPanelStore";
import { buildThreadRouteParams } from "~/threadRoutes";

import {
  channelsThreadDestination,
  type ChannelsPaletteDestination,
  type ChannelsThreadPick,
  type ChannelsThreadState,
} from "./entries";

type ChannelsPaletteNavigate = (
  options:
    | {
        to: "/channels/$environmentId/$projectId";
        params: { environmentId: EnvironmentId; projectId: ProjectId };
        search?: { tab: "threads"; thread: string };
      }
    | { to: "/channels/agents/$agentId"; params: { agentId: string } }
    | { to: "/channels/activity" }
    | { to: "/channels/schedules" }
    | { to: "/channels/board"; search?: { filter: ChannelsThreadState } }
    | {
        to: "/channels/$environmentId/$projectId/workspace/$threadKey";
        params: { environmentId: EnvironmentId; projectId: ProjectId; threadKey: string };
      }
    | {
        to: "/$environmentId/$threadId";
        params: { environmentId: EnvironmentId; threadId: ThreadId };
      },
) => Promise<void>;

function navigateBoard(
  navigate: ChannelsPaletteNavigate,
  state: ChannelsThreadState | undefined,
): Promise<void> {
  if (state === undefined) return navigate({ to: "/channels/board" });
  return navigate({ to: "/channels/board", search: { filter: state } });
}

export function navigateChannelsPalette(
  navigate: ChannelsPaletteNavigate,
  destination: ChannelsPaletteDestination,
): Promise<void> {
  switch (destination.kind) {
    case "channel": {
      const params = {
        environmentId: destination.environmentId,
        projectId: destination.projectId,
      };
      if (destination.search === undefined) {
        return navigate({ to: "/channels/$environmentId/$projectId", params });
      }
      return navigate({
        to: "/channels/$environmentId/$projectId",
        params,
        search: destination.search,
      });
    }
    case "agent":
      return navigate({
        to: "/channels/agents/$agentId",
        params: { agentId: destination.agentId },
      });
    case "activity":
      return navigate({ to: "/channels/activity" });
    case "schedules":
      return navigate({ to: "/channels/schedules" });
    case "board":
      return navigateBoard(navigate, destination.state);
    case "thread-tool": {
      if (destination.tool !== "workspace") {
        useRightPanelStore
          .getState()
          .open(scopeThreadRef(destination.environmentId, destination.threadId), destination.tool);
      }
      return navigate({
        to: "/channels/$environmentId/$projectId/workspace/$threadKey",
        params: {
          environmentId: destination.environmentId,
          projectId: destination.projectId,
          threadKey: destination.threadId,
        },
      });
    }
  }
}

export function navigateThreadFromPalette(
  navigate: ChannelsPaletteNavigate,
  input: ChannelsThreadPick,
): Promise<void> {
  const destination = channelsThreadDestination(input);
  if (destination) return navigateChannelsPalette(navigate, destination);
  return navigate({
    to: "/$environmentId/$threadId",
    params: buildThreadRouteParams(scopeThreadRef(input.thread.environmentId, input.thread.id)),
  });
}
