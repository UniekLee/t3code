import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { ChildApproval } from "~/components/chat/ChildThreadApprovals";
import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { ComposerPendingUserInputPanel } from "~/components/chat/ComposerPendingUserInputPanel";
import { LinkRequestCard } from "~/components/chat/LinkRequestCard";
import { SecretRequestCard } from "~/components/chat/SecretRequestCard";
import type { ChatComposerHandle } from "~/components/chat/ChatComposer";
import { usePendingThreadRequests } from "~/components/chat/usePendingThreadRequests";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useEnvironmentScope } from "~/state/session";
import { useThreadProjection } from "~/state/entities";

/**
 * The live, answerable requests of one thread: approvals, questions, secret and link requests.
 * It reuses the classic components and the classic request hook, so answering goes through the
 * same commands. Reading the projection means the thread must be on screen or an item worth
 * answering; callers decide when to mount it.
 */
export function ThreadPendingRequests({
  threadRef,
  title,
  cwd,
}: {
  threadRef: ScopedThreadRef;
  title: string;
  cwd?: string | undefined;
}) {
  const detail = useThreadProjection(threadRef);
  const projection = detail?.projection ?? null;
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef("");
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const canOperate = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const requests = usePendingThreadRequests({
    environmentId: threadRef.environmentId,
    activeThreadId: threadRef.threadId,
    serverProjection: projection,
    supportsQuestionAttachments: false,
    composerDraftTarget: threadRef,
    setComposerDraftPrompt: (target, prompt) =>
      useComposerDraftStore.getState().setPrompt(target, prompt),
    promptRef,
    composerRef,
    setThreadError: (_threadId, message) => setError(message),
  });

  if (projection === null) return null;
  const { approvals } = derivePendingThreadRequests(projection);
  const pendingRows = projection.visibleTurnItems.filter((row) => row.visibility === "local");
  const secrets = pendingRows.flatMap((row) =>
    row.item.type === "secret_request" && row.item.secretStatus === "pending"
      ? [{ id: row.item.id, item: row.item, visibility: row.visibility }]
      : [],
  );
  const links = pendingRows.flatMap((row) =>
    row.item.type === "link_request" && row.item.linkStatus === "pending"
      ? [{ id: row.item.id, item: row.item, visibility: row.visibility }]
      : [],
  );
  const progress = requests.activePendingProgress;
  const question = progress?.activeQuestion ?? null;
  const input = requests.activePendingUserInput;

  if (
    approvals.length === 0 &&
    input === null &&
    secrets.length === 0 &&
    links.length === 0 &&
    error === null
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {approvals.map((approval) => (
        <ChildApproval key={approval.requestId} entry={{ thread: threadRef, title, approval }} />
      ))}
      {input !== null && progress !== null ? (
        <div className="flex flex-col gap-2">
          <ComposerBanner.Root detached variant="warning">
            <ComposerPendingUserInputPanel
              pendingUserInputs={requests.pendingUserInputs}
              cwd={cwd}
              threadRef={threadRef}
              disabled={!canOperate}
              respondingRequestIds={
                requests.activePendingIsResponding
                  ? [...requests.respondingRequestIds, input.requestId]
                  : requests.respondingRequestIds
              }
              answers={requests.activePendingDraftAnswers}
              questionIndex={requests.activePendingQuestionIndex}
              onToggleOption={requests.onSelectActivePendingUserInputOption}
              onAdvance={requests.onAdvanceActivePendingUserInput}
              onDismiss={requests.onDismissUserInput}
            />
          </ComposerBanner.Root>
          {question !== null && question.allowCustomAnswer !== false ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (progress.canAdvance) requests.onAdvanceActivePendingUserInput();
              }}
            >
              <Input
                size="sm"
                value={progress.customAnswer}
                disabled={!canOperate || requests.activePendingIsResponding}
                placeholder="Or type your own answer"
                aria-label="Your answer"
                onChange={(event) =>
                  requests.onChangeActivePendingUserInputCustomAnswer(
                    question.id,
                    event.currentTarget.value,
                  )
                }
              />
              <Button
                type="submit"
                size="xs"
                disabled={!canOperate || !progress.canAdvance || requests.activePendingIsResponding}
              >
                {progress.isLastQuestion ? "Send answer" : "Next"}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      {secrets.map((secret) => (
        <SecretRequestCard
          key={secret.id}
          environmentId={threadRef.environmentId}
          item={secret.item}
          visibility={secret.visibility}
        />
      ))}
      {links.map((link) => (
        <LinkRequestCard
          key={link.id}
          environmentId={threadRef.environmentId}
          item={link.item}
          visibility={link.visibility}
        />
      ))}
      {error !== null ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
