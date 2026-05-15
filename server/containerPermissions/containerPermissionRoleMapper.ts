import type { ContainerPermissionRole } from "../../common/contracts/containerPermissionCommonContracts";

/**
 * Microsoft Graph fileStorageContainer 权限角色名。
 *
 * `principalOwner` 是 Graph 列表示例里会出现的特殊角色，
 * 但当前 UI 没有单独暴露它，所以统一折叠成 `Owner` 展示。
 */
export type GraphContainerPermissionRole =
  | "reader"
  | "writer"
  | "manager"
  | "owner"
  | "principalOwner";

const graphToUiRoleMap: Record<
  GraphContainerPermissionRole,
  ContainerPermissionRole
> = {
  reader: "Reader",
  writer: "Writer",
  manager: "Manager",
  owner: "Owner",
  principalOwner: "Owner",
};

const uiToGraphRoleMap: Record<
  ContainerPermissionRole,
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
): ContainerPermissionRole => {
  const normalizedRole = graphRole as GraphContainerPermissionRole;
  const mappedRole = graphToUiRoleMap[normalizedRole];

  if (!mappedRole) {
    throw new Error(`Unsupported Graph container permission role: ${graphRole}`);
  }

  return mappedRole;
};

/**
 * 把共同契约里的角色名映射回 Graph PATCH/POST 使用的角色名。
 */
export const mapUiContainerPermissionRoleToGraph = (
  uiRole: ContainerPermissionRole,
): Exclude<GraphContainerPermissionRole, "principalOwner"> => {
  return uiToGraphRoleMap[uiRole];
};
