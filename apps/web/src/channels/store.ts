import type { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";
import type { ChannelConfig, CrossChannelAgent } from "./types";

interface ChannelsStoreState {
  channels: Record<string, ChannelConfig>;
  agents: CrossChannelAgent[];
  /** ISO time each thread (by scoped thread key) was last looked at. */
  lastSeen: Record<string, string>;
  setContext: (channelKey: string, text: string) => void;
  setCoordinator: (channelKey: string, threadId: ThreadId | null) => void;
  markContextSent: (channelKey: string, text: string) => void;
  upsertAgent: (agent: CrossChannelAgent) => void;
  removeAgent: (id: string) => void;
  markSeen: (threadKey: string, iso: string) => void;
}

const EMPTY_CONFIG: ChannelConfig = {
  context: "",
  coordinatorThreadId: null,
  contextSentToCoordinator: null,
};

function updateConfig(
  channels: Record<string, ChannelConfig>,
  channelKey: string,
  patch: Partial<ChannelConfig>,
): Record<string, ChannelConfig> {
  return { ...channels, [channelKey]: { ...(channels[channelKey] ?? EMPTY_CONFIG), ...patch } };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAgent = (value: unknown): value is CrossChannelAgent =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.handle === "string" &&
  typeof value.name === "string" &&
  typeof value.homeProjectId === "string" &&
  typeof value.environmentId === "string";

export const useChannelsStore = create<ChannelsStoreState>()(
  persist(
    (set) => ({
      channels: {},
      agents: [],
      lastSeen: {},
      setContext: (channelKey, text) =>
        set((state) => ({ channels: updateConfig(state.channels, channelKey, { context: text }) })),
      setCoordinator: (channelKey, threadId) =>
        set((state) => ({
          channels: updateConfig(state.channels, channelKey, { coordinatorThreadId: threadId }),
        })),
      markContextSent: (channelKey, text) =>
        set((state) => ({
          channels: updateConfig(state.channels, channelKey, { contextSentToCoordinator: text }),
        })),
      upsertAgent: (agent) =>
        set((state) => ({
          agents: state.agents.some((candidate) => candidate.id === agent.id)
            ? state.agents.map((candidate) => (candidate.id === agent.id ? agent : candidate))
            : [...state.agents, agent],
        })),
      removeAgent: (id) =>
        set((state) => ({ agents: state.agents.filter((agent) => agent.id !== id) })),
      markSeen: (threadKey, iso) =>
        set((state) => {
          const previous = state.lastSeen[threadKey];
          if (previous !== undefined && Date.parse(previous) >= Date.parse(iso)) return state;
          return { lastSeen: { ...state.lastSeen, [threadKey]: iso } };
        }),
    }),
    {
      name: "t3code:channels:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: ({ channels, agents, lastSeen }) => ({ channels, agents, lastSeen }),
      migrate: (persisted) => {
        const value = isRecord(persisted) ? persisted : {};
        return {
          channels: isRecord(value.channels)
            ? (value.channels as Record<string, ChannelConfig>)
            : {},
          agents: Array.isArray(value.agents) ? value.agents.filter(isAgent) : [],
          lastSeen: isRecord(value.lastSeen) ? (value.lastSeen as Record<string, string>) : {},
        };
      },
    },
  ),
);

export const selectChannelConfig =
  (channelKey: string) =>
  (state: ChannelsStoreState): ChannelConfig =>
    state.channels[channelKey] ?? EMPTY_CONFIG;
