/**
 * 容器权限的 UI 角色名。
 *
 * 前端下拉框使用的是首字母大写文案，
 * 这里集中管理它和 Graph 返回值之间的互相映射。
 */
export type ContainerPermissionUiRole =
  | "Reader"
  | "Writer"
  | "Manager"
  | "Owner";

/**
 * Microsoft Graph fileStorageContainer 权限角色名。
 *
 * `principalOwner` 是 Graph 列表示例里出现的特殊角色。
 * UI 目前没有单独暴露它，所以统一收敛到 `Owner` 展示。
 */
export type GraphContainerPermissionRole =
  | "reader"
  | "writer"
  | "manager"
  | "owner"
  | "principalOwner";

const graphToUiRoleMap: Record<
  GraphContainerPermissionRole,
  ContainerPermissionUiRole
> = {
  reader: "Reader",
  writer: "Writer",
  manager: "Manager",
  owner: "Owner",
  principalOwner: "Owner",
};

const uiToGraphRoleMap: Record<
  ContainerPermissionUiRole,
  Exclude<GraphContainerPermissionRole, "principalOwner">
> = {
  Reader: "reader",
  Writer: "writer",
  Manager: "manager",
  Owner: "owner",
};

/**
 * 把 Graph 角色名映射成 UI 角色名。
 */
export const mapGraphContainerPermissionRoleToUi = (
  graphRole: string,
): ContainerPermissionUiRole => {
  const normalizedRole = graphRole as GraphContainerPermissionRole;
  const mappedRole = graphToUiRoleMap[normalizedRole];

  if (!mappedRole) {
    throw new Error(`Unsupported Graph container permission role: ${graphRole}`);
  }

  return mappedRole;
};

/**
 * 把 UI 角色名映射回 Graph PATCH/POST 使用的角色名。
 */
export const mapUiContainerPermissionRoleToGraph = (
  uiRole: ContainerPermissionUiRole,
): Exclude<GraphContainerPermissionRole, "principalOwner"> => {
  return uiToGraphRoleMap[uiRole];
};
