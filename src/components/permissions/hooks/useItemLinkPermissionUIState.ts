import { useCallback, useEffect, useState } from "react";
import {
  ITEM_LINK_PERMISSION_SCOPE_VALUES,
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
    useState<ItemLinkPermissionScope>(ITEM_LINK_PERMISSION_SCOPE_VALUES[0]);
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
    setCreateLinkScope(ITEM_LINK_PERMISSION_SCOPE_VALUES[0]);
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

/**
 * 为 links 创建区解析下一个可用的 scope/type 组合。
 *
 * 选择顺序遵循“尽量少改动当前选择”的原则：
 * 1. 当前组合还能用时，直接保留当前 scope 和 type。
 * 2. 当前组合已占用时，优先只在当前 scope 下切换到下一个可用 type。
 * 3. 当前 scope 已经没有可用 type 时，再按常量顺序扫描其他 scope。
 * 4. 如果所有组合都已占满，则返回 null，让上层知道已经没有可新增的 link。
 *
 * @param entries 当前面板里已经存在的 link 条目，包含后端基线和前端草稿。
 * @param currentScope 当前创建区选中的 scope。
 * @param currentType 当前创建区选中的 type。
 * @returns 下一个可用的创建组合；如果所有组合都已占用，则返回 null。
 */
const resolveNextAvailableCreateLinkCombo = (
  entries: IItemLinkPermissionDerivedEntry[],
  currentScope: ItemLinkPermissionScope,
  currentType: ItemLinkPermissionType,
): { scope: ItemLinkPermissionScope; type: ItemLinkPermissionType } | null => {
  // 先把已存在的 scope:type 组合收敛成集合，方便后面统一做占用判断。
  const occupiedKeys = new Set(
    entries.map((entry) => createScopeTypeKey(entry.scope, entry.type)),
  );

  // 当前组合还没被占用时，不调整用户选择，直接继续使用它。
  if (!occupiedKeys.has(createScopeTypeKey(currentScope, currentType))) {
    return {
      scope: currentScope,
      type: currentType,
    };
  }

  // 当前组合已占用时，优先保留当前 scope，只在同一个 scope 下寻找下一个可用 type。
  const currentScopeAvailableType = ITEM_LINK_PERMISSION_TYPES.find(
    (type) => !occupiedKeys.has(createScopeTypeKey(currentScope, type)),
  );

  if (currentScopeAvailableType) {
    return {
      scope: currentScope,
      type: currentScopeAvailableType,
    };
  }

  // 当前 scope 已经没有空位后，再按既定顺序扫描其他 scope，取全局第一个可用组合。
  for (const scope of ITEM_LINK_PERMISSION_SCOPE_VALUES) {
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

  // 所有 scope:type 组合都已占用时，返回 null 交给上层处理“不可新增”的状态。
  return null;
};

const createScopeTypeKey = (
  scope: ItemLinkPermissionScope,
  type: ItemLinkPermissionType,
) => `${scope}:${type}`;
