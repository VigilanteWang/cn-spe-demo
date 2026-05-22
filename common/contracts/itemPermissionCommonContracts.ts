import type {
  IPermissionApiErrorBody,
  IPermissionEntryBaseForUI,
  PermissionApiErrorCode,
} from "./permissionCommonContracts";

/**
 * item dialog 当前只暴露两种可编辑角色。
 */
export type ItemPermissionRoleForUI = "Reader" | "Writer";

/**
 * item 权限行。
 *
 * 这里沿用共享基础字段，再补上 item 自己的 role。
 */
export interface IItemPermissionEntryForUI extends IPermissionEntryBaseForUI {
  role: ItemPermissionRoleForUI;
}

/**
 * item 权限列表响应。
 */
export interface IItemPermissionsResponseFromApi {
  entries: IItemPermissionEntryForUI[];
}

/**
 * item invite / update fallback 需要的 recipient 信息。
 *
 * 这里不直接暴露 Graph 的 driveRecipient 名称，
 * 而是把前后端真正稳定协作需要的三种候选标识收口成共同契约。
 */
export interface IItemPermissionRecipientForUI {
  recipientObjectId?: string;
  recipientEmail?: string;
  recipientAlias?: string;
}

/**
 * item create change。
 */
export interface IItemPermissionCreateChange
  extends IItemPermissionRecipientForUI {
  principalType: "people" | "groups";
  principalId: string;
  role: ItemPermissionRoleForUI;
}

/**
 * item update change。
 *
 * 和 container 不同，这里会额外保留 recipient 信息，
 * 这样当后端需要走“删除旧显式权限，再重建新显式权限”时，
 * 无需再反查前端本地状态或依赖服务端内存。
 */
export interface IItemPermissionUpdateChange
  extends IItemPermissionRecipientForUI {
  permissionId: string;
  principalType: "people" | "groups";
  principalId: string;
  role: ItemPermissionRoleForUI;
}

/**
 * item remove change。
 */
export interface IItemPermissionRemoveChange {
  permissionId: string;
}

/**
 * item apply 变更集。
 */
export interface IItemPermissionChangeSetFromUI {
  create: IItemPermissionCreateChange[];
  update: IItemPermissionUpdateChange[];
  remove: IItemPermissionRemoveChange[];
}

export type ItemPermissionsApiErrorCode = PermissionApiErrorCode;

/**
 * item 权限 API 的稳定错误响应体。
 */
export interface IItemPermissionsApiErrorBody extends IPermissionApiErrorBody {}
