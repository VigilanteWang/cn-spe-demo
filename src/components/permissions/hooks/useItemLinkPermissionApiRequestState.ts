import { useCallback, useEffect, useState } from "react";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type {
  IItemLinkPermissionDraftState,
  IItemLinkPermissionEntryForUI,
} from "../models/itemLinkPermissionModels";
import { useItemLinkPermissionLoadState } from "./useItemLinkPermissionLoadState";
import {
  applyItemLinkPermissionChanges,
  listItemLinkPermissions,
} from "../../../services/itemPermissionApi";
import { createItemLinkPermissionChangeSet } from "../services/itemLinkPermissionUiUtils";
import type { ItemPermissionDialogTabValue } from "../models/itemLinkPermissionModels";

interface IUseItemLinkPermissionApiRequestStateOptions {
  open: boolean;
  driveId?: string;
  itemId?: string;
  resetKey: string;
  isSupportedLinkTarget: boolean;
  selectedDialogTab: ItemPermissionDialogTabValue;
}

/**
 * 管理 item link 权限的懒加载、提交准备和提交后的基线同步。
 */
export const useItemLinkPermissionApiRequestState = ({
  open,
  driveId,
  itemId,
  resetKey,
  isSupportedLinkTarget,
  selectedDialogTab,
}: IUseItemLinkPermissionApiRequestStateOptions) => {
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const {
    originalEntries,
    hasLoadedOnce,
    replaceEntries,
    reset: resetLoadState,
  } = useItemLinkPermissionLoadState(resetKey);

  useEffect(() => {
    if (
      !open ||
      !driveId ||
      !itemId ||
      !isSupportedLinkTarget ||
      selectedDialogTab !== "links" ||
      hasLoadedOnce
    ) {
      return;
    }

    let cancelled = false;
    setIsLoadingPermissions(true);
    setLoadErrorMessage(null);

    void listItemLinkPermissions(driveId, itemId)
      .then((entries) => {
        if (!cancelled) {
          replaceEntries(entries);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadErrorMessage(
            formatAppErrorMessageForUI(
              error,
              "Unable to load current item link permissions.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    driveId,
    hasLoadedOnce,
    isSupportedLinkTarget,
    itemId,
    open,
    replaceEntries,
    selectedDialogTab,
  ]);

  const prepareChangeSet = useCallback(
    (draft: IItemLinkPermissionDraftState, hasUnsavedChanges: boolean) => {
      if (!hasUnsavedChanges) {
        return null;
      }

      return createItemLinkPermissionChangeSet(originalEntries, draft);
    },
    [originalEntries],
  );

  const applyPreparedChanges = useCallback(
    async (changes: ReturnType<typeof createItemLinkPermissionChangeSet>) => {
      return applyItemLinkPermissionChanges(driveId!, itemId!, changes);
    },
    [driveId, itemId],
  );

  const reconcileAppliedEntries = useCallback(
    (
      entries: IItemLinkPermissionEntryForUI[],
      resetDraftState?: () => void,
    ) => {
      replaceEntries(entries);
      resetDraftState?.();
      setLoadErrorMessage(null);
    },
    [replaceEntries],
  );

  return {
    originalEntries,
    isLoadingPermissions,
    loadErrorMessage,
    resetLoadState,
    prepareChangeSet,
    applyPreparedChanges,
    reconcileAppliedEntries,
  };
};
