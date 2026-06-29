import type { IErrorResponseBody } from "./errorContracts";

/**
 * 权限弹窗共享的主体类型。
 *
 * `people / groups` 同时是当前 container dialog 的 tab 值，
 * item dialog 也继续复用这套基础分类。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * 三类 permission 共享的最小 identity 模型。
 *
 * 它描述的是从 Graph 的 `grantedToV2` / `grantedToIdentitiesV2`
 * 中提炼出来、可被前后端共同理解的一组稳定字段。
 */
export interface IGraphPermissionIdentity {
  /**
   * 当前 identity 属于 people 还是 groups。
   */
  principalType: PermissionTabValue;
  /**
   * Graph 原始对象上的稳定 object id。
   *
   * people 分支在某些读取结果里可能缺失，因此这里保持可选。
   */
  graphId?: string;
  /**
   * 界面展示用的主标题文本。
   */
  displayName: string;
  /**
   * 界面展示用的副文本，通常取 email、UPN 或其他更适合辅助识别的字段。
   */
  description: string;
  /**
   * 用户或组的 mail 信息。
   */
  mail?: string;
  /**
   * 用户的 userPrincipalName。
   *
   * people 分支在后续写回 Graph 时还可能需要它，因此显式保留。
   */
  userPrincipalName?: string;
}

/**
 * Access List 权限记录共享的基础字段。
 *
 * container / item 都会复用这些字段；
 * scope-specific 的 role 与额外字段由各自契约继续扩展。
 */
export interface IPermissionEntryBaseForUI {
  /**
   * 前端列表渲染和本地草稿更新使用的稳定键。
   * 它不等同于 Graph principal id，而是当前模块约定好的“列表行标识”。
   */
  id: string;
  /**
   * Graph 权限记录的稳定标识。
   * 只有已经存在于后端数据源中的权限记录才会有它，新草稿项在创建前可以为空。
   */
  permissionId?: string;
  /**
   * principal 的稳定标识。
   * groups 一般是真实 group object id；people 在读回时可能退化成后端生成的 fallback id。
   */
  principalId: string;
  /**
   * people 分支在新增或更新写回时需要保留 `userPrincipalName`。
   * groups 分支不依赖它，但保留该字段可以让共享草稿层不需要知道具体 scope。
   */
  principalUserPrincipalName?: string;
  /**
   * 用户或组的 mail 信息。
   *
   * item invite 在 objectId 缺失时，可能会把它作为 recipient fallback。
   */
  principalMail?: string;
  /**
   * 用户或组的 object id。
   *
   * 对 groups 来说通常等于 `principalId`；
   * 对 people 读回时不一定稳定存在，所以单独保留更安全。
   */
  principalObjectId?: string;
  /**
   * 界面上显示的主标题，例如用户名或组名。
   */
  principalDisplayName: string;
  /**
   * 当前记录属于 people 还是 groups tab。
   */
  principalType: PermissionTabValue;
  /**
   * 界面展示用的副文本，例如 email、UPN 或组描述。
   */
  description: string;
  /**
   * 该权限是否来自上层继承。
   *
   * container 当前统一为 `false`；
   * item 会基于 effective permission 分类填充。
   */
  isInherited: boolean;
  /**
   * 当前行是否允许在本对话框中改角色。
   */
  isEditable: boolean;
  /**
   * 当前行是否允许在本对话框中删除。
   */
  isRemovable: boolean;
}

/**
 * 后端暴露给前端的稳定错误响应体。
 */
export type IPermissionApiErrorBody = IErrorResponseBody;
