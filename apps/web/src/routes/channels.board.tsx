import { createFileRoute } from "@tanstack/react-router";

import { ThreadStateBoard } from "~/channels/threadStates/ThreadStateBoard";
import { isActiveThreadState, type ActiveThreadState } from "~/channels/threadStates/threadStates";

interface BoardSearch {
  filter?: ActiveThreadState;
}

function BoardRoute() {
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ThreadStateBoard
      state={filter ?? "all"}
      onStateChange={(next) => {
        void navigate({ search: next === "all" ? {} : { filter: next } });
      }}
    />
  );
}

export const Route = createFileRoute("/channels/board")({
  validateSearch: (raw: Record<string, unknown>): BoardSearch =>
    isActiveThreadState(raw.filter) ? { filter: raw.filter } : {},
  component: BoardRoute,
});
