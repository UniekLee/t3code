import { createFileRoute } from "@tanstack/react-router";

import { ThreadStateBoard } from "~/channels/threadStates/ThreadStateBoard";
import { isActiveThreadState, type ActiveThreadState } from "~/channels/threadStates/threadStates";

interface BoardSearch {
  state?: ActiveThreadState;
}

function BoardRoute() {
  const { state } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ThreadStateBoard
      state={state ?? "all"}
      onStateChange={(next) => {
        void navigate({ search: next === "all" ? {} : { state: next } });
      }}
    />
  );
}

export const Route = createFileRoute("/channels/board")({
  validateSearch: (raw: Record<string, unknown>): BoardSearch =>
    isActiveThreadState(raw.state) ? { state: raw.state } : {},
  component: BoardRoute,
});
