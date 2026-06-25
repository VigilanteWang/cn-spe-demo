import { useCallback, useEffect, useState } from "react";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type {
  IItemLinkPermissionDiffState,
  IItemLinkPermissionEntryForUI,
} from "../models/itemLinkPermissionModels";
import type { IApplyItemLinkPermissionChangesRequest } from "../../../../common/contracts/itemPermissionCommonContracts";
import {
  applyItemLinkPermissionChanges,
  listItemLinkPermissions,
} from "../../../services/itemPermissionApi";
import {
  createEmptyItemLinkPermissionEntries,
  createItemLinkPermissionChangeSet,
} from "../services/itemLinkPermissionUiUtils";
import type { ItemPermissionDialogTabValue } from "../models/itemLinkPermissionModels";

interface IUseItemLinkPermissionApiRequestStateOptions {
  /** 对话框是否处于打开状态。 */
  open: boolean;
  /** 当前 item 所属 drive 的标识。 */
  driveId?: string;
  /** 当前 item 的标识。 */
  itemId?: string;
  /** 用来区分当前编辑目标的重置键。 */
  resetKey: string;
  /** 当前目标是否支持 item link permission。 */
  isSupportedLinkTarget: boolean;
  /** 当前弹窗选中的主 tab。 */
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
 * 1. 在 links tab 真正可见时懒加载后端已有的 link 权限。
 * 2. 基于“后端基线 + 前端差异”准备提交给后端的 change set。
 * 3. 在提交成功后用最新返回结果替换基线，并把本地差异重置回“已同步”状态。
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
  // 这份列表保存“最近一次被后端确认”的 links 基线，
  // 后续 diff 计算、Apply 前组装 change set 都必须以它为准。
  const [originalEntries, setOriginalEntries] = useState<
    IItemLinkPermissionEntryForUI[]
  >(createEmptyItemLinkPermissionEntries());
  // 记录本轮对话框会话里是否已经真正加载过一次 links，
  // 用来保证 links tab 只在第一次进入时懒加载，而不是每次切回都重新加载。
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // 控制 links 面板自身的加载中状态，只覆盖“读取已有 link 权限”这条请求。
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  // 保存 links 面板最近一次加载相关的用户可读错误文案。
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // 切换到新的 item 后，原先缓存的 links 基线和“已加载过”标记都必须作废，
    // 否则新目标会错误复用旧目标的懒加载结果。
    setOriginalEntries(createEmptyItemLinkPermissionEntries());
    setHasLoadedOnce(false);
  }, [resetKey]);

  /**
   * 用后端最新快照覆盖当前 links 基线，并标记已完成一次真实加载。
   */
  const replaceEntries = useCallback(
    (entries: IItemLinkPermissionEntryForUI[]) => {
      // 这里用 map 做一次浅拷贝，避免后续 diff 计算时直接修改到原始对象。
      setOriginalEntries(entries.map((entry) => ({ ...entry })));
      setHasLoadedOnce(true);
    },
    [],
  );

  /**
   * 把 links 懒加载状态完整重置回“未加载”。
   *
   * 关闭弹窗后重开同一个 item 时，需要重新从后端拿一份新快照，
   * 因此不能直接沿用上一次打开期间缓存下来的结果。
   */
  const resetLoadState = useCallback(() => {
    // 这个重置入口通常在对话框关闭或显式放弃 links 状态时调用，
    // 目的是让下一次打开时重新走完整的首次懒加载流程。
    setOriginalEntries(createEmptyItemLinkPermissionEntries());
    setHasLoadedOnce(false);
  }, []);

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

    // 这一轮 effect 对应一次“当前 item 的 links 首次加载尝试”。
    // 通过 cancelled 标记，避免旧请求在目标切换后把过期结果写回新状态。
    let cancelled = false;
    setIsLoadingPermissions(true);
    setLoadErrorMessage(null);

    // 拉取“后端当前确认过的 link 权限基线”，
    // 后续本地差异的计算和提交都基于这份基线展开。
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

  /**
   * 基于当前后端基线和本地 diff，生成后端 apply 接口需要的变更合同。
   *
   * @param diff links 面板当前累积的本地差异。
   * @param hasUnsavedChanges 当前是否真的存在待保存改动。
   * @returns 如果没有改动则返回 `null`；否则返回可直接提交的 change set。
   */
  const prepareChangeSet = useCallback(
    (diff: IItemLinkPermissionDiffState, hasUnsavedChanges: boolean) => {
      // 没有本地改动时直接返回 null，
      // 让调用方明确知道“这次无需发起 apply 请求”。
      if (!hasUnsavedChanges) {
        return null;
      }

      // 这里真正把“后端基线 + 前端差异”收敛成后端 apply 接口能理解的合同。
      return createItemLinkPermissionChangeSet(originalEntries, diff);
    },
    [originalEntries],
  );

  /**
   * 把已经准备好的 links change set 提交给后端 apply 接口。
   *
   * @param changes 基于当前后端基线和本地 diff 生成的变更合同。
   * @returns 后端应用完成后返回的最新 link 权限快照。
   */
  const applyPreparedChanges = useCallback(
    async (changes: IApplyItemLinkPermissionChangesRequest) => {
      // driveId 和 itemId 的存在性已经被调用路径保证，
      // 这里直接提交准备好的 change set。
      return applyItemLinkPermissionChanges(driveId!, itemId!, changes);
    },
    [driveId, itemId],
  );

  /**
   * 用 Apply 成功后的后端返回值重建 links 基线，并按需清掉本地 diff。
   *
   * @param entries 后端 apply 成功后返回的最新 link 权限快照。
   * @param resetDiffState 调用方传入的 diff 重置函数，用来把 UI 恢复为“已同步”状态。
   */
  const reconcileAppliedEntries = useCallback(
    (entries: IItemLinkPermissionEntryForUI[], resetDiffState?: () => void) => {
      // 提交成功后，后端返回的 entries 就是新的“已落库基线”。
      // 用它整体替换原基线，后续 diff 才会基于最新事实继续计算。
      replaceEntries(entries);
      // 差异里的新增、删除、grant、revoke 都已经被后端确认，
      // 这里把本地差异清空，让 UI 回到“没有待保存改动”的状态。
      resetDiffState?.();
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
