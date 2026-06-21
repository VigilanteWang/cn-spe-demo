import type {
  ItemLinkPermissionRoleLabelForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type { PermissionTabValue } from "./permissionSharedModels";

export {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_TYPES,
} from "../../../../common/contracts/itemPermissionCommonContracts";

export type {
  IItemLinkPermissionEntryForUI,
  ItemLinkPermissionRoleLabelForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../../common/contracts/itemPermissionCommonContracts";

/**
 * Item 权限弹窗顶层 tab 。
 */
export type ItemPermissionDialogTabValue = PermissionTabValue | "links";

/**
 * links 草稿里新增或撤销 recipient 时复用的前端主体模型。
 */
export interface IItemLinkPermissionRecipientCandidate {
  id: string;
  objectId?: string;
  name: string;
  type: PermissionTabValue;
  secondaryText: string;
  initials: string;
  mail?: string;
  userPrincipalName?: string;
}

/**
 * 一条尚未持久化到后端的新建 link 草稿。
 */
export interface IItemLinkPermissionCreatedLinkDraft {
  id: string;
  scope: ItemLinkPermissionScope;
  type: ItemLinkPermissionType;
  recipients: IItemLinkPermissionRecipientCandidate[];
}

/**
 * links 面板内部维护的全部本地草稿状态。
 */
export interface IItemLinkPermissionDraftState {
  createdLinks: IItemLinkPermissionCreatedLinkDraft[];
  deletedPermissionIds: string[];
  grantsByPermissionId: Record<string, IItemLinkPermissionRecipientCandidate[]>;
  revokesByPermissionId: Record<
    string,
    IItemLinkPermissionRecipientCandidate[]
  >;
}

/**
 * links 列表里单个 recipient 的渲染模型。
 */
export interface IItemLinkPermissionDisplayRecipient {
  key: string;
  candidate: IItemLinkPermissionRecipientCandidate;
  source: "persisted" | "draft";
}

/**
 * links 列表派生后的单行展示模型。
 */
export interface IItemLinkPermissionDerivedEntry {
  id: string;
  source: "persisted" | "draft";
  permissionId?: string;
  shareId?: string;
  webUrl?: string;
  scope: ItemLinkPermissionScope;
  type: ItemLinkPermissionType;
  roleLabel: ItemLinkPermissionRoleLabelForUI;
  preventsDownload: boolean;
  grantedToCount: number;
  recipients: IItemLinkPermissionDisplayRecipient[];
  hasValidationError: boolean;
}
