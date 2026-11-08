import { createFileRoute, Navigate } from "@tanstack/react-router";
import { HashIcon } from "lucide-react";

import { useChannels } from "~/channels/hooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";

function ChannelsIndexRoute() {
  const { ready, channels } = useChannels();
  const first = channels[0];

  if (first) {
    return (
      <Navigate
        to="/channels/$environmentId/$projectId"
        params={{ environmentId: first.environmentId, projectId: first.projectId }}
        replace
      />
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="md" tone="muted" />
      </div>
    );
  }

  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HashIcon />
        </EmptyMedia>
        <EmptyTitle>No channels yet</EmptyTitle>
        <EmptyDescription>
          Every project becomes a channel. Add a project in the classic view and it shows up here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export const Route = createFileRoute("/channels/")({
  component: ChannelsIndexRoute,
});
