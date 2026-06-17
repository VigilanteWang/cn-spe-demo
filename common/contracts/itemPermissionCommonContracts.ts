import type {
  IGraphPermissionIdentity,
  IPermissionEntryBaseForUI,
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

/**
 * link share 可支持的 scope。
 */
export type ItemLinkPermissionScope = "anonymous" | "organization" | "users";

/**
 * link share 可支持的类型。
 */
export type ItemLinkPermissionType = "view" | "edit" | "blocksDownload";

/**
 * 前端直接展示的 link 只读权限标签。
 */
export type ItemLinkPermissionRoleLabelForUI =
  | "View"
  | "Edit"
  | "Block download";

/**
 * link 当前可执行的后续操作能力。
 */
export interface IItemLinkPermissionCapabilitiesForUI {
  canGrantRecipients: boolean;
  canRevokeRecipients: boolean;
  canDeleteLink: boolean;
}

/**
 * 单条 link permission 的前端模型。
 */
export interface IItemLinkPermissionEntryForUI {
  id: string;
  permissionId: string;
  shareId?: string;
  webUrl: string;
  scope: ItemLinkPermissionScope;
  type: ItemLinkPermissionType;
  roleLabel: ItemLinkPermissionRoleLabelForUI;
  preventsDownload: boolean;
  grantedToIdentities: IGraphPermissionIdentity[];
  grantedToCount: number;
  capabilities: IItemLinkPermissionCapabilitiesForUI;
}

/**
 * item link permission 列表响应。
 */
export interface IItemLinkPermissionsResponseFromApi {
  entries: IItemLinkPermissionEntryForUI[];
}

/**
 * 新建 link change。
 */
export interface IItemLinkPermissionCreateChange {
  scope: ItemLinkPermissionScope;
  type: ItemLinkPermissionType;
  recipients?: IItemPermissionRecipientForUI[];
}

/**
 * 删除整条 link permission 的 change。
 */
export interface IItemLinkPermissionDeleteChange {
  permissionId: string;
}

/**
 * 为 users link 新增 recipients 的 change。
 */
export interface IItemLinkPermissionGrantRecipientsChange {
  permissionId: string;
  shareId: string;
  type: ItemLinkPermissionType;
  recipients: IItemPermissionRecipientForUI[];
}

/**
 * 为 users link 移除 recipients 的 change。
 */
export interface IItemLinkPermissionRevokeRecipientsChange {
  permissionId: string;
  shareId: string;
  recipients: IItemPermissionRecipientForUI[];
}

/**
 * item link permission apply 请求体。
 */
export interface IApplyItemLinkPermissionChangesRequest {
  create: IItemLinkPermissionCreateChange[];
  deleteLinks: IItemLinkPermissionDeleteChange[];
  grantRecipients: IItemLinkPermissionGrantRecipientsChange[];
  revokeRecipients: IItemLinkPermissionRevokeRecipientsChange[];
}

/**
 * item link permission apply 响应体。
 */
export interface IApplyItemLinkPermissionChangesResponse {
  entries: IItemLinkPermissionEntryForUI[];
}
