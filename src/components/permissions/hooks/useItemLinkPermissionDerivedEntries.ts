import { useMemo } from "react";
import type { IItemLinkPermissionEntryForUI } from "../models/itemLinkPermissionModels";
import type {
  IItemLinkPermissionDerivedEntry,
  IItemLinkPermissionDraftState,
  IItemLinkPermissionDisplayRecipient,
} from "../models/itemLinkPermissionModels";
import {
  getItemLinkPermissionRecipientKey,
  getItemLinkPermissionRoleLabel,
  mapGraphIdentityToItemLinkRecipientCandidate,
} from "../services/itemLinkPermissionUiUtils";

/**
 * 根据“后端基线 + 本地 draft 差异”派生 links 面板真正需要渲染的行。
 */
export const useItemLinkPermissionDerivedEntries = (
  originalEntries: IItemLinkPermissionEntryForUI[],
  draft: IItemLinkPermissionDraftState,
) => {
  return useMemo(() => {
    const deletedPermissionIds = new Set(draft.deletedPermissionIds);
    const persistedEntries = originalEntries
      .filter((entry) => !deletedPermissionIds.has(entry.permissionId))
      .map<IItemLinkPermissionDerivedEntry>((entry) => {
        const persistedRecipients = entry.grantedToIdentities.map(
          (identity) => {
            const candidate =
              mapGraphIdentityToItemLinkRecipientCandidate(identity);

            return {
              key: getItemLinkPermissionRecipientKey({
                objectId: candidate.objectId,
                userPrincipalName: candidate.userPrincipalName,
                mail: candidate.mail,
                name: candidate.name,
              }),
              candidate,
              source: "persisted",
            } satisfies IItemLinkPermissionDisplayRecipient;
          },
        );
        const revokedRecipientKeys = new Set(
          (draft.revokesByPermissionId[entry.permissionId] ?? []).map(
            (candidate) =>
              getItemLinkPermissionRecipientKey({
                objectId: candidate.objectId,
                userPrincipalName: candidate.userPrincipalName,
                mail: candidate.mail,
                name: candidate.name,
              }),
          ),
        );
        const grantedRecipients = (
          draft.grantsByPermissionId[entry.permissionId] ?? []
        )
          .map<IItemLinkPermissionDisplayRecipient>((candidate) => ({
            key: getItemLinkPermissionRecipientKey({
              objectId: candidate.objectId,
              userPrincipalName: candidate.userPrincipalName,
              mail: candidate.mail,
              name: candidate.name,
            }),
            candidate,
            source: "draft",
          }))
          .filter(
            (recipient) =>
              !persistedRecipients.some(
                (persistedRecipient) =>
                  persistedRecipient.key === recipient.key,
              ),
          );
        const visiblePersistedRecipients = persistedRecipients.filter(
          (recipient) => !revokedRecipientKeys.has(recipient.key),
        );
        const recipients =
          entry.scope === "users"
            ? [...visiblePersistedRecipients, ...grantedRecipients]
            : [];

        return {
          id: entry.id,
          source: "persisted",
          permissionId: entry.permissionId,
          shareId: entry.shareId,
          webUrl: entry.webUrl,
          scope: entry.scope,
          type: entry.type,
          roleLabel: entry.roleLabel,
          preventsDownload: entry.preventsDownload,
          grantedToCount:
            entry.scope === "users" ? recipients.length : entry.grantedToCount,
          recipients,
          hasValidationError: false,
        };
      });

    const createdEntries =
      draft.createdLinks.map<IItemLinkPermissionDerivedEntry>((entry) => ({
        id: entry.id,
        source: "draft",
        scope: entry.scope,
        type: entry.type,
        roleLabel: getItemLinkPermissionRoleLabel(entry.type),
        preventsDownload: entry.type === "blocksDownload",
        grantedToCount: entry.scope === "users" ? entry.recipients.length : 0,
        recipients:
          entry.scope === "users"
            ? entry.recipients.map<IItemLinkPermissionDisplayRecipient>(
                (candidate) => ({
                  key: getItemLinkPermissionRecipientKey({
                    objectId: candidate.objectId,
                    userPrincipalName: candidate.userPrincipalName,
                    mail: candidate.mail,
                    name: candidate.name,
                  }),
                  candidate,
                  source: "draft",
                }),
              )
            : [],
        hasValidationError:
          entry.scope === "users" && entry.recipients.length === 0,
      }));

    const sortedEntries = [...persistedEntries, ...createdEntries].sort(
      (left, right) => {
        const rankDiff =
          getScopeSortRank(left.scope) - getScopeSortRank(right.scope);

        if (rankDiff !== 0) {
          return rankDiff;
        }

        if (left.source === right.source) {
          return 0;
        }

        return left.source === "persisted" ? -1 : 1;
      },
    );

    return {
      entries: sortedEntries,
      hasBlockingValidationError: sortedEntries.some(
        (entry) => entry.hasValidationError,
      ),
    };
  }, [draft, originalEntries]);
};

const getScopeSortRank = (scope: IItemLinkPermissionEntryForUI["scope"]) => {
  if (scope === "anonymous") {
    return 0;
  }

  if (scope === "organization") {
    return 1;
  }

  return 2;
};
