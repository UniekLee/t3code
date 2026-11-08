import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { AlarmClockIcon, ExternalLinkIcon, PencilIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { requestConfirmDialog } from "~/confirmDialog";
import {
  ScheduledRelativeLabel,
  scheduleLabel,
  statusVariant,
} from "~/components/settings/ScheduledTasksSettings";
import { RelativeTime } from "~/components/RelativeTime";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { readEnvironmentScope } from "~/state/session";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

import type { ScheduleEntry } from "./scheduleModel";
import { useScheduledRunThreads } from "./useScheduledTasks";

function RunLink({ entry, threadId }: { entry: ScheduleEntry; threadId: string | null }) {
  const linkClass =
    "inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2 hover:text-foreground";
  if (entry.agent) {
    return (
      <Link
        to="/channels/agents/$agentId"
        params={{ agentId: entry.agent.id }}
        className={linkClass}
      >
        <ExternalLinkIcon aria-hidden className="size-3" />
        Open run
      </Link>
    );
  }
  if (entry.channel && threadId) {
    return (
      <Link
        to="/channels/$environmentId/$projectId"
        params={{ environmentId: entry.environmentId, projectId: entry.task.projectId }}
        search={{ thread: threadId, tab: "threads" }}
        className={linkClass}
      >
        <ExternalLinkIcon aria-hidden className="size-3" />
        Open run
      </Link>
    );
  }
  return null;
}

function ScheduleRow({
  entry,
  runThreadId,
  showOwner,
  onEdit,
}: {
  entry: ScheduleEntry;
  runThreadId: string | null;
  showOwner: boolean;
  onEdit: (entry: ScheduleEntry) => void;
}) {
  const { task, environmentId } = entry;
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const [busy, setBusy] = useState(false);
  const toggle = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const run = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
  });
  const isWebhook = task.schedule.type === "webhook";

  const act = async (action: "toggle" | "run" | "delete") => {
    if (busy || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    if (action === "delete") {
      const confirmed =
        (await requestConfirmDialog(`Delete the scheduled task "${task.title}"?`, {
          variant: "destructive",
        })) ?? true;
      if (!confirmed) return;
    }
    setBusy(true);
    const result =
      action === "toggle"
        ? await toggle({ environmentId, input: { id: task.id, enabled: !task.enabled } })
        : action === "run"
          ? await run({ environmentId, input: { id: task.id } })
          : await remove({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not update scheduled task",
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };

  const owner = entry.agent
    ? `${entry.agent.emoji} ${entry.agent.name}`
    : entry.channel
      ? `#${entry.channel.name}`
      : null;

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground"
      >
        {entry.agent ? entry.agent.emoji : <AlarmClockIcon className="size-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-sm text-foreground">{task.title}</span>
          {entry.agent ? (
            <Badge variant="secondary" size="sm">
              {entry.agent.name} sweep
            </Badge>
          ) : null}
          {showOwner && owner && !entry.agent ? (
            <span className="shrink-0 text-muted-foreground text-xs">{owner}</span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {scheduleLabel(task.schedule)} ·{" "}
          {task.blockedByPolicy !== undefined ? (
            task.blockedByPolicy
          ) : !task.enabled ? (
            "Paused"
          ) : isWebhook ? (
            "Listening"
          ) : task.nextRunAt ? (
            <>
              Next run <ScheduledRelativeLabel value={task.nextRunAt} />
            </>
          ) : (
            "Not scheduled"
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {task.lastRunStatus !== "never" ? (
            <>
              <Badge variant={statusVariant(task.lastRunStatus)} size="sm">
                {task.lastRunStatus}
              </Badge>
              {task.lastRunAt ? (
                <span className="text-muted-foreground">
                  <RelativeTime timestamp={task.lastRunAt} />
                </span>
              ) : null}
              <RunLink entry={entry} threadId={runThreadId} />
            </>
          ) : (
            <span className="text-muted-foreground">No runs yet</span>
          )}
          {task.lastRunError ? <span className="text-destructive">{task.lastRunError}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={task.enabled}
          disabled={busy || !canOperate}
          aria-label={`Enable ${task.title}`}
          onCheckedChange={() => void act("toggle")}
        />
        {!isWebhook ? (
          <Button
            size="icon-sm"
            variant="ghost-muted"
            disabled={busy || !canOperate}
            aria-label={`Run ${task.title} now`}
            onClick={() => void act("run")}
          >
            <PlayIcon />
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost-muted"
          disabled={busy || !canOperate}
          aria-label={`Edit ${task.title}`}
          onClick={() => onEdit(entry)}
        >
          <PencilIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost-destructive"
          disabled={busy || !canOperate}
          aria-label={`Delete ${task.title}`}
          onClick={() => void act("delete")}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}

/** The latest run thread per task, found from shell data. */
function useRunThreadIds(entries: ReadonlyArray<ScheduleEntry>) {
  const runs = useScheduledRunThreads(entries);
  const byTask = new Map<string, string>();
  for (const run of runs) {
    if (!byTask.has(run.entry.key)) byTask.set(run.entry.key, run.shell.id);
  }
  return byTask;
}

export function ScheduleList({
  entries,
  onEdit,
  showOwner = false,
  empty,
}: {
  entries: ReadonlyArray<ScheduleEntry>;
  onEdit: (entry: ScheduleEntry) => void;
  showOwner?: boolean;
  empty?: ReactNode;
}) {
  const runThreadIds = useRunThreadIds(entries);
  if (entries.length === 0) return <>{empty ?? null}</>;
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <ScheduleRow
          key={entry.key}
          entry={entry}
          runThreadId={entry.task.threadId ?? runThreadIds.get(entry.key) ?? null}
          showOwner={showOwner}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}
