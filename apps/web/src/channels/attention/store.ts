import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

const MAX_DISMISSED = 200;

interface AttentionStoreState {
  /** Failed-run attention ids the viewer dismissed, oldest first. */
  dismissed: string[];
  dismiss: (id: string) => void;
}

export const useAttentionStore = create<AttentionStoreState>()(
  persist(
    (set) => ({
      dismissed: [],
      dismiss: (id) =>
        set((state) =>
          state.dismissed.includes(id)
            ? state
            : { dismissed: [...state.dismissed, id].slice(-MAX_DISMISSED) },
        ),
    }),
    {
      name: "t3code:channels:attention:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: ({ dismissed }) => ({ dismissed }),
    },
  ),
);
