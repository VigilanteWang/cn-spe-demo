/**
 * 这个文件专门负责容器权限角色名在“共同契约”和“Microsoft Graph”之间的双向映射。
 *
 * 之所以单独拆出来，是因为角色名虽然看起来只是大小写不同，
 * 但它本质上属于一个明确的协议边界：
 * 1. 前端和共同契约使用 `Reader / Writer / Manager / Owner`
 * 2. Graph 接口使用 `reader / writer / manager / owner / principalOwner`
 *
 * 把映射规则集中在这里，可以避免角色转换逻辑散落到 handler、adapter 或 parser 中。
 */
import type { ContainerPermissionRoleForUI } from "../../common/contracts/containerPermissionCommonContracts";

/**
 * Microsoft Graph fileStorageContainer 权限角色名。
 *
 * `principalOwner` 是 Graph 列表响应里可能出现的特殊角色，
 * 但当前 UI 没有单独暴露它，所以统一折叠成 `Owner` 展示。
 */
export type GraphContainerPermissionRole =
  | "reader"
  | "writer"
  | "manager"
  | "owner"
  | "principalOwner";

// Graph -> UI 的读取方向映射。
const graphToUiRoleMap: Record<
  GraphContainerPermissionRole,
  ContainerPermissionRoleForUI
> = {
  reader: "Reader",
  writer: "Writer",
  manager: "Manager",
  owner: "Owner",
  principalOwner: "Owner",
};

// UI -> Graph 的写回方向映射。
// 这里不会产生 principalOwner，因为当前产品层没有单独编辑这个角色的入口。
const uiToGraphRoleMap: Record<
  ContainerPermissionRoleForUI,
  Exclude<GraphContainerPermissionRole, "principalOwner">
> = {
  Reader: "reader",
  Writer: "writer",
  Manager: "manager",
  Owner: "owner",
};

/**
 * 把 Graph 角色名映射成共同契约里的 UI 角色名。
 */
export const mapGraphContainerPermissionRoleToUi = (
  graphRole: string,
): ContainerPermissionRoleForUI => {
  // Graph SDK 在这里给到的仍然是动态字符串，所以先按 Graph 角色集合尝试收口。
  const normalizedRole = graphRole as GraphContainerPermissionRole;
  const mappedRole = graphToUiRoleMap[normalizedRole];

  if (!mappedRole) {
    throw new Error(
      `Unsupported Graph container permission role: ${graphRole}`,
    );
  }

  return mappedRole;
};

/**
 * 把共同契约里的角色名映射回 Graph PATCH/POST 使用的角色名。
 */
export const mapUiContainerPermissionRoleToGraph = (
  uiRole: ContainerPermissionRoleForUI,
): Exclude<GraphContainerPermissionRole, "principalOwner"> => {
  return uiToGraphRoleMap[uiRole];
};
