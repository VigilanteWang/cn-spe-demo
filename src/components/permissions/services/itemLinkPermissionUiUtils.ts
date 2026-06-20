import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionEntryForUI,
  ItemLinkPermissionScope,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type { IGraphPermissionIdentity } from "../../../../common/contracts/permissionCommonContracts";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";
import type {
  IItemLinkPermissionDraftState,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import { mapItemLinkRecipientCandidateToRequest } from "../models/itemLinkPermissionModels";

/**
 * 把 link scope 转成 UI 文案。
 */
export const getItemLinkPermissionScopeLabel = (
  scope: ItemLinkPermissionScope,
): string => {
  if (scope === "anonymous") {
    return "Anyone";
  }

  if (scope === "organization") {
    return "People in Organization";
  }

  return "Specific";
};

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
    create: draft.createdLinks.map((entry) => ({
      scope: entry.scope,
      type: entry.type,
      recipients: entry.recipients.map(mapItemLinkRecipientCandidateToRequest),
    })),
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

const mapItemLinkRecipientToRequest = (
  candidate: IItemLinkPermissionRecipientCandidate,
) => mapItemLinkRecipientCandidateToRequest(candidate);

/**
 * 为 Avatar 生成最多两个首字母。
 */
const getInitials = (name: string): string => {
  const segments = name
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "?";
  }

  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }

  return `${segments[0][0]}${segments[1][0]}`.toUpperCase();
};
