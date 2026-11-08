import { BellIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { ScrollArea } from "~/components/ui/scroll-area";

import { groupAttentionByOwner, ownerLabel } from "./attention";
import { useAttentionItems, useOpenAttentionItem } from "./hooks";
import { NeedsYouCard } from "./NeedsYouCard";

/** Beyond this many items the inbox stops loading thread projections and offers Open only. */
const MAX_LIVE_ITEMS = 8;

export function ActivityInbox() {
  const items = useAttentionItems();
  const open = useOpenAttentionItem();
  const groups = groupAttentionByOwner(items);
  const liveIds = new Set(items.slice(0, MAX_LIVE_ITEMS).map((item) => item.id));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-border border-b px-5 py-3">
        <BellIcon aria-hidden className="size-4 text-muted-foreground" />
        <h1 className="font-semibold text-sm">Activity</h1>
        {items.length > 0 ? (
          <Badge variant="warning" size="sm">
            {items.length}
          </Badge>
        ) : null}
        <span className="text-muted-foreground text-xs">Everything waiting on you</span>
      </header>
      {items.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing needs you</EmptyTitle>
            <EmptyDescription>
              Approvals, questions, secret requests and failed runs from every channel and agent
              show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-4">
            {groups.map((group) => (
              <section
                key={`${group.owner.kind}:${group.owner.key}`}
                aria-label={ownerLabel(group.owner)}
                className="flex flex-col gap-2"
              >
                <h2 className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
                  {group.owner.kind === "agent" ? (
                    <span aria-hidden>{group.owner.emoji}</span>
                  ) : null}
                  {ownerLabel(group.owner)}
                  <Badge variant="secondary" size="sm">
                    {group.items.length}
                  </Badge>
                </h2>
                {group.items.map((item) => (
                  <NeedsYouCard
                    key={item.id}
                    item={item}
                    showOwner={false}
                    compact={!liveIds.has(item.id)}
                    cwd={item.owner.kind === "channel" ? item.owner.workspaceRoot : undefined}
                    onOpen={() => open(item)}
                  />
                ))}
              </section>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
