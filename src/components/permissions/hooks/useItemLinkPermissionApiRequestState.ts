import { useCallback, useEffect, useState } from "react";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type {
  IItemLinkPermissionDraftState,
  IItemLinkPermissionEntryForUI,
} from "../models/itemLinkPermissionModels";
import type { IApplyItemLinkPermissionChangesRequest } from "../../../../common/contracts/itemPermissionCommonContracts";
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
 * `useItemLinkPermissionApiRequestState` 的输入参数。
 *
 * @property open 对话框当前是否处于打开状态。
 * @property driveId 当前文件所属 drive 的标识。
 * @property itemId 当前文件项的标识。
 * @property resetKey 用于区分“当前正在编辑的是哪一个文件项”的重置键。
 * @property isSupportedLinkTarget 当前文件是否支持 link permission 能力。
 * @property selectedDialogTab 当前对话框选中的页签。
 */

/**
 * 管理 item link 权限的请求生命周期。
 *
 * 这个 Hook 主要负责三件事：
 * 1. 在 links 页签真正可见时懒加载后端已有的 link 权限。
 * 2. 基于“后端基线 + 前端草稿”准备提交给后端的 change set。
 * 3. 在提交成功后用最新返回结果替换基线，并把草稿重置回“已同步”状态。
 *
 * @param options 当前对话框、目标文件项和页签相关的上下文信息。
 * @returns 提供 links 面板读取、提交和提交后对账所需的状态与方法。
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
    // 只有 links 页签真正打开、目标项完整可用、且当前文件支持 link 权限时，
    // 才触发第一次懒加载；避免对其它页签做无意义请求。
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

    // 拉取“后端当前确认过的 link 权限基线”，
    // 后续草稿 diff 和提交都基于这份基线展开。
    void listItemLinkPermissions(driveId, itemId)
      .then((entries) => {
        if (!cancelled) {
          replaceEntries(entries);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          // 这里保留统一 UI 错误格式，避免 links 页签出现原始异常文本。
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
      // 对话框关闭、页签切换或依赖变化后，阻止旧请求回写到新一轮状态里。
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
      // 没有本地改动时直接返回 null，
      // 让调用方明确知道“这次无需发起 apply 请求”。
      if (!hasUnsavedChanges) {
        return null;
      }

      // 这里真正把“后端基线 + 前端草稿”收敛成后端 apply 接口能理解的合同。
      return createItemLinkPermissionChangeSet(originalEntries, draft);
    },
    [originalEntries],
  );

  const applyPreparedChanges = useCallback(
    async (changes: IApplyItemLinkPermissionChangesRequest) => {
      // driveId 和 itemId 的存在性已经被调用路径保证，
      // 这里直接提交准备好的 change set。
      return applyItemLinkPermissionChanges(driveId!, itemId!, changes);
    },
    [driveId, itemId],
  );

  const reconcileAppliedEntries = useCallback(
    (
      entries: IItemLinkPermissionEntryForUI[],
      resetDraftState?: () => void,
    ) => {
      // 提交成功后，后端返回的 entries 就是新的“已落库基线”。
      // 用它整体替换原基线，后续 diff 才会基于最新事实继续计算。
      replaceEntries(entries);
      // 草稿里的新增、删除、grant、revoke 都已经被后端确认，
      // 这里把本地草稿清空，让 UI 回到“没有待保存改动”的状态。
      resetDraftState?.();
      // 请求成功后顺手清掉旧的加载错误，避免界面残留过期提示。
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
