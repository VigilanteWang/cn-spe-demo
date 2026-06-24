import type {
  IApplyItemLinkPermissionChangesRequest,
  IItemLinkPermissionEntryForUI,
  IItemUserPermissionRecipientForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../../common/contracts/itemPermissionCommonContracts";
import type { IGraphPermissionIdentity } from "../../../../common/contracts/permissionCommonContracts";
import type { IPermissionPrincipalSearchCandidate } from "../models/permissionSharedModels";
import type {
  IItemLinkPermissionCreatedLinkDiff,
  IItemLinkPermissionDiffState,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import { getInitials } from "./permissionPrincipalCandidateMapper";

import { ITEM_LINK_PERMISSION_SCOPES as ITEM_LINK_PERMISSION_SCOPE_KEYS } from "../../../../common/contracts/itemPermissionCommonContracts";

const ITEM_LINK_PERMISSION_SCOPE_LABELS: Record<
  ItemLinkPermissionScope,
  string
> = {
  [ITEM_LINK_PERMISSION_SCOPE_KEYS.anonymous]: "Anyone with the link",
  [ITEM_LINK_PERMISSION_SCOPE_KEYS.organization]: "People in Organization",
  [ITEM_LINK_PERMISSION_SCOPE_KEYS.specific]: "Specific people",
};

type ItemLinkPermissionRecipientKeyInput = Pick<
  IItemLinkPermissionRecipientCandidate,
  "objectId" | "userPrincipalName" | "mail" | "name"
>;

/**
 * 把 link scope 转成 UI 文案。
 *
 * @param scope 当前 link 的 scope 枚举值。
 * @returns 供界面直接展示的 scope 标签。
 */
export const getItemLinkPermissionScopeLabel = (
  scope: ItemLinkPermissionScope,
): string => ITEM_LINK_PERMISSION_SCOPE_LABELS[scope];

/**
 * 生成 recipient 的稳定去重键。
 *
 * 优先级与后端 link permission adapter 保持一致，
 * 这样前端本地差异和后端读取出来的主体更容易对齐。
 *
 * @param input 当前 recipient 可用的几种标识字段。
 * @returns 按优先级收口后的稳定 key。
 */
export const getItemLinkPermissionRecipientKey = (
  input: ItemLinkPermissionRecipientKeyInput,
): string =>
  input.objectId ??
  input.userPrincipalName?.trim().toLowerCase() ??
  input.mail?.trim().toLowerCase() ??
  input.name.trim().toLowerCase();

/**
 * 把后端返回的 granted identity 映射成前端 recipient 候选项。
 *
 * @param identity 后端已经标准化过的 Graph identity。
 * @returns links 面板内部可复用的 recipient 候选项。
 */
export const mapGraphIdentityToItemLinkRecipientCandidate = (
  identity: IGraphPermissionIdentity,
): IItemLinkPermissionRecipientCandidate => ({
  // 这里先把后端 identity 收口成稳定 key，方便前端后续去重和增删判断。
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
 *
 * @param candidate people/groups 选择器当前返回的主体候选项。
 * @returns links 面板统一使用的 recipient 结构。
 */
export const mapPermissionCandidateToItemLinkRecipientCandidate = (
  candidate: IPermissionPrincipalSearchCandidate,
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
 * @param diff 前端维护的 links 差异。
 * @returns 可直接发给 `/links/apply` 的请求体。
 */
export const createItemLinkPermissionChangeSet = (
  originalEntries: IItemLinkPermissionEntryForUI[],
  diff: IItemLinkPermissionDiffState,
): IApplyItemLinkPermissionChangesRequest => {
  // 先把后端基线列表转成按 permissionId 索引的 Map，
  // 这样后面组装 grant/revoke 时可以稳定补回 shareId、type 等后端必填字段。
  const entriesByPermissionId = new Map(
    originalEntries.map((entry) => [entry.permissionId, entry]),
  );

  return {
    // 把“本地新建的 links 差异”映射成 create change。
    // 只有 specific link 需要携带 recipients，其它 scope 交给后端按 scope 语义处理。
    create: diff.createdLinks.map((entry) => {
      const recipients = entry.recipients.map(
        mapItemLinkRecipientCandidateToRequest,
      );

      return {
        scope: entry.scope,
        type: entry.type,
        ...(entry.scope === ITEM_LINK_PERMISSION_SCOPE_KEYS.specific
          ? { recipients }
          : {}),
      };
    }),
    deleteLinks: diff.deletedPermissionIds.map((permissionId) => ({
      permissionId,
    })),
    // grantsByPermissionId 是一个“按 permissionId 分组”的对象字典，
    // 这里先转成 entries 数组，再逐条补齐 shareId/type 并映射 recipients。
    grantRecipients: Object.entries(diff.grantsByPermissionId).map(
      ([permissionId, recipients]) => {
        const originalEntry = entriesByPermissionId.get(permissionId);

        // specific link 的增人请求必须带 shareId；
        // 如果基线里缺这个字段，说明当前差异已经无法安全提交。
        if (!originalEntry?.shareId) {
          throw new Error(
            `Cannot grant recipients for link ${permissionId}: missing shareId.`,
          );
        }

        return {
          permissionId,
          shareId: originalEntry.shareId,
          type: originalEntry.type,
          recipients: recipients.map(mapItemLinkRecipientCandidateToRequest),
        };
      },
    ),
    // revoke 的组装方式和 grant 一致，只是后端合同不要求再携带 link type。
    revokeRecipients: Object.entries(diff.revokesByPermissionId).map(
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
          recipients: recipients.map(mapItemLinkRecipientCandidateToRequest),
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
 * @param diff 当前 links 差异状态。
 * @returns 只要任一变更集合非空，就视为存在未保存修改。
 */
export const hasItemLinkPermissionDiffChanges = (
  diff: IItemLinkPermissionDiffState,
): boolean =>
  diff.createdLinks.length > 0 ||
  diff.deletedPermissionIds.length > 0 ||
  Object.keys(diff.grantsByPermissionId).length > 0 ||
  Object.keys(diff.revokesByPermissionId).length > 0;

/**
 * 生成 links 列表默认的空差异状态。
 *
 * @returns 所有变更集合都为空的初始差异。
 */
export const createEmptyItemLinkPermissionDiffState =
  (): IItemLinkPermissionDiffState => ({
    createdLinks: [],
    deletedPermissionIds: [],
    grantsByPermissionId: {},
    revokesByPermissionId: {},
  });

/**
 * 生成 links 面板默认的空后端快照。
 *
 * @returns 供加载前或重置时使用的空 entries。
 */
export const createEmptyItemLinkPermissionEntries =
  (): IItemLinkPermissionEntryForUI[] => [];

/**
 * 生成一条新的 link 差异项。
 *
 * 这个工厂目前主要给 hooks/UI 使用，因此放在 links 的 UI utils 更合适。
 *
 * @param id 前端本地生成的差异 id。
 * @param scope 新 link 的 scope。
 * @param type 新 link 的 type。
 * @returns 一条带空 recipients 列表的初始 link 差异项。
 */
export const createItemLinkPermissionCreatedLinkDiff = (
  id: string,
  scope: ItemLinkPermissionScope,
  type: ItemLinkPermissionType,
): IItemLinkPermissionCreatedLinkDiff => ({
  id,
  scope,
  type,
  recipients: [],
});
