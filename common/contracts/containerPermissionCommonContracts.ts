import type { IPermissionEntryBaseForUI } from "./permissionCommonContracts";

/**
 * 容器权限模块在前后端之间共享的主体类型。
 *
 * 这里存放的是“通过 HTTP 直接交换的稳定契约”，
 * 目的是让前端和后端都围绕同一套字段名与结构协作，
 * 而不是各自维护一份看起来一样、实际上容易慢慢漂移的重复定义。
 */
export type { PermissionTabValue } from "./permissionCommonContracts";

/**
 * 容器级权限角色。
 *
 * 这里保留前端界面直接展示的首字母大写形式，
 * 后端与 Graph 之间的小写角色映射由专门的 role mapper 负责。
 */
export type ContainerPermissionRoleForUI =
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
export interface IContainerPermissionEntryForUI
  extends IPermissionEntryBaseForUI {
  /**
   * 当前容器权限角色。
   */
  role: ContainerPermissionRoleForUI;
}

/**
 * 后端读取或 apply 完成后返回给前端的响应体。
 */
export interface IContainerPermissionsResponseFromApi {
  entries: IContainerPermissionEntryForUI[];
}

/**
 * people 新增权限差异。
 *
 * Graph 创建用户权限时要求传 userPrincipalName，
 * 所以共同契约里也必须把这个字段显式收紧。
 */
export interface IPeopleContainerPermissionCreateChange {
  principalType: "people";
  principalId: string;
  userPrincipalName: string;
  role: ContainerPermissionRoleForUI;
}

/**
 * groups 新增权限差异。
 *
 * Graph 创建组权限时继续使用稳定的 group id。
 */
export interface IGroupContainerPermissionCreateChange {
  principalType: "groups";
  principalId: string;
  role: ContainerPermissionRoleForUI;
}

export type IContainerPermissionCreateChange =
  | IPeopleContainerPermissionCreateChange
  | IGroupContainerPermissionCreateChange;

/**
 * 已有权限记录改角色时提交给后端的差异项。
 */
export interface IContainerPermissionUpdateChange {
  permissionId: string;
  role: ContainerPermissionRoleForUI;
}

/**
 * 删除已有权限记录时提交给后端的差异项。
 */
export interface IContainerPermissionRemoveChange {
  permissionId: string;
}

/**
 * 前端草稿相对原始快照计算出来的完整差异集。
 */
export interface IContainerPermissionChangeSetFromUI {
  create: IContainerPermissionCreateChange[];
  update: IContainerPermissionUpdateChange[];
  remove: IContainerPermissionRemoveChange[];
}
