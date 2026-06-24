import type {
  ItemLinkPermissionRoleLabelForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type { PermissionTabValue } from "./permissionSharedModels";

export {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_SCOPE_VALUES,
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
 * links 差异里新增或撤销 recipient 时复用的前端主体模型。
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
 * 一条尚未持久化到后端的新建 link 差异项。
 */
export interface IItemLinkPermissionCreatedLinkDiff {
  id: string;
  scope: ItemLinkPermissionScope;
  type: ItemLinkPermissionType;
  recipients: IItemLinkPermissionRecipientCandidate[];
}

/**
 * links 面板内部维护的全部本地差异状态。
 */
export interface IItemLinkPermissionDiffState {
  createdLinks: IItemLinkPermissionCreatedLinkDiff[];
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
  source: "persisted" | "diff";
}

/**
 * links 列表计算后的单行展示模型。
 *
 * 它不是后端原始合同，也不是本地 diff 自身，
 * 而是“原始基线 + 本地差异”合并后供界面直接渲染的结果。
 */
export interface IItemLinkPermissionComputedEntry {
  id: string;
  source: "persisted" | "diff";
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
