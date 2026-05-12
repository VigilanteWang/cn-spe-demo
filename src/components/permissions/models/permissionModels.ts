/**
 * 容器权限页签值。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * 容器级权限角色。
 *
 * 当前前端继续使用 UI 友好的首字母大写角色名，
 * 与 Graph 原始角色名之间的映射收敛到单独模块处理。
 */
export type ContainerPermissionRole = "Reader" | "Writer" | "Manager" | "Owner";

/**
 * 下拉搜索候选项。
 *
 * 说明：
 * - 真实目录搜索结果会先统一成这份模型。
 * - Dialog 只关心如何渲染与选择，不需要知道原始结果来自哪一种 Graph 查询。
 */
export interface IPermissionPrincipalCandidate {
  /** 候选 principal 的稳定标识。 */
  id: string;
  /** 下拉列表和表格里显示的 principal 名称。 */
  name: string;
  /** 候选 principal 属于 people 还是 groups。 */
  type: PermissionTabValue;
  /** 候选项的次要说明文本，优先显示 email、UPN 或组描述等辅助信息。 */
  secondaryText: string;
  /** 只用于 Avatar 的首字母缩写。 */
  initials: string;
  /**

   * 当候选项是用户时，对应的 userPrincipalName。
   *
   * Graph 的容器权限创建接口在新增用户权限时要求提供这个字段，
   * 因此它需要沿着“搜索结果 -> 草稿条目 -> Apply 差异”这条链路被保留下来。
   */
  userPrincipalName?: string;
}

/**
 * 容器权限访问项。
 *
 * 说明：
 * - `principalId`：people tab 存放基于 UPN 的合成 id，groups tab 存放 AAD group object id。
 * - `permissionId` 对应已有的容器权限记录，用于 update / delete。
 * - `role` 表示当前草稿中的容器级角色。
 */
export interface IContainerPermissionEntry {
  /** 当前权限记录在前端列表中的唯一键。 */
  id: string;
  /** 对应后端 / Graph 权限记录的稳定标识，用于更新和删除。 */
  permissionId?: string;
  /** people tab: 基于 UPN 的合成 id；groups tab: AAD group object id。 */
  principalId: string;
  /** 当该条权限对应用户时，保留下来的 userPrincipalName。 */
  principalUserPrincipalName?: string;
  /** 表格中显示的 principal 名称。 */
  principalName: string;
  /** 当前权限记录属于 people 还是 groups 页签。 */
  principalType: PermissionTabValue;
  /** 用于展示的辅助说明文本。 */
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
