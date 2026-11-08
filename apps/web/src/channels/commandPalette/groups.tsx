import type { ReactNode } from "react";
import {
  AlarmClockIcon,
  BellIcon,
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  HashIcon,
  LayoutGridIcon,
  LoaderCircleIcon,
  MoonIcon,
} from "lucide-react";

import {
  ITEM_ICON_CLASS,
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
} from "~/components/CommandPalette.logic";

import {
  buildChannelsPaletteEntries,
  type ChannelsPaletteDestination,
  type ChannelsPaletteEntry,
} from "./entries";
import type { Channel, CrossChannelAgent } from "../types";

function iconFor(entry: ChannelsPaletteEntry): ReactNode {
  if (entry.emoji) {
    return (
      <span
        aria-hidden
        className="inline-flex size-4 items-center justify-center text-sm leading-none"
      >
        {entry.emoji}
      </span>
    );
  }
  switch (entry.destination.kind) {
    case "channel":
      return <HashIcon className={ITEM_ICON_CLASS} />;
    case "agent":
      return <BotIcon className={ITEM_ICON_CLASS} />;
    case "activity":
      return <BellIcon className={ITEM_ICON_CLASS} />;
    case "schedules":
      return <AlarmClockIcon className={ITEM_ICON_CLASS} />;
    case "board":
      switch (entry.destination.state) {
        case "needs-input":
          return <CircleAlertIcon className={ITEM_ICON_CLASS} />;
        case "working":
          return <LoaderCircleIcon className={ITEM_ICON_CLASS} />;
        case "done":
          return <CircleCheckIcon className={ITEM_ICON_CLASS} />;
        case "snoozed":
          return <MoonIcon className={ITEM_ICON_CLASS} />;
        case undefined:
          return <LayoutGridIcon className={ITEM_ICON_CLASS} />;
      }
  }
}

function toAction(
  entry: ChannelsPaletteEntry,
  run: (destination: ChannelsPaletteDestination) => Promise<void>,
): CommandPaletteActionItem {
  return {
    kind: "action",
    value: entry.value,
    title: entry.title,
    searchTerms: entry.searchTerms,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    icon: iconFor(entry),
    run: () => run(entry.destination),
  };
}

function toGroup(
  value: string,
  label: string,
  entries: readonly ChannelsPaletteEntry[],
  run: (destination: ChannelsPaletteDestination) => Promise<void>,
): CommandPaletteGroup {
  return { value, label, items: entries.map((entry) => toAction(entry, run)) };
}

export function buildChannelsPaletteGroups(input: {
  readonly channels: ReadonlyArray<Channel>;
  readonly agents: ReadonlyArray<CrossChannelAgent>;
  readonly run: (destination: ChannelsPaletteDestination) => Promise<void>;
}): CommandPaletteGroup[] {
  const catalog = buildChannelsPaletteEntries(input);
  return [
    toGroup("channels", "Channels", catalog.channels, input.run),
    toGroup("channels-agents", "Agents", catalog.agents, input.run),
    toGroup("channels-tools", "Tools", catalog.tools, input.run),
  ].filter((group) => group.items.length > 0);
}

export function withChannelsPaletteGroups(
  rootGroups: ReadonlyArray<CommandPaletteGroup>,
  channelsGroups: ReadonlyArray<CommandPaletteGroup>,
): CommandPaletteGroup[] {
  const recentIndex = rootGroups.findIndex((group) => group.value === "recent-threads");
  if (recentIndex < 0) return [...rootGroups, ...channelsGroups];
  return [...rootGroups.slice(0, recentIndex), ...channelsGroups, ...rootGroups.slice(recentIndex)];
}
