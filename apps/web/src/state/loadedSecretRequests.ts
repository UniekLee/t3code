import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentThread,
  EnvironmentThreadStructure,
} from "@t3tools/client-runtime/state/shell";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "../rpc/atomRegistry";

/** A secret request the glance can count. Shells do not carry these. */
export interface LoadedSecretRequest {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
}

type VisibleSecretRow = {
  readonly visibility: string;
  readonly item: {
    readonly type: string;
    readonly id: string;
    readonly label?: string | undefined;
    readonly secretStatus?: string | undefined;
    readonly startedAt?: DateTime.Utc | string | null | undefined;
    readonly updatedAt?: DateTime.Utc | string | null | undefined;
  };
};

export const loadedSecretRequestsAtom = Atom.make(
  new Map<string, readonly LoadedSecretRequest[]>(),
);

function isoOf(value: DateTime.Utc | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : DateTime.formatIso(value);
}

export function pendingSecretsFromVisibleTurnItems(
  items: ReadonlyArray<VisibleSecretRow>,
): readonly LoadedSecretRequest[] {
  const secrets: LoadedSecretRequest[] = [];
  for (const row of items) {
    if (row.visibility !== "local") continue;
    const item = row.item;
    if (item.type !== "secret_request" || item.secretStatus !== "pending") continue;
    const createdAt = isoOf(item.startedAt) ?? isoOf(item.updatedAt);
    if (createdAt === null || item.label === undefined) continue;
    secrets.push({ id: item.id, label: item.label, createdAt });
  }
  return secrets;
}

function sameSecrets(
  left: readonly LoadedSecretRequest[],
  right: readonly LoadedSecretRequest[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (secret, index) =>
        secret.id === right[index]?.id &&
        secret.label === right[index].label &&
        secret.createdAt === right[index].createdAt,
    )
  );
}

function rememberSecrets(key: string, secrets: readonly LoadedSecretRequest[]): void {
  appAtomRegistry.modify(loadedSecretRequestsAtom, (current) => {
    const previous = current.get(key) ?? [];
    if ((secrets.length === 0 && !current.has(key)) || sameSecrets(previous, secrets)) {
      return [undefined, current];
    }
    const next = new Map(current);
    if (secrets.length === 0) next.delete(key);
    else next.set(key, secrets);
    return [undefined, next];
  });
}

/** Remember secret requests from a projection this screen already loaded. */
export function publishLoadedSecretRequests(
  ref: ScopedThreadRef | null,
  thread: EnvironmentThread | EnvironmentThreadStructure | null,
): void {
  if (ref === null || thread === null) return;
  rememberSecrets(
    scopedThreadKey(ref),
    pendingSecretsFromVisibleTurnItems(thread.projection.visibleTurnItems),
  );
}
