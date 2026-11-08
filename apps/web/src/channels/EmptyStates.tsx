import { HashIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";

export function NewChannelEmptyState({ channelName }: { channelName: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HashIcon />
        </EmptyMedia>
        <EmptyTitle>Welcome to #{channelName}</EmptyTitle>
        <EmptyDescription>
          Say hi to start the coordinator. It answers quick questions and delegates real work to
          threads you can follow here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function AgentNoThreadEmptyState({ name }: { name: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Say hi to {name}</EmptyTitle>
        <EmptyDescription>
          Your first message starts its conversation. It reports back here after every sweep.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function AgentNotFoundEmptyState() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Agent not found</EmptyTitle>
        <EmptyDescription>It may have been removed.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
