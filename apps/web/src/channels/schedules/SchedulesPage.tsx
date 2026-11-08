import { AlarmClockIcon, HashIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";

import { useChannels } from "../hooks";
import type { Channel } from "../types";
import { ScheduleEditorDialog, type ScheduleEditorTarget } from "./ScheduleEditorDialog";
import { ScheduleList } from "./ScheduleList";
import { groupSchedulesByOwner } from "./scheduleModel";
import { useScheduledTasks } from "./useScheduledTasks";

function ChannelPickerDialog({
  channels,
  onPick,
  onClose,
}: {
  channels: ReadonlyArray<Channel>;
  onPick: (channel: Channel) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(channels[0]?.key ?? "");
  const selected = channels.find((channel) => channel.key === key) ?? null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New schedule</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <Select value={key} onValueChange={(next) => setKey(next ?? "")}>
            <SelectTrigger size="sm" aria-label="Channel">
              <SelectValue placeholder="Choose a channel">
                {selected ? `#${selected.name}` : null}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {channels.map((channel) => (
                <SelectItem key={channel.key} value={channel.key} label={`#${channel.name}`}>
                  #{channel.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={selected === null} onClick={() => selected && onPick(selected)}>
            Continue
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Every scheduled task across channels and agents, grouped by owner. */
export function SchedulesPage() {
  const { channels } = useChannels();
  const { loading, entries } = useScheduledTasks();
  const [picking, setPicking] = useState(false);
  const [editor, setEditor] = useState<ScheduleEditorTarget | null>(null);
  const groups = groupSchedulesByOwner(entries);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <AlarmClockIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="min-w-0 truncate text-base font-semibold text-foreground">Schedules</h1>
        <Button
          className="ms-auto"
          size="xs"
          variant="outline"
          disabled={channels.length === 0}
          onClick={() => setPicking(true)}
        >
          <PlusIcon />
          New schedule
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" tone="muted" />
          </div>
        ) : groups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <AlarmClockIcon />
              </EmptyMedia>
              <EmptyTitle>No schedules yet</EmptyTitle>
              <EmptyDescription>
                Schedule a prompt in any channel, or give an agent a sweep interval.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h2 className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  {group.kind === "channel" ? <HashIcon aria-hidden className="size-3" /> : null}
                  {group.kind === "agent" ? `${group.entries[0]?.agent?.emoji ?? ""} ` : null}
                  {group.label}
                </h2>
                <ScheduleList
                  entries={group.entries}
                  onEdit={(entry) =>
                    setEditor({
                      environmentId: entry.environmentId,
                      projectId: entry.task.projectId,
                      task: entry.task,
                    })
                  }
                />
              </section>
            ))}
          </div>
        )}
      </div>
      {picking ? (
        <ChannelPickerDialog
          channels={channels}
          onClose={() => setPicking(false)}
          onPick={(channel) => {
            setPicking(false);
            setEditor({
              environmentId: channel.environmentId,
              projectId: channel.projectId,
              task: null,
            });
          }}
        />
      ) : null}
      <ScheduleEditorDialog target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
