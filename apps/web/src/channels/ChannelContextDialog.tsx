import { useState } from "react";

import type { Channel } from "./types";
import { useUpdateChannelContext } from "./hooks";
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
import { Textarea } from "~/components/ui/textarea";

function ContextForm({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const [text, setText] = useState(channel.context);
  const updateContext = useUpdateChannelContext(channel);

  const save = () => {
    updateContext(text.trim());
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Context for #{channel.name}</DialogTitle>
        <DialogDescription>
          Purpose, goals, conventions and links. The coordinator reads this and is told whenever it
          changes.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <Textarea
          autoFocus
          rows={10}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="What is this channel for? Goals, conventions, useful links."
          aria-label="Channel context"
        />
      </DialogPanel>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={text.trim() === channel.context.trim()}>
          Save context
        </Button>
      </DialogFooter>
    </>
  );
}

export function ChannelContextDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <ContextForm channel={channel} onClose={() => onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}
