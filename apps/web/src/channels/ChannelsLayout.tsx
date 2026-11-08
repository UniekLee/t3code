import { Outlet } from "@tanstack/react-router";

import { ChannelsSidebar } from "./ChannelsSidebar";

/** Full-height Slack-style shell: channel list on the left, the routed channel or agent on the right. */
export function ChannelsLayout() {
  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground">
      <ChannelsSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
