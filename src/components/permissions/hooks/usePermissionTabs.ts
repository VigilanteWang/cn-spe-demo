import { useState } from "react";
import type { PermissionTabValue } from "../models/permissionSharedModels";

/**
 * 管理权限 Dialog 的页签切换状态。
 *
 * 这里单独拆成 Hook，是为了让页签状态和草稿状态分离，方便组合复用。
 */
export const usePermissionTabs = (
  initialTab: PermissionTabValue = "people",
) => {
  // selectedTab 决定当前界面正在编辑 People 还是 Groups。
  const [selectedTab, setSelectedTab] =
    useState<PermissionTabValue>(initialTab);

  return {
    selectedTab,
    setSelectedTab,
  };
};
