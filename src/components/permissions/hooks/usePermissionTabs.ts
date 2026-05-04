import { useState } from "react";
import { PermissionTabValue } from "../models/permissionModels";

/**
 * 管理权限 Dialog 的页签切换状态。
 */
export const usePermissionTabs = (
  initialTab: PermissionTabValue = "people",
) => {
  const [selectedTab, setSelectedTab] = useState<PermissionTabValue>(initialTab);

  return {
    selectedTab,
    setSelectedTab,
  };
};
