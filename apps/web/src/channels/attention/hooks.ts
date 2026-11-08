import type { ScopedThreadRef } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";

import { useNowMinute } from "~/hooks/useNowMinute";
import { useQuietThreadShell, useQuietThreadShells } from "~/state/entities";
import { loadedSecretRequestsAtom } from "~/state/loadedSecretRequests";

import { useAgents, useChannels } from "../hooks";
import {
  deriveAttentionItems,
  deriveThreadAttention,
  type AttentionItem,
  type AttentionOwner,
} from "./attention";
import { useAttentionStore } from "./store";

function useDismissedSet(): ReadonlySet<string> {
  const dismissed = useAttentionStore((state) => state.dismissed);
  return new Set(dismissed);
}

/** Everything waiting on the viewer across all channels, sub-threads and agents. Reads quiet shells only. */
export function useAttentionItems(): AttentionItem[] {
  const shells = useQuietThreadShells();
  const { channels } = useChannels();
  const agents = useAgents();
  const dismissed = useDismissedSet();
  const secretsByThread = useAtomValue(loadedSecretRequestsAtom);
  const now = Date.parse(useNowMinute());
  return deriveAttentionItems({ shells, channels, agents, dismissed, secretsByThread, now });
}

/** What one on-screen thread asks of the viewer, from its shell alone. */
export function useThreadAttentionItems(
  threadRef: ScopedThreadRef | null,
  owner: AttentionOwner,
  subThread: boolean,
): AttentionItem[] {
  const shell = useQuietThreadShell(threadRef);
  const dismissed = useDismissedSet();
  const now = Date.parse(useNowMinute());
  if (shell === null) return [];
  return deriveThreadAttention({ shell, owner, subThread, dismissed, now });
}

export function useDismissAttention(): (id: string) => void {
  return useAttentionStore((state) => state.dismiss);
}

/** Navigates to where an item lives: the thread pane of its channel, the channel, or the agent. */
export function useOpenAttentionItem(): (item: AttentionItem) => void {
  const navigate = useNavigate();
  return (item) => {
    if (item.owner.kind === "agent") {
      void navigate({ to: "/channels/agents/$agentId", params: { agentId: item.owner.key } });
      return;
    }
    void navigate({
      to: "/channels/$environmentId/$projectId",
      params: { environmentId: item.owner.environmentId, projectId: item.owner.projectId },
      search: item.subThread ? { thread: item.threadRef.threadId } : {},
    });
  };
}

/** Channels with at least one coordinator or sub-thread item waiting on the viewer. */
export function useAttentionChannelKeys(): ReadonlySet<string> {
  return new Set(
    useAttentionItems().flatMap((item) => (item.owner.kind === "channel" ? [item.owner.key] : [])),
  );
}
