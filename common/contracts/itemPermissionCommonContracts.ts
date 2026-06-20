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
 * link share 可支持的 scope。
 */
export const ITEM_LINK_PERMISSION_SCOPES = [
  "anonymous",
  "organization",
  "users",
] as const;

export type ItemLinkPermissionScope =
  (typeof ITEM_LINK_PERMISSION_SCOPES)[number];

/**
 * 判断输入值是否属于当前支持的 link scope。
 *
 * @param value 待判断的原始输入。
 * @returns 命中 scope 白名单时返回 true。
 */
export const isItemLinkPermissionScope = (
  value: unknown,
): value is ItemLinkPermissionScope =>
  typeof value === "string" &&
  (ITEM_LINK_PERMISSION_SCOPES as readonly string[]).includes(value);

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
 * 判断输入值是否属于当前支持的 link type。
 *
 * @param value 待判断的原始输入。
 * @returns 命中 type 白名单时返回 true。
 */
export const isItemLinkPermissionType = (
  value: unknown,
): value is ItemLinkPermissionType =>
  typeof value === "string" &&
  (ITEM_LINK_PERMISSION_TYPES as readonly string[]).includes(value);

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
 * 把 link type 转成前后端共用的只读权限标签。
 *
 * 这里放在共享合同层，避免前后端各自维护一份相同映射。
 *
 * @param type 当前 link permission 的类型。
 * @returns UI 展示使用的只读权限标签。
 */
export const getItemLinkPermissionRoleLabel = (
  type: ItemLinkPermissionType,
): ItemLinkPermissionRoleLabelForUI => ITEM_LINK_PERMISSION_ROLE_LABELS[type];

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
 * 为 users link 新增 recipients 的 change。
 */
export interface IItemLinkPermissionGrantRecipientsChange {
  permissionId: string;
  shareId: string;
  type: ItemLinkPermissionType;
  recipients: IItemUserPermissionRecipientForUI[];
}

/**
 * 为 users link 移除 recipients 的 change。
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
