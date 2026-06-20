import { useCallback, useEffect, useState } from "react";
import {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_TYPES,
  type IItemLinkPermissionDerivedEntry,
  type IItemLinkPermissionEntryForUI,
  type IItemLinkPermissionRecipientCandidate,
  type ItemLinkPermissionScope,
  type ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import { useItemLinkPermissionDerivedEntries } from "./useItemLinkPermissionDerivedEntries";
import { useItemLinkPermissionDraft } from "./useItemLinkPermissionDraft";

interface IUseItemLinkPermissionUIStateOptions {
  resetKey: string;
  originalEntries: IItemLinkPermissionEntryForUI[];
  onResetLoadState?: () => void;
}

/**
 * 管理 item link 权限面板的本地编辑状态和行级交互。
 */
export const useItemLinkPermissionUIState = ({
  resetKey,
  originalEntries,
  onResetLoadState,
}: IUseItemLinkPermissionUIStateOptions) => {
  const [createLinkScope, setCreateLinkScope] =
    useState<ItemLinkPermissionScope>(ITEM_LINK_PERMISSION_SCOPES[0]);
  const [createLinkType, setCreateLinkType] = useState<ItemLinkPermissionType>(
    ITEM_LINK_PERMISSION_TYPES[0],
  );
  const {
    draft,
    hasUnsavedChanges,
    addCreatedLink,
    removeCreatedLink,
    deletePersistedLink,
    addRecipientToCreatedLink,
    removeRecipientFromCreatedLink,
    addGrantRecipient,
    addRevokeRecipient,
    resetDraft,
  } = useItemLinkPermissionDraft(resetKey);
  const derivedPermissions = useItemLinkPermissionDerivedEntries(
    originalEntries,
    draft,
  );

  const resetDraftState = useCallback(() => {
    resetDraft();
    setCreateLinkScope(ITEM_LINK_PERMISSION_SCOPES[0]);
    setCreateLinkType(ITEM_LINK_PERMISSION_TYPES[0]);
  }, [resetDraft]);

  const resetSectionState = useCallback(() => {
    resetDraftState();
    onResetLoadState?.();
  }, [onResetLoadState, resetDraftState]);

  const onAddLink = useCallback(() => {
    return addCreatedLink(createLinkScope, createLinkType);
  }, [addCreatedLink, createLinkScope, createLinkType]);

  const onDeleteLink = useCallback(
    (entry: IItemLinkPermissionDerivedEntry) => {
      if (entry.source === "draft") {
        removeCreatedLink(entry.id);
        return;
      }

      if (entry.permissionId) {
        deletePersistedLink(entry.permissionId);
      }
    },
    [deletePersistedLink, removeCreatedLink],
  );

  const onAddRecipient = useCallback(
    (
      entry: IItemLinkPermissionDerivedEntry,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      if (entry.source === "draft") {
        addRecipientToCreatedLink(entry.id, candidate);
        return;
      }

      if (entry.permissionId) {
        addGrantRecipient(entry.permissionId, candidate);
      }
    },
    [addGrantRecipient, addRecipientToCreatedLink],
  );

  const onRemoveRecipient = useCallback(
    (entry: IItemLinkPermissionDerivedEntry, recipientKey: string) => {
      if (entry.source === "draft") {
        removeRecipientFromCreatedLink(entry.id, recipientKey);
        return;
      }

      if (!entry.permissionId) {
        return;
      }

      const recipient = entry.recipients.find(
        (currentRecipient) => currentRecipient.key === recipientKey,
      );

      if (!recipient) {
        return;
      }

      addRevokeRecipient(entry.permissionId, recipient.candidate);
    },
    [addRevokeRecipient, removeRecipientFromCreatedLink],
  );

  useEffect(() => {
    const nextAvailableCombo = resolveNextAvailableCreateLinkCombo(
      derivedPermissions.entries,
      createLinkScope,
      createLinkType,
    );

    if (!nextAvailableCombo) {
      return;
    }

    if (nextAvailableCombo.scope !== createLinkScope) {
      setCreateLinkScope(nextAvailableCombo.scope);
    }

    if (nextAvailableCombo.type !== createLinkType) {
      setCreateLinkType(nextAvailableCombo.type);
    }
  }, [createLinkScope, createLinkType, derivedPermissions.entries]);

  return {
    entries: derivedPermissions.entries,
    createLinkScope,
    createLinkType,
    setCreateLinkScope,
    setCreateLinkType,
    draft,
    hasUnsavedChanges,
    hasBlockingValidationError: derivedPermissions.hasBlockingValidationError,
    resetDraftState,
    resetSectionState,
    onAddLink,
    onDeleteLink,
    onCopyLink: (webUrl: string) => {
      void navigator.clipboard?.writeText(webUrl);
    },
    onAddRecipient,
    onRemoveRecipient,
  };
};

const resolveNextAvailableCreateLinkCombo = (
  entries: IItemLinkPermissionDerivedEntry[],
  currentScope: ItemLinkPermissionScope,
  currentType: ItemLinkPermissionType,
): { scope: ItemLinkPermissionScope; type: ItemLinkPermissionType } | null => {
  const occupiedKeys = new Set(
    entries.map((entry) => createScopeTypeKey(entry.scope, entry.type)),
  );

  if (!occupiedKeys.has(createScopeTypeKey(currentScope, currentType))) {
    return {
      scope: currentScope,
      type: currentType,
    };
  }

  const currentScopeAvailableType = ITEM_LINK_PERMISSION_TYPES.find(
    (type) => !occupiedKeys.has(createScopeTypeKey(currentScope, type)),
  );

  if (currentScopeAvailableType) {
    return {
      scope: currentScope,
      type: currentScopeAvailableType,
    };
  }

  for (const scope of ITEM_LINK_PERMISSION_SCOPES) {
    const availableType = ITEM_LINK_PERMISSION_TYPES.find(
      (type) => !occupiedKeys.has(createScopeTypeKey(scope, type)),
    );

    if (availableType) {
      return {
        scope,
        type: availableType,
      };
    }
  }

  return null;
};

const createScopeTypeKey = (
  scope: ItemLinkPermissionScope,
  type: ItemLinkPermissionType,
) => `${scope}:${type}`;
