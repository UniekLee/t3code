import { describe, expect, it } from "vite-plus/test";

import { pendingSecretsFromVisibleTurnItems } from "./loadedSecretRequests";

const RECENT = "2026-11-08T11:50:00.000Z";

describe("pendingSecretsFromVisibleTurnItems", () => {
  it("keeps local pending secret requests and drops the rest", () => {
    expect(
      pendingSecretsFromVisibleTurnItems([
        {
          visibility: "local",
          item: {
            type: "secret_request",
            id: "s1",
            label: "GitHub token",
            secretStatus: "pending",
            startedAt: RECENT,
          },
        },
        {
          visibility: "inherited",
          item: {
            type: "secret_request",
            id: "s2",
            label: "Inherited",
            secretStatus: "pending",
            startedAt: RECENT,
          },
        },
        {
          visibility: "local",
          item: {
            type: "secret_request",
            id: "s3",
            label: "Saved",
            secretStatus: "saved",
            startedAt: RECENT,
          },
        },
        {
          visibility: "local",
          item: {
            type: "user_message",
            id: "m1",
          },
        },
      ]),
    ).toEqual([{ id: "s1", label: "GitHub token", createdAt: RECENT }]);
  });
});
