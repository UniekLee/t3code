import { useAtomValue } from "@effect/atom-react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { useDelegatedUnderParent, useQuietThreadShells } from "~/state/entities";
import { loadedSecretRequestsAtom } from "~/state/loadedSecretRequests";

import { useAttentionStore } from "../attention/store";
import { useAgents, useChannels } from "../hooks";
import { buildGlanceThreads, type GlanceThread } from "./threadStates";

/** Classified threads from the shells the client already holds. No extra requests. */
export function useGlanceThreads(): GlanceThread[] {
  const shells = useQuietThreadShells();
  const { channels } = useChannels();
  const agents = useAgents();
  const delegatedUnderParent = useDelegatedUnderParent();
  const dismissed = useAttentionStore((state) => state.dismissed);
  const secretsByThread = useAtomValue(loadedSecretRequestsAtom);
  const now = Date.parse(useNowMinute());
  return buildGlanceThreads({
    shells,
    channels,
    agents,
    delegatedUnderParent,
    dismissed: new Set(dismissed),
    secretsByThread,
    now,
  });
}
