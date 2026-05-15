import type {
  IContainerPermissionEntry,
  PermissionTabValue,
} from "../../../../common/contracts/containerPermissionCommonContracts";

export type {
  ContainerPermissionRole,
  IContainerPermissionEntry,
  PermissionTabValue,
} from "../../../../common/contracts/containerPermissionCommonContracts";

/**
 * 搜索下拉菜单中的候选项。
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
   * Graph 的添加容器权限接口在新增用户权限时要求提供这个字段，
   * 因此它需要沿着“搜索结果 -> 草稿条目 -> Apply 差异”这条链路被保留下来。
   */
  userPrincipalName?: string;
}

/**
 * 按页签分组的权限列表。
 */
export type PermissionEntriesByTab = Record<
  PermissionTabValue,
  IContainerPermissionEntry[]
>;
