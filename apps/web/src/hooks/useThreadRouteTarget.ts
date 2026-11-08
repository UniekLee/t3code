import type { ScopedThreadRef } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { createContext, use } from "react";

import {
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
  type ThreadRouteTarget,
} from "../threadRoutes";

/** Names the active thread for routes whose params lack `{environmentId, threadId}` (Channels workspace). */
export const ThreadRouteOverrideContext = createContext<ScopedThreadRef | null>(null);

function useThreadRouteIds() {
  const override = use(ThreadRouteOverrideContext);
  const environmentId = useParams({ strict: false, select: (params) => params.environmentId });
  const threadId = useParams({ strict: false, select: (params) => params.threadId });
  if (override) return { environmentId: override.environmentId, threadId: override.threadId };
  return { environmentId, threadId };
}

export function useThreadRouteTarget(): ThreadRouteTarget | null {
  const { environmentId, threadId } = useThreadRouteIds();
  const draftId = useParams({ strict: false, select: (params) => params.draftId });
  return resolveThreadRouteTarget({ environmentId, threadId, draftId });
}

export function useThreadRouteRef(): ScopedThreadRef | null {
  return resolveThreadRouteRef(useThreadRouteIds());
}
