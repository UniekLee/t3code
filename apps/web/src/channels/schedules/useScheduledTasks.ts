import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { isConnectedWithConfig } from "~/components/settings/scopedSettings";
import { useQuietThreadShells } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { environmentAtomList, environmentIdsKey } from "~/state/environmentAtomList";
import { serverEnvironment } from "~/state/server";

import { useAgents, useChannels } from "../hooks";
import {
  buildScheduleEntries,
  detectScheduledRunThreads,
  type ScheduleEntry,
  type ScheduledRunThread,
} from "./scheduleModel";

const scheduledTasksAtom = environmentAtomList("channels-scheduled-tasks", (environmentId) =>
  serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
);

/** Live scheduled tasks of every connected environment, mapped to their channel and agent. */
export function useScheduledTasks(): {
  readonly loading: boolean;
  readonly entries: ScheduleEntry[];
} {
  const { environments } = useEnvironments();
  const { channels } = useChannels();
  const agents = useAgents();
  const connectedIds = environments
    .filter(isConnectedWithConfig)
    .map((environment) => environment.environmentId);
  const results = useAtomValue(scheduledTasksAtom(environmentIdsKey(connectedIds)));
  const tasksByEnvironment = connectedIds.flatMap((environmentId, index) => {
    const data = AsyncResult.getOrElse(results[index]!, () => null);
    return data === null ? [] : [{ environmentId, tasks: data.tasks }];
  });
  return {
    loading: results.some((result) => result._tag === "Initial"),
    entries: buildScheduleEntries({ tasksByEnvironment, channels, agents }),
  };
}

/** Threads in one project that scheduled tasks created, newest first. Shell data only. */
export function useScheduledRunThreads(
  entries: ReadonlyArray<ScheduleEntry>,
): ScheduledRunThread[] {
  const shells = useQuietThreadShells();
  return detectScheduledRunThreads(shells, entries);
}
