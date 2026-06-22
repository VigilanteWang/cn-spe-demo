import type {
  IGraphPermissionIdentity,
  IPermissionEntryBaseForUI,
  PermissionTabValue,
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
export interface IItemUserPermissionEntryForUI
  extends IPermissionEntryBaseForUI {
  role: ItemPermissionRoleForUI;
}

/**
 * item 权限列表响应。
 */
export interface IItemUserPermissionsResponseFromApi {
  entries: IItemUserPermissionEntryForUI[];
}

/**
 * item invite / update fallback 需要的 recipient 信息。
 *
 * 这里不直接暴露 Graph 的 driveRecipient 名称，
 * 而是把前后端真正稳定协作需要的三种候选标识收口成共同契约。
 */
export interface IItemUserPermissionRecipientForUI {
  recipientObjectId?: string;
  recipientEmail?: string;
  recipientAlias?: string;
}

/**
 * item create change。
 */
export interface IItemUserPermissionCreateChange
  extends IItemUserPermissionRecipientForUI {
  principalType: PermissionTabValue;
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
export interface IItemUserPermissionUpdateChange
  extends IItemUserPermissionRecipientForUI {
  permissionId: string;
  principalType: PermissionTabValue;
  principalId: string;
  role: ItemPermissionRoleForUI;
}

/**
 * item remove change。
 */
export interface IItemUserPermissionRemoveChange {
  permissionId: string;
}

/**
 * item apply 变更集。
 */
export interface IItemUserPermissionChangeSetFromUI {
  create: IItemUserPermissionCreateChange[];
  update: IItemUserPermissionUpdateChange[];
  remove: IItemUserPermissionRemoveChange[];
}

/**
 * link share 的 scope 真值映射。
 *
 * 说明：
 * - 产品语义上我们仍然把“指定对象链接”叫作 `specific`
 * - 但 Graph / wire contract 真正使用的枚举值已经切到 `user`
 * - 这样其它层可以继续通过 `ITEM_LINK_PERMISSION_SCOPES.specific`
 *   保留可读命名，而不会把 UI 文案和底层值绑死
 */
export const ITEM_LINK_PERMISSION_SCOPES = {
  anonymous: "anonymous",
  organization: "organization",
  specific: "users",
} as const;

/**
 * link share scope 的稳定枚举顺序。
 */
export const ITEM_LINK_PERMISSION_SCOPE_VALUES = [
  ITEM_LINK_PERMISSION_SCOPES.anonymous,
  ITEM_LINK_PERMISSION_SCOPES.organization,
  ITEM_LINK_PERMISSION_SCOPES.specific,
] as const;

export type ItemLinkPermissionScope =
  (typeof ITEM_LINK_PERMISSION_SCOPE_VALUES)[number];

/**
 * link share 可支持的类型。
 */
export const ITEM_LINK_PERMISSION_TYPES = [
  "view",
  "edit",
  "review",
  "blocksDownload",
] as const;

export type ItemLinkPermissionType =
  (typeof ITEM_LINK_PERMISSION_TYPES)[number];

/**
 * link type 到前端只读权限标签的唯一映射表。
 */
export const ITEM_LINK_PERMISSION_ROLE_LABELS = {
  view: "View",
  edit: "Edit",
  review: "Review",
  blocksDownload: "Block download",
} as const satisfies Record<ItemLinkPermissionType, string>;

/**
 * 前端直接展示的 link 只读权限标签。
 */
export type ItemLinkPermissionRoleLabelForUI =
  (typeof ITEM_LINK_PERMISSION_ROLE_LABELS)[ItemLinkPermissionType];

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
  recipients?: IItemUserPermissionRecipientForUI[];
}

/**
 * 删除整条 link permission 的 change。
 */
export interface IItemLinkPermissionDeleteChange {
  permissionId: string;
}

/**
 * 为 specific link 新增 recipients 的 change。
 */
export interface IItemLinkPermissionGrantRecipientsChange {
  permissionId: string;
  shareId: string;
  type: ItemLinkPermissionType;
  recipients: IItemUserPermissionRecipientForUI[];
}

/**
 * 为 specific link 移除 recipients 的 change。
 */
export interface IItemLinkPermissionRevokeRecipientsChange {
  permissionId: string;
  shareId: string;
  recipients: IItemUserPermissionRecipientForUI[];
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
