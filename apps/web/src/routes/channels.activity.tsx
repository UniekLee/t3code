import { createFileRoute } from "@tanstack/react-router";

import { ActivityInbox } from "~/channels/attention/ActivityInbox";

export const Route = createFileRoute("/channels/activity")({
  component: ActivityInbox,
});
