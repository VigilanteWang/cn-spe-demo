import { useState } from "react";
import type { PermissionTabValue } from "../models/permissionSharedModels";

/**
 * 管理权限弹窗的页签切换状态。
 *
 * 单独拆成 Hook 后，页签状态就可以和草稿状态解耦，
 * 方便容器权限与 Item 权限两类弹窗复用同一套行为。
 */
export const usePermissionTabs = (
  initialTab: PermissionTabValue = "people",
) => {
  // `selectedTab` 决定当前界面正在编辑 People 还是 Groups。
  const [selectedTab, setSelectedTab] =
    useState<PermissionTabValue>(initialTab);

  return {
    selectedTab,
    setSelectedTab,
  };
};
