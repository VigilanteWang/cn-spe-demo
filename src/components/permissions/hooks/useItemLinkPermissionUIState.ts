import { useCallback, useState } from "react";
import type {
  IItemLinkPermissionDerivedEntry,
  IItemLinkPermissionEntryForUI,
  IItemLinkPermissionRecipientCandidate,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
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
    useState<ItemLinkPermissionScope>("anonymous");
  const [createLinkType, setCreateLinkType] =
    useState<ItemLinkPermissionType>("view");
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
    setCreateLinkScope("anonymous");
    setCreateLinkType("view");
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
