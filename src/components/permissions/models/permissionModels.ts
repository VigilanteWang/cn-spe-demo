/**
 * 容器权限页签值。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * 容器级权限角色。
 *
 * 本步骤先与 UI 展示保持一致，直接使用最终要显示的角色名。
 */
export type ContainerPermissionRole = "Reader" | "Writer" | "Manager" | "Owner";

/**
 * 本地 principal 候选项。
 *
 * 说明：
 * - 本步骤只使用本地假数据驱动交互。
 * - 后续接入 Graph 搜索时，可以继续复用这个基础模型。
 */
export interface IPermissionPrincipalCandidate {
  /** 候选 principal 的稳定标识。 */
  id: string;
  /** 下拉列表和表格里展示的 principal 名称。 */
  name: string;
  /** 候选 principal 属于 people 还是 groups。 */
  type: PermissionTabValue;
  /** 用于辅助筛选和展示的描述信息。 */
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
  /** 当前权限记录在前端列表中的唯一键。 */
  id: string;
  /** 对应真实 principal 的稳定标识，用于防止重复添加。 */
  principalId: string;
  /** 表格中展示的 principal 名称。 */
  principalName: string;
  /** 当前权限记录属于 people 还是 groups 页签。 */
  principalType: PermissionTabValue;
  /** 表格筛选和说明区使用的描述信息。 */
  description: string;
  /** 当前草稿中的容器权限角色。 */
  role: ContainerPermissionRole;
}

/**
 * 按页签分组的权限列表。
 */
export type PermissionEntriesByTab = Record<
  PermissionTabValue,
  IContainerPermissionEntry[]
>;
