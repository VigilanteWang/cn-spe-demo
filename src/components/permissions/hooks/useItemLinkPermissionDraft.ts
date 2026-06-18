import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  IItemLinkPermissionDraftState,
  IItemLinkPermissionRecipientCandidate,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import {
  createEmptyItemLinkPermissionDraftState,
  hasItemLinkPermissionDraftChanges,
} from "../models/itemLinkPermissionModels";
import { getItemLinkPermissionRecipientKey } from "../services/itemLinkPermissionUiUtils";

/**
 * 管理 links 面板的本地草稿差异。
 *
 * links 与 people/groups 不同，不直接维护一份“整表草稿快照”，
 * 而是只记录 create/delete/grant/revoke 这四类最小差异。
 */
export const useItemLinkPermissionDraft = (resetKey: string) => {
  const [draft, setDraft] = useState<IItemLinkPermissionDraftState>(
    createEmptyItemLinkPermissionDraftState(),
  );
  const createdLinkSequence = useRef(0);

  useEffect(() => {
    createdLinkSequence.current = 0;
    setDraft(createEmptyItemLinkPermissionDraftState());
  }, [resetKey]);

  const addCreatedLink = useCallback(
    (scope: ItemLinkPermissionScope, type: ItemLinkPermissionType): string => {
      const nextId = `draft-item-link:${createdLinkSequence.current + 1}`;
      createdLinkSequence.current += 1;

      setDraft((currentDraft) => ({
        ...currentDraft,
        createdLinks: [
          ...currentDraft.createdLinks,
          {
            id: nextId,
            scope,
            type,
            recipients: [],
          },
        ],
      }));

      return nextId;
    },
    [],
  );

  const removeCreatedLink = useCallback((createdLinkId: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      createdLinks: currentDraft.createdLinks.filter(
        (entry) => entry.id !== createdLinkId,
      ),
    }));
  }, []);

  const deletePersistedLink = useCallback((permissionId: string) => {
    setDraft((currentDraft) => {
      const nextDeletedPermissionIds =
        currentDraft.deletedPermissionIds.includes(permissionId)
          ? currentDraft.deletedPermissionIds
          : [...currentDraft.deletedPermissionIds, permissionId];
      const nextGrantsByPermissionId = { ...currentDraft.grantsByPermissionId };
      const nextRevokesByPermissionId = {
        ...currentDraft.revokesByPermissionId,
      };

      delete nextGrantsByPermissionId[permissionId];
      delete nextRevokesByPermissionId[permissionId];

      return {
        ...currentDraft,
        deletedPermissionIds: nextDeletedPermissionIds,
        grantsByPermissionId: nextGrantsByPermissionId,
        revokesByPermissionId: nextRevokesByPermissionId,
      };
    });
  }, []);

  const addRecipientToCreatedLink = useCallback(
    (
      createdLinkId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      const candidateKey = getItemLinkPermissionRecipientKey({
        objectId: candidate.objectId,
        userPrincipalName: candidate.userPrincipalName,
        mail: candidate.mail,
        name: candidate.name,
      });

      setDraft((currentDraft) => ({
        ...currentDraft,
        createdLinks: currentDraft.createdLinks.map((entry) => {
          if (entry.id !== createdLinkId) {
            return entry;
          }

          const alreadyExists = entry.recipients.some(
            (recipient) =>
              getItemLinkPermissionRecipientKey({
                objectId: recipient.objectId,
                userPrincipalName: recipient.userPrincipalName,
                mail: recipient.mail,
                name: recipient.name,
              }) === candidateKey,
          );

          if (alreadyExists) {
            return entry;
          }

          return {
            ...entry,
            recipients: [...entry.recipients, candidate],
          };
        }),
      }));
    },
    [],
  );

  const removeRecipientFromCreatedLink = useCallback(
    (createdLinkId: string, recipientKey: string) => {
      setDraft((currentDraft) => ({
        ...currentDraft,
        createdLinks: currentDraft.createdLinks.map((entry) =>
          entry.id === createdLinkId
            ? {
                ...entry,
                recipients: entry.recipients.filter(
                  (recipient) =>
                    getItemLinkPermissionRecipientKey({
                      objectId: recipient.objectId,
                      userPrincipalName: recipient.userPrincipalName,
                      mail: recipient.mail,
                      name: recipient.name,
                    }) !== recipientKey,
                ),
              }
            : entry,
        ),
      }));
    },
    [],
  );

  const addGrantRecipient = useCallback(
    (
      permissionId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      setDraft((currentDraft) => {
        const nextRevokesByPermissionId = {
          ...currentDraft.revokesByPermissionId,
        };
        const existingRevokes = nextRevokesByPermissionId[permissionId] ?? [];
        const candidateKey = getItemLinkPermissionRecipientKey({
          objectId: candidate.objectId,
          userPrincipalName: candidate.userPrincipalName,
          mail: candidate.mail,
          name: candidate.name,
        });
        const filteredRevokes = existingRevokes.filter(
          (recipient) =>
            getItemLinkPermissionRecipientKey({
              objectId: recipient.objectId,
              userPrincipalName: recipient.userPrincipalName,
              mail: recipient.mail,
              name: recipient.name,
            }) !== candidateKey,
        );

        if (filteredRevokes.length !== existingRevokes.length) {
          if (filteredRevokes.length === 0) {
            delete nextRevokesByPermissionId[permissionId];
          } else {
            nextRevokesByPermissionId[permissionId] = filteredRevokes;
          }

          return {
            ...currentDraft,
            revokesByPermissionId: nextRevokesByPermissionId,
          };
        }

        return {
          ...currentDraft,
          grantsByPermissionId: addCandidateToRecipientMap(
            currentDraft.grantsByPermissionId,
            permissionId,
            candidate,
          ),
        };
      });
    },
    [],
  );

  const addRevokeRecipient = useCallback(
    (
      permissionId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      setDraft((currentDraft) => {
        const nextGrantsByPermissionId = removeCandidateFromRecipientMap(
          currentDraft.grantsByPermissionId,
          permissionId,
          candidate,
        );

        if (nextGrantsByPermissionId !== currentDraft.grantsByPermissionId) {
          return {
            ...currentDraft,
            grantsByPermissionId: nextGrantsByPermissionId,
          };
        }

        return {
          ...currentDraft,
          revokesByPermissionId: addCandidateToRecipientMap(
            currentDraft.revokesByPermissionId,
            permissionId,
            candidate,
          ),
        };
      });
    },
    [],
  );

  const resetDraft = useCallback(() => {
    setDraft(createEmptyItemLinkPermissionDraftState());
  }, []);

  return {
    draft,
    hasUnsavedChanges: useMemo(
      () => hasItemLinkPermissionDraftChanges(draft),
      [draft],
    ),
    addCreatedLink,
    removeCreatedLink,
    deletePersistedLink,
    addRecipientToCreatedLink,
    removeRecipientFromCreatedLink,
    addGrantRecipient,
    addRevokeRecipient,
    resetDraft,
  };
};

