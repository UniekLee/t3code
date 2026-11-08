import { AlarmClockIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";

import type { Channel } from "../types";
import { ScheduleEditorDialog, type ScheduleEditorTarget } from "./ScheduleEditorDialog";
import { ScheduleList } from "./ScheduleList";
import type { ScheduleEntry } from "./scheduleModel";

export function channelScheduleEntries(
  entries: ReadonlyArray<ScheduleEntry>,
  channel: Pick<Channel, "environmentId" | "projectId">,
): ScheduleEntry[] {
  return entries.filter(
    (entry) =>
      entry.environmentId === channel.environmentId && entry.task.projectId === channel.projectId,
  );
}

/** The Schedules tab of a channel: that project's scheduled tasks. */
export function ChannelSchedules({
  channel,
  entries,
  loading,
}: {
  channel: Channel;
  entries: ReadonlyArray<ScheduleEntry>;
  loading: boolean;
}) {
  const [editor, setEditor] = useState<ScheduleEditorTarget | null>(null);
  const create = () =>
    setEditor({ environmentId: channel.environmentId, projectId: channel.projectId, task: null });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">Tasks that run in #{channel.name}.</p>
        <Button size="xs" variant="outline" onClick={create}>
          <PlusIcon />
          New schedule
        </Button>
      </div>
      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner size="md" tone="muted" />
        </div>
      ) : (
        <ScheduleList
          entries={entries}
          onEdit={(entry) =>
            setEditor({
              environmentId: entry.environmentId,
              projectId: entry.task.projectId,
              task: entry.task,
            })
          }
          empty={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlarmClockIcon />
                </EmptyMedia>
                <EmptyTitle>No schedules</EmptyTitle>
                <EmptyDescription>
                  Run a prompt in #{channel.name} on an interval, at a fixed time, once, or when a
                  webhook is called.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      )}
      <ScheduleEditorDialog target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
