import { BotIcon, InfoIcon, UserIcon, WrenchIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { ChannelAuthor } from "./types";

export function authorLabel(author: ChannelAuthor): string {
  switch (author.kind) {
    case "user":
      return "You";
    case "coordinator":
      return "Coordinator";
    case "agent":
      return author.name;
    case "worker":
      return author.title;
    case "system":
      return "System";
  }
}

export function authorKey(author: ChannelAuthor): string {
  switch (author.kind) {
    case "agent":
      return `agent:${author.agentId ?? author.name}`;
    case "worker":
      return `worker:${author.title}`;
    default:
      return author.kind;
  }
}

function AvatarGlyph({ author }: { author: ChannelAuthor }) {
  switch (author.kind) {
    case "user":
      return <UserIcon className="size-4" />;
    case "coordinator":
      return <BotIcon className="size-4" />;
    case "agent":
      return <span className="text-base leading-none">{author.emoji}</span>;
    case "worker":
      return <WrenchIcon className="size-4" />;
    case "system":
      return <InfoIcon className="size-4" />;
  }
}

export function ChannelAvatar({
  author,
  className,
}: {
  author: ChannelAuthor;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        author.kind === "coordinator"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <AvatarGlyph author={author} />
    </div>
  );
}
