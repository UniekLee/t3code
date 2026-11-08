import { SendHorizontalIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import type { CrossChannelAgent, SendResult } from "./types";

const MENTION_PATTERN = /(^|\s)@([a-z0-9_-]*)$/i;

function findMention(text: string, caret: number) {
  const match = MENTION_PATTERN.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[2] ?? "";
  return { query, start: caret - query.length - 1 };
}

export function ChannelComposer({
  placeholder,
  agents,
  disabled = false,
  onSend,
}: {
  placeholder: string;
  /** When set, typing `@` offers these agent handles. */
  agents?: ReadonlyArray<CrossChannelAgent>;
  disabled?: boolean;
  onSend: (text: string) => Promise<SendResult>;
}) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mention = agents ? findMention(text, caret) : null;
  const candidates =
    mention && agents
      ? agents.filter((agent) => agent.handle.toLowerCase().startsWith(mention.query.toLowerCase()))
      : [];
  const popoverOpen = mention !== null && candidates.length > 0 && !dismissed;
  const activeIndex = Math.min(highlighted, Math.max(candidates.length - 1, 0));

  const canSend = !disabled && !sending && text.trim().length > 0;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const result = await onSend(text.trim());
    setSending(false);
    if (result.ok) {
      setText("");
      setCaret(0);
    } else {
      setError(result.error);
    }
  };

  const pickAgent = (agent: CrossChannelAgent) => {
    if (!mention) return;
    const insert = `@${agent.handle} `;
    const next = text.slice(0, mention.start) + insert + text.slice(caret);
    const nextCaret = mention.start + insert.length;
    setText(next);
    setCaret(nextCaret);
    setHighlighted(0);
    const el = textareaRef.current;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (popoverOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setHighlighted((activeIndex + delta + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const agent = candidates[activeIndex];
        if (agent) pickAgent(agent);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="relative px-5 pt-2 pb-4">
      {popoverOpen ? (
        <div
          role="listbox"
          aria-label="Agents"
          className="absolute bottom-full left-5 z-10 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {candidates.map((agent, index) => (
            <button
              key={agent.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                pickAgent(agent);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <span>{agent.emoji}</span>
              <span className="font-medium">{agent.name}</span>
              <span className="text-muted-foreground text-xs">@{agent.handle}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          className="flex-1"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart);
            setHighlighted(0);
            setDismissed(false);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
        <Button
          size="icon"
          aria-label="Send message"
          disabled={!canSend}
          onClick={() => void send()}
        >
          <SendHorizontalIcon />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-destructive-foreground text-xs">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground text-xs">
          Enter to send, Shift+Enter for a new line
        </p>
      )}
    </div>
  );
}
