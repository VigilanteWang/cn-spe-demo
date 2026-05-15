/**
 * 容器权限模块在前后端之间共享的主体类型。
 *
 * 这里存放的是“通过 HTTP 直接交换的稳定契约”，
 * 目的是让前端和后端都围绕同一套字段名与结构协作，
 * 而不是各自维护一份看起来一样、实际上容易慢慢漂移的重复定义。
 */
export type PermissionTabValue = "people" | "groups";

/**
 * 容器级权限角色。
 *
 * 这里保留前端界面直接展示的首字母大写形式，
 * 后端与 Graph 之间的小写角色映射由专门的 role mapper 负责。
 */
export type ContainerPermissionRole =
  | "Reader"
  | "Writer"
  | "Manager"
  | "Owner";

/**
 * Access List 里的一行权限记录。
 *
 * 这份结构会被后端返回给前端，也会被前端草稿态和 diff 逻辑直接复用，
 * 因此它属于真正的“共同契约”。
 */
export interface IContainerPermissionEntry {
  /**
   * 前端列表渲染和本地草稿更新使用的稳定键。
   * 它不等同于 Graph principal id，而是当前模块约定好的“列表行标识”。
   */
  id: string;
  /**
   * Graph 权限记录的稳定标识。
   * 只有已经存在于容器中的权限记录才会有它，新草稿项在创建前可以为空。
   */
  permissionId?: string;
  /**
   * principal 的稳定标识。
   * groups 一般是真实 group object id；people 在读回时可能退化成后端生成的 fallback id。
   */
  principalId: string;
  /**
   * people 分支在新增写回时需要保留 userPrincipalName。
   * groups 分支不使用该字段。
   */
  principalUserPrincipalName?: string;
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
   * 当前容器权限角色。
   */
  role: ContainerPermissionRole;
}

/**
 * 后端读取或 apply 完成后返回给前端的响应体。
 */
export interface IContainerPermissionsResponse {
  entries: IContainerPermissionEntry[];
}

/**
 * people 新增权限差异。
 *
 * Graph 创建用户权限时要求传 userPrincipalName，
 * 所以共同契约里也必须把这个字段显式收紧。
 */
export interface ICreatePeopleContainerPermissionChange {
  principalType: "people";
  principalId: string;
  userPrincipalName: string;
  role: ContainerPermissionRole;
}

/**
 * groups 新增权限差异。
 *
 * Graph 创建组权限时继续使用稳定的 group id。
 */
export interface ICreateGroupContainerPermissionChange {
  principalType: "groups";
  principalId: string;
  role: ContainerPermissionRole;
}

export type ICreateContainerPermissionChange =
  | ICreatePeopleContainerPermissionChange
  | ICreateGroupContainerPermissionChange;

/**
 * 已有权限记录改角色时提交给后端的差异项。
 */
export interface IUpdateContainerPermissionChange {
  permissionId: string;
  role: ContainerPermissionRole;
}

/**
 * 删除已有权限记录时提交给后端的差异项。
 */
export interface IDeleteContainerPermissionChange {
  permissionId: string;
}

/**
 * 前端草稿相对原始快照计算出来的完整差异集。
 */
export interface IContainerPermissionChangeSet {
  create: ICreateContainerPermissionChange[];
  update: IUpdateContainerPermissionChange[];
  remove: IDeleteContainerPermissionChange[];
}

export type ContainerPermissionsErrorCode =
  | "invalidRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "throttled"
  | "serviceUnavailable"
  | "graphFailure";

/**
 * 后端暴露给前端的稳定错误响应体。
 */
export interface IContainerPermissionsApiErrorBody {
  code: ContainerPermissionsErrorCode;
  message: string;
  retryAfterSeconds?: number;
  requestId?: string;
  statusCode?: number;
}
