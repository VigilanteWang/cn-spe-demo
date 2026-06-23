import { useMemo } from "react";
import { getItemLinkPermissionRoleLabel } from "../../../../common/helper/itemLinkPermissionCommonHelper";
import {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_SCOPE_VALUES,
  ITEM_LINK_PERMISSION_TYPES,
  type IItemLinkPermissionEntryForUI,
} from "../models/itemLinkPermissionModels";
import type {
  IItemLinkPermissionComputedEntry,
  IItemLinkPermissionDraftState,
  IItemLinkPermissionDisplayRecipient,
} from "../models/itemLinkPermissionModels";
import {
  getItemLinkPermissionRecipientKey,
  mapGraphIdentityToItemLinkRecipientCandidate,
} from "../services/itemLinkPermissionUiUtils";

/**
 * 计算 links 面板真正需要渲染的 entries。
 *
 * 这层 Hook 不保存新状态，只负责把：
 * - 后端原始基线 `originalEntries`
 * - 本地草稿差异 `draft`
 * 合成为界面此刻应显示的最终行列表。
 *
 * @param originalEntries 后端当前确认过的 link 权限基线。
 * @param draft links 面板本地记录的 create/delete/grant/revoke 差异。
 * @returns 可直接渲染的 computed entries，以及是否存在阻塞提交的校验错误。
 */
