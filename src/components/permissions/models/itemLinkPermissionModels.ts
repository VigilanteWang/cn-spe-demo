import type {
  IItemLinkPermissionEntryForUI,
  IItemUserPermissionRecipientForUI,
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

/**
 * 把 recipient 候选项还原成后端 `grant/revoke` 需要的最小合同。
 *
 * 优先级沿用现有 item permission 的 recipient 规则：
 * 优先 objectId，其次 email，最后 alias/UPN。
 *
 * @param candidate 前端当前持有的 recipient 候选项。
 * @returns 可直接提交给后端合同层的最小 recipient。
 */
export const mapItemLinkRecipientCandidateToRequest = (
  candidate: IItemLinkPermissionRecipientCandidate,
): IItemUserPermissionRecipientForUI => ({
  recipientObjectId: candidate.objectId,
  recipientEmail: candidate.mail,
  recipientAlias: candidate.userPrincipalName,
});

/**
 * 计算 links 面板是否存在本地未保存修改。
 *
 * @param draft 当前 links 草稿状态。
 * @returns 只要任一变更集合非空，就视为存在未保存修改。
 */
export const hasItemLinkPermissionDraftChanges = (
  draft: IItemLinkPermissionDraftState,
): boolean =>
  draft.createdLinks.length > 0 ||
  draft.deletedPermissionIds.length > 0 ||
  Object.keys(draft.grantsByPermissionId).length > 0 ||
  Object.keys(draft.revokesByPermissionId).length > 0;

/**
 * 生成 links 列表默认的空草稿状态。
 */
export const createEmptyItemLinkPermissionDraftState =
  (): IItemLinkPermissionDraftState => ({
    createdLinks: [],
    deletedPermissionIds: [],
    grantsByPermissionId: {},
    revokesByPermissionId: {},
  });

/**
 * 生成 links 面板默认的空后端快照。
 */
export const createEmptyItemLinkPermissionEntries =
  (): IItemLinkPermissionEntryForUI[] => [];
