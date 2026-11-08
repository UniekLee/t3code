import type { EnvironmentId, ProjectId, ScheduledTask } from "@t3tools/contracts";

import { ScheduledTaskEditorDialog } from "~/components/settings/ScheduledTasksSettings";

export interface ScheduleEditorTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId?: ProjectId | undefined;
  /** Null creates a task. New tasks default to a fresh thread per run. */
  readonly task: ScheduledTask | null;
}

/** The Settings task form, preselecting the channel's project for a new task. */
export function ScheduleEditorDialog({
  target,
  onClose,
}: {
  target: ScheduleEditorTarget | null;
  onClose: () => void;
}) {
  if (target === null) return null;
  return (
    <ScheduledTaskEditorDialog
      key={`${target.environmentId}:${target.task?.id ?? "new"}`}
      initialEnvironmentId={target.environmentId}
      initialProjectId={target.projectId ?? target.task?.projectId}
      task={target.task}
      onClose={onClose}
    />
  );
}