export const useItemLinkPermissionComputedEntries = (
  originalEntries: IItemLinkPermissionEntryForUI[],
  draft: IItemLinkPermissionDraftState,
) => {
  return useMemo(() => {
    // 被标记删除的 persisted link 不再参与当前界面渲染。
    const deletedPermissionIds = new Set(draft.deletedPermissionIds);
    // persistedEntries 表示“后端本来就存在、且本轮没有被整体删除”的行，
    // 这些行还需要继续叠加 grant/revoke 差异，才能得到最终显示结果。
    const persistedEntries = originalEntries
      .filter((entry) => !deletedPermissionIds.has(entry.permissionId))
      .map<IItemLinkPermissionComputedEntry>((entry) => {
        // 先把后端原始 identity 映射成前端统一 recipient 结构，
        // 方便后面继续和本地 grant/revoke 差异做集合运算。
        const persistedRecipients = entry.grantedToIdentities.map(
          (identity) => {
            const candidate =
              mapGraphIdentityToItemLinkRecipientCandidate(identity);

            return {
              key: getItemLinkPermissionRecipientKey({
                objectId: candidate.objectId,
                userPrincipalName: candidate.userPrincipalName,
                mail: candidate.mail,
                name: candidate.name,
              }),
              candidate,
              source: "persisted",
            } satisfies IItemLinkPermissionDisplayRecipient;
          },
        );
        // revoke 差异表示“当前界面上应该暂时隐藏这些原有 recipient”。
        const revokedRecipientKeys = new Set(
          (draft.revokesByPermissionId[entry.permissionId] ?? []).map(
            (candidate) =>
              getItemLinkPermissionRecipientKey({
                objectId: candidate.objectId,
                userPrincipalName: candidate.userPrincipalName,
                mail: candidate.mail,
                name: candidate.name,
              }),
          ),
        );
        // grant 差异表示“当前界面上应该额外展示这些尚未提交的新 recipient”。
        const grantedRecipients = (
          draft.grantsByPermissionId[entry.permissionId] ?? []
        )
          .map<IItemLinkPermissionDisplayRecipient>((candidate) => ({
            key: getItemLinkPermissionRecipientKey({
              objectId: candidate.objectId,
              userPrincipalName: candidate.userPrincipalName,
              mail: candidate.mail,
              name: candidate.name,
            }),
            candidate,
            source: "draft",
          }))
          .filter(
            (recipient) =>
              !persistedRecipients.some(
                (persistedRecipient) =>
                  persistedRecipient.key === recipient.key,
              ),
          );
        // 原有 recipient 在本轮草稿里若被 revoke，则从当前显示结果中去掉。
        const visiblePersistedRecipients = persistedRecipients.filter(
          (recipient) => !revokedRecipientKeys.has(recipient.key),
        );
        // specific link 才需要把 recipients 细项展示出来；
        // 其他 scope 的 link 只显示摘要数量。
        const recipients =
          entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific
            ? [...visiblePersistedRecipients, ...grantedRecipients]
            : [];

        return {
          id: entry.id,
          source: "persisted",
          permissionId: entry.permissionId,
          shareId: entry.shareId,
          webUrl: entry.webUrl,
          scope: entry.scope,
          type: entry.type,
          roleLabel: entry.roleLabel,
          preventsDownload: entry.preventsDownload,
          grantedToCount:
            entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific
              ? recipients.length
              : entry.grantedToCount,
          recipients,
          hasValidationError: false,
        };
      });

    // createdEntries 表示“仅存在于本地草稿、尚未提交到后端”的新建 link 行。
    // 这部分数据完全来自 draft.createdLinks，不依赖 originalEntries。
    const createdEntries =
      draft.createdLinks.map<IItemLinkPermissionComputedEntry>((entry) => ({
        id: entry.id,
        source: "draft",
        scope: entry.scope,
        type: entry.type,
        // 新建行没有后端回传的 roleLabel，需要在前端按 type 现算展示文案。
        roleLabel: getItemLinkPermissionRoleLabel(entry.type),
        // blocksDownload 本身就代表“阻止下载”的链接语义，因此这里直接映射成 true。
        preventsDownload: entry.type === "blocksDownload",
        grantedToCount:
          entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific
            ? entry.recipients.length
            : 0,
        recipients:
          entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific
            ? entry.recipients.map<IItemLinkPermissionDisplayRecipient>(
                (candidate) => ({
                  // 新建 specific link 的 recipient 也统一转成可渲染结构，
                  // 这样上层行组件无需区分它来自 persisted 还是 created draft。
                  key: getItemLinkPermissionRecipientKey({
                    objectId: candidate.objectId,
                    userPrincipalName: candidate.userPrincipalName,
                    mail: candidate.mail,
                    name: candidate.name,
                  }),
                  candidate,
                  source: "draft",
                }),
              )
            : [],
        // 新建 specific link 如果没有任何 recipient，当前就应阻止 Apply。
        hasValidationError:
          entry.scope === ITEM_LINK_PERMISSION_SCOPES.specific &&
          entry.recipients.length === 0,
      }));

    // 最终显示顺序由 scope、type、source 统一决定，
    // 保证 persisted 与 draft 混排时界面仍稳定可预测。
    const sortedEntries = [...persistedEntries, ...createdEntries].sort(
      (left, right) => {
        // 先按 scope 排，保证 anonymous / organization / specific 的大区块顺序稳定。
        const scopeRankDiff =
          getScopeSortRank(left.scope) - getScopeSortRank(right.scope);

        if (scopeRankDiff !== 0) {
          return scopeRankDiff;
        }

        // 同一 scope 内再按 type 排，保持 view / edit / review / blocksDownload 顺序一致。
        const typeRankDiff =
          getTypeSortRank(left.type) - getTypeSortRank(right.type);

        if (typeRankDiff !== 0) {
          return typeRankDiff;
        }

        // scope 和 type 都相同时，优先展示 persisted 行，
        // 让真实存在的后端 link 排在本地草稿前面。
        if (left.source === right.source) {
          return 0;
        }

        return left.source === "persisted" ? -1 : 1;
      },
    );

    return {
      // entries 是 links 面板真正渲染的最终列表。
      entries: sortedEntries,
      // 只要任意一行存在阻塞性校验错误，Apply 就应该被禁用。
      hasBlockingValidationError: sortedEntries.some(
        (entry) => entry.hasValidationError,
      ),
    };
  }, [draft, originalEntries]);
};

/**
 * 读取 scope 的排序优先级。
 *
 * 这里复用合同层常量数组里的既定顺序，确保创建区和展示区的 scope 排序一致。
 *
 * @param scope 当前 link 的 scope。
 * @returns 该 scope 在统一顺序中的位置索引。
 */
const getScopeSortRank = (scope: IItemLinkPermissionEntryForUI["scope"]) =>
  ITEM_LINK_PERMISSION_SCOPE_VALUES.indexOf(scope);

/**
 * 读取 type 的排序优先级。
 *
 * 这里复用合同层常量数组里的既定顺序，确保 links 列表在不同场景下都保持一致。
 *
 * @param type 当前 link 的 type。
 * @returns 该 type 在统一顺序中的位置索引。
 */
const getTypeSortRank = (type: IItemLinkPermissionEntryForUI["type"]) =>
  ITEM_LINK_PERMISSION_TYPES.indexOf(type);
