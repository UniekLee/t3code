import { LoaderCircleIcon, WrenchIcon } from "lucide-react";
import { memo, useEffect, useRef, type ReactNode } from "react";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { shouldPreserveAssistantLineBreaks } from "@t3tools/shared/markdownPipeline";
import ChatMarkdown from "~/components/ChatMarkdown";
import { MESSAGE_HEADING_LEVEL } from "~/components/chat/TimelineRowParts";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { formatChatTimestampTooltip, formatDayAwareTimestamp } from "~/timestampFormat";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { authorKey, authorLabel, ChannelAvatar } from "./ChannelAvatar";
import { ThreadCard } from "./ThreadCard";
import { ThreadEventRow } from "./ThreadEventRow";
import type { ChannelMessage, ChannelTimeline } from "./types";

type TextMessage = Extract<ChannelMessage, { kind: "message" }>;

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const STICK_THRESHOLD_PX = 48;

interface MessageContext {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly timestampFormat: TimestampFormat;
  readonly selectedThreadId: string | null;
  readonly onOpenThread: (childRef: ScopedThreadRef) => void;
}

function isGroupedWith(previous: ChannelMessage | undefined, message: TextMessage): boolean {
  if (previous?.kind !== "message") return false;
  if (authorKey(previous.author) !== authorKey(message.author)) return false;
  const gap = Date.parse(message.createdAt) - Date.parse(previous.createdAt);
  return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
}

const MessageRow = memo(function MessageRow({
  message,
  grouped,
  ctx,
}: {
  message: TextMessage;
  grouped: boolean;
  ctx: MessageContext;
}) {
  const isUser = message.author.kind === "user";
  return (
    <div className={cn("group flex gap-3 px-5 py-0.5 hover:bg-accent/30", grouped ? "" : "mt-3")}>
      {grouped ? (
        <div className="w-9 shrink-0 pt-1 text-right text-muted-foreground text-xs opacity-0 group-hover:opacity-100">
          {formatDayAwareTimestamp(message.createdAt, ctx.timestampFormat)}
        </div>
      ) : (
        <ChannelAvatar author={message.author} />
      )}
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-foreground text-sm">
              {authorLabel(message.author)}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={<span className="cursor-default text-muted-foreground text-xs" />}
              >
                {formatDayAwareTimestamp(message.createdAt, ctx.timestampFormat)}
              </TooltipTrigger>
              <TooltipPopup side="top">
                {formatChatTimestampTooltip(message.createdAt, ctx.timestampFormat)}
              </TooltipPopup>
            </Tooltip>
          </div>
        )}
        {message.text.length > 0 ? (
          <div className="min-w-0 text-sm" data-thread-find-text="true">
            <ChatMarkdown
              text={message.text}
              cwd={ctx.workspaceRoot}
              environmentId={ctx.environmentId}
              threadRef={ctx.threadRef ?? undefined}
              isStreaming={message.streaming}
              lineBreaks={isUser || shouldPreserveAssistantLineBreaks(message.text)}
              headingLevelOffset={MESSAGE_HEADING_LEVEL}
            />
          </div>
        ) : null}
        {message.toolCallCount > 0 ? (
          <div className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
            <WrenchIcon className="size-3" />
            Used {message.toolCallCount} {message.toolCallCount === 1 ? "tool" : "tools"}
          </div>
        ) : null}
        {message.threads.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {message.threads.map((thread) => (
              <ThreadCard
                key={thread.subagentId}
                thread={thread}
                selected={
                  ctx.selectedThreadId !== null &&
                  thread.childRef?.threadId === ctx.selectedThreadId
                }
                onOpenThread={ctx.onOpenThread}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 text-muted-foreground text-xs">
      <div className="h-px flex-1 bg-border" />
      <span className="font-medium">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function MessageList({
  timeline,
  environmentId,
  workspaceRoot,
  threadRef,
  workingLabel,
  empty,
  selectedThreadId = null,
  onOpenThread,
}: {
  timeline: ChannelTimeline;
  environmentId: EnvironmentId;
  workspaceRoot: string;
  threadRef: ScopedThreadRef | null;
  workingLabel: string;
  empty?: ReactNode;
  selectedThreadId?: string | null;
  onOpenThread: (childRef: ScopedThreadRef) => void;
}) {
  const timestampFormat = useEnvironmentSettings(environmentId, (s) => s.timestampFormat);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);

  // Keeps the view pinned to the bottom as content grows (streaming, images); event-driven, no polling.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resize subscription synchronizes scroll position with layout, which only exists outside React
  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    return observeResize([content, scroller], () => {
      if (stuckRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
  }, []);

  const ctx: MessageContext = {
    environmentId,
    workspaceRoot,
    threadRef,
    timestampFormat,
    selectedThreadId,
    onOpenThread,
  };

  const { messages } = timeline;
  const showEmpty = empty !== undefined && !timeline.loading && messages.length === 0;

  return (
    <div
      ref={scrollerRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      onScroll={(event) => {
        const el = event.currentTarget;
        stuckRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
      }}
    >
      <div ref={contentRef} className="flex min-h-full flex-col justify-end pt-4 pb-2">
        {timeline.hasMoreHistory ? (
          <div className="flex justify-center pb-2">
            <Button variant="ghost-muted" size="xs" onClick={timeline.loadEarlier}>
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {timeline.loading && messages.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground text-sm">Loading messages…</p>
        ) : null}
        {showEmpty ? empty : null}
        {messages.map((message, index) => {
          switch (message.kind) {
            case "day-divider":
              return <DayDivider key={message.id} label={message.label} />;
            case "thread-event":
              return (
                <ThreadEventRow key={message.id} event={message} onOpenThread={onOpenThread} />
              );
            case "message":
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  grouped={isGroupedWith(messages[index - 1], message)}
                  ctx={ctx}
                />
              );
          }
        })}
        {timeline.working ? (
          <div className="flex items-center gap-2 px-5 py-2 text-muted-foreground text-xs">
            <span className="flex w-9 shrink-0 justify-center">
              <LoaderCircleIcon className="size-3.5" />
            </span>
            {workingLabel}…
          </div>
        ) : null}
      </div>
    </div>
  );
}
