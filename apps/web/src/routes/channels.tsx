import { createFileRoute, redirect } from "@tanstack/react-router";

import { ChannelsLayout } from "~/channels/ChannelsLayout";

export const Route = createFileRoute("/channels")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChannelsLayout,
});
