import { useCallback, useEffect, useState } from "react";
import type { IItemLinkPermissionEntryForUI } from "../models/itemLinkPermissionModels";
import { createEmptyItemLinkPermissionEntries } from "../services/itemLinkPermissionUiUtils";

/**
 * 管理 links 面板最近一次后端确认快照与懒加载状态。
 *
 * people/groups 当前仍是“弹窗一打开就加载”，
 * links 改成“切到 Links tab 时再首次加载”，因此单独抽出这份状态更清楚。
 */
export const useItemLinkPermissionLoadState = (resetKey: string) => {
  const [originalEntries, setOriginalEntries] = useState<
    IItemLinkPermissionEntryForUI[]
  >(createEmptyItemLinkPermissionEntries());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    setOriginalEntries(createEmptyItemLinkPermissionEntries());
    setHasLoadedOnce(false);
  }, [resetKey]);

  /**
   * 用后端最新快照覆盖当前 links 基线，并标记为已经完成一次真实加载。
   */
  const replaceEntries = useCallback(
    (entries: IItemLinkPermissionEntryForUI[]) => {
      setOriginalEntries(entries.map((entry) => ({ ...entry })));
      setHasLoadedOnce(true);
    },
    [],
  );

  /**
   * 把 links 懒加载状态完整重置回“未加载”。
   *
   * 关闭弹窗后重开同一个 item 时，需要重新从后端拿一份新快照，
   * 因此不能简单沿用上一次打开期间缓存下来的结果。
   */
  const reset = useCallback(() => {
    setOriginalEntries(createEmptyItemLinkPermissionEntries());
    setHasLoadedOnce(false);
  }, []);

  return {
    originalEntries,
    hasLoadedOnce,
    replaceEntries,
    reset,
  };
};
