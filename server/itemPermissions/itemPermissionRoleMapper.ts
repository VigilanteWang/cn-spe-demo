import { BackendValidationError } from "../common/errorDefinitions";
import type { ItemPermissionRoleForUI } from "../../common/contracts/itemPermissionCommonContracts";

/**
 * Microsoft Graph item permission 角色。
 */
type GraphItemPermissionRole = "read" | "write";

/**
 * 把 Graph 小写角色映射成 UI 角色。
 */
export const mapGraphItemPermissionRoleToUi = (
  role: string,
): ItemPermissionRoleForUI => {
  switch (role) {
    case "write":
      return "Writer";
    case "read":
    default:
      return "Reader";
  }
};

/**
 * 把 UI 角色映射回 Graph 小写角色。
 */
export const mapUiItemPermissionRoleToGraph = (
  role: ItemPermissionRoleForUI,
): GraphItemPermissionRole => {
  switch (role) {
    case "Writer":
      return "write";
    case "Reader":
      return "read";
    default:
      throw new BackendValidationError(
        `Unsupported item permission UI role: ${String(role)}`,
      );
  }
};