const addCandidateToRecipientMap = (
  recipientMap: Record<string, IItemLinkPermissionRecipientCandidate[]>,
  permissionId: string,
  candidate: IItemLinkPermissionRecipientCandidate,
) => {
  const candidateKey = getItemLinkPermissionRecipientKey({
    objectId: candidate.objectId,
    userPrincipalName: candidate.userPrincipalName,
    mail: candidate.mail,
    name: candidate.name,
  });
  const currentRecipients = recipientMap[permissionId] ?? [];
  const alreadyExists = currentRecipients.some(
    (recipient) =>
      getItemLinkPermissionRecipientKey({
        objectId: recipient.objectId,
        userPrincipalName: recipient.userPrincipalName,
        mail: recipient.mail,
        name: recipient.name,
      }) === candidateKey,
  );

  if (alreadyExists) {
    return recipientMap;
  }

  return {
    ...recipientMap,
    [permissionId]: [...currentRecipients, candidate],
  };
};

const removeCandidateFromRecipientMap = (
  recipientMap: Record<string, IItemLinkPermissionRecipientCandidate[]>,
  permissionId: string,
  candidate: IItemLinkPermissionRecipientCandidate,
) => {
  const currentRecipients = recipientMap[permissionId];

  if (!currentRecipients) {
    return recipientMap;
  }

  const candidateKey = getItemLinkPermissionRecipientKey({
    objectId: candidate.objectId,
    userPrincipalName: candidate.userPrincipalName,
    mail: candidate.mail,
    name: candidate.name,
  });
  const nextRecipients = currentRecipients.filter(
    (recipient) =>
      getItemLinkPermissionRecipientKey({
        objectId: recipient.objectId,
        userPrincipalName: recipient.userPrincipalName,
        mail: recipient.mail,
        name: recipient.name,
      }) !== candidateKey,
  );

  if (nextRecipients.length === currentRecipients.length) {
    return recipientMap;
  }

  if (nextRecipients.length === 0) {
    const nextRecipientMap = { ...recipientMap };
    delete nextRecipientMap[permissionId];
    return nextRecipientMap;
  }

  return {
    ...recipientMap,
    [permissionId]: nextRecipients,
  };
};
