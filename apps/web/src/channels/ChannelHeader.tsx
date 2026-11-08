import { HashIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import type { Channel } from "./types";
import { ChannelContextDialog } from "./ChannelContextDialog";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type ChannelTab = "messages" | "threads";

function HeaderTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px h-8 cursor-pointer border-b-2 px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ChannelHeader({
  channel,
  tab,
  onTabChange,
  threadCount,
}: {
  channel: Channel;
  tab: ChannelTab;
  onTabChange: (tab: ChannelTab) => void;
  threadCount: number;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const hasContext = channel.context.trim().length > 0;

  return (
    <header className="flex shrink-0 flex-col gap-1 border-b border-border px-4 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <HashIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="min-w-0 truncate text-base font-semibold text-foreground">{channel.name}</h1>
        <div className="ms-auto flex shrink-0 items-center">
          <Button variant="ghost-muted" size="compact" onClick={() => setContextOpen(true)}>
            <PencilIcon />
            Edit context
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setContextOpen(true)}
        className={cn(
          "w-full cursor-pointer truncate rounded-sm text-left text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          hasContext ? "text-muted-foreground" : "text-muted-foreground/70",
        )}
      >
        {hasContext ? channel.context.replace(/\s+/g, " ") : "Add context: purpose, goals, links"}
      </button>
      <div role="tablist" aria-label="Channel sections" className="mt-1 flex items-center gap-4">
        <HeaderTab active={tab === "messages"} onClick={() => onTabChange("messages")}>
          Messages
        </HeaderTab>
        <HeaderTab active={tab === "threads"} onClick={() => onTabChange("threads")}>
          Threads ({threadCount})
        </HeaderTab>
      </div>
      <ChannelContextDialog channel={channel} open={contextOpen} onOpenChange={setContextOpen} />
    </header>
  );
}
