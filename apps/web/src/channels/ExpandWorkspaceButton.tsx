import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Maximize2Icon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

/** Opens a thread as the full classic workspace inside Channels. */
export function ExpandWorkspaceButton({
  environmentId,
  projectId,
  threadId,
  fromThread,
  fromAgent,
  size = "icon-sm",
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  threadId: ThreadId;
  fromThread?: string;
  fromAgent?: string;
  size?: "icon-sm" | "icon-xs";
}) {
  const navigate = useNavigate();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={size}
            aria-label="Expand to full workspace"
            onClick={() =>
              void navigate({
                to: "/channels/$environmentId/$projectId/workspace/$threadKey",
                params: { environmentId, projectId, threadKey: threadId },
                search: {
                  ...(fromThread ? { thread: fromThread } : {}),
                  ...(fromAgent ? { agent: fromAgent } : {}),
                },
              })
            }
          />
        }
      >
        <Maximize2Icon />
      </TooltipTrigger>
      <TooltipPopup side="bottom">Expand to full workspace</TooltipPopup>
    </Tooltip>
  );
}
