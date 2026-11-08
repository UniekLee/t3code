import { useState } from "react";

import type { AgentPresetId, CrossChannelAgent } from "./types";
import { useChannels, useRemoveAgent, useSaveAgent } from "./hooks";
import { AGENT_PRESETS, slugifyChannelName } from "./prompts";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { toastManager } from "~/components/ui/toast";
import { randomUUID } from "~/lib/utils";

const PRESET_OPTIONS: ReadonlyArray<{ id: AgentPresetId; label: string }> = [
  { id: "rummage", label: "Rummage" },
  { id: "social", label: "Herald" },
  { id: "custom", label: "Custom" },
];

const SWEEP_OPTIONS: ReadonlyArray<{ value: string; label: string; minutes: number | null }> = [
  { value: "off", label: "Off (on demand)", minutes: null },
  { value: "15", label: "Every 15 minutes", minutes: 15 },
  { value: "60", label: "Every hour", minutes: 60 },
  { value: "240", label: "Every 4 hours", minutes: 240 },
  { value: "1440", label: "Daily", minutes: 1440 },
];

function sweepValue(minutes: number | null): string {
  return minutes === null ? "off" : String(minutes);
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function AgentForm({ agent, onClose }: { agent: CrossChannelAgent | null; onClose: () => void }) {
  const { channels } = useChannels();
  const saveAgent = useSaveAgent();
  const removeAgent = useRemoveAgent();
  const firstChannel = channels[0];

  const [preset, setPreset] = useState<AgentPresetId>(agent?.preset ?? "rummage");
  const [name, setName] = useState(agent?.name ?? AGENT_PRESETS.rummage.name);
  const [handle, setHandle] = useState(agent?.handle ?? AGENT_PRESETS.rummage.handle);
  const [emoji, setEmoji] = useState(agent?.emoji ?? AGENT_PRESETS.rummage.emoji);
  const [role, setRole] = useState(agent?.role ?? AGENT_PRESETS.rummage.role);
  const [sweep, setSweep] = useState(
    sweepValue(agent ? agent.sweepEveryMinutes : AGENT_PRESETS.rummage.sweepEveryMinutes),
  );
  const [homeKey, setHomeKey] = useState<string | null>(
    agent
      ? (channels.find(
          (channel) =>
            channel.environmentId === agent.environmentId &&
            channel.projectId === agent.homeProjectId,
        )?.key ?? null)
      : (firstChannel?.key ?? null),
  );
  const [saving, setSaving] = useState(false);

  const home = channels.find((channel) => channel.key === homeKey) ?? null;
  const canSave =
    name.trim() !== "" && handle !== "" && role.trim() !== "" && home !== null && !saving;

  const applyPreset = (next: AgentPresetId) => {
    setPreset(next);
    const defaults = AGENT_PRESETS[next];
    setName(defaults.name);
    setHandle(defaults.handle);
    setEmoji(defaults.emoji);
    setRole(defaults.role);
    setSweep(sweepValue(defaults.sweepEveryMinutes));
  };

  const save = async () => {
    if (!home) return;
    setSaving(true);
    const result = await saveAgent({
      id: agent?.id ?? randomUUID(),
      preset,
      name: name.trim(),
      handle,
      emoji: emoji.trim() || "🤖",
      role: role.trim(),
      environmentId: home.environmentId,
      homeProjectId: home.projectId,
      threadId: agent?.threadId ?? null,
      sweepEveryMinutes: SWEEP_OPTIONS.find((option) => option.value === sweep)?.minutes ?? null,
      scheduledTaskId: agent?.scheduledTaskId ?? null,
      createdAt: agent?.createdAt ?? new Date().toISOString(),
    });
    setSaving(false);
    if (result.ok) {
      onClose();
    } else {
      toastManager.add({ type: "error", title: "Could not save agent", description: result.error });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{agent ? `Edit ${agent.name}` : "Add agent"}</DialogTitle>
        <DialogDescription>
          Agents work across every channel. Mention them with @handle or message them directly.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          {agent ? null : (
            <Field label="Start from">
              <div role="radiogroup" aria-label="Agent preset" className="flex gap-2">
                {PRESET_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={preset === option.id}
                    size="sm"
                    variant={preset === option.id ? "default" : "outline"}
                    onClick={() => applyPreset(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-[4rem_1fr_1fr] gap-3">
            <Field label="Emoji" htmlFor="agent-emoji">
              <Input
                id="agent-emoji"
                value={emoji}
                maxLength={4}
                onChange={(event) => setEmoji(event.currentTarget.value)}
                className="text-center"
              />
            </Field>
            <Field label="Name" htmlFor="agent-name">
              <Input
                id="agent-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </Field>
            <Field label="Handle" htmlFor="agent-handle">
              <Input
                id="agent-handle"
                value={handle}
                onChange={(event) => setHandle(slugifyChannelName(event.currentTarget.value))}
                placeholder="handle"
              />
            </Field>
          </div>
          <Field label="Role" htmlFor="agent-role">
            <Textarea
              id="agent-role"
              rows={6}
              value={role}
              onChange={(event) => setRole(event.currentTarget.value)}
              placeholder="What should this agent do across your channels?"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Home project">
              <Select value={homeKey ?? ""} onValueChange={(value) => setHomeKey(value)}>
                <SelectTrigger aria-label="Home project">
                  <SelectValue>{home ? `# ${home.name}` : "Choose a channel"}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {channels.map((channel) => (
                    <SelectItem key={channel.key} value={channel.key}>
                      # {channel.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Field label="Sweep interval">
              <Select value={sweep} onValueChange={(value) => setSweep(value ?? "off")}>
                <SelectTrigger aria-label="Sweep interval">
                  <SelectValue>
                    {SWEEP_OPTIONS.find((option) => option.value === sweep)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {SWEEP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
          </div>
        </div>
      </DialogPanel>
      <DialogFooter>
        {agent ? (
          <Button
            variant="destructive-outline"
            className="me-auto"
            onClick={() => {
              void removeAgent(agent.id);
              onClose();
            }}
          >
            Delete
          </Button>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => void save()}>
          {saving ? "Saving" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Create (`agent` null) or edit a cross-channel agent. The form mounts per open so state resets. */
export function AgentDialog({
  open,
  onOpenChange,
  agent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: CrossChannelAgent | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-xl">
        <AgentForm agent={agent} onClose={() => onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}
