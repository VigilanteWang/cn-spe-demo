import type { ApiErrorCode, IApiErrorResponseBody } from "./apiErrorContracts";

/**
 * 权限弹窗共享的主体类型。
 *
 * people / groups 同时是当前 container dialog 的 tab 值，
 * 未来 item dialog 也会继续复用这套基础分类。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * item-level 未来会用到的继承来源分类。
 *
 * 这里先预留一个“正式前端语义”，
 * 避免后续直接把 Graph 的 `inheritedFrom` 原样泄漏到 UI 契约里。
 */
export type PermissionInheritanceSource = "parent" | "container" | "unknown";

/**
 * Access List 一行权限记录共享的基础字段。
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
   * people 分支在新增写回时需要保留 userPrincipalName。
   * groups 分支不依赖它，但保留该字段可以让共享草稿层不需要知道具体 scope。
   */
  principalUserPrincipalName?: string;
  /**
   * 用户或组的 mail 信息。
   *
   * 未来 item invite 可能需要在 objectId 缺失时把它作为 recipient fallback。
   */
  principalMail?: string;
  /**
   * 用户或组的 object id。
   *
   * 对 groups 来说通常等于 principalId；
   * 对 people 读回时不一定稳定存在，所以单独保留更安全。
   */
  principalObjectId?: string;
  /**
   * 界面上显示的主标题，例如用户名或组名。
   */
  principalName: string;
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
   * container 当前统一为 false；
   * item 未来会基于 effective permission 分类填充。
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
  /**
   * 继承来源的内部分类。
   *
   * 它是产品语义层的预留字段，不直接等价于 Graph 原始字段名。
   */
  inheritanceSource?: PermissionInheritanceSource;
}

export type PermissionApiErrorCode = Extract<
  ApiErrorCode,
  | "invalidRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "throttled"
  | "serviceUnavailable"
  | "graphFailure"
>;

/**
 * 后端暴露给前端的稳定错误响应体。
 */
export interface IPermissionApiErrorBody
  extends Omit<IApiErrorResponseBody, "code"> {
  code: PermissionApiErrorCode;
}
