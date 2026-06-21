import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionEntryForUI,
  IItemUserPermissionRecipientForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type { IGraphPermissionIdentity } from "../../../../common/contracts/permissionCommonContracts";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import type {
  IItemLinkPermissionCreatedLinkDraft,
  IItemLinkPermissionDraftState,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import { getInitials } from "./permissionPrincipalCandidateMapper";

const ITEM_LINK_PERMISSION_SCOPE_LABELS: Record<
  ItemLinkPermissionScope,
  string
> = {
  anonymous: "Anyone with the link",
  organization: "People in Organization",
  specific: "Specific people",
};

/**
 * 把 link scope 转成 UI 文案。
 */
export const getItemLinkPermissionScopeLabel = (
  scope: ItemLinkPermissionScope,
): string => ITEM_LINK_PERMISSION_SCOPE_LABELS[scope];

/**
 * 生成 recipient 的稳定去重键。
 *
 * 优先级与后端 link permission adapter 保持一致，
 * 这样前端本地草稿和后端读取出来的主体更容易对齐。
 */
export const getItemLinkPermissionRecipientKey = (input: {
  objectId?: string;
  userPrincipalName?: string;
  mail?: string;
  name: string;
}): string =>
  input.objectId ??
  input.userPrincipalName?.trim().toLowerCase() ??
  input.mail?.trim().toLowerCase() ??
  input.name.trim().toLowerCase();

/**
 * 把后端返回的 granted identity 映射成前端 recipient 候选项。
 */
export const mapGraphIdentityToItemLinkRecipientCandidate = (
  identity: IGraphPermissionIdentity,
): IItemLinkPermissionRecipientCandidate => ({
  id: getItemLinkPermissionRecipientKey({
    objectId: identity.graphId,
    userPrincipalName: identity.userPrincipalName,
    mail: identity.mail,
    name: identity.displayName,
  }),
  objectId: identity.graphId,
  name: identity.displayName,
  type: identity.principalType,
  secondaryText: identity.description,
  initials: getInitials(identity.displayName),
  mail: identity.mail,
  userPrincipalName: identity.userPrincipalName,
});

/**
 * 把 people/groups 搜索候选项转换成 links 面板可复用的 recipient 候选项。
 */
export const mapPermissionCandidateToItemLinkRecipientCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IItemLinkPermissionRecipientCandidate => ({
  id: candidate.id,
  objectId: candidate.objectId,
  name: candidate.name,
  type: candidate.type,
  secondaryText: candidate.secondaryText,
  initials: candidate.initials,
  mail: candidate.mail,
  userPrincipalName: candidate.userPrincipalName,
});

/**
 * 构造 links 面板提交给后端的 change set。
 *
 * @param originalEntries 当前后端确认过的基线 link 列表。
 * @param draft 前端维护的 links 草稿。
 * @returns 可直接发给 `/links/apply` 的请求体。
 */
export const createItemLinkPermissionChangeSet = (
  originalEntries: IItemLinkPermissionEntryForUI[],
  draft: IItemLinkPermissionDraftState,
): IApplyItemLinkPermissionChangesRequest => {
  const entriesByPermissionId = new Map(
    originalEntries.map((entry) => [entry.permissionId, entry]),
  );

  return {
    create: draft.createdLinks.map((entry) => {
      const recipients = entry.recipients.map(
        mapItemLinkRecipientCandidateToRequest,
      );

      return {
        scope: entry.scope,
        type: entry.type,
        ...(entry.scope === "specific" ? { recipients } : {}),
      };
    }),
    deleteLinks: draft.deletedPermissionIds.map((permissionId) => ({
      permissionId,
    })),
    grantRecipients: Object.entries(draft.grantsByPermissionId).map(
      ([permissionId, recipients]) => {
        const originalEntry = entriesByPermissionId.get(permissionId);

        if (!originalEntry?.shareId) {
          throw new Error(
            `Cannot grant recipients for link ${permissionId}: missing shareId.`,
          );
        }

        return {
          permissionId,
          shareId: originalEntry.shareId,
          type: originalEntry.type,
          recipients: recipients.map(mapItemLinkRecipientToRequest),
        };
      },
    ),
    revokeRecipients: Object.entries(draft.revokesByPermissionId).map(
      ([permissionId, recipients]) => {
        const originalEntry = entriesByPermissionId.get(permissionId);

        if (!originalEntry?.shareId) {
          throw new Error(
            `Cannot revoke recipients for link ${permissionId}: missing shareId.`,
          );
        }

        return {
          permissionId,
          shareId: originalEntry.shareId,
          recipients: recipients.map(mapItemLinkRecipientToRequest),
        };
      },
    ),
  };
};

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

/**
 * 生成一条新的 link 草稿项。
 *
 * 这个工厂目前主要给 hooks/UI 使用，因此放在 links 的 UI utils 更合适。
 */
export const createItemLinkPermissionCreatedLinkDraft = (
  id: string,
  scope: ItemLinkPermissionScope,
  type: ItemLinkPermissionType,
): IItemLinkPermissionCreatedLinkDraft => ({
  id,
  scope,
  type,
  recipients: [],
});

const mapItemLinkRecipientToRequest = (
  candidate: IItemLinkPermissionRecipientCandidate,
) => mapItemLinkRecipientCandidateToRequest(candidate);
