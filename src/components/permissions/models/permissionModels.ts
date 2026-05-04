/**
 * 容器权限页签值。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * 容器级权限角色。
 *
 * 本步骤先与 UI 展示保持一致，直接使用最终要显示的角色名。
 */
export type ContainerPermissionRole =
  | "Reader"
  | "Writer"
  | "Manager"
  | "Owner";

/**
 * 本地主体候选项。
 *
 * 说明：
 * - 本步骤只使用本地假数据驱动交互。
 * - 后续接入 Graph 搜索时，可以继续复用这个基础模型。
 */
export interface IPermissionPrincipalCandidate {
  id: string;
  name: string;
  type: PermissionTabValue;
  description: string;
}

/**
 * 容器权限访问项。
 *
 * 说明：
 * - principalId 对应用户或组的稳定标识。
 * - role 表示当前草稿中的容器级角色。
 */
export interface IContainerPermissionEntry {
  id: string;
  principalId: string;
  principalName: string;
  principalType: PermissionTabValue;
  description: string;
  role: ContainerPermissionRole;
}

/**
 * 按页签分组的权限列表。
 */
export type PermissionEntriesByTab = Record<
  PermissionTabValue,
  IContainerPermissionEntry[]
>;
