/**
 * 容器权限页签值。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * 容器级权限角色。
 *
 * 当前阶段先保持与 UI 展示一致，直接使用最终会显示给用户的角色名。
 */
export type ContainerPermissionRole = "Reader" | "Writer" | "Manager" | "Owner";

/**
 * 下拉搜索候选项。
 *
 * 说明：
 * - 本地假数据和真实 Graph 搜索结果都会先统一成这个模型。
 * - 这样 Dialog 只关心如何渲染与选择，不需要知道原始数据来自哪里。
 */
export interface IPermissionPrincipalCandidate {
  /** 候选 principal 的稳定标识。 */
  id: string;
  /** 下拉列表和表格里展示的 principal 名称。 */
  name: string;
  /** 候选 principal 属于 people 还是 groups。 */
  type: PermissionTabValue;
  /** 下拉候选项的次文本，优先显示 email 等目录辅助信息。 */
  secondaryText: string;
  /** 只用于 Avatar 的首字母缩写。 */
  initials: string;
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
  /** 用于后续展示或筛选的辅助说明文本。 */
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
