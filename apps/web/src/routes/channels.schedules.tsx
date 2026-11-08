import { createFileRoute } from "@tanstack/react-router";

import { SchedulesPage } from "~/channels/schedules/SchedulesPage";

export const Route = createFileRoute("/channels/schedules")({
  component: SchedulesPage,
});
